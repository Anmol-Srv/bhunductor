import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import ClaudeChat from './claude/ClaudeChat';
import FileViewer from './FileViewer';
import useSessionStore from '../stores/sessionStore';
import { getFileIcon } from '../utils/fileIcons';

/** Get the canonical tab key */
const tabKey = (t) => t.id || t.sessionId;

function MainContent({ openTabs, activeTabId, onSwitchTab, onCloseTab, pendingResumeSession, onLazyResume }) {
  const [closeConfirm, setCloseConfirm] = useState(null);

  // Escape to dismiss close-tab confirm
  useEffect(() => {
    if (!closeConfirm) return;
    const handleKey = (e) => {
      if (e.key === 'Escape') setCloseConfirm(null);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [closeConfirm]);

  // No tabs open — show pending resume or empty state
  if (openTabs.length === 0) {
    if (pendingResumeSession && pendingResumeSession.messages.length > 0) {
      const handleClosePending = (e) => {
        e.stopPropagation();
        // Call the parent's onCloseTab to clear pending resume
        onCloseTab(null, false);
      };

      return (
        <div className="main-content">
          <div className="tab-bar">
            <div
              className="tab-item active"
              title={pendingResumeSession.title || `${pendingResumeSession.branchName} / Previous Session`}
            >
              <span className="tab-label">
                {pendingResumeSession.title || `${pendingResumeSession.branchName} / Previous Session`}
              </span>
              <button
                className="tab-close"
                onClick={handleClosePending}
              >
                <X size={14} />
              </button>
            </div>
          </div>
          <div className="tab-content">
            <div className="tab-panel" style={{ display: 'flex' }}>
              <ClaudeChat
                sessionId={pendingResumeSession.sessionId}
                isReadOnly={true}
                initialMessages={pendingResumeSession.messages}
                onLazyResume={onLazyResume}
                placeholderText="Continue conversation..."
              />
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="main-content">
        <div className="empty-state">
          <div className="empty-state-icon">&#9671;</div>
          <h2>Start a Claude Session</h2>
          <p>Select a branch in the sidebar and click "New session" to begin</p>
        </div>
      </div>
    );
  }

  const handleTabClose = (e, tab) => {
    e.stopPropagation();
    const key = tabKey(tab);

    // File tabs close immediately — no session stop prompt
    if (tab.type === 'file') {
      onCloseTab(key, false);
      return;
    }

    setCloseConfirm(key);
  };

  const handleCloseConfirm = (action) => {
    if (action === 'close') {
      onCloseTab(closeConfirm, false);
    } else if (action === 'stop') {
      onCloseTab(closeConfirm, true);
    }
    setCloseConfirm(null);
  };

  return (
    <div className="main-content">
      {/* Tab bar */}
      <div className="tab-bar">
        {openTabs.map(tab => {
          const key = tabKey(tab);
          const isFile = tab.type === 'file';
          const streamState = !isFile ? useSessionStore.getState().streamingState[tab.sessionId] : null;
          const tabIsStreaming = streamState?.isStreaming || false;
          const FileIcon = isFile ? getFileIcon(tab.fileName) : null;
          return (
            <div
              key={key}
              className={`tab-item ${key === activeTabId ? 'active' : ''}`}
              onClick={() => onSwitchTab(key)}
              title={tab.title || (isFile ? tab.fileName : `${tab.branchName} / ${(tab.sessionId || '').slice(0, 8)}`)}
            >
              {isFile && FileIcon && <FileIcon size={13} className="tab-file-icon" />}
              {!isFile && tabIsStreaming && <span className="tab-status-dot streaming" />}
              <span className="tab-label">
                {tab.title || (isFile ? tab.fileName : `${tab.branchName} / ${(tab.sessionId || '').slice(0, 8)}`)}
              </span>
              <button
                className="tab-close"
                onClick={(e) => handleTabClose(e, tab)}
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>

      {/* Tab panels — all rendered, only active visible */}
      <div className="tab-content">
        {openTabs.map(tab => {
          const key = tabKey(tab);
          return (
            <div
              key={key}
              className="tab-panel"
              style={{ display: key === activeTabId ? 'flex' : 'none' }}
            >
              {tab.type === 'file' ? (
                <FileViewer
                  filePath={tab.filePath}
                  relativePath={tab.relativePath}
                  fileName={tab.fileName}
                  worktreeId={tab.worktreeId}
                  folderId={tab.folderId}
                  hasChanges={tab.hasChanges}
                  changeType={tab.changeType}
                  initialViewMode={tab.viewMode}
                />
              ) : (
                <ClaudeChat
                  sessionId={tab.sessionId}
                  branchName={tab.branchName}
                  folderName={tab.folderName}
                  model={tab.model}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Close confirmation modal */}
      {closeConfirm && (
        <div className="modal-overlay" onClick={() => setCloseConfirm(null)}>
          <div className="modal-content close-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Close Session Tab</h2>
            </div>
            <div className="modal-body">
              <p>What would you like to do with this session?</p>
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setCloseConfirm(null)}>
                Cancel
              </button>
              <button className="btn-secondary" onClick={() => handleCloseConfirm('close')}>
                Close Tab
              </button>
              <button className="btn-danger" onClick={() => handleCloseConfirm('stop')}>
                Stop Session
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default MainContent;
