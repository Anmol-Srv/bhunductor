const { IPC_CHANNELS } = require('../../shared/constants');
const Folder = require('../data/models/Folder');

class FolderService {
  registerHandlers(ipcMain, dialog) {
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

        if (!Folder.isGitRepo(folderPath)) {
          return { error: 'Selected folder is not a git repository', path: folderPath };
        }

        const folder = Folder.addOrUpdate(folderPath);
        return { folder };
      } catch (error) {
        console.error('[FolderService] Error opening folder:', error);
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle(IPC_CHANNELS.FOLDER_GET_RECENT, () => {
      try {
        return Folder.findRecent();
      } catch (error) {
        console.error('[FolderService] Error getting recent folders:', error);
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle(IPC_CHANNELS.FOLDER_ADD, (event, folderPath) => {
      try {
        return Folder.addOrUpdate(folderPath);
      } catch (error) {
        console.error('[FolderService] Error adding folder:', error);
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle(IPC_CHANNELS.FOLDER_REMOVE, (event, folderId) => {
      try {
        return { success: Folder.delete(folderId) };
      } catch (error) {
        console.error('[FolderService] Error removing folder:', error);
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle(IPC_CHANNELS.FOLDER_VALIDATE_GIT, (event, folderPath) => {
      try {
        return { valid: Folder.isGitRepo(folderPath) };
      } catch (error) {
        return { valid: false, error: error.message };
      }
    });
  }
}

module.exports = FolderService;
