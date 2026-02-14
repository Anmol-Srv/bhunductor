const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

class File {
  /**
   * Get file tree for a worktree path
   * @param {string} worktreePath - absolute path to worktree root
   * @param {Array<string>} excludePatterns - patterns to exclude (default: ['.git', 'node_modules', '.bhunductor'])
   * @returns {Object} { success: boolean, tree: Array, error?: string }
   */
  static getFileTree(worktreePath, excludePatterns = ['.git', 'node_modules', '.bhunductor']) {
    try {
      if (!fs.existsSync(worktreePath)) {
        return { success: false, error: `Path not found: ${worktreePath}` };
      }

      const tree = this._buildTree(worktreePath, '', 0, 5, excludePatterns);
      return { success: true, tree };
    } catch (error) {
      console.error('[File] Error reading file tree:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Recursively build file tree structure
   * @private
   */
  static _buildTree(dirPath, relativePath, depth, maxDepth, exclude) {
    if (depth > maxDepth) {
      return [{ name: '...', type: 'truncated', path: relativePath }];
    }

    try {
      const entries = fs.readdirSync(dirPath);
      const children = [];

      for (const entry of entries) {
        // Skip excluded patterns
        if (exclude.includes(entry)) continue;

        const fullPath = path.join(dirPath, entry);
        const entryRelativePath = path.join(relativePath, entry);

        let stat;
        try {
          stat = fs.statSync(fullPath);
        } catch (err) {
          // Skip files we can't stat (permissions, symlinks, etc.)
          console.warn(`[File] Could not stat ${fullPath}:`, err.message);
          continue;
        }

        const node = {
          name: entry,
          path: fullPath,
          relativePath: entryRelativePath,
          isDirectory: stat.isDirectory(),
          size: stat.size,
          modified: stat.mtime
        };

        if (stat.isDirectory()) {
          node.children = this._buildTree(fullPath, entryRelativePath, depth + 1, maxDepth, exclude);
        }

        children.push(node);
      }

      // Sort: directories first, then files, alphabetically within each group
      children.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
      });

      return children;
    } catch (error) {
      console.error(`[File] Error reading directory ${dirPath}:`, error);
      return [];
    }
  }

  /**
   * Read file content
   * @param {string} filePath - absolute file path
   * @returns {Object} { success: boolean, content?: string, encoding?: string, error?: string }
   */
  static readContent(filePath) {
    try {
      if (!fs.existsSync(filePath)) {
        return { success: false, error: 'File not found' };
      }

      const stat = fs.statSync(filePath);
      if (!stat.isFile()) {
        return { success: false, error: 'Path is not a file' };
      }

      // Check file size - don't read files larger than 5MB
      const maxSize = 5 * 1024 * 1024; // 5MB
      if (stat.size > maxSize) {
        return {
          success: false,
          error: `File too large (${(stat.size / 1024 / 1024).toFixed(2)}MB). Maximum size is 5MB.`
        };
      }

      // Try to read as UTF-8 text
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        return { success: true, content, encoding: 'utf-8' };
      } catch (err) {
        // If UTF-8 fails, try binary
        const content = fs.readFileSync(filePath);
        return {
          success: false,
          error: 'File appears to be binary and cannot be displayed as text',
          isBinary: true
        };
      }
    } catch (error) {
      console.error('[File] Error reading file content:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get git diff for a file
   * @param {string} worktreePath - worktree root path
   * @param {string} relativePath - file path relative to worktree
   * @returns {Object} { success: boolean, diff?: string, oldContent?: string, newContent?: string, changeType?: string, error?: string }
   */
  static getGitDiff(worktreePath, relativePath) {
    try {
      // Get git status for this file first
      const statusResult = execSync(`git status --porcelain -- "${relativePath}"`, {
        cwd: worktreePath,
        stdio: 'pipe',
        encoding: 'utf-8'
      }).trim();

      if (!statusResult) {
        return { success: false, error: 'File has no changes' };
      }

      // Parse status code
      const statusCode = statusResult.substring(0, 2);
      let changeType = 'modified';

      if (statusCode.includes('A')) changeType = 'added';
      else if (statusCode.includes('D')) changeType = 'deleted';
      else if (statusCode.includes('M')) changeType = 'modified';
      else if (statusCode.includes('??')) changeType = 'untracked';

      // Get unified diff
      let diff = '';
      try {
        diff = execSync(`git diff HEAD -- "${relativePath}"`, {
          cwd: worktreePath,
          stdio: 'pipe',
          encoding: 'utf-8'
        });

        // For untracked files, diff won't work, so create a pseudo-diff
        if (changeType === 'untracked' || changeType === 'added') {
          const fullPath = path.join(worktreePath, relativePath);
          const newContent = fs.readFileSync(fullPath, 'utf-8');

          return {
            success: true,
            diff: diff || null,
            oldContent: '',
            newContent,
            changeType,
            isNewFile: true
          };
        }
      } catch (diffError) {
        // If diff fails, try to get old and new content separately
        console.warn('[File] git diff failed, attempting to get contents separately:', diffError.message);
      }

      // Get old version (HEAD)
      let oldContent = '';
      try {
        oldContent = execSync(`git show HEAD:"${relativePath}"`, {
          cwd: worktreePath,
          stdio: 'pipe',
          encoding: 'utf-8'
        });
      } catch (err) {
        // File might not exist in HEAD (new file)
        oldContent = '';
      }

      // Get new version (working directory)
      const fullPath = path.join(worktreePath, relativePath);
      let newContent = '';
      if (fs.existsSync(fullPath) && changeType !== 'deleted') {
        newContent = fs.readFileSync(fullPath, 'utf-8');
      }

      return {
        success: true,
        diff,
        oldContent,
        newContent,
        changeType
      };
    } catch (error) {
      console.error('[File] Error getting git diff:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get git status for all files in worktree
   * @param {string} worktreePath - worktree root path
   * @returns {Object} { success: boolean, files?: Array<{path: string, status: string, additions?: number, deletions?: number}>, error?: string }
   */
  static getGitStatus(worktreePath) {
    try {
      const output = execSync('git status --porcelain', {
        cwd: worktreePath,
        stdio: 'pipe',
        encoding: 'utf-8'
      }).trim();

      if (!output) {
        return { success: true, files: [] };
      }

      const files = output.split('\n').map(line => {
        // Parse porcelain format: "XY filename" where XY is 2-char status code followed by space
        const statusCode = line.substring(0, 2);
        const filePath = line.substring(2).trim(); // Skip status code, trim separator space

        // Map status codes to readable names
        let status = 'M'; // modified
        if (statusCode.includes('A')) status = 'A'; // added
        else if (statusCode.includes('D')) status = 'D'; // deleted
        else if (statusCode.includes('R')) status = 'R'; // renamed
        else if (statusCode.includes('C')) status = 'C'; // copied
        else if (statusCode.includes('U')) status = 'U'; // unmerged
        else if (statusCode.includes('?')) status = '?'; // untracked

        return {
          path: filePath,
          status,
          rawStatus: statusCode
        };
      });

      // Get diff stats for all changed files (additions/deletions)
      try {
        const numstatOutput = execSync('git diff --numstat HEAD', {
          cwd: worktreePath,
          stdio: 'pipe',
          encoding: 'utf-8'
        }).trim();

        const diffStats = {};
        if (numstatOutput) {
          numstatOutput.split('\n').forEach(line => {
            const parts = line.split('\t');
            if (parts.length >= 3) {
              const additions = parts[0] === '-' ? 0 : parseInt(parts[0], 10);
              const deletions = parts[1] === '-' ? 0 : parseInt(parts[1], 10);
              const filePath = parts[2];
              diffStats[filePath] = { additions, deletions };
            }
          });
        }

        // Merge diff stats into files
        files.forEach(file => {
          if (diffStats[file.path]) {
            file.additions = diffStats[file.path].additions;
            file.deletions = diffStats[file.path].deletions;
          } else if (file.status === '?' || file.status === 'A') {
            // For untracked/new files, count all lines as additions
            try {
              const fullPath = path.join(worktreePath, file.path);
              const content = fs.readFileSync(fullPath, 'utf-8');
              file.additions = content.split('\n').length;
              file.deletions = 0;
            } catch (err) {
              // If we can't read the file, skip stats
            }
          }
        });
      } catch (diffError) {
        // If diff stats fail, continue without them
        console.warn('[File] Could not get diff stats:', diffError.message);
      }

      return { success: true, files };
    } catch (error) {
      console.error('[File] Error getting git status:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = File;
