import React from 'react';
import { X, AlertTriangle } from 'lucide-react';

function DeleteConfirmModal({ isOpen, branchName, onConfirm, onCancel }) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '340px' }}>
        <div className="modal-header" style={{ padding: 'var(--spacing-md)' }}>
          <h2 style={{ fontSize: 'var(--text-md)' }}>Delete branch?</h2>
          <button className="modal-close" onClick={onCancel}>
            <X size={16} />
          </button>
        </div>

        <div className="modal-body" style={{ padding: '0 var(--spacing-md) var(--spacing-md)' }}>
          <p style={{ margin: 0, fontSize: 'var(--text-base)', lineHeight: 1.4, color: 'var(--ink)' }}>
            Are you sure you want to delete <strong>{branchName}</strong>?
          </p>
          <p className="warning-text" style={{ marginTop: 'var(--spacing-xs)', fontSize: 'var(--text-sm)', color: 'var(--ink-muted)', lineHeight: 1.4 }}>
            This worktree will be removed and any uncommitted changes will be lost.
          </p>
        </div>

        <div className="modal-actions" style={{ padding: 'var(--spacing-md)', gap: 'var(--spacing-sm)' }}>
          <button className="btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn-danger" onClick={onConfirm}>
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

export default DeleteConfirmModal;
