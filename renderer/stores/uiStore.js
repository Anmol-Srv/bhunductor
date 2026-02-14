import { create } from 'zustand';

/** Get the canonical tab key — uses `id` if present, falls back to `sessionId` */
const tabKey = (t) => t.id || t.sessionId;

const useUIStore = create((set, get) => ({
  openTabs: [],
  activeTabId: null,
  sidebarCollapsed: false,
  filePanelCollapsed: false,

  toggleSidebar: () => set(state => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  toggleFilePanel: () => set(state => ({ filePanelCollapsed: !state.filePanelCollapsed })),

  openTab: (tab) => set(state => {
    const key = tabKey(tab);
    const exists = state.openTabs.find(t => tabKey(t) === key);
    if (exists) {
      return { activeTabId: key };
    }
    return {
      openTabs: [...state.openTabs, tab],
      activeTabId: key
    };
  }),

  closeTab: (id) => set(state => {
    const filtered = state.openTabs.filter(t => tabKey(t) !== id);
    let newActiveId = state.activeTabId;
    if (state.activeTabId === id) {
      const oldIdx = state.openTabs.findIndex(t => tabKey(t) === id);
      const newTab = filtered[Math.min(oldIdx, filtered.length - 1)];
      newActiveId = newTab ? tabKey(newTab) : null;
    }
    return { openTabs: filtered, activeTabId: newActiveId };
  }),

  switchTab: (id) => set({ activeTabId: id }),

  updateTabTitle: (id, title) => set(state => ({
    openTabs: state.openTabs.map(t =>
      tabKey(t) === id ? { ...t, title, name: title } : t
    )
  })),

  isTabOpen: (id) => get().openTabs.some(t => tabKey(t) === id)
}));

export default useUIStore;
