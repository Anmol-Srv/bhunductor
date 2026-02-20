import React, { useState, useEffect, useRef } from 'react';
import Editor, { DiffEditor, loader } from '@monaco-editor/react';

// Configure Monaco loader for Electron — serve from local copy
loader.config({ paths: { vs: './vs' } });

// Module-level content cache — survives tab switches (same pattern as ClaudeChat)
const contentCache = new Map();

export function clearContentCache() {
  contentCache.clear();
}

// Map file extension to Monaco language ID
const LANG_MAP = {
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  ts: 'typescript', tsx: 'typescript',
  py: 'python', pyw: 'python',
  rb: 'ruby',
  rs: 'rust',
  go: 'go',
  java: 'java',
  kt: 'kotlin', kts: 'kotlin',
  c: 'c', h: 'c',
  cpp: 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp',
  cs: 'csharp',
  swift: 'swift',
  php: 'php',
  html: 'html', htm: 'html',
  css: 'css',
  scss: 'scss', sass: 'scss',
  less: 'less',
  json: 'json',
  yaml: 'yaml', yml: 'yaml',
  xml: 'xml', svg: 'xml',
  md: 'markdown', mdx: 'markdown',
  sql: 'sql',
  sh: 'shell', bash: 'shell', zsh: 'shell',
  ps1: 'powershell',
  dockerfile: 'dockerfile',
  toml: 'ini',
  ini: 'ini',
  lua: 'lua',
  r: 'r',
  dart: 'dart',
  graphql: 'graphql', gql: 'graphql'
};

function detectLanguage(fileName) {
  if (!fileName) return 'plaintext';
  const lower = fileName.toLowerCase();

  // Handle special filenames
  if (lower === 'dockerfile') return 'dockerfile';
  if (lower === 'makefile') return 'makefile';

  const ext = lower.split('.').pop();
  return LANG_MAP[ext] || 'plaintext';
}

function FileViewer({ filePath, relativePath, fileName, worktreeId, folderId, hasChanges, changeType, initialViewMode }) {
  const [viewMode, setViewMode] = useState(initialViewMode || 'code');
  const [content, setContent] = useState(null);
  const [diffData, setDiffData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const language = detectLanguage(fileName);

  useEffect(() => {
    let cancelled = false;

    const loadContent = async () => {
      // Check cache — skip for files with changes (always fetch fresh diff)
      if (!hasChanges) {
        const cached = contentCache.get(filePath);
        if (cached) {
          setContent(cached.content);
          setDiffData(cached.diffData);
          setLoading(false);
          return;
        }
      }

      setLoading(true);
      setError(null);

      try {
        // Load file content
        const result = await window.electron.invoke('file:read-content', filePath);
        if (cancelled) return;

        if (result.success) {
          setContent(result.content);
        } else {
          setError(result.error);
          setLoading(false);
          return;
        }

        // Load diff data if file has changes
        let loadedDiff = null;
        if (hasChanges && folderId && worktreeId) {
          const diffResult = await window.electron.invoke('file:get-git-diff', folderId, worktreeId, relativePath);
          if (cancelled) return;

          if (diffResult.success) {
            loadedDiff = {
              oldContent: diffResult.oldContent || '',
              newContent: diffResult.newContent || '',
              changeType: diffResult.changeType
            };
            setDiffData(loadedDiff);
          }
        }

        // Cache the loaded data
        contentCache.set(filePath, {
          content: result.content,
          diffData: loadedDiff
        });
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadContent();
    return () => { cancelled = true; };
  }, [filePath, relativePath, hasChanges, folderId, worktreeId]);

  const changeLabel = changeType === 'A' || changeType === 'added' ? 'Added'
    : changeType === 'D' || changeType === 'deleted' ? 'Deleted'
    : changeType === '?' || changeType === 'untracked' ? 'Untracked'
    : 'Modified';

  const dirPath = relativePath ? relativePath.split('/').slice(0, -1).join('/') : '';

  return (
    <div className="file-viewer">
      <div className="file-viewer-header">
        <div className="file-viewer-info">
          <span className="file-viewer-name">{fileName}</span>
          {dirPath && <span className="file-viewer-path">{dirPath}/</span>}
          {hasChanges && <span className={`file-viewer-badge badge-${changeLabel.toLowerCase()}`}>{changeLabel}</span>}
        </div>
        {hasChanges && (
          <div className="file-viewer-toggle">
            <button
              className={`file-viewer-toggle-btn ${viewMode === 'code' ? 'active' : ''}`}
              onClick={() => setViewMode('code')}
            >
              Code
            </button>
            <button
              className={`file-viewer-toggle-btn ${viewMode === 'diff' ? 'active' : ''}`}
              onClick={() => setViewMode('diff')}
            >
              Diff
            </button>
          </div>
        )}
      </div>

      <div className="file-viewer-content">
        {loading && (
          <div className="file-viewer-loading">Loading file...</div>
        )}

        {error && (
          <div className="file-viewer-error">{error}</div>
        )}

        {!loading && !error && viewMode === 'code' && content !== null && (
          <Editor
            value={content}
            language={language}
            theme="vs-dark"
            options={{
              readOnly: true,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              fontSize: 13,
              lineNumbers: 'on',
              renderWhitespace: 'none',
              wordWrap: 'off',
              automaticLayout: true
            }}
          />
        )}

        {!loading && !error && viewMode === 'diff' && diffData && (
          <DiffEditor
            original={diffData.oldContent}
            modified={diffData.newContent}
            language={language}
            theme="vs-dark"
            options={{
              readOnly: true,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              fontSize: 13,
              renderSideBySide: true,
              automaticLayout: true
            }}
          />
        )}

        {!loading && !error && viewMode === 'diff' && !diffData && (
          <div className="file-viewer-no-diff">No diff data available</div>
        )}
      </div>
    </div>
  );
}

export default FileViewer;
