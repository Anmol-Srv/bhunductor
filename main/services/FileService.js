const { IPC_CHANNELS } = require('../../shared/constants');
const File = require('../data/models/File');
const Worktree = require('../data/models/Worktree');
const Folder = require('../data/models/Folder');

class FileService {
  /**
   * Resolve the active filesystem path for a worktree
   */
  _resolvePath(folderId, worktreeId) {
    const worktree = Worktree.findById(worktreeId);
    if (!worktree) throw new Error('Worktree not found');

    const folder = Folder.findById(folderId);
    if (!folder) throw new Error('Folder not found');

    return Worktree.getActivePath(worktree, folder);
  }

  registerHandlers(ipcMain) {
    ipcMain.handle(IPC_CHANNELS.FILE_TREE_GET, async (event, folderId, worktreeId) => {
      try {
        const worktreePath = this._resolvePath(folderId, worktreeId);
        const treeResult = File.getFileTree(worktreePath);
        if (!treeResult.success) {
          return { success: false, error: treeResult.error };
        }
        const statusResult = File.getGitStatus(worktreePath);
        return {
          success: true,
          tree: treeResult.tree,
          gitStatus: statusResult.success ? statusResult.files : []
        };
      } catch (error) {
        console.error('[FileService] Error getting file tree:', error);
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle(IPC_CHANNELS.FILE_READ_CONTENT, async (event, filePath) => {
      try {
        const result = File.readContent(filePath);
        if (!result.success) {
          return { success: false, error: result.error };
        }
        return { success: true, content: result.content, encoding: result.encoding };
      } catch (error) {
        console.error('[FileService] Error reading file content:', error);
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle(IPC_CHANNELS.FILE_GET_GIT_DIFF, async (event, folderId, worktreeId, relativePath) => {
      try {
        const worktreePath = this._resolvePath(folderId, worktreeId);
        const result = File.getGitDiff(worktreePath, relativePath);
        if (!result.success) {
          return { success: false, error: result.error };
        }
        return {
          success: true,
          oldContent: result.oldContent,
          newContent: result.newContent,
          changeType: result.changeType
        };
      } catch (error) {
        console.error('[FileService] Error getting git diff:', error);
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle(IPC_CHANNELS.FILE_GET_GIT_STATUS, async (event, folderId, worktreeId) => {
      try {
        const worktreePath = this._resolvePath(folderId, worktreeId);
        const result = File.getGitStatus(worktreePath);
        if (!result.success) {
          return { success: false, error: result.error };
        }
        return { success: true, files: result.files };
      } catch (error) {
        console.error('[FileService] Error getting git status:', error);
        return { success: false, error: error.message };
      }
    });
  }
}

module.exports = FileService;
