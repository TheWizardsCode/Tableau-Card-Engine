/**
 * TCE Electron launcher — preload script (CommonJS).
 *
 * Exposes read-only host info and a narrow Steam-follow API to the renderer
 * through the context bridge. The renderer keeps `contextIsolation` enabled
 * and `nodeIntegration` disabled — no Node APIs leak into the game pages, and
 * the renderer never imports the Steamworks SDK (F3, CG-0MSMAJQQT004SDCC).
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

contextBridge.exposeInMainWorld('tce', { ...hostInfo, steamFollow });
