#!/usr/bin/env node

/**
 * One-time cleanup script: removes Claude sessions for a specific
 * repo (and optionally branch) from both the Bhunductor app database
 * and the Claude CLI's project history.
 *
 * Usage:
 *   node scripts/cleanup-sessions.js                          # list repos & branches
 *   node scripts/cleanup-sessions.js --folder <id>            # dry-run for entire repo
 *   node scripts/cleanup-sessions.js --folder <id> --branch <name>  # dry-run for branch
 *   node scripts/cleanup-sessions.js --folder <id> --run      # actually delete
 *
 * Add --include-active to also delete sessions with status='active'.
 * By default only exited/stopped sessions are removed.
 */

const path = require('path');
const os = require('os');
const fs = require('fs');
const { execSync } = require('child_process');

const args = process.argv.slice(2);
const DRY_RUN = !args.includes('--run');
const INCLUDE_ACTIVE = args.includes('--include-active');
const folderIdIdx = args.indexOf('--folder');
const folderId = folderIdIdx !== -1 ? args[folderIdIdx + 1] : null;
const branchIdx = args.indexOf('--branch');
const branchName = branchIdx !== -1 ? args[branchIdx + 1] : null;

const dbPath = path.join(os.homedir(), '.bhunductor', 'workspaces.db');

function sql(query) {
  return execSync(`sqlite3 "${dbPath}" "${query}"`, { encoding: 'utf-8' }).trim();
}

function sqlLines(query) {
  const out = sql(query);
  return out ? out.split('\n') : [];
}

// ── No folder specified → list repos and branches ───────────────────

if (!folderId) {
  if (!fs.existsSync(dbPath)) {
    console.log(`Database not found at ${dbPath}`);
    process.exit(1);
  }

  console.log('Available repos:\n');
  const folders = sqlLines('SELECT f.id, f.name, f.path FROM folders f ORDER BY f.last_opened DESC;');
  for (const row of folders) {
    const [id, name, fpath] = row.split('|');
    console.log(`  --folder ${id}`);
    console.log(`    ${name} (${fpath})`);

    const worktrees = sqlLines(`SELECT w.id, w.branch_name, w.is_main, (SELECT COUNT(*) FROM claude_sessions cs WHERE cs.worktree_id = w.id) as cnt FROM worktrees w WHERE w.folder_id = '${id}' ORDER BY w.is_main DESC;`);
    for (const wt of worktrees) {
      const [wid, branch, isMain, cnt] = wt.split('|');
      const mainTag = isMain === '1' ? ' (main)' : '';
      console.log(`      --branch ${branch}${mainTag}  [${cnt} session(s)]`);
    }
    console.log();
  }

  console.log('Usage:');
  console.log('  node scripts/cleanup-sessions.js --folder <id>                    # dry-run, all branches');
  console.log('  node scripts/cleanup-sessions.js --folder <id> --branch <name>    # dry-run, specific branch');
  console.log('  Add --run to execute, --include-active to also remove active sessions.');
  process.exit(0);
}

// ── Folder specified → proceed with cleanup ─────────────────────────

if (!fs.existsSync(dbPath)) {
  console.error(`Database not found at ${dbPath}`);
  process.exit(1);
}

if (DRY_RUN) {
  console.log('=== DRY RUN (pass --run to actually delete) ===\n');
}

// Resolve folder info
const folderRow = sql(`SELECT id, name, path FROM folders WHERE id = '${folderId}';`);
if (!folderRow) {
  console.error(`Folder not found: ${folderId}`);
  process.exit(1);
}
const [, folderName, folderPath] = folderRow.split('|');
console.log(`Repo: ${folderName} (${folderPath})`);

// Resolve worktree filter
let worktreeFilter = '';
let worktreeIds = [];

if (branchName) {
  const wtRow = sql(`SELECT id FROM worktrees WHERE folder_id = '${folderId}' AND branch_name = '${branchName}';`);
  if (!wtRow) {
    console.error(`Branch '${branchName}' not found for this repo.`);
    process.exit(1);
  }
  worktreeIds = [wtRow];
  worktreeFilter = `AND worktree_id = '${wtRow}'`;
  console.log(`Branch: ${branchName}\n`);
} else {
  const wtRows = sqlLines(`SELECT id FROM worktrees WHERE folder_id = '${folderId}';`);
  worktreeIds = wtRows;
  console.log('Branch: (all)\n');
}

// Status filter
const statusFilter = INCLUDE_ACTIVE
  ? ''
  : "AND status IN ('exited', 'stopped')";

// ── 1. Find sessions to delete from app DB ──────────────────────────

const sessions = sqlLines(
  `SELECT cs.id, cs.worktree_id, w.branch_name, cs.status, cs.claude_session_id FROM claude_sessions cs LEFT JOIN worktrees w ON cs.worktree_id = w.id WHERE cs.folder_id = '${folderId}' ${worktreeFilter} ${statusFilter} ORDER BY cs.created_at DESC;`
);

