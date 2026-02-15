const path = require('path');
const fs = require('fs');
const os = require('os');
const { APP_DATA_DIR, CONFIG_FILE, DB_FILE } = require('../../shared/constants');

function getAppDataDir() {
  return path.join(os.homedir(), APP_DATA_DIR);
}

function getConfigPath() {
  return path.join(getAppDataDir(), CONFIG_FILE);
}

function getDBPath() {
  return path.join(getAppDataDir(), DB_FILE);
}

function ensureAppDataDir() {
  const dataDir = getAppDataDir();
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

module.exports = {
  getAppDataDir,
  getConfigPath,
  getDBPath,
  ensureAppDataDir
};
