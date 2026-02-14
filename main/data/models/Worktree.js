const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const { getDatabase } = require('../database');

class Worktree {
  /**
   * Check if a path is the main repository (not a worktree)
   * Returns { isMain: boolean, mainPath: string }
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

      // Check if we're in the main repo or a worktree
      const isMain = path.resolve(folderPath) === path.resolve(mainRepoPath);

      return {
        isMain,
        mainPath: mainRepoPath
      };
    } catch (error) {
      console.error('[Worktree] Error detecting main repo path:', error);
      // If we can't determine, assume it's the main repo
      return {
        isMain: true,
        mainPath: folderPath
      };
    }
  }

  /**
   * Detect the default branch (main or master)
   * This should return the actual default branch of the repo, not what's currently checked out
   */
  static detectDefaultBranch(folderPath) {
    // Strategy 1: Check remote HEAD (most reliable)
    try {
      const output = execSync('git symbolic-ref refs/remotes/origin/HEAD', {
        cwd: folderPath,
        stdio: 'pipe',
        encoding: 'utf-8'
      }).trim();

      // Extract branch name from refs/remotes/origin/main
      const match = output.match(/refs\/remotes\/origin\/(.+)/);
      if (match && match[1]) {
        return match[1];
      }
    } catch (error) {
      // Remote HEAD not set, continue to next strategy
    }

    // Strategy 2: Check if main or master branch exists locally
    try {
      execSync('git rev-parse --verify main', {
        cwd: folderPath,
        stdio: 'pipe'
      });
      return 'main';
    } catch (e) {
      try {
        execSync('git rev-parse --verify master', {
          cwd: folderPath,
          stdio: 'pipe'
        });
        return 'master';
      } catch (e2) {
        // Neither main nor master exists
      }
    }

    // Strategy 3: Check remote branches
    try {
      const remoteBranches = execSync('git branch -r', {
        cwd: folderPath,
        stdio: 'pipe',
        encoding: 'utf-8'
      }).trim();

      if (remoteBranches.includes('origin/main')) {
        return 'main';
      } else if (remoteBranches.includes('origin/master')) {
        return 'master';
      }
    } catch (error) {
      // Remote branches not available
    }

    // Strategy 4: Get the first branch in the repo
    try {
      const firstBranch = execSync('git branch --format="%(refname:short)" | head -n 1', {
        cwd: folderPath,
        stdio: 'pipe',
        encoding: 'utf-8',
        shell: '/bin/bash'
      }).trim();

      if (firstBranch) {
        return firstBranch;
      }
    } catch (error) {
      // Can't get any branches
    }

    // Last resort: default to 'main'
    return 'main';
  }

  /**
   * Validate branch name according to git rules
   */
  static validateBranchName(branchName) {
    if (!branchName || typeof branchName !== 'string') {
      return { valid: false, error: 'Branch name is required' };
    }

    if (branchName.length < 1 || branchName.length > 255) {
      return { valid: false, error: 'Branch name must be between 1 and 255 characters' };
    }

    // Check for valid characters
    if (!/^[a-zA-Z0-9._\/-]+$/.test(branchName)) {
      return { valid: false, error: 'Branch name can only contain letters, numbers, dots, hyphens, underscores, and slashes' };
    }

    // Check for invalid patterns
    if (branchName.startsWith('.')) {
      return { valid: false, error: 'Branch name cannot start with a dot' };
    }

    if (branchName.endsWith('.lock')) {
      return { valid: false, error: 'Branch name cannot end with .lock' };
    }

    if (branchName.includes('..')) {
      return { valid: false, error: 'Branch name cannot contain ..' };
    }

    if (branchName.includes(' ')) {
      return { valid: false, error: 'Branch name cannot contain spaces' };
    }

    return { valid: true };
  }

  /**
   * Get the worktrees directory path
   */
  static getWorktreesDir(folderPath) {
    const worktreesDir = path.join(folderPath, '.bhunductor', 'worktrees');

    // Create if not exists
    if (!fs.existsSync(worktreesDir)) {
      fs.mkdirSync(worktreesDir, { recursive: true });
    }

    return worktreesDir;
  }

