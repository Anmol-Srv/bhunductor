import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { GitBranch, Radio } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import MainContent from '../components/MainContent';
import CreateBranchModal from '../components/CreateBranchModal';
import DeleteConfirmModal from '../components/DeleteConfirmModal';
import FilePanel from '../components/FilePanel';
import SettingsModal from '../components/settings/SettingsModal';
import useBranchStore from '../stores/branchStore';
import useSessionStore from '../stores/sessionStore';
import useUIStore from '../stores/uiStore';
import useChecksStore from '../stores/checksStore';

const EMPTY_ARRAY = [];

function Dashboard({ folder, onGoHome, onGoBack, onGoForward, canGoBack, canGoForward }) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const { worktrees, closedWorktrees, activeWorktree, loading, initialize, loadWorktrees, createBranch, deleteBranch, selectBranch, closeBranch, reopenBranch, loadClosedWorktrees } = useBranchStore();
  const fetchChecks = useChecksStore(s => s.fetchChecks);
  const { loadAllSessions, loadArchivedSessions, startSession, deleteSession, archiveSession, unarchiveAndResume, lazyResume, loadLastSession, pendingResumeSession, clearPendingResumeSession, sessionsByWorktree, archivedSessionsByWorktree, getMessages, setMessages, saveMessages, clearMessages } = useSessionStore();
  const { setActiveFolder, openTab, closeTab, switchTab, sidebarCollapsed, toggleSidebar, filePanelCollapsed, toggleFilePanel, settingsOpen } = useUIStore();

  // Subscribe to folder-specific tabs with shallow comparison to prevent infinite loops
  const { openTabs, activeTabId } = useUIStore(
    useShallow(state => {
      const folderId = state.activeFolderId;
      return {
        openTabs: folderId ? (state.tabsByFolder[folderId] || EMPTY_ARRAY) : EMPTY_ARRAY,
        activeTabId: folderId ? (state.activeTabByFolder[folderId] || null) : null
      };
    })
  );

  // Initialize worktrees and load sessions on mount
  useEffect(() => {
    if (!folder) return;

    // Set this folder as active in UI store (switches tab context)
    setActiveFolder(folder.id);

    (async () => {
      const result = await initialize(folder);
      if (result) {
        const tasks = [loadAllSessions(folder.id, result.worktrees), loadClosedWorktrees(folder.id)];
        if (result.activeWorktree) {
          tasks.push(loadLastSession(folder.id, result.activeWorktree.id, result.activeWorktree.branch_name));
          tasks.push(fetchChecks(folder.id, result.activeWorktree.id));
        }
        await Promise.all(tasks);
      }
    })();
  }, [folder, setActiveFolder]);

  // Adaptive polling for checks: 5s during fast-poll window (after git actions), 20s otherwise
  useEffect(() => {
    if (!folder || !activeWorktree) return;
    const wtId = activeWorktree.id;
    let timerId;

    const schedulePoll = () => {
      const isFast = useChecksStore.getState().isInFastPoll(wtId);
      const delay = isFast ? 5000 : 20000;
      timerId = setTimeout(() => {
        fetchChecks(folder.id, wtId);
        schedulePoll();
      }, delay);
    };

    schedulePoll();
    return () => clearTimeout(timerId);
  }, [folder?.id, activeWorktree?.id]);

  // Refresh checks immediately when Claude completes a turn (catches commit/push/PR creation)
  useEffect(() => {
    if (!folder || !activeWorktree) return;
    const cleanup = window.electron.on('claude:turn-complete', (data) => {
      if (data?.sessionId) {
        fetchChecks(folder.id, activeWorktree.id);
      }
    });
    return () => cleanup?.();
  }, [folder?.id, activeWorktree?.id]);

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

  const handleCloseBranch = async (worktreeId) => {
    const result = await closeBranch(worktreeId, folder.id);
    if (!result.success) {
      alert(`Failed to close branch: ${result.error}`);
    }
  };

  const handleReopenBranch = async (worktreeId) => {
    const result = await reopenBranch(worktreeId, folder.id);
    if (!result.success) {
      alert(`Failed to reopen branch: ${result.error}`);
    }
  };

  const handleSelectBranch = async (worktree) => {
    await selectBranch(folder.id, worktree);
    fetchChecks(folder.id, worktree.id);
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
        model: 'Opus 4.6',
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
      model: 'Opus 4.6',
      title: session?.title || session?.name || null
    });
  }, [sessionsByWorktree, handleStartSession]);

  const handleDeleteSession = useCallback(async (sessionId, worktreeId) => {
    await deleteSession(sessionId, worktreeId);
    closeTab(sessionId);
  }, []);

  const handleCloseTab = useCallback((sessionId, shouldStop) => {
    // Special case: closing pending resume session
    if (sessionId === null) {
      clearPendingResumeSession();
      return;
    }

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

      // Cmd+W — close active tab or pending resume
      if (isMeta && e.key === 'w') {
        e.preventDefault();
        if (activeTabId) {
          handleCloseTab(activeTabId, false);
        } else if (pendingResumeSession) {
          handleCloseTab(null, false);
        }
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showCreateModal, deleteConfirm, activeWorktree, activeTabId, pendingResumeSession, handleStartSession, handleCloseTab]);

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
        model: 'Opus 4.6',
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
        model: 'Opus 4.6',
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

  const activeSessionCount = useMemo(() => {
    let count = 0;
    for (const wId in sessionsByWorktree) {
      for (const s of sessionsByWorktree[wId]) {
        if (s.status === 'active') count++;
      }
    }
    return count;
  }, [sessionsByWorktree]);

  return (
    <div className="dashboard-wrapper">
      <div className="dashboard">
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={toggleSidebar}
          worktrees={worktrees}
          activeWorktree={activeWorktree}
          onSelectBranch={handleSelectBranch}
          onCreateBranch={() => setShowCreateModal(true)}
          onDeleteBranch={handleDeleteBranch}
          onCloseBranch={handleCloseBranch}
          onReopenBranch={handleReopenBranch}
          closedWorktrees={closedWorktrees}
          onStartSession={handleStartSession}
          onOpenSession={handleOpenSession}
          onDeleteSession={handleDeleteSession}
          onArchiveSession={handleArchiveSession}
          onUnarchiveAndResume={handleUnarchiveAndResume}
          onLoadArchivedSessions={handleLoadArchived}
          sessionsByWorktree={sessionsByWorktree}
          archivedSessionsByWorktree={archivedSessionsByWorktree}
          openTabs={openTabs}
          activeTabId={activeTabId}
          onGoHome={onGoHome}
          onGoBack={onGoBack}
          onGoForward={onGoForward}
          canGoBack={canGoBack}
          canGoForward={canGoForward}
        />

        <MainContent
          folderName={folder.name}
          openTabs={openTabs}
          activeTabId={activeTabId}
          onSwitchTab={switchTab}
          onCloseTab={handleCloseTab}
          pendingResumeSession={pendingResumeSession}
          onLazyResume={handleLazyResume}
          onStartSession={handleStartSession}
          activeWorktree={activeWorktree}
          folder={folder}
          worktreePath={activeWorktree?.is_main ? folder.path : activeWorktree?.worktree_path}
        />

        <FilePanel
          collapsed={filePanelCollapsed}
          onToggle={toggleFilePanel}
          folderId={folder.id}
          worktreeId={activeWorktree?.id}
          activeSessionId={(() => {
            const tab = openTabs.find(t => (t.id || t.sessionId) === activeTabId);
            return tab?.type !== 'file' ? (tab?.sessionId || null) : null;
          })()}
          onChecksUpdate={() => {}}
          onOpenFile={handleOpenFile}
        />

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

        {settingsOpen && <SettingsModal folderPath={folder?.path} />}
      </div>

      <div className="status-bar">
        <div className="status-bar-left">
          <span className="status-bar-item">
            <GitBranch size={12} />
            {activeWorktree?.branch_name || 'no branch'}
          </span>
          <span className="status-bar-item">
            <Radio size={12} />
            {activeSessionCount} session{activeSessionCount !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="status-bar-right">
          <span className="status-bar-item">Claude SDK</span>
          <span className="status-bar-item">Bhunductor v1.0.0</span>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
