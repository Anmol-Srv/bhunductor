const { IPC_CHANNELS } = require('../../shared/constants');
const { wrapHandler } = require('../utils/ipc-handler');
const Folder = require('../data/models/Folder');

const w = (fn) => wrapHandler('FolderService', fn);

class FolderService {
  registerHandlers(ipcMain, dialog) {
    ipcMain.handle(IPC_CHANNELS.FOLDER_OPEN_DIALOG, w(async () => {
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
    }));

    ipcMain.handle(IPC_CHANNELS.FOLDER_GET_RECENT, w(() => {
      return Folder.findRecent();
    }));

    ipcMain.handle(IPC_CHANNELS.FOLDER_ADD, w((event, folderPath) => {
      return Folder.addOrUpdate(folderPath);
    }));

    ipcMain.handle(IPC_CHANNELS.FOLDER_REMOVE, w((event, folderId) => {
      return { success: Folder.delete(folderId) };
    }));

    ipcMain.handle(IPC_CHANNELS.FOLDER_VALIDATE_GIT, w((event, folderPath) => {
      return { valid: Folder.isGitRepo(folderPath) };
    }));
  }
}

module.exports = FolderService;
