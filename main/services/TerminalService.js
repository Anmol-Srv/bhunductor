const { IPC_CHANNELS } = require('../../shared/constants');
const { v4: uuidv4 } = require('uuid');
const os = require('os');

const OUTPUT_BUFFER_SIZE = 64 * 1024; // 64 KB circular buffer per terminal

class TerminalService {
  constructor(mainWindow) {
    this.mainWindow = mainWindow;
    this.terminals = new Map(); // terminalId → { pty, cwd, buffer }
    this.pty = null; // lazy-loaded
  }

  _loadPty() {
    if (!this.pty) {
      this.pty = require('node-pty');
    }
    return this.pty;
  }

  registerHandlers(ipcMain) {
    ipcMain.handle(IPC_CHANNELS.TERMINAL_CREATE, (event, { cwd }) => {
      try {
        const pty = this._loadPty();
        const terminalId = uuidv4();
        const shell = process.env.SHELL || '/bin/zsh';
        const cols = 80;
        const rows = 24;

        const ptyProcess = pty.spawn(shell, [], {
          name: 'xterm-256color',
          cols,
          rows,
          cwd: cwd || os.homedir(),
          env: { ...process.env, TERM: 'xterm-256color' }
        });

        this.terminals.set(terminalId, { pty: ptyProcess, cwd, buffer: '' });

        ptyProcess.onData((data) => {
          // Append to circular buffer
          const terminal = this.terminals.get(terminalId);
          if (terminal) {
            terminal.buffer += data;
            if (terminal.buffer.length > OUTPUT_BUFFER_SIZE) {
              terminal.buffer = terminal.buffer.slice(-OUTPUT_BUFFER_SIZE);
            }
          }

          if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send(IPC_CHANNELS.TERMINAL_OUTPUT, { terminalId, data });
          }
        });

        ptyProcess.onExit(({ exitCode }) => {
          if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send(IPC_CHANNELS.TERMINAL_EXIT, { terminalId, exitCode });
          }
          this.terminals.delete(terminalId);
        });

        console.log(`[Terminal] Created terminal ${terminalId} in ${cwd}`);
        return { success: true, terminalId };
      } catch (error) {
        console.error('[Terminal] Error creating terminal:', error);
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle(IPC_CHANNELS.TERMINAL_DATA, (event, { terminalId, data }) => {
      const terminal = this.terminals.get(terminalId);
      if (terminal) {
        terminal.pty.write(data);
      }
    });

    ipcMain.handle(IPC_CHANNELS.TERMINAL_RESIZE, (event, { terminalId, cols, rows }) => {
      const terminal = this.terminals.get(terminalId);
      if (terminal) {
        try {
          terminal.pty.resize(cols, rows);
        } catch (error) {
          // Resize can fail if process already exited
        }
      }
    });

    ipcMain.handle(IPC_CHANNELS.TERMINAL_CLOSE, (event, { terminalId }) => {
      const terminal = this.terminals.get(terminalId);
      if (terminal) {
        try {
          terminal.pty.kill();
        } catch (error) {
          // Already dead
        }
        this.terminals.delete(terminalId);
        console.log(`[Terminal] Closed terminal ${terminalId}`);
      }
      return { success: true };
    });

    ipcMain.handle(IPC_CHANNELS.TERMINAL_GET_BUFFER, (event, { terminalId }) => {
      const terminal = this.terminals.get(terminalId);
      if (terminal) {
        return { success: true, data: terminal.buffer };
      }
      return { success: false, error: 'Terminal not found' };
    });
  }

  destroy() {
    for (const [id, terminal] of this.terminals) {
      try {
        terminal.pty.kill();
      } catch (error) {
        // Already dead
      }
    }
    this.terminals.clear();
    console.log('[Terminal] All terminals destroyed');
  }
}

module.exports = TerminalService;
