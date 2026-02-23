const { contextBridge, ipcRenderer } = require('electron');
const { IPC_CHANNELS } = require('../shared/constants');

// Allowlist derived from the single source of truth in shared/constants.js
const ALLOWED_CHANNELS = new Set(Object.values(IPC_CHANNELS));

/**
 * Expose secure IPC bridge to renderer
 */
contextBridge.exposeInMainWorld('electron', {
  /**
   * Invoke IPC handler and wait for response
   */
  invoke: (channel, ...args) => {
    if (!ALLOWED_CHANNELS.has(channel)) {
      throw new Error(`IPC channel '${channel}' is not allowed`);
    }
    return ipcRenderer.invoke(channel, ...args);
  },

  /**
   * Listen to IPC events from main process
   */
  on: (channel, callback) => {
    if (!ALLOWED_CHANNELS.has(channel)) {
      throw new Error(`IPC channel '${channel}' is not allowed`);
    }

    const subscription = (event, ...args) => callback(...args);
    ipcRenderer.on(channel, subscription);

    // Return unsubscribe function
    return () => {
      ipcRenderer.removeListener(channel, subscription);
    };
  },

  /**
   * Platform information
   */
  platform: process.platform
});
