import React, { useState } from 'react';
import { Plus, Settings, Home, ChevronLeft, ChevronRight, ChevronDown, Archive, RotateCcw, GitBranch } from 'lucide-react';
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
  onCloseBranch,
  onReopenBranch,
  closedWorktrees,
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
  const [closedExpanded, setClosedExpanded] = useState(false);

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
                onClose={() => onCloseBranch(worktree.id)}
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

            {closedWorktrees && closedWorktrees.length > 0 && (
              <div className="closed-branches-section">
                <button
                  className="closed-branches-toggle"
                  onClick={() => setClosedExpanded(!closedExpanded)}
                >
                  <span className="closed-branches-chevron">
                    {closedExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  </span>
                  <Archive size={12} className="closed-branches-icon" />
                  <span className="closed-branches-label">Closed</span>
                  <span className="closed-branches-count">{closedWorktrees.length}</span>
                </button>
                {closedExpanded && (
                  <div className="closed-branches-list">
                    {closedWorktrees.map(worktree => (
                      <div
                        key={worktree.id}
                        className="closed-branch-item"
                        onClick={() => onReopenBranch(worktree.id)}
                        title={`${worktree.branch_name} — click to reopen`}
                      >
                        <GitBranch size={12} className="closed-branch-icon" />
                        <span className="closed-branch-name">{worktree.branch_name}</span>
                        <button
                          className="closed-branch-reopen-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            onReopenBranch(worktree.id);
                          }}
                          title="Reopen branch"
                        >
                          <RotateCcw size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
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
