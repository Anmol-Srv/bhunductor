const path = require('path');
const fs = require('fs');
const os = require('os');
const { APP_DATA_DIR, CONFIG_FILE, DB_FILE } = require('../../shared/constants');

/**
 * Get the application data directory path
 * @returns {string} Path to ~/.bhunductor
 */
function getAppDataDir() {
  return path.join(os.homedir(), APP_DATA_DIR);
}

/**
 * Get the config file path
 * @returns {string} Path to ~/.bhunductor/config.json
 */
function getConfigPath() {
  return path.join(getAppDataDir(), CONFIG_FILE);
}

/**
 * Get the database file path
 * @returns {string} Path to ~/.bhunductor/workspaces.db
 */
function getDBPath() {
  return path.join(getAppDataDir(), DB_FILE);
}

/**
 * Ensure app data directory exists
 */
function ensureAppDataDir() {
  const dataDir = getAppDataDir();
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
    console.log(`[Paths] Created app data directory: ${dataDir}`);
  }
}

module.exports = {
  getAppDataDir,
  getConfigPath,
  getDBPath,
  ensureAppDataDir
};
