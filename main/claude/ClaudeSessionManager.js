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

    // Start HTTP server for MCP permission requests
    this.permissionServer = new PermissionHttpServer(58472);
    this.permissionServer.onPermissionRequest = (requestId, permissionData) => {
      this.handleMcpPermissionRequest(requestId, permissionData);
    };

    this.permissionServer.start().catch(() => { });
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

  createSession(folderId, worktreeId) {
    const sessionId = uuidv4();

    // Get working directory - use main folder path, not worktree path
    const folder = Folder.findById(folderId);
    const workingDir = folder.path;

    // Create subprocess
    const process = new ClaudeProcess(sessionId, workingDir, {
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
      }
    });

    process.start();
    this.activeSessions.set(sessionId, process);

    // Save to database
    const db = getDatabase();
    db.prepare(`
      INSERT INTO claude_sessions (id, folder_id, worktree_id, status)
      VALUES (?, ?, ?, 'active')
    `).run(sessionId, folderId, worktreeId);

    return { sessionId, workingDir };
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

    // Notify renderer
    this.mainWindow.webContents.send('claude:session-exited', { sessionId, code });

    // Update database
    const db = getDatabase();
    db.prepare(`
      UPDATE claude_sessions SET status = 'exited' WHERE id = ?
    `).run(sessionId);
  }

  listSessions(folderId) {
    const db = getDatabase();
    const sessions = db.prepare(`
      SELECT * FROM claude_sessions
      WHERE folder_id = ? AND status = 'active'
      ORDER BY created_at DESC
    `).all(folderId);

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
