const { ipcMain, dialog, app, shell } = require('electron');
const { IPC_CHANNELS } = require('../../shared/constants');
const FolderService = require('../services/FolderService');
const BranchService = require('../services/BranchService');
const SessionService = require('../services/SessionService');
const FileService = require('../services/FileService');
const GitService = require('../services/GitService');
const TerminalService = require('../services/TerminalService');

/**
 * Register all IPC handlers using domain services.
 * Returns the session service for cleanup on quit.
 */
function registerIPC(mainWindow, configManager) {
  const folderService = new FolderService();
  const branchService = new BranchService();
  const sessionService = new SessionService(mainWindow);
  const fileService = new FileService();
  const gitService = new GitService();
  const terminalService = new TerminalService(mainWindow);

  // Domain services register their own handlers
  folderService.registerHandlers(ipcMain, dialog);
  branchService.registerHandlers(ipcMain);
  sessionService.registerHandlers(ipcMain);
  fileService.registerHandlers(ipcMain);
  gitService.registerHandlers(ipcMain);
  terminalService.registerHandlers(ipcMain);

  // Config handlers
  ipcMain.handle(IPC_CHANNELS.CONFIG_GET, (event, key) => {
    try {
      return key ? configManager.get(key) : configManager.getAll();
    } catch (error) {
      console.error('[IPC] Error getting config:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.CONFIG_SET, (event, key, value) => {
    try {
      configManager.set(key, value);
      return { success: true };
    } catch (error) {
      console.error('[IPC] Error setting config:', error);
      return { success: false, error: error.message };
    }
  });

  // App handlers
  ipcMain.handle(IPC_CHANNELS.APP_GET_VERSION, () => {
    return app.getVersion();
  });

  ipcMain.handle(IPC_CHANNELS.APP_QUIT, () => {
    app.quit();
  });

  ipcMain.handle(IPC_CHANNELS.APP_OPEN_EXTERNAL, (event, url) => {
    shell.openExternal(url);
  });

  return { sessionService, terminalService };
}

module.exports = { registerIPC };
