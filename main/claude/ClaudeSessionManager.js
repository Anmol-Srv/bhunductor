const { v4: uuidv4 } = require('uuid');
const { getDatabase } = require('../data/database');
const Worktree = require('../data/models/Worktree');
const Folder = require('../data/models/Folder');
const ClaudeProcess = require('./ClaudeProcess');
const PermissionHttpServer = require('../mcp/PermissionHttpServer');

class ClaudeSessionManager {
  constructor(mainWindow) {
    this.mainWindow = mainWindow;
    this.activeSessions = new Map(); // sessionId -> ClaudeProcess
    this.pendingPermissions = new Map(); // requestId -> { sessionId, resolve }
    this.historyBuffer = new Map(); // sessionId -> messages[]

    // Mark any leftover 'active' sessions from previous runs as stopped
    this.cleanupStaleSessions();

    // Start HTTP server for MCP permission requests
    this.permissionServer = new PermissionHttpServer(58472);
    this.permissionServer.onPermissionRequest = (requestId, permissionData) => {
      this.handleMcpPermissionRequest(requestId, permissionData);
    };

    this.permissionServer.start().catch(() => { });
  }

  cleanupStaleSessions() {
    const db = getDatabase();
    db.prepare("UPDATE claude_sessions SET status = 'stopped' WHERE status = 'active'").run();
  }

  /**
   * Handle permission request from MCP server
   */
  handleMcpPermissionRequest(requestId, permissionData) {
    console.log('[ClaudeSessionManager] claude requested tool permission:', permissionData);

    // const normalized = {
    //   tool: permissionData.tool_name || permissionData.toolName,
    //   input: permissionData.input ?? permissionData.tool_input ?? permissionData.toolInput,
    //   toolUseId:
    //     permissionData.toolUseId ||
    //     permissionData.tool_use_id ||
    //     permissionData.toolUseID,
    //   sessionId:
    //     permissionData.sessionId ||
    //     permissionData.session_id ||
    //     permissionData.sessionID
    // };
    // const toolUse = {
    //   id: normalized.toolUseId,
    //   name: normalized.tool,
    //   input: normalized.input
    // };

    // // Send to renderer
    // const payload = {
    //   ...permissionData,
    //   ...normalized,
    //   toolUse,
    //   requestId
    // };
    // console.log('[ClaudeSessionManager] permission json passed to renderer:', payload);

    this.mainWindow.webContents.send('claude:permission-request', {
      requestId,
      ...permissionData
    });

    this.pendingPermissions.set(requestId, {
      isMcp: true,
      toolUseId: permissionData.tool_use_id,
      sessionId: permissionData.session_id,
      input: permissionData.input,
      createdAt: Date.now()
    });
  }

