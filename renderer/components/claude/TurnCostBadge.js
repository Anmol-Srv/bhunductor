import React from 'react';

function formatCost(costUsd) {
  if (!costUsd && costUsd !== 0) return null;
  if (costUsd < 0.01) return `$${costUsd.toFixed(4)}`;
  return `$${costUsd.toFixed(2)}`;
}

function formatTokens(usage) {
  if (!usage) return null;
  const total = (usage.input_tokens || 0) + (usage.output_tokens || 0);
  if (total >= 1000) return `${(total / 1000).toFixed(1)}k tokens`;
  return `${total} tokens`;
}

function formatDuration(ms) {
  if (!ms) return null;
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${ms}ms`;
}

function TurnCostBadge({ costUsd, usage, durationMs }) {
  const parts = [
    formatCost(costUsd),
    formatTokens(usage),
    formatDuration(durationMs)
  ].filter(Boolean);

  if (parts.length === 0) return null;

  return (
    <div className="turn-cost-badge">
      {parts.join(' \u00B7 ')}
    </div>
  );
}

export default TurnCostBadge;
