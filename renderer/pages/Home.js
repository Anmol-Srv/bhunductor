import React, { useState, useEffect } from 'react';
import { Folder, FolderOpen } from 'lucide-react';

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

  /**
   * Format timestamp to relative time
   */
  const formatRelativeTime = (timestamp) => {
    const now = new Date();
    const date = new Date(timestamp);
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="home">
      <div className="home-content">
        <h1 className="logo">Bhunductor</h1>

        {error && (
          <div className="error-banner">
            {error}
          </div>
        )}

        {!loading && recentFolders.length > 0 && (
          <div className="recent-section">
            <h2 className="recent-title">Recent Folders</h2>
            <div className="recent-list">
              {recentFolders.map((folder) => (
                <div
                  key={folder.id}
                  className="folder-item"
                  onClick={() => handleRecentFolderClick(folder)}
                >
                  <div className="folder-item-header">
                    <Folder size={18} className="folder-icon" />
                    <span className="folder-name">{folder.name}</span>
                    <span className="folder-time">
                      {formatRelativeTime(folder.last_opened)}
                    </span>
                  </div>
                  <div className="folder-path">{folder.path}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <button
          className="open-button"
          onClick={handleOpenFolder}
        >
          + Open Folder
        </button>
      </div>
    </div>
  );
}

export default Home;
