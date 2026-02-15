import React, { useState, useEffect, useCallback } from 'react';
import { FolderClosed, FolderOpen, ChevronRight, ChevronDown, RefreshCw, Files, GitCommit } from 'lucide-react';
import { getFileIcon } from '../utils/fileIcons';

function FilePanel({ collapsed, onToggle, folderId, worktreeId, onOpenFile }) {
  const [mode, setMode] = useState('files'); // 'files' | 'changes'
  const [treeData, setTreeData] = useState([]);
  const [changedFiles, setChangedFiles] = useState([]);
  const [gitStatusMap, setGitStatusMap] = useState({});
  const [expandedPaths, setExpandedPaths] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadData = useCallback(async () => {
    if (!folderId || !worktreeId) return;

    setLoading(true);
    setError(null);

    try {
      const result = await window.electron.invoke('file:tree-get', folderId, worktreeId);
      if (result.success) {
        setTreeData(result.tree || []);
        const statusMap = {};
        (result.gitStatus || []).forEach(f => { statusMap[f.path] = f.status; });
        setGitStatusMap(statusMap);
        setChangedFiles(result.gitStatus || []);
      } else {
        setError(result.error || 'Failed to load file tree');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [folderId, worktreeId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const toggleExpand = (path) => {
    setExpandedPaths(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const handleFileClick = (node) => {
    const status = gitStatusMap[node.relativePath];
    onOpenFile({
      filePath: node.path,
      relativePath: node.relativePath,
      fileName: node.name,
      hasChanges: !!status,
      changeType: status || null,
      viewMode: mode === 'changes' ? 'diff' : 'code'
    });
  };

  const handleChangedFileClick = (file) => {
    onOpenFile({
      filePath: file.path, // relative — we'll resolve in the viewer
      relativePath: file.path,
      fileName: file.path.split('/').pop(),
      hasChanges: true,
      changeType: file.status,
      viewMode: 'diff'
    });
  };

  const renderGitBadge = (status) => {
    if (!status) return null;
    const classes = `git-badge git-badge-${status === '?' ? 'untracked' : status.toLowerCase()}`;
    return <span className={classes}>{status}</span>;
  };

  const renderTreeNode = (node, depth = 0) => {
    if (node.type === 'truncated') {
      return (
        <div key={node.path || '...'} className="file-tree-row truncated" style={{ paddingLeft: depth * 16 + 10 }}>
          <span className="file-tree-name">...</span>
        </div>
      );
    }

    if (node.isDirectory) {
      const isExpanded = expandedPaths.has(node.relativePath);
      return (
        <div key={node.path}>
          <div
            className="file-tree-row directory"
            style={{ paddingLeft: depth * 16 + 10 }}
            onClick={() => toggleExpand(node.relativePath)}
          >
            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            {isExpanded ? <FolderOpen size={16} className="file-tree-icon" /> : <FolderClosed size={16} className="file-tree-icon" />}
            <span className="file-tree-name">{node.name}</span>
          </div>
          {isExpanded && node.children && node.children.map(child => renderTreeNode(child, depth + 1))}
        </div>
      );
    }

    const status = gitStatusMap[node.relativePath];
    const FileIcon = getFileIcon(node.name);
    return (
      <div
        key={node.path}
        className="file-tree-row file"
        style={{ paddingLeft: depth * 16 + 10 }}
        onClick={() => handleFileClick(node)}
      >
        <FileIcon size={16} className="file-tree-icon" />
        <span className="file-tree-name">{node.name}</span>
        {renderGitBadge(status)}
      </div>
    );
  };

  // Don't render if collapsed
  if (collapsed) {
    return null;
  }

  return (
    <div className="file-panel">
      <div className="file-panel-header">
        <div className="file-panel-modes">
          <button
            className={`file-panel-mode-btn ${mode === 'files' ? 'active' : ''}`}
            onClick={() => setMode('files')}
          >
            <Files size={14} />
            Files
          </button>
          <button
            className={`file-panel-mode-btn ${mode === 'changes' ? 'active' : ''}`}
            onClick={() => setMode('changes')}
          >
            <GitCommit size={14} />
            Changes
            {changedFiles.length > 0 && <span className="file-panel-count">{changedFiles.length}</span>}
          </button>
        </div>
        <div className="file-panel-actions">
          <button className="file-panel-action-btn" onClick={loadData} title="Refresh">
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      <div className="file-panel-body">
        {loading && (
          <div className="file-panel-loading">Loading...</div>
        )}

        {error && (
          <div className="file-panel-error">{error}</div>
        )}

        {!loading && !error && mode === 'files' && (
          <div className="file-tree">
            {treeData.length === 0 ? (
              <div className="file-panel-empty">No files found</div>
            ) : (
              treeData.map(node => renderTreeNode(node, 0))
            )}
          </div>
        )}

        {!loading && !error && mode === 'changes' && (
          <div className="changes-list">
            {changedFiles.length === 0 ? (
              <div className="file-panel-empty">No changes</div>
            ) : (
              changedFiles.map(file => {
                const fileName = file.path.split('/').pop();
                const FileIcon = getFileIcon(fileName);
                return (
                  <div
                    key={file.path}
                    className="changes-row"
                    onClick={() => handleChangedFileClick(file)}
                  >
                    <FileIcon size={16} className="file-tree-icon" />
                    {renderGitBadge(file.status)}
                    <span className="changes-path">{file.path}</span>
                    {(file.additions > 0 || file.deletions > 0) && (
                      <div className="changes-diff-stats">
                        {file.additions > 0 && <span className="diff-additions">+{file.additions}</span>}
                        {file.deletions > 0 && <span className="diff-deletions">-{file.deletions}</span>}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default FilePanel;
