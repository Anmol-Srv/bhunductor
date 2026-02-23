const { app, BrowserWindow } = require('electron');
const path = require('path');
const ConfigManager = require('./data/config-manager');
const { getDatabase, closeDatabase } = require('./data/database');
const Folder = require('./data/models/Folder');
const { registerIPC } = require('./ipc/register');
const { WINDOW_WIDTH, WINDOW_HEIGHT } = require('../shared/constants');

let mainWindow = null;
let configManager = null;
let sessionService = null;
let terminalService = null;

function createWindow() {
  const { width, height } = configManager.get('window') || {
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT
  };

  // Calculate center position
  const { screen } = require('electron');
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

  const x = Math.floor((screenWidth - width) / 2);
  const y = Math.floor((screenHeight - height) / 2);

  mainWindow = new BrowserWindow({
    width,
    height,
    x,
    y,
    minWidth: 1000,
    minHeight: 600,
    titleBarStyle: 'hiddenInset', // macOS traffic lights
    backgroundColor: '#0d0d0d',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '../renderer/preload.bundle.js')
    }
  });

  // Load renderer
  const isDev = process.env.NODE_ENV === 'development';
  if (isDev) {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  console.time('[Main] startup-total');

  // Initialize config manager (needed for window dimensions)
  console.time('[Main] config-init');
  configManager = new ConfigManager();
  console.timeEnd('[Main] config-init');

  // Create window first — user sees UI immediately
  console.time('[Main] create-window');
  createWindow();
  console.timeEnd('[Main] create-window');

  // Initialize database
  console.time('[Main] database-init');
  getDatabase();
  console.timeEnd('[Main] database-init');

  // Register IPC handlers (after window creation for Claude integration)
  console.time('[Main] ipc-register');
  const services = registerIPC(mainWindow, configManager);
  sessionService = services.sessionService;
  terminalService = services.terminalService;
  console.timeEnd('[Main] ipc-register');

  // Defer cleanup — non-blocking, runs after event loop settles
  setImmediate(() => {
    console.time('[Main] folder-cleanup');
    Folder.cleanupInvalid();
    console.timeEnd('[Main] folder-cleanup');
    console.timeEnd('[Main] startup-total');
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

/**
 * Cleanup on quit
 */
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (sessionService) {
    sessionService.saveAllActiveSessions();
  }
});

app.on('quit', () => {
  if (terminalService) {
    terminalService.destroy();
  }
  if (sessionService) {
    sessionService.destroy();
  }
  closeDatabase();
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('[Main] Uncaught exception:', error);
});
