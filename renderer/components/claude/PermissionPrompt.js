import React, { useState } from 'react';
import { Shield, ChevronDown, ChevronRight, Send } from 'lucide-react';

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

function PermissionPrompt({ tool, input, hasSuggestions, decisionReason, onRespond }) {
  const [expanded, setExpanded] = useState(false);
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customMessage, setCustomMessage] = useState('');
  const preview = formatPreview(input);

  const handleCustomSend = () => {
    if (!customMessage.trim()) return;
    onRespond('deny_with_message', customMessage.trim());
    setCustomMessage('');
    setShowCustomInput(false);
  };

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
          <button
            className="permission-bar-custom-toggle"
            onClick={() => setShowCustomInput(!showCustomInput)}
            title="Tell Claude what to do instead"
          >
            ...
          </button>
          <button className="permission-bar-deny" onClick={() => onRespond('deny')}>
            No
          </button>
          {hasSuggestions && (
            <button className="permission-bar-always" onClick={() => onRespond('allow_always')}>
              Yes, always
            </button>
          )}
          <button className="permission-bar-approve" onClick={() => onRespond('allow')}>
            Yes
          </button>
        </div>
      </div>
      {decisionReason && (
        <div className="permission-bar-reason">{decisionReason}</div>
      )}
      {expanded && input && (
        <div className="permission-bar-detail">
          <pre><code>{JSON.stringify(input, null, 2)}</code></pre>
        </div>
      )}
      {showCustomInput && (
        <div className="permission-bar-custom">
          <input
            className="permission-bar-custom-input"
            type="text"
            value={customMessage}
            onChange={(e) => setCustomMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleCustomSend();
              }
            }}
            placeholder="Tell Claude what to do instead..."
            autoFocus
          />
          <button
            className="permission-bar-custom-send"
            onClick={handleCustomSend}
            disabled={!customMessage.trim()}
          >
            <Send size={12} />
          </button>
        </div>
      )}
    </div>
  );
}

export default PermissionPrompt;
