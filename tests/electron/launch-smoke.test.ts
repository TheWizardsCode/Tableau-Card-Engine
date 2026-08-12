/**
 * Electron launch smoke test (parent CG-0MSMAD19O0084CAW, AC #1).
 *
 * Launches the real Electron launcher via Playwright's `_electron` and
 * asserts end-to-end boot of the packaged web app:
 *
 *  1. The BrowserWindow loads the electron-mode `dist/` over file://.
 *  2. The Game Selector renders (canvas + `window.__PHASER_GAME__`).
 *  3. The preload context bridge (`window.tce`) exposes read-only host info.
 *  4. Clicking a selector card boots a real game scene.
 *
 * Two launch modes:
 *  - Dev build (default): runs `electron .` against the built app — the
 *    test (re)builds the electron-mode renderer + main if needed.
 *  - Packaged binary: set `TCE_SMOKE_BINARY=/path/to/executable` to launch
 *    the packaged artifact (used by the CI packaging job).
 *
 * Runs in its own vitest project (`electron`) — never part of the regular
 * unit/browser suites. On headless Linux, run under xvfb:
 *   xvfb-run -a npx vitest run --project electron
 */
import { _electron as electron, type ElectronApplication, type Page } from 'playwright';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const packagedBinary = process.env.TCE_SMOKE_BINARY ?? null;

/** Logical game size (matches createCardGame defaults). */
const GAME_W = 1280;
const GAME_H = 720;

let app: ElectronApplication | null = null;
let page: Page | null = null;

/** Renderer errors captured for the whole session (page + console). */
const sessionErrors: string[] = [];

describe('Electron launcher smoke test', () => {
  beforeAll(async () => {
    if (packagedBinary) {
      // Packaged-binary mode: the artifact is prebuilt by the caller.
      expect(fs.existsSync(packagedBinary)).toBe(true);
    } else {
      // Dev mode: ensure the electron-mode renderer and compiled main exist.
      execSync('npm run build:electron', { cwd: repoRoot, stdio: 'pipe' });
      execSync('npm run build:electron-main', { cwd: repoRoot, stdio: 'pipe' });
    }

    app = packagedBinary
      ? await electron.launch({ executablePath: packagedBinary, args: ['--no-sandbox'] })
      : await electron.launch({ args: ['.', '--no-sandbox'], cwd: repoRoot });

    page = await app.firstWindow();
    page.on('console', msg => {
      if (msg.type() === 'error') sessionErrors.push(msg.text());
    });
    page.on('pageerror', err => sessionErrors.push(String(err)));
    await page.waitForLoadState('domcontentloaded');
  }, 240_000);

  afterAll(async () => {
    await app?.close();
    app = null;
    page = null;
  });

  it('loads the app over file:// with the preload bridge exposed', async () => {
    expect(page).toBeTruthy();
    // Phaser boots asynchronously; wait for the selector canvas.
    await page!.waitForSelector('#game-container canvas', { timeout: 30_000 });

    const url = page!.url();
    expect(url).toMatch(/^file:\/\//);
    expect(url).toContain('index.html');

    const tce = await page!.evaluate(() => (window as any).tce ?? null);
    expect(tce).toBeTruthy();
    expect(tce.contentDir).toBeTruthy();
    expect(tce.appVersion).toMatch(/^\d+\.\d+\.\d+$/);
    expect(tce.versions.electron).toBeTruthy();
  });

  it('renders the Game Selector with the full game catalogue', async () => {
    const info = await page!.evaluate(() => {
      const game = (window as any).__PHASER_GAME__;
      const active = game?.scene?.getScenes(true).map((s: any) => s.scene.key) ?? [];
      const catalogue = game?.registry?.get('gameSelector.games') ?? [];
      return { active, catalogueCount: catalogue.length, firstGame: catalogue[0]?.title ?? null };
    });

    expect(info.active).toContain('GameSelectorScene');
    expect(info.catalogueCount).toBeGreaterThanOrEqual(9);
    expect(info.firstGame).toBeTruthy();
  });

  it('boots an example game by clicking its selector card', async () => {
    const canvas = page!.locator('#game-container canvas');
    await canvas.waitFor({ timeout: 15_000 });
    const box = await canvas.boundingBox();
    expect(box).toBeTruthy();

    // Derive the first card's "[ Play ]" position from the LIVE scene (not a
    // re-implementation of the layout math) and click it on the canvas.
    const playButton = await page!.evaluate(() => {
      const game = (window as any).__PHASER_GAME__;
      const scene = game?.scene?.getScene('GameSelectorScene');
      if (!scene) return null;
      const play = scene.children.list.find(
        (c: any) => typeof c.text === 'string' && c.text.startsWith('[ Play ]'),
      );
      if (!play) return null;
      const catalogue = game.registry.get('gameSelector.games');
      return { x: play.x, y: play.y, expectedSceneKey: catalogue?.[0]?.sceneKey ?? null };
    });

    expect(playButton).toBeTruthy();
    const scaleX = box!.width / GAME_W;
    const scaleY = box!.height / GAME_H;
    await page!.mouse.click(box!.x + playButton!.x * scaleX, box!.y + playButton!.y * scaleY);

    // The clicked game scene becomes active and renders (canvas present).
    await page!.waitForFunction(
      key => (window as any).__PHASER_GAME__?.scene?.isActive(key) === true,
      playButton!.expectedSceneKey,
      { timeout: 15_000 },
    );
    const canvasCount = await page!.locator('#game-container canvas').count();
    expect(canvasCount).toBe(1);
  }, 60_000);

  it('surfaces no fatal renderer errors during the session', () => {
    // Known pre-existing gap: some games ship no committed thumbnail
    // (generated by scripts/generate-all-thumbnails.ts), which produces a
    // net::ERR_FILE_NOT_FOUND for the missing thumbnail.png under file://.
    const fatal = sessionErrors.filter(e => {
      if (/thumbnail\.png/.test(e)) return false;
      return /failed to load|net::|not allowed to load|uncaught|is not defined/i.test(e);
    });
    expect(fatal).toEqual([]);
  });
});
