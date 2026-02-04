const { ipcMain, dialog, app } = require('electron');
const { IPC_CHANNELS } = require('../shared/constants');
const Folder = require('./data/models/Folder');

/**
 * Register all IPC handlers
 */
function registerIPCHandlers(configManager) {
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

  console.log('[IPC] Handlers registered');
}

module.exports = { registerIPCHandlers };
