import React from 'react';
import { X, AlertTriangle } from 'lucide-react';

function DeleteConfirmModal({ isOpen, branchName, onConfirm, onCancel }) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Delete Branch</h2>
          <button className="modal-close" onClick={onCancel}>
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          <div className="warning-icon">
            <AlertTriangle size={48} />
          </div>
          <p>Are you sure you want to delete the branch <strong>{branchName}</strong>?</p>
          <p className="warning-text">This will remove the worktree and all uncommitted changes will be lost.</p>
        </div>

        <div className="modal-actions">
          <button className="btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn-danger" onClick={onConfirm}>
            Delete Branch
          </button>
        </div>
      </div>
    </div>
  );
}

export default DeleteConfirmModal;
