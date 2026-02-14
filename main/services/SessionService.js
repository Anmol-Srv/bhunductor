const { v4: uuidv4 } = require('uuid');
const { getDatabase } = require('../data/database');
const Worktree = require('../data/models/Worktree');
const Folder = require('../data/models/Folder');
const ClaudeProcess = require('../claude/ClaudeProcess');
const PermissionHttpServer = require('../mcp/PermissionHttpServer');
const { IPC_CHANNELS } = require('../../shared/constants');

class SessionService {
  constructor(mainWindow) {
    this.mainWindow = mainWindow;
    this.activeSessions = new Map();
    this.pendingPermissions = new Map();
    this.historyBuffer = new Map();
    this.hiddenToolUseIds = new Set(); // Track tool_use_ids for hidden MCP tools

    this.cleanupStaleSessions();

    // Start MCP permission HTTP server on OS-assigned port
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

  registerHandlers(ipcMain) {
    ipcMain.handle(IPC_CHANNELS.CLAUDE_SESSION_START, async (event, folderId, worktreeId, claudeSessionId) => {
      try {
        let sessionData;
        if (claudeSessionId) {
          // Find existing row to reactivate
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

    ipcMain.handle(IPC_CHANNELS.CLAUDE_SESSION_GET_SYSTEM_INFO, async (event, sessionId) => {
      try {
        const db = getDatabase();
        const row = db.prepare(`
          SELECT model, model_version, api_version, claude_session_id
          FROM claude_sessions
          WHERE id = ?
        `).get(sessionId);

        if (!row) {
          return { success: false, error: 'Session not found' };
        }

        return {
          success: true,
          systemInfo: {
            model: row.model,
            modelVersion: row.model_version,
            apiVersion: row.api_version,
            claudeSessionId: row.claude_session_id
          }
        };
      } catch (error) {
        console.error('[SessionService] Error getting system info:', error);
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

    ipcMain.handle(IPC_CHANNELS.CLAUDE_PERMISSION_RESPOND, async (event, requestId, approved) => {
      try {
        this.respondToPermission(requestId, approved);
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

  cleanupStaleSessions() {
    const db = getDatabase();
    db.prepare("UPDATE claude_sessions SET status = 'stopped' WHERE status = 'active'").run();
    // Clear any stale pending permissions from previous app instance
    this.pendingPermissions.clear();
  }

  handleMcpPermissionRequest(requestId, permissionData) {
    // Auto-approve certain low-risk tools without showing permission prompt
    const autoApprovedTools = [
      'mcp__bhunductor-permissions__rename_session',
      'rename_session'
    ];

    const toolName = permissionData.tool || permissionData.tool_name || '';
    if (autoApprovedTools.some(t => toolName.includes(t) || toolName === t)) {
      // Immediately approve without showing UI prompt
      setImmediate(() => {
        this.permissionServer.respondToPermission(requestId, true);
      });
      return;
    }

    // For other tools, show permission prompt to user
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

    const options = {};

    // Pass the actual permission server port to the CLI process
    if (this.permissionPort) {
      options.permissionPort = this.permissionPort;
    }

    const claudeProcess = this._spawnProcess(sessionId, workingDir, false, options);

    claudeProcess.start();
    this.activeSessions.set(sessionId, claudeProcess);

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

    const options = {};
    // IMPORTANT: Don't use --resume for stopped/exited sessions
    // This prevents resuming stale pending permissions after app restart
    // Use --session-id instead to continue conversation without resuming pending state
    // if (row.claude_session_id) {
    //   options.resumeSessionId = row.claude_session_id;
    // }
    if (this.permissionPort) {
      options.permissionPort = this.permissionPort;
    }

    const claudeProcess = this._spawnProcess(existingSessionId, workingDir, hasPreloadedMessages, options);

    claudeProcess.start();
    this.activeSessions.set(existingSessionId, claudeProcess);

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

  _spawnProcess(sessionId, workingDir, hasPreloadedMessages, options) {
    // List of tools that should execute silently without showing in chat UI
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
      onSystemInfo: (systemInfo) => {
        this.handleSystemInfo(systemInfo.sessionId, systemInfo);
      },
      onHistory: (data) => {
        if (hasPreloadedMessages) return;
        this.historyBuffer.set(sessionId, data.messages || []);
        this.send('claude:conversation-history', data);
      },
      onToolUse: (data) => {
        // Filter out hidden MCP tools from chat display
        if (data.toolName && isHiddenTool(data.toolName)) {
          // Track this tool_use_id so we can filter its result too
          if (data.toolUseId) {
            this.hiddenToolUseIds.add(data.toolUseId);
          }
          return;
        }
        this.send('claude:tool-use', data);
      },
      onToolResult: (data) => {
        // Filter out results from hidden MCP tools
        if (data.toolUseId && this.hiddenToolUseIds.has(data.toolUseId)) {
          // Clean up the tracked ID
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

  send(channel, data) {
    try {
      if (!this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send(channel, data);
      }
    } catch {}
  }

  handleSystemInfo(sessionId, systemInfo) {
    console.log('[SessionService] handleSystemInfo called with:', { sessionId, systemInfo });
    const db = getDatabase();
    const { claudeSessionId, model, modelVersion, apiVersion, systemMetadata } = systemInfo;

    // Update session with system metadata
    const row = db.prepare('SELECT claude_session_id, model FROM claude_sessions WHERE id = ?').get(sessionId);
    console.log('[SessionService] Current DB row:', row);
    if (row?.claude_session_id !== claudeSessionId || !row?.model) {
      console.log('[SessionService] Updating database with system info');
      db.prepare(`
        UPDATE claude_sessions
        SET claude_session_id = ?, model = ?, model_version = ?, api_version = ?, system_metadata = ?
        WHERE id = ?
      `).run(claudeSessionId, model, modelVersion, apiVersion, JSON.stringify(systemMetadata), sessionId);
      console.log('[SessionService] Database updated');
    }

    // Send system info to renderer for display
    console.log('[SessionService] Sending claude:system-info event to renderer');
    this.send('claude:system-info', {
      sessionId,
      model,
      modelVersion,
      apiVersion,
      claudeSessionId
    });
  }

  getSessionHistory(sessionId) {
    const messages = this.historyBuffer.get(sessionId) || null;
    this.historyBuffer.delete(sessionId);
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

  sendMessage(sessionId, message) {
    const proc = this.activeSessions.get(sessionId);
    if (!proc) {
      throw new Error(`Session ${sessionId} not found`);
    }
    // Title is now set via MCP rename_session tool, not automatically
    // this.setTitleIfEmpty(sessionId, message);
    proc.sendMessage(message);
  }

  respondToPermission(requestId, approved) {
    const pending = this.pendingPermissions.get(requestId);
    if (!pending) {
      throw new Error(`Permission request ${requestId} not found`);
    }
    this.permissionServer.respondToPermission(requestId, approved);
    this.pendingPermissions.delete(requestId);
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

  stopSession(sessionId) {
    const proc = this.activeSessions.get(sessionId);
    if (proc) {
      proc.stop();
      this.activeSessions.delete(sessionId);
      const db = getDatabase();
      db.prepare("UPDATE claude_sessions SET status = 'stopped', last_active_at = CURRENT_TIMESTAMP WHERE id = ?").run(sessionId);
    }
  }

  handleSessionExit(sessionId, code) {
    this.activeSessions.delete(sessionId);
    this.historyBuffer.delete(sessionId);
    this.send('claude:session-exited', { sessionId, code });
    const db = getDatabase();
    db.prepare("UPDATE claude_sessions SET status = 'exited', last_active_at = CURRENT_TIMESTAMP WHERE id = ?").run(sessionId);
  }

  renameSession(sessionId, title) {
    const db = getDatabase();
    const cleanTitle = title.replace(/\n/g, ' ').trim().substring(0, 80) || 'New Session';
    db.prepare('UPDATE claude_sessions SET name = ? WHERE id = ?').run(cleanTitle, sessionId);
    this.send('claude:session-title-updated', { sessionId, title: cleanTitle });
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
    for (const [, proc] of this.activeSessions) {
      proc.stop();
    }
    this.activeSessions.clear();
    if (this.permissionServer) {
      this.permissionServer.stop().catch(() => {});
    }
  }
}

module.exports = SessionService;
