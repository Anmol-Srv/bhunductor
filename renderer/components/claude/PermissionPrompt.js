import React from 'react';
import { AlertTriangle, Check, X, Wrench, Hash } from 'lucide-react';

function PermissionPrompt({ tool, input, sessionId, toolUseId, onApprove, onDeny }) {
  const inputPayload = input === undefined ? null : input;
  console.log('[PermissionPrompt] modal open with data:', {
    tool,
    input: inputPayload,
    sessionId,
    toolUseId
  });

  return (
    <div className="modal-overlay">
      <div className="modal-content permission-prompt">
        <div className="modal-header">
          <AlertTriangle size={24} />
          <h2>Tool Permission Request</h2>
        </div>

        <div className="modal-body">
          <div className="permission-info">
            <div className="info-row">
              <Wrench size={16} className="info-icon" />
              <div className="info-content">
                <span className="info-label">Tool Name:</span>
                <span className="info-value">{tool || 'Unknown'}</span>
              </div>
            </div>

            {toolUseId && (
              <div className="info-row">
                <Hash size={16} className="info-icon" />
                <div className="info-content">
                  <span className="info-label">Tool Use ID:</span>
                  <span className="info-value tool-id">{toolUseId}</span>
                </div>
              </div>
            )}

            {sessionId && (
              <div className="info-row">
                <div className="info-content">
                  <span className="info-label">Session:</span>
                  <span className="info-value">{sessionId.slice(0, 8)}</span>
                </div>
              </div>
            )}
          </div>

          <div className="permission-section">
            <h3>Parameters</h3>
            {inputPayload !== null ? (
              <pre className="permission-input">
                <code>{JSON.stringify(inputPayload, null, 2)}</code>
              </pre>
            ) : (
              <p className="permission-input-unavailable">Tool input details not available</p>
            )}
          </div>

          <div className="permission-warning">
            <AlertTriangle size={14} />
            <span>Claude is requesting permission to use this tool with the parameters shown above.</span>
          </div>
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