  createSession(folderId, worktreeId, targetClaudeSessionId = null) {
    const sessionId = uuidv4();
    const db = getDatabase();
    let archivedSessionIds = [];
    let previousMessages = [];
    let sessionName = null;

    // Get working directory - use worktree-specific path
    const folder = Folder.findById(folderId);
    const worktree = Worktree.findById(worktreeId);
    const workingDir = worktree
      ? Worktree.getActivePath(worktree, folder)
      : folder.path;

    // Determine resume/continue behavior and compute claude_session_id upfront
    const options = {};
    let claudeSessionId = sessionId; // Default: our UUID becomes Claude's session ID via --session-id
    if (targetClaudeSessionId) {
      // User clicked a specific past session — resume that exact conversation
      options.resumeSessionId = targetClaudeSessionId;
      claudeSessionId = targetClaudeSessionId;
      console.log(`[ClaudeSessionManager] Resuming specific session: ${targetClaudeSessionId}`);

      // Load messages and name from old session
      const oldSession = db.prepare(`
        SELECT messages, name FROM claude_sessions
        WHERE claude_session_id = ? AND status IN ('exited', 'stopped')
        ORDER BY created_at DESC LIMIT 1
      `).get(targetClaudeSessionId);
      if (oldSession?.messages) {
        try { previousMessages = JSON.parse(oldSession.messages); } catch (e) { }
      }
      if (oldSession?.name) {
        sessionName = oldSession.name;
      }

      // Archive old DB rows (soft delete) instead of deleting
      const oldRows = db.prepare(`
        SELECT id FROM claude_sessions
        WHERE claude_session_id = ? AND status IN ('exited', 'stopped') AND (archived = 0 OR archived IS NULL)
      `).all(targetClaudeSessionId);
      archivedSessionIds = oldRows.map(r => r.id);
      if (archivedSessionIds.length > 0) {
        db.prepare(`
          UPDATE claude_sessions SET archived = 1
          WHERE claude_session_id = ? AND status IN ('exited', 'stopped')
        `).run(targetClaudeSessionId);
        console.log(`[ClaudeSessionManager] Archived ${archivedSessionIds.length} old session(s) for resumed session`);
      }
    } else {
      // "New Session" — fresh session with our UUID via --session-id
      console.log(`[ClaudeSessionManager] Starting fresh session: ${sessionId}`);
    }

    // Pre-load previous messages into buffer so ClaudeChat can pull them on mount
    const hasPreloadedMessages = previousMessages.length > 0;
    if (hasPreloadedMessages) {
      console.log(`[ClaudeSessionManager] Pre-loading ${previousMessages.length} messages from previous session`);
      this.historyBuffer.set(sessionId, previousMessages);
    }

    // Create subprocess
    const claudeProcess = new ClaudeProcess(sessionId, workingDir, {
      onChunk: (data) => {
        this.mainWindow.webContents.send('claude:message-chunk', data);
      },
      onComplete: (data) => {
        this.mainWindow.webContents.send('claude:message-complete', data);
      },
      onError: (data) => {
        this.mainWindow.webContents.send('claude:session-error', data);
      },
      onExit: (code) => {
        this.handleSessionExit(sessionId, code);
      },
      onSystemInfo: ({ sessionId: sid, claudeSessionId }) => {
        this.handleSystemInfo(sid, claudeSessionId);
      },
      onHistory: (data) => {
        // If we pre-loaded messages from DB, skip CLI replay (DB format is richer)
        if (hasPreloadedMessages) {
          console.log(`[ClaudeSessionManager] Skipping CLI history replay — using pre-loaded DB messages`);
          return;
        }
        this.historyBuffer.set(sessionId, data.messages || []);
        this.mainWindow.webContents.send('claude:conversation-history', data);
      },
      onToolUse: (data) => {
        this.mainWindow.webContents.send('claude:tool-use', data);
      },
      onToolResult: (data) => {
        this.mainWindow.webContents.send('claude:tool-result', data);
      },
      onThinking: (data) => {
        this.mainWindow.webContents.send('claude:thinking', data);
      },
      onTurnComplete: (data) => {
        this.mainWindow.webContents.send('claude:turn-complete', data);

        // Update last_active_at
        const db = getDatabase();
        db.prepare('UPDATE claude_sessions SET last_active_at = CURRENT_TIMESTAMP WHERE id = ?').run(sessionId);
      }
    }, options);

    claudeProcess.start();
    this.activeSessions.set(sessionId, claudeProcess);

    // Save to database with claude_session_id known upfront, source='app'
    db.prepare(`
      INSERT INTO claude_sessions (id, folder_id, worktree_id, status, name, claude_session_id, source, last_active_at)
      VALUES (?, ?, ?, 'active', ?, ?, 'app', CURRENT_TIMESTAMP)
    `).run(sessionId, folderId, worktreeId, sessionName, claudeSessionId);

    // Auto-archive older stopped/exited sessions on this worktree
    db.prepare(`
      UPDATE claude_sessions SET archived = 1
      WHERE folder_id = ? AND worktree_id = ?
        AND id != ?
        AND status IN ('stopped', 'exited')
        AND (archived = 0 OR archived IS NULL)
    `).run(folderId, worktreeId, sessionId);

    return {
      sessionId,
      id: sessionId,
      folder_id: folderId,
      worktree_id: worktreeId,
      status: 'active',
      name: sessionName,
      title: sessionName,
      claude_session_id: claudeSessionId,
      workingDir,
      deletedSessionIds: archivedSessionIds
    };
  }

  /**
   * Verify/update Claude CLI's session ID (already set at INSERT time via --session-id)
   */
  handleSystemInfo(sessionId, claudeSessionId) {
    const db = getDatabase();
    const row = db.prepare('SELECT claude_session_id FROM claude_sessions WHERE id = ?').get(sessionId);
    if (row?.claude_session_id !== claudeSessionId) {
      console.log(`[ClaudeSessionManager] Claude session ID mismatch — updating: ${row?.claude_session_id} → ${claudeSessionId}`);
      db.prepare('UPDATE claude_sessions SET claude_session_id = ? WHERE id = ?').run(claudeSessionId, sessionId);
    } else {
      console.log(`[ClaudeSessionManager] Claude session ID confirmed: ${claudeSessionId}`);
    }
  }

  /**
   * Return and clear buffered history for a session (used by renderer on mount)
   */
  getSessionHistory(sessionId) {
    const messages = this.historyBuffer.get(sessionId) || null;
    this.historyBuffer.delete(sessionId);
    return messages;
  }

