const Database = require('better-sqlite3');
const { getDBPath, ensureAppDataDir } = require('../utils/paths');

let db = null;

function getDatabase() {
  if (!db) {
    ensureAppDataDir();
    db = new Database(getDBPath());

    db.pragma('foreign_keys = ON');

    initializeSchema();

    runMigrations();

  }
  return db;
}

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

function hasMigrationRun(migrationName) {
  try {
    const result = db.prepare('SELECT id FROM migrations WHERE name = ?').get(migrationName);
    return result !== undefined;
  } catch (error) {
    return false;
  }
}

function markMigrationApplied(migrationName) {
  const { v4: uuidv4 } = require('uuid');
  const id = uuidv4();
  db.prepare('INSERT INTO migrations (id, name) VALUES (?, ?)').run(id, migrationName);
}

function runMigrations() {
  const MIGRATION_ADD_WORKTREE_COLUMN = 'add_active_worktree_id_column';

  if (!hasMigrationRun(MIGRATION_ADD_WORKTREE_COLUMN)) {
    try {
      const tableInfo = db.pragma('table_info(folders)');
      const hasColumn = tableInfo.some(col => col.name === 'active_worktree_id');

      if (!hasColumn) {
        db.exec('ALTER TABLE folders ADD COLUMN active_worktree_id TEXT');
      }

      markMigrationApplied(MIGRATION_ADD_WORKTREE_COLUMN);
    } catch (error) {
      console.error(`[Database] Migration failed: ${MIGRATION_ADD_WORKTREE_COLUMN}`, error);
      return;
    }
  }

  const MIGRATION_FIX_WORKTREES = 'fix_worktree_main_branch_detection_v2';

  if (!hasMigrationRun(MIGRATION_FIX_WORKTREES)) {
    try {
      const Worktree = require('./models/Worktree');

      if (Worktree.needsMigration()) {
        const result = Worktree.migrateAllFolders();

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
    }
  }

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

  const MIGRATION_ADD_LAST_ACTIVE = 'add_last_active_at_to_claude_sessions';

  if (!hasMigrationRun(MIGRATION_ADD_LAST_ACTIVE)) {
    try {
      const tableInfo = db.pragma('table_info(claude_sessions)');
      const hasColumn = tableInfo.some(col => col.name === 'last_active_at');

      if (!hasColumn) {
        db.exec('ALTER TABLE claude_sessions ADD COLUMN last_active_at DATETIME');
        db.exec('UPDATE claude_sessions SET last_active_at = created_at WHERE last_active_at IS NULL');
      }

      markMigrationApplied(MIGRATION_ADD_LAST_ACTIVE);
    } catch (error) {
      console.error(`[Database] Migration failed: ${MIGRATION_ADD_LAST_ACTIVE}`, error);
    }
  }

  const MIGRATION_DEDUP_ARCHIVED = 'deduplicate_archived_sessions';

  if (!hasMigrationRun(MIGRATION_DEDUP_ARCHIVED)) {
    try {
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

      db.exec("UPDATE claude_sessions SET name = 'New Session' WHERE name IS NULL");

      markMigrationApplied(MIGRATION_DEDUP_ARCHIVED);
    } catch (error) {
      console.error(`[Database] Migration failed: ${MIGRATION_DEDUP_ARCHIVED}`, error);
    }
  }

  const MIGRATION_ADD_WORKTREE_STATUS = 'add_status_to_worktrees';

  if (!hasMigrationRun(MIGRATION_ADD_WORKTREE_STATUS)) {
    try {
      const tableInfo = db.pragma('table_info(worktrees)');
      const hasColumn = tableInfo.some(col => col.name === 'status');

      if (!hasColumn) {
        db.exec("ALTER TABLE worktrees ADD COLUMN status TEXT DEFAULT 'active'");
      }

      markMigrationApplied(MIGRATION_ADD_WORKTREE_STATUS);
    } catch (error) {
      console.error(`[Database] Migration failed: ${MIGRATION_ADD_WORKTREE_STATUS}`, error);
    }
  }

  const MIGRATION_RELOCATE_WORKTREES = 'relocate_worktrees_to_app_data';

  if (!hasMigrationRun(MIGRATION_RELOCATE_WORKTREES)) {
    try {
      const path = require('path');
      const fs = require('fs');
      const { execSync } = require('child_process');
      const { getAppDataDir } = require('../utils/paths');

      const appDataDir = getAppDataDir();
      const worktrees = db.prepare(
        "SELECT w.id, w.folder_id, w.branch_name, w.worktree_path, f.path as folder_path FROM worktrees w JOIN folders f ON w.folder_id = f.id WHERE w.is_main = 0 AND w.worktree_path IS NOT NULL"
      ).all();

      let migrated = 0;
      let skipped = 0;

      for (const wt of worktrees) {
        const oldPath = wt.worktree_path;
        const newDir = path.join(appDataDir, 'worktrees', wt.folder_id);
        const newPath = path.join(newDir, wt.branch_name.replace(/\//g, '-'));

        // Already at new location
        if (oldPath.startsWith(appDataDir)) {
          skipped++;
          continue;
        }

        // Ensure destination directory exists
        if (!fs.existsSync(newDir)) {
          fs.mkdirSync(newDir, { recursive: true });
        }

        let moved = false;

        // Only attempt move if old path exists
        if (fs.existsSync(oldPath)) {
          try {
            // Try git worktree move (git >= 2.17)
            execSync(`git worktree move "${oldPath}" "${newPath}"`, {
              cwd: wt.folder_path,
              stdio: 'pipe',
              encoding: 'utf-8',
              timeout: 15000
            });
            moved = true;
          } catch (moveErr) {
            // Fallback: remove old worktree and re-add at new location
            console.warn(`[Database] git worktree move failed for ${wt.branch_name}, using remove+add fallback:`, moveErr.message);
            try {
              execSync(`git worktree remove "${oldPath}" --force`, {
                cwd: wt.folder_path, stdio: 'pipe', timeout: 10000
              });
              execSync(`git worktree add "${newPath}" "${wt.branch_name}"`, {
                cwd: wt.folder_path, stdio: 'pipe', timeout: 15000
              });
              moved = true;
            } catch (fallbackErr) {
              console.error(`[Database] Fallback failed for ${wt.branch_name}:`, fallbackErr.message);
            }
          }
        } else {
          // Old path doesn't exist (orphaned entry) — try to re-create at new location
          try {
            execSync(`git worktree add "${newPath}" "${wt.branch_name}"`, {
              cwd: wt.folder_path, stdio: 'pipe', timeout: 15000
            });
            moved = true;
          } catch (recreateErr) {
            console.warn(`[Database] Could not re-create worktree for ${wt.branch_name}:`, recreateErr.message);
          }
        }

        if (moved) {
          db.prepare('UPDATE worktrees SET worktree_path = ? WHERE id = ?').run(newPath, wt.id);
          migrated++;
        }
      }

      // Clean up empty .bhunductor directories in repos
      const folders = db.prepare('SELECT DISTINCT path FROM folders').all();
      for (const f of folders) {
        const bhunductorDir = path.join(f.path, '.bhunductor');
        if (fs.existsSync(bhunductorDir)) {
          try {
            // Only remove if empty (or contains only empty subdirs)
            fs.rmSync(bhunductorDir, { recursive: true, force: true });
            console.log(`[Database] Cleaned up ${bhunductorDir}`);
          } catch {
            // Directory might have other contents — leave it
          }
        }
      }

      console.log(`[Database] Worktree relocation: ${migrated} migrated, ${skipped} already at target`);
      markMigrationApplied(MIGRATION_RELOCATE_WORKTREES);
    } catch (error) {
      console.error(`[Database] Migration failed: ${MIGRATION_RELOCATE_WORKTREES}`, error);
    }
  }
}

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
