const { ipcMain, dialog, app } = require('electron');
const { IPC_CHANNELS } = require('../shared/constants');
const Folder = require('./data/models/Folder');
const Worktree = require('./data/models/Worktree');
const ClaudeSessionManager = require('./claude/ClaudeSessionManager');

/**
 * Register all IPC handlers
 */
function registerIPCHandlers(configManager, mainWindow) {
  // Initialize Claude session manager
  const claudeManager = new ClaudeSessionManager(mainWindow);
  ipcMain.handle(IPC_CHANNELS.CONFIG_GET, (event, key) => {
    try {
      if (key) {
        return configManager.get(key);
      }
      return configManager.getAll();
    } catch (error) {
      console.error('[IPC] Error getting config:', error);
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.CONFIG_SET, (event, key, value) => {
    try {
      configManager.set(key, value);
      return { success: true };
    } catch (error) {
      console.error('[IPC] Error setting config:', error);
      throw error;
    }
  });

  // Folder handlers
  ipcMain.handle(IPC_CHANNELS.FOLDER_OPEN_DIALOG, async () => {
    try {
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory'],
        title: 'Open Git Repository',
        buttonLabel: 'Open'
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { canceled: true };
      }

      const folderPath = result.filePaths[0];

      // Validate git repo
      if (!Folder.isGitRepo(folderPath)) {
        return {
          error: 'Selected folder is not a git repository',
          path: folderPath
        };
      }

      // Add or update folder
      const folder = Folder.addOrUpdate(folderPath);
      return { folder };
    } catch (error) {
      console.error('[IPC] Error opening folder:', error);
      return { error: error.message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.FOLDER_GET_RECENT, () => {
    try {
      return Folder.findRecent();
    } catch (error) {
      console.error('[IPC] Error getting recent folders:', error);
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.FOLDER_ADD, (event, folderPath) => {
    try {
      const folder = Folder.addOrUpdate(folderPath);
      return folder;
    } catch (error) {
      console.error('[IPC] Error adding folder:', error);
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.FOLDER_REMOVE, (event, folderId) => {
    try {
      const removed = Folder.delete(folderId);
      return { success: removed };
    } catch (error) {
      console.error('[IPC] Error removing folder:', error);
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.FOLDER_VALIDATE_GIT, (event, folderPath) => {
    try {
      const isValid = Folder.isGitRepo(folderPath);
      return { valid: isValid };
    } catch (error) {
      console.error('[IPC] Error validating git repo:', error);
      return { valid: false, error: error.message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.APP_GET_VERSION, () => {
    return app.getVersion();
  });

  ipcMain.handle(IPC_CHANNELS.APP_QUIT, () => {
    app.quit();
  });

  // Worktree handlers
  ipcMain.handle(IPC_CHANNELS.WORKTREE_INIT_MAIN, async (event, folderId, folderPath) => {
    try {
      const worktree = Worktree.initializeMainBranch(folderId, folderPath);
      return { success: true, worktree };
    } catch (error) {
      console.error('[IPC] Error initializing main branch:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.WORKTREE_LIST, async (event, folderId) => {
    try {
      const worktrees = Worktree.listWorktrees(folderId);
      return { success: true, worktrees };
    } catch (error) {
      console.error('[IPC] Error listing worktrees:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.WORKTREE_CREATE, async (event, folderId, folderPath, branchName) => {
    try {
      const worktree = Worktree.createWorktree(folderId, folderPath, branchName);
      return { success: true, worktree };
    } catch (error) {
      console.error('[IPC] Error creating worktree:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.WORKTREE_DELETE, async (event, worktreeId) => {
    try {
      const result = Worktree.deleteWorktree(worktreeId);
      return { success: true };
    } catch (error) {
      console.error('[IPC] Error deleting worktree:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.WORKTREE_VALIDATE_NAME, async (event, branchName) => {
    try {
      const validation = Worktree.validateBranchName(branchName);
      return validation;
    } catch (error) {
      console.error('[IPC] Error validating branch name:', error);
      return { valid: false, error: 'Validation failed' };
    }
  });

  ipcMain.handle(IPC_CHANNELS.WORKTREE_SET_ACTIVE, async (event, folderId, worktreeId) => {
    try {
      Worktree.setActiveWorktree(folderId, worktreeId);
      return { success: true };
    } catch (error) {
      console.error('[IPC] Error setting active worktree:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.WORKTREE_CLEANUP, async (event, folderId, folderPath) => {
    try {
      const result = Worktree.cleanupAndReinitialize(folderId, folderPath);
      return { success: true, result };
    } catch (error) {
      console.error('[IPC] Error cleaning up worktrees:', error);
      return { success: false, error: error.message };
    }
  });

  // Claude session handlers
  ipcMain.handle(IPC_CHANNELS.CLAUDE_SESSION_START, async (event, folderId, worktreeId) => {
    try {
      const session = claudeManager.createSession(folderId, worktreeId);
      return { success: true, session };
    } catch (error) {
      console.error('[IPC] Error starting Claude session:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.CLAUDE_SESSION_STOP, async (event, sessionId) => {
    try {
      claudeManager.stopSession(sessionId);
      return { success: true };
    } catch (error) {
      console.error('[IPC] Error stopping Claude session:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.CLAUDE_SESSION_LIST, async (event, folderId) => {
    try {
      const sessions = claudeManager.listSessions(folderId);
      return { success: true, sessions };
    } catch (error) {
      console.error('[IPC] Error listing Claude sessions:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.CLAUDE_SEND_MESSAGE, async (event, sessionId, message) => {
    try {
      claudeManager.sendMessage(sessionId, message);
      return { success: true };
    } catch (error) {
      console.error('[IPC] Error sending message:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.CLAUDE_PERMISSION_RESPOND, async (event, requestId, approved) => {
    try {
      claudeManager.respondToPermission(requestId, approved);
      return { success: true };
    } catch (error) {
      console.error('[IPC] Error responding to permission:', error);
      return { success: false, error: error.message };
    }
  });

  console.log('[IPC] Handlers registered');
}

module.exports = { registerIPCHandlers };
