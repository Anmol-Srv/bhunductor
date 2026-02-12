import React, { useState } from 'react';
import { X } from 'lucide-react';
import ClaudeChat from './claude/ClaudeChat';

function MainContent({ openTabs, activeTabId, onSwitchTab, onCloseTab, pendingResumeSession, onLazyResume }) {
  const [closeConfirm, setCloseConfirm] = useState(null); // sessionId being confirmed

  // No tabs open — show pending resume or empty state
  if (openTabs.length === 0) {
    if (pendingResumeSession && pendingResumeSession.messages.length > 0) {
      return (
        <div className="main-content">
          <div className="tab-bar">
            <div className="tab-item active">
              <span className="tab-label">
                {pendingResumeSession.title || `${pendingResumeSession.branchName} / Previous Session`}
              </span>
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
          <h2>No Active Claude Session</h2>
          <p>Expand a branch in the sidebar and click "+ New session" to start</p>
        </div>
      </div>
    );
  }

  const handleTabClose = (e, sessionId) => {
    e.stopPropagation();
    setCloseConfirm(sessionId);
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
        {openTabs.map(tab => (
          <div
            key={tab.sessionId}
            className={`tab-item ${tab.sessionId === activeTabId ? 'active' : ''}`}
            onClick={() => onSwitchTab(tab.sessionId)}
          >
            <span className="tab-label">
              {tab.title || `${tab.branchName} / ${tab.sessionId.slice(0, 8)}`}
            </span>
            <button
              className="tab-close"
              onClick={(e) => handleTabClose(e, tab.sessionId)}
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>

      {/* Chat panels — all rendered, only active visible */}
      <div className="tab-content">
        {openTabs.map(tab => (
          <div
            key={tab.sessionId}
            className="tab-panel"
            style={{ display: tab.sessionId === activeTabId ? 'flex' : 'none' }}
          >
            <ClaudeChat sessionId={tab.sessionId} />
          </div>
        ))}
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
