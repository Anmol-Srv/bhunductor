const fs = require('fs');
const { getConfigPath, ensureAppDataDir } = require('../utils/paths');

const DEFAULT_CONFIG = {
  version: '1.0.0',
  theme: 'dark',
  window: {
    width: 1400,
    height: 900
  },
  sidebar: {
    collapsed: false,
    width: 250
  }
};

class ConfigManager {
  constructor() {
    ensureAppDataDir();
    this.configPath = getConfigPath();
    this.config = null;
    this.load();
  }

  /**
   * Load config from disk or create default
   */
  load() {
    try {
      if (fs.existsSync(this.configPath)) {
        const data = fs.readFileSync(this.configPath, 'utf8');
        this.config = { ...DEFAULT_CONFIG, ...JSON.parse(data) };
      } else {
        this.config = DEFAULT_CONFIG;
        this.save();
      }
    } catch (error) {
      console.error('[Config] Error loading config:', error);
      this.config = DEFAULT_CONFIG;
    }
  }

  /**
   * Save config to disk
   */
  save() {
    try {
      fs.writeFileSync(
        this.configPath,
        JSON.stringify(this.config, null, 2),
        'utf8'
      );
    } catch (error) {
      console.error('[Config] Error saving config:', error);
    }
  }

  /**
   * Get entire config
   */
  getAll() {
    return this.config;
  }

  /**
   * Get config value by key (supports dot notation)
   */
  get(key) {
    const keys = key.split('.');
    let value = this.config;
    for (const k of keys) {
      value = value?.[k];
    }
    return value;
  }

  /**
   * Set config value by key (supports dot notation)
   */
  set(key, value) {
    const keys = key.split('.');
    const lastKey = keys.pop();
    let target = this.config;

    for (const k of keys) {
      if (!target[k]) target[k] = {};
      target = target[k];
    }

    target[lastKey] = value;
    this.save();
  }
}

module.exports = ConfigManager;
