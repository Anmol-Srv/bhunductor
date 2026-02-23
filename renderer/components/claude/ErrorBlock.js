import React, { useState } from 'react';
import { AlertCircle, RefreshCw, XCircle, Wifi, Terminal, ChevronRight, ChevronDown, RotateCcw } from 'lucide-react';

const ERROR_CONFIG = {
  error_during_execution: { icon: AlertCircle, color: 'var(--gate-deny)', label: 'Error during execution' },
  error_max_turns: { icon: RefreshCw, color: 'var(--gate-caution)', label: 'Max turns reached' },
  error_max_budget_usd: { icon: XCircle, color: 'var(--gate-deny)', label: 'Budget limit reached' },
  network: { icon: Wifi, color: 'var(--gate-caution)', label: 'Network error' },
  cli_not_found: { icon: Terminal, color: 'var(--gate-deny)', label: 'CLI not found' },
  sdk_error: { icon: AlertCircle, color: 'var(--gate-deny)', label: 'SDK error' },
  unknown: { icon: AlertCircle, color: 'var(--gate-deny)', label: 'Error' }
};

function ErrorBlock({ text, errorType, isRecoverable, onRetry }) {
  const [expanded, setExpanded] = useState(false);
  const config = ERROR_CONFIG[errorType] || ERROR_CONFIG.unknown;
  const Icon = config.icon;

  return (
    <div className="error-block">
      <div className="error-block-header" onClick={() => setExpanded(!expanded)}>
        {expanded ? <ChevronDown size={12} className="error-block-chevron" /> : <ChevronRight size={12} className="error-block-chevron" />}
        <Icon size={13} className="error-block-icon" style={{ color: config.color }} />
        <span className="error-block-label" style={{ color: config.color }}>{config.label}</span>
        {isRecoverable && onRetry && (
          <button className="error-block-retry" onClick={(e) => { e.stopPropagation(); onRetry(); }}>
            <RotateCcw size={11} />
            Retry
          </button>
        )}
      </div>
      {expanded && text && (
        <div className="error-block-body">{text}</div>
      )}
    </div>
  );
}

export default ErrorBlock;
