import React, { useState, useEffect } from 'react';
import { GitCommit, GitPullRequest, GitMerge, CheckCircle2, RefreshCw, Loader } from 'lucide-react';
import { buildCommitInstructions, buildCreatePRInstructions, buildMergePRInstructions } from '../../shared/instructionTemplates';
import useSessionStore from '../stores/sessionStore';
import useChecksStore from '../stores/checksStore';

function CheckItem({ icon: Icon, iconClass, label, sublabel, actionLabel, onAction, sending }) {
  return (
    <div className="check-item">
      <div className="check-item-left">
        <div className={`check-item-icon ${iconClass}`}>
          <Icon size={15} />
        </div>
        <div className="check-item-text">
          <span className="check-item-label">{label}</span>
          {sublabel && <span className="check-item-sublabel">{sublabel}</span>}
        </div>
      </div>
      {actionLabel && (
        <button
          className="check-item-btn"
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

  // Notify parent when checks data changes
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
      // Fetch fresh checks before building instructions (ensures accurate state)
      await fetchChecks(folderId, worktreeId);
      await sendInstruction(activeSessionId, instructions, meta);
      // Start fast-polling window after git action
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
    isMainBranch, openPR
  } = checks;
  const noSession = !activeSessionId;
  const showPR = !openPR && !isMainBranch;

  const items = [];

  if (uncommittedCount > 0) {
    items.push(
      <CheckItem
        key="commit"
        icon={GitCommit}
        iconClass="check-icon-warn"
        label={`${uncommittedCount} uncommitted change${uncommittedCount !== 1 ? 's' : ''}`}
        sublabel={branch}
        actionLabel="Commit"
        sending={sending === 'commit'}
        onAction={() => handleAction('commit',
          buildCommitInstructions(checks),
          { action: 'commit', label: 'Commit Changes', fileName: 'Commit instructions.md' }
        )}
      />
    );
  }

  if (showPR) {
    items.push(
      <CheckItem
        key="pr"
        icon={GitPullRequest}
        iconClass="check-icon-info"
        label="Create pull request"
        sublabel={`${branch} → ${defaultBranch}`}
        actionLabel="Create PR"
        sending={sending === 'pr'}
        onAction={() => handleAction('pr',
          buildCreatePRInstructions(checks, { prTitle: prTitle.trim(), prDescription: prDescription.trim() }),
          { action: 'create-pr', label: 'Create a PR', fileName: 'PR instructions.md' }
        )}
      />
    );
  }

  if (openPR) {
    items.push(
      <CheckItem
        key="merge"
        icon={GitMerge}
        iconClass="check-icon-success"
        label={`PR #${openPR.number} open`}
        sublabel={openPR.title}
        actionLabel="Merge PR"
        sending={sending === 'merge'}
        onAction={() => handleAction('merge',
          buildMergePRInstructions(checks),
          { action: 'merge-pr', label: 'Merge PR', fileName: 'Merge instructions.md' }
        )}
      />
    );
  }

  return (
    <div className="checks-panel">
      {/* PR metadata inputs — visible when Create PR action is available */}
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
            rows={3}
          />
        </div>
      )}

      <div className="checks-list">
        {uncommittedCount === 0 && unpushedCount === 0 && !openPR && isMainBranch && (
          <CheckItem
            key="clean"
            icon={CheckCircle2}
            iconClass="check-icon-success"
            label="Working tree clean"
            sublabel={branch}
          />
        )}
        {items}
      </div>

      {noSession && (
        <div className="checks-no-session">Start a session to use git actions</div>
      )}

      <button className="checks-refresh" onClick={handleRefresh} disabled={refreshing}>
        <RefreshCw size={12} className={refreshing ? 'spinner' : ''} />
        Refresh
      </button>
    </div>
  );
}

export default ChecksPanel;
