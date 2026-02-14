const { IPC_CHANNELS } = require('../../shared/constants');
const Worktree = require('../data/models/Worktree');

class BranchService {
  registerHandlers(ipcMain) {
    ipcMain.handle(IPC_CHANNELS.WORKTREE_INIT_MAIN, async (event, folderId, folderPath) => {
      try {
        const worktree = Worktree.initializeMainBranch(folderId, folderPath);
        return { success: true, worktree };
      } catch (error) {
        console.error('[BranchService] Error initializing main branch:', error);
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle(IPC_CHANNELS.WORKTREE_LIST, async (event, folderId) => {
      try {
        const worktrees = Worktree.listWorktrees(folderId);
        return { success: true, worktrees };
      } catch (error) {
        console.error('[BranchService] Error listing worktrees:', error);
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle(IPC_CHANNELS.WORKTREE_CREATE, async (event, folderId, folderPath, branchName) => {
      try {
        const worktree = Worktree.createWorktree(folderId, folderPath, branchName);
        return { success: true, worktree };
      } catch (error) {
        console.error('[BranchService] Error creating worktree:', error);
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle(IPC_CHANNELS.WORKTREE_DELETE, async (event, worktreeId) => {
      try {
        Worktree.deleteWorktree(worktreeId);
        return { success: true };
      } catch (error) {
        console.error('[BranchService] Error deleting worktree:', error);
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle(IPC_CHANNELS.WORKTREE_VALIDATE_NAME, async (event, branchName) => {
      try {
        return Worktree.validateBranchName(branchName);
      } catch (error) {
        return { valid: false, error: 'Validation failed' };
      }
    });

    ipcMain.handle(IPC_CHANNELS.WORKTREE_SET_ACTIVE, async (event, folderId, worktreeId) => {
      try {
        Worktree.setActiveWorktree(folderId, worktreeId);
        return { success: true };
      } catch (error) {
        console.error('[BranchService] Error setting active worktree:', error);
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle(IPC_CHANNELS.WORKTREE_CLEANUP, async (event, folderId, folderPath) => {
      try {
        const result = Worktree.cleanupAndReinitialize(folderId, folderPath);
        return { success: true, result };
      } catch (error) {
        console.error('[BranchService] Error cleaning up worktrees:', error);
        return { success: false, error: error.message };
      }
    });
  }
}

module.exports = BranchService;
