const { v4: uuidv4 } = require('uuid');
const { getDatabase } = require('../data/database');
const Worktree = require('../data/models/Worktree');
const Folder = require('../data/models/Folder');
const ClaudeProcess = require('./ClaudeProcess');

class ClaudeSessionManager {
  constructor(mainWindow) {
    this.mainWindow = mainWindow;
    this.activeSessions = new Map(); // sessionId -> ClaudeProcess
    this.pendingPermissions = new Map(); // requestId -> { sessionId, resolve }
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
        // Store for later response
        this.pendingPermissions.set(requestId, { sessionId, process });
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

    pending.process.sendPermissionResponse(approved);
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
}

module.exports = ClaudeSessionManager;
