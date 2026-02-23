import { create } from 'zustand';

const useTerminalStore = create((set, get) => ({
  terminalsByFolder: {},   // { folderId: [{ id, title }] }
  activeTerminalByFolder: {}, // { folderId: terminalId }
  panelVisible: false,
  panelHeight: 250,

  /** Create a new terminal — calls IPC and updates store in one shot */
  createTerminal: async (folderId, cwd) => {
    const result = await window.electron.invoke('terminal:create', { cwd });
    if (result.success) {
      get().addTerminal(folderId, {
        id: result.terminalId,
        title: 'Terminal'
      });
    }
    return result;
  },

  addTerminal: (folderId, terminal) => set(state => {
    const current = state.terminalsByFolder[folderId] || [];
    return {
      terminalsByFolder: {
        ...state.terminalsByFolder,
        [folderId]: [...current, terminal]
      },
      activeTerminalByFolder: {
        ...state.activeTerminalByFolder,
        [folderId]: terminal.id
      },
      panelVisible: true
    };
  }),

  removeTerminal: (folderId, terminalId) => set(state => {
    const current = state.terminalsByFolder[folderId] || [];
    const filtered = current.filter(t => t.id !== terminalId);

    let newActive = state.activeTerminalByFolder[folderId];
    if (newActive === terminalId) {
      newActive = filtered.length > 0 ? filtered[filtered.length - 1].id : null;
    }

    return {
      terminalsByFolder: {
        ...state.terminalsByFolder,
        [folderId]: filtered
      },
      activeTerminalByFolder: {
        ...state.activeTerminalByFolder,
        [folderId]: newActive
      },
      panelVisible: filtered.length > 0 ? state.panelVisible : false
    };
  }),

  switchTerminal: (folderId, terminalId) => set(state => ({
    activeTerminalByFolder: {
      ...state.activeTerminalByFolder,
      [folderId]: terminalId
    }
  })),

  togglePanel: () => set(state => ({ panelVisible: !state.panelVisible })),
  showPanel: () => set({ panelVisible: true }),
  hidePanel: () => set({ panelVisible: false }),

  setPanelHeight: (height) => set({
    panelHeight: Math.max(100, Math.min(600, height))
  }),

  getTerminals: (folderId) => {
    return get().terminalsByFolder[folderId] || [];
  },

  getActiveTerminalId: (folderId) => {
    return get().activeTerminalByFolder[folderId] || null;
  }
}));

export default useTerminalStore;
