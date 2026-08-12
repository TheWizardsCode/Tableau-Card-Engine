/**
 * Build the Electron launcher main process (cross-platform).
 *
 * 1. Clean dist-electron/ (stale artifacts from earlier compiles).
 * 2. Compile electron/*.ts (ESM) via the electron tsconfig.
 * 3. Copy the CommonJS preload (electron/preload.cjs) into dist-electron/
 *    verbatim — sandboxed preloads cannot use ESM, so it is authored and
 *    shipped as CJS.
 *
 * Invoked by `npm run build:electron-main`.
 */
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'dist-electron');

fs.rmSync(outDir, { recursive: true, force: true });
execSync('npx tsc -p electron/tsconfig.json', { cwd: root, stdio: 'inherit' });
fs.copyFileSync(path.join(root, 'electron', 'preload.cjs'), path.join(outDir, 'preload.cjs'));
console.log('electron main built into dist-electron/');
