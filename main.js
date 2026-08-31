const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

const { scanProject, applyFindings } = require('./src/scanner');
const { buildDefaultProfiles } = require('./src/default-profiles');

let mainWindow;

function profilesPath() {
  return path.join(app.getPath('userData'), 'profiles.json');
}

function loadProfiles() {
  const p = profilesPath();
  if (fs.existsSync(p)) {
    try {
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch (e) {
      // fall through to defaults if the file is corrupt
    }
  }
  const defaults = buildDefaultProfiles();
  fs.writeFileSync(p, JSON.stringify(defaults, null, 2), 'utf8');
  return defaults;
}

function saveProfiles(profiles) {
  fs.writeFileSync(profilesPath(), JSON.stringify(profiles, null, 2), 'utf8');
  return true;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#14171c',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ---- IPC handlers ----

ipcMain.handle('profiles:load', () => loadProfiles());
ipcMain.handle('profiles:save', (_evt, profiles) => saveProfiles(profiles));

ipcMain.handle('dialog:chooseFolder', async () => {
  const res = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
  if (res.canceled || !res.filePaths.length) return null;
  return res.filePaths[0];
});

ipcMain.handle('dialog:chooseTestFile', async () => {
  const res = await dialog.showOpenDialog(mainWindow, { properties: ['openFile'] });
  if (res.canceled || !res.filePaths.length) return null;
  const filePath = res.filePaths[0];
  const stats = fs.statSync(filePath);
  return { name: path.basename(filePath), size: stats.size, path: filePath };
});

ipcMain.handle('scan:run', (_evt, { rootDir, profileName }) => {
  return scanProject(rootDir, profileName);
});

ipcMain.handle('scan:apply', (_evt, findings) => {
  return applyFindings(findings);
});

ipcMain.handle('export:bundle', async (_evt, { profiles }) => {
  const res = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
  if (res.canceled || !res.filePaths.length) return null;
  const targetDir = res.filePaths[0];

  const coreSrc = fs.readFileSync(path.join(__dirname, 'src', 'sanitizer-core.js'), 'utf8');
  const runtimeSrc = fs.readFileSync(path.join(__dirname, 'bundle-template', 'sanitizer-runtime.js'), 'utf8');

  fs.writeFileSync(path.join(targetDir, 'sanitizer-core.js'), coreSrc, 'utf8');
  fs.writeFileSync(path.join(targetDir, 'sanitizer-runtime.js'), runtimeSrc, 'utf8');
  fs.writeFileSync(
    path.join(targetDir, 'sanitizer-profiles.js'),
    'window.SANITIZER_PROFILES = ' + JSON.stringify(profiles, null, 2) + ';\n',
    'utf8'
  );

  return targetDir;
});
