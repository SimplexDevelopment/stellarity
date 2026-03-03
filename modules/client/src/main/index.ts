import {
  app,
  shell,
  BrowserWindow,
  ipcMain,
  nativeTheme,
  protocol,
  net,
  session,
} from 'electron';
import { join } from 'path';
import { pathToFileURL } from 'url';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';

const SCHEME = 'app';
const HOST = 'stellarity';
const APP_ORIGIN = `${SCHEME}://${HOST}`;

// Register the custom scheme before app is ready — must be at top level
protocol.registerSchemesAsPrivileged([
  {
    scheme: SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

let mainWindow: BrowserWindow | null = null;

/**
 * Configure session-level request interception so that every
 * outgoing API request carries `Origin: app://stellarity` and
 * every response has the matching CORS header. This ensures a
 * consistent origin in both dev (Vite) and production (custom protocol).
 */
function setupOriginInterceptor(): void {
  const ses = session.defaultSession;

  // Rewrite the Origin header on every outgoing request to external APIs
  ses.webRequest.onBeforeSendHeaders((details, callback) => {
    const url = details.url;
    // Only rewrite for non-local URLs (actual API calls)
    const isLocalResource =
      url.startsWith(`${APP_ORIGIN}/`) ||
      url.startsWith('devtools://') ||
      url.startsWith('chrome-extension://');

    if (!isLocalResource) {
      details.requestHeaders['Origin'] = APP_ORIGIN;
    }

    callback({ requestHeaders: details.requestHeaders });
  });

  // Fix CORS response headers so the browser accepts them.
  // Electron desktop apps don't need CORS protection — we unconditionally
  // inject permissive CORS headers on ALL external responses so fetch()
  // calls to instance/central servers never get blocked.
  ses.webRequest.onHeadersReceived((details, callback) => {
    const headers = details.responseHeaders || {};
    const url = details.url;

    const isLocalResource =
      url.startsWith(`${APP_ORIGIN}/`) ||
      url.startsWith('devtools://') ||
      url.startsWith('chrome-extension://') ||
      url.startsWith('data:');

    if (!isLocalResource) {
      const pageOrigin = is.dev
        ? (process.env['ELECTRON_RENDERER_URL'] || 'http://localhost:5173').replace(/\/$/, '')
        : APP_ORIGIN;

      // Always set ACAO to the page origin so Chromium never blocks responses
      headers['access-control-allow-origin'] = [pageOrigin];
      headers['access-control-allow-credentials'] = ['true'];
      headers['access-control-allow-methods'] = ['GET, POST, PUT, PATCH, DELETE, OPTIONS'];
      headers['access-control-allow-headers'] = ['Content-Type, Authorization'];
      // Clean up duplicate casings
      delete headers['Access-Control-Allow-Origin'];
      delete headers['Access-Control-Allow-Credentials'];
      delete headers['Access-Control-Allow-Methods'];
      delete headers['Access-Control-Allow-Headers'];
    }

    callback({ responseHeaders: headers });
  });
}

function createWindow(): void {
  // Create the browser window with FTL-style dark theme
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 940,
    minHeight: 600,
    show: false,
    frame: false, // Custom titlebar for space theme
    titleBarStyle: 'hidden',
    backgroundColor: '#0a0e17',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Force dark mode
  nativeTheme.themeSource = 'dark';

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  // Load the app
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    // Use custom app://stellarity protocol for a real origin in production
    mainWindow.loadURL(`${APP_ORIGIN}/index.html`);
  }

  // Open DevTools in development
  if (is.dev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

// App initialization
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.stellarity.app');

  // Register custom app:// protocol to serve local files in production
  if (!is.dev) {
    protocol.handle(SCHEME, (request) => {
      // Strip the scheme+host: app://stellarity/path → ../renderer/path
      const url = new URL(request.url);
      const filePath = join(__dirname, '../renderer', decodeURIComponent(url.pathname));
      return net.fetch(pathToFileURL(filePath).href);
    });
  }

  // Intercept Origin/CORS headers for consistent app://stellarity origin
  setupOriginInterceptor();

  // Watch for shortcuts in development
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  // IPC handlers for window controls
  ipcMain.on('window:minimize', () => {
    mainWindow?.minimize();
  });

  ipcMain.on('window:maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow?.maximize();
    }
  });

  ipcMain.on('window:close', () => {
    mainWindow?.close();
  });

  ipcMain.handle('window:isMaximized', () => {
    return mainWindow?.isMaximized() ?? false;
  });

  // Audio device handling
  ipcMain.handle('audio:getDevices', async () => {
    // This will be handled in renderer with navigator.mediaDevices
    return [];
  });

  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Handle certificate errors in development
if (is.dev) {
  app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
    event.preventDefault();
    callback(true);
  });
}
