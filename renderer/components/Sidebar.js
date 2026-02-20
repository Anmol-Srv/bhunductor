import React, { useState } from 'react';
import { Plus, Settings, Home, ChevronLeft, ChevronRight } from 'lucide-react';
import BranchItem from './BranchItem';
import useUIStore from '../stores/uiStore';

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
  openTabs,
  onGoHome,
  onGoBack,
  onGoForward,
  canGoBack,
  canGoForward
}) {
  const [menuOpen, setMenuOpen] = useState(null);

  return (
    <div className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-titlebar">
        <div className="sidebar-nav">
          <button className="nav-btn" onClick={onGoBack} disabled={!canGoBack} title="Go back">
            <ChevronLeft size={16} />
          </button>
          <button className="nav-btn" onClick={onGoForward} disabled={!canGoForward} title="Go forward">
            <ChevronRight size={16} />
          </button>
          <button className="nav-btn" onClick={onGoHome} title="Go home">
            <Home size={14} />
          </button>
        </div>
      </div>

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

      <div className="sidebar-footer">
        <button
          className="sidebar-settings-btn"
          onClick={() => useUIStore.getState().toggleSettings()}
          title="Settings"
        >
          <Settings size={14} />
          {!collapsed && 'Settings'}
        </button>
      </div>
    </div>
  );
}

export default Sidebar;
