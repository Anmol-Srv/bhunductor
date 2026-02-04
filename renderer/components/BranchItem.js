import React from 'react';
import { GitBranch, MoreVertical, Trash2 } from 'lucide-react';

function BranchItem({ worktree, isActive, onSelect, onDelete, menuOpen, onMenuToggle }) {
  const isMain = worktree.is_main === 1;

  return (
    <div className={`branch-item ${isActive ? 'active' : ''}`}>
      <div className="branch-content" onClick={onSelect}>
        <GitBranch size={16} className="branch-icon" />
        <span className="branch-name">{worktree.branch_name}</span>
        {isMain && <span className="main-badge">main</span>}
      </div>

      {!isMain && (
        <div className="branch-actions">
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
        </div>
      )}
    </div>
  );
}

export default BranchItem;
