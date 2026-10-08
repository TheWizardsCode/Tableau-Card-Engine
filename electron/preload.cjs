/**
 * TCE Electron launcher — preload script (CommonJS).
 *
 * Exposes read-only host info, a narrow Steam-follow API, a narrow Steam
 * achievements API, the additive generalised content-unlock read API, and the
 * card-pack entitlement read API to the renderer through the context bridge.
 * The renderer
 * keeps `contextIsolation` enabled and `nodeIntegration` disabled — no Node
 * APIs leak into the game pages, and the renderer never imports the
 * Steamworks SDK (F3, CG-0MSMAJQQT004SDCC; F6, CG-0MUNC7EXO001LITF; F5,
 * CG-0MUZGBSSQ009ISHG; F5, CG-0MUZIS2B8005WG4S).
 *
 * NOTE: this file is intentionally plain CommonJS (.cjs). Sandboxed preload
 * scripts cannot use ESM imports, and Electron treats a preload's format by
 * its extension regardless of package.json "type". It is copied verbatim
 * into dist-electron/ by the build:electron-main script. Channel names must
 * stay in sync with electron/steam-follow-ipc.ts.
 */
const { contextBridge, ipcRenderer } = require('electron');

const hostInfo = {
  /** Absolute path of the directory the game content was loaded from. */
  contentDir: process.env.TCE_RESOLVED_CONTENT_DIR ?? null,
  /** Version of the packaged app (package.json `version`). */
  appVersion: process.env.TCE_APP_VERSION ?? null,
  platform: process.platform,
  versions: {
    electron: process.versions.electron ?? null,
    chrome: process.versions.chrome ?? null,
    node: process.versions.node ?? null,
  },
};

/**
 * Steam follow-to-unlock bridge. Every call is async and total: the main
 * process degrades to safe values when Steam is absent, so the renderer can
 * render the CTA without branching on platform.
 */
const steamFollow = {
  getStatus: () => ipcRenderer.invoke('steamFollow:getStatus'),
  isSteamAvailable: () => ipcRenderer.invoke('steamFollow:isSteamAvailable'),
  supportsAutomaticFollowCheck: () => ipcRenderer.invoke('steamFollow:supportsAutomaticFollowCheck'),
  getBonusCatalog: () => ipcRenderer.invoke('steamFollow:getBonusCatalog'),
  openStorePage: () => ipcRenderer.invoke('steamFollow:openStorePage'),
  isFollowing: () => ipcRenderer.invoke('steamFollow:isFollowing'),
  claim: () => ipcRenderer.invoke('steamFollow:claim'),
  claimManually: () => ipcRenderer.invoke('steamFollow:claimManually'),
};

/**
 * Generalised content-unlock bridge (additive; F5, CG-0MUZGBSSQ009ISHG).
 * Every call is async and total: the main process degrades to safe values
 * when the config is absent, so a game can gate DLC/game content without
 * branching on platform. The legacy `steamFollow` surface is unchanged.
 * Channel names must stay in sync with electron/action-rewards-ipc.ts.
 */
const contentUnlocks = {
  isUnlocked: (target) => ipcRenderer.invoke('contentUnlocks:isUnlocked', target),
  getUnlocks: () => ipcRenderer.invoke('contentUnlocks:getUnlocks'),
  refresh: (options) => ipcRenderer.invoke('contentUnlocks:refresh', options),
};

/**
 * Steam achievements bridge. Every call is async and total: the main process
 * degrades to safe values when Steam or the manifest is absent, so the
 * renderer can forward challenge completions without branching on platform.
 * Channel names must stay in sync with electron/steam-achievements-ipc.ts.
 */
const achievements = {
  unlock: (achievementId) => ipcRenderer.invoke('steamAchievements:unlock', achievementId),
  getUnlocked: () => ipcRenderer.invoke('steamAchievements:getUnlocked'),
  isAvailable: () => ipcRenderer.invoke('steamAchievements:isAvailable'),
  hasManifest: () => ipcRenderer.invoke('steamAchievements:hasManifest'),
  resync: () => ipcRenderer.invoke('steamAchievements:resync'),
};

/**
 * Card-pack entitlement bridge (F5, CG-0MUZIS2B8005WG4S). Every call is async
 * and total: the main process degrades to a safe `locked` status when Steam,
 * the DLC catalog, or the native module is absent, so the renderer can gate
 * packs without branching on platform. The renderer never imports the
 * Steamworks SDK. Channel names must stay in sync with
 * electron/card-pack-ipc.ts.
 */
const cardPacks = {
  isAvailable: () => ipcRenderer.invoke('cardPacks:isAvailable'),
  hasCatalog: () => ipcRenderer.invoke('cardPacks:hasCatalog'),
  supportsDlcCheck: () => ipcRenderer.invoke('cardPacks:supportsDlcCheck'),
  getCatalog: () => ipcRenderer.invoke('cardPacks:getCatalog'),
  getStatus: (pack) => ipcRenderer.invoke('cardPacks:getStatus', pack),
  listStatus: (packs) => ipcRenderer.invoke('cardPacks:listStatus', packs),
};

contextBridge.exposeInMainWorld('tce', { ...hostInfo, steamFollow, achievements, contentUnlocks, cardPacks });
