import React from 'react';
import { ChevronLeft, ChevronRight, Home, GitPullRequest, GitMerge } from 'lucide-react';

function Header({ folderName, folderPath, onGoHome, onGoBack, onGoForward, canGoBack, canGoForward, openPR, mergedPR }) {
  const handleOpenPR = (pr) => {
    if (pr?.url) {
      window.electron.invoke('app:open-external', pr.url);
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
        <button className="header-pr-badge" onClick={() => handleOpenPR(openPR)} title={openPR.title}>
          <GitPullRequest size={13} />
          PR #{openPR.number}
        </button>
      )}

      {!openPR && mergedPR && (
        <button className="header-pr-badge header-pr-badge-merged" onClick={() => handleOpenPR(mergedPR)} title={mergedPR.title}>
          <GitMerge size={13} />
          PR #{mergedPR.number}
        </button>
      )}
    </div>
  );
}

export default Header;
