import React, { useState, useEffect } from 'react';
import Header from '../components/Header';
import Sidebar from '../components/Sidebar';
import MainContent from '../components/MainContent';
import RightPanel from '../components/RightPanel';
import CreateBranchModal from '../components/CreateBranchModal';
import DeleteConfirmModal from '../components/DeleteConfirmModal';

function Dashboard({ folder, onGoHome, onGoBack, onGoForward, canGoBack, canGoForward }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [worktrees, setWorktrees] = useState([]);
  const [activeWorktree, setActiveWorktree] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeSessions, setActiveSessions] = useState([]);
  const [currentSessionId, setCurrentSessionId] = useState(null);

  // Load worktrees on mount and when folder changes
  useEffect(() => {
    if (folder) {
      initializeWorktrees();
      loadSessions();
    }
  }, [folder]);

  const initializeWorktrees = async () => {
    setLoading(true);
    try {
      // First, initialize main branch if needed
      const initResult = await window.electron.invoke('worktree:init-main', folder.id, folder.path);

      // Then load all worktrees
      const result = await window.electron.invoke('worktree:list', folder.id);

      if (result.success) {
        setWorktrees(result.worktrees);

        // Set active worktree (use folder.active_worktree_id if available, else main)
        const active = result.worktrees.find(w => w.id === folder.active_worktree_id)
          || result.worktrees.find(w => w.is_main === 1);
        setActiveWorktree(active);
      }
    } catch (error) {
      console.error('Error initializing worktrees:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateBranch = async (branchName) => {
    try {
      const result = await window.electron.invoke('worktree:create', folder.id, folder.path, branchName);

      if (!result.success) {
        alert(`Failed to create branch: ${result.error}`);
        return;
      }

      // Reload worktrees
      await loadWorktrees();

      // Select the new branch
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

      // Reload worktrees
      await loadWorktrees();

      // If deleted branch was active, switch to main
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
    }
  };

  const handleSelectBranch = async (worktree) => {
    setActiveWorktree(worktree);
    await window.electron.invoke('worktree:set-active', folder.id, worktree.id);
  };

  const toggleSidebar = () => {
    setSidebarCollapsed(!sidebarCollapsed);
  };

  const loadSessions = async () => {
    const result = await window.electron.invoke('claude:session-list', folder.id);
    if (result.success) {
      setActiveSessions(result.sessions);
    }
  };

  const handleStartSession = async () => {
    if (!activeWorktree) {
      console.error('No active worktree selected');
      return;
    }

    console.log('[Dashboard] Starting Claude session...', { folderId: folder.id, worktreeId: activeWorktree.id });
    const result = await window.electron.invoke('claude:session-start', folder.id, activeWorktree.id);

    console.log('[Dashboard] Session start result:', result);

    if (result.success) {
      console.log('[Dashboard] Session created:', result.session);
      setActiveSessions([...activeSessions, result.session]);
      setCurrentSessionId(result.session.sessionId);
      console.log('[Dashboard] Updated activeSessions, currentSessionId:', result.session.sessionId);
    } else {
      console.error('[Dashboard] Failed to start session:', result.error);
      alert(`Failed to start Claude session: ${result.error}`);
    }
  };

  const handleStopSession = async (sessionId) => {
    const result = await window.electron.invoke('claude:session-stop', sessionId);
    if (result.success) {
      setActiveSessions(activeSessions.filter(s => s.sessionId !== sessionId));
      if (currentSessionId === sessionId) {
        setCurrentSessionId(activeSessions[0]?.sessionId || null);
      }
    }
  };

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
        />

        <MainContent
          currentSessionId={currentSessionId}
          activeSessions={activeSessions}
          onSwitchSession={setCurrentSessionId}
          onStopSession={handleStopSession}
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
