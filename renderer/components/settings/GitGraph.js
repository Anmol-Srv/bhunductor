import React, { useState, useEffect } from 'react';

function GitGraph({ repoPath }) {
  const [commits, setCommits] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!repoPath) { setLoading(false); return; }
    (async () => {
      try {
        const result = await window.electron.invoke('git:get-log', repoPath, 30);
        if (result.success) setCommits(result.commits || []);
      } catch (err) {
        console.error('[Settings] Failed to load git log:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [repoPath]);

  if (!repoPath) return <span className="settings-card-loading">No repository selected</span>;
  if (loading) return <span className="settings-card-loading">Loading commits...</span>;
  if (commits.length === 0) return <span className="settings-card-loading">No commits found</span>;

  return (
    <div className="git-graph-list">
      {commits.map((c, i) => (
        <div key={i} className="git-graph-row">
          <span className="git-graph-art">{c.graph}</span>
          {c.hash && (
            <>
              <span className="git-graph-hash">{c.shortHash}</span>
              <span className="git-graph-subject">{c.subject}</span>
              {c.refs && <span className="git-graph-refs">{c.refs}</span>}
              <span className="git-graph-date">{c.relativeDate}</span>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

export default GitGraph;
