const { execSync } = require('child_process');
const { IPC_CHANNELS } = require('../../shared/constants');
const { wrapHandler } = require('../utils/ipc-handler');

const w = (fn) => wrapHandler('GitService', fn);

class GitService {
  _exec(cmd, cwd) {
    try {
      return execSync(cmd, { cwd, encoding: 'utf8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    } catch {
      return null;
    }
  }

  registerHandlers(ipcMain) {
    ipcMain.handle(IPC_CHANNELS.GIT_GET_PROFILE, w(async () => {
      const name = this._exec('git config --global user.name');
      const email = this._exec('git config --global user.email');

      let ghUser = null;
      let avatarUrl = null;
      try {
        const ghJson = this._exec('gh api user');
        if (ghJson) {
          const gh = JSON.parse(ghJson);
          ghUser = gh.login || null;
          avatarUrl = gh.avatar_url || null;
        }
      } catch {
        // gh CLI not installed or not authenticated
      }

      if (!avatarUrl && email) {
        const crypto = require('crypto');
        const hash = crypto.createHash('md5').update(email.toLowerCase().trim()).digest('hex');
        avatarUrl = `https://gravatar.com/avatar/${hash}?s=160&d=identicon`;
      }

      // Download avatar and convert to data URI so renderer doesn't need external network access
      let avatarDataUrl = null;
      if (avatarUrl) {
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 8000);
          const res = await fetch(avatarUrl, { signal: controller.signal });
          clearTimeout(timer);
          if (res.ok) {
            const arrayBuf = await res.arrayBuffer();
            const mime = (res.headers.get('content-type') || 'image/png').split(';')[0];
            avatarDataUrl = `data:${mime};base64,${Buffer.from(arrayBuf).toString('base64')}`;
          }
        } catch (err) {
          console.error('[GitService] Failed to fetch avatar:', err.message);
        }
      }

      return {
        success: true,
        name: name || null,
        email: email || null,
        ghUser: ghUser || null,
        avatarUrl: avatarDataUrl || null
      };
    }));

    ipcMain.handle(IPC_CHANNELS.GIT_GET_CONFIG, w(async (event, repoPath) => {
      if (!repoPath) return { success: false, error: 'No repo path provided' };

      const name = this._exec('git config user.name', repoPath);
      const email = this._exec('git config user.email', repoPath);
      const defaultBranch = this._exec('git symbolic-ref --short HEAD', repoPath);
      const remoteUrl = this._exec('git remote get-url origin', repoPath);

      return {
        success: true,
        userName: name || null,
        userEmail: email || null,
        defaultBranch: defaultBranch || null,
        remoteUrl: remoteUrl || null
      };
    }));

    ipcMain.handle(IPC_CHANNELS.GIT_GET_CHECKS, w(async (event, folderId, worktreeId) => {
      const Worktree = require('../data/models/Worktree');
      const Folder = require('../data/models/Folder');

      const worktree = Worktree.findById(worktreeId);
      if (!worktree) return { success: false, error: 'Worktree not found' };
      const folder = Folder.findById(folderId);
      if (!folder) return { success: false, error: 'Folder not found' };

      const repoPath = Worktree.getActivePath(worktree, folder);

      const branch = this._exec('git rev-parse --abbrev-ref HEAD', repoPath);
      const defaultBranch = this._exec('git symbolic-ref --short refs/remotes/origin/HEAD', repoPath)?.replace('origin/', '')
        || this._exec('git remote show origin | grep "HEAD branch" | cut -d" " -f5', repoPath)
        || 'main';

      // Uncommitted changes (staged + unstaged + untracked) with breakdown
      const statusOut = this._exec('git status --short', repoPath) || '';
      const statusLines = statusOut.split('\n').filter(l => l.trim());
      const uncommittedCount = statusLines.length;

      let stagedCount = 0;
      let unstagedCount = 0;
      let untrackedCount = 0;
      for (const line of statusLines) {
        const x = line[0]; // index (staged) column
        const y = line[1]; // worktree column
        if (x === '?' && y === '?') {
          untrackedCount++;
        } else {
          if (x && x !== ' ' && x !== '?') stagedCount++;
          if (y && y !== ' ' && y !== '?') unstagedCount++;
        }
      }

      // Is this the main/default branch?
      const isMainBranch = branch === defaultBranch || branch === 'main' || branch === 'master';

      // Upstream
      const upstreamRef = this._exec('git rev-parse --abbrev-ref @{upstream}', repoPath);
      const hasUpstream = !!upstreamRef;

      // Unpushed commits (only if upstream exists)
      let unpushedCount = 0;
      let behindCount = 0;
      if (hasUpstream) {
        const unpushedOut = this._exec('git log @{upstream}..HEAD --oneline', repoPath) || '';
        unpushedCount = unpushedOut.split('\n').filter(l => l.trim()).length;
        // Behind count
        const behindOut = this._exec('git rev-list --count HEAD..@{upstream}', repoPath);
        behindCount = behindOut ? parseInt(behindOut, 10) || 0 : 0;
      }

      // Last commit subject
      const lastCommitSubject = this._exec('git log -1 --format=%s', repoPath) || null;

      // Remote URL
      const remoteUrl = this._exec('git remote get-url origin', repoPath) || null;

      // Open PR via gh CLI
      let openPR = null;
      let mergedPR = null;
      try {
        const prJson = this._exec(`gh pr list --head "${branch}" --state open --json number,title,url --limit 1`, repoPath);
        if (prJson) {
          const prs = JSON.parse(prJson);
          if (prs.length > 0) openPR = prs[0];
        }
        // If no open PR, check for merged PR on this branch
        if (!openPR && !isMainBranch) {
          const mergedJson = this._exec(`gh pr list --head "${branch}" --state merged --json number,title,url --limit 1`, repoPath);
          if (mergedJson) {
            const merged = JSON.parse(mergedJson);
            if (merged.length > 0) mergedPR = merged[0];
          }
        }
      } catch {
        // gh not installed or no auth
      }

      // Auto-update worktree status when merged PR is detected
      let worktreeStatus = worktree.status || 'active';
      if (mergedPR && worktreeStatus !== 'merged') {
        try {
          const { getDatabase } = require('../data/database');
          const db = getDatabase();
          db.prepare('UPDATE worktrees SET status = ? WHERE id = ?').run('merged', worktreeId);
          worktreeStatus = 'merged';
        } catch (err) {
          console.error('[GitService] Failed to update worktree status:', err.message);
        }
      }

      return {
        success: true,
        branch: branch || null,
        defaultBranch,
        uncommittedCount,
        stagedCount,
        unstagedCount,
        untrackedCount,
        isMainBranch,
        hasUpstream,
        unpushedCount,
        behindCount,
        lastCommitSubject,
        remoteUrl,
        openPR,
        mergedPR,
        worktreeStatus
      };
    }));

    ipcMain.handle(IPC_CHANNELS.GIT_GET_LOG, w(async (event, repoPath, count = 50) => {
      if (!repoPath) return { success: false, error: 'No repo path provided' };

      const format = '%H|%h|%s|%an|%ar|%D';
      const raw = this._exec(`git log --oneline --all --graph --format="${format}" -n ${count}`, repoPath);
      if (!raw) return { success: true, commits: [] };

      const commits = raw.split('\n').map(line => {
        // Lines with graph characters before the actual commit data
        const pipeIdx = line.indexOf('|');
        if (pipeIdx === -1) return { graph: line, hash: null };

        // Find the start of the hash (40 hex chars before first pipe)
        const beforePipe = line.substring(0, pipeIdx);
        const hashMatch = beforePipe.match(/([0-9a-f]{40})$/);
        if (!hashMatch) return { graph: line, hash: null };

        const graphPart = beforePipe.substring(0, hashMatch.index);
        const parts = line.substring(hashMatch.index).split('|');

        return {
          graph: graphPart,
          hash: parts[0] || null,
          shortHash: parts[1] || null,
          subject: parts[2] || null,
          author: parts[3] || null,
          relativeDate: parts[4] || null,
          refs: parts[5] || null
        };
      });

      return { success: true, commits };
    }));
  }
}

module.exports = GitService;
