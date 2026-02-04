const { app, BrowserWindow } = require('electron');
const path = require('path');
const ConfigManager = require('./data/config-manager');
const { getDatabase, closeDatabase } = require('./data/database');
const Folder = require('./data/models/Folder');
const { registerIPCHandlers } = require('./ipc-handlers');
const { WINDOW_WIDTH, WINDOW_HEIGHT } = require('../shared/constants');

let mainWindow = null;
let configManager = null;

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
      preload: path.join(__dirname, '../renderer/preload.js')
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
  console.log('[Main] App ready, initializing...');

  // Initialize config manager
  configManager = new ConfigManager();

  // Initialize database and run cleanup
  getDatabase();
  Folder.cleanupInvalid();

  // Create window
  createWindow();

  // Register IPC handlers (after window creation for Claude integration)
  registerIPCHandlers(configManager, mainWindow);

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

app.on('quit', () => {
  closeDatabase();
  console.log('[Main] App quit');
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('[Main] Uncaught exception:', error);
});
