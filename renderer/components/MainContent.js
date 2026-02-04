import React from 'react';
import ClaudeChat from './claude/ClaudeChat';

function MainContent({ currentSessionId, activeSessions, onSwitchSession, onStopSession }) {
  if (!currentSessionId) {
    return (
      <div className="main-content">
        <div className="empty-state">
          <h2>No Active Claude Session</h2>
          <p>Click "Start Session" in the sidebar to begin</p>
        </div>
      </div>
    );
  }

  return (
    <div className="main-content">
      <ClaudeChat
        sessionId={currentSessionId}
        activeSessions={activeSessions}
        onSwitchSession={onSwitchSession}
        onStopSession={onStopSession}
      />
    </div>
  );
}

export default MainContent;
