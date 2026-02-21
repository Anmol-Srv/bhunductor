const { v4: uuidv4 } = require('uuid');
const { getDatabase } = require('../data/database');
const Worktree = require('../data/models/Worktree');
const Folder = require('../data/models/Folder');
const ClaudeProcess = require('../claude/ClaudeProcess');
const SDKSession = require('../claude/SDKSession');
const PermissionHttpServer = require('../mcp/PermissionHttpServer');
const { IPC_CHANNELS } = require('../../shared/constants');

// Feature flag: set to true to use the Agent SDK instead of raw CLI subprocess
const USE_SDK = true;

class SessionService {
  constructor(mainWindow) {
    this.mainWindow = mainWindow;
    this.activeSessions = new Map();
    this.pendingPermissions = new Map();
    this.historyBuffer = new Map();
    this.hiddenToolUseIds = new Set();
    this.useSDK = USE_SDK;

    this.cleanupStaleSessions();

    if (!this.useSDK) {
      // Legacy: Start MCP permission HTTP server on OS-assigned port
      this.permissionServer = new PermissionHttpServer(0);
      this.permissionServer.onPermissionRequest = (requestId, permissionData) => {
        this.handleMcpPermissionRequest(requestId, permissionData);
      };
      this.permissionServer.onRenameSession = (sessionId, title) => {
        return this.handleSessionRename(sessionId, title);
      };
      this.permissionServer.start().then(() => {
        this.permissionPort = this.permissionServer.getPort();
      }).catch(() => {});
    }
  }

