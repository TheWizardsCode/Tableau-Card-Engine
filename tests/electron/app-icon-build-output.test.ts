/**
 * App-icon build-output contract (CG-0MUTTXRWZ009NUB9 / CG-0MUU3Q3TT008HF5Q).
 *
 * The emblem must appear in the browser tab, bookmarks, and mobile
 * home-screen installs on every surface the launcher ships to. That only works
 * if the emitted HTML carries the icon/manifest `<link>`s and the referenced
 * files are actually copied into the build output. These tests run the real
 * `vite.config.ts` build into a temp outDir (never touching the repo `dist/`)
 * for all three build bases and assert the observable build contract:
 *
 *   - `index.html` references the favicon, Apple touch icon, and manifest;
 *   - the page's icon/manifest hrefs resolve to existing files in the output;
 *   - `public/404.html` carries the favicon link; and
 *   - `site.webmanifest` is emitted with name/short_name/icons, and every icon
 *     it references exists in the output.
 *
 * The base-relative wiring (no leading `/`, no `./`) is what lets the same
 * markup resolve under `/Tableau-Card-Engine/` (Pages), `/` (dev), and `./`
 * (Electron) without per-mode code — `vite-base-gating.test.ts` covers the
 * script/asset half of that contract.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { build } from 'vite';

const REPO_ROOT = process.cwd();

/** The icon/manifest files that must exist in every build output. */
const REQUIRED_PUBLIC_FILES = [
  'favicon.svg',
  'apple-touch-icon.png',
  'icon-192.png',
  'icon-512.png',
  'site.webmanifest',
] as const;

interface BuildOutput {
  indexHtml: string;
  notFoundHtml: string | null;
  outDir: string;
}

async function buildToTemp(mode: 'electron' | 'production' | 'development'): Promise<BuildOutput> {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), `tce-icons-${mode}-`));
  // Build the always-available core-only preset so the test does not depend on
  // any sibling game checkout (merged core is Option A / sibling-only).
  const previousPreset = process.env.GAMES_CONFIG;
  process.env.GAMES_CONFIG = 'core-only';
  try {
    await build({
      mode,
      root: REPO_ROOT,
      configFile: path.join(REPO_ROOT, 'vite.config.ts'),
      logLevel: 'silent',
      build: { outDir, emptyOutDir: true, sourcemap: false },
    });
    const notFoundPath = path.join(outDir, '404.html');
    return {
      indexHtml: fs.readFileSync(path.join(outDir, 'index.html'), 'utf-8'),
      notFoundHtml: fs.existsSync(notFoundPath) ? fs.readFileSync(notFoundPath, 'utf-8') : null,
      outDir,
    };
  } catch (e) {
    fs.rmSync(outDir, { recursive: true, force: true });
    throw e;
  } finally {
    if (previousPreset === undefined) delete process.env.GAMES_CONFIG;
    else process.env.GAMES_CONFIG = previousPreset;
  }
}

/** Extract the href of the first `<link>` whose rel matches *rel*. */
function linkHref(html: string, rel: string): string | undefined {
  const linkRe = /<link\b[^>]*>/gi;
  for (const tag of html.match(linkRe) ?? []) {
    if (new RegExp(`rel=["']${rel}["']`, 'i').test(tag)) {
      const href = /href=["']([^"']+)["']/i.exec(tag);
      if (href) return href[1];
    }
  }
  return undefined;
}

/** Resolve a base-relative href against the build output root. */
function resolveOutputFile(outDir: string, href: string): string {
  return path.join(outDir, href.replace(/^\.\//, '').replace(/^\//, ''));
}

describe.each(['electron', 'production', 'development'] as const)(
  'app-icon wiring (%s build)',
  (mode) => {
    it('emits every icon/manifest file declared as public', async () => {
      const { outDir } = await buildToTemp(mode);
      try {
        for (const file of REQUIRED_PUBLIC_FILES) {
          expect(fs.existsSync(path.join(outDir, file)), `${file} must be in the build output`).toBe(
            true,
          );
        }
      } finally {
        fs.rmSync(outDir, { recursive: true, force: true });
      }
    }, 120_000);

    it('index.html references the favicon, Apple touch icon, and manifest', async () => {
      const { indexHtml, outDir } = await buildToTemp(mode);
      try {
        const favicon = linkHref(indexHtml, 'icon');
        expect(favicon, 'index.html must declare a favicon link').toBeTruthy();
        const apple = linkHref(indexHtml, 'apple-touch-icon');
        expect(apple, 'index.html must declare an Apple touch icon').toBeTruthy();
        const manifest = linkHref(indexHtml, 'manifest');
        expect(manifest, 'index.html must declare a web app manifest').toBeTruthy();

        // Every referenced href resolves to a file that exists in the output.
        for (const href of [favicon!, apple!, manifest!]) {
          expect(
            fs.existsSync(resolveOutputFile(outDir, href)),
            `${href} must resolve in the build output`,
          ).toBe(true);
        }

        // The wiring is base-relative: a leading '/' or './' would break at
        // least one of the three base modes, so reject both outright.
        for (const href of [favicon!, apple!, manifest!]) {
          expect(href.startsWith('/'), `${href} must not be root-absolute`).toBe(false);
          expect(href.startsWith('./'), `${href} must not be dot-relative`).toBe(false);
        }
      } finally {
        fs.rmSync(outDir, { recursive: true, force: true });
      }
    }, 120_000);

    it('404.html carries the favicon link', async () => {
      const { notFoundHtml, outDir } = await buildToTemp(mode);
      try {
        expect(notFoundHtml, '404.html must be copied into the output').not.toBeNull();
        const favicon = linkHref(notFoundHtml!, 'icon');
        expect(favicon, '404.html must declare a favicon link').toBeTruthy();
        expect(fs.existsSync(resolveOutputFile(outDir, favicon!))).toBe(true);
        expect(favicon!.startsWith('/')).toBe(false);
        expect(favicon!.startsWith('./')).toBe(false);
      } finally {
        fs.rmSync(outDir, { recursive: true, force: true });
      }
    }, 120_000);

    it('site.webmanifest names the app and only references icons present in the output', async () => {
      const { outDir } = await buildToTemp(mode);
      try {
        const manifest = JSON.parse(
          fs.readFileSync(path.join(outDir, 'site.webmanifest'), 'utf-8'),
        ) as {
          name?: string;
          short_name?: string;
          icons?: { src: string; sizes: string; type?: string }[];
          theme_color?: string;
          background_color?: string;
        };

        expect(manifest.name).toBeTruthy();
        expect(manifest.short_name).toBeTruthy();
        expect(manifest.theme_color).toBeTruthy();
        expect(manifest.background_color).toBeTruthy();
        expect(Array.isArray(manifest.icons)).toBe(true);
        expect(manifest.icons!.length).toBeGreaterThan(0);

        const sizes = manifest.icons!.map((i) => i.sizes);
        expect(sizes).toContain('192x192');
        expect(sizes).toContain('512x512');

        for (const icon of manifest.icons!) {
          expect(
            fs.existsSync(resolveOutputFile(outDir, icon.src)),
            `manifest icon ${icon.src} must exist in the output`,
          ).toBe(true);
        }
      } finally {
        fs.rmSync(outDir, { recursive: true, force: true });
      }
    }, 120_000);
  },
);
