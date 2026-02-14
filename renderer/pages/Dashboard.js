import React, { useState, useEffect, useCallback } from 'react';
import Header from '../components/Header';
import Sidebar from '../components/Sidebar';
import MainContent from '../components/MainContent';
import CreateBranchModal from '../components/CreateBranchModal';
import DeleteConfirmModal from '../components/DeleteConfirmModal';
import FilePanel from '../components/FilePanel';
import useBranchStore from '../stores/branchStore';
import useSessionStore from '../stores/sessionStore';
import useUIStore from '../stores/uiStore';

function Dashboard({ folder, onGoHome, onGoBack, onGoForward, canGoBack, canGoForward }) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const { worktrees, activeWorktree, loading, initialize, loadWorktrees, createBranch, deleteBranch, selectBranch } = useBranchStore();
  const { loadAllSessions, loadArchivedSessions, startSession, deleteSession, archiveSession, unarchiveAndResume, lazyResume, loadLastSession, pendingResumeSession, clearPendingResumeSession, sessionsByWorktree, archivedSessionsByWorktree, getMessages, setMessages, saveMessages, clearMessages } = useSessionStore();
  const { openTabs, activeTabId, openTab, closeTab, switchTab, sidebarCollapsed, toggleSidebar, filePanelCollapsed, toggleFilePanel } = useUIStore();

  // Initialize worktrees and load sessions on mount
  useEffect(() => {
    if (!folder) return;
    (async () => {
      const result = await initialize(folder);
      if (result) {
        await loadAllSessions(folder.id, result.worktrees);
        if (result.activeWorktree) {
          await loadLastSession(folder.id, result.activeWorktree.id, result.activeWorktree.branch_name);
        }
      }
    })();
  }, [folder]);

  const handleCreateBranch = async (branchName) => {
    const result = await createBranch(folder.id, folder.path, branchName);
    if (!result.success) {
      alert(`Failed to create branch: ${result.error}`);
    }
  };

  const handleDeleteBranch = (worktreeId, branchName) => {
    setDeleteConfirm({ id: worktreeId, name: branchName });
  };

  const confirmDelete = async () => {
    const result = await deleteBranch(deleteConfirm.id, folder.id);
    if (!result.success) {
      alert(`Failed to delete branch: ${result.error}`);
    }
    setDeleteConfirm(null);
  };

  const handleSelectBranch = async (worktree) => {
    await selectBranch(folder.id, worktree);
  };

  const handleStartSession = useCallback(async (worktreeId, claudeSessionId = null) => {
    const targetWorktree = worktrees.find(w => w.id === worktreeId);
    if (!targetWorktree) return;

    if (activeWorktree?.id !== worktreeId) {
      await selectBranch(folder.id, targetWorktree);
    }

    // Clear pending resume for this worktree
    const pending = useSessionStore.getState().pendingResumeSession;
    if (pending?.worktreeId === worktreeId) {
      clearPendingResumeSession();
    }

    const result = await startSession(folder.id, worktreeId, claudeSessionId);
    if (result.success) {
      const session = result.session;
      openTab({
        sessionId: session.sessionId,
        worktreeId,
        branchName: targetWorktree.branch_name,
        folderName: folder.name,
        model: 'Sonnet 4.5',
        title: session.title || session.name || null
      });
      return session;
    } else {
      alert(`Failed to start Claude session: ${result.error}`);
    }
  }, [worktrees, activeWorktree, folder]);

  const handleOpenSession = useCallback(async (sessionId, worktreeId, branchName) => {
    // Already open as tab?
    if (useUIStore.getState().isTabOpen(sessionId)) {
      switchTab(sessionId);
      return;
    }

    const sessions = sessionsByWorktree[worktreeId] || [];
    const session = sessions.find(s => (s.sessionId || s.id) === sessionId);

    if (session && session.status !== 'active') {
      // Resume past session
      await handleStartSession(worktreeId, session.claude_session_id);
      return;
    }

    // Active session — pre-seed cache from DB if empty
    const cachedMessages = getMessages(sessionId);
    if (cachedMessages.length === 0 && session?.messages) {
      try {
        const parsed = JSON.parse(session.messages);
        if (parsed.length > 0) setMessages(sessionId, parsed);
      } catch {}
    }
    openTab({
      sessionId,
      worktreeId,
      branchName,
      folderName: folder.name,
      model: 'Sonnet 4.5',
      title: session?.title || session?.name || null
    });
  }, [sessionsByWorktree, handleStartSession]);

  const handleDeleteSession = useCallback(async (sessionId, worktreeId) => {
    await deleteSession(sessionId, worktreeId);
    closeTab(sessionId);
  }, []);

  const handleCloseTab = useCallback((sessionId, shouldStop) => {
    saveMessages(sessionId);

    if (shouldStop) {
      clearMessages(sessionId);
      useSessionStore.getState().stopSession(sessionId);
    }
    closeTab(sessionId);
  }, []);

  // Global keyboard shortcuts (must be after handler definitions)
  useEffect(() => {
    const handleKeyDown = (e) => {
      const isMeta = e.metaKey || e.ctrlKey;

      // Escape — close modals
      if (e.key === 'Escape') {
        if (showCreateModal) { setShowCreateModal(false); return; }
        if (deleteConfirm) { setDeleteConfirm(null); return; }
      }

      // Cmd+N — new session on active worktree
      if (isMeta && e.key === 'n') {
        e.preventDefault();
        if (activeWorktree) {
          handleStartSession(activeWorktree.id);
        }
        return;
      }

      // Cmd+W — close active tab
      if (isMeta && e.key === 'w') {
        e.preventDefault();
        if (activeTabId) {
          handleCloseTab(activeTabId, false);
        }
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showCreateModal, deleteConfirm, activeWorktree, activeTabId, handleStartSession, handleCloseTab]);

  const handleLazyResume = useCallback(async (message) => {
    const pending = useSessionStore.getState().pendingResumeSession;
    if (!pending) return;

    const result = await lazyResume(
      folder.id, pending.worktreeId, pending.claudeSessionId,
      message, pending.messages, pending.branchName, pending.title
    );
    if (result.success) {
      const session = result.session;
      const targetWorktree = worktrees.find(w => w.id === pending.worktreeId);
      openTab({
        sessionId: session.sessionId,
        worktreeId: pending.worktreeId,
        branchName: targetWorktree?.branch_name || pending.branchName,
        folderName: folder.name,
        model: 'Sonnet 4.5',
        title: pending.title || session.title || session.name || null
      });
    }
  }, [folder, worktrees]);

  const handleArchiveSession = useCallback(async (sessionId, worktreeId) => {
    await archiveSession(sessionId, worktreeId, folder.id);
  }, [folder]);

  const handleUnarchiveAndResume = useCallback(async (sessionId, worktreeId, branchName, claudeSessionId) => {
    const targetWorktree = worktrees.find(w => w.id === worktreeId);
    if (activeWorktree?.id !== worktreeId && targetWorktree) {
      await selectBranch(folder.id, targetWorktree);
    }
    const result = await unarchiveAndResume(sessionId, worktreeId, claudeSessionId, folder.id);
    if (result?.success) {
      const session = result.session;
      openTab({
        sessionId: session.sessionId,
        worktreeId,
        branchName,
        folderName: folder.name,
        model: 'Sonnet 4.5',
        title: session.title || session.name || null
      });
    }
  }, [folder, worktrees, activeWorktree]);

  const handleLoadArchived = useCallback(async (worktreeId) => {
    await loadArchivedSessions(folder.id, worktreeId);
  }, [folder]);

  const handleOpenFile = useCallback((fileInfo) => {
    const tabId = fileInfo.filePath;
    if (useUIStore.getState().isTabOpen(tabId)) {
      switchTab(tabId);
      return;
    }
    openTab({
      id: tabId,
      type: 'file',
      filePath: fileInfo.filePath,
      relativePath: fileInfo.relativePath,
      fileName: fileInfo.fileName,
      worktreeId: activeWorktree?.id,
      folderId: folder.id,
      hasChanges: fileInfo.hasChanges,
      changeType: fileInfo.changeType,
      viewMode: fileInfo.viewMode,
      title: fileInfo.fileName
    });
  }, [folder, activeWorktree]);

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
          onLoadArchivedSessions={handleLoadArchived}
          sessionsByWorktree={sessionsByWorktree}
          archivedSessionsByWorktree={archivedSessionsByWorktree}
          openTabs={openTabs}
        />

        <MainContent
          openTabs={openTabs}
          activeTabId={activeTabId}
          onSwitchTab={switchTab}
          onCloseTab={handleCloseTab}
          pendingResumeSession={pendingResumeSession}
          onLazyResume={handleLazyResume}
        />

        <FilePanel
          collapsed={filePanelCollapsed}
          onToggle={toggleFilePanel}
          folderId={folder.id}
          worktreeId={activeWorktree?.id}
          onOpenFile={handleOpenFile}
        />
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
