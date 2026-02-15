import { create } from 'zustand';

const useBranchStore = create((set, get) => ({
  worktrees: [],
  activeWorktree: null,
  loading: false,

  setWorktrees: (worktrees) => set({ worktrees }),
  setActiveWorktree: (worktree) => set({ activeWorktree: worktree }),
  setLoading: (loading) => set({ loading }),

  initialize: async (folder) => {
    set({ loading: true });
    try {
      await window.electron.invoke('worktree:init-main', folder.id, folder.path);
      const result = await window.electron.invoke('worktree:list', folder.id);
      if (result.success) {
        set({ worktrees: result.worktrees });
        const active = result.worktrees.find(w => w.id === folder.active_worktree_id)
          || result.worktrees.find(w => w.is_main === 1);
        set({ activeWorktree: active });
        return { worktrees: result.worktrees, activeWorktree: active };
      }
      return null;
    } catch (error) {
      console.error('[BranchStore] Error initializing:', error);
      return null;
    } finally {
      set({ loading: false });
    }
  },

  loadWorktrees: async (folderId) => {
    const result = await window.electron.invoke('worktree:list', folderId);
    if (result.success) {
      set({ worktrees: result.worktrees });
    }
    return result;
  },

  createBranch: async (folderId, folderPath, branchName) => {
    const result = await window.electron.invoke('worktree:create', folderId, folderPath, branchName);
    if (result.success) {
      await get().loadWorktrees(folderId);
      set({ activeWorktree: result.worktree });
      await window.electron.invoke('worktree:set-active', folderId, result.worktree.id);
    }
    return result;
  },

  deleteBranch: async (worktreeId, folderId) => {
    const result = await window.electron.invoke('worktree:delete', worktreeId);
    if (result.success) {
      const { activeWorktree, worktrees } = get();
      await get().loadWorktrees(folderId);
      if (activeWorktree?.id === worktreeId) {
        const mainBranch = worktrees.find(w => w.is_main === 1);
        set({ activeWorktree: mainBranch });
        if (mainBranch) {
          await window.electron.invoke('worktree:set-active', folderId, mainBranch.id);
        }
      }
    }
    return result;
  },

  selectBranch: async (folderId, worktree) => {
    set({ activeWorktree: worktree });
    await window.electron.invoke('worktree:set-active', folderId, worktree.id);
  }
}));

export default useBranchStore;
