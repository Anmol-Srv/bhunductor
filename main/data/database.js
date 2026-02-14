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

    CREATE TABLE IF NOT EXISTS claude_sessions (
      id TEXT PRIMARY KEY,
      folder_id TEXT NOT NULL,
      worktree_id TEXT,
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE CASCADE,
      FOREIGN KEY (worktree_id) REFERENCES worktrees(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_claude_sessions_folder
      ON claude_sessions(folder_id);

    CREATE TABLE IF NOT EXISTS migrations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
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
  // Migration 0: Add active_worktree_id column to folders table (schema migration)
  const MIGRATION_ADD_WORKTREE_COLUMN = 'add_active_worktree_id_column';

  if (!hasMigrationRun(MIGRATION_ADD_WORKTREE_COLUMN)) {
    try {
      // Check if column exists
      const tableInfo = db.pragma('table_info(folders)');
      const hasColumn = tableInfo.some(col => col.name === 'active_worktree_id');

      if (!hasColumn) {
        db.exec('ALTER TABLE folders ADD COLUMN active_worktree_id TEXT');
      }

      markMigrationApplied(MIGRATION_ADD_WORKTREE_COLUMN);
    } catch (error) {
      console.error(`[Database] Migration failed: ${MIGRATION_ADD_WORKTREE_COLUMN}`, error);
      // Don't mark as applied if it failed
      return; // Stop further migrations
    }
  }

  // Migration 1: Fix worktree data after main repo detection fix (v2 - with schema fix)
  const MIGRATION_FIX_WORKTREES = 'fix_worktree_main_branch_detection_v2';

  if (!hasMigrationRun(MIGRATION_FIX_WORKTREES)) {
    try {
      const Worktree = require('./models/Worktree');

      // Check if migration is needed (if there are any worktree entries)
      if (Worktree.needsMigration()) {
        const result = Worktree.migrateAllFolders();

        // Only mark as applied if there were no errors
        if (result.errorCount === 0) {
          markMigrationApplied(MIGRATION_FIX_WORKTREES);
        } else {
          console.error(`[Database] Migration had errors, will retry on next startup: ${MIGRATION_FIX_WORKTREES}`);
        }
      } else {
        markMigrationApplied(MIGRATION_FIX_WORKTREES);
      }
    } catch (error) {
      console.error(`[Database] Migration failed: ${MIGRATION_FIX_WORKTREES}`, error);
      // Don't mark as applied if it failed
    }
  }

  // Migration 2: Add claude_session_id column to claude_sessions table
  const MIGRATION_ADD_CLAUDE_SESSION_ID = 'add_claude_session_id_to_claude_sessions';

  if (!hasMigrationRun(MIGRATION_ADD_CLAUDE_SESSION_ID)) {
    try {
      const tableInfo = db.pragma('table_info(claude_sessions)');
      const hasColumn = tableInfo.some(col => col.name === 'claude_session_id');

      if (!hasColumn) {
        db.exec('ALTER TABLE claude_sessions ADD COLUMN claude_session_id TEXT');
      }

      markMigrationApplied(MIGRATION_ADD_CLAUDE_SESSION_ID);
    } catch (error) {
      console.error(`[Database] Migration failed: ${MIGRATION_ADD_CLAUDE_SESSION_ID}`, error);
    }
  }

  // Migration 3: Add messages column to claude_sessions table
  const MIGRATION_ADD_MESSAGES = 'add_messages_to_claude_sessions';

  if (!hasMigrationRun(MIGRATION_ADD_MESSAGES)) {
    try {
      const tableInfo = db.pragma('table_info(claude_sessions)');
      const hasColumn = tableInfo.some(col => col.name === 'messages');

      if (!hasColumn) {
        db.exec('ALTER TABLE claude_sessions ADD COLUMN messages TEXT');
      }

      markMigrationApplied(MIGRATION_ADD_MESSAGES);
    } catch (error) {
      console.error(`[Database] Migration failed: ${MIGRATION_ADD_MESSAGES}`, error);
    }
  }

  // Migration 4: Add source column to claude_sessions table
  const MIGRATION_ADD_SOURCE = 'add_source_to_claude_sessions';

  if (!hasMigrationRun(MIGRATION_ADD_SOURCE)) {
    try {
      const tableInfo = db.pragma('table_info(claude_sessions)');
      const hasColumn = tableInfo.some(col => col.name === 'source');

      if (!hasColumn) {
        db.exec("ALTER TABLE claude_sessions ADD COLUMN source TEXT DEFAULT 'app'");
      }

      markMigrationApplied(MIGRATION_ADD_SOURCE);
    } catch (error) {
      console.error(`[Database] Migration failed: ${MIGRATION_ADD_SOURCE}`, error);
    }
  }

  // Migration 5: Add name column to claude_sessions table
  const MIGRATION_ADD_NAME = 'add_name_to_claude_sessions';

  if (!hasMigrationRun(MIGRATION_ADD_NAME)) {
    try {
      const tableInfo = db.pragma('table_info(claude_sessions)');
      const hasColumn = tableInfo.some(col => col.name === 'name');

      if (!hasColumn) {
        db.exec("ALTER TABLE claude_sessions ADD COLUMN name TEXT DEFAULT 'New Session'");
      }

      markMigrationApplied(MIGRATION_ADD_NAME);
    } catch (error) {
      console.error(`[Database] Migration failed: ${MIGRATION_ADD_NAME}`, error);
    }
  }

  // Migration 6: Add archived column to claude_sessions table
  const MIGRATION_ADD_ARCHIVED = 'add_archived_to_claude_sessions';

  if (!hasMigrationRun(MIGRATION_ADD_ARCHIVED)) {
    try {
      const tableInfo = db.pragma('table_info(claude_sessions)');
      const hasColumn = tableInfo.some(col => col.name === 'archived');

      if (!hasColumn) {
        db.exec('ALTER TABLE claude_sessions ADD COLUMN archived INTEGER DEFAULT 0');
      }

      markMigrationApplied(MIGRATION_ADD_ARCHIVED);
    } catch (error) {
      console.error(`[Database] Migration failed: ${MIGRATION_ADD_ARCHIVED}`, error);
    }
  }

  // Migration 7: Add last_active_at column to claude_sessions table
  const MIGRATION_ADD_LAST_ACTIVE = 'add_last_active_at_to_claude_sessions';

  if (!hasMigrationRun(MIGRATION_ADD_LAST_ACTIVE)) {
    try {
      const tableInfo = db.pragma('table_info(claude_sessions)');
      const hasColumn = tableInfo.some(col => col.name === 'last_active_at');

      if (!hasColumn) {
        db.exec('ALTER TABLE claude_sessions ADD COLUMN last_active_at DATETIME');
        // Backfill from created_at
        db.exec('UPDATE claude_sessions SET last_active_at = created_at WHERE last_active_at IS NULL');
      }

      markMigrationApplied(MIGRATION_ADD_LAST_ACTIVE);
    } catch (error) {
      console.error(`[Database] Migration failed: ${MIGRATION_ADD_LAST_ACTIVE}`, error);
    }
  }

  // Migration 8: Deduplicate archived sessions (keep most recent per claude_session_id per worktree)
  const MIGRATION_DEDUP_ARCHIVED = 'deduplicate_archived_sessions';

  if (!hasMigrationRun(MIGRATION_DEDUP_ARCHIVED)) {
    try {
      // Delete duplicate archived rows, keeping only the most recent per claude_session_id + worktree_id
      db.exec(`
        DELETE FROM claude_sessions
        WHERE rowid NOT IN (
          SELECT rowid FROM (
            SELECT rowid, ROW_NUMBER() OVER (
              PARTITION BY claude_session_id, worktree_id
              ORDER BY COALESCE(last_active_at, created_at) DESC
            ) as rn
            FROM claude_sessions
            WHERE archived = 1 AND claude_session_id IS NOT NULL
          ) WHERE rn = 1
        )
        AND archived = 1
        AND claude_session_id IS NOT NULL
      `);

      // Also set default name on existing sessions that have NULL name
      db.exec("UPDATE claude_sessions SET name = 'New Session' WHERE name IS NULL");

      markMigrationApplied(MIGRATION_DEDUP_ARCHIVED);
    } catch (error) {
      console.error(`[Database] Migration failed: ${MIGRATION_DEDUP_ARCHIVED}`, error);
    }
  }

  // Migration 9: Add model metadata columns to claude_sessions table
  const MIGRATION_ADD_MODEL_METADATA = 'add_model_metadata_to_claude_sessions';

  if (!hasMigrationRun(MIGRATION_ADD_MODEL_METADATA)) {
    try {
      const tableInfo = db.pragma('table_info(claude_sessions)');
      const hasModel = tableInfo.some(col => col.name === 'model');
      const hasModelVersion = tableInfo.some(col => col.name === 'model_version');
      const hasApiVersion = tableInfo.some(col => col.name === 'api_version');
      const hasSystemMetadata = tableInfo.some(col => col.name === 'system_metadata');

      if (!hasModel) {
        db.exec('ALTER TABLE claude_sessions ADD COLUMN model TEXT');
      }
      if (!hasModelVersion) {
        db.exec('ALTER TABLE claude_sessions ADD COLUMN model_version TEXT');
      }
      if (!hasApiVersion) {
        db.exec('ALTER TABLE claude_sessions ADD COLUMN api_version TEXT');
      }
      if (!hasSystemMetadata) {
        db.exec('ALTER TABLE claude_sessions ADD COLUMN system_metadata TEXT');
      }

      markMigrationApplied(MIGRATION_ADD_MODEL_METADATA);
    } catch (error) {
      console.error(`[Database] Migration failed: ${MIGRATION_ADD_MODEL_METADATA}`, error);
    }
  }
}

/**
 * Close database connection
 */
function closeDatabase() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = {
  getDatabase,
  closeDatabase
};
