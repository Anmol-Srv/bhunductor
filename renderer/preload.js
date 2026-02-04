const { contextBridge, ipcRenderer } = require('electron');

// Allowlist of channels the renderer can access
const ALLOWED_CHANNELS = [
  'config:get',
  'config:set',
  'folder:open-dialog',
  'folder:get-recent',
  'folder:add',
  'folder:remove',
  'folder:validate-git',
  'app:get-version',
  'app:quit'
];

/**
 * Expose secure IPC bridge to renderer
 */
contextBridge.exposeInMainWorld('electron', {
  /**
   * Invoke IPC handler and wait for response
   */
  invoke: (channel, ...args) => {
    if (!ALLOWED_CHANNELS.includes(channel)) {
      throw new Error(`IPC channel '${channel}' is not allowed`);
    }
    return ipcRenderer.invoke(channel, ...args);
  },

  /**
   * Listen to IPC events from main process
   */
  on: (channel, callback) => {
    if (!ALLOWED_CHANNELS.includes(channel)) {
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

console.log('[Preload] Secure IPC bridge initialized');
