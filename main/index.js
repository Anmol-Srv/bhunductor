const { app, BrowserWindow } = require('electron');
const path = require('path');
const ConfigManager = require('./data/config-manager');
const FolderManager = require('./data/folder-manager');
const { registerIPCHandlers } = require('./ipc-handlers');
const { WINDOW_WIDTH, WINDOW_HEIGHT } = require('../shared/constants');

let mainWindow = null;
let configManager = null;
let folderManager = null;

/**
 * Create the main application window
 */
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

  console.log('[Main] Window created and centered');
}

/**
 * Initialize app
 */
app.whenReady().then(() => {
  console.log('[Main] App ready, initializing...');

  // Initialize managers
  configManager = new ConfigManager();
  folderManager = new FolderManager();

  // Register IPC handlers
  registerIPCHandlers(configManager, folderManager);

  // Create window
  createWindow();

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
  if (folderManager) {
    folderManager.close();
  }
  console.log('[Main] App quit');
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('[Main] Uncaught exception:', error);
});
