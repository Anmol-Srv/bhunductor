import React, { useState, useEffect, useRef } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';

const FRAMES = ['\u280B', '\u2819', '\u2839', '\u2838', '\u283C', '\u2834', '\u2826', '\u2827', '\u2807', '\u280F'];

function ThinkingBlock({ thinking, isPartial }) {
  const [expanded, setExpanded] = useState(false);
  const [frame, setFrame] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(null);

  useEffect(() => {
    if (!isPartial) return;
    if (!startRef.current) startRef.current = Date.now();
    const id = setInterval(() => {
      setFrame(f => (f + 1) % FRAMES.length);
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 80);
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
        {isPartial
          ? <span className="thinking-spinner">{FRAMES[frame]}</span>
          : <span className="thinking-done">{'\u2713'}</span>}
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
