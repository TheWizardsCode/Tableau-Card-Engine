/**
 * TCE Electron launcher — main process.
 *
 * Boots the built web app (Game Selector) in a desktop window. Game content
 * is resolved by `launcher-config.ts` + `content-locator.ts`:
 *
 *  - bundled `dist/` by default (compiled launcher sits next to it),
 *  - an external Steam DLC install directory via `--content-dir <dir>` or the
 *    `TCE_CONTENT_DIR` environment variable (Steam option a, v1).
 *
 * The resolution goes through the `ContentDirectoryProvider` chain so a
 * Steamworks-backed provider (option b, v2) can be inserted without changing
 * the load path. No Steam SDK is required to run locally.
 *
 * Compiled with `tsc -p electron/tsconfig.json` (ESM) into dist-electron/
 * and launched via `npm run start:electron` / `electron .` ("main" in
 * package.json). On headless Linux, run under xvfb (`xvfb-run electron .`).
 */
import { app, BrowserWindow, dialog, shell } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { ContentLocatorError } from './content-locator.js';
import { resolveGameContent, type ResolvedContent } from './launcher-config.js';

/** Directory of the compiled main process (dist-electron/). */
const launcherDir = path.dirname(fileURLToPath(import.meta.url));

function createWindow(): void {
  let resolved: ResolvedContent;
  try {
    resolved = resolveGameContent({
      argv: process.argv,
      bundledDir: path.join(launcherDir, '..', 'dist'),
    });
  } catch (error) {
    const message = error instanceof ContentLocatorError ? error.message : String(error);
    dialog.showErrorBox('TCE launcher — content error', message);
    app.exit(error instanceof ContentLocatorError ? error.exitCode : 1);
    return;
  }

  // Read-only host info for the preload bridge.
  process.env.TCE_RESOLVED_CONTENT_DIR = resolved.contentDir;
  process.env.TCE_APP_VERSION = app.getVersion();

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'Tableau Card Engine',
    webPreferences: {
      preload: path.join(launcherDir, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Open external links (e.g. the Game Selector's GitHub link) in the system
  // browser instead of a new Electron window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  void win.loadFile(resolved.entryFile);
}

void app.whenReady().then(() => {
  createWindow();

  // macOS: re-create a window when the dock icon is clicked and none are open.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Quit when all windows are closed (except on macOS, per platform convention).
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
