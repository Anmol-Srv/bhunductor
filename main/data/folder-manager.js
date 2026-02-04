const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const { getDBPath, ensureAppDataDir } = require('../utils/paths');
const { MAX_RECENT_FOLDERS } = require('../../shared/constants');

class FolderManager {
  constructor() {
    ensureAppDataDir();
    this.db = new Database(getDBPath());
    this.initDB();
    this.cleanupInvalidFolders();
  }

  /**
   * Initialize database schema
   */
  initDB() {
    this.db.exec(`
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
    console.log('[FolderManager] Database initialized');
  }

  /**
   * Validate if path is a git repository
   */
  isGitRepo(folderPath) {
    try {
      if (!fs.existsSync(folderPath)) {
        return false;
      }

      const gitDir = path.join(folderPath, '.git');
      if (fs.existsSync(gitDir)) {
        return true;
      }

      // Check if it's inside a git repo
      execSync('git rev-parse --is-inside-work-tree', {
        cwd: folderPath,
        stdio: 'pipe'
      });
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Add or update folder
   */
  addFolder(folderPath) {
    if (!this.isGitRepo(folderPath)) {
      throw new Error('Path is not a git repository');
    }

    const name = path.basename(folderPath);
    const id = uuidv4();

    try {
      // Try to insert new folder
      const insertStmt = this.db.prepare(`
        INSERT INTO folders (id, path, name, last_opened)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      `);

      try {
        insertStmt.run(id, folderPath, name);
        console.log(`[FolderManager] Added new folder: ${folderPath}`);
        return this.getFolderByPath(folderPath);
      } catch (error) {
        // If path already exists (UNIQUE constraint), update last_opened
        if (error.message.includes('UNIQUE')) {
          const updateStmt = this.db.prepare(`
            UPDATE folders
            SET last_opened = CURRENT_TIMESTAMP
            WHERE path = ?
          `);
          updateStmt.run(folderPath);
          console.log(`[FolderManager] Updated last_opened for: ${folderPath}`);
          return this.getFolderByPath(folderPath);
        }
        throw error;
      }
    } catch (error) {
      console.error('[FolderManager] Error adding folder:', error);
      throw error;
    }
  }

  /**
   * Get recent folders (max 5)
   */
  getRecentFolders() {
    const stmt = this.db.prepare(`
      SELECT * FROM folders
      ORDER BY last_opened DESC
      LIMIT ?
    `);
    return stmt.all(MAX_RECENT_FOLDERS);
  }

  /**
   * Get folder by path
   */
  getFolderByPath(folderPath) {
    const stmt = this.db.prepare('SELECT * FROM folders WHERE path = ?');
    return stmt.get(folderPath);
  }

  /**
   * Get folder by ID
   */
  getFolderById(folderId) {
    const stmt = this.db.prepare('SELECT * FROM folders WHERE id = ?');
    return stmt.get(folderId);
  }

  /**
   * Remove folder by ID
   */
  removeFolder(folderId) {
    const stmt = this.db.prepare('DELETE FROM folders WHERE id = ?');
    const result = stmt.run(folderId);
    console.log(`[FolderManager] Removed folder: ${folderId}`);
    return result.changes > 0;
  }

  /**
   * Clean up folders with invalid paths
   * Auto-removes on startup
   */
  cleanupInvalidFolders() {
    const allFolders = this.db.prepare('SELECT * FROM folders').all();
    let removedCount = 0;

    for (const folder of allFolders) {
      if (!fs.existsSync(folder.path) || !this.isGitRepo(folder.path)) {
        this.removeFolder(folder.id);
        removedCount++;
        console.log(`[FolderManager] Removed invalid folder: ${folder.path}`);
      }
    }

    if (removedCount > 0) {
      console.log(`[FolderManager] Cleaned up ${removedCount} invalid folders`);
    }
  }

  /**
   * Close database connection
   */
  close() {
    this.db.close();
  }
}

module.exports = FolderManager;
