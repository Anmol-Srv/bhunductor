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

    this.permissionServer.start().catch((error) => {
      console.error('[SessionManager] Failed to start permission HTTP server:', error);
    });
  }

  /**
   * Handle permission request from MCP server
   */
  handleMcpPermissionRequest(requestId, permissionData) {
    console.log('[SessionManager] Received MCP permission request:', requestId, permissionData);

    // Send to renderer
    this.mainWindow.webContents.send('claude:permission-request', {
      ...permissionData,
      requestId
    });

    // Store mapping for later response
    this.pendingPermissions.set(requestId, {
      isMcp: true,
      toolUseId: permissionData.toolUseId
    });
  }

  createSession(folderId, worktreeId) {
    const sessionId = uuidv4();

    // Get working directory - use main folder path, not worktree path
    const folder = Folder.findById(folderId);
    const workingDir = folder.path;

    console.log(`[SessionManager] Creating session ${sessionId} in ${workingDir}`);

    // Create subprocess
    const process = new ClaudeProcess(sessionId, workingDir, {
      onChunk: (data) => {
        this.mainWindow.webContents.send('claude:message-chunk', data);
      },
      onComplete: (data) => {
        this.mainWindow.webContents.send('claude:message-complete', data);
      },
      onPermissionRequest: (data) => {
        const requestId = uuidv4();
        this.mainWindow.webContents.send('claude:permission-request', {
          ...data,
          requestId
        });
        // Store for later response, including toolUseId
        this.pendingPermissions.set(requestId, {
          sessionId,
          process,
          toolUseId: data.toolUseId
        });
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

    console.log(`[SessionManager] Responding to permission ${requestId}: ${approved ? 'APPROVED' : 'DENIED'}`);

    if (pending.isMcp) {
      // MCP-based permission - respond via HTTP server
      this.permissionServer.respondToPermission(requestId, approved);
    } else {
      // Legacy control message based permission (fallback)
      pending.process.sendPermissionResponse(approved, pending.toolUseId);
    }

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
    console.log(`[SessionManager] Session ${sessionId} exited with code ${code}`);
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
      this.permissionServer.stop().catch((error) => {
        console.error('[SessionManager] Error stopping permission server:', error);
      });
    }
  }
}

module.exports = ClaudeSessionManager;
