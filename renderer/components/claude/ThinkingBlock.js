import React, { useState, useEffect, useRef } from 'react';
import { ChevronRight, ChevronDown, Brain, Loader } from 'lucide-react';

function ThinkingBlock({ thinking, isPartial }) {
  const [expanded, setExpanded] = useState(false);
  const [frame, setFrame] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(null);

  useEffect(() => {
    if (!isPartial) return;
    if (!startRef.current) startRef.current = Date.now();
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [isPartial]);

  // Freeze elapsed when thinking completes
  useEffect(() => {
    if (!isPartial && startRef.current) {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }
  }, [isPartial]);

  const preview = thinking
    ? (thinking.length > 80 ? thinking.substring(0, 80) + '\u2026' : thinking)
    : '';

  return (
    <div className="thinking-line">
      <div className="thinking-line-header" onClick={() => setExpanded(!expanded)}>
        {expanded ? <ChevronDown size={12} className="thinking-chevron" /> : <ChevronRight size={12} className="thinking-chevron" />}
        <Brain size={13} className={`thinking-brain ${isPartial ? 'active' : 'done'}`} />
        {isPartial && <Loader size={12} className="spinner thinking-loader" />}
        <span className="thinking-label">Thinking</span>
        {elapsed > 0 && (
          <span className="thinking-elapsed">{elapsed}s</span>
        )}
        {!expanded && preview && (
          <span className="thinking-preview">{preview}</span>
        )}
      </div>
      {expanded && (
        <div className="thinking-line-body slide-down">
          {thinking}
        </div>
      )}
    </div>
  );
}

export default ThinkingBlock;
