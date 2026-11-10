'use strict';

const { app, BrowserWindow, ipcMain, shell, Notification } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { loadConfig } = require('../src/config');
const { readIssuesOrSamples, isWebUrl } = require('../src/issues');
const { getImage } = require('../src/images');
const { loadStrings } = require('../src/strings');

const ROOT = path.join(__dirname, '..');

// Settings are read fresh on every request, so edits to dispatch.config.json
// show up without code changes. Texts and language need a restart.
function settings() {
  const { config, warnings } = loadConfig(ROOT);
  // For documentation screenshots and tests: point the app at another issues folder.
  if (process.env.DISPATCH_ISSUES_DIR) config.issuesPath = path.resolve(process.env.DISPATCH_ISSUES_DIR);
  warnings.forEach((warning) => console.warn(`dispatch: ${warning}`));
  return config;
}

let window = null;

function createWindow() {
  window = new BrowserWindow({
    width: 1240,
    height: 880,
    minWidth: 420,
    minHeight: 520,
    title: 'Dispatch',
    icon: path.join(ROOT, 'build', 'icon.png'),
    backgroundColor: '#f3eee4',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  window.loadFile(path.join(__dirname, 'ui', 'index.html'));
  // The window always shows the app's own page. Links open in the normal browser.
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.on('closed', () => { window = null; });
}

function focusWindow() {
  if (!window) return;
  if (window.isMinimized()) window.restore();
  window.focus();
}

ipcMain.handle('config', () => {
  const config = settings();
  const { language, strings } = loadStrings(ROOT, config.uiLanguage, app.getLocale());
  return { language, userName: config.userName, schedule: config.schedule, strings };
});
ipcMain.handle('issues', () => readIssuesOrSamples(settings(), ROOT));
ipcMain.handle('image', (_event, url) => getImage(url, path.join(app.getPath('userData'), 'images')));
ipcMain.handle('open', (_event, url) => {
  if (isWebUrl(url)) shell.openExternal(url);
});
ipcMain.handle('notify', (_event, title, body) => {
  if (!Notification.isSupported()) return;
  const note = new Notification({ title: String(title), body: String(body) });
  note.on('click', focusWindow);
  note.show();
});

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', focusWindow);
  app.setAppUserModelId('dev.dispatch.app');
  app.whenReady().then(() => {
    createWindow();
    // Used to create the screenshot in the README: capture the window, then quit.
    const shot = process.env.DISPATCH_SCREENSHOT;
    if (shot) {
      window.webContents.once('did-finish-load', () => {
        setTimeout(async () => {
          fs.mkdirSync(path.dirname(path.resolve(shot)), { recursive: true });
          fs.writeFileSync(shot, (await window.webContents.capturePage()).toPNG());
          app.quit();
        }, Number(process.env.DISPATCH_SCREENSHOT_DELAY_MS) || 6000);
      });
    }
  });
  app.on('window-all-closed', () => app.quit());
}
