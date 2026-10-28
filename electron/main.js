import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import {
  app,
  BrowserWindow,
  Menu,
  dialog,
  nativeTheme,
  net,
  protocol,
  session,
} from 'electron';
import IPC from '../shared/ipc.cjs';
import { isSupportedMediaPath } from '../shared/media-types.js';
import { isId } from '../shared/validation.js';
import { Logger } from './logger.js';
import { ShowFlowDatabase } from './db/database.js';
import { runMigrations } from './db/migrations.js';
import { Repository } from './db/repository.js';
import { BackupService } from './services/backup.js';
import { ReceiverServer } from './services/receiver.js';
import { IntegrationService } from './integrations/service.js';
import { registerIpcHandlers } from './ipc/register.js';
import { registerSchemesAsPrivileged } from './media-protocol.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.dirname(__dirname);
const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
const isE2E = process.env.SHOWFLOW_E2E === '1';
const preloadPath = path.join(__dirname, 'preload.cjs');
const rendererEntry = path.join(ROOT_DIR, 'dist', 'index.html');

if (process.env.SHOWFLOW_USER_DATA) {
  app.setPath('userData', path.resolve(process.env.SHOWFLOW_USER_DATA));
}

app.setName('ShowFlow');
if (process.platform === 'win32') app.setAppUserModelId('com.showflow.app');
registerSchemesAsPrivileged(protocol);

let mainWindow = null;
let database = null;
let repository = null;
let receiver = null;
let integrationService = null;
let ipcController = null;
let logger = null;
let allowQuit = false;
let quitting = false;

function resolveWasmPath() {
  if (app.isPackaged) return path.join(process.resourcesPath, 'sql-wasm.wasm');
  return path.join(ROOT_DIR, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
}

function iconPath() {
  if (app.isPackaged) return path.join(process.resourcesPath, 'icon.png');
  return path.join(ROOT_DIR, 'build', 'icon.png');
}

function sendScreenStatus(status) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send(IPC.EVENT_SCREEN_STATUS, status);
  mainWindow.webContents.send(IPC.EVENT_SERVER_STATUS, status);
}

function sendIntegrationStatus(status) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send(IPC.EVENT_INTEGRATION_STATUS, status);
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1080,
    minHeight: 700,
    show: false,
    backgroundColor: '#060708',
    title: 'ShowFlow',
    icon: fs.existsSync(iconPath()) ? iconPath() : undefined,
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webviewTag: false,
      spellcheck: false,
      devTools: !app.isPackaged || isDev || isE2E,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });

  window.center();
  window.setMenuBarVisibility(false);

  window.once('ready-to-show', () => {
    window.show();
    if (isDev && process.env.SHOWFLOW_DEVTOOLS === '1') window.webContents.openDevTools({ mode: 'detach' });
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    logger?.warn('Blocked renderer window.open attempt', { url });
    return { action: 'deny' };
  });

  window.webContents.on('will-navigate', (event, url) => {
    const allowedDev = isDev && process.env.VITE_DEV_SERVER_URL && url.startsWith(process.env.VITE_DEV_SERVER_URL);
    const allowedFile = !isDev && url.startsWith(pathToFileURL(rendererEntry).toString());
    if (!allowedDev && !allowedFile) {
      event.preventDefault();
      logger?.warn('Blocked renderer navigation', { url });
    }
  });

  window.webContents.on('will-attach-webview', (event) => {
    event.preventDefault();
    logger?.warn('Blocked webview attachment attempt');
  });

  window.webContents.on('before-input-event', (event, input) => {
    if (isDev && input.type === 'keyDown' && (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i'))) {
      if (window.webContents.isDevToolsOpened()) window.webContents.closeDevTools();
      else window.webContents.openDevTools({ mode: 'detach' });
      event.preventDefault();
    }
  });

  window.webContents.on('render-process-gone', async (_event, details) => {
    logger?.error('Renderer process gone', details);
    try {
      const choice = await dialog.showMessageBox({
        type: 'error',
        title: 'ShowFlow interface stopped',
        message: 'The ShowFlow interface stopped unexpectedly.',
        detail:
          'Your saved event data is intact. ShowFlow never replays production commands automatically. You can reload the interface or close the application.',
        buttons: ['Reload interface', 'Close ShowFlow'],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
      });
      if (choice.response === 0) window.reload();
      else app.quit();
    } catch {
      app.quit();
    }
  });

  window.on('close', (event) => {
    if (allowQuit || quitting) return;
    let liveEvents = 0;
    try {
      liveEvents = repository
        ? repository.listEvents({ includeArchived: false, status: 'live', limit: 10 }).length
        : 0;
    } catch {
      liveEvents = 0;
    }
    if (liveEvents > 0) {
      const response = dialog.showMessageBoxSync(window, {
        type: 'warning',
        title: 'A show is still live',
        message: 'An event is still marked LIVE. Quit ShowFlow?',
        detail:
          'Closing the control room does not stop projectors, media players, or Resolume. The live session will be marked interrupted on the next launch. No pending commands are replayed.',
        buttons: ['Keep ShowFlow open', 'Quit ShowFlow'],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
      });
      if (response === 0) {
        event.preventDefault();
        return;
      }
      allowQuit = true;
    }
  });

  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null;
  });

  mainWindow = window;
  return window;
}

