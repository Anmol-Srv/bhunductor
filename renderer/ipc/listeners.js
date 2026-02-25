import useSessionStore from '../stores/sessionStore';
import useUIStore from '../stores/uiStore';

const HEALTH_CHECK_INTERVAL_MS = 5000;
const AUTO_SAVE_INTERVAL_MS = 10000;

/**
 * Set up all IPC event listeners that update Zustand stores.
 * Call once on App mount, returns cleanup function.
 */
export function setupIPCListeners() {
  const unsubs = [];

  // Helper: record event timestamp for health tracking
  const touch = (sessionId) => {
    useSessionStore.getState().recordEvent(sessionId);
  };

  // Text streaming chunks
  unsubs.push(window.electron.on('claude:message-chunk', (data) => {
    if (!data?.sessionId) return;
    touch(data.sessionId);
    useSessionStore.getState().appendStreamingText(data.sessionId, data.text || '');
  }));

  // Message complete — commit streaming text
  unsubs.push(window.electron.on('claude:message-complete', (data) => {
    if (!data?.sessionId) return;
    touch(data.sessionId);
    useSessionStore.getState().commitStreamingText(data.sessionId);
  }));

  // Tool use events
  unsubs.push(window.electron.on('claude:tool-use', (data) => {
    if (!data?.sessionId) return;
    touch(data.sessionId);
    const store = useSessionStore.getState();

    // Commit any streaming text before tool block
    const streamState = store.streamingState[data.sessionId];
    if (streamState?.streamingMessage) {
      store.commitStreamingText(data.sessionId);
    }

    // Ensure streaming flag is on (tool events mean the session is active)
    if (!store.streamingState[data.sessionId]?.isStreaming) {
      store.setStreaming(data.sessionId, true);
    }

    store.updateMessages(data.sessionId, (prev) => {
      const idx = prev.findIndex(m => m.type === 'tool_use' && m.toolUseId === data.toolUseId);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = {
          ...updated[idx],
          toolInput: data.toolInput || updated[idx].toolInput,
          status: data.status
        };
        return updated;
      }
      return [...prev, {
        id: data.toolUseId,
        role: 'assistant',
        type: 'tool_use',
        toolUseId: data.toolUseId,
        toolName: data.toolName,
        toolInput: data.toolInput,
        status: data.status || 'running'
      }];
    });
  }));

  // Tool result events
  unsubs.push(window.electron.on('claude:tool-result', (data) => {
    if (!data?.sessionId) return;
    touch(data.sessionId);
    useSessionStore.getState().updateMessages(data.sessionId, (prev) =>
      prev.map(m => {
        if (m.type === 'tool_use' && m.toolUseId === data.toolUseId) {
          return { ...m, result: data.result, isError: data.isError, status: data.isError ? 'error' : 'complete' };
        }
        return m;
      })
    );
  }));

  // Thinking events
  unsubs.push(window.electron.on('claude:thinking', (data) => {
    if (!data?.sessionId) return;
    touch(data.sessionId);
    useSessionStore.getState().updateMessages(data.sessionId, (prev) => {
      if (data.isPartial) {
        const lastIdx = prev.length - 1;
        if (lastIdx >= 0 && prev[lastIdx].type === 'thinking' && prev[lastIdx].isPartial) {
          const updated = [...prev];
          updated[lastIdx] = { ...updated[lastIdx], thinking: updated[lastIdx].thinking + data.thinking };
          return updated;
        }
        return [...prev, {
          id: crypto.randomUUID(), role: 'assistant', type: 'thinking',
          thinking: data.thinking, isPartial: true
        }];
      } else {
        const lastIdx = prev.length - 1;
        if (lastIdx >= 0 && prev[lastIdx].type === 'thinking' && prev[lastIdx].isPartial) {
          const updated = [...prev];
          updated[lastIdx] = { ...updated[lastIdx], thinking: data.thinking, isPartial: false };
          return updated;
        }
        return [...prev, {
          id: crypto.randomUUID(), role: 'assistant', type: 'thinking',
          thinking: data.thinking, isPartial: false
        }];
      }
    });
  }));

  // Turn complete (cost/usage)
  unsubs.push(window.electron.on('claude:turn-complete', (data) => {
    if (!data?.sessionId) return;
    touch(data.sessionId);
    const store = useSessionStore.getState();
    store.finalizeRunningTools(data.sessionId);
    if (data.costUsd || data.usage) {
      store.updateMessages(data.sessionId, (prev) => [
        ...prev, {
          id: crypto.randomUUID(), role: 'system', type: 'result',
          costUsd: data.costUsd, usage: data.usage, durationMs: data.durationMs
        }
      ]);
    }
  }));

  // Permission requests (deduplicate by requestId on reload recovery)
  unsubs.push(window.electron.on('claude:permission-request', (data) => {
    if (!data) return;
    const sessionId = data.session_id || data.sessionId;
    if (sessionId) {
      touch(sessionId);
      const store = useSessionStore.getState();
      const queue = store.permissionQueues[sessionId] || [];
      // Deduplicate: skip if requestId already in queue
      if (data.requestId && queue.some(p => p.requestId === data.requestId)) {
        return;
      }
      store.addPermission(sessionId, data);
    }
  }));

  // Permission dismissed (timeout or session stopped)
  unsubs.push(window.electron.on('claude:permission-dismissed', (data) => {
    if (!data) return;
    const sessionId = data.session_id || data.sessionId;
    if (!sessionId) return;
    const store = useSessionStore.getState();
    if (data.clearAll) {
      store.clearPermissions(sessionId);
    } else if (data.requestId) {
      store.removePermission(sessionId, data.requestId);
    }
  }));

  // Session errors
  unsubs.push(window.electron.on('claude:session-error', (data) => {
    if (!data?.sessionId) return;
    touch(data.sessionId);
    const store = useSessionStore.getState();
    store.finalizeRunningTools(data.sessionId);
    store.setStreaming(data.sessionId, false);
    store.updateMessages(data.sessionId, (prev) => [
      ...prev, {
        id: crypto.randomUUID(), role: 'system', type: 'error', text: data.error,
        errorType: data.errorType || 'unknown',
        isRecoverable: data.isRecoverable || false
      }
    ]);
  }));

  // Conversation history (from resume/continue)
  unsubs.push(window.electron.on('claude:conversation-history', (data) => {
    if (!data?.sessionId) return;
    touch(data.sessionId);
    useSessionStore.getState().setMessages(data.sessionId, data.messages || []);
  }));

  // Session exited
  unsubs.push(window.electron.on('claude:session-exited', (data) => {
    if (!data?.sessionId) return;
    const { sessionId } = data;
    const store = useSessionStore.getState();

    // Stop streaming and finalize any running tools/thinking
    store.setStreaming(sessionId, false);
    store.finalizeRunningTools(sessionId);
    store.clearEventTime(sessionId);

    // Persist messages to DB
    const messages = store.getMessages(sessionId);
    if (messages.length > 0) {
      window.electron.invoke('claude:session-save-messages', sessionId, messages).catch(() => {});
    }
    store.clearMessages(sessionId);
    store.updateSessionStatus(sessionId, 'exited');

    // Remove from open tabs
    useUIStore.getState().closeTab(sessionId);
  }));

  // Session title updated
  unsubs.push(window.electron.on('claude:session-title-updated', (data) => {
    if (!data?.sessionId || !data.title) return;
    touch(data.sessionId);
    useSessionStore.getState().updateSessionTitle(data.sessionId, data.title);
    useUIStore.getState().updateTabTitle(data.sessionId, data.title);
  }));

  // --- Periodic health check ---
  // Detects stale sessions where the CLI process died without sending exit events
  const healthInterval = setInterval(() => {
    const state = useSessionStore.getState();
    const streamingSessions = Object.entries(state.streamingState)
      .filter(([, s]) => s.isStreaming)
      .map(([id]) => id);

    for (const sessionId of streamingSessions) {
      state.checkSessionHealth(sessionId);
    }
  }, HEALTH_CHECK_INTERVAL_MS);

  // --- Periodic auto-save ---
  // Saves all sessions (including in-flight streaming text) every 10 seconds.
  // This ensures messages survive app crashes, tab switches, and window reloads.
  const autoSaveInterval = setInterval(() => {
    useSessionStore.getState().saveAllSessions();
  }, AUTO_SAVE_INTERVAL_MS);

  // --- beforeunload: flush all messages to DB before window closes ---
  const handleBeforeUnload = () => {
    useSessionStore.getState().saveAllSessions();
  };
  window.addEventListener('beforeunload', handleBeforeUnload);

  // Notify main process that renderer is (re)connected.
  // This triggers re-sending of pending permissions and recovery of active session state.
  window.electron.invoke('claude:renderer-ready').catch(() => {});
  window.electron.invoke('claude:session-get-active').then(result => {
    if (result?.success && result.sessions) {
      const store = useSessionStore.getState();
      for (const session of result.sessions) {
        if (session.isRunning) {
          store.setStreaming(session.sessionId, true);
        }
      }
    }
  }).catch(() => {});

  return () => {
    clearInterval(healthInterval);
    clearInterval(autoSaveInterval);
    window.removeEventListener('beforeunload', handleBeforeUnload);
    for (const unsub of unsubs) {
      unsub();
    }
  };
}
