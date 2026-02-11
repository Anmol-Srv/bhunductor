import React, { useState } from 'react';
import { Wrench, ChevronRight, ChevronDown, Loader, Check, X } from 'lucide-react';

function formatToolInput(toolInput) {
  if (!toolInput) return null;
  // Show primary value inline in header
  const keys = Object.keys(toolInput);
  if (keys.length === 0) return null;
  // For common tools, show the most relevant field
  const primaryKey = keys.find(k => ['file_path', 'command', 'pattern', 'query', 'url', 'path', 'content'].includes(k)) || keys[0];
  const val = toolInput[primaryKey];
  if (typeof val === 'string' && val.length > 60) {
    return `${primaryKey}: ${val.substring(0, 60)}...`;
  }
  return `${primaryKey}: ${typeof val === 'string' ? val : JSON.stringify(val)}`;
}

function formatResult(result) {
  if (!result) return null;
  if (typeof result === 'string') return result;
  if (Array.isArray(result)) {
    return result.map(block => {
      if (block.type === 'text') return block.text;
      if (block.type === 'image') return '[image]';
      return JSON.stringify(block);
    }).join('\n');
  }
  return JSON.stringify(result, null, 2);
}

function ToolUseBlock({ toolName, toolInput, toolUseId, status, result, isError }) {
  const [collapsed, setCollapsed] = useState(true);

  const statusIcon = () => {
    switch (status) {
      case 'running':
        return <Loader size={14} className="spinner tool-use-status running" />;
      case 'complete':
        return <Check size={14} className="tool-use-status complete" />;
      case 'error':
        return <X size={14} className="tool-use-status error" />;
      default:
        return <Loader size={14} className="spinner tool-use-status running" />;
    }
  };

  const primaryValue = formatToolInput(toolInput);
  const resultText = formatResult(result);

  return (
    <div className={`tool-use-block ${isError ? 'error' : ''}`}>
      <div className="tool-use-header" onClick={() => setCollapsed(!collapsed)}>
        {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
        <Wrench size={14} />
        <span className="tool-use-name">{toolName}</span>
        {primaryValue && <span className="tool-use-primary">{primaryValue}</span>}
        {statusIcon()}
      </div>
      {!collapsed && (
        <div className="tool-use-body">
          {toolInput && (
            <div className="tool-use-section">
              <div className="tool-use-section-label">Input</div>
              <pre className="tool-use-code">{JSON.stringify(toolInput, null, 2)}</pre>
            </div>
          )}
          {resultText && (
            <div className="tool-use-section">
              <div className="tool-use-section-label">{isError ? 'Error' : 'Result'}</div>
              <pre className={`tool-use-code ${isError ? 'error-text' : ''}`}>{resultText}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default ToolUseBlock;
