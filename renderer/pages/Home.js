import React, { useState, useEffect } from 'react';
import { Folder, FolderOpen } from 'lucide-react';
import { formatRelativeTime } from '../utils/time';

function Home({ onOpenFolder }) {
  const [recentFolders, setRecentFolders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  /**
   * Load recent folders on mount
   */
  useEffect(() => {
    loadRecentFolders();
  }, []);

  const loadRecentFolders = async () => {
    try {
      setLoading(true);
      const folders = await window.electron.invoke('folder:get-recent');
      setRecentFolders(folders || []);
    } catch (err) {
      console.error('Error loading recent folders:', err);
      setError('Failed to load recent folders');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Open folder dialog
   */
  const handleOpenFolder = async () => {
    try {
      setError(null);
      const result = await window.electron.invoke('folder:open-dialog');

      if (result.canceled) {
        return;
      }

      if (result.error) {
        setError(result.error);
        return;
      }

      if (result.folder) {
        onOpenFolder(result.folder);
      }
    } catch (err) {
      console.error('Error opening folder:', err);
      setError('Failed to open folder');
    }
  };

  /**
   * Open a recent folder
   */
  const handleRecentFolderClick = (folder) => {
    onOpenFolder(folder);
  };

  return (
    <div className="home">
      <div className="home-content">
        <div className="home-header">
          <h1 className="home-logo">Bhunductor</h1>
          <p className="home-tagline">AI-powered development workspace</p>
        </div>

        {error && (
          <div className="error-banner">
            {error}
          </div>
        )}

        <div className="home-main">
          {!loading && recentFolders.length > 0 && (
            <div className="home-recent-section">
              <h2 className="home-section-title">Recent</h2>
              <div className="home-recent-list">
                {recentFolders.map((folder, idx) => (
                  <button
                    key={folder.id}
                    className="home-recent-item"
                    onClick={() => handleRecentFolderClick(folder)}
                    style={{ animationDelay: `${idx * 50}ms` }}
                  >
                    <Folder size={14} />
                    <div className="home-recent-item-text">
                      <span className="home-recent-name">{folder.name}</span>
                      <span className="home-recent-path">{folder.path}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="home-start-section">
            <h2 className="home-section-title">Start</h2>
            <button
              className="home-action-item"
              onClick={handleOpenFolder}
            >
              <FolderOpen size={16} />
              <span>Open Folder...</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Home;
