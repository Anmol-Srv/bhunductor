const { v4: uuidv4 } = require('uuid');
const { getDatabase } = require('../data/database');
const Worktree = require('../data/models/Worktree');
const Folder = require('../data/models/Folder');
const SDKSession = require('../claude/SDKSession');
const { IPC_CHANNELS, HIDDEN_TOOLS } = require('../../shared/constants');
const { wrapHandler } = require('../utils/ipc-handler');

const w = (fn) => wrapHandler('SessionService', fn);

class SessionService {
  constructor(mainWindow) {
    this.mainWindow = mainWindow;
    this.activeSessions = new Map();
    this.pendingPermissions = new Map();
    this.historyBuffer = new Map();
    this.hiddenToolUseIds = new Set();

    this.cleanupStaleSessions();
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

    ipcMain.handle(IPC_CHANNELS.CLAUDE_SEND_MESSAGE, w(async (event, sessionId, message, model) => {
      this.sendMessage(sessionId, message, model || undefined);
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
    const sessionName = 'New Session';

    const folder = Folder.findById(folderId);
    if (!folder) throw new Error(`Folder ${folderId} not found`);

    const worktree = Worktree.findById(worktreeId);
    if (!worktree) throw new Error(`Worktree ${worktreeId} not found`);

    const workingDir = Worktree.getActivePath(worktree, folder);

    const session = this._createSDKSession(sessionId, workingDir, {});
    this.activeSessions.set(sessionId, session);

    db.prepare(`
      INSERT INTO claude_sessions (id, folder_id, worktree_id, status, name, claude_session_id, source, last_active_at)
      VALUES (?, ?, ?, 'active', ?, ?, 'app', CURRENT_TIMESTAMP)
    `).run(sessionId, folderId, worktreeId, sessionName, sessionId);

    const archivedSessionIds = this._autoArchiveOldSessions(folderId, worktreeId, sessionId);

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

    db.prepare(`
      UPDATE claude_sessions SET status = 'active', archived = 0, last_active_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(existingSessionId);

    let previousMessages = [];
    if (row.messages) {
      try { previousMessages = JSON.parse(row.messages); } catch {}
    }

    if (previousMessages.length > 0) {
      this.historyBuffer.set(existingSessionId, previousMessages);
    }

    const session = this._createSDKSession(existingSessionId, workingDir, {
      claudeSessionId: row.claude_session_id
    });
    this.activeSessions.set(existingSessionId, session);

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

  _sdkPermissionHandler(sessionId, toolName, input, signal, extra = {}) {
    return new Promise((resolve) => {
      const requestId = uuidv4();
      const { suggestions, decisionReason, toolUseID } = extra;

      const onAbort = () => {
        this.pendingPermissions.delete(requestId);
        resolve({ behavior: 'deny', message: 'Session aborted' });
      };
      if (signal) {
        signal.addEventListener('abort', onAbort, { once: true });
      }

      this.pendingPermissions.set(requestId, {
        resolve: (result) => {
          if (signal) signal.removeEventListener('abort', onAbort);
          this.pendingPermissions.delete(requestId);
          resolve(result);
        },
        input,
        sessionId,
        toolName,
        suggestions,
        createdAt: Date.now()
      });

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
    const session = this.activeSessions.get(sessionId);
    if (session) {
      session.claudeSessionId = claudeSessionId;
    }
  }

  handleSessionRename(sessionId, title) {
    if (!sessionId || !title) {
      throw new Error('Session ID and title are required');
    }
    this.renameSession(sessionId, title);
  }

  // ─── Session Operations ──────────────────────────────────────────

  sendMessage(sessionId, message, model) {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }
    session.runQuery(message, model || undefined).catch((err) => {
      console.error('[SessionService] SDK query error:', err.message);
    });
  }

  respondToPermission(requestId, action, message) {
    const pending = this.pendingPermissions.get(requestId);
    if (!pending) {
      console.warn(`[SessionService] Permission request ${requestId} already resolved (likely timed out)`);
      return;
    }

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
        pending.resolve({ behavior: 'deny', message: 'User denied permission' });
        break;
      case 'deny_with_message':
        pending.resolve({ behavior: 'deny', message: message || 'User denied permission' });
        break;
      default:
        pending.resolve({ behavior: 'deny', message: 'User denied permission' });
    }
  }

  stopSession(sessionId) {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      this._clearPendingPermissions(sessionId);
      session.stop();
      this.activeSessions.delete(sessionId);
      this.historyBuffer.delete(sessionId);
      const db = getDatabase();
      db.prepare("UPDATE claude_sessions SET status = 'stopped', last_active_at = CURRENT_TIMESTAMP WHERE id = ?").run(sessionId);
      this.send('claude:session-exited', { sessionId, code: 0 });
    }
  }

  _clearPendingPermissions(sessionId) {
    for (const [requestId, pending] of this.pendingPermissions) {
      if (pending.sessionId === sessionId) {
        if (pending.resolve) {
          pending.resolve({ behavior: 'deny', message: 'Session stopped' });
        }
        this.pendingPermissions.delete(requestId);
      }
    }
    this.send('claude:permission-dismissed', { sessionId, reason: 'session_stopped', clearAll: true });
  }

  handleRendererReady() {
    for (const [requestId, pending] of this.pendingPermissions) {
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
    return this.historyBuffer.get(sessionId) || null;
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
  }
}

module.exports = SessionService;
