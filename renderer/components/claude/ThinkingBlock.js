import React, { useState } from 'react';
import { Brain, ChevronRight, ChevronDown } from 'lucide-react';

function ThinkingBlock({ thinking, isPartial }) {
  const [expanded, setExpanded] = useState(false);

  // Truncate thinking preview for the header
  const preview = thinking
    ? (thinking.length > 60 ? thinking.substring(0, 60) + '\u2026' : thinking)
    : '';

  return (
    <div className="thinking-line">
      <div className="thinking-line-header" onClick={() => setExpanded(!expanded)}>
        {expanded ? <ChevronDown size={12} className="thinking-chevron" /> : <ChevronRight size={12} className="thinking-chevron" />}
        <Brain size={12} className="thinking-icon" />
        <span className="thinking-label">
          Thinking{isPartial ? <span className="thinking-dots">...</span> : ''}
        </span>
        {!expanded && preview && (
          <span className="thinking-preview">{preview}</span>
        )}
      </div>
      {expanded && (
        <div className="thinking-line-body">
          {thinking}
        </div>
      )}
    </div>
  );
}

export default ThinkingBlock;
