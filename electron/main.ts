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
 * scoped `tce-games://` scheme (feature F3, CG-0MUG2ZJMS006JB40). Card-pack
 * assets are served over the sibling `tce-packs://` scheme (feature F5,
 * CG-0MUZIS2B8005WG4S). The pure resolution/deny logic lives in
 * `game-protocol.ts` / `pack-protocol.ts`; this file registers the schemes and
 * adapts the results to Electron `Response`s.
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
import { registerGameAssetHandler, GAME_ASSET_SCHEME } from './game-protocol.js';
import { registerCardPackAssetHandler, CARD_PACK_ASSET_SCHEME } from './pack-protocol.js';
import { loadSteamConfig } from './steam-config.js';
import { loadBonusCatalog } from './bonus-catalog.js';
import { FileUnlockStore, SteamFollowService } from './steam-follow.js';
import { SteamworksFollowSource } from './steam-follow-steamworks.js';
import { STEAM_FOLLOW_CHANNELS, createSteamFollowHandlers } from './steam-follow-ipc.js';
import { ActionRewardService, FileContentUnlockStore } from './action-rewards.js';
import { loadActionRewardsConfig } from './action-rewards-config.js';
import { ACTION_REWARD_CHANNELS, createActionRewardHandlers } from './action-rewards-ipc.js';
import { createContentUnlockVerifierRegistry } from './action-verifiers.js';
import { FileAchievementStore, SteamAchievementService } from './steam-achievements.js';
import { loadAchievementManifest, validateAchievementManifest } from './achievement-manifest.js';
import { SteamworksAchievementSource } from './steam-achievements-steamworks.js';
import { STEAM_ACHIEVEMENT_CHANNELS, createSteamAchievementHandlers } from './steam-achievements-ipc.js';
import { loadCardPackCatalog } from './card-pack-catalog.js';
import { CardPackEntitlementService } from './card-pack-entitlements.js';
import { SteamPackEntitlementSource } from './card-pack-entitlements-steamworks.js';
import { CARD_PACK_CHANNELS, createCardPackHandlers } from './card-pack-ipc.js';

/** Directory of the compiled main process (dist-electron/). */
const launcherDir = path.dirname(fileURLToPath(import.meta.url));

/** Scheme serving per-game assets from `<contentDir>/games/` (F3). */
// (imported from game-protocol.ts)

