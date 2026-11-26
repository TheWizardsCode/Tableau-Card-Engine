/**
 * Vite base-path gating tests (parent CG-0MSMAD19O0084CAW, AC #3).
 *
 * Proves the observable build behaviour:
 *  - `--mode electron` emits relative `./assets/...` URLs (file://-safe for
 *    the Electron launcher), and
 *  - the GitHub Pages production build still emits `/Tableau-Card-Engine/`
 *    prefixed URLs (no regression to the Pages deployment).
 *
 * Each build runs against the real app (real vite.config.ts) into a temp
 * outDir so the repo `dist/` is never touched, and against a private snapshot
 * of `public/` so a concurrent dev/build run cannot mutate the tree Vite
 * copies (CG-0MWW8D6N6006ZR49).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { build } from 'vite';
import { createPublicSnapshot } from '../helpers/public-snapshot';

const REPO_ROOT = process.cwd();

/**
 * Pin one deterministic preset for the whole file (CG-0MWW8D6N6006ZR49).
 *
 * These builds exercise the launcher shell, not the game catalogue, so
 * `core-only` is the always-available preset (the merged core is
 * sibling-only). Pinning once at file scope — instead of saving and restoring
 * an ambient value around each build — means the preset cannot differ
 * mid-run and the result never depends on the caller's `GAMES_CONFIG`.
 */
const FORCED_PRESET = 'core-only';
let ambientPreset: string | undefined;

beforeAll(() => {
  ambientPreset = process.env.GAMES_CONFIG;
  process.env.GAMES_CONFIG = FORCED_PRESET;
});

afterAll(() => {
  if (ambientPreset === undefined) delete process.env.GAMES_CONFIG;
  else process.env.GAMES_CONFIG = ambientPreset;
});

interface TempBuild {
  html: string;
  outDir: string;
  /** Releases the temp outDir and the `public/` snapshot; call in `finally`. */
  cleanup: () => void;
}

/**
 * Build into a temp outDir against a private `public/` snapshot.
 *
 * @param mutateSnapshot optional hook to change the snapshot before the build
 *   (used to prove the build reads the snapshot, not the shared repo tree).
 */
async function buildToTemp(
  mode: 'electron' | 'production',
  mutateSnapshot?: (publicDir: string) => void,
): Promise<TempBuild> {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), `tce-vite-${mode}-`));
  const snapshot = createPublicSnapshot();
  const cleanup = (): void => {
    snapshot.cleanup();
    fs.rmSync(outDir, { recursive: true, force: true });
  };
  try {
    mutateSnapshot?.(snapshot.publicDir);
    await build({
      mode,
      root: REPO_ROOT,
      configFile: path.join(REPO_ROOT, 'vite.config.ts'),
      publicDir: snapshot.publicDir,
      logLevel: 'silent',
      build: { outDir, emptyOutDir: true, sourcemap: false },
    });
    const html = fs.readFileSync(path.join(outDir, 'index.html'), 'utf-8');
    return { html, outDir, cleanup };
  } catch (e) {
    cleanup();
    throw e;
  }
}

describe('vite base-path gating', () => {
  it('electron build mode emits relative ./ asset URLs and no absolute asset paths', async () => {
    const result = await buildToTemp('electron');
    try {
      expect(result.html).toMatch(/src="\.\/assets\//);
      expect(result.html).not.toContain('/Tableau-Card-Engine/');
      // No absolute '/assets/...' references — everything resolves relative
      // to the file itself so `file://` loading works.
      expect(result.html).not.toMatch(/src="\/assets\//);
      expect(result.html).not.toMatch(/href="\/assets\//);
      expect(result.html).toMatch(/src="\.\/assets\/index-[^"]+\.js"/);
    } finally {
      result.cleanup();
    }
  }, 90_000);

  it('production build still emits the GitHub Pages base and no relative asset URLs', async () => {
    const result = await buildToTemp('production');
    try {
      expect(result.html).toMatch(/src="\/Tableau-Card-Engine\/assets\//);
      expect(result.html).toMatch(/src="\/Tableau-Card-Engine\/assets\/index-[^"]+\.js"/);
      expect(result.html).not.toContain('src="./assets/');
    } finally {
      result.cleanup();
    }
  }, 90_000);

  it('copies the private public/ snapshot, not the shared repo tree', async () => {
    const marker = 'snapshot-only.txt';
    const result = await buildToTemp('electron', (publicDir) => {
      // `favicon.svg` exists in the repo tree; removing it from the snapshot
      // must remove it from the build output. The marker exists only here.
      fs.rmSync(path.join(publicDir, 'favicon.svg'));
      fs.writeFileSync(path.join(publicDir, marker), 'from-snapshot');
    });
    try {
      expect(fs.existsSync(path.join(REPO_ROOT, 'public', 'favicon.svg'))).toBe(true);
      expect(fs.readFileSync(path.join(result.outDir, marker), 'utf-8')).toBe('from-snapshot');
      expect(fs.existsSync(path.join(result.outDir, 'favicon.svg'))).toBe(false);
    } finally {
      result.cleanup();
    }
  }, 90_000);
});
