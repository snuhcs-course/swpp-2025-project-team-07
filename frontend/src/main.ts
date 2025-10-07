import { app, BrowserWindow, ipcMain, dialog, session, desktopCapturer } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import started from 'electron-squirrel-startup';

let selectedSourceId: string | null = null;

function installDisplayMediaHook() {
  session.defaultSession.setDisplayMediaRequestHandler(async (_req, callback) => {
    const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] });
    const chosen = sources.find(s => s.id === selectedSourceId) ?? sources[0];
    callback({ video: chosen });
  });
}

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

const createWindow = () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  // Open the DevTools.
  mainWindow.webContents.openDevTools();
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  installDisplayMediaHook();
  createWindow();
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.

ipcMain.handle('rec:list-sources', async () => {
  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    fetchWindowIcons: true,
    thumbnailSize: { width: 280, height: 180 },
  });
  return sources.map(s => ({
    id: s.id,
    name: s.name,
    thumbnailDataUrl: s.thumbnail.toDataURL(),
    appIconDataUrl: s.appIcon?.toDataURL?.() ?? null,
  }));
});

ipcMain.handle('rec:choose-source', (_e, id: string) => {
  selectedSourceId = id;
  return true;
});

ipcMain.handle('rec:save-file', async (_e, data: Buffer) => {
  const videos = app.getPath('videos'); // macOS: ~/Movies
  const defaultDir = path.join(videos, 'PrivateGPT-Recordings');
  await fs.mkdir(defaultDir, { recursive: true });
  const defaultPath = path.join(
    defaultDir,
    `Recording-${new Date().toISOString().replace(/[:.]/g, '-')}.webm`
  );

  const { filePath, canceled } = await dialog.showSaveDialog({
    title: 'Save recording',
    defaultPath,
    filters: [{ name: 'WebM Video', extensions: ['webm'] }],
  });
  if (canceled || !filePath) return null;

  await fs.writeFile(filePath, data);
  return filePath;
});
