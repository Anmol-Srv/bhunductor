import React, { useState } from 'react';
import { ChevronRight, ChevronDown, Loader, Check, X } from 'lucide-react';
import ToolUseBlock from './ToolUseBlock';

function ToolCallGroup({ tools }) {
  const [expanded, setExpanded] = useState(false);

  const hasRunning = tools.some(t => t.status === 'running');
  const hasError = tools.some(t => t.status === 'error');
  const allComplete = tools.every(t => t.status === 'complete');

  const groupIcon = () => {
    if (hasRunning) return <Loader size={12} className="spinner tool-status-icon running" />;
    if (hasError) return <X size={12} className="tool-status-icon error" />;
    if (allComplete) return <Check size={12} className="tool-status-icon complete" />;
    return <Loader size={12} className="spinner tool-status-icon running" />;
  };

  const completedCount = tools.filter(t => t.status === 'complete').length;
  const label = hasRunning
    ? `${completedCount}/${tools.length} tool calls`
    : `${tools.length} tool calls`;

  return (
    <div className="tool-call-group">
      <div className="tool-call-group-header" onClick={() => setExpanded(!expanded)}>
        {expanded ? <ChevronDown size={12} className="tool-chevron" /> : <ChevronRight size={12} className="tool-chevron" />}
        {groupIcon()}
        <span className="tool-call-group-label">{label}</span>
      </div>
      {expanded && (
        <div className="tool-call-group-body">
          {tools.map((tool, idx) => (
            <ToolUseBlock
              key={tool.toolUseId || idx}
              toolName={tool.toolName}
              toolInput={tool.toolInput}
              toolUseId={tool.toolUseId}
              status={tool.status}
              result={tool.result}
              isError={tool.isError}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default ToolCallGroup;
