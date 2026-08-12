/**
 * TCE Electron launcher — preload script (CommonJS).
 *
 * Exposes read-only host info to the renderer through the context bridge.
 * The renderer keeps `contextIsolation` enabled and `nodeIntegration`
 * disabled — no Node APIs leak into the game pages.
 *
 * The resolved content path and app version are injected by the main process
 * via environment variables (read-only from the renderer's perspective).
 *
 * NOTE: this file is intentionally plain CommonJS (.cjs). Sandboxed preload
 * scripts cannot use ESM imports, and Electron treats a preload's format by
 * its extension regardless of package.json "type". It is copied verbatim
 * into dist-electron/ by the build:electron-main script.
 */
const { contextBridge } = require('electron');

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

contextBridge.exposeInMainWorld('tce', hostInfo);
