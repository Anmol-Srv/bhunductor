import { create } from 'zustand';

// Module-level message cache: survives component mount/unmount
const messageCache = new Map();

const useSessionStore = create((set, get) => ({
  sessionsByWorktree: {},
  archivedSessionsByWorktree: {},
  pendingResumeSession: null,

  // Per-session streaming state: { [sessionId]: { isStreaming, streamingMessage } }
  streamingState: {},

  // Per-session permission queue: { [sessionId]: [permissionData, ...] }
  permissionQueues: {},

  // Per-session last event timestamp for health checks
  lastEventTime: {},

  // --- Message cache helpers (used by IPC listeners and components) ---
  getMessages: (sessionId) => messageCache.get(sessionId) || [],
  setMessages: (sessionId, messages) => {
    messageCache.set(sessionId, messages);
    // Trigger re-render by updating a version counter
    set(state => ({
      _messageCacheVersion: (state._messageCacheVersion || 0) + 1
    }));
  },
  updateMessages: (sessionId, updater) => {
    const current = messageCache.get(sessionId) || [];
    const next = updater(current);
    messageCache.set(sessionId, next);
    set(state => ({
      _messageCacheVersion: (state._messageCacheVersion || 0) + 1
    }));
  },
  clearMessages: (sessionId) => {
    messageCache.delete(sessionId);
  },
  // Mark all running tool_use messages as interrupted for a session
  finalizeRunningTools: (sessionId) => {
    const msgs = messageCache.get(sessionId);
    if (!msgs) return;
    let changed = false;
    const updated = msgs.map(m => {
      if (m.type === 'tool_use' && m.status === 'running') {
        changed = true;
        return { ...m, status: 'error' };
      }
      if (m.type === 'thinking' && m.isPartial) {
        changed = true;
        return { ...m, isPartial: false };
      }
      return m;
    });
    if (changed) {
      messageCache.set(sessionId, updated);
      set(state => ({ _messageCacheVersion: (state._messageCacheVersion || 0) + 1 }));
    }
  },
  _messageCacheVersion: 0,

  // --- Streaming state ---
  setStreaming: (sessionId, isStreaming) => set(state => ({
    streamingState: {
      ...state.streamingState,
      [sessionId]: {
        ...(state.streamingState[sessionId] || {}),
        isStreaming,
        streamingMessage: isStreaming ? (state.streamingState[sessionId]?.streamingMessage || '') : ''
      }
    }
  })),
  appendStreamingText: (sessionId, text) => set(state => ({
    streamingState: {
      ...state.streamingState,
      [sessionId]: {
        isStreaming: true,
        streamingMessage: (state.streamingState[sessionId]?.streamingMessage || '') + text
      }
    }
  })),
  commitStreamingText: (sessionId) => {
    const state = get();
    const streamMsg = state.streamingState[sessionId]?.streamingMessage || '';
    if (streamMsg) {
      const current = messageCache.get(sessionId) || [];
      messageCache.set(sessionId, [...current, {
        id: crypto.randomUUID(), role: 'assistant', type: 'text', text: streamMsg
      }]);
    }
    set(state => ({
      streamingState: {
        ...state.streamingState,
        [sessionId]: { isStreaming: false, streamingMessage: '' }
      },
      _messageCacheVersion: (state._messageCacheVersion || 0) + 1
    }));
  },

  // --- Permission queue ---
  addPermission: (sessionId, permissionData) => set(state => ({
    permissionQueues: {
      ...state.permissionQueues,
      [sessionId]: [...(state.permissionQueues[sessionId] || []), permissionData]
    }
  })),
  shiftPermission: (sessionId) => set(state => ({
    permissionQueues: {
      ...state.permissionQueues,
      [sessionId]: (state.permissionQueues[sessionId] || []).slice(1)
    }
  })),

  // --- Health tracking ---
  recordEvent: (sessionId) => set(state => ({
    lastEventTime: { ...state.lastEventTime, [sessionId]: Date.now() }
  })),
  clearEventTime: (sessionId) => set(state => {
    const next = { ...state.lastEventTime };
    delete next[sessionId];
    return { lastEventTime: next };
  }),
  // Check if a session's CLI process is still alive via main process
  checkSessionHealth: async (sessionId) => {
    const state = get();
    const isStreaming = state.streamingState[sessionId]?.isStreaming;
    if (!isStreaming) return; // Only check sessions that claim to be streaming

    const lastTime = state.lastEventTime[sessionId];
    const elapsed = lastTime ? Date.now() - lastTime : Infinity;

    // Only check if no events for 10+ seconds
    if (elapsed < 10000) return;

    try {
      const result = await window.electron.invoke('claude:session-check-alive', sessionId);
      if (!result.alive) {
        // Process is dead — finalize running tools and stop streaming
        get().finalizeRunningTools(sessionId);
        get().setStreaming(sessionId, false);
        get().updateSessionStatus(sessionId, 'exited');
      }
    } catch {
      // IPC call failed — process likely dead
      get().finalizeRunningTools(sessionId);
      get().setStreaming(sessionId, false);
    }
  },

  // --- Session CRUD ---
  setSessions: (worktreeId, sessions) => set(state => ({
    sessionsByWorktree: { ...state.sessionsByWorktree, [worktreeId]: sessions }
  })),
  addSession: (worktreeId, session, removedIds = []) => set(state => {
    const existing = state.sessionsByWorktree[worktreeId] || [];
    const filtered = removedIds.length > 0
      ? existing.filter(s => !removedIds.includes(s.sessionId || s.id))
      : existing;
    return {
      sessionsByWorktree: { ...state.sessionsByWorktree, [worktreeId]: [...filtered, session] }
    };
  }),
  updateSessionStatus: (sessionId, status) => set(state => {
    const next = { ...state.sessionsByWorktree };
    for (const wtId of Object.keys(next)) {
      next[wtId] = next[wtId].map(s =>
        (s.sessionId || s.id) === sessionId ? { ...s, status } : s
      );
    }
    return { sessionsByWorktree: next };
  }),
  updateSessionTitle: (sessionId, title) => set(state => {
    const next = { ...state.sessionsByWorktree };
    for (const wtId of Object.keys(next)) {
      next[wtId] = next[wtId].map(s =>
        (s.sessionId || s.id) === sessionId ? { ...s, name: title, title } : s
      );
    }
    return { sessionsByWorktree: next };
  }),
  removeSession: (sessionId, worktreeId) => set(state => {
    const result = { ...state.sessionsByWorktree };
    if (worktreeId) {
      result[worktreeId] = (result[worktreeId] || []).filter(s => (s.sessionId || s.id) !== sessionId);
    } else {
      for (const wtId of Object.keys(result)) {
        result[wtId] = result[wtId].filter(s => (s.sessionId || s.id) !== sessionId);
      }
    }
    return { sessionsByWorktree: result };
  }),
  reactivateSession: (worktreeId, session) => set(state => {
    const sessId = session.sessionId || session.id;
    const existing = state.sessionsByWorktree[worktreeId] || [];
    const found = existing.some(s => (s.sessionId || s.id) === sessId);
    const updated = found
      ? existing.map(s => (s.sessionId || s.id) === sessId ? { ...s, ...session, status: 'active' } : s)
      : [...existing, session];
    return { sessionsByWorktree: { ...state.sessionsByWorktree, [worktreeId]: updated } };
  }),

  // --- Archived sessions ---
  setArchivedSessions: (worktreeId, sessions) => set(state => ({
    archivedSessionsByWorktree: { ...state.archivedSessionsByWorktree, [worktreeId]: sessions }
  })),
  removeArchivedSession: (sessionId, worktreeId) => set(state => {
    const list = state.archivedSessionsByWorktree[worktreeId] || [];
    return {
      archivedSessionsByWorktree: {
        ...state.archivedSessionsByWorktree,
        [worktreeId]: list.filter(s => (s.sessionId || s.id) !== sessionId)
      }
    };
  }),

  // --- Pending resume ---
  setPendingResumeSession: (data) => set({ pendingResumeSession: data }),
  clearPendingResumeSession: () => set({ pendingResumeSession: null }),

  // --- Async actions ---
  loadSessions: async (folderId, worktreeId) => {
    const result = await window.electron.invoke('claude:session-list', folderId, worktreeId);
    if (result.success) {
      get().setSessions(worktreeId, result.sessions);
    }
    return result;
  },
  loadAllSessions: async (folderId, worktreeList) => {
    for (const wt of worktreeList) {
      await get().loadSessions(folderId, wt.id);
    }
  },
  loadArchivedSessions: async (folderId, worktreeId) => {
    const result = await window.electron.invoke('claude:session-list-archived', folderId, worktreeId);
    if (result.success) {
      get().setArchivedSessions(worktreeId, result.sessions);
    }
  },
  startSession: async (folderId, worktreeId, claudeSessionId = null) => {
    const result = await window.electron.invoke('claude:session-start', folderId, worktreeId, claudeSessionId);
    if (result.success) {
      const deletedIds = result.deletedSessionIds || [];
      if (result.reactivatedSessionId) {
        get().reactivateSession(worktreeId, result.session);
        get().removeArchivedSession(result.reactivatedSessionId, worktreeId);
        // Also archive other sessions that got auto-archived
        for (const id of deletedIds) {
          if (id !== result.reactivatedSessionId) {
            get().removeSession(id, worktreeId);
          }
        }
      } else {
        get().addSession(worktreeId, result.session, deletedIds);
      }
    }
    return result;
  },
  stopSession: async (sessionId) => {
    get().finalizeRunningTools(sessionId);
    get().setStreaming(sessionId, false);
    get().clearEventTime(sessionId);
    const messages = messageCache.get(sessionId) || [];
    if (messages.length > 0) {
      await window.electron.invoke('claude:session-save-messages', sessionId, messages).catch(() => {});
    }
    messageCache.delete(sessionId);
    const result = await window.electron.invoke('claude:session-stop', sessionId);
    if (result.success) {
      get().updateSessionStatus(sessionId, 'stopped');
    }
    return result;
  },
  deleteSession: async (sessionId, worktreeId) => {
    const result = await window.electron.invoke('claude:session-delete', sessionId);
    if (result.success) {
      get().removeSession(sessionId, worktreeId);
      get().removeArchivedSession(sessionId, worktreeId);
    }
    return result;
  },
  archiveSession: async (sessionId, worktreeId, folderId) => {
    const result = await window.electron.invoke('claude:session-archive', sessionId);
    if (result.success) {
      get().removeSession(sessionId, worktreeId);
      get().loadArchivedSessions(folderId, worktreeId);
    }
    return result;
  },
  unarchiveAndResume: async (sessionId, worktreeId, claudeSessionId, folderId) => {
    // reactivateSession in main process handles unarchiving (sets archived=0)
    const result = await get().startSession(folderId, worktreeId, claudeSessionId);
    if (result.success) {
      get().removeArchivedSession(result.reactivatedSessionId || sessionId, worktreeId);
    }
    return result;
  },
  sendMessage: async (sessionId, message) => {
    return window.electron.invoke('claude:send-message', sessionId, message);
  },
  respondToPermission: async (sessionId, requestId, approved) => {
    const result = await window.electron.invoke('claude:permission-respond', requestId, approved);
    if (result.success) {
      get().shiftPermission(sessionId);
    }
    return result;
  },
  saveMessages: async (sessionId) => {
    const messages = messageCache.get(sessionId) || [];
    if (messages.length > 0) {
      await window.electron.invoke('claude:session-save-messages', sessionId, messages).catch(() => {});
    }
  },
  lazyResume: async (folderId, worktreeId, claudeSessionId, message, oldMessages, branchName, name) => {
    const result = await window.electron.invoke(
      'claude:session-lazy-resume', folderId, worktreeId, claudeSessionId, message
    );
    if (result.success) {
      const session = result.session;
      const archivedIds = result.archivedSessionIds || [];
      const seedMessages = [
        ...(oldMessages || []),
        { id: crypto.randomUUID(), role: 'user', type: 'text', text: message }
      ];
      messageCache.set(session.sessionId, seedMessages);
      if (result.reactivatedSessionId) {
        get().reactivateSession(worktreeId, session);
        get().removeArchivedSession(result.reactivatedSessionId, worktreeId);
      } else {
        get().addSession(worktreeId, session, archivedIds);
      }
      get().clearPendingResumeSession();
      set(state => ({ _messageCacheVersion: (state._messageCacheVersion || 0) + 1 }));
    }
    return result;
  },
  loadLastSession: async (folderId, worktreeId, branchName) => {
    const result = await window.electron.invoke('claude:session-get-last', folderId, worktreeId);
    if (result.success && result.session) {
      get().setPendingResumeSession({
        sessionId: result.session.sessionId,
        claudeSessionId: result.session.claude_session_id,
        worktreeId,
        branchName,
        title: result.session.name || null,
        messages: result.session.parsedMessages || []
      });
    }
    return result;
  }
}));

export default useSessionStore;
