import React from 'react';
import { ChevronLeft, ChevronRight, Home, Settings, GitPullRequest } from 'lucide-react';
import useUIStore from '../stores/uiStore';

function Header({ folderName, folderPath, onGoHome, onGoBack, onGoForward, canGoBack, canGoForward, openPR }) {
  const handleOpenPR = () => {
    if (openPR?.url) {
      window.electron.invoke('app:open-external', openPR.url);
    }
  };

  return (
    <div className="header">
      <div className="nav-buttons">
        <button className="nav-btn" onClick={onGoBack} disabled={!canGoBack} title="Go back">
          <ChevronLeft size={18} />
        </button>
        <button className="nav-btn" onClick={onGoForward} disabled={!canGoForward} title="Go forward">
          <ChevronRight size={18} />
        </button>
        <button className="nav-btn home-btn" onClick={onGoHome} title="Go home">
          <Home size={16} />
        </button>
      </div>

      <div className="breadcrumb">
        <span className="breadcrumb-folder" title={folderPath}>
          {folderName}
        </span>
      </div>

      <div className="header-spacer"></div>

      {openPR && (
        <button className="header-pr-badge" onClick={handleOpenPR} title={openPR.title}>
          <GitPullRequest size={13} />
          PR #{openPR.number}
        </button>
      )}

      <button
        className="nav-btn settings-btn"
        onClick={() => useUIStore.getState().toggleSettings()}
        title="Settings"
      >
        <Settings size={16} />
      </button>
    </div>
  );
}

export default Header;
