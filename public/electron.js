const { app, BrowserWindow } = require('electron');
const path = require('path');

const isDev = !app.isPackaged;

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    backgroundColor: '#0a0a0f',
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: !isDev,
    },
    show: false,
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../build/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  if (isDev) mainWindow.webContents.openDevTools();

  // Log crashes
  mainWindow.webContents.on('crashed', () => {
    console.log('=== APP CRASHED ===');
  });

  mainWindow.webContents.on('render-process-gone', (event, details) => {
    console.log('Render process gone:', details);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // ── Window open policy ────────────────────────────────────────────────────
  //
  // This denied EVERY window.open and pushed the url out to the system browser.
  // That is right for an ordinary outbound link and wrong for PayPal.
  //
  // The PayPal SDK opens its checkout with window.open. Denied, it falls back
  // to rendering the card form inline in the page at a fixed size, which is the
  // squashed, unresizable "payment pop-up" a buyer reported — it is not a pop-up
  // at all, it is PayPal's fallback. And where the deny did send the url to the
  // system browser, the SDK lost its handle on the window, so onApprove never
  // fired and the desktop app sat there after a completed payment.
  //
  // PayPal's own domains now get a real child window: sized against the parent
  // so it fits whatever screen the app is on, centred, and in the same process
  // so PayPal's postMessage back to the SDK still arrives and onApprove runs.
  // Everything else keeps the old behaviour.
  const PAYPAL_HOSTS = [
    'paypal.com', 'www.paypal.com', 'www.sandbox.paypal.com',
    'sandbox.paypal.com', 'paypalobjects.com', 'www.paypalobjects.com',
  ];

  const isPayPal = (url) => {
    try {
      const { protocol, hostname } = new URL(url);
      if (protocol !== 'https:') return false;
      return PAYPAL_HOSTS.some(h => hostname === h || hostname.endsWith('.' + h));
    } catch {
      return false;
    }
  };

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!isPayPal(url)) {
      require('electron').shell.openExternal(url);
      return { action: 'deny' };
    }

    // Fit the checkout to the window it was opened from rather than to a
    // hardcoded size. PayPal's checkout is a tall narrow form; capped so it
    // cannot exceed the parent on a small laptop screen and cannot stretch
    // absurdly wide on a large one.
    const [pw, ph] = mainWindow.getSize();
    const [px, py] = mainWindow.getPosition();
    const width    = Math.max(420, Math.min(620, pw - 80));
    const height   = Math.max(520, Math.min(860, ph - 60));

    return {
      action: 'allow',
      overrideBrowserWindowOptions: {
        width,
        height,
        x: Math.round(px + (pw - width) / 2),
        y: Math.round(py + (ph - height) / 2),
        parent: mainWindow,
        modal: false,
        resizable: true,
        minimizable: false,
        maximizable: false,
        autoHideMenuBar: true,
        backgroundColor: '#ffffff',
        title: 'PayPal Checkout',
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          // No preload. Nothing of ours belongs inside a page that is about to
          // be handed a card number.
        },
      },
    };
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});