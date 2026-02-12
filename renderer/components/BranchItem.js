import React, { useState, useEffect } from 'react';
import { GitBranch, ChevronRight, ChevronDown, MoreVertical, Trash2, Plus, Archive } from 'lucide-react';

function BranchItem({
  worktree,
  isActive,
  sessions,
  openTabs,
  onSelect,
  onDelete,
  onStartSession,
  onOpenSession,
  onDeleteSession,
  onArchiveSession,
  onUnarchiveAndResume,
  onLoadArchivedSessions,
  archivedSessions,
  menuOpen,
  onMenuToggle
}) {
  const isMain = worktree.is_main === 1;
  const [expanded, setExpanded] = useState(isActive);
  const [archiveExpanded, setArchiveExpanded] = useState(false);

  // Split sessions into active (running process) and inactive (stopped/exited)
  const activeSessions = sessions.filter(s => s.status === 'active');
  const inactiveSessions = sessions.filter(s => s.status && s.status !== 'active');

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

  const renderActiveSession = (session) => {
    const sessId = session.sessionId || session.id;
    const sessName = session.title || session.name || `Session ${sessId.slice(0, 8)}`;
    const isOpen = isSessionOpen(sessId);
    return (
      <div
        key={sessId}
        className={`session-item ${isOpen ? 'open' : ''}`}
        onClick={(e) => {
          e.stopPropagation();
          onOpenSession(sessId, worktree.id, worktree.branch_name);
        }}
      >
        <span className="session-active-indicator" />
        <span className="session-label">{sessName}</span>
        {isOpen && <span className="session-open-dot" />}
      </div>
    );
  };

  const renderInactiveSession = (session) => {
    const sessId = session.sessionId || session.id;
    const sessName = session.title || session.name || `Session ${sessId.slice(0, 8)}`;
    return (
      <div
        key={sessId}
        className="session-item inactive"
        onClick={(e) => {
          e.stopPropagation();
          onOpenSession(sessId, worktree.id, worktree.branch_name);
        }}
      >
        <span className="session-label">{sessName}</span>
        <span className={`session-status-badge ${session.status}`}>{session.status}</span>
        <button
          className="session-action-btn"
          title="Archive session"
          onClick={(e) => {
            e.stopPropagation();
            onArchiveSession(sessId, worktree.id);
          }}
        >
          <Archive size={12} />
        </button>
        <button
          className="session-delete-btn"
          title="Delete session"
          onClick={(e) => {
            e.stopPropagation();
            onDeleteSession(sessId, worktree.id);
          }}
        >
          <Trash2 size={12} />
        </button>
      </div>
    );
  };

  const renderArchivedSession = (session) => {
    const sessId = session.sessionId || session.id;
    const sessName = session.title || session.name || `Session ${sessId.slice(0, 8)}`;
    return (
      <div
        key={sessId}
        className="session-item archived"
        onClick={(e) => {
          e.stopPropagation();
          onUnarchiveAndResume(sessId, worktree.id, worktree.branch_name, session.claude_session_id);
        }}
        title="Click to resume"
      >
        <span className="session-label">{sessName}</span>
        <button
          className="session-delete-btn"
          title="Delete session"
          onClick={(e) => {
            e.stopPropagation();
            onDeleteSession(sessId, worktree.id);
          }}
        >
          <Trash2 size={12} />
        </button>
      </div>
    );
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
        {activeSessions.length > 0 && (
          <span className="session-count">{activeSessions.length}</span>
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
          {activeSessions.map(renderActiveSession)}
          {inactiveSessions.map(renderInactiveSession)}

          {/* Archive section */}
          <div className="archive-sessions-section">
            <button
              className="archive-sessions-toggle"
              onClick={(e) => {
                e.stopPropagation();
                if (!archiveExpanded) {
                  onLoadArchivedSessions(worktree.id);
                }
                setArchiveExpanded(!archiveExpanded);
              }}
            >
              <span className="archive-sessions-chevron">
                {archiveExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
              </span>
              <Archive size={10} className="archive-icon" />
              <span className="archive-sessions-label">Archive</span>
              {archivedSessions.length > 0 && (
                <span className="archive-sessions-count">{archivedSessions.length}</span>
              )}
            </button>
            {archiveExpanded && (
              <div className="archive-sessions-list">
                {archivedSessions.length === 0 ? (
                  <div className="archive-empty">No archived sessions</div>
                ) : (
                  archivedSessions.map(renderArchivedSession)
                )}
              </div>
            )}
          </div>

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
