import React, { useState } from 'react';
import { Brain, ChevronRight, ChevronDown } from 'lucide-react';

function ThinkingBlock({ thinking, isPartial }) {
  const [collapsed, setCollapsed] = useState(true);

  return (
    <div className="thinking-block">
      <div className="thinking-header" onClick={() => setCollapsed(!collapsed)}>
        {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
        <Brain size={14} />
        <span>
          Thinking{isPartial ? <span className="thinking-dots">...</span> : ''}
        </span>
      </div>
      {!collapsed && (
        <div className="thinking-body">
          {thinking}
        </div>
      )}
    </div>
  );
}

export default ThinkingBlock;
