import React, { useRef, useEffect } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';

function TerminalInstance({ terminalId, isVisible }) {
  const containerRef = useRef(null);
  const termRef = useRef(null);
  const fitAddonRef = useRef(null);
  const cleanupRef = useRef(null);
  const isVisibleRef = useRef(isVisible);

  // Track visibility for ResizeObserver callback
  useEffect(() => {
    isVisibleRef.current = isVisible;
  }, [isVisible]);

  // Create terminal once on mount
  useEffect(() => {
    if (!containerRef.current || termRef.current) return;

    const term = new Terminal({
      fontFamily: "'JetBrains Mono', 'SF Mono', 'Fira Code', Monaco, Consolas, monospace",
      fontSize: 13,
      lineHeight: 1.3,
      cursorBlink: true,
      cursorStyle: 'bar',
      theme: {
        background: '#171717',
        foreground: '#e4e4e7',
        cursor: '#36B5AB',
        selectionBackground: 'rgba(54, 181, 171, 0.25)',
        black: '#171717',
        red: '#ef4444',
        green: '#22c55e',
        yellow: '#d4a017',
        blue: '#3b82f6',
        magenta: '#a855f7',
        cyan: '#36B5AB',
        white: '#e4e4e7',
        brightBlack: '#52525b',
        brightRed: '#f87171',
        brightGreen: '#4ade80',
        brightYellow: '#facc15',
        brightBlue: '#60a5fa',
        brightMagenta: '#c084fc',
        brightCyan: '#5eead4',
        brightWhite: '#fafafa'
      },
      allowProposedApi: true,
      scrollback: 5000
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    term.open(containerRef.current);

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    // Initial fit
    requestAnimationFrame(() => {
      try {
        fitAddon.fit();
        window.electron.invoke('terminal:resize', {
          terminalId,
          cols: term.cols,
          rows: term.rows
        });
      } catch {}
    });

    // Replay buffered output from the PTY (reconnect after navigation)
    window.electron.invoke('terminal:get-buffer', { terminalId }).then((result) => {
      if (result?.success && result.data) {
        term.write(result.data);
      }
    });

    // Send keystrokes to PTY
    const dataDisposable = term.onData((data) => {
      window.electron.invoke('terminal:data', { terminalId, data });
    });

    // Receive PTY output
    const outputCleanup = window.electron.on('terminal:output', (payload) => {
      if (payload.terminalId === terminalId) {
        term.write(payload.data);
      }
    });

    // Handle PTY exit
    const exitCleanup = window.electron.on('terminal:exit', (payload) => {
      if (payload.terminalId === terminalId) {
        term.write('\r\n\x1b[90m[Process exited]\x1b[0m\r\n');
      }
    });

    // ResizeObserver for container size changes
    const resizeObserver = new ResizeObserver(() => {
      if (!isVisibleRef.current) return;
      try {
        fitAddon.fit();
        window.electron.invoke('terminal:resize', {
          terminalId,
          cols: term.cols,
          rows: term.rows
        });
      } catch {}
    });
    resizeObserver.observe(containerRef.current);

    cleanupRef.current = () => {
      dataDisposable.dispose();
      outputCleanup();
      exitCleanup();
      resizeObserver.disconnect();
      term.dispose();
    };

    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
      termRef.current = null;
      fitAddonRef.current = null;
    };
  }, [terminalId]);

  // Re-fit and focus when becoming visible
  useEffect(() => {
    if (!isVisible || !termRef.current || !fitAddonRef.current) return;

    requestAnimationFrame(() => {
      try {
        fitAddonRef.current.fit();
        window.electron.invoke('terminal:resize', {
          terminalId,
          cols: termRef.current.cols,
          rows: termRef.current.rows
        });
        termRef.current.focus();
      } catch {}
    });
  }, [isVisible, terminalId]);

  return (
    <div
      ref={containerRef}
      className="terminal-instance"
      style={{ display: isVisible ? 'block' : 'none' }}
    />
  );
}

export default TerminalInstance;
