import React from 'react';
import FileTreeExplorer from './FileTreeExplorer';

function RightPanel({ activeWorktree, onFileOpen }) {
  return (
    <div className="right-panel">
      <div className="files-section">
        {activeWorktree ? (
          <FileTreeExplorer
            worktreeId={activeWorktree.id}
            onFileOpen={onFileOpen}
            collapsed={false}
          />
        ) : (
          <>
            <div className="section-header">Files and Folders</div>
            <div className="placeholder">
              Select a worktree to view files
            </div>
          </>
        )}
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
