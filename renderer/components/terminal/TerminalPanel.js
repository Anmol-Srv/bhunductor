import React, { useCallback, useEffect, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Plus, X, ChevronDown, Terminal, Trash2 } from 'lucide-react';
import TerminalInstance from './TerminalInstance';
import useTerminalStore from '../../stores/terminalStore';

const EMPTY_TERMINALS = [];

function TerminalPanel({ folderId, worktreePath }) {
  const panelVisible = useTerminalStore(s => s.panelVisible);
  const panelHeight = useTerminalStore(s => s.panelHeight);
  const terminals = useTerminalStore(useShallow(s => s.terminalsByFolder[folderId] || EMPTY_TERMINALS));
  const activeTerminalId = useTerminalStore(s => s.activeTerminalByFolder[folderId] || null);
  const createTerminal = useTerminalStore(s => s.createTerminal);
  const removeTerminal = useTerminalStore(s => s.removeTerminal);
  const switchTerminal = useTerminalStore(s => s.switchTerminal);
  const togglePanel = useTerminalStore(s => s.togglePanel);
  const setPanelHeight = useTerminalStore(s => s.setPanelHeight);

  const handleCreate = useCallback(() => {
    createTerminal(folderId, worktreePath || undefined);
  }, [folderId, worktreePath, createTerminal]);

  const handleClose = useCallback(async (terminalId) => {
    await window.electron.invoke('terminal:close', { terminalId });
    removeTerminal(folderId, terminalId);
  }, [folderId, removeTerminal]);

  const handleKillActive = useCallback(() => {
    if (activeTerminalId) {
      handleClose(activeTerminalId);
    }
  }, [activeTerminalId, handleClose]);

  // Keyboard shortcut: Ctrl+` to toggle/create terminal
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.ctrlKey && e.key === '`') {
        e.preventDefault();
        const store = useTerminalStore.getState();
        const terms = store.terminalsByFolder[folderId] || [];
        if (terms.length === 0) {
          handleCreate();
        } else {
          store.togglePanel();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [folderId, handleCreate]);

  // Listen for terminal:exit events to remove dead terminals
  useEffect(() => {
    const cleanup = window.electron.on('terminal:exit', (payload) => {
      const current = useTerminalStore.getState().terminalsByFolder[folderId] || [];
      if (current.some(t => t.id === payload.terminalId)) {
        removeTerminal(folderId, payload.terminalId);
      }
    });
    return () => cleanup?.();
  }, [folderId, removeTerminal]);

  // Drag handle for resizing
  const handleDragStart = useCallback((e) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = useTerminalStore.getState().panelHeight;

    const handleMouseMove = (moveEvent) => {
      const delta = startY - moveEvent.clientY;
      useTerminalStore.getState().setPanelHeight(startHeight + delta);
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
  }, []);

  if (!panelVisible || terminals.length === 0) return null;

  return (
    <>
      <div className="terminal-drag-handle" onMouseDown={handleDragStart} />
      <div className="terminal-panel" style={{ height: panelHeight }}>
        <div className="terminal-header">
          <span className="terminal-header-label">TERMINAL</span>
          <div className="terminal-tabs">
            {terminals.map(t => (
              <div
                key={t.id}
                className={`terminal-tab ${t.id === activeTerminalId ? 'active' : ''}`}
                onClick={() => switchTerminal(folderId, t.id)}
              >
                <Terminal size={11} className="terminal-tab-icon" />
                <span className="terminal-tab-label">{t.title}</span>
                <button
                  className="terminal-tab-close"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleClose(t.id);
                  }}
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
          <div className="terminal-actions">
            <button className="terminal-action-btn" onClick={handleCreate} title="New Terminal">
              <Plus size={14} />
            </button>
            <button className="terminal-action-btn" onClick={handleKillActive} title="Kill Terminal" disabled={!activeTerminalId}>
              <Trash2 size={13} />
            </button>
            <button className="terminal-action-btn" onClick={togglePanel} title="Hide Panel">
              <ChevronDown size={14} />
            </button>
          </div>
        </div>
        <div className="terminal-body">
          {terminals.map(t => (
            <TerminalInstance
              key={t.id}
              terminalId={t.id}
              isVisible={t.id === activeTerminalId}
            />
          ))}
        </div>
      </div>
    </>
  );
}

export default TerminalPanel;
