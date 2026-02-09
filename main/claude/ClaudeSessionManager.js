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

    // Mark any leftover 'active' sessions from previous runs as exited
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
    db.prepare("UPDATE claude_sessions SET status = 'exited' WHERE status = 'active'").run();
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
    let deletedSessionIds = [];
    let previousMessages = [];

    // Get working directory - use worktree-specific path
    const folder = Folder.findById(folderId);
    const worktree = Worktree.findById(worktreeId);
    const workingDir = worktree
      ? Worktree.getActivePath(worktree, folder)
      : folder.path;

    // Determine resume/continue behavior
    const options = {};
    if (targetClaudeSessionId) {
      // User clicked a specific past session — resume that exact conversation
      options.resumeSessionId = targetClaudeSessionId;
      console.log(`[ClaudeSessionManager] Resuming specific session: ${targetClaudeSessionId}`);

      // Load messages from old session before deleting
      const db = getDatabase();
      const oldSession = db.prepare(`
        SELECT messages FROM claude_sessions
        WHERE claude_session_id = ? AND status IN ('exited', 'stopped')
        ORDER BY created_at DESC LIMIT 1
      `).get(targetClaudeSessionId);
      if (oldSession?.messages) {
        try { previousMessages = JSON.parse(oldSession.messages); } catch (e) { }
      }

      // Delete old DB rows with matching claude_session_id to avoid duplicates
      const oldRows = db.prepare(`
        SELECT id FROM claude_sessions
        WHERE claude_session_id = ? AND status IN ('exited', 'stopped')
      `).all(targetClaudeSessionId);
      deletedSessionIds = oldRows.map(r => r.id);
      if (deletedSessionIds.length > 0) {
        db.prepare(`
          DELETE FROM claude_sessions
          WHERE claude_session_id = ? AND status IN ('exited', 'stopped')
        `).run(targetClaudeSessionId);
        console.log(`[ClaudeSessionManager] Deleted ${deletedSessionIds.length} old DB row(s) for resumed session`);
      }
    } else {
      // "New Session" — continue the most recent conversation on this branch
      const lastSession = this.getLastSessionForWorktree(folderId, worktreeId);
      if (lastSession && lastSession.claude_session_id) {
        options.continueSession = true;
        // Load messages from the last session
        if (lastSession.messages) {
          try { previousMessages = JSON.parse(lastSession.messages); } catch (e) { }
        }
        console.log('[ClaudeSessionManager] Continuing previous session on branch');
      }
    }

    // Pre-load previous messages into buffer so ClaudeChat can pull them on mount
    if (previousMessages.length > 0) {
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
        // Buffer history so it can be pulled by the renderer on mount
        this.historyBuffer.set(sessionId, data.messages || []);
        this.mainWindow.webContents.send('claude:conversation-history', data);
      }
    }, options);

    claudeProcess.start();
    this.activeSessions.set(sessionId, claudeProcess);

    // Save to database
    const db = getDatabase();
    db.prepare(`
      INSERT INTO claude_sessions (id, folder_id, worktree_id, status)
      VALUES (?, ?, ?, 'active')
    `).run(sessionId, folderId, worktreeId);

    return {
      sessionId,
      id: sessionId,
      folder_id: folderId,
      worktree_id: worktreeId,
      status: 'active',
      workingDir,
      deletedSessionIds
    };
  }

  /**
   * Store Claude CLI's own session ID for resume support
   */
  handleSystemInfo(sessionId, claudeSessionId) {
    console.log(`[ClaudeSessionManager] Captured Claude session ID: ${claudeSessionId} for session: ${sessionId}`);
    const db = getDatabase();
    db.prepare(`
      UPDATE claude_sessions SET claude_session_id = ? WHERE id = ?
    `).run(claudeSessionId, sessionId);
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
      ORDER BY created_at DESC
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

  sendMessage(sessionId, message) {
    const process = this.activeSessions.get(sessionId);
    if (!process) {
      throw new Error(`Session ${sessionId} not found`);
    }
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
        WHERE folder_id = ? AND worktree_id = ? AND COALESCE(source, 'app') = 'app'
        ORDER BY created_at DESC
      `).all(folderId, worktreeId);
    } else {
      sessions = db.prepare(`
        SELECT * FROM claude_sessions
        WHERE folder_id = ? AND COALESCE(source, 'app') = 'app'
        ORDER BY created_at DESC
      `).all(folderId);
    }

    // Map database 'id' field to 'sessionId' for consistency with created sessions
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