function loadRenderer(window) {
  if (isDev) {
    return window.loadURL(process.env.VITE_DEV_SERVER_URL);
  }
  if (!fs.existsSync(rendererEntry)) {
    throw new Error('The ShowFlow interface build is missing. Run “npm run build:renderer” before starting the packaged app.');
  }
  return window.loadFile(rendererEntry);
}

function applySecurityPolicies() {
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    if (isDev) {
      callback({ responseHeaders: details.responseHeaders });
      return;
    }
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: showflow-media:; media-src 'self' blob: showflow-media:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'",
        ],
        'X-Content-Type-Options': ['nosniff'],
      },
    });
  });
}

function registerMediaProtocol() {
  protocol.handle('showflow-media', async (request) => {
    try {
      const url = new URL(request.url);
      if (url.hostname !== 'asset') return new Response('Not found', { status: 404 });
      const assetId = url.pathname.replace(/^\//, '');
      if (!isId(assetId)) return new Response('Invalid asset', { status: 400 });
      const asset = repository?.getMedia(assetId);
      if (!asset || !asset.available) return new Response('Asset unavailable', { status: 404 });
      if (!isSupportedMediaPath(asset.path)) return new Response('Unsupported asset type', { status: 403 });
      if (!fs.existsSync(asset.path)) return new Response('File missing', { status: 404 });
      return net.fetch(pathToFileURL(asset.path).toString());
    } catch (error) {
      logger?.warn('Media protocol request failed', error);
      return new Response('Media request failed', { status: 500 });
    }
  });
}

async function initialise() {
  nativeTheme.themeSource = 'dark';
  logger = new Logger({ userDataPath: app.getPath('userData'), isDev });

  process.on('uncaughtException', (error) => logger.error('Uncaught exception', error));
  process.on('unhandledRejection', (reason) => logger.error('Unhandled promise rejection', reason));

  database = new ShowFlowDatabase({
    filePath: path.join(app.getPath('userData'), 'showflow.db'),
    wasmPath: resolveWasmPath(),
    logger,
  });
  await database.init();
  const migration = runMigrations(database, logger);
  logger.info(`Database ready; schema version ${migration.current}`);
  repository = new Repository(database, logger);
  repository.ensureDefaults();
  const interrupted = repository.recoverInterruptedSessions();
  if (interrupted) logger.warn(`${interrupted} interrupted live session(s) were recovered safely without replaying commands.`);

  const backupService = new BackupService({
    db: database,
    repository,
    appVersion: app.getVersion(),
    userDataPath: app.getPath('userData'),
    logger,
  });
  backupService
    .createAutoBackup()
    .then((result) => {
      if (!result.skipped) logger.info(`Automatic backup created at ${result.path}`);
    })
    .catch((error) => logger.error('Automatic backup failed', error));

  receiver = new ReceiverServer({
    repository,
    logger,
    onStatusChange: sendScreenStatus,
  });
  integrationService = new IntegrationService({
    repository,
    logger,
    appVersion: app.getVersion(),
  });

  const window = createWindow();
  loadRenderer(window);

  ipcController = registerIpcHandlers({
    getMainWindow: () => mainWindow,
    repository,
    backupService,
    receiver,
    integrationService,
    appVersion: app.getVersion(),
    userDataPath: app.getPath('userData'),
    documentsPath: app.getPath('documents'),
    isPackaged: app.isPackaged,
    logger,
  });

  applySecurityPolicies();
  registerMediaProtocol();
  Menu.setApplicationMenu(null);
  sendIntegrationStatus(integrationService.getStatus());
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  app.whenReady().then(async () => {
    try {
      await initialise();
    } catch (error) {
      logger?.error('ShowFlow failed to start', error);
      dialog.showErrorBox(
        'ShowFlow could not start',
        `ShowFlow could not initialise its local database or interface.\n\n${error.message}\n\nYour original data has not been discarded. Check the log in the ShowFlow data folder.`,
      );
      allowQuit = true;
      app.quit();
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0 && repository) {
      const window = createWindow();
      loadRenderer(window).catch((error) => logger?.error('Could not load renderer', error));
    }
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('before-quit', () => {
    quitting = true;
    allowQuit = true;
  });

  app.on('will-quit', () => {
    ipcController?.dispose();
    try {
      receiver?.stop({ silent: true });
    } catch {
      /* ignore */
    }
    try {
      database?.close();
    } catch (error) {
      logger?.error('Database shutdown failed', error);
    }
  });
}

process.on('SIGINT', () => {
  allowQuit = true;
  app.quit();
});
