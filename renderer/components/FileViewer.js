import React, { useState, useEffect, useCallback } from 'react';
import Editor, { loader } from '@monaco-editor/react';
import { DiffView, DiffModeEnum } from '@git-diff-view/react';
import '@git-diff-view/react/styles/diff-view.css';
import { Code, GitCompare } from 'lucide-react';

// Configure Monaco Editor to load from local files instead of CDN
// This is required for Electron apps due to CSP restrictions
// Webpack copies monaco-editor files to renderer/vs/ directory
loader.config({
  paths: {
    vs: './vs'
  }
});

// Module-level content cache (persists across mount/unmount like ClaudeChat)
const contentCache = new Map();

function FileViewer({
  fileId,
  worktreeId,
  filePath,
  relativePath,
  fileName,
  hasChanges,
  changeType
}) {
  const [content, setContent] = useState('');
  const [diffData, setDiffData] = useState(null);
  const [viewMode, setViewMode] = useState(hasChanges ? 'diff' : 'code');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadFileData = useCallback(async () => {
    console.log('[FileViewer] Loading file:', { fileId, filePath, relativePath });

    // Check cache first
    const cached = contentCache.get(fileId);
    if (cached) {
      console.log('[FileViewer] Using cached content for:', fileId);
      setContent(cached.content);
      setDiffData(cached.diffData);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      console.log('[FileViewer] Invoking file:read-content for:', filePath);
      // Load file content
      const contentResult = await window.electron.invoke('file:read-content', filePath);
      console.log('[FileViewer] Content result:', contentResult);

      if (contentResult.success) {
        setContent(contentResult.content);
      } else {
        if (contentResult.isBinary) {
          setError('This file appears to be binary and cannot be displayed');
        } else {
          setError(contentResult.error || 'Failed to load file content');
        }
      }

      // Load diff if file has changes
      let diffResult = null;
      if (hasChanges) {
        diffResult = await window.electron.invoke(
          'file:get-git-diff',
          worktreeId,
          relativePath
        );

        if (diffResult.success) {
          setDiffData({
            oldContent: diffResult.oldContent || '',
            newContent: diffResult.newContent || contentResult.content || '',
            diff: diffResult.diff,
            changeType: diffResult.changeType,
            isNewFile: diffResult.isNewFile
          });
        }
      }

      // Cache results
      contentCache.set(fileId, {
        content: contentResult.content || '',
        diffData: diffResult?.success ? {
          oldContent: diffResult.oldContent || '',
          newContent: diffResult.newContent || contentResult.content || '',
          diff: diffResult.diff,
          changeType: diffResult.changeType,
          isNewFile: diffResult.isNewFile
        } : null
      });
    } catch (error) {
      console.error('[FileViewer] Failed to load file data:', error);
      setError(error.message || 'Failed to load file');
    } finally {
      setLoading(false);
    }
  }, [fileId, filePath, relativePath, worktreeId, hasChanges]);

  useEffect(() => {
    loadFileData();
  }, [loadFileData]);

  const detectLanguage = (fileName) => {
    const ext = fileName.split('.').pop()?.toLowerCase();
    const langMap = {
      js: 'javascript',
      jsx: 'javascript',
      ts: 'typescript',
      tsx: 'typescript',
      py: 'python',
      rb: 'ruby',
      go: 'go',
      rs: 'rust',
      java: 'java',
      c: 'c',
      cpp: 'cpp',
      cc: 'cpp',
      h: 'c',
      hpp: 'cpp',
      css: 'css',
      scss: 'scss',
      sass: 'sass',
      less: 'less',
      html: 'html',
      xml: 'xml',
      json: 'json',
      md: 'markdown',
      yaml: 'yaml',
      yml: 'yaml',
      toml: 'toml',
      sh: 'shell',
      bash: 'shell',
      zsh: 'shell',
      sql: 'sql',
      php: 'php',
      cs: 'csharp',
      swift: 'swift',
      kt: 'kotlin',
      r: 'r',
      dockerfile: 'dockerfile'
    };
    return langMap[ext] || 'plaintext';
  };

  if (loading) {
    return (
      <div className="file-viewer">
        <div className="file-viewer-loading">
          Loading {fileName}...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="file-viewer">
        <div className="file-viewer-header">
          <div className="file-info">
            <span className="file-name">{fileName}</span>
            <span className="file-path">{relativePath}</span>
          </div>
        </div>
        <div className="file-viewer-error">
          <p>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="file-viewer">
      <div className="file-viewer-header">
        <div className="file-info">
          <span className="file-name">{fileName}</span>
          <span className="file-path">{relativePath}</span>
          {changeType && (
            <span className={`change-type-badge ${changeType}`}>
              {changeType === 'M' ? 'Modified' :
               changeType === 'A' ? 'Added' :
               changeType === 'D' ? 'Deleted' :
               changeType === '?' ? 'Untracked' :
               changeType}
            </span>
          )}
        </div>

        {hasChanges && diffData && (
          <div className="view-controls">
            <button
              className={viewMode === 'code' ? 'active' : ''}
              onClick={() => setViewMode('code')}
              title="View code"
            >
              <Code size={14} />
              <span>Code</span>
            </button>
            <button
              className={viewMode === 'diff' ? 'active' : ''}
              onClick={() => setViewMode('diff')}
              title="View diff"
            >
              <GitCompare size={14} />
              <span>Diff</span>
            </button>
          </div>
        )}
      </div>

      <div className="file-viewer-content">
        {viewMode === 'diff' && diffData ? (
          <div className="diff-container">
            <DiffView
              oldFile={{
                fileName: fileName,
                content: diffData.oldContent
              }}
              newFile={{
                fileName: fileName,
                content: diffData.newContent
              }}
              diffViewMode={DiffModeEnum.Split}
              extendData={{
                oldFile: {
                  language: detectLanguage(fileName)
                },
                newFile: {
                  language: detectLanguage(fileName)
                }
              }}
            />
          </div>
        ) : (
          <Editor
            height="100%"
            language={detectLanguage(fileName)}
            value={content}
            theme="vs-dark"
            options={{
              readOnly: true,
              minimap: { enabled: true },
              fontSize: 13,
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
              wordWrap: 'off',
              automaticLayout: true,
              scrollbar: {
                verticalScrollbarSize: 10,
                horizontalScrollbarSize: 10
              }
            }}
          />
        )}
      </div>
    </div>
  );
}

// Export cache control methods (same pattern as ClaudeChat)
FileViewer.getCache = (fileId) => contentCache.get(fileId);
FileViewer.setCache = (fileId, data) => contentCache.set(fileId, data);
FileViewer.clearCache = (fileId) => contentCache.delete(fileId);

export default FileViewer;
