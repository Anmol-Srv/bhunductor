import React from 'react';

function WelcomeBanner({ model = 'Sonnet 4.5', branchName }) {
  return (
    <div className="welcome-banner">
      <div className="welcome-text">
        <span className="welcome-model">{model}</span>
        {branchName && (
          <>
            <span className="welcome-separator">·</span>
            <span className="welcome-branch">⎇ {branchName}</span>
          </>
        )}
      </div>
    </div>
  );
}

export default WelcomeBanner;
