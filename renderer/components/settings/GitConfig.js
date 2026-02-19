import React, { useState, useEffect } from 'react';

function GitConfig({ repoPath }) {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!repoPath) { setLoading(false); return; }
    (async () => {
      try {
        const result = await window.electron.invoke('git:get-config', repoPath);
        if (result.success) setConfig(result);
      } catch (err) {
        console.error('[Settings] Failed to load git config:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [repoPath]);

  if (!repoPath || loading) return null;
  if (!config) return null;

  const rows = [
    { label: 'user.name', desc: 'Local git author name', value: config.userName },
    { label: 'user.email', desc: 'Local git author email', value: config.userEmail },
    { label: 'Current branch', value: config.defaultBranch },
    { label: 'Remote origin', value: config.remoteUrl }
  ].filter(r => r.value);

  if (rows.length === 0) return null;

  return (
    <div className="settings-rows">
      {rows.map(row => (
        <div key={row.label} className="settings-row">
          <div className="settings-row-text">
            <span className="settings-row-label">{row.label}</span>
            {row.desc && <span className="settings-row-desc">{row.desc}</span>}
          </div>
          <span className="settings-row-value mono">{row.value}</span>
        </div>
      ))}
    </div>
  );
}

export default GitConfig;
