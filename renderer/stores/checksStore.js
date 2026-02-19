import { create } from 'zustand';

const useChecksStore = create((set, get) => ({
  checksByWorktree: {},

  // Post-action fast-polling: map of worktreeId → timestamp (expiry)
  refreshUntil: {},

  fetchChecks: async (folderId, worktreeId) => {
    if (!folderId || !worktreeId) return;
    try {
      const result = await window.electron.invoke('git:get-checks', folderId, worktreeId);
      if (result.success) {
        set(state => ({
          checksByWorktree: {
            ...state.checksByWorktree,
            [worktreeId]: result
          }
        }));
      }
    } catch (err) {
      console.error('[ChecksStore] Error fetching checks:', err);
    }
  },

  // Activate 30-second fast-polling window after a git action
  setPostActionRefresh: (worktreeId) => {
    set(state => ({
      refreshUntil: {
        ...state.refreshUntil,
        [worktreeId]: Date.now() + 30000
      }
    }));
  },

  // Check if a worktree is in fast-polling mode
  isInFastPoll: (worktreeId) => {
    const until = get().refreshUntil[worktreeId];
    return until ? Date.now() < until : false;
  },
}));

export default useChecksStore;
