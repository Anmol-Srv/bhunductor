import React from 'react';
import { GitBranch, Folder, Cpu } from 'lucide-react';
import BhunductorLogo from '../BhunductorLogo';

function WelcomeBanner({ model = 'Opus 4.6', branchName, folderName }) {
  return (
    <div className="welcome-banner">
      <div className="welcome-banner-logo-wrap">
        <BhunductorLogo size={14} animated />
      </div>

      <span className="welcome-banner-text">
        System session initialized with <span className="welcome-banner-highlight"><Cpu size={10} /> {model}</span>
      </span>

      {(branchName || folderName) && (
        <>
          <span className="welcome-banner-sep">|</span>
          <div className="welcome-banner-context">
            {folderName && (
              <span className="welcome-banner-tag" title="Workspace">
                <Folder size={10} /> {folderName}
              </span>
            )}
            {branchName && (
              <span className="welcome-banner-tag" title="Branch">
                <GitBranch size={10} /> {branchName}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default WelcomeBanner;
