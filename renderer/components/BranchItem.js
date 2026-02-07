import React, { useState, useEffect } from 'react';
import { GitBranch, ChevronRight, ChevronDown, MoreVertical, Trash2, Plus } from 'lucide-react';

function BranchItem({
  worktree,
  isActive,
  sessions,
  openTabs,
  onSelect,
  onDelete,
  onStartSession,
  onOpenSession,
  menuOpen,
  onMenuToggle
}) {
  const isMain = worktree.is_main === 1;
  const [expanded, setExpanded] = useState(isActive);

  // Auto-expand when branch becomes active
  useEffect(() => {
    if (isActive) setExpanded(true);
  }, [isActive]);

  const handleHeaderClick = () => {
    setExpanded(!expanded);
    if (!isActive) onSelect();
  };

  const isSessionOpen = (sessionId) => {
    return openTabs.some(t => t.sessionId === sessionId);
  };

  return (
    <div className={`branch-item-container ${isActive ? 'active' : ''}`}>
      {/* Branch header row */}
      <div className="branch-header" onClick={handleHeaderClick}>
        <span className="branch-chevron">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
        <GitBranch size={13} className="branch-icon" />
        <span className="branch-name">{worktree.branch_name}</span>
        {isMain && <span className="main-badge">main</span>}
        {sessions.length > 0 && (
          <span className="session-count">{sessions.length}</span>
        )}

        <div className="branch-actions">
          {!isMain && (
            <>
              <button
                className="menu-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onMenuToggle();
                }}
              >
                <MoreVertical size={16} />
              </button>

              {menuOpen && (
                <div className="branch-menu">
                  <button
                    className="menu-item delete"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete();
                    }}
                  >
                    <Trash2 size={14} />
                    <span>Delete Branch</span>
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Expanded session list */}
      {expanded && (
        <div className="branch-sessions">
          {sessions.map(session => {
            const sessId = session.sessionId || session.id;
            return (
              <div
                key={sessId}
                className={`session-item ${isSessionOpen(sessId) ? 'open' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenSession(sessId, worktree.id, worktree.branch_name);
                }}
              >
                <span className="session-label">Session {sessId.slice(0, 8)}</span>
                {isSessionOpen(sessId) && <span className="session-open-dot" />}
              </div>
            );
          })}

          <button
            className="new-session-btn"
            onClick={(e) => {
              e.stopPropagation();
              onStartSession(worktree.id);
            }}
          >
            <Plus size={12} />
            <span>New session</span>
          </button>
        </div>
      )}
    </div>
  );
}

export default BranchItem;
