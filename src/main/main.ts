// Electron main process: lifecycle, window, tray, power events, dialogs,
// and IPC wiring. Renderer code never touches Node APIs directly.
import { app, BrowserWindow, Tray, Menu, dialog, Notification, nativeImage } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { TelemetryDatabase, resolveDbPath } from './db/database';
import { AppServices } from './services/services';
import { TrackerService } from './tracking/tracker';
import { ActiveWinProvider, NullActivityProvider, PowerMonitorIdleProvider } from './tracking/providers';
import { AppRepository, EventRepository, SessionRepository } from './db/repositories';
import { registerIpcHandlers } from './ipc';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let quitting = false;

function buildTrackerAndServices(db: TelemetryDatabase): { tracker: TrackerService; services: AppServices } {
  const holder: { get: () => ReturnType<AppServices['getSettings']> } = {
    get: () => services.getSettings(),
  };
  const handle = db.handle;
  const tracker: TrackerService = new TrackerService({
    sessions: new SessionRepository(handle),
    apps: new AppRepository(handle),
    events: new EventRepository(handle),
    getSettings: () => holder.get(),
    classify: (p, a) => services.classify(p, a),
    activityProvider: process.platform === 'win32' ? new ActiveWinProvider() : new NullActivityProvider(),
    idleProvider: new PowerMonitorIdleProvider(),
  });
  const services: AppServices = new AppServices(db, tracker, {
    notify: (title, body) => {
      try {
        new Notification({ title, body }).show();
      } catch {
        // Notifications are best-effort.
      }
    },
    setLoginItem: (enabled) => {
      try {
        app.setLoginItemSettings({ openAtLogin: enabled });
      } catch {
        // Best-effort; the setting is still persisted.
      }
    },
  });
  return { tracker, services };
}

const db = new TelemetryDatabase(resolveDbPath());
// Assigned in init() after db.open(). The holder inside
// buildTrackerAndServices only reads `services` when the tracker ticks,
// which happens after assignment.
let tracker!: TrackerService;
let services!: AppServices;

function iconPath(): string {
  const packaged = path.join(process.resourcesPath, 'assets', 'icon.png');
  if (fs.existsSync(packaged)) return packaged;
  return path.join(__dirname, '..', '..', 'assets', 'icon.png');
}

function buildTrayMenu(): void {
  if (!tray) return;
  const paused = tracker.isPaused;
  const menu = Menu.buildFromTemplate([
    { label: 'Open Dashboard', click: () => showWindow() },
    {
      label: paused ? 'Resume Tracking' : 'Pause Tracking',
      click: () => {
        if (paused) tracker.resume();
        else tracker.pause();
        buildTrayMenu();
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        quitting = true;
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(menu);
  tray.setToolTip(`Telemetry Vault — tracking ${paused ? 'paused' : 'active'}`);
}

function showWindow(): void {
  if (!mainWindow) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function createWindow(): void {
  const settings = services.getSettings();
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1000,
    minHeight: 640,
    show: !settings.startMinimized,
    icon: nativeImage.createFromPath(iconPath()),
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // Strict CSP in production. In dev the Vite server is the origin, so the
  // header is skipped there (the dev server is local-only).
  if (!process.env.ELECTRON_RENDERER_URL) {
    mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'",
          ],
        },
      });
    });
  }

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void mainWindow.loadFile(path.join(__dirname, '..', '..', 'dist-renderer', 'index.html'));
  }

  mainWindow.on('close', (event) => {
    if (!quitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createTray(): void {
  const img = nativeImage.createFromPath(iconPath());
  tray = new Tray(img.resize({ width: 16, height: 16 }));
  tray.on('click', () => showWindow());
  buildTrayMenu();
}

async function pickFolder(): Promise<string | null> {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
  return result.canceled ? null : (result.filePaths[0] ?? null);
}

async function pickFile(): Promise<string | null> {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'SQLite database', extensions: ['db', 'sqlite', 'sqlite3'] },
      { name: 'All files', extensions: ['*'] },
    ],
  });
  return result.canceled ? null : (result.filePaths[0] ?? null);
}

async function saveFile(content: string, defaultName: string): Promise<boolean> {
  if (!mainWindow) return false;
  const result = await dialog.showSaveDialog(mainWindow, { defaultPath: defaultName });
  if (result.canceled || !result.filePath) return false;
  fs.writeFileSync(result.filePath, content, 'utf8');
  return true;
}

async function exportPdf(html: string, defaultName: string): Promise<boolean> {
  const printWindow = new BrowserWindow({
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  try {
    await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    const pdf = await printWindow.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      margins: { top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 },
    });
    if (!mainWindow) return false;
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: defaultName,
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (result.canceled || !result.filePath) return false;
    fs.writeFileSync(result.filePath, pdf);
    return true;
  } finally {
    printWindow.destroy();
  }
}

/**
 * Restore replaces the live database file, so the app relaunches to pick up
 * the restored data with fresh service instances. The renderer is told the
 * restore succeeded first, then the restart happens after a short delay.
 */
async function restoreBackup(backupPath: string): Promise<boolean> {
  const validation = TelemetryDatabase.validateBackupFile(backupPath);
  if (!validation.ok) throw new Error(validation.detail);
  tracker.stop();
  services.stopLocalApi();
  db.close();
  const dbPath = db.path;
  for (const suffix of ['-wal', '-shm']) {
    try {
      fs.unlinkSync(dbPath + suffix);
    } catch {
      // File may not exist.
    }
  }
  fs.copyFileSync(backupPath, dbPath);
  setTimeout(() => {
    app.relaunch();
    app.quit();
  }, 500);
  return true;
}

async function init(): Promise<void> {
  db.open();
  const built = buildTrackerAndServices(db);
  tracker = built.tracker;
  services = built.services;

  // Power events -> tracker (sleep/wake/lock/unlock), via the idle provider.
  const idleProvider = new PowerMonitorIdleProvider();
  idleProvider.onSystemEvent?.((event) => tracker.handleSystemEvent(event));

  registerIpcHandlers({
    services,
    tracker,
    pickFolder,
    pickFile,
    saveFile,
    exportPdf,
    restore: restoreBackup,
    openDashboard: showWindow,
  });

  createWindow();
  createTray();

  const settings = services.getSettings();
  if (settings.localApiEnabled) services.startLocalApi();
  if (settings.trackingEnabled) tracker.start();

  // Background maintenance: Git auto-scan (when due) + retention, every 15 min.
  setInterval(() => {
    void services.scanAllIfDue().catch(() => undefined);
    try {
      services.applyRetention();
    } catch {
      // Retention is best-effort; data is never deleted on error.
    }
  }, 15 * 60 * 1000);
  setTimeout(() => {
    void services.scanAllIfDue().catch(() => undefined);
  }, 10 * 1000);
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => showWindow());
  app.whenReady().then(() => init().catch((err: unknown) => {
    dialog.showErrorBox('Telemetry Vault failed to start', err instanceof Error ? err.message : 'Unknown error.');
    app.quit();
  }));
}

app.on('before-quit', () => {
  quitting = true;
  try {
    tracker.stop();
  } catch {
    // Ignore shutdown errors.
  }
  try {
    services.stopLocalApi();
  } catch {
    // Ignore.
  }
  try {
    db.close();
  } catch {
    // Ignore.
  }
});
