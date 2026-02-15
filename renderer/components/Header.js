import React from 'react';
import { ChevronLeft, ChevronRight, Home } from 'lucide-react';

function Header({ folderName, folderPath, onGoHome, onGoBack, onGoForward, canGoBack, canGoForward }) {
  return (
    <div className="header">
      <div className="nav-buttons">
        <button
          className="nav-btn"
          onClick={onGoBack}
          disabled={!canGoBack}
          title="Go back"
        >
          <ChevronLeft size={18} />
        </button>
        <button
          className="nav-btn"
          onClick={onGoForward}
          disabled={!canGoForward}
          title="Go forward"
        >
          <ChevronRight size={18} />
        </button>
        <button
          className="nav-btn home-btn"
          onClick={onGoHome}
          title="Go home"
        >
          <Home size={16} />
        </button>
      </div>

      <div className="breadcrumb">
        <span className="breadcrumb-folder" title={folderPath}>
          {folderName}
        </span>
      </div>

      <div className="header-spacer"></div>
    </div>
  );
}

export default Header;
