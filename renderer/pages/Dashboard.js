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
  const [openTabs, setOpenTabs] = useState([]); // [{ sessionId, worktreeId, branchName }]
  const [activeTabId, setActiveTabId] = useState(null); // sessionId of active tab

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

      // Clear message cache for dead session
      ClaudeChat.clearCache(sessionId);

      // Remove from sessionsByWorktree
      setSessionsByWorktree(prev => {
        const next = { ...prev };
        for (const wtId of Object.keys(next)) {
          next[wtId] = next[wtId].filter(s => s.sessionId !== sessionId);
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
        loadAllSessions(result.worktrees);
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
      if (result.success) {
        sessMap[wt.id] = result.sessions;
      } else {
        sessMap[wt.id] = [];
      }
    }
    setSessionsByWorktree(sessMap);
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
      loadAllSessions(result.worktrees);
    }
  };

  const handleSelectBranch = async (worktree) => {
    setActiveWorktree(worktree);
    await window.electron.invoke('worktree:set-active', folder.id, worktree.id);
  };

  const toggleSidebar = () => {
    setSidebarCollapsed(!sidebarCollapsed);
  };

  const handleStartSession = async (worktreeId) => {
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

    const result = await window.electron.invoke('claude:session-start', folder.id, worktreeId);

    if (result.success) {
      const session = result.session;

      // Add to sessionsByWorktree
      setSessionsByWorktree(prev => ({
        ...prev,
        [worktreeId]: [...(prev[worktreeId] || []), session]
      }));

      // Add to openTabs and set as active
      const newTab = {
        sessionId: session.sessionId,
        worktreeId,
        branchName: targetWorktree.branch_name
      };
      setOpenTabs(prev => [...prev, newTab]);
      setActiveTabId(session.sessionId);
    } else {
      console.error('Failed to start session:', result.error);
      alert(`Failed to start Claude session: ${result.error}`);
    }
  };

  const handleOpenSession = useCallback((sessionId, worktreeId, branchName) => {
    // Check if already open as a tab
    const existing = openTabs.find(t => t.sessionId === sessionId);
    if (existing) {
      setActiveTabId(sessionId);
      return;
    }

    // Add new tab
    const newTab = { sessionId, worktreeId, branchName };
    setOpenTabs(prev => [...prev, newTab]);
    setActiveTabId(sessionId);
  }, [openTabs]);

  const handleSwitchTab = useCallback((sessionId) => {
    setActiveTabId(sessionId);
  }, []);

  const handleCloseTab = useCallback((sessionId, shouldStop) => {
    if (shouldStop) {
      ClaudeChat.clearCache(sessionId);
      window.electron.invoke('claude:session-stop', sessionId).then(result => {
        if (result.success) {
          // Remove from sessionsByWorktree
          setSessionsByWorktree(prev => {
            const next = { ...prev };
            for (const wtId of Object.keys(next)) {
              next[wtId] = next[wtId].filter(s => s.sessionId !== sessionId);
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
          sessionsByWorktree={sessionsByWorktree}
          openTabs={openTabs}
        />

        <MainContent
          openTabs={openTabs}
          activeTabId={activeTabId}
          onSwitchTab={handleSwitchTab}
          onCloseTab={handleCloseTab}
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
