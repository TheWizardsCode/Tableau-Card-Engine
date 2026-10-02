/**
 * Build the Option A native friends addon and stage it for packaging
 * (P4, CG-0MUNBHYY0001PHKU).
 *
 * `native/steam-friends` is a standalone node-gyp package. This script builds
 * it (Windows x64 only) and stages the resulting `.node` as the `tce-steam-friends`
 * module in the repository `node_modules`, which is what
 * `electron/steam-follow-native.ts` resolves at runtime and what
 * `electron-builder.yml` includes/unpacks.
 *
 * Non-Steam builds never call this. A non-Windows host is a no-op with a
 * warning (the addon cannot be built there).
 */
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGE_DIR = path.join(root, 'native', 'steam-friends');
const BUILT_ADDON = path.join(PACKAGE_DIR, 'build', 'Release', 'steam_friends.node');
const STAGED_DIR = path.join(root, 'node_modules', 'tce-steam-friends');

/** @returns {boolean} Whether the native addon can be built on *platform*. */
export function isWindows(platform = process.platform) {
  return platform === 'win32';
}

/**
 * Stage a built addon as the `tce-steam-friends` node module.
 * @returns {string} Path of the staged `.node` file.
 */
export function stageAddon({ from = BUILT_ADDON, toDir = STAGED_DIR } = {}) {
  const target = path.join(toDir, 'build', 'Release', 'steam_friends.node');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(from, target);
  fs.writeFileSync(
    path.join(toDir, 'package.json'),
    `${JSON.stringify(
      {
        name: 'tce-steam-friends',
        version: '0.1.0',
        private: true,
        main: 'build/Release/steam_friends.node',
      },
      null,
      2,
    )}\n`,
  );
  return target;
}

function main() {
  if (!isWindows()) {
    console.warn(
      `[steam] the native friends addon is Windows-only; skipping the build on ${process.platform}`,
    );
    return;
  }
  execSync('npm run build', { cwd: PACKAGE_DIR, stdio: 'inherit' });
  const staged = stageAddon();
  console.log(`[steam] staged native friends addon at ${staged}`);
}

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) main();