  registerHandlers(ipcMain) {
    ipcMain.handle(IPC_CHANNELS.CLAUDE_SESSION_START, async (event, folderId, worktreeId, claudeSessionId) => {
      try {
        let sessionData;
        if (claudeSessionId) {
          const db = getDatabase();
          const existingRow = db.prepare(`
            SELECT id FROM claude_sessions
            WHERE claude_session_id = ? AND status IN ('exited', 'stopped')
            ORDER BY COALESCE(last_active_at, created_at) DESC LIMIT 1
          `).get(claudeSessionId);
          if (existingRow) {
            sessionData = this.reactivateSession(existingRow.id, folderId, worktreeId);
          } else {
            sessionData = this.createSession(folderId, worktreeId);
          }
        } else {
          sessionData = this.createSession(folderId, worktreeId);
        }
        const { deletedSessionIds, reactivatedSessionId, ...session } = sessionData;
        return { success: true, session, deletedSessionIds, reactivatedSessionId };
      } catch (error) {
        console.error('[SessionService] Error starting session:', error);
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle(IPC_CHANNELS.CLAUDE_SESSION_GET_HISTORY, async (event, sessionId) => {
      try {
        const messages = this.getSessionHistory(sessionId);
        return { success: true, messages };
      } catch (error) {
        console.error('[SessionService] Error getting history:', error);
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle(IPC_CHANNELS.CLAUDE_SESSION_SAVE_MESSAGES, async (event, sessionId, messages) => {
      try {
        this.saveSessionMessages(sessionId, messages);
        return { success: true };
      } catch (error) {
        console.error('[SessionService] Error saving messages:', error);
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle(IPC_CHANNELS.CLAUDE_SESSION_STOP, async (event, sessionId) => {
      try {
        this.stopSession(sessionId);
        return { success: true };
      } catch (error) {
        console.error('[SessionService] Error stopping session:', error);
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle(IPC_CHANNELS.CLAUDE_SESSION_DELETE, async (event, sessionId) => {
      try {
        this.deleteSession(sessionId);
        return { success: true };
      } catch (error) {
        console.error('[SessionService] Error deleting session:', error);
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle(IPC_CHANNELS.CLAUDE_SESSION_LIST, async (event, folderId, worktreeId) => {
      try {
        const sessions = this.listSessions(folderId, worktreeId);
        return { success: true, sessions };
      } catch (error) {
        console.error('[SessionService] Error listing sessions:', error);
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle(IPC_CHANNELS.CLAUDE_SEND_MESSAGE, async (event, sessionId, message) => {
      try {
        this.sendMessage(sessionId, message);
        return { success: true };
      } catch (error) {
        console.error('[SessionService] Error sending message:', error);
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle(IPC_CHANNELS.CLAUDE_PERMISSION_RESPOND, async (event, requestId, approved, message) => {
      try {
        this.respondToPermission(requestId, approved, message);
        return { success: true };
      } catch (error) {
        console.error('[SessionService] Error responding to permission:', error);
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle(IPC_CHANNELS.CLAUDE_SESSION_GET_LAST, async (event, folderId, worktreeId) => {
      try {
        const session = this.getLastSessionWithMessages(folderId, worktreeId);
        if (session) {
          let parsedMessages = [];
          if (session.messages) {
            try { parsedMessages = JSON.parse(session.messages); } catch {}
          }
          return { success: true, session: { ...session, sessionId: session.id, parsedMessages } };
        }
        return { success: true, session: null };
      } catch (error) {
        console.error('[SessionService] Error getting last session:', error);
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle(IPC_CHANNELS.CLAUDE_SESSION_LAZY_RESUME, async (event, folderId, worktreeId, claudeSessionId, message) => {
      try {
        let sessionData;
        if (claudeSessionId) {
          const db = getDatabase();
          const existingRow = db.prepare(`
            SELECT id FROM claude_sessions
            WHERE claude_session_id = ? AND status IN ('exited', 'stopped')
            ORDER BY COALESCE(last_active_at, created_at) DESC LIMIT 1
          `).get(claudeSessionId);
          if (existingRow) {
            sessionData = this.reactivateSession(existingRow.id, folderId, worktreeId);
          } else {
            sessionData = this.createSession(folderId, worktreeId);
          }
        } else {
          sessionData = this.createSession(folderId, worktreeId);
        }
        const { deletedSessionIds, reactivatedSessionId, ...session } = sessionData;
        this.sendMessage(session.sessionId, message);
        return { success: true, session, archivedSessionIds: deletedSessionIds, reactivatedSessionId };
      } catch (error) {
        console.error('[SessionService] Error in lazy resume:', error);
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle(IPC_CHANNELS.CLAUDE_SESSION_ARCHIVE, async (event, sessionId) => {
      try {
        this.archiveSession(sessionId);
        return { success: true };
      } catch (error) {
        console.error('[SessionService] Error archiving session:', error);
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle(IPC_CHANNELS.CLAUDE_SESSION_UNARCHIVE, async (event, sessionId) => {
      try {
        this.unarchiveSession(sessionId);
        return { success: true };
      } catch (error) {
        console.error('[SessionService] Error unarchiving session:', error);
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle(IPC_CHANNELS.CLAUDE_SESSION_CHECK_ALIVE, async (event, sessionId) => {
      const alive = this.activeSessions.has(sessionId);
      return { alive };
    });

    ipcMain.handle(IPC_CHANNELS.CLAUDE_SESSION_LIST_ARCHIVED, async (event, folderId, worktreeId) => {
      try {
        const sessions = this.listArchivedSessions(folderId, worktreeId);
        return { success: true, sessions };
      } catch (error) {
        console.error('[SessionService] Error listing archived sessions:', error);
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle(IPC_CHANNELS.CLAUDE_SESSION_RENAME, async (event, sessionId, title) => {
      try {
        this.renameSession(sessionId, title);
        return { success: true };
      } catch (error) {
        console.error('[SessionService] Error renaming session:', error);
        return { success: false, error: error.message };
      }
    });
  }

  // ─── Cleanup ─────────────────────────────────────────────────────

  cleanupStaleSessions() {
    const db = getDatabase();
    db.prepare("UPDATE claude_sessions SET status = 'stopped' WHERE status = 'active'").run();
    this.pendingPermissions.clear();
  }

  // ─── Session Creation ────────────────────────────────────────────

  createSession(folderId, worktreeId) {
    const sessionId = uuidv4();
    const db = getDatabase();
    let archivedSessionIds = [];
    const sessionName = 'New Session';

    const folder = Folder.findById(folderId);
    if (!folder) throw new Error(`Folder ${folderId} not found`);

    const worktree = Worktree.findById(worktreeId);
    if (!worktree) throw new Error(`Worktree ${worktreeId} not found`);

    const workingDir = Worktree.getActivePath(worktree, folder);

    if (this.useSDK) {
      const session = this._createSDKSession(sessionId, workingDir, {});
      this.activeSessions.set(sessionId, session);
    } else {
      const options = {};
      if (this.permissionPort) {
        options.permissionPort = this.permissionPort;
      }
      const claudeProcess = this._spawnProcess(sessionId, workingDir, false, options);
      claudeProcess.start();
      this.activeSessions.set(sessionId, claudeProcess);
    }

    db.prepare(`
      INSERT INTO claude_sessions (id, folder_id, worktree_id, status, name, claude_session_id, source, last_active_at)
      VALUES (?, ?, ?, 'active', ?, ?, 'app', CURRENT_TIMESTAMP)
    `).run(sessionId, folderId, worktreeId, sessionName, sessionId);

    // Auto-archive older stopped/exited sessions on this worktree
    const autoArchivedRows = db.prepare(`
      SELECT id FROM claude_sessions
      WHERE folder_id = ? AND worktree_id = ?
        AND id != ?
        AND status IN ('stopped', 'exited')
        AND (archived = 0 OR archived IS NULL)
    `).all(folderId, worktreeId, sessionId);
    if (autoArchivedRows.length > 0) {
      db.prepare(`
        UPDATE claude_sessions SET archived = 1
        WHERE folder_id = ? AND worktree_id = ?
          AND id != ?
          AND status IN ('stopped', 'exited')
          AND (archived = 0 OR archived IS NULL)
      `).run(folderId, worktreeId, sessionId);
      archivedSessionIds = autoArchivedRows.map(r => r.id);
    }

    return {
      sessionId,
      id: sessionId,
      folder_id: folderId,
      worktree_id: worktreeId,
      status: 'active',
      name: sessionName,
      title: sessionName,
      claude_session_id: sessionId,
      workingDir,
      deletedSessionIds: archivedSessionIds
    };
  }

  reactivateSession(existingSessionId, folderId, worktreeId) {
    const db = getDatabase();

    const row = db.prepare(`
      SELECT id, folder_id, worktree_id, claude_session_id, messages, name, status
      FROM claude_sessions WHERE id = ?
    `).get(existingSessionId);
    if (!row) throw new Error(`Session ${existingSessionId} not found`);

    const folder = Folder.findById(folderId);
    if (!folder) throw new Error(`Folder ${folderId} not found`);

    const worktree = Worktree.findById(worktreeId);
    if (!worktree) throw new Error(`Worktree ${worktreeId} not found`);

    const workingDir = Worktree.getActivePath(worktree, folder);

    // Reactivate the existing DB row
    db.prepare(`
      UPDATE claude_sessions SET status = 'active', archived = 0, last_active_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(existingSessionId);

    // Parse previous messages for history seeding
    let previousMessages = [];
    if (row.messages) {
      try { previousMessages = JSON.parse(row.messages); } catch {}
    }

    const hasPreloadedMessages = previousMessages.length > 0;
    if (hasPreloadedMessages) {
      this.historyBuffer.set(existingSessionId, previousMessages);
    }

    if (this.useSDK) {
      // SDK: set claudeSessionId for resume via query() options
      const session = this._createSDKSession(existingSessionId, workingDir, {
        claudeSessionId: row.claude_session_id
      });
      this.activeSessions.set(existingSessionId, session);
    } else {
      const options = {};
      options.skipSessionId = true;
      if (this.permissionPort) {
        options.permissionPort = this.permissionPort;
      }
      const claudeProcess = this._spawnProcess(existingSessionId, workingDir, hasPreloadedMessages, options);
      claudeProcess.start();
      this.activeSessions.set(existingSessionId, claudeProcess);
    }

    // Auto-archive other stopped/exited sessions on this worktree
    let archivedSessionIds = [];
    const autoArchivedRows = db.prepare(`
      SELECT id FROM claude_sessions
      WHERE folder_id = ? AND worktree_id = ?
        AND id != ?
        AND status IN ('stopped', 'exited')
        AND (archived = 0 OR archived IS NULL)
    `).all(folderId, worktreeId, existingSessionId);
    if (autoArchivedRows.length > 0) {
      db.prepare(`
        UPDATE claude_sessions SET archived = 1
        WHERE folder_id = ? AND worktree_id = ?
          AND id != ?
          AND status IN ('stopped', 'exited')
          AND (archived = 0 OR archived IS NULL)
      `).run(folderId, worktreeId, existingSessionId);
      archivedSessionIds = autoArchivedRows.map(r => r.id);
    }

    const sessionName = row.name || 'New Session';

    return {
      sessionId: existingSessionId,
      id: existingSessionId,
      folder_id: folderId,
      worktree_id: worktreeId,
      status: 'active',
      name: sessionName,
      title: sessionName,
      claude_session_id: row.claude_session_id,
      workingDir,
      reactivatedSessionId: existingSessionId,
      deletedSessionIds: archivedSessionIds
    };
  }

  // ─── SDK Session Factory ─────────────────────────────────────────

  _createSDKSession(sessionId, workingDir, options) {
    const hiddenTools = [
      'rename_session',
      'mcp__bhunductor__rename_session'
    ];

    const isHiddenTool = (toolName) => {
      return hiddenTools.some(t => toolName === t || toolName.includes(t));
    };

    return new SDKSession(sessionId, workingDir, {
      onChunk: (data) => {
        this.send('claude:message-chunk', data);
      },
      onComplete: (data) => {
        this.send('claude:message-complete', data);
      },
      onError: (data) => {
        this.send('claude:session-error', data);
      },
      onExit: (code) => {
        this.handleSessionExit(sessionId, code);
      },
      onSystemInfo: ({ sessionId: sid, claudeSessionId: csid }) => {
        this.handleSystemInfo(sid, csid);
      },
      onToolUse: (data) => {
        if (data.toolName && isHiddenTool(data.toolName)) {
          if (data.toolUseId) {
            this.hiddenToolUseIds.add(data.toolUseId);
          }
          return;
        }
        this.send('claude:tool-use', data);
      },
      onToolResult: (data) => {
        if (data.toolUseId && this.hiddenToolUseIds.has(data.toolUseId)) {
          this.hiddenToolUseIds.delete(data.toolUseId);
          return;
        }
        this.send('claude:tool-result', data);
      },
      onThinking: (data) => {
        this.send('claude:thinking', data);
      },
      onTurnComplete: (data) => {
        this.send('claude:turn-complete', data);
        const turnDb = getDatabase();
        turnDb.prepare('UPDATE claude_sessions SET last_active_at = CURRENT_TIMESTAMP WHERE id = ?').run(sessionId);
      },
      onRename: (sid, title) => {
        this.renameSession(sid, title);
      }
    }, {
      ...options,
      permissionHandler: (sid, toolName, input, signal) => {
        return this._sdkPermissionHandler(sid, toolName, input, signal);
      }
    });
  }

  /**
   * Permission handler for SDK canUseTool callback.
   * Returns a Promise that resolves when the user responds via IPC.
   */
  _sdkPermissionHandler(sessionId, toolName, input, signal) {
    return new Promise((resolve, reject) => {
      const requestId = uuidv4();

      // Timeout after 5 minutes
      const timeoutId = setTimeout(() => {
        this.pendingPermissions.delete(requestId);
        resolve({ behavior: 'deny', message: 'Permission request timed out' });
      }, 300000);

      // Clean up if query is aborted
      const onAbort = () => {
        clearTimeout(timeoutId);
        this.pendingPermissions.delete(requestId);
        resolve({ behavior: 'deny', message: 'Session aborted' });
      };
      if (signal) {
        signal.addEventListener('abort', onAbort, { once: true });
      }

      this.pendingPermissions.set(requestId, {
        isSDK: true,
        resolve: (result) => {
          clearTimeout(timeoutId);
          if (signal) signal.removeEventListener('abort', onAbort);
          this.pendingPermissions.delete(requestId);
          resolve(result);
        },
        input, // Store original input for updatedInput in allow response
        sessionId,
        createdAt: Date.now()
      });

      // Send permission request to renderer (same IPC event shape)
      try {
        if (!this.mainWindow.isDestroyed()) {
          this.mainWindow.webContents.send('claude:permission-request', {
            requestId,
            tool: toolName,
            input: input,
            session_id: sessionId,
            tool_use_id: requestId
          });
        }
      } catch {}
    });
  }

  // ─── Legacy CLI Process Factory ──────────────────────────────────

  _spawnProcess(sessionId, workingDir, hasPreloadedMessages, options) {
    const hiddenTools = [
      'rename_session',
      'mcp__bhunductor-permissions__rename_session'
    ];

    const isHiddenTool = (toolName) => {
      return hiddenTools.some(t => toolName === t || toolName.includes(t));
    };

    return new ClaudeProcess(sessionId, workingDir, {
      onChunk: (data) => {
        this.send('claude:message-chunk', data);
      },
      onComplete: (data) => {
        this.send('claude:message-complete', data);
      },
      onError: (data) => {
        this.send('claude:session-error', data);
      },
      onExit: (code) => {
        this.handleSessionExit(sessionId, code);
      },
      onSystemInfo: ({ sessionId: sid, claudeSessionId: csid }) => {
        this.handleSystemInfo(sid, csid);
      },
      onHistory: (data) => {
        if (hasPreloadedMessages) return;
        this.historyBuffer.set(sessionId, data.messages || []);
        this.send('claude:conversation-history', data);
      },
      onToolUse: (data) => {
        if (data.toolName && isHiddenTool(data.toolName)) {
          if (data.toolUseId) {
            this.hiddenToolUseIds.add(data.toolUseId);
          }
          return;
        }
        this.send('claude:tool-use', data);
      },
      onToolResult: (data) => {
        if (data.toolUseId && this.hiddenToolUseIds.has(data.toolUseId)) {
          this.hiddenToolUseIds.delete(data.toolUseId);
          return;
        }
        this.send('claude:tool-result', data);
      },
      onThinking: (data) => {
        this.send('claude:thinking', data);
      },
      onTurnComplete: (data) => {
        this.send('claude:turn-complete', data);
        const turnDb = getDatabase();
        turnDb.prepare('UPDATE claude_sessions SET last_active_at = CURRENT_TIMESTAMP WHERE id = ?').run(sessionId);
      }
    }, options);
  }

  // ─── IPC Helpers ─────────────────────────────────────────────────

  send(channel, data) {
    try {
      if (!this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send(channel, data);
      }
    } catch {}
  }

  handleSystemInfo(sessionId, claudeSessionId) {
    const db = getDatabase();
    const row = db.prepare('SELECT claude_session_id FROM claude_sessions WHERE id = ?').get(sessionId);
    if (row?.claude_session_id !== claudeSessionId) {
      db.prepare('UPDATE claude_sessions SET claude_session_id = ? WHERE id = ?').run(claudeSessionId, sessionId);
    }
    // Update the SDK session's claudeSessionId for future resume
    const session = this.activeSessions.get(sessionId);
    if (session && this.useSDK) {
      session.claudeSessionId = claudeSessionId;
    }
  }

  // ─── Legacy MCP Permission Handling ──────────────────────────────

  handleMcpPermissionRequest(requestId, permissionData) {
    const autoApprovedTools = [
      'mcp__bhunductor-permissions__rename_session',
      'rename_session'
    ];

    const toolName = permissionData.tool || permissionData.tool_name || '';
    if (autoApprovedTools.some(t => toolName.includes(t) || toolName === t)) {
      setImmediate(() => {
        this.permissionServer.respondToPermission(requestId, true);
      });
      return;
    }

    try {
      if (!this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('claude:permission-request', {
          requestId,
          ...permissionData
        });
      }
    } catch {}

    this.pendingPermissions.set(requestId, {
      isMcp: true,
      toolUseId: permissionData.tool_use_id,
      sessionId: permissionData.session_id,
      input: permissionData.input,
      createdAt: Date.now()
    });
  }

  handleSessionRename(sessionId, title) {
    if (!sessionId || !title) {
      throw new Error('Session ID and title are required');
    }
    this.renameSession(sessionId, title);
  }

  // ─── Session Operations ──────────────────────────────────────────

  sendMessage(sessionId, message) {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    if (this.useSDK) {
      // SDK: fire-and-forget the query. Callbacks stream results back.
      session.runQuery(message).catch((err) => {
        console.error('[SessionService] SDK query error:', err.message);
      });
    } else {
      session.sendMessage(message);
    }
  }

  respondToPermission(requestId, approved, message) {
    const pending = this.pendingPermissions.get(requestId);
    if (!pending) {
      throw new Error(`Permission request ${requestId} not found`);
    }

    if (pending.isSDK) {
      // SDK path: resolve the Promise from canUseTool callback
      if (approved) {
        pending.resolve({ behavior: 'allow', updatedInput: pending.input || {} });
      } else {
        pending.resolve({
          behavior: 'deny',
          message: message || 'User denied permission'
        });
      }
    } else {
      // Legacy: forward to HTTP permission server
      this.permissionServer.respondToPermission(requestId, approved, message);
      this.pendingPermissions.delete(requestId);
    }
  }

  stopSession(sessionId) {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      session.stop();
      this.activeSessions.delete(sessionId);
      this.historyBuffer.delete(sessionId);
      const db = getDatabase();
      db.prepare("UPDATE claude_sessions SET status = 'stopped', last_active_at = CURRENT_TIMESTAMP WHERE id = ?").run(sessionId);

      if (this.useSDK) {
        // SDK sessions don't have a process exit event, so notify the renderer directly
        this.send('claude:session-exited', { sessionId, code: 0 });
      }
      // For legacy mode, the process exit handler will send session-exited
    }
  }

  handleSessionExit(sessionId, code) {
    this.activeSessions.delete(sessionId);
    this.historyBuffer.delete(sessionId);
    this.send('claude:session-exited', { sessionId, code });
    const db = getDatabase();
    db.prepare("UPDATE claude_sessions SET status = 'exited', last_active_at = CURRENT_TIMESTAMP WHERE id = ?").run(sessionId);
  }

  // ─── Session Data Operations ─────────────────────────────────────

  getSessionHistory(sessionId) {
    const messages = this.historyBuffer.get(sessionId) || null;
    return messages;
  }

  saveSessionMessages(sessionId, messages) {
    const db = getDatabase();
    db.prepare('UPDATE claude_sessions SET messages = ? WHERE id = ?').run(JSON.stringify(messages), sessionId);
  }

  setTitleIfEmpty(sessionId, messageText) {
    const db = getDatabase();
    const session = db.prepare('SELECT name FROM claude_sessions WHERE id = ?').get(sessionId);
    if (session?.name && session.name !== 'New Session') return;

    const title = messageText.replace(/\n/g, ' ').trim().substring(0, 80) || 'New Session';
    if (title === 'New Session') return;

    db.prepare('UPDATE claude_sessions SET name = ? WHERE id = ?').run(title, sessionId);
    this.send('claude:session-title-updated', { sessionId, title });
  }

  getLastSessionWithMessages(folderId, worktreeId) {
    const db = getDatabase();
    return db.prepare(`
      SELECT id, folder_id, worktree_id, status, name, claude_session_id, messages, last_active_at
      FROM claude_sessions
      WHERE folder_id = ? AND worktree_id = ?
        AND status IN ('stopped', 'exited')
        AND claude_session_id IS NOT NULL
        AND messages IS NOT NULL
        AND COALESCE(source, 'app') = 'app'
        AND (archived = 0 OR archived IS NULL)
      ORDER BY COALESCE(last_active_at, created_at) DESC
      LIMIT 1
    `).get(folderId, worktreeId);
  }

  archiveSession(sessionId) {
    const db = getDatabase();
    db.prepare('UPDATE claude_sessions SET archived = 1 WHERE id = ?').run(sessionId);
  }

  unarchiveSession(sessionId) {
    const db = getDatabase();
    db.prepare('UPDATE claude_sessions SET archived = 0 WHERE id = ?').run(sessionId);
  }

  listArchivedSessions(folderId, worktreeId) {
    const db = getDatabase();
    const sessions = db.prepare(`
      SELECT * FROM claude_sessions
      WHERE folder_id = ? AND worktree_id = ?
        AND archived = 1
        AND COALESCE(source, 'app') = 'app'
      ORDER BY COALESCE(last_active_at, created_at) DESC
    `).all(folderId, worktreeId);
    return sessions.map(s => ({ ...s, sessionId: s.id }));
  }

  renameSession(sessionId, title) {
    const db = getDatabase();
    const cleanTitle = title.replace(/\n/g, ' ').trim().substring(0, 80) || 'New Session';
    db.prepare('UPDATE claude_sessions SET name = ? WHERE id = ?').run(cleanTitle, sessionId);
    this.send('claude:session-title-updated', { sessionId, title: cleanTitle });
  }

  deleteSession(sessionId) {
    const db = getDatabase();
    const session = db.prepare('SELECT status FROM claude_sessions WHERE id = ?').get(sessionId);
    if (!session) return;
    if (session.status === 'active') {
      throw new Error('Cannot delete an active session. Stop it first.');
    }
    db.prepare('DELETE FROM claude_sessions WHERE id = ?').run(sessionId);
  }

  listSessions(folderId, worktreeId = null) {
    const db = getDatabase();
    let sessions;
    if (worktreeId) {
      sessions = db.prepare(`
        SELECT * FROM claude_sessions
        WHERE folder_id = ? AND worktree_id = ?
          AND COALESCE(source, 'app') = 'app'
          AND (archived = 0 OR archived IS NULL)
        ORDER BY COALESCE(last_active_at, created_at) DESC
      `).all(folderId, worktreeId);
    } else {
      sessions = db.prepare(`
        SELECT * FROM claude_sessions
        WHERE folder_id = ?
          AND COALESCE(source, 'app') = 'app'
          AND (archived = 0 OR archived IS NULL)
        ORDER BY COALESCE(last_active_at, created_at) DESC
      `).all(folderId);
    }
    return sessions.map(session => ({ ...session, sessionId: session.id }));
  }

  destroy() {
    for (const [, session] of this.activeSessions) {
      session.stop();
    }
    this.activeSessions.clear();
    if (this.permissionServer) {
      this.permissionServer.stop().catch(() => {});
    }
  }
}

module.exports = SessionService;
