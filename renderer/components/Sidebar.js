import React, { useState } from 'react';
import { PanelLeftClose, PanelLeft, Plus } from 'lucide-react';
import BranchItem from './BranchItem';

function Sidebar({
  collapsed,
  onToggle,
  worktrees,
  activeWorktree,
  onSelectBranch,
  onCreateBranch,
  onDeleteBranch,
  onStartSession,
  onOpenSession,
  onDeleteSession,
  onArchiveSession,
  onUnarchiveAndResume,
  onLoadArchivedSessions,
  sessionsByWorktree,
  archivedSessionsByWorktree,
  openTabs
}) {
  const [menuOpen, setMenuOpen] = useState(null);

  return (
    <div className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      {!collapsed && (
        <div className="sidebar-content">
          <div className="sidebar-section">
            <div className="sidebar-header">
              <span>Branches</span>
              <div className="header-actions">
              <button
                className="add-branch-btn"
                onClick={onCreateBranch}
                title="Create new branch"
              >
                <Plus size={16} />
              </button>
              <button className="collapse-btn" onClick={onToggle}>
                <PanelLeftClose size={16} />
              </button>
            </div>
            </div>

            <div className="branch-list">
            {worktrees.map(worktree => (
              <BranchItem
                key={worktree.id}
                worktree={worktree}
                isActive={activeWorktree?.id === worktree.id}
                sessions={sessionsByWorktree[worktree.id] || []}
                archivedSessions={(archivedSessionsByWorktree || {})[worktree.id] || []}
                openTabs={openTabs || []}
                onSelect={() => onSelectBranch(worktree)}
                onDelete={() => onDeleteBranch(worktree.id, worktree.branch_name)}
                onStartSession={onStartSession}
                onOpenSession={onOpenSession}
                onDeleteSession={onDeleteSession}
                onArchiveSession={onArchiveSession}
                onUnarchiveAndResume={onUnarchiveAndResume}
                onLoadArchivedSessions={onLoadArchivedSessions}
                menuOpen={menuOpen === worktree.id}
                onMenuToggle={() => setMenuOpen(menuOpen === worktree.id ? null : worktree.id)}
              />
            ))}
            </div>
          </div>
        </div>
      )}

      {collapsed && (
        <div className="sidebar-collapsed">
          <button className="expand-btn" onClick={onToggle} title="Expand sidebar">
            <PanelLeft size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

export default Sidebar;
