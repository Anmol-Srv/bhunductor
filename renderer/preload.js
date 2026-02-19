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
  'worktree:init-main',
  'worktree:list',
  'worktree:create',
  'worktree:delete',
  'worktree:validate-name',
  'worktree:set-active',
  'worktree:cleanup',
  'claude:session-start',
  'claude:session-stop',
  'claude:session-delete',
  'claude:session-list',
  'claude:send-message',
  'claude:permission-respond',
  'claude:message-chunk',
  'claude:message-complete',
  'claude:permission-request',
  'claude:session-error',
  'claude:session-exited',
  'claude:conversation-history',
  'claude:session-get-history',
  'claude:session-save-messages',
  'claude:tool-use',
  'claude:tool-result',
  'claude:thinking',
  'claude:turn-complete',
  'claude:session-title-updated',
  'claude:session-rename',
  'claude:session-archive',
  'claude:session-unarchive',
  'claude:session-list-archived',
  'claude:session-get-last',
  'claude:session-lazy-resume',
  'claude:session-check-alive',
  'file:tree-get',
  'file:read-content',
  'file:get-git-diff',
  'file:get-git-status',
  'git:get-profile',
  'git:get-config',
  'git:get-log',
  'git:get-checks',
  'app:get-version',
  'app:quit',
  'app:open-external'
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
