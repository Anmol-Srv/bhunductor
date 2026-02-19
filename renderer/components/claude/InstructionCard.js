import React, { useState } from 'react';
import { FileText, ChevronDown, ChevronUp } from 'lucide-react';
import MarkdownRenderer from './MarkdownRenderer';

function InstructionCard({ text, meta }) {
  const [expanded, setExpanded] = useState(false);
  const { label, fileName } = meta || {};

  // First line preview (truncated)
  const firstLine = text.split('\n')[0] || '';
  const preview = firstLine.length > 60 ? firstLine.slice(0, 60) + '...' : firstLine;

  return (
    <div className="chat-user-msg instruction-card">
      <div
        className={`instruction-attachment ${expanded ? 'expanded' : ''}`}
        onClick={() => setExpanded(prev => !prev)}
      >
        <div className="instruction-attachment-header">
          <FileText size={14} className="instruction-attachment-icon" />
          <span className="instruction-attachment-title">{fileName || 'Instructions.md'}</span>
          {expanded
            ? <ChevronUp size={14} className="instruction-attachment-chevron" />
            : <ChevronDown size={14} className="instruction-attachment-chevron" />
          }
        </div>
        {!expanded && (
          <div className="instruction-attachment-preview">{preview}</div>
        )}
        {expanded && (
          <div className="instruction-attachment-body" onClick={e => e.stopPropagation()}>
            <MarkdownRenderer content={text} />
          </div>
        )}
      </div>
      {label && <div className="instruction-label">{label}</div>}
    </div>
  );
}

export default InstructionCard;
