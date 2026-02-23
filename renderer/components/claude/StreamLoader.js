import React, { useState, useEffect } from 'react';

const FRAMES = ['\u280B', '\u2819', '\u2839', '\u2838', '\u283C', '\u2834', '\u2826', '\u2827', '\u2807', '\u280F'];

function StreamLoader({ label, toolName }) {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setFrame(f => (f + 1) % FRAMES.length);
    }, 80);
    return () => clearInterval(id);
  }, []);

  const displayLabel = toolName
    ? `Running ${toolName}...`
    : label;

  return (
    <div className="stream-loader">
      <span className="stream-loader-spinner">{FRAMES[frame]}</span>
      {displayLabel && <span className="stream-loader-label">{displayLabel}</span>}
    </div>
  );
}

export default StreamLoader;