// Must run before app-ready: marks the schemes as standard/secure so the
// renderer may load `tce-games://` / `tce-packs://` assets under file://-backed
// content without CORS/canvas-taint issues.
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
  {
    scheme: CARD_PACK_ASSET_SCHEME,
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
 *
 * The handler itself is Electron-free and lives in `game-protocol.ts` so it
 * can be unit-tested; this is the thin Electron wiring (F6).
 */
function registerGameAssetProtocol(contentDir: string): void {
  registerGameAssetHandler(protocol, contentDir);
}

/**
 * Register the deny-by-default `tce-packs://` handler for *contentDir*
 * (feature F5, CG-0MUZIS2B8005WG4S). Invalid requests (bad scheme/id/path,
 * traversal) and missing files both resolve to 404 — never a file outside
 * `<contentDir>/packs/<gameId>/<packId>/`.
 *
 * The handler itself is Electron-free and lives in `pack-protocol.ts` so it
 * can be unit-tested; this is the thin Electron wiring.
 */
function registerCardPackAssetProtocol(contentDir: string): void {
  registerCardPackAssetHandler(protocol, contentDir);
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
  registerCardPackAssetProtocol(resolved.contentDir);

  // ── Steam follow-to-unlock (F3, CG-0MSMAJQQT004SDCC) ──────────────
  // Fully optional: a missing config, missing Steam, or missing native
  // module leaves the launcher running with the CTA degraded (intake AC5).
  await initSteamFollow();

  // ── Steam achievements (F6, CG-0MUNC7EXO001LITF) ──────────────────
  // Fully optional: a missing manifest, missing Steam, or missing native
  // module leaves the launcher running with achievements disabled.
  await initSteamAchievements();

  // ── Generalised content unlocks (F5, CG-0MUZGBSSQ009ISHG) ─────────
  // Fully optional: a missing config degrades to a no-op read API (never
  // throws), so the renderer can gate content without branching on platform.
  initContentUnlocks();

  // ── Card-pack entitlements (F5, CG-0MUZIS2B8005WG4S) ──────────────
  // Fully optional: a missing DLC catalog, missing Steam config, or missing
  // native module degrades to "no catalog / Steam unavailable" — packs are
  // then treated as free base content or locked, never a crash.
  await initCardPacks();

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
  const handlers = createSteamFollowHandlers(service, source, config, catalog);

  for (const [name, channel] of Object.entries(STEAM_FOLLOW_CHANNELS)) {
    const handler = handlers[name as keyof typeof handlers];
    ipcMain.handle(channel, handler);
  }

  app.on('will-quit', () => service.close());
}

/**
 * Initialise the Steam achievement feature and register its IPC handlers.
 *
 * Never throws: a missing manifest, missing Steam, or missing native module
 * degrades to "achievements disabled" so the launcher boots normally. A
 * manifest with validation issues is logged (non-fatal) and still used, so a
 * typo cannot disable achievement tracking entirely.
 */
async function initSteamAchievements(): Promise<void> {
  const config = loadSteamConfig();
  const manifest = loadAchievementManifest();

  if (manifest) {
    const issues = validateAchievementManifest(manifest);
    for (const issue of issues) {
      console.warn(`[achievements] manifest issue (${issue.code}): ${issue.message}`);
    }
  } else {
    console.warn('[achievements] no achievement manifest loaded; achievements are disabled.');
  }

  const source = new SteamworksAchievementSource({
    appId: config ? Number(config.appId) : undefined,
    enableOverlay: true,
  });

  try {
    await source.init();
  } catch (error) {
    console.warn('[achievements] init failed; continuing without Steam:', error);
  }

  if (source.restartRequested) {
    // Steam is relaunching the app through the Steam client — exit cleanly.
    console.info('[achievements] Steam requested an app restart; quitting.');
    app.quit();
    return;
  }

  if (!source.isSteamAvailable()) {
    console.warn('[achievements] Steam is unavailable — unlocks persist locally and re-sync later.');
  } else if (!source.achievementApiSupported) {
    console.warn(
      '[achievements] The Steamworks binding exposes no achievement API; unlocks persist locally only.',
    );
  }

  const store = new FileAchievementStore(
    path.join(app.getPath('userData'), 'steam-achievements.json'),
  );
  const service = new SteamAchievementService(source, store, manifest);

  // Replay any unlocks persisted while Steam was absent (offline-safe).
  try {
    const result = await service.resync();
    if (result.unknown.length > 0) {
      console.warn(
        `[achievements] ${result.unknown.length} persisted achievement(s) are absent from the manifest: ${result.unknown.join(', ')}`,
      );
    }
  } catch (error) {
    console.warn('[achievements] resync failed; will retry on the next launch:', error);
  }

  const handlers = createSteamAchievementHandlers(service);

  for (const [name, channel] of Object.entries(STEAM_ACHIEVEMENT_CHANNELS)) {
    const handler = handlers[name as keyof typeof handlers] as (
      ...args: unknown[]
    ) => unknown;
    // Adapt the pure handler table to Electron's (event, ...args) signature;
    // `unlock` carries an achievement id, the rest take no arguments.
    ipcMain.handle(channel, (_event, ...args: unknown[]) => handler(...args));
  }

  app.on('will-quit', () => service.close());
}

/**
 * Initialise the generalised content-unlock bridge and register its IPC
 * handlers.
 *
 * Never throws: a missing/corrupt action-rewards config degrades to an empty
 * rule set, and the unified `FileContentUnlockStore` treats a missing file as
 * "nothing unlocked" — so the read API is always total. The generalised
 * `contentUnlocks:*` surface is additive; the legacy `steamFollow:*` path is
 * untouched.
 */
function initContentUnlocks(): void {
  const config = loadActionRewardsConfig();
  const store = new FileContentUnlockStore(
    path.join(app.getPath('userData'), 'content-unlocks.json'),
  );
  const service = new ActionRewardService({
    rules: config ? { version: config.version, rules: config.rules } : null,
    store,
    // Add the explicit dev/QA simulated-purchase verifier alongside the
    // manual self-attest default. It is inert unless a scoped refresh asks for
    // it, so the existing self-attest paths are unchanged.
    verifiers: createContentUnlockVerifierRegistry(),
    verifierConfig: config?.verifiers ?? null,
  });
  const handlers = createActionRewardHandlers(service);

  for (const [name, channel] of Object.entries(ACTION_REWARD_CHANNELS)) {
    const handler = handlers[name as keyof typeof handlers] as (
      ...args: unknown[]
    ) => unknown;
    ipcMain.handle(channel, (_event, ...args: unknown[]) => handler(...args));
  }
}

/**
 * Initialise the card-pack entitlement bridge and register its IPC handlers
 * (feature F5, CG-0MUZIS2B8005WG4S).
 *
 * Never throws: a missing/corrupt DLC catalog degrades to "no catalog" (packs
 * fall back to their manifest declaration or are free), and a missing Steam
 * config or native module degrades to "Steam unavailable" (gated packs stay
 * locked). The read API is therefore always total.
 */
async function initCardPacks(): Promise<void> {
  const config = loadSteamConfig();
  const catalog = loadCardPackCatalog();

  if (!catalog) {
    console.warn(
      '[packs] no card-pack DLC catalog loaded; packs fall back to their manifest entitlement or are treated as free.',
    );
  }

  const source = new SteamPackEntitlementSource({
    appId: config ? Number(config.appId) : undefined,
    // The overlay hook is already enabled by the follow/achievement sources;
    // no need to touch it again here.
    enableOverlay: false,
  });

  try {
    await source.init();
  } catch (error) {
    console.warn('[packs] init failed; continuing without Steam:', error);
  }

  if (source.restartRequested) {
    // Steam is relaunching the app through the Steam client — exit cleanly.
    console.info('[packs] Steam requested an app restart; quitting.');
    app.quit();
    return;
  }

  if (!source.isSteamAvailable()) {
    console.warn('[packs] Steam is unavailable — gated packs will report as locked.');
  } else if (!source.dlcCheckSupported) {
    console.warn(
      '[packs] The Steamworks binding exposes no DLC-ownership API; gated packs will report as locked.',
    );
  }

  const service = new CardPackEntitlementService(source, catalog);
  const handlers = createCardPackHandlers(service);

  for (const [name, channel] of Object.entries(CARD_PACK_CHANNELS)) {
    const handler = handlers[name as keyof typeof handlers] as (
      ...args: unknown[]
    ) => unknown;
    ipcMain.handle(channel, (_event, ...args: unknown[]) => handler(...args));
  }

  app.on('will-quit', () => service.close());
}

// Quit when all windows are closed (except on macOS, per platform convention).
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
