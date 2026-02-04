const Database = require('better-sqlite3');
const { getDBPath, ensureAppDataDir } = require('../utils/paths');

let db = null;

/**
 * Get database connection (singleton)
 */
function getDatabase() {
  if (!db) {
    ensureAppDataDir();
    db = new Database(getDBPath());

    // Enable foreign keys
    db.pragma('foreign_keys = ON');

    // Initialize schema
    initializeSchema();

    console.log('[Database] Connection established');
  }
  return db;
}

/**
 * Initialize database schema
 */
function initializeSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS folders (
      id TEXT PRIMARY KEY,
      path TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      last_opened DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      metadata TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_folders_last_opened
      ON folders(last_opened DESC);

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      folder_id TEXT NOT NULL,
      session_data TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE CASCADE
    );
  `);

  console.log('[Database] Schema initialized');
}

/**
 * Close database connection
 */
function closeDatabase() {
  if (db) {
    db.close();
    db = null;
    console.log('[Database] Connection closed');
  }
}

module.exports = {
  getDatabase,
  closeDatabase
};
