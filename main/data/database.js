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

    // Run migrations
    runMigrations();

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
      metadata TEXT,
      active_worktree_id TEXT
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

    CREATE TABLE IF NOT EXISTS worktrees (
      id TEXT PRIMARY KEY,
      folder_id TEXT NOT NULL,
      branch_name TEXT NOT NULL,
      worktree_path TEXT,
      is_main INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_accessed DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE CASCADE,
      UNIQUE(folder_id, branch_name)
    );

    CREATE INDEX IF NOT EXISTS idx_worktrees_folder_id ON worktrees(folder_id);

    CREATE TABLE IF NOT EXISTS migrations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  console.log('[Database] Schema initialized');
}

/**
 * Check if a migration has been applied
 */
function hasMigrationRun(migrationName) {
  try {
    const result = db.prepare('SELECT id FROM migrations WHERE name = ?').get(migrationName);
    return result !== undefined;
  } catch (error) {
    // Migrations table doesn't exist yet
    return false;
  }
}

/**
 * Mark a migration as applied
 */
function markMigrationApplied(migrationName) {
  const { v4: uuidv4 } = require('uuid');
  const id = uuidv4();
  db.prepare('INSERT INTO migrations (id, name) VALUES (?, ?)').run(id, migrationName);
}

/**
 * Run database migrations
 */
function runMigrations() {
  console.log('[Database] Running migrations...');

  // Migration 0: Add active_worktree_id column to folders table (schema migration)
  const MIGRATION_ADD_WORKTREE_COLUMN = 'add_active_worktree_id_column';

  if (!hasMigrationRun(MIGRATION_ADD_WORKTREE_COLUMN)) {
    console.log(`[Database] Running migration: ${MIGRATION_ADD_WORKTREE_COLUMN}`);

    try {
      // Check if column exists
      const tableInfo = db.pragma('table_info(folders)');
      const hasColumn = tableInfo.some(col => col.name === 'active_worktree_id');

      if (!hasColumn) {
        console.log('[Database] Adding active_worktree_id column to folders table...');
        db.exec('ALTER TABLE folders ADD COLUMN active_worktree_id TEXT');
        console.log('[Database] Column added successfully');
      } else {
        console.log('[Database] Column active_worktree_id already exists, skipping');
      }

      markMigrationApplied(MIGRATION_ADD_WORKTREE_COLUMN);
      console.log(`[Database] Migration completed: ${MIGRATION_ADD_WORKTREE_COLUMN}`);
    } catch (error) {
      console.error(`[Database] Migration failed: ${MIGRATION_ADD_WORKTREE_COLUMN}`, error);
      // Don't mark as applied if it failed
      return; // Stop further migrations
    }
  } else {
    console.log(`[Database] Migration already applied: ${MIGRATION_ADD_WORKTREE_COLUMN}`);
  }

  // Migration 1: Fix worktree data after main repo detection fix (v2 - with schema fix)
  const MIGRATION_FIX_WORKTREES = 'fix_worktree_main_branch_detection_v2';

  if (!hasMigrationRun(MIGRATION_FIX_WORKTREES)) {
    console.log(`[Database] Running migration: ${MIGRATION_FIX_WORKTREES}`);

    try {
      const Worktree = require('./models/Worktree');

      // Check if migration is needed (if there are any worktree entries)
      if (Worktree.needsMigration()) {
        console.log('[Database] Existing worktree data found, running cleanup...');
        const result = Worktree.migrateAllFolders();
        console.log(`[Database] Migration result: ${result.migratedCount} folders fixed, ${result.errorCount} errors`);

        // Only mark as applied if there were no errors
        if (result.errorCount === 0) {
          markMigrationApplied(MIGRATION_FIX_WORKTREES);
          console.log(`[Database] Migration completed successfully: ${MIGRATION_FIX_WORKTREES}`);
        } else {
          console.error(`[Database] Migration had errors, will retry on next startup: ${MIGRATION_FIX_WORKTREES}`);
        }
      } else {
        console.log('[Database] No worktree data found, skipping migration');
        markMigrationApplied(MIGRATION_FIX_WORKTREES);
        console.log(`[Database] Migration completed: ${MIGRATION_FIX_WORKTREES}`);
      }
    } catch (error) {
      console.error(`[Database] Migration failed: ${MIGRATION_FIX_WORKTREES}`, error);
      // Don't mark as applied if it failed
    }
  } else {
    console.log(`[Database] Migration already applied: ${MIGRATION_FIX_WORKTREES}`);
  }

  console.log('[Database] Migrations complete');
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
