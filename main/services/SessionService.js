const { v4: uuidv4 } = require('uuid');
const { getDatabase } = require('../data/database');
const Worktree = require('../data/models/Worktree');
const Folder = require('../data/models/Folder');
const ClaudeProcess = require('../claude/ClaudeProcess');
const SDKSession = require('../claude/SDKSession');
const PermissionHttpServer = require('../mcp/PermissionHttpServer');
const { IPC_CHANNELS, PERMISSION_TIMEOUT_MS, HIDDEN_TOOLS } = require('../../shared/constants');
const { wrapHandler } = require('../utils/ipc-handler');

const w = (fn) => wrapHandler('SessionService', fn);

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
    ipcMain.handle(IPC_CHANNELS.CLAUDE_SESSION_START, w(async (event, folderId, worktreeId, claudeSessionId) => {
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
    }));

    ipcMain.handle(IPC_CHANNELS.CLAUDE_SESSION_GET_HISTORY, w(async (event, sessionId) => {
      const messages = this.getSessionHistory(sessionId);
      return { success: true, messages };
    }));

    ipcMain.handle(IPC_CHANNELS.CLAUDE_SESSION_SAVE_MESSAGES, w(async (event, sessionId, messages) => {
      this.saveSessionMessages(sessionId, messages);
      return { success: true };
    }));

    ipcMain.handle(IPC_CHANNELS.CLAUDE_SESSION_STOP, w(async (event, sessionId) => {
      this.stopSession(sessionId);
      return { success: true };
    }));

    ipcMain.handle(IPC_CHANNELS.CLAUDE_SESSION_DELETE, w(async (event, sessionId) => {
      this.deleteSession(sessionId);
      return { success: true };
    }));

    ipcMain.handle(IPC_CHANNELS.CLAUDE_SESSION_LIST, w(async (event, folderId, worktreeId) => {
      const sessions = this.listSessions(folderId, worktreeId);
      return { success: true, sessions };
    }));

    ipcMain.handle(IPC_CHANNELS.CLAUDE_SEND_MESSAGE, w(async (event, sessionId, message) => {
      this.sendMessage(sessionId, message);
      return { success: true };
    }));

    ipcMain.handle(IPC_CHANNELS.CLAUDE_PERMISSION_RESPOND, w(async (event, requestId, action, message) => {
      this.respondToPermission(requestId, action, message);
      return { success: true };
    }));

    ipcMain.handle(IPC_CHANNELS.CLAUDE_SESSION_GET_LAST, w(async (event, folderId, worktreeId) => {
      const session = this.getLastSessionWithMessages(folderId, worktreeId);
      if (session) {
        let parsedMessages = [];
        if (session.messages) {
          try { parsedMessages = JSON.parse(session.messages); } catch {}
        }
        return { success: true, session: { ...session, sessionId: session.id, parsedMessages } };
      }
      return { success: true, session: null };
    }));

    ipcMain.handle(IPC_CHANNELS.CLAUDE_SESSION_LAZY_RESUME, w(async (event, folderId, worktreeId, claudeSessionId, message) => {
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
    }));

    ipcMain.handle(IPC_CHANNELS.CLAUDE_SESSION_ARCHIVE, w(async (event, sessionId) => {
      this.archiveSession(sessionId);
      return { success: true };
    }));

    ipcMain.handle(IPC_CHANNELS.CLAUDE_SESSION_UNARCHIVE, w(async (event, sessionId) => {
      this.unarchiveSession(sessionId);
      return { success: true };
    }));

    ipcMain.handle(IPC_CHANNELS.CLAUDE_SESSION_CHECK_ALIVE, async (event, sessionId) => {
      const alive = this.activeSessions.has(sessionId);
      return { alive };
    });

    ipcMain.handle(IPC_CHANNELS.CLAUDE_RENDERER_READY, w(async () => {
      this.handleRendererReady();
      return { success: true };
    }));

    ipcMain.handle(IPC_CHANNELS.CLAUDE_SESSION_GET_ACTIVE, w(async () => {
      return { success: true, sessions: this.getActiveSessionList() };
    }));

    ipcMain.handle(IPC_CHANNELS.CLAUDE_SESSION_LIST_ARCHIVED, w(async (event, folderId, worktreeId) => {
      const sessions = this.listArchivedSessions(folderId, worktreeId);
      return { success: true, sessions };
    }));

    ipcMain.handle(IPC_CHANNELS.CLAUDE_SESSION_RENAME, w(async (event, sessionId, title) => {
      this.renameSession(sessionId, title);
      return { success: true };
    }));
  }

  // ─── Cleanup ─────────────────────────────────────────────────────

  cleanupStaleSessions() {
    const db = getDatabase();
    db.prepare("UPDATE claude_sessions SET status = 'stopped' WHERE status = 'active'").run();
    this.pendingPermissions.clear();
  }

  // ─── Auto-archive Helper ─────────────────────────────────────────

  _autoArchiveOldSessions(folderId, worktreeId, excludeSessionId) {
    const db = getDatabase();
    const rows = db.prepare(`
      SELECT id FROM claude_sessions
      WHERE folder_id = ? AND worktree_id = ?
        AND id != ?
        AND status IN ('stopped', 'exited')
        AND (archived = 0 OR archived IS NULL)
    `).all(folderId, worktreeId, excludeSessionId);
    if (rows.length > 0) {
      db.prepare(`
        UPDATE claude_sessions SET archived = 1
        WHERE folder_id = ? AND worktree_id = ?
          AND id != ?
          AND status IN ('stopped', 'exited')
          AND (archived = 0 OR archived IS NULL)
      `).run(folderId, worktreeId, excludeSessionId);
    }
    return rows.map(r => r.id);
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

    archivedSessionIds = this._autoArchiveOldSessions(folderId, worktreeId, sessionId);

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

    const archivedSessionIds = this._autoArchiveOldSessions(folderId, worktreeId, existingSessionId);

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
    const isHiddenTool = (toolName) => {
      return HIDDEN_TOOLS.some(t => toolName === t || toolName.includes(t));
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
      permissionHandler: (sid, toolName, input, signal, extra) => {
        return this._sdkPermissionHandler(sid, toolName, input, signal, extra);
      }
    });
  }

  /**
   * Permission handler for SDK canUseTool callback.
   * Returns a Promise that resolves when the user responds via IPC.
   */
  _sdkPermissionHandler(sessionId, toolName, input, signal, extra = {}) {
    return new Promise((resolve, reject) => {
      const requestId = uuidv4();
      const { suggestions, decisionReason, blockedPath, toolUseID } = extra;

      const timeoutId = setTimeout(() => {
        this.pendingPermissions.delete(requestId);
        resolve({ behavior: 'deny', message: 'Permission request timed out' });
      }, PERMISSION_TIMEOUT_MS);

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
        toolName,
        suggestions, // PermissionUpdate[] for "always allow"
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
            tool_use_id: toolUseID || requestId,
            hasSuggestions: !!(suggestions && suggestions.length > 0),
            decisionReason: decisionReason || null
          });
        }
      } catch {}
    });
  }

  // ─── Legacy CLI Process Factory ──────────────────────────────────

  _spawnProcess(sessionId, workingDir, hasPreloadedMessages, options) {
    const isHiddenTool = (toolName) => {
      return HIDDEN_TOOLS.some(t => toolName === t || toolName.includes(t));
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
    const toolName = permissionData.tool || permissionData.tool_name || '';
    if (HIDDEN_TOOLS.some(t => toolName.includes(t) || toolName === t)) {
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

  respondToPermission(requestId, action, message) {
    const pending = this.pendingPermissions.get(requestId);
    if (!pending) {
      throw new Error(`Permission request ${requestId} not found`);
    }

    if (pending.isSDK) {
      // SDK path: resolve the Promise from canUseTool callback
      // action is a string: 'allow', 'allow_always', 'deny', 'deny_with_message'
      // For backward compat, also accept boolean true/false
      const normalizedAction = action === true ? 'allow' : action === false ? 'deny' : action;

      switch (normalizedAction) {
        case 'allow':
          pending.resolve({ behavior: 'allow', updatedInput: pending.input || {} });
          break;
        case 'allow_always':
          pending.resolve({
            behavior: 'allow',
            updatedInput: pending.input || {},
            updatedPermissions: pending.suggestions || []
          });
          break;
        case 'deny':
          pending.resolve({
            behavior: 'deny',
            message: 'User denied permission'
          });
          break;
        case 'deny_with_message':
          pending.resolve({
            behavior: 'deny',
            message: message || 'User denied permission'
          });
          break;
        default:
          pending.resolve({ behavior: 'deny', message: 'User denied permission' });
      }
    } else {
      // Legacy: forward to HTTP permission server
      const approved = action === 'allow' || action === 'allow_always' || action === true;
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

  /**
   * Called when the renderer (re)connects. Re-sends all pending permission requests.
   */
  handleRendererReady() {
    for (const [requestId, pending] of this.pendingPermissions) {
      if (!pending.isSDK) continue;
      try {
        if (!this.mainWindow.isDestroyed()) {
          this.mainWindow.webContents.send('claude:permission-request', {
            requestId,
            tool: pending.toolName || 'Unknown',
            input: pending.input,
            session_id: pending.sessionId,
            tool_use_id: requestId,
            hasSuggestions: !!(pending.suggestions && pending.suggestions.length > 0),
            decisionReason: null
          });
        }
      } catch {}
    }
  }

  /**
   * Returns list of active sessions with their running state.
   */
  getActiveSessionList() {
    const sessions = [];
    for (const [sessionId, session] of this.activeSessions) {
      sessions.push({
        sessionId,
        isRunning: session.isRunning || false
      });
    }
    return sessions;
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

  /**
   * Save messages for all active sessions that have buffered history.
   * Called on before-quit to persist any unsaved state.
   */
  saveAllActiveSessions() {
    const db = getDatabase();
    for (const [sessionId] of this.activeSessions) {
      const messages = this.historyBuffer.get(sessionId);
      if (messages && messages.length > 0) {
        try {
          db.prepare('UPDATE claude_sessions SET messages = ? WHERE id = ?')
            .run(JSON.stringify(messages), sessionId);
        } catch (err) {
          console.error(`[SessionService] Failed to save messages for ${sessionId}:`, err.message);
        }
      }
    }
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
