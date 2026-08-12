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
 * outDir so the repo `dist/` is never touched.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { build } from 'vite';

const REPO_ROOT = process.cwd();

async function buildToTemp(
  mode: 'electron' | 'production',
): Promise<{ html: string; outDir: string }> {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), `tce-vite-${mode}-`));
  try {
    await build({
      mode,
      root: REPO_ROOT,
      configFile: path.join(REPO_ROOT, 'vite.config.ts'),
      logLevel: 'silent',
      build: { outDir, emptyOutDir: true, sourcemap: false },
    });
    const html = fs.readFileSync(path.join(outDir, 'index.html'), 'utf-8');
    return { html, outDir };
  } catch (e) {
    fs.rmSync(outDir, { recursive: true, force: true });
    throw e;
  }
}

describe('vite base-path gating', () => {
  it('electron build mode emits relative ./ asset URLs and no absolute asset paths', async () => {
    const { html, outDir } = await buildToTemp('electron');
    try {
      expect(html).toMatch(/src="\.\/assets\//);
      expect(html).not.toContain('/Tableau-Card-Engine/');
      // No absolute '/assets/...' references — everything resolves relative
      // to the file itself so `file://` loading works.
      expect(html).not.toMatch(/src="\/assets\//);
      expect(html).not.toMatch(/href="\/assets\//);
      expect(html).toMatch(/src="\.\/assets\/index-[^"]+\.js"/);
    } finally {
      fs.rmSync(outDir, { recursive: true, force: true });
    }
  }, 90_000);

  it('production build still emits the GitHub Pages base and no relative asset URLs', async () => {
    const { html, outDir } = await buildToTemp('production');
    try {
      expect(html).toMatch(/src="\/Tableau-Card-Engine\/assets\//);
      expect(html).toMatch(/src="\/Tableau-Card-Engine\/assets\/index-[^"]+\.js"/);
      expect(html).not.toContain('src="./assets/');
    } finally {
      fs.rmSync(outDir, { recursive: true, force: true });
    }
  }, 90_000);
});
