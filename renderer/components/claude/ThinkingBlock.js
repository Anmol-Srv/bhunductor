import React, { useState, useEffect } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

function ThinkingBlock({ thinking, isPartial }) {
  const [expanded, setExpanded] = useState(false);
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (!isPartial) return;
    const id = setInterval(() => {
      setFrame(f => (f + 1) % FRAMES.length);
    }, 80);
    return () => clearInterval(id);
  }, [isPartial]);

  const preview = thinking
    ? (thinking.length > 80 ? thinking.substring(0, 80) + '\u2026' : thinking)
    : '';

  return (
    <div className="thinking-line">
      <div className="thinking-line-header" onClick={() => setExpanded(!expanded)}>
        {expanded ? <ChevronDown size={12} className="thinking-chevron" /> : <ChevronRight size={12} className="thinking-chevron" />}
        {isPartial
          ? <span className="thinking-spinner">{FRAMES[frame]}</span>
          : <span className="thinking-done">✓</span>}
        <span className="thinking-label">Thinking</span>
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
