/**
 * Build the Electron launcher main process (cross-platform).
 *
 * 1. Clean dist-electron/ (stale artifacts from earlier compiles).
 * 2. Compile electron/*.ts (ESM) via the electron tsconfig.
 * 3. Copy the CommonJS preload (electron/preload.cjs) into dist-electron/
 *    verbatim — sandboxed preloads cannot use ESM, so it is authored and
 *    shipped as CJS.
 * 4. Copy the runtime JSON data files (bonus catalog, achievement manifest)
 *    into dist-electron/ so the loaders (which resolve them relative to the
 *    compiled module) find them at runtime. Local/private config
 *    (steam-config.local.json) is deliberately NOT copied — it is resolved
 *    from `electron/` or the environment (see steam-config.ts).
 *
 * Invoked by `npm run build:electron-main`.
 */
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'dist-electron');

/** Runtime JSON data files (not TypeScript) copied next to the compiled code. */
const RUNTIME_JSON_FILES = ['bonus-catalog.json', 'achievement-manifest.json'];

fs.rmSync(outDir, { recursive: true, force: true });
execSync('npx tsc -p electron/tsconfig.json', { cwd: root, stdio: 'inherit' });
fs.copyFileSync(path.join(root, 'electron', 'preload.cjs'), path.join(outDir, 'preload.cjs'));

for (const file of RUNTIME_JSON_FILES) {
  const src = path.join(root, 'electron', file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(outDir, file));
  }
}

console.log('electron main built into dist-electron/');
