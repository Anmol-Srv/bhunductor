import React, { useState, useEffect, useCallback } from 'react';
import Header from '../components/Header';
import Sidebar from '../components/Sidebar';
import MainContent from '../components/MainContent';
import RightPanel from '../components/RightPanel';
import CreateBranchModal from '../components/CreateBranchModal';
import DeleteConfirmModal from '../components/DeleteConfirmModal';
import ClaudeChat from '../components/claude/ClaudeChat';

function Dashboard({ folder, onGoHome, onGoBack, onGoForward, canGoBack, canGoForward }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [worktrees, setWorktrees] = useState([]);
  const [activeWorktree, setActiveWorktree] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [loading, setLoading] = useState(true);

  // New session state model
  const [sessionsByWorktree, setSessionsByWorktree] = useState({}); // { worktreeId: [session, ...] }
  const [openTabs, setOpenTabs] = useState([]); // [{ sessionId, worktreeId, branchName, name }]
  const [activeTabId, setActiveTabId] = useState(null); // sessionId of active tab
  const [pendingResumeSession, setPendingResumeSession] = useState(null); // { sessionId, claudeSessionId, worktreeId, branchName, name, messages }
  const [archivedSessionsByWorktree, setArchivedSessionsByWorktree] = useState({}); // { worktreeId: [session, ...] }

  // Load worktrees on mount and when folder changes
  useEffect(() => {
    if (folder) {
      initializeWorktrees();
    }
  }, [folder]);

  // Listen for session-exited events
  useEffect(() => {
    const unsubscribe = window.electron.on('claude:session-exited', (data) => {
      const { sessionId } = data;

      // Persist messages to DB before clearing cache
      const cachedMessages = ClaudeChat.getCache(sessionId);
      if (cachedMessages.length > 0) {
        window.electron.invoke('claude:session-save-messages', sessionId, cachedMessages).catch(() => {});
      }

      // Clear message cache for dead session
      ClaudeChat.clearCache(sessionId);

      // Update session status in sessionsByWorktree (keep it, mark as exited)
      setSessionsByWorktree(prev => {
        const next = { ...prev };
        for (const wtId of Object.keys(next)) {
          next[wtId] = next[wtId].map(s =>
            (s.sessionId || s.id) === sessionId
              ? { ...s, status: 'exited' }
              : s
          );
        }
        return next;
      });

      // Remove from openTabs if present
      setOpenTabs(prev => {
        const filtered = prev.filter(t => t.sessionId !== sessionId);
        if (filtered.length !== prev.length) {
          // Active tab was removed - switch to adjacent
          setActiveTabId(currentActive => {
            if (currentActive === sessionId) {
              const oldIdx = prev.findIndex(t => t.sessionId === sessionId);
              const newTab = filtered[Math.min(oldIdx, filtered.length - 1)];
              return newTab?.sessionId || null;
            }
            return currentActive;
          });
        }
        return filtered;
      });
    });

    return () => unsubscribe();
  }, []);

  // Listen for session title updates from Claude
  useEffect(() => {
    const unsub = window.electron.on('claude:session-title-updated', (data) => {
      const { sessionId, title } = data;
      // Update in sessionsByWorktree
      setSessionsByWorktree(prev => {
        const next = { ...prev };
        for (const wtId of Object.keys(next)) {
          next[wtId] = next[wtId].map(s =>
            (s.sessionId || s.id) === sessionId ? { ...s, name: title, title } : s
          );
        }
        return next;
      });
      // Update in openTabs
      setOpenTabs(prev => prev.map(t =>
        t.sessionId === sessionId ? { ...t, name: title, title } : t
      ));
    });
    return () => unsub();
  }, []);

  const initializeWorktrees = async () => {
    setLoading(true);
    try {
      await window.electron.invoke('worktree:init-main', folder.id, folder.path);
      const result = await window.electron.invoke('worktree:list', folder.id);

      if (result.success) {
        setWorktrees(result.worktrees);

        const active = result.worktrees.find(w => w.id === folder.active_worktree_id)
          || result.worktrees.find(w => w.is_main === 1);
        setActiveWorktree(active);

        // Load sessions for all worktrees
        const sessMap = await loadAllSessions(result.worktrees);

        // Lazy resume: load last session's messages for display without spawning a process
        if (active) {
          try {
            const lastResult = await window.electron.invoke(
              'claude:session-get-last', folder.id, active.id
            );
            if (lastResult.success && lastResult.session) {
              const last = lastResult.session;
              setPendingResumeSession({
                sessionId: last.sessionId,
                claudeSessionId: last.claude_session_id,
                worktreeId: active.id,
                branchName: active.branch_name,
                title: last.name || null,
                messages: last.parsedMessages || []
              });
            }
          } catch (err) {
            console.error('Failed to load last session for resume:', err);
          }
        }
      }
    } catch (error) {
      console.error('Error initializing worktrees:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadAllSessions = async (worktreeList) => {
    const sessMap = {};
    for (const wt of worktreeList) {
      const result = await window.electron.invoke('claude:session-list', folder.id, wt.id);
      sessMap[wt.id] = result.success ? result.sessions : [];
    }
    setSessionsByWorktree(sessMap);
    return sessMap;
  };

  const handleCreateBranch = async (branchName) => {
    try {
      const result = await window.electron.invoke('worktree:create', folder.id, folder.path, branchName);

      if (!result.success) {
        alert(`Failed to create branch: ${result.error}`);
        return;
      }

      await loadWorktrees();
      setActiveWorktree(result.worktree);
      await window.electron.invoke('worktree:set-active', folder.id, result.worktree.id);
    } catch (error) {
      console.error('Error creating branch:', error);
      alert('Unexpected error creating branch');
    }
  };

  const handleDeleteBranch = (worktreeId, branchName) => {
    setDeleteConfirm({ id: worktreeId, name: branchName });
  };

  const confirmDelete = async () => {
    try {
      const result = await window.electron.invoke('worktree:delete', deleteConfirm.id);

      if (!result.success) {
        alert(`Failed to delete branch: ${result.error}`);
        return;
      }

      await loadWorktrees();

      if (activeWorktree?.id === deleteConfirm.id) {
        const mainBranch = worktrees.find(w => w.is_main === 1);
        setActiveWorktree(mainBranch);
        if (mainBranch) {
          await window.electron.invoke('worktree:set-active', folder.id, mainBranch.id);
        }
      }
    } catch (error) {
      console.error('Error deleting branch:', error);
      alert('Unexpected error deleting branch');
    } finally {
      setDeleteConfirm(null);
    }
  };

  const loadWorktrees = async () => {
    const result = await window.electron.invoke('worktree:list', folder.id);
    if (result.success) {
      setWorktrees(result.worktrees);
      await loadAllSessions(result.worktrees);
    }
  };

  const handleSelectBranch = async (worktree) => {
    setActiveWorktree(worktree);
    await window.electron.invoke('worktree:set-active', folder.id, worktree.id);
  };

  const toggleSidebar = () => {
    setSidebarCollapsed(!sidebarCollapsed);
  };

  const handleStartSession = useCallback(async (worktreeId, claudeSessionId = null) => {
    const targetWorktree = worktrees.find(w => w.id === worktreeId);
    if (!targetWorktree) {
      console.error('Worktree not found:', worktreeId);
      return;
    }

    // Switch to target worktree if not already active
    if (activeWorktree?.id !== worktreeId) {
      setActiveWorktree(targetWorktree);
      await window.electron.invoke('worktree:set-active', folder.id, worktreeId);
    }

    const result = await window.electron.invoke('claude:session-start', folder.id, worktreeId, claudeSessionId);

    if (result.success) {
      const session = result.session;
      const deletedIds = result.deletedSessionIds || [];

      // Add to sessionsByWorktree, removing any old entries that were archived on resume
      setSessionsByWorktree(prev => {
        const existing = prev[worktreeId] || [];
        const filtered = deletedIds.length > 0
          ? existing.filter(s => !deletedIds.includes(s.sessionId || s.id))
          : existing;
        return { ...prev, [worktreeId]: [...filtered, session] };
      });

      // Clear pending resume if this is for the same worktree
      setPendingResumeSession(prev =>
        prev && prev.worktreeId === worktreeId ? null : prev
      );

      // Add to openTabs and set as active
      const newTab = {
        sessionId: session.sessionId,
        worktreeId,
        branchName: targetWorktree.branch_name,
        title: session.title || session.name || null
      };
      setOpenTabs(prev => [...prev, newTab]);
      setActiveTabId(session.sessionId);

      return session;
    } else {
      console.error('Failed to start session:', result.error);
      alert(`Failed to start Claude session: ${result.error}`);
    }
  }, [worktrees, activeWorktree, folder]);

  const handleOpenSession = useCallback(async (sessionId, worktreeId, branchName) => {
    // Check if already open as a tab
    const existing = openTabs.find(t => t.sessionId === sessionId);
    if (existing) {
      setActiveTabId(sessionId);
      return;
    }

    // Check if this session is still active (has a running process)
    const sessions = sessionsByWorktree[worktreeId] || [];
    const session = sessions.find(s => (s.sessionId || s.id) === sessionId);

    if (session && session.status !== 'active') {
      // Past session — resume it by starting a new process with --resume
      const oldSessionId = session.sessionId || session.id;
      await handleStartSession(worktreeId, session.claude_session_id);
      // Remove the old inactive entry if backend didn't delete it (e.g. no claude_session_id)
      setSessionsByWorktree(prev => {
        const list = prev[worktreeId] || [];
        const alreadyRemoved = !list.some(s => (s.sessionId || s.id) === oldSessionId);
        if (alreadyRemoved) return prev;
        return { ...prev, [worktreeId]: list.filter(s => (s.sessionId || s.id) !== oldSessionId) };
      });
      return;
    }

    // Active session — pre-seed message cache from DB if empty, then open tab
    const cachedMessages = ClaudeChat.getCache(sessionId);
    if (cachedMessages.length === 0 && session?.messages) {
      try {
        const parsed = JSON.parse(session.messages);
        if (parsed.length > 0) {
          ClaudeChat.setCache(sessionId, parsed);
        }
      } catch {}
    }
    const newTab = { sessionId, worktreeId, branchName, title: session?.title || session?.name || null };
    setOpenTabs(prev => [...prev, newTab]);
    setActiveTabId(sessionId);
  }, [openTabs, sessionsByWorktree, handleStartSession]);

  const handleDeleteSession = useCallback(async (sessionId, worktreeId) => {
    const result = await window.electron.invoke('claude:session-delete', sessionId);
    if (result.success) {
      // Remove from sessionsByWorktree
      setSessionsByWorktree(prev => {
        const list = prev[worktreeId] || [];
        return { ...prev, [worktreeId]: list.filter(s => (s.sessionId || s.id) !== sessionId) };
      });
      // Remove from archivedSessionsByWorktree
      setArchivedSessionsByWorktree(prev => {
        const list = prev[worktreeId] || [];
        return { ...prev, [worktreeId]: list.filter(s => (s.sessionId || s.id) !== sessionId) };
      });
      // Remove from openTabs if present
      setOpenTabs(prev => {
        const filtered = prev.filter(t => t.sessionId !== sessionId);
        if (filtered.length !== prev.length) {
          setActiveTabId(currentActive => {
            if (currentActive === sessionId) {
              const oldIdx = prev.findIndex(t => t.sessionId === sessionId);
              const newTab = filtered[Math.min(oldIdx, filtered.length - 1)];
              return newTab?.sessionId || null;
            }
            return currentActive;
          });
        }
        return filtered;
      });
    }
  }, []);

  const handleSwitchTab = useCallback((sessionId) => {
    setActiveTabId(sessionId);
  }, []);

  const handleLazyResume = useCallback(async (message) => {
    if (!pendingResumeSession) return;
    const { claudeSessionId, worktreeId, branchName, name, messages: oldMessages } = pendingResumeSession;
    setPendingResumeSession(null);

    try {
      const result = await window.electron.invoke(
        'claude:session-lazy-resume', folder.id, worktreeId, claudeSessionId, message
      );
      if (result.success) {
        const session = result.session;
        const archivedIds = result.archivedSessionIds || [];

        // Pre-seed message cache so new ClaudeChat mounts with old messages + user's new message
        const seedMessages = [
          ...(oldMessages || []),
          { id: crypto.randomUUID(), role: 'user', type: 'text', text: message }
        ];
        ClaudeChat.setCache(session.sessionId, seedMessages);

        setSessionsByWorktree(prev => {
          const existing = prev[worktreeId] || [];
          const filtered = archivedIds.length > 0
            ? existing.filter(s => !archivedIds.includes(s.sessionId || s.id))
            : existing;
          return { ...prev, [worktreeId]: [...filtered, session] };
        });

        const newTab = {
          sessionId: session.sessionId,
          worktreeId,
          branchName,
          title: name || session.title || session.name || null
        };
        setOpenTabs(prev => [...prev, newTab]);
        setActiveTabId(session.sessionId);
      } else {
        console.error('Lazy resume failed:', result.error);
      }
    } catch (err) {
      console.error('Lazy resume error:', err);
    }
  }, [pendingResumeSession, folder]);

  const handleArchiveSession = useCallback(async (sessionId, worktreeId) => {
    const result = await window.electron.invoke('claude:session-archive', sessionId);
    if (result.success) {
      // Move from active sessions to archived
      setSessionsByWorktree(prev => {
        const list = prev[worktreeId] || [];
        return { ...prev, [worktreeId]: list.filter(s => (s.sessionId || s.id) !== sessionId) };
      });
      // Refresh archived list
      loadArchivedSessions(worktreeId);
    }
  }, []);

  const handleUnarchiveAndResume = useCallback(async (sessionId, worktreeId, branchName, claudeSessionId) => {
    await window.electron.invoke('claude:session-unarchive', sessionId);
    // Remove from archived state immediately
    setArchivedSessionsByWorktree(prev => {
      const list = prev[worktreeId] || [];
      return { ...prev, [worktreeId]: list.filter(s => (s.sessionId || s.id) !== sessionId) };
    });
    // Now resume it like any other past session
    await handleStartSession(worktreeId, claudeSessionId);
  }, [handleStartSession]);

  const loadArchivedSessions = useCallback(async (worktreeId) => {
    const result = await window.electron.invoke('claude:session-list-archived', folder.id, worktreeId);
    if (result.success) {
      setArchivedSessionsByWorktree(prev => ({ ...prev, [worktreeId]: result.sessions }));
    }
  }, [folder]);

  const handleCloseTab = useCallback((sessionId, shouldStop) => {
    // Persist messages to DB before closing
    const cachedMessages = ClaudeChat.getCache(sessionId);
    if (cachedMessages.length > 0) {
      window.electron.invoke('claude:session-save-messages', sessionId, cachedMessages).catch(() => {});
    }

    if (shouldStop) {
      ClaudeChat.clearCache(sessionId);
      window.electron.invoke('claude:session-stop', sessionId).then(result => {
        if (result.success) {
          // Mark session as stopped in sessionsByWorktree (keep it visible)
          setSessionsByWorktree(prev => {
            const next = { ...prev };
            for (const wtId of Object.keys(next)) {
              next[wtId] = next[wtId].map(s =>
                (s.sessionId || s.id) === sessionId
                  ? { ...s, status: 'stopped' }
                  : s
              );
            }
            return next;
          });
        }
      });
    }

    // Remove tab
    setOpenTabs(prev => {
      const filtered = prev.filter(t => t.sessionId !== sessionId);
      setActiveTabId(currentActive => {
        if (currentActive === sessionId) {
          const oldIdx = prev.findIndex(t => t.sessionId === sessionId);
          const newTab = filtered[Math.min(oldIdx, filtered.length - 1)];
          return newTab?.sessionId || null;
        }
        return currentActive;
      });
      return filtered;
    });
  }, []);

  return (
    <div className="dashboard">
      <Header
        folderName={folder?.name || 'Unknown'}
        folderPath={folder?.path || ''}
        onGoHome={onGoHome}
        onGoBack={onGoBack}
        onGoForward={onGoForward}
        canGoBack={canGoBack}
        canGoForward={canGoForward}
      />

      <div className="dashboard-content">
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={toggleSidebar}
          worktrees={worktrees}
          activeWorktree={activeWorktree}
          onSelectBranch={handleSelectBranch}
          onCreateBranch={() => setShowCreateModal(true)}
          onDeleteBranch={handleDeleteBranch}
          onStartSession={handleStartSession}
          onOpenSession={handleOpenSession}
          onDeleteSession={handleDeleteSession}
          onArchiveSession={handleArchiveSession}
          onUnarchiveAndResume={handleUnarchiveAndResume}
          onLoadArchivedSessions={loadArchivedSessions}
          sessionsByWorktree={sessionsByWorktree}
          archivedSessionsByWorktree={archivedSessionsByWorktree}
          openTabs={openTabs}
        />

        <MainContent
          openTabs={openTabs}
          activeTabId={activeTabId}
          onSwitchTab={handleSwitchTab}
          onCloseTab={handleCloseTab}
          pendingResumeSession={pendingResumeSession}
          onLazyResume={handleLazyResume}
        />

        <RightPanel />
      </div>

      <CreateBranchModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSubmit={handleCreateBranch}
      />

      <DeleteConfirmModal
        isOpen={deleteConfirm !== null}
        branchName={deleteConfirm?.name}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteConfirm(null)}
      />
    </div>
  );
}

export default Dashboard;
