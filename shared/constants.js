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

module.exports = {
  IPC_CHANNELS,
  APP_DATA_DIR,
  CONFIG_FILE,
  DB_FILE,
  MAX_RECENT_FOLDERS,
  WINDOW_WIDTH,
  WINDOW_HEIGHT
};
