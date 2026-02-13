import React, { useState, useEffect } from 'react';
import { File, FileText, Folder, FolderOpen, ChevronRight, ChevronDown, RefreshCw } from 'lucide-react';

/**
 * File tree explorer for active worktree
 * Shows files with git status indicators
 */
function FileTreeExplorer({ worktreeId, onFileOpen, collapsed = false }) {
  const [treeData, setTreeData] = useState(null);
  const [gitStatus, setGitStatus] = useState({});
  const [loading, setLoading] = useState(false);
  const [expandedPaths, setExpandedPaths] = useState(new Set());
  const [error, setError] = useState(null);

  useEffect(() => {
    if (worktreeId && !collapsed) {
      loadFileTree();
    }
  }, [worktreeId, collapsed]);

  const loadFileTree = async () => {
    console.log('[FileTreeExplorer] Loading file tree for worktree:', worktreeId);
    setLoading(true);
    setError(null);
    try {
      const result = await window.electron.invoke('file:tree-get', worktreeId);
      console.log('[FileTreeExplorer] File tree result:', result);
      if (result.success) {
        setTreeData(result.tree);
        // Convert git status array to map for quick lookup
        const statusMap = {};
        result.gitStatus.forEach(file => {
          statusMap[file.path] = file.status;
        });
        setGitStatus(statusMap);
      } else {
        setError(result.error || 'Failed to load file tree');
      }
    } catch (error) {
      console.error('Failed to load file tree:', error);
      setError(error.message || 'Failed to load file tree');
    } finally {
      setLoading(false);
    }
  };

  const handleFileClick = (node) => {
    if (node.isDirectory) {
      toggleExpanded(node.relativePath);
    } else {
      const hasChanges = !!gitStatus[node.relativePath];
      onFileOpen({
        filePath: node.path,
        relativePath: node.relativePath,
        fileName: node.name,
        hasChanges,
        changeType: gitStatus[node.relativePath] || null
      });
    }
  };

  const toggleExpanded = (path) => {
    setExpandedPaths(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const renderTree = (nodes, depth = 0) => {
    if (!nodes || nodes.length === 0) return null;

    return nodes.map(node => {
      const isExpanded = expandedPaths.has(node.relativePath);
      const hasStatus = gitStatus[node.relativePath];

      return (
        <div key={node.relativePath || node.name} className="file-tree-item">
          <div
            className={`file-tree-row ${hasStatus ? 'has-changes' : ''}`}
            style={{ paddingLeft: `${depth * 16 + 8}px` }}
            onClick={() => handleFileClick(node)}
          >
            {/* Expansion chevron for directories */}
            {node.isDirectory && (
              <span className="chevron">
                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </span>
            )}

            {/* Icon */}
            <span className="icon">
              {node.isDirectory ? (
                isExpanded ? <FolderOpen size={14} /> : <Folder size={14} />
              ) : (
                <FileText size={14} />
              )}
            </span>

            {/* Name */}
            <span className="name">{node.name}</span>

            {/* Git status badge */}
            {hasStatus && (
              <span className={`git-status-badge status-${hasStatus.toLowerCase()}`}>
                {hasStatus}
              </span>
            )}
          </div>

          {/* Children (for directories) */}
          {node.isDirectory && isExpanded && node.children && (
            <div className="file-tree-children">
              {renderTree(node.children, depth + 1)}
            </div>
          )}
        </div>
      );
    });
  };

  if (collapsed) return null;

  return (
    <div className="file-tree-explorer">
      <div className="file-tree-header">
        <span className="header-title">Files</span>
        <button
          className="refresh-btn"
          onClick={loadFileTree}
          disabled={loading}
          title="Refresh file tree"
        >
          <RefreshCw size={14} className={loading ? 'spinning' : ''} />
        </button>
      </div>

      <div className="file-tree-content">
        {loading && !treeData ? (
          <div className="loading">Loading files...</div>
        ) : error ? (
          <div className="error">
            <p>{error}</p>
            <button onClick={loadFileTree} className="retry-btn">
              Retry
            </button>
          </div>
        ) : !treeData || treeData.length === 0 ? (
          <div className="empty">No files found</div>
        ) : (
          <div className="file-tree">
            {renderTree(treeData)}
          </div>
        )}
      </div>
    </div>
  );
}

export default FileTreeExplorer;
