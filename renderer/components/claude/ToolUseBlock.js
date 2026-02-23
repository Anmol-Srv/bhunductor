import React, { useState } from 'react';
import { ChevronRight, ChevronDown, Loader, Check, X, Terminal, Eye, Pencil, FolderOpen, Search, Globe, FileText } from 'lucide-react';

const TOOL_ICON_MAP = {
  'Bash': { icon: Terminal, color: 'var(--gate-caution)' },
  'Read': { icon: Eye, color: 'var(--conductor)' },
  'Write': { icon: Pencil, color: 'var(--stream-live)' },
  'Edit': { icon: Pencil, color: 'var(--stream-live)' },
  'Glob': { icon: FolderOpen, color: 'var(--conductor)' },
  'Grep': { icon: Search, color: 'var(--conductor)' },
  'WebFetch': { icon: Globe, color: 'var(--conductor)' },
  'WebSearch': { icon: Globe, color: 'var(--conductor)' },
  'Task': { icon: FileText, color: 'var(--ink-secondary)' },
};

function getToolIcon(toolName) {
  if (!toolName) return TOOL_ICON_MAP['Task'];
  // Handle MCP prefixes: mcp__server__ToolName → ToolName
  const baseName = toolName.includes('__') ? toolName.split('__').pop() : toolName;
  return TOOL_ICON_MAP[baseName] || TOOL_ICON_MAP['Task'];
}

function formatToolInput(toolInput) {
  if (!toolInput) return null;
  const keys = Object.keys(toolInput);
  if (keys.length === 0) return null;
  const primaryKey = keys.find(k => ['file_path', 'command', 'pattern', 'query', 'url', 'path', 'content'].includes(k)) || keys[0];
  const val = toolInput[primaryKey];
  if (typeof val === 'string') {
    const truncated = val.length > 80 ? val.substring(0, 80) + '\u2026' : val;
    return truncated;
  }
  return JSON.stringify(val);
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
  const [expanded, setExpanded] = useState(false);
  const toolIcon = getToolIcon(toolName);
  const ToolTypeIcon = toolIcon.icon;

  const statusIcon = () => {
    switch (status) {
      case 'running':
        return <Loader size={12} className="spinner tool-status-icon running" />;
      case 'complete':
        return <Check size={12} className="tool-status-icon complete status-pop" />;
      case 'error':
        return <X size={12} className="tool-status-icon error" />;
      default:
        return <Loader size={12} className="spinner tool-status-icon running" />;
    }
  };

  const primaryValue = formatToolInput(toolInput);
  const resultText = formatResult(result);

  return (
    <div className="tool-line">
      <div className="tool-line-header" onClick={() => setExpanded(!expanded)}>
        {expanded ? <ChevronDown size={12} className="tool-chevron" /> : <ChevronRight size={12} className="tool-chevron" />}
        {statusIcon()}
        <ToolTypeIcon size={12} className="tool-type-icon" style={{ color: toolIcon.color }} />
        <span className="tool-line-name">{toolName}</span>
        {primaryValue && <span className="tool-line-preview">{primaryValue}</span>}
      </div>
      {expanded && (
        <div className="tool-line-body slide-down">
          {toolInput && (
            <pre className="tool-line-code">{JSON.stringify(toolInput, null, 2)}</pre>
          )}
          {resultText && (
            <pre className={`tool-line-code ${isError ? 'error-text' : ''}`}>{resultText}</pre>
          )}
        </div>
      )}
    </div>
  );
}

export default ToolUseBlock;
