const { app, BrowserWindow, protocol } = require('electron');
const path = require('path');
const isDev = require('electron-is-dev');

// Single instance lock - prevents multiple app instances (saves RAM)
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

let mainWindow;

// Memory optimization flags
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=512'); // Limit V8 heap
app.commandLine.appendSwitch('disable-http-cache'); // Reduce cache memory

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    backgroundColor: '#0a0a0f',
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      nodeIntegration: false, // Security + RAM optimization
      contextIsolation: true, // Better memory isolation
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js'),
      // Memory optimizations
      backgroundThrottling: true, // Throttle background tabs
      offscreen: false,
      spellcheck: false, // Disable spellcheck to save RAM
    },
    show: false, // Show when ready (prevents flash)
  });

  // Load app
  const startUrl = isDev
    ? 'http://localhost:3000'
    : `file://${path.join(__dirname, '../build/index.html')}`;

  mainWindow.loadURL(startUrl);

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    
    // Clear cache on startup to save memory
    mainWindow.webContents.session.clearCache();
  });

  // Open DevTools in development
  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  // Memory cleanup when window closes
  mainWindow.on('closed', () => {
    mainWindow = null;
    // Force garbage collection
    if (global.gc) {
      global.gc();
    }
  });

  // Prevent new windows (opens in default browser instead)
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    require('electron').shell.openExternal(url);
    return { action: 'deny' };
  });
}

// App lifecycle
app.whenReady().then(() => {
  // Register file protocol for production
  if (!isDev) {
    protocol.registerFileProtocol('file', (request, callback) => {
      const pathname = decodeURI(request.url.replace('file:///', ''));
      callback(pathname);
    });
  }

  createWindow();

  // macOS: Re-create window when dock icon clicked
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows closed (except macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Memory cleanup on quit
app.on('before-quit', () => {
  if (mainWindow) {
    mainWindow.removeAllListeners();
    mainWindow = null;
  }
});

// Periodic memory cleanup (every 5 minutes)
setInterval(() => {
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.session.clearCache();
    if (global.gc) {
      global.gc();
    }
  }
}, 5 * 60 * 1000);