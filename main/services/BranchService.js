const { IPC_CHANNELS } = require('../../shared/constants');
const { wrapHandler } = require('../utils/ipc-handler');
const Worktree = require('../data/models/Worktree');

const w = (fn) => wrapHandler('BranchService', fn);

class BranchService {
  registerHandlers(ipcMain) {
    ipcMain.handle(IPC_CHANNELS.WORKTREE_INIT_MAIN, w(async (event, folderId, folderPath) => {
      const worktree = Worktree.initializeMainBranch(folderId, folderPath);
      return { success: true, worktree };
    }));

    ipcMain.handle(IPC_CHANNELS.WORKTREE_LIST, w(async (event, folderId) => {
      const worktrees = Worktree.listWorktrees(folderId);
      return { success: true, worktrees };
    }));

    ipcMain.handle(IPC_CHANNELS.WORKTREE_CREATE, w(async (event, folderId, folderPath, branchName) => {
      const worktree = Worktree.createWorktree(folderId, folderPath, branchName);
      return { success: true, worktree };
    }));

    ipcMain.handle(IPC_CHANNELS.WORKTREE_DELETE, w(async (event, worktreeId) => {
      Worktree.deleteWorktree(worktreeId);
      return { success: true };
    }));

    ipcMain.handle(IPC_CHANNELS.WORKTREE_VALIDATE_NAME, w(async (event, branchName) => {
      return Worktree.validateBranchName(branchName);
    }));

    ipcMain.handle(IPC_CHANNELS.WORKTREE_SET_ACTIVE, w(async (event, folderId, worktreeId) => {
      Worktree.setActiveWorktree(folderId, worktreeId);
      return { success: true };
    }));

    ipcMain.handle(IPC_CHANNELS.WORKTREE_CLOSE, w(async (event, worktreeId) => {
      Worktree.closeBranch(worktreeId);
      return { success: true };
    }));

    ipcMain.handle(IPC_CHANNELS.WORKTREE_REOPEN, w(async (event, worktreeId) => {
      Worktree.reopenBranch(worktreeId);
      return { success: true };
    }));

    ipcMain.handle(IPC_CHANNELS.WORKTREE_LIST_CLOSED, w(async (event, folderId) => {
      const worktrees = Worktree.listClosedWorktrees(folderId);
      return { success: true, worktrees };
    }));

    ipcMain.handle(IPC_CHANNELS.WORKTREE_CLEANUP, w(async (event, folderId, folderPath) => {
      const result = Worktree.cleanupAndReinitialize(folderId, folderPath);
      return { success: true, result };
    }));
  }
}

module.exports = BranchService;
