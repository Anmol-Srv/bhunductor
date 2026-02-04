// IPC Channel definitions
const IPC_CHANNELS = {
  CONFIG_GET: 'config:get',
  CONFIG_SET: 'config:set',

  FOLDER_OPEN_DIALOG: 'folder:open-dialog',
  FOLDER_GET_RECENT: 'folder:get-recent',
  FOLDER_ADD: 'folder:add',
  FOLDER_REMOVE: 'folder:remove',
  FOLDER_VALIDATE_GIT: 'folder:validate-git',

  APP_GET_VERSION: 'app:get-version',
  APP_QUIT: 'app:quit'
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
