import React, { useState } from 'react';
import { Shield, ChevronDown, ChevronRight } from 'lucide-react';

function formatPreview(input) {
  if (!input) return null;
  const keys = Object.keys(input);
  if (keys.length === 0) return null;
  const key = keys.find(k => ['command', 'file_path', 'pattern', 'query', 'url', 'path', 'content'].includes(k)) || keys[0];
  const val = input[key];
  if (typeof val === 'string') {
    return val.length > 60 ? val.substring(0, 60) + '\u2026' : val;
  }
  return null;
}

function PermissionPrompt({ tool, input, onApprove, onDeny }) {
  const [expanded, setExpanded] = useState(false);
  const preview = formatPreview(input);

  return (
    <div className="permission-bar">
      <div className="permission-bar-row">
        <button className="permission-bar-toggle" onClick={() => setExpanded(!expanded)}>
          {expanded
            ? <ChevronDown size={12} />
            : <ChevronRight size={12} />}
        </button>
        <Shield size={14} className="permission-bar-icon" />
        <span className="permission-bar-tool">{tool || 'Unknown'}</span>
        {preview && !expanded && <span className="permission-bar-preview">{preview}</span>}
        <div className="permission-bar-actions">
          <button className="permission-bar-deny" onClick={onDeny}>
            Deny
          </button>
          <button className="permission-bar-approve" onClick={onApprove}>
            Allow
          </button>
        </div>
      </div>
      {expanded && input && (
        <div className="permission-bar-detail">
          <pre><code>{JSON.stringify(input, null, 2)}</code></pre>
        </div>
      )}
    </div>
  );
}

export default PermissionPrompt;
