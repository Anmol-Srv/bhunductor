/******/ (() => { // webpackBootstrap
/******/ 	var __webpack_modules__ = ({

/***/ "./shared/constants.js"
/*!*****************************!*\
  !*** ./shared/constants.js ***!
  \*****************************/
(module) {

// IPC Channel definitions
const IPC_CHANNELS = {
  CONFIG_GET: 'config:get',
  CONFIG_SET: 'config:set',

  FOLDER_OPEN_DIALOG: 'folder:open-dialog',
  FOLDER_GET_RECENT: 'folder:get-recent',
  FOLDER_ADD: 'folder:add',
  FOLDER_REMOVE: 'folder:remove',
  FOLDER_VALIDATE_GIT: 'folder:validate-git',

  WORKTREE_INIT_MAIN: 'worktree:init-main',
  WORKTREE_LIST: 'worktree:list',
  WORKTREE_CREATE: 'worktree:create',
  WORKTREE_DELETE: 'worktree:delete',
  WORKTREE_VALIDATE_NAME: 'worktree:validate-name',
  WORKTREE_SET_ACTIVE: 'worktree:set-active',
  WORKTREE_CLEANUP: 'worktree:cleanup',
  WORKTREE_CLOSE: 'worktree:close',
  WORKTREE_REOPEN: 'worktree:reopen',
  WORKTREE_LIST_CLOSED: 'worktree:list-closed',

  CLAUDE_SESSION_START: 'claude:session-start',
  CLAUDE_SESSION_STOP: 'claude:session-stop',
  CLAUDE_SESSION_DELETE: 'claude:session-delete',
  CLAUDE_SESSION_LIST: 'claude:session-list',
  CLAUDE_SEND_MESSAGE: 'claude:send-message',
  CLAUDE_PERMISSION_RESPOND: 'claude:permission-respond',
  CLAUDE_MESSAGE_CHUNK: 'claude:message-chunk',
  CLAUDE_MESSAGE_COMPLETE: 'claude:message-complete',
  CLAUDE_PERMISSION_REQUEST: 'claude:permission-request',
  CLAUDE_SESSION_ERROR: 'claude:session-error',
  CLAUDE_SESSION_EXITED: 'claude:session-exited',
  CLAUDE_CONVERSATION_HISTORY: 'claude:conversation-history',
  CLAUDE_SESSION_GET_HISTORY: 'claude:session-get-history',
  CLAUDE_SESSION_SAVE_MESSAGES: 'claude:session-save-messages',
  CLAUDE_TOOL_USE: 'claude:tool-use',
  CLAUDE_TOOL_RESULT: 'claude:tool-result',
  CLAUDE_THINKING: 'claude:thinking',
  CLAUDE_TURN_COMPLETE: 'claude:turn-complete',
  CLAUDE_SESSION_TITLE_UPDATED: 'claude:session-title-updated',
  CLAUDE_SESSION_RENAME: 'claude:session-rename',
  CLAUDE_SESSION_ARCHIVE: 'claude:session-archive',
  CLAUDE_SESSION_UNARCHIVE: 'claude:session-unarchive',
  CLAUDE_SESSION_LIST_ARCHIVED: 'claude:session-list-archived',
  CLAUDE_SESSION_GET_LAST: 'claude:session-get-last',
  CLAUDE_SESSION_LAZY_RESUME: 'claude:session-lazy-resume',
  CLAUDE_SESSION_CHECK_ALIVE: 'claude:session-check-alive',
  CLAUDE_RENDERER_READY: 'claude:renderer-ready',
  CLAUDE_SESSION_GET_ACTIVE: 'claude:session-get-active',
  CLAUDE_PERMISSION_DISMISSED: 'claude:permission-dismissed',

  FILE_TREE_GET: 'file:tree-get',
  FILE_READ_CONTENT: 'file:read-content',
  FILE_GET_GIT_DIFF: 'file:get-git-diff',
  FILE_GET_GIT_STATUS: 'file:get-git-status',

  GIT_GET_PROFILE: 'git:get-profile',
  GIT_GET_CONFIG: 'git:get-config',
  GIT_GET_LOG: 'git:get-log',
  GIT_GET_CHECKS: 'git:get-checks',

  TERMINAL_CREATE: 'terminal:create',
  TERMINAL_DATA: 'terminal:data',
  TERMINAL_RESIZE: 'terminal:resize',
  TERMINAL_CLOSE: 'terminal:close',
  TERMINAL_OUTPUT: 'terminal:output',
  TERMINAL_EXIT: 'terminal:exit',
  TERMINAL_GET_BUFFER: 'terminal:get-buffer',

  APP_GET_VERSION: 'app:get-version',
  APP_QUIT: 'app:quit',
  APP_OPEN_EXTERNAL: 'app:open-external'
};

// App paths
const APP_DATA_DIR = '.bhunductor';
const CONFIG_FILE = 'config.json';
const DB_FILE = 'workspaces.db';

// UI Constants
const MAX_RECENT_FOLDERS = 5;
const WINDOW_WIDTH = 1400;
const WINDOW_HEIGHT = 900;

// Permission timeout (5 minutes)
const PERMISSION_TIMEOUT_MS = 300000;

// Tools hidden from the chat UI (rename_session variants)
const HIDDEN_TOOLS = [
  'rename_session',
  'mcp__bhunductor__rename_session',
  'mcp__bhunductor-permissions__rename_session'
];

const CLAUDE_MODELS = [
  { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6' },
  { id: 'claude-opus-4-6', label: 'Opus 4.6' },
  { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5' }
];

const DEFAULT_MODEL = 'claude-sonnet-4-6';

module.exports = {
  IPC_CHANNELS,
  APP_DATA_DIR,
  CONFIG_FILE,
  DB_FILE,
  MAX_RECENT_FOLDERS,
  WINDOW_WIDTH,
  WINDOW_HEIGHT,
  PERMISSION_TIMEOUT_MS,
  HIDDEN_TOOLS,
  CLAUDE_MODELS,
  DEFAULT_MODEL
};


/***/ },

/***/ "electron"
/*!***************************!*\
  !*** external "electron" ***!
  \***************************/
(module) {

"use strict";
module.exports = require("electron");

/***/ }

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Check if module exists (development only)
/******/ 		if (__webpack_modules__[moduleId] === undefined) {
/******/ 			var e = new Error("Cannot find module '" + moduleId + "'");
/******/ 			e.code = 'MODULE_NOT_FOUND';
/******/ 			throw e;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		__webpack_modules__[moduleId](module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
// This entry needs to be wrapped in an IIFE because it needs to be isolated against other modules in the chunk.
(() => {
/*!*****************************!*\
  !*** ./renderer/preload.js ***!
  \*****************************/
const { contextBridge, ipcRenderer } = __webpack_require__(/*! electron */ "electron");
const { IPC_CHANNELS } = __webpack_require__(/*! ../shared/constants */ "./shared/constants.js");

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

})();

/******/ })()
;