  /**
   * Run a git command safely
   */
  static runGitCommand(folderPath, command) {
    try {
      const output = execSync(command, {
        cwd: folderPath,
        stdio: 'pipe',
        encoding: 'utf-8'
      });

      return { success: true, output: output.trim() };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        stderr: error.stderr ? error.stderr.toString() : ''
      };
    }
  }

  /**
   * Initialize main branch worktree entry
   */
  static initializeMainBranch(folderId, folderPath) {
    const db = getDatabase();

    // Check if we're in a worktree or main repo
    const repoInfo = this.getMainRepoPath(folderPath);

    if (!repoInfo.isMain) {
      console.warn(`[Worktree] Provided path is a worktree, using main repo: ${repoInfo.mainPath}`);
      // Update the folder path in the database to point to main repo
      const Folder = require('./Folder');
      const folder = Folder.findById(folderId);
      if (folder && folder.path !== repoInfo.mainPath) {
        // We should use the main path for operations
        folderPath = repoInfo.mainPath;
      }
    }

    // Check if main branch already exists
    const existing = db.prepare(
      'SELECT * FROM worktrees WHERE folder_id = ? AND is_main = 1'
    ).get(folderId);

    if (existing) {
      return existing;
    }

    // Detect the default branch
    const branchName = this.detectDefaultBranch(folderPath);
    const id = uuidv4();

    try {
      const stmt = db.prepare(`
        INSERT INTO worktrees (id, folder_id, branch_name, worktree_path, is_main, created_at, last_accessed)
        VALUES (?, ?, ?, NULL, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `);

      stmt.run(id, folderId, branchName);

      // Set as active worktree
      const Folder = require('./Folder');
      Folder.updateActiveWorktree(folderId, id);

      return this.findById(id);
    } catch (error) {
      console.error('[Worktree] Error initializing main branch:', error);
      throw error;
    }
  }

  /**
   * Create a new worktree
   */
  static createWorktree(folderId, folderPath, branchName) {
    // Ensure we're using the main repo path
    const repoInfo = this.getMainRepoPath(folderPath);
    const mainRepoPath = repoInfo.mainPath;

    // Validate branch name
    const validation = this.validateBranchName(branchName);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    const db = getDatabase();

    // Check for duplicates
    const existing = db.prepare(
      'SELECT * FROM worktrees WHERE folder_id = ? AND branch_name = ?'
    ).get(folderId, branchName);

    if (existing) {
      throw new Error(`Branch ${branchName} already exists`);
    }

    // Generate worktree path (relative to main repo)
    const worktreesDir = this.getWorktreesDir(mainRepoPath);
    const worktreePath = path.join(worktreesDir, branchName.replace(/\//g, '-'));

    // Check if path already exists
    if (fs.existsSync(worktreePath)) {
      throw new Error(`Worktree directory already exists: ${worktreePath}`);
    }

    const id = uuidv4();

    try {
      // Create git worktree (use main repo path for git commands)
      const result = this.runGitCommand(
        mainRepoPath,
        `git worktree add "${worktreePath}" -b ${branchName}`
      );

      if (!result.success) {
        throw new Error(`Failed to create git worktree: ${result.error || result.stderr}`);
      }

      // Insert into database
      try {
        const stmt = db.prepare(`
          INSERT INTO worktrees (id, folder_id, branch_name, worktree_path, is_main, created_at, last_accessed)
          VALUES (?, ?, ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `);

        stmt.run(id, folderId, branchName, worktreePath);

        return this.findById(id);
      } catch (dbError) {
        // Rollback: remove the git worktree
        console.error('[Worktree] Database error, rolling back git worktree');
        this.runGitCommand(mainRepoPath, `git worktree remove "${worktreePath}" --force`);
        throw dbError;
      }
    } catch (error) {
      console.error('[Worktree] Error creating worktree:', error);

      // Clean up directory if it was created
      if (fs.existsSync(worktreePath)) {
        try {
          fs.rmSync(worktreePath, { recursive: true, force: true });
        } catch (cleanupError) {
          console.error('[Worktree] Error cleaning up directory:', cleanupError);
        }
      }

      throw error;
    }
  }

  /**
   * List all worktrees for a folder
   */
  static listWorktrees(folderId) {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT * FROM worktrees
      WHERE folder_id = ?
      ORDER BY is_main DESC, created_at ASC
    `);

    return stmt.all(folderId);
  }

  /**
   * Delete a worktree
   */
  static deleteWorktree(worktreeId) {
    const db = getDatabase();

    // Get worktree info
    const worktree = this.findById(worktreeId);

    if (!worktree) {
      throw new Error('Worktree not found');
    }

    if (worktree.is_main === 1) {
      throw new Error('Cannot delete the main branch');
    }

    // Get folder to run git command
    const Folder = require('./Folder');
    const folder = Folder.findById(worktree.folder_id);

    if (!folder) {
      throw new Error('Folder not found');
    }

    try {
      // Remove git worktree
      if (worktree.worktree_path && fs.existsSync(worktree.worktree_path)) {
        const result = this.runGitCommand(
          folder.path,
          `git worktree remove "${worktree.worktree_path}" --force`
        );

        if (!result.success) {
          console.warn('[Worktree] Git worktree remove failed, continuing with cleanup');
        }
      }

      // Delete from database
      const stmt = db.prepare('DELETE FROM worktrees WHERE id = ?');
      stmt.run(worktreeId);

      // Clean up directory if still exists
      if (worktree.worktree_path && fs.existsSync(worktree.worktree_path)) {
        try {
          fs.rmSync(worktree.worktree_path, { recursive: true, force: true });
        } catch (cleanupError) {
          console.error('[Worktree] Error cleaning up directory:', cleanupError);
        }
      }

      return { success: true };
    } catch (error) {
      console.error('[Worktree] Error deleting worktree:', error);
      throw error;
    }
  }

  /**
   * Find worktree by ID
   */
  static findById(worktreeId) {
    const db = getDatabase();
    const stmt = db.prepare('SELECT * FROM worktrees WHERE id = ?');
    return stmt.get(worktreeId);
  }

  /**
   * Find worktree by folder and branch name
   */
  static findByFolderAndBranch(folderId, branchName) {
    const db = getDatabase();
    const stmt = db.prepare('SELECT * FROM worktrees WHERE folder_id = ? AND branch_name = ?');
    return stmt.get(folderId, branchName);
  }

  /**
   * Update last accessed timestamp
   */
  static updateLastAccessed(worktreeId) {
    const db = getDatabase();
    const stmt = db.prepare('UPDATE worktrees SET last_accessed = CURRENT_TIMESTAMP WHERE id = ?');
    const result = stmt.run(worktreeId);
    return result.changes > 0;
  }

  /**
   * Get the active path for a worktree
   */
  static getActivePath(worktree, folder) {
    if (worktree.is_main === 1) {
      return folder.path;
    }
    return worktree.worktree_path;
  }

  /**
   * Set active worktree for a folder
   */
  static setActiveWorktree(folderId, worktreeId) {
    const Folder = require('./Folder');

    // Update folder's active worktree
    Folder.updateActiveWorktree(folderId, worktreeId);

    // Update worktree's last accessed
    this.updateLastAccessed(worktreeId);

  }

  /**
   * Clean up and re-initialize worktrees for a folder
   * This removes all existing worktree entries and re-creates the main branch entry
   */
  static cleanupAndReinitialize(folderId, folderPath) {
    const db = getDatabase();

    try {

      // Get main repo path in case folderPath is a worktree
      const repoInfo = this.getMainRepoPath(folderPath);
      const mainRepoPath = repoInfo.mainPath;

      // Delete all existing worktree entries for this folder
      const deleteStmt = db.prepare('DELETE FROM worktrees WHERE folder_id = ?');
      const result = deleteStmt.run(folderId);

      // Re-initialize the main branch
      const mainWorktree = this.initializeMainBranch(folderId, mainRepoPath);

      return { success: true, mainWorktree };
    } catch (error) {
      console.error('[Worktree] Error during cleanup:', error);
      throw error;
    }
  }

  /**
   * Migrate all folders to fix incorrect worktree data
   * This should be called once to clean up data from before the fix
   */
  static migrateAllFolders() {
    const Folder = require('./Folder');
    const db = getDatabase();

    try {
      const folders = Folder.findAll();
      let migratedCount = 0;
      let errorCount = 0;

      for (const folder of folders) {
        try {
          // Check if folder still exists and is a valid git repo
          if (!fs.existsSync(folder.path) || !Folder.isGitRepo(folder.path)) {
            continue;
          }

          // Get the main repo path
          const mainRepoPath = Folder.getMainRepoPath(folder.path);

          // Update folder path if it was pointing to a worktree
          if (mainRepoPath !== folder.path) {
            const updateStmt = db.prepare('UPDATE folders SET path = ? WHERE id = ?');
            updateStmt.run(mainRepoPath, folder.id);
          }

          // Clean up and re-initialize worktrees
          this.cleanupAndReinitialize(folder.id, mainRepoPath);
          migratedCount++;
        } catch (error) {
          console.error(`[Worktree] Error migrating folder ${folder.id}:`, error);
          errorCount++;
        }
      }

      return { success: true, migratedCount, errorCount };
    } catch (error) {
      console.error('[Worktree] Migration failed:', error);
      throw error;
    }
  }

  /**
   * Check if migration is needed
   * Returns true if there are folders with worktree entries that might need migration
   */
  static needsMigration() {
    const db = getDatabase();

    try {
      // Check if there are any folders with worktree entries
      const result = db.prepare(`
        SELECT COUNT(DISTINCT folder_id) as count
        FROM worktrees
      `).get();

      return result.count > 0;
    } catch (error) {
      console.error('[Worktree] Error checking migration status:', error);
      return false;
    }
  }
}

module.exports = Worktree;
