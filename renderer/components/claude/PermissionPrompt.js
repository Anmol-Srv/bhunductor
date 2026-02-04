import React from 'react';
import { AlertTriangle, Check, X } from 'lucide-react';

function PermissionPrompt({ tool, input, onApprove, onDeny }) {
  return (
    <div className="modal-overlay">
      <div className="modal-content permission-prompt">
        <div className="modal-header">
          <AlertTriangle size={24} />
          <h2>Claude needs permission</h2>
        </div>

        <div className="modal-body">
          <p><strong>Tool:</strong> {tool}</p>
          <pre className="permission-input">{JSON.stringify(input, null, 2)}</pre>
        </div>

        <div className="modal-actions">
          <button className="btn-secondary" onClick={onDeny}>
            <X size={16} />
            Deny
          </button>
          <button className="btn-primary" onClick={onApprove}>
            <Check size={16} />
            Approve
          </button>
        </div>
      </div>
    </div>
  );
}

export default PermissionPrompt;
