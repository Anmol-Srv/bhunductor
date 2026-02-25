import React, { useState } from 'react';
import { ChevronRight, ChevronDown, Loader, X, Wrench } from 'lucide-react';
import ToolUseBlock from './ToolUseBlock';

function getToolNamesPreview(tools) {
  const names = tools.map(t => {
    const name = t.toolName || 'Unknown';
    // Strip MCP prefix: mcp__server__Tool → Tool
    return name.includes('__') ? name.split('__').pop() : name;
  });
  const unique = [...new Set(names)];
  if (unique.length <= 2) return unique.join(', ');
  return `${unique.slice(0, 2).join(', ')} +${unique.length - 2} more`;
}

function ToolCallGroup({ tools }) {
  const [expanded, setExpanded] = useState(false);

  const hasRunning = tools.some(t => t.status === 'running');
  const hasError = tools.some(t => t.status === 'error');
  const allComplete = tools.every(t => t.status === 'complete');

  const iconColor = allComplete ? 'var(--stream-live)' : hasError ? 'var(--gate-deny)' : 'var(--ink-secondary)';

  const completedCount = tools.filter(t => t.status === 'complete').length;
  const label = hasRunning
    ? `${completedCount}/${tools.length} tool calls`
    : `${tools.length} tool calls`;
  const namesPreview = getToolNamesPreview(tools);

  return (
    <div className="tool-call-group">
      <div className="tool-call-group-header" onClick={() => setExpanded(!expanded)}>
        {expanded ? <ChevronDown size={12} className="tool-chevron" /> : <ChevronRight size={12} className="tool-chevron" />}
        {hasError ? (
          <X size={12} className="tool-status-icon error" />
        ) : (
          <Wrench size={12} className="tool-type-icon" style={{ color: iconColor }} />
        )}
        {hasRunning && <Loader size={12} className="spinner tool-status-icon running" />}
        <span className="tool-call-group-label">{label}</span>
        {!expanded && (
          <span className="tool-call-group-names">{namesPreview}</span>
        )}
      </div>
      {expanded && (
        <div className="tool-call-group-body slide-down">
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
