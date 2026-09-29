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
 * Runtime game assets (thumbnails, sprites) are served to the renderer over the
 * scoped `tce-games://` scheme (feature F3, CG-0MUG2ZJMS006JB40). The pure
 * resolution/deny logic lives in `game-protocol.ts`; this file only registers
 * the scheme and adapts the result to an Electron `Response`.
 *
 * Compiled with `tsc -p electron/tsconfig.json` (ESM) into dist-electron/
 * and launched via `npm run start:electron` / `electron .` ("main" in
 * package.json). On headless Linux, run under xvfb (`xvfb-run electron .`).
 */
import { app, BrowserWindow, dialog, ipcMain, protocol, shell } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { ContentLocatorError } from './content-locator.js';
import { resolveGameContent, type ResolvedContent } from './launcher-config.js';
import { handleGameAssetRequest } from './game-protocol.js';
import { loadSteamConfig } from './steam-config.js';
import { loadBonusCatalog } from './bonus-catalog.js';
import { FileUnlockStore, SteamFollowService } from './steam-follow.js';
import { SteamworksFollowSource } from './steam-follow-steamworks.js';
import { STEAM_FOLLOW_CHANNELS, createSteamFollowHandlers } from './steam-follow-ipc.js';

/** Directory of the compiled main process (dist-electron/). */
const launcherDir = path.dirname(fileURLToPath(import.meta.url));

/** Scheme serving per-game assets from `<contentDir>/games/` (F3). */
const GAME_ASSET_SCHEME = 'tce-games';

// Must run before app-ready: marks the scheme as standard/secure so the
// renderer may load `tce-games://` images under file://-backed content without
// CORS/canvas-taint issues.
protocol.registerSchemesAsPrivileged([
  {
    scheme: GAME_ASSET_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
    },
  },
]);

/** Resolve the content root, surfacing a fatal dialog and exiting on failure. */
function resolveContentOrExit(): ResolvedContent | null {
  try {
    return resolveGameContent({
      argv: process.argv,
      bundledDir: path.join(launcherDir, '..', 'dist'),
    });
  } catch (error) {
    const message = error instanceof ContentLocatorError ? error.message : String(error);
    dialog.showErrorBox('TCE launcher — content error', message);
    app.exit(error instanceof ContentLocatorError ? error.exitCode : 1);
    return null;
  }
}

/**
 * Register the deny-by-default `tce-games://` handler for *contentDir*.
 * Invalid requests (bad scheme/id/path, traversal) and missing files both
 * resolve to 404 — never a file outside `<contentDir>/games/`.
 */
function registerGameAssetProtocol(contentDir: string): void {
  protocol.handle(GAME_ASSET_SCHEME, async (request) => {
    const result = await handleGameAssetRequest(request.url, { contentDir });
    // Copy into an ArrayBuffer-backed view: the DOM `BodyInit` type (and the
    // Electron `Response`) do not accept a `Uint8Array<ArrayBufferLike>`.
    const body = result.body ? new Uint8Array(result.body) : null;
    return new Response(body, {
      status: result.status,
      headers: result.headers,
    });
  });
}

function createWindow(resolved: ResolvedContent): void {
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

void app.whenReady().then(async () => {
  const resolved = resolveContentOrExit();
  if (!resolved) return;

  registerGameAssetProtocol(resolved.contentDir);

  // ── Steam follow-to-unlock (F3, CG-0MSMAJQQT004SDCC) ──────────────
  // Fully optional: a missing config, missing Steam, or missing native
  // module leaves the launcher running with the CTA degraded (intake AC5).
  await initSteamFollow();

  createWindow(resolved);

  // macOS: re-create a window when the dock icon is clicked and none are open.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(resolved);
  });
});

/**
 * Initialise the Steam follow/unlock feature and register its IPC handlers.
 *
 * Never throws: every failure path degrades to "Steam unavailable" so the
 * launcher boots normally on dev machines and non-Steam installs.
 */
async function initSteamFollow(): Promise<void> {
  const config = loadSteamConfig();
  const catalog = loadBonusCatalog();
  const source = new SteamworksFollowSource({
    appId: config ? Number(config.appId) : undefined,
    enableOverlay: true,
  });

  try {
    await source.init();
  } catch (error) {
    console.warn('[steam] init failed; continuing without Steam:', error);
  }

  if (source.restartRequested) {
    // Steam is relaunching the app through the Steam client — exit cleanly.
    console.info('[steam] Steam requested an app restart; quitting.');
    app.quit();
    return;
  }

  if (!source.isSteamAvailable()) {
    console.warn(
      '[steam] Steam is unavailable — the follow CTA will degrade gracefully (browser fallback).',
    );
  } else if (!source.followCheckSupported) {
    console.warn(
      '[steam] The Steamworks binding exposes no follow-detection API; the UI will offer a manual claim.',
    );
  }

  const store = new FileUnlockStore(path.join(app.getPath('userData'), 'steam-unlock.json'));
  const service = new SteamFollowService(source, store, catalog, config);
  const handlers = createSteamFollowHandlers(service, source, config);

  for (const [name, channel] of Object.entries(STEAM_FOLLOW_CHANNELS)) {
    const handler = handlers[name as keyof typeof handlers];
    ipcMain.handle(channel, handler);
  }

  app.on('will-quit', () => service.close());
}

// Quit when all windows are closed (except on macOS, per platform convention).
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
