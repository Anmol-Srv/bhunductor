import React, { useState, useEffect } from 'react';

const MODELS = [
  { value: 'claude-sonnet-4-6', label: 'Sonnet 4.6' },
  { value: 'claude-opus-4-6', label: 'Opus 4.6' },
  { value: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5' }
];

function AppSettings() {
  const [config, setConfig] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const cfg = await window.electron.invoke('config:get');
        setConfig(cfg || {});
      } catch (err) {
        console.error('[Settings] Failed to load app config:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleModelChange = async (e) => {
    const model = e.target.value;
    await window.electron.invoke('config:set', 'defaultModel', model);
    setConfig(prev => ({ ...prev, defaultModel: model }));
  };

  if (loading) return <div className="settings-rows"><span className="settings-card-loading">Loading...</span></div>;

  return (
    <div className="settings-rows">
      <div className="settings-row">
        <div className="settings-row-text">
          <span className="settings-row-label">Default model</span>
          <span className="settings-row-desc">Model used for new chat sessions</span>
        </div>
        <select
          className="settings-select"
          value={config.defaultModel || 'claude-sonnet-4-6'}
          onChange={handleModelChange}
        >
          {MODELS.map(m => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

export default AppSettings;
