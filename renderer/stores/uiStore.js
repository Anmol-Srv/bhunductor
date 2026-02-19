import { create } from 'zustand';

/** Get the canonical tab key — uses `id` if present, falls back to `sessionId` */
const tabKey = (t) => t.id || t.sessionId;

const useUIStore = create((set, get) => ({
  // Tabs are now stored per folder
  tabsByFolder: {}, // { folderId: [...tabs] }
  activeTabByFolder: {}, // { folderId: tabId }
  activeFolderId: null,
  sidebarCollapsed: false,
  filePanelCollapsed: false,
  settingsOpen: false,

  toggleSidebar: () => set(state => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  toggleFilePanel: () => set(state => ({ filePanelCollapsed: !state.filePanelCollapsed })),
  toggleSettings: () => set(state => ({ settingsOpen: !state.settingsOpen })),
  closeSettings: () => set({ settingsOpen: false }),

  // Set the active folder (switches tab context)
  setActiveFolder: (folderId) => set({ activeFolderId: folderId }),

  // Helper to get tabs for current folder
  getOpenTabs: () => {
    const state = get();
    return state.tabsByFolder[state.activeFolderId] || [];
  },

  // Helper to get active tab ID for current folder
  getActiveTabId: () => {
    const state = get();
    return state.activeTabByFolder[state.activeFolderId] || null;
  },

  openTab: (tab) => set(state => {
    const folderId = state.activeFolderId;
    if (!folderId) return state;

    const key = tabKey(tab);
    const currentTabs = state.tabsByFolder[folderId] || [];
    const exists = currentTabs.find(t => tabKey(t) === key);

    if (exists) {
      return {
        activeTabByFolder: {
          ...state.activeTabByFolder,
          [folderId]: key
        }
      };
    }

    return {
      tabsByFolder: {
        ...state.tabsByFolder,
        [folderId]: [...currentTabs, tab]
      },
      activeTabByFolder: {
        ...state.activeTabByFolder,
        [folderId]: key
      }
    };
  }),

  closeTab: (id) => set(state => {
    const folderId = state.activeFolderId;
    if (!folderId) return state;

    const currentTabs = state.tabsByFolder[folderId] || [];
    const filtered = currentTabs.filter(t => tabKey(t) !== id);

    let newActiveId = state.activeTabByFolder[folderId];
    if (newActiveId === id) {
      const oldIdx = currentTabs.findIndex(t => tabKey(t) === id);
      const newTab = filtered[Math.min(oldIdx, filtered.length - 1)];
      newActiveId = newTab ? tabKey(newTab) : null;
    }

    return {
      tabsByFolder: {
        ...state.tabsByFolder,
        [folderId]: filtered
      },
      activeTabByFolder: {
        ...state.activeTabByFolder,
        [folderId]: newActiveId
      }
    };
  }),

  switchTab: (id) => set(state => {
    const folderId = state.activeFolderId;
    if (!folderId) return state;

    return {
      activeTabByFolder: {
        ...state.activeTabByFolder,
        [folderId]: id
      }
    };
  }),

  updateTabTitle: (id, title) => set(state => {
    const folderId = state.activeFolderId;
    if (!folderId) return state;

    const currentTabs = state.tabsByFolder[folderId] || [];
    return {
      tabsByFolder: {
        ...state.tabsByFolder,
        [folderId]: currentTabs.map(t =>
          tabKey(t) === id ? { ...t, title, name: title } : t
        )
      }
    };
  }),

  isTabOpen: (id) => {
    const state = get();
    const folderId = state.activeFolderId;
    if (!folderId) return false;
    const currentTabs = state.tabsByFolder[folderId] || [];
    return currentTabs.some(t => tabKey(t) === id);
  }
}));

// Selectors for reactive access
export const selectOpenTabs = (state) => state.tabsByFolder[state.activeFolderId] || [];
export const selectActiveTabId = (state) => state.activeTabByFolder[state.activeFolderId] || null;

export default useUIStore;
