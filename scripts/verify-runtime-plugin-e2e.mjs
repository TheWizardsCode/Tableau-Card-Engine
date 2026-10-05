#!/usr/bin/env node
/**
 * Reproducible verification: runtime game plugin shared-dependency resolution
 * (CG-0MUV9Y71Z002W8N2).
 *
 * Proves — in a real Chromium (the same engine the Electron launcher uses) —
 * that a runtime game artifact built by `scripts/build-game-artifact.mjs`
 * imports and boots even though it externalises `phaser` and the engine
 * aliases:
 *
 *   1. Builds the electron-mode launcher (`vite build --mode electron`),
 *      which emits the stable `tce-shared/**` chunks and injects the
 *      runtime-shared import map into `dist/index.html`.
 *   2. Builds the minimal `tests/fixtures/runtime-plugin-fixture` artifact
 *      (imports `phaser`, `@ui`, `@core-engine`) into `dist/games/`.
 *   3. Serves `dist/` over HTTP, injects the launcher content-directory
 *      bridge (`window.tce.contentDir`) before the app boots, and checks the
 *      fixture is discovered AND its scene starts.
 *
 * A discovery hit proves the artifact's bare specifiers resolved through the
 * import map; a start hit proves the scene class shares the launcher's single
 * Phaser instance (class identity preserved).
 *
 * Usage:
 *
 *   npm run verify:runtime-plugin
 *
 * (Requires a Playwright Chromium: `npx playwright install chromium`.)
 *
 * @see docs/dev/runtime-game-plugins-runbook.md — scenario D
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import process from 'node:process';

import { chromium } from 'playwright';

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const dist = path.join(repoRoot, 'dist');
const FIXTURE_SCENE_KEY = 'RuntimeFixtureScene';

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.css': 'text/css',
  '.webmanifest': 'application/json',
  '.map': 'application/json',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
};

function run(command, args) {
  const result = spawnSync(command, args, { cwd: repoRoot, stdio: 'inherit' });
  if (result.status !== 0) {
    throw new Error(`Command failed (${result.status}): ${command} ${args.join(' ')}`);
  }
}

/** Build the electron-mode launcher (emits the import map + tce-shared chunks). */
function buildLauncher() {
  console.log('[verify] building the electron-mode launcher…');
  run('npx', ['vite', 'build', '--mode', 'electron']);
}

/** Build + install the minimal runtime fixture artifact into dist/games/. */
function installFixtureArtifact() {
  console.log('[verify] building runtime fixture artifact…');
  run('npx', [
    'tsx',
    'scripts/build-game-artifact.mjs',
    '--game',
    'runtime-fixture',
    '--preset',
    'tests/fixtures/runtime-plugin-fixture/preset.json',
    '--out',
    path.join('dist', 'games'),
  ]);
}

/** Serve `dist/` on an ephemeral localhost port. */
function serveDist() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let file = path.join(dist, decodeURIComponent(url.pathname));
    if (file.endsWith(path.sep)) file = path.join(file, 'index.html');
    if (!file.startsWith(dist) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.statusCode = 404;
      res.end('not found');
      return;
    }
    res.setHeader('content-type', MIME[path.extname(file)] ?? 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, base: `http://127.0.0.1:${port}` });
    });
  });
}

async function main() {
  buildLauncher();
  installFixtureArtifact();

  const { server, base } = await serveDist();
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));

  // Inject the launcher's content-directory bridge before the app boots.
  await page.addInitScript(
    ({ contentDir }) => {
      window.tce = { contentDir, appVersion: '0.0.0', platform: 'test', versions: {} };
    },
    { contentDir: base },
  );

  let failures = [];
  try {
    await page.goto(`${base}/index.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#game-container canvas', { timeout: 30_000 });

    const catalogue = await page.evaluate(
      () =>
        (window.__PHASER_GAME__?.registry?.get('gameSelector.games') ?? []).map(
          (game) => game.sceneKey,
        ),
    );
    console.log('[verify] catalogue:', JSON.stringify(catalogue));

    if (!catalogue.includes(FIXTURE_SCENE_KEY)) {
      failures.push(
        `runtime fixture ${FIXTURE_SCENE_KEY} was not discovered — the artifact's bare specifiers did not resolve`,
      );
    } else {
      await page.evaluate((key) => window.__PHASER_GAME__.scene.start(key), FIXTURE_SCENE_KEY);
      const started = await page
        .waitForFunction(
          (key) => window.__PHASER_GAME__?.scene?.isActive(key) === true,
          FIXTURE_SCENE_KEY,
          { timeout: 20_000 },
        )
        .then(() => true)
        .catch(() => false);
      if (!started) {
        failures.push(`runtime fixture ${FIXTURE_SCENE_KEY} did not start`);
      } else {
        console.log('[verify] runtime fixture discovered + started ✓');
      }
    }

    if (pageErrors.length > 0) failures.push(...pageErrors.map((e) => `pageerror: ${e}`));
  } finally {
    await browser.close();
    server.close();
  }

  if (failures.length > 0) {
    console.error('\n[verify] FAILED:');
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exitCode = 1;
    return;
  }
  console.log('\n[verify] PASS — runtime game plugin shared-dependency resolution works.');
}

main().catch((error) => {
  console.error('[verify] unexpected error:', error);
  process.exitCode = 1;
});
