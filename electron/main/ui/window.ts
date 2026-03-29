import { app, BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { isDev } from '../utils/constants';
import { store } from '../utils/store';

function resolvePreloadPath() {
  const appPath = app.getAppPath();
  const candidates = [
    path.join(appPath, 'build', 'electron', 'preload', 'index.cjs'),
    path.join(appPath, '..', 'preload', 'index.cjs'),
    path.join(process.cwd(), 'build', 'electron', 'preload', 'index.cjs'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  // Keep Electron erroring with a useful path if all candidates fail.
  return candidates[0];
}

export function createWindow(rendererURL: string) {
  console.log('Creating window with URL:', rendererURL);

  const bounds = store.get('bounds');
  console.log('restored bounds:', bounds);

  const preloadPath = resolvePreloadPath();
  console.log('Using preload path:', preloadPath);

  const win = new BrowserWindow({
    ...{
      width: 1200,
      height: 800,
      ...bounds,
    },
    vibrancy: 'under-window',
    visualEffectState: 'active',
    webPreferences: {
      preload: preloadPath,
    },
  });

  console.log('Window created, loading URL...');
  win.loadURL(rendererURL).catch((err) => {
    console.log('Failed to load URL:', err);
  });

  win.webContents.on('did-fail-load', (_, errorCode, errorDescription) => {
    console.log('Failed to load:', errorCode, errorDescription);
  });

  win.webContents.on('did-finish-load', () => {
    console.log('Window finished loading');
  });

  // Open devtools in development
  if (isDev) {
    win.webContents.openDevTools();
  }

  const boundsListener = () => {
    const bounds = win.getBounds();
    store.set('bounds', bounds);
  };
  win.on('moved', boundsListener);
  win.on('resized', boundsListener);

  return win;
}
