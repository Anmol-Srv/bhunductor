import React, { useState, useEffect } from 'react';
import Home from './pages/Home';
import Dashboard from './pages/Dashboard';

function App() {
  const [currentView, setCurrentView] = useState('home'); // 'home' | 'dashboard'
  const [currentFolder, setCurrentFolder] = useState(null);
  const [folderHistory, setFolderHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  /**
   * Navigate to a folder
   */
  const openFolder = (folder) => {
    setCurrentFolder(folder);
    setCurrentView('dashboard');

    // Add to history
    const newHistory = folderHistory.slice(0, historyIndex + 1);
    newHistory.push(folder);
    setFolderHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  /**
   * Go back to home
   */
  const goHome = () => {
    setCurrentView('home');
    setCurrentFolder(null);
  };

  /**
   * Navigate back in history
   */
  const goBack = () => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setCurrentFolder(folderHistory[newIndex]);
    } else {
      goHome();
    }
  };

  /**
   * Navigate forward in history
   */
  const goForward = () => {
    if (historyIndex < folderHistory.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setCurrentFolder(folderHistory[newIndex]);
    }
  };

  const canGoBack = historyIndex > 0 || currentView === 'dashboard';
  const canGoForward = historyIndex < folderHistory.length - 1;

  return (
    <div className="app">
      {currentView === 'home' ? (
        <Home onOpenFolder={openFolder} />
      ) : (
        <Dashboard
          folder={currentFolder}
          onGoHome={goHome}
          onGoBack={goBack}
          onGoForward={goForward}
          canGoBack={canGoBack}
          canGoForward={canGoForward}
        />
      )}
    </div>
  );
}

export default App;
