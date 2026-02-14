import React, { useState, useEffect } from 'react';

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

function StreamLoader({ label }) {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setFrame(f => (f + 1) % FRAMES.length);
    }, 80);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="stream-loader">
      <span className="stream-loader-spinner">{FRAMES[frame]}</span>
      {label && <span className="stream-loader-label">{label}</span>}
    </div>
  );
}

export default StreamLoader;
