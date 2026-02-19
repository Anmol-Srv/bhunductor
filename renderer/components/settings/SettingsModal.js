import React, { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, GitBranch, Sliders, Info } from 'lucide-react';
import useUIStore from '../../stores/uiStore';
import GitProfile from './GitProfile';
import AppSettings from './AppSettings';

const NAV_ITEMS = [
  { id: 'general', label: 'General', icon: Sliders },
  { id: 'git', label: 'Git', icon: GitBranch },
  { id: 'about', label: 'About', icon: Info },
];

const SECTION_TITLES = {
  general: 'General',
  git: 'Git',
  about: 'About',
};

function SettingsModal({ folderPath }) {
  const [activeSection, setActiveSection] = useState('general');
  const closeSettings = useUIStore(s => s.closeSettings);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') closeSettings();
  }, [closeSettings]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) closeSettings();
  };

  return (
    <div className="settings-backdrop" onClick={handleBackdropClick}>
      <div className="settings-modal">
        <div className="settings-sidebar">
          <button className="settings-back" onClick={closeSettings}>
            <ArrowLeft size={14} />
            Back to app
          </button>

          <nav className="settings-nav">
            {NAV_ITEMS.map(item => (
              <button
                key={item.id}
                className={`settings-nav-item ${activeSection === item.id ? 'active' : ''}`}
                onClick={() => setActiveSection(item.id)}
              >
                <item.icon size={15} />
                {item.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="settings-content">
          {activeSection !== 'git' && (
            <h1 className="settings-page-title">{SECTION_TITLES[activeSection]}</h1>
          )}

          {activeSection === 'general' && <AppSettings />}
          {activeSection === 'git' && <GitProfile />}
          {activeSection === 'about' && <AboutSection />}
        </div>
      </div>
    </div>
  );
}

function AboutSection() {
  const [appVersion, setAppVersion] = useState('');

  useEffect(() => {
    window.electron.invoke('app:get-version').then(v => setAppVersion(v || ''));
  }, []);

  return (
    <div className="settings-rows">
      <div className="settings-row">
        <div className="settings-row-text">
          <span className="settings-row-label">Version</span>
        </div>
        <span className="settings-row-value">{appVersion || '—'}</span>
      </div>
      <div className="settings-row">
        <div className="settings-row-text">
          <span className="settings-row-label">Data location</span>
          <span className="settings-row-desc">Database, config, and session data</span>
        </div>
        <span className="settings-row-value mono">~/.bhunductor/</span>
      </div>
      <div className="settings-row">
        <div className="settings-row-text">
          <span className="settings-row-label">Platform</span>
        </div>
        <span className="settings-row-value">{window.electron.platform}</span>
      </div>
    </div>
  );
}

export default SettingsModal;
