import React from 'react';

function WelcomeBanner({ model = 'Sonnet 4.5', modelVersion, branchName }) {
  const displayText = modelVersion ? `${model} (${modelVersion})` : model;

  return (
    <div className="welcome-banner">
      <div className="welcome-text">
        <span className="welcome-model">{displayText}</span>
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
