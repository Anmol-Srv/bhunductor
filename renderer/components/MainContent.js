import React, { useState } from 'react';
import { X, FileText } from 'lucide-react';
import ClaudeChat from './claude/ClaudeChat';
import FileViewer from './FileViewer';

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

  const handleTabClose = (e, tabId) => {
    e.stopPropagation();

    // For file tabs, close immediately without confirmation
    if (isFileTab(tabId)) {
      onCloseTab(tabId, false);
      return;
    }

    // For Claude session tabs, show confirmation modal
    setCloseConfirm(tabId);
  };

  const handleCloseConfirm = (action) => {
    if (action === 'close') {
      onCloseTab(closeConfirm, false);
    } else if (action === 'stop') {
      onCloseTab(closeConfirm, true);
    }
    setCloseConfirm(null);
  };

  const renderTabLabel = (tab) => {
    const tabType = tab.type || 'claude-session';

    if (tabType === 'file') {
      return (
        <>
          <FileText size={14} className="tab-icon" />
          <span className="tab-label">{tab.fileName}</span>
          {tab.hasChanges && <span className="modified-indicator">●</span>}
        </>
      );
    }

    // Claude session tab
    return (
      <span className="tab-label">
        {tab.title || `${tab.branchName} / ${tab.sessionId.slice(0, 8)}`}
      </span>
    );
  };

  const renderTabContent = (tab) => {
    const tabType = tab.type || 'claude-session';

    if (tabType === 'file') {
      return (
        <FileViewer
          fileId={tab.fileId}
          worktreeId={tab.worktreeId}
          filePath={tab.filePath}
          relativePath={tab.relativePath}
          fileName={tab.fileName}
          hasChanges={tab.hasChanges}
          changeType={tab.changeType}
        />
      );
    }

    // Claude session
    return <ClaudeChat sessionId={tab.sessionId} />;
  };

  const getTabId = (tab) => {
    const tabType = tab.type || 'claude-session';
    return tabType === 'file' ? tab.fileId : tab.sessionId;
  };

  // Check if a tab is a file tab (for close confirmation)
  const isFileTab = (tabId) => {
    const tab = openTabs.find(t => getTabId(t) === tabId);
    return tab && tab.type === 'file';
  };

  return (
    <div className="main-content">
      {/* Tab bar */}
      <div className="tab-bar">
        {openTabs.map(tab => {
          const tabId = getTabId(tab);
          const tabType = tab.type || 'claude-session';

          return (
            <div
              key={tabId}
              className={`tab-item ${tabType} ${tabId === activeTabId ? 'active' : ''}`}
              onClick={() => onSwitchTab(tabId)}
            >
              {renderTabLabel(tab)}
              <button
                className="tab-close"
                onClick={(e) => handleTabClose(e, tabId)}
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
          const tabId = getTabId(tab);

          return (
            <div
              key={tabId}
              className="tab-panel"
              style={{ display: tabId === activeTabId ? 'flex' : 'none' }}
            >
              {renderTabContent(tab)}
            </div>
          );
        })}
      </div>

      {/* Close confirmation modal (only for Claude sessions, not file tabs) */}
      {closeConfirm && !isFileTab(closeConfirm) && (
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
