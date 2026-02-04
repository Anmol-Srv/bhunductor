import React, { useState } from 'react';
import { X } from 'lucide-react';

function CreateBranchModal({ isOpen, onClose, onSubmit }) {
  const [branchName, setBranchName] = useState('');
  const [error, setError] = useState('');
  const [isValidating, setIsValidating] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!branchName.trim()) {
      setError('Branch name is required');
      return;
    }

    // Validate via IPC
    setIsValidating(true);
    try {
      const validation = await window.electron.invoke('worktree:validate-name', branchName);
      setIsValidating(false);

      if (!validation.valid) {
        setError(validation.error);
        return;
      }

      // Submit
      await onSubmit(branchName);
      setBranchName('');
      onClose();
    } catch (err) {
      setIsValidating(false);
      setError(err.message || 'Failed to create branch');
    }
  };

  const handleClose = () => {
    setBranchName('');
    setError('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Create New Branch</h2>
          <button className="modal-close" onClick={handleClose}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-group">
              <label htmlFor="branch-name">Branch Name</label>
              <input
                id="branch-name"
                type="text"
                value={branchName}
                onChange={e => setBranchName(e.target.value)}
                placeholder="feature/my-branch"
                autoFocus
                disabled={isValidating}
              />
              {error && <div className="error-message">{error}</div>}
              <div className="help-text">
                Use lowercase letters, numbers, hyphens, and slashes
              </div>
            </div>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={handleClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={isValidating}>
              {isValidating ? 'Validating...' : 'Create Branch'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CreateBranchModal;