  /**
   * Get the most recent completed session for a worktree (for resume)
   */
  getLastSessionForWorktree(folderId, worktreeId) {
    const db = getDatabase();
    return db.prepare(`
      SELECT * FROM claude_sessions
      WHERE folder_id = ? AND worktree_id = ? AND status IN ('stopped', 'exited')
        AND COALESCE(source, 'app') = 'app'
      ORDER BY COALESCE(last_active_at, created_at) DESC
      LIMIT 1
    `).get(folderId, worktreeId);
  }

  /**
   * Save chat messages to the database for a session
   */
  saveSessionMessages(sessionId, messages) {
    const db = getDatabase();
    db.prepare(`
      UPDATE claude_sessions SET messages = ? WHERE id = ?
    `).run(JSON.stringify(messages), sessionId);
  }

  /**
   * Set session title from first user message (first 80 chars)
   */
  setTitleIfEmpty(sessionId, messageText) {
    const db = getDatabase();
    const session = db.prepare('SELECT name FROM claude_sessions WHERE id = ?').get(sessionId);
    if (session?.name && session.name !== 'New Session') return; // Already has a title

    const title = messageText.replace(/\n/g, ' ').trim().substring(0, 80) || 'New Session';
    if (title === 'New Session') return;

    db.prepare('UPDATE claude_sessions SET name = ? WHERE id = ?').run(title, sessionId);

    try {
      if (!this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('claude:session-title-updated', { sessionId, title });
      }
    } catch {}
  }

  /**
   * Get the most recent session with messages for lazy resume display
   */
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

  /**
   * Rename a session
   */
  renameSession(sessionId, name) {
    const db = getDatabase();
    db.prepare('UPDATE claude_sessions SET name = ? WHERE id = ?').run(name, sessionId);
  }

  /**
   * Archive a session (soft delete)
   */
  archiveSession(sessionId) {
    const db = getDatabase();
    db.prepare('UPDATE claude_sessions SET archived = 1 WHERE id = ?').run(sessionId);
  }

  /**
   * Unarchive a session
   */
  unarchiveSession(sessionId) {
    const db = getDatabase();
    db.prepare('UPDATE claude_sessions SET archived = 0 WHERE id = ?').run(sessionId);
  }

  /**
   * List archived sessions for a worktree
   */
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
    const process = this.activeSessions.get(sessionId);
    if (!process) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // Set title from first message if not already set
    this.setTitleIfEmpty(sessionId, message);

    process.sendMessage(message);
  }

  respondToPermission(requestId, approved) {
    const pending = this.pendingPermissions.get(requestId);
    if (!pending) {
      throw new Error(`Permission request ${requestId} not found`);
    }

    // All permissions are now handled via MCP
    console.log('[ClaudeSessionManager] permission decision:', {
      requestId,
      approved,
      sessionId: pending.sessionId,
      toolUseId: pending.toolUseId
    });
    this.permissionServer.respondToPermission(requestId, approved);

    this.pendingPermissions.delete(requestId);
  }

  /**
   * Delete an inactive session from the application database
   */
  deleteSession(sessionId) {
    const db = getDatabase();
    const session = db.prepare('SELECT status FROM claude_sessions WHERE id = ?').get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }
    if (session.status === 'active') {
      throw new Error('Cannot delete an active session. Stop it first.');
    }
    db.prepare('DELETE FROM claude_sessions WHERE id = ?').run(sessionId);
  }

  stopSession(sessionId) {
    const process = this.activeSessions.get(sessionId);
    if (process) {
      process.stop();
      this.activeSessions.delete(sessionId);

      // Update database
      const db = getDatabase();
      db.prepare(`
        UPDATE claude_sessions SET status = 'stopped' WHERE id = ?
      `).run(sessionId);
    }
  }

  handleSessionExit(sessionId, code) {
    this.activeSessions.delete(sessionId);
    this.historyBuffer.delete(sessionId);

    // Notify renderer
    this.mainWindow.webContents.send('claude:session-exited', { sessionId, code });

    // Update database
    const db = getDatabase();
    db.prepare(`
      UPDATE claude_sessions SET status = 'exited' WHERE id = ?
    `).run(sessionId);
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

    return sessions.map(session => ({
      ...session,
      sessionId: session.id
    }));
  }

  /**
   * Cleanup when session manager is destroyed
   */
  destroy() {
    // Stop all active sessions
    for (const [sessionId, process] of this.activeSessions) {
      process.stop();
    }
    this.activeSessions.clear();

    // Stop HTTP server
    if (this.permissionServer) {
      this.permissionServer.stop().catch(() => { });
    }
  }
}

module.exports = ClaudeSessionManager;
