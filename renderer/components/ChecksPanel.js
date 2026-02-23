import React, { useState, useEffect } from 'react';
import { GitCommit, GitPullRequest, GitMerge, CheckCircle2, Circle, RefreshCw, Loader } from 'lucide-react';
import { buildCommitInstructions, buildCreatePRInstructions, buildMergePRInstructions } from '../../shared/instructionTemplates';
import useSessionStore from '../stores/sessionStore';
import useChecksStore from '../stores/checksStore';

function TodoItem({ done, icon: Icon, label, sublabel, actionLabel, onAction, sending }) {
  return (
    <div className={`todo-item ${done ? 'done' : ''}`}>
      <div className="todo-checkbox">
        {done
          ? <CheckCircle2 size={16} className="todo-check-done" />
          : <Circle size={16} className="todo-check-pending" />
        }
      </div>
      <div className="todo-content">
        <div className="todo-label-row">
          <Icon size={13} className="todo-icon" />
          <span className="todo-label">{label}</span>
        </div>
        {sublabel && <span className="todo-sublabel">{sublabel}</span>}
      </div>
      {actionLabel && (
        <button
          className="todo-action-btn"
          onClick={onAction}
          disabled={sending}
        >
          {sending ? <Loader size={11} className="spinner" /> : actionLabel}
        </button>
      )}
    </div>
  );
}

function ChecksPanel({ folderId, worktreeId, activeSessionId, onChecksUpdate }) {
  const [sending, setSending] = useState(null);
  const [prTitle, setPrTitle] = useState('');
  const [prDescription, setPrDescription] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const sendInstruction = useSessionStore(s => s.sendInstruction);
  const { checksByWorktree, fetchChecks, setPostActionRefresh } = useChecksStore();
  const checks = checksByWorktree[worktreeId] || null;

  useEffect(() => {
    if (checks) onChecksUpdate?.(checks);
  }, [checks]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchChecks(folderId, worktreeId);
    setRefreshing(false);
  };

  const handleAction = async (actionKey, instructions, meta) => {
    if (!activeSessionId) return;
    setSending(actionKey);
    try {
      await fetchChecks(folderId, worktreeId);
      await sendInstruction(activeSessionId, instructions, meta);
      setPostActionRefresh(worktreeId);
    } finally {
      setSending(null);
    }
  };

  if (!checks) {
    return (
      <div className="checks-loading">
        <Loader size={14} className="spinner" />
        Scanning...
      </div>
    );
  }

  const {
    branch, defaultBranch, uncommittedCount, unpushedCount,
    isMainBranch, openPR, mergedPR
  } = checks;
  const noSession = !activeSessionId;
  const showPR = !openPR && !isMainBranch && !mergedPR;

  return (
    <div className="checks-panel">
      {mergedPR && (
        <div className="post-merge-actions">
          <div className="post-merge-title">Branch merged</div>
          <div className="post-merge-hint">Switch to <strong>{defaultBranch}</strong> and pull, or delete this branch.</div>
        </div>
      )}

      {/* PR form — minimal inline inputs */}
      {showPR && (
        <div className="checks-pr-form">
          <input
            className="checks-pr-input"
            placeholder="PR title (optional)"
            value={prTitle}
            onChange={e => setPrTitle(e.target.value)}
            maxLength={80}
          />
          <textarea
            className="checks-pr-textarea"
            placeholder="PR description (optional)"
            value={prDescription}
            onChange={e => setPrDescription(e.target.value)}
            rows={2}
          />
        </div>
      )}

      <div className="todo-list">
        {/* Commit check */}
        <TodoItem
          done={uncommittedCount === 0}
          icon={GitCommit}
          label={uncommittedCount > 0
            ? `${uncommittedCount} uncommitted change${uncommittedCount !== 1 ? 's' : ''}`
            : 'All changes committed'
          }
          sublabel={branch}
          actionLabel={uncommittedCount > 0 ? 'Commit' : null}
          sending={sending === 'commit'}
          onAction={() => handleAction('commit',
            buildCommitInstructions(checks),
            { action: 'commit', label: 'Commit Changes', fileName: 'Commit instructions.md' }
          )}
        />

        {/* PR check */}
        {showPR && (
          <TodoItem
            done={false}
            icon={GitPullRequest}
            label="Create pull request"
            sublabel={`${branch} → ${defaultBranch}`}
            actionLabel="Create PR"
            sending={sending === 'pr'}
            onAction={() => handleAction('pr',
              buildCreatePRInstructions(checks, { prTitle: prTitle.trim(), prDescription: prDescription.trim() }),
              { action: 'create-pr', label: 'Create a PR', fileName: 'PR instructions.md' }
            )}
          />
        )}

        {openPR && (
          <TodoItem
            done={false}
            icon={GitMerge}
            label={`PR #${openPR.number} open`}
            sublabel={openPR.title}
            actionLabel="Merge PR"
            sending={sending === 'merge'}
            onAction={() => handleAction('merge',
              buildMergePRInstructions(checks),
              { action: 'merge-pr', label: 'Merge PR', fileName: 'Merge instructions.md' }
            )}
          />
        )}

        {mergedPR && (
          <TodoItem
            done={true}
            icon={GitMerge}
            label={`PR #${mergedPR.number} merged`}
            sublabel={mergedPR.title}
          />
        )}

        {/* Clean state on main */}
        {uncommittedCount === 0 && unpushedCount === 0 && !openPR && isMainBranch && (
          <TodoItem
            done={true}
            icon={CheckCircle2}
            label="Working tree clean"
            sublabel={branch}
          />
        )}
      </div>

      <button className="checks-refresh" onClick={handleRefresh} disabled={refreshing}>
        <RefreshCw size={12} className={refreshing ? 'spinner' : ''} />
        Refresh
      </button>
    </div>
  );
}

export default ChecksPanel;
