const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const { getDatabase } = require('../database');
const { MAX_RECENT_FOLDERS } = require('../../../shared/constants');
class Folder {
  static isGitRepo(folderPath) {
    try {
      if (!fs.existsSync(folderPath)) {
        return false;
      }

      const gitDir = path.join(folderPath, '.git');
      if (fs.existsSync(gitDir)) {
        return true;
      }

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
   * Get the main repository path (not a worktree)
   * If folderPath is a worktree, returns the main repo path
   * Otherwise returns the folderPath as-is
   */
  static getMainRepoPath(folderPath) {
    try {
      // Get the git common directory (points to main repo's .git)
      const gitCommonDir = execSync('git rev-parse --git-common-dir', {
        cwd: folderPath,
        stdio: 'pipe',
        encoding: 'utf-8'
      }).trim();

      // Get the absolute path
      const absoluteGitDir = path.isAbsolute(gitCommonDir)
        ? gitCommonDir
        : path.resolve(folderPath, gitCommonDir);

      // The main repo path is the parent of the .git directory
      const mainRepoPath = path.dirname(absoluteGitDir);

      console.log(`[Folder] Main repo path for ${folderPath}: ${mainRepoPath}`);
      return mainRepoPath;
    } catch (error) {
      console.error('[Folder] Error detecting main repo path:', error);
      // If we can't determine, return the original path
      return folderPath;
    }
  }

  static create(folderPath) {
    if (!this.isGitRepo(folderPath)) {
      throw new Error('Path is not a git repository');
    }

    // Check if this is a worktree and get the main repo path
    const actualPath = this.getMainRepoPath(folderPath);

    const db = getDatabase();
    const name = path.basename(actualPath);
    const id = uuidv4();

    try {
      const stmt = db.prepare(`
        INSERT INTO folders (id, path, name, last_opened)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      `);

      stmt.run(id, actualPath, name);
      console.log(`[Folder] Created: ${actualPath}`);

      return this.findByPath(actualPath);
    } catch (error) {
      console.error('[Folder] Error creating:', error);
      throw error;
    }
  }

  static updateLastOpened(folderPath) {
    const db = getDatabase();

    try {
      const stmt = db.prepare(`
        UPDATE folders
        SET last_opened = CURRENT_TIMESTAMP
        WHERE path = ?
      `);

      const result = stmt.run(folderPath);
      console.log(`[Folder] Updated last_opened: ${folderPath}`);

      return result.changes > 0;
    } catch (error) {
      console.error('[Folder] Error updating last_opened:', error);
      throw error;
    }
  }

  static addOrUpdate(folderPath) {
    if (!this.isGitRepo(folderPath)) {
      throw new Error('Path is not a git repository');
    }

    // Always use the main repo path, not a worktree path
    const actualPath = this.getMainRepoPath(folderPath);

    const existing = this.findByPath(actualPath);

    if (existing) {
      this.updateLastOpened(actualPath);
      return this.findByPath(actualPath);
    } else {
      return this.create(actualPath);
    }
  }

  static findById(folderId) {
    const db = getDatabase();
    const stmt = db.prepare('SELECT * FROM folders WHERE id = ?');
    return stmt.get(folderId);
  }

  static findByPath(folderPath) {
    const db = getDatabase();
    const stmt = db.prepare('SELECT * FROM folders WHERE path = ?');
    return stmt.get(folderPath);
  }

  static findAll() {
    const db = getDatabase();
    const stmt = db.prepare('SELECT * FROM folders ORDER BY last_opened DESC');
    return stmt.all();
  }

  static findRecent(limit = MAX_RECENT_FOLDERS) {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT * FROM folders
      ORDER BY last_opened DESC
      LIMIT ?
    `);
    return stmt.all(limit);
  }

  static delete(folderId) {
    const db = getDatabase();
    const stmt = db.prepare('DELETE FROM folders WHERE id = ?');
    const result = stmt.run(folderId);

    if (result.changes > 0) {
      console.log(`[Folder] Deleted: ${folderId}`);
      return true;
    }

    return false;
  }

  static deleteByPath(folderPath) {
    const db = getDatabase();
    const stmt = db.prepare('DELETE FROM folders WHERE path = ?');
    const result = stmt.run(folderPath);

    if (result.changes > 0) {
      console.log(`[Folder] Deleted by path: ${folderPath}`);
      return true;
    }

    return false;
  }

  static cleanupInvalid() {
    const allFolders = this.findAll();
    let removedCount = 0;

    for (const folder of allFolders) {
      if (!fs.existsSync(folder.path) || !this.isGitRepo(folder.path)) {
        this.delete(folder.id);
        removedCount++;
        console.log(`[Folder] Cleaned up invalid: ${folder.path}`);
      }
    }

    if (removedCount > 0) {
      console.log(`[Folder] Cleanup complete: removed ${removedCount} invalid folders`);
    }

    return removedCount;
  }

  static count() {
    const db = getDatabase();
    const stmt = db.prepare('SELECT COUNT(*) as count FROM folders');
    const result = stmt.get();
    return result.count;
  }

  static exists(folderPath) {
    return this.findByPath(folderPath) !== undefined;
  }

  static updateMetadata(folderId, metadata) {
    const db = getDatabase();
    const stmt = db.prepare(`
      UPDATE folders
      SET metadata = ?
      WHERE id = ?
    `);

    const metadataJson = JSON.stringify(metadata);
    const result = stmt.run(metadataJson, folderId);

    return result.changes > 0;
  }

  static getMetadata(folderId) {
    const folder = this.findById(folderId);
    if (!folder || !folder.metadata) {
      return null;
    }

    try {
      return JSON.parse(folder.metadata);
    } catch (error) {
      console.error('[Folder] Error parsing metadata:', error);
      return null;
    }
  }

  static updateActiveWorktree(folderId, worktreeId) {
    const db = getDatabase();
    const stmt = db.prepare('UPDATE folders SET active_worktree_id = ? WHERE id = ?');
    const result = stmt.run(worktreeId, folderId);
    return result.changes > 0;
  }
}

module.exports = Folder;
