import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GitBranch, GitMerge, ChevronRight, ChevronDown, MoreVertical, Trash2, Plus, Archive } from 'lucide-react';
import { formatRelativeTime } from '../utils/time';

function BranchItem({
  worktree,
  isActive,
  sessions,
  openTabs,
  activeTabId,
  onSelect,
  onDelete,
  onClose,
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
  const menuRef = useRef(null);

  // Split sessions into active (running process) and inactive (stopped/exited)
  const activeSessions = sessions.filter(s => s.status === 'active');
  const inactiveSessions = sessions.filter(s => s.status && s.status !== 'active');
  const hasSessions = activeSessions.length > 0 || inactiveSessions.length > 0;

  // Auto-expand when branch becomes active
  useEffect(() => {
    if (isActive) setExpanded(true);
  }, [isActive]);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onMenuToggle();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen, onMenuToggle]);

  const handleHeaderClick = () => {
    setExpanded(!expanded);
    if (!isActive) onSelect();
  };

  const isSessionOpen = (sessionId) => {
    return openTabs.some(t => t.sessionId === sessionId);
  };

  const isSessionSelected = (sessionId) => {
    const tab = openTabs.find(t => t.sessionId === sessionId);
    return tab && (tab.id || tab.sessionId) === activeTabId;
  };

  const renderActiveSession = (session) => {
    const sessId = session.sessionId || session.id;
    const sessName = session.title || session.name || `Session ${sessId.slice(0, 8)}`;
    const timeLabel = formatRelativeTime(session.last_active_at || session.created_at);
    const isOpen = isSessionOpen(sessId);
    const isSelected = isSessionSelected(sessId);
    return (
      <div
        key={sessId}
        className={`session-item ${isOpen ? 'open' : ''} ${isSelected ? 'selected' : ''}`}
        onClick={(e) => {
          e.stopPropagation();
          onOpenSession(sessId, worktree.id, worktree.branch_name);
        }}
        title={sessName}
      >
        <div className="session-info">
          <span className="session-label">{sessName}</span>
          {timeLabel && <span className="session-time">{timeLabel}</span>}
        </div>
        <span className="session-active-dot" />
      </div>
    );
  };

  const renderInactiveSession = (session) => {
    const sessId = session.sessionId || session.id;
    const sessName = session.title || session.name || `Session ${sessId.slice(0, 8)}`;
    const timeLabel = formatRelativeTime(session.last_active_at || session.created_at);
    const isSelected = isSessionSelected(sessId);
    return (
      <div
        key={sessId}
        className={`session-item inactive ${isSelected ? 'selected' : ''}`}
        onClick={(e) => {
          e.stopPropagation();
          onOpenSession(sessId, worktree.id, worktree.branch_name);
        }}
        title={sessName}
      >
        <div className="session-info">
          <span className="session-label">{sessName}</span>
          {timeLabel && <span className="session-time">{timeLabel}</span>}
        </div>
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
    const timeLabel = formatRelativeTime(session.last_active_at || session.created_at);
    return (
      <div
        key={sessId}
        className="session-item archived"
        onClick={(e) => {
          e.stopPropagation();
          onUnarchiveAndResume(sessId, worktree.id, worktree.branch_name, session.claude_session_id);
        }}
        title={`${sessName} (Click to resume)`}
      >
        <div className="session-info">
          <span className="session-label">{sessName}</span>
          {timeLabel && <span className="session-time">{timeLabel}</span>}
        </div>
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
        <span className="branch-name">{worktree.branch_name}</span>
        {isMain && <span className="main-badge">main</span>}
        {worktree.status === 'merged' && (
          <span className="merged-badge" title="Merged"><GitMerge size={11} /></span>
        )}
        {activeSessions.length > 0 && (
          <span className="session-count">{activeSessions.length}</span>
        )}

        <div className="branch-actions">
          {hasSessions && (
            <button
              className="branch-add-btn"
              title="New session"
              onClick={(e) => {
                e.stopPropagation();
                onStartSession(worktree.id);
              }}
            >
              <Plus size={14} />
            </button>
          )}
          {!isMain && (
            <div ref={menuRef} className="branch-menu-wrapper">
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
                    className="menu-item"
                    onClick={(e) => {
                      e.stopPropagation();
                      onClose();
                    }}
                  >
                    <Archive size={14} />
                    <span>Close Branch</span>
                  </button>
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
            </div>
          )}
        </div>
      </div>

      {/* Expanded session list */}
      {expanded && (
        <div className="branch-sessions">
          {activeSessions.map(renderActiveSession)}
          {inactiveSessions.map(renderInactiveSession)}

          {/* New session button — only show when no sessions exist */}
          {!hasSessions && (
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
          )}

          {/* Archive section - only show if there are archived sessions */}
          {archivedSessions.length > 0 && (
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
                <span className="archive-sessions-count">{archivedSessions.length}</span>
              </button>
              {archiveExpanded && (
                <div className="archive-sessions-list">
                  {archivedSessions.map(renderArchivedSession)}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default BranchItem;