console.log(`[App DB] Found ${sessions.length} session(s) to delete:`);
const claudeSessionIds = [];
for (const row of sessions) {
  const [id, , branch, status, claudeSid] = row.split('|');
  console.log(`  ${id}  branch=${branch}  status=${status}  claude_sid=${claudeSid || '(none)'}`);
  if (claudeSid) claudeSessionIds.push(claudeSid);
}

if (!DRY_RUN && sessions.length > 0) {
  const deleteQuery = `DELETE FROM claude_sessions WHERE folder_id = '${folderId}' ${worktreeFilter} ${statusFilter};`;
  sql(deleteQuery);
  console.log(`[App DB] Deleted ${sessions.length} row(s).\n`);
} else {
  console.log(`[App DB] Would delete ${sessions.length} row(s).\n`);
}

// ── 2. Find and clean Claude CLI project history ────────────────────

// Build the list of Claude CLI project dirs to clean.
// The dir name is derived from the working directory path with / → -
// Main branch uses the repo path directly, worktrees use .bhunductor/worktrees/<branch>/

function pathToClaudeProjectDir(dirPath) {
  // Claude CLI encodes: /Users/foo/.bar → -Users-foo--bar
  // Both / and . are replaced with -
  const encoded = dirPath.replace(/[/.]/g, '-');
  return path.join(os.homedir(), '.claude', 'projects', encoded);
}

// Collect unique working dirs for the targeted worktrees
const workingDirs = new Set();

for (const wtId of worktreeIds) {
  const wtRow = sql(`SELECT w.branch_name, w.worktree_path, w.is_main FROM worktrees w WHERE w.id = '${wtId}';`);
  if (!wtRow) continue;
  const [wtBranch, wtPath, isMain] = wtRow.split('|');

  if (isMain === '1' || !wtPath) {
    workingDirs.add(folderPath);
  } else {
    workingDirs.add(wtPath);
  }
}

let totalDeletedFiles = 0;
let totalDeletedDirs = 0;

for (const workDir of workingDirs) {
  const claudeDir = pathToClaudeProjectDir(workDir);

  if (!fs.existsSync(claudeDir)) {
    console.log(`[Claude CLI] Dir not found: ${claudeDir}, skipping.`);
    continue;
  }

  const entries = fs.readdirSync(claudeDir);
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;

  // If we have specific Claude session IDs, only delete those.
  // Otherwise delete all UUID-based entries in this dir.
  let targetJsonls;
  let targetDirs;

  if (claudeSessionIds.length > 0) {
    targetJsonls = entries.filter(e => {
      if (!e.endsWith('.jsonl')) return false;
      const fileUuid = e.replace('.jsonl', '');
      return claudeSessionIds.includes(fileUuid);
    });
    targetDirs = entries.filter(e => {
      if (!uuidPattern.test(e)) return false;
      const full = path.join(claudeDir, e);
      if (!fs.statSync(full).isDirectory()) return false;
      return claudeSessionIds.includes(e);
    });
  } else {
    // No claude_session_ids recorded — clean all session data in this dir
    targetJsonls = entries.filter(e => uuidPattern.test(e) && e.endsWith('.jsonl'));
    targetDirs = entries.filter(e => {
      if (!uuidPattern.test(e)) return false;
      const full = path.join(claudeDir, e);
      return fs.statSync(full).isDirectory();
    });
  }

  const kept = entries.filter(e => !targetJsonls.includes(e) && !targetDirs.includes(e));

  console.log(`[Claude CLI] ${claudeDir}`);
  console.log(`[Claude CLI]   ${targetJsonls.length} transcript(s), ${targetDirs.length} session dir(s) to delete`);
  console.log(`[Claude CLI]   Keeping: ${kept.join(', ') || '(none)'}`);

  if (!DRY_RUN) {
    for (const f of targetJsonls) {
      fs.unlinkSync(path.join(claudeDir, f));
      totalDeletedFiles++;
    }
    for (const d of targetDirs) {
      fs.rmSync(path.join(claudeDir, d), { recursive: true, force: true });
      totalDeletedDirs++;
    }
  } else {
    totalDeletedFiles += targetJsonls.length;
    totalDeletedDirs += targetDirs.length;
  }
}

if (!DRY_RUN) {
  console.log(`\n[Claude CLI] Deleted ${totalDeletedFiles} transcript(s) and ${totalDeletedDirs} session dir(s).`);
} else {
  console.log(`\n[Claude CLI] Would delete ${totalDeletedFiles} transcript(s) and ${totalDeletedDirs} session dir(s).`);
}

console.log(DRY_RUN ? '\nDone (dry run). Re-run with --run to execute.' : '\nDone. Sessions cleaned up.');
