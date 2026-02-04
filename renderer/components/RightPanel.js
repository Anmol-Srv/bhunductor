import React from 'react';

function RightPanel() {
  return (
    <div className="right-panel">
      <div className="files-section">
        <div className="section-header">Files and Folders</div>
        <div className="placeholder">
          Files and folders content
        </div>
      </div>

      <div className="terminal-section">
        <div className="section-header">Terminal</div>
        <div className="placeholder">
          Terminal content
        </div>
      </div>
    </div>
  );
}

export default RightPanel;
