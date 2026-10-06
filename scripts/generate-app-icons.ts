#!/usr/bin/env npx tsx
/**
 * generate-app-icons.ts
 *
 * Single generator for every TCE app icon variant, rasterised from the
 * tracked tableau-emblem source SVG (`public/favicon.svg`). Keeping one
 * generator guarantees the web favicons and the packaged desktop icons can
 * never drift from the source-of-truth mark.
 *
 * Outputs (defaults):
 *   Web (committed under `public/`):
 *     public/icon-32.png           32x32   manifest / legacy favicon
 *     public/icon-192.png         192x192  manifest (Android)
 *     public/icon-512.png         512x512  manifest / PWA
 *     public/apple-touch-icon.png 180x180  iOS home screen
 *   Desktop (`build/` is gitignored — generated at package time):
 *     build/icon.png             1024x1024 electron-builder derives
 *                                          .ico/.icns from this >=512px PNG
 *     build/icon.ico             multi-size Windows ICO for the NSIS
 *                                          installer/uninstaller (NSIS rejects
 *                                          PNG files for these keys)
 *
 * Usage:
 *   npx tsx scripts/generate-app-icons.ts
 *   npx tsx scripts/generate-app-icons.ts --public-dir <dir> --build-dir <dir>
 *   npx tsx scripts/generate-app-icons.ts --source <path/to/emblem.svg>
 *
 * See CG-0MUTTXRWZ009NUB9 / CG-0MUU3Q3C8007AGQ5.
 */

import { existsSync, mkdirSync, renameSync } from 'fs';
import { dirname, isAbsolute, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');

/** Default tracked source-of-truth emblem SVG. */
export const DEFAULT_SOURCE_SVG = join(ROOT, 'public', 'favicon.svg');

/** Where an artefact is written: relative to `publicDir` or `buildDir`. */
export type IconDir = 'public' | 'build';

export interface AppIconTarget {
  /** File name (relative to its directory). */
  file: string;
  /** Output directory key. */
  dir: IconDir;
  /** Target square size in pixels. */
  width: number;
  height: number;
  /** Human-readable purpose (surfaced in the CLI output). */
  purpose: string;
}

/**
 * Canonical icon targets. The Electron resource is deliberately 1024x1024
 * (>=512px) so electron-builder can derive both `.ico` and `.icns` from it
 * without a separate packer dependency.
 */
export const APP_ICON_TARGETS: readonly AppIconTarget[] = [
  { file: 'icon-32.png', dir: 'public', width: 32, height: 32, purpose: 'manifest / legacy favicon' },
  { file: 'icon-192.png', dir: 'public', width: 192, height: 192, purpose: 'web app manifest (Android)' },
  { file: 'icon-512.png', dir: 'public', width: 512, height: 512, purpose: 'web app manifest / PWA' },
  { file: 'apple-touch-icon.png', dir: 'public', width: 180, height: 180, purpose: 'iOS home screen' },
  { file: 'icon.png', dir: 'build', width: 1024, height: 1024, purpose: 'electron-builder .ico/.icns source' },
];

/** File name of the Windows ICO derived from `build/icon.png` for NSIS. */
export const BUILD_ICO_FILE = 'icon.ico';

/**
 * Convert the generated desktop PNG into a Windows ICO.
 *
 * Injectable so unit tests can supply a deterministic stub instead of shelling
 * out to electron-builder's icons toolset (which downloads a toolchain).
 */
export type IcoConverter = (sourcePng: string, outFile: string) => Promise<void>;

/**
 * Default ICO converter — reuses electron-builder's own icon toolset so the
 * NSIS installer/uninstaller icons are the same multi-size resource
 * electron-builder derives from `win.icon`.
 *
 * NSIS requires a real ICO container for `installerIcon`/`uninstallerIcon` (it
 * rejects a raw PNG as an "invalid icon file"), so `generate:icons` must emit
 * `build/icon.ico` before electron-builder runs.
 *
 * The deep import is intentional: `app-builder-lib` is electron-builder's
 * icon-conversion engine and is version-pinned by the `electron-builder`
 * dependency. It adds no new runtime dependency — `package*` would download
 * the icons toolset for `win.icon` regardless, and electron-builder caches it.
 */
async function convertPngToIco(sourcePng: string, outFile: string): Promise<void> {
  const { convertIcon } = await import('app-builder-lib/out/util/iconConverter.js');
  const outDir = dirname(outFile);
  mkdirSync(outDir, { recursive: true });
  const { icons } = await convertIcon({
    sources: [sourcePng],
    fallbackSources: [],
    roots: [ROOT],
    format: 'ico',
    outDir,
  });
  const produced = icons[0]?.file;
  if (!produced || !existsSync(produced)) {
    throw new Error(`Icon conversion produced no .ico for ${sourcePng}`);
  }
  if (resolve(produced) !== resolve(outFile)) {
    renameSync(produced, outFile);
  }
}

export interface GenerateAppIconsOptions {
  /** Path to the source-of-truth emblem SVG. */
  sourceSvg?: string;
  /** Directory for committed web PNGs. */
  publicDir?: string;
  /** Directory for the generated Electron resource. */
  buildDir?: string;
  /** Optional progress logger (defaults to `console.log`; pass a no-op in tests). */
  log?: (message: string) => void;
  /** Override the Windows ICO converter (tests inject a deterministic stub). */
  icoConverter?: IcoConverter;
}

export interface GenerateAppIconsResult {
  /** Absolute path of every artefact written: the PNG targets, then the derived Windows ICO. */
  written: string[];
}

/**
 * Rasterise the emblem SVG into every app-icon artefact.
 *
 * The source SVG is rendered at a device-pixel density that keeps the small
 * favicon sizes crisp (rather than upscaling a 72-dpi raster of the 64x64
 * intrinsic viewBox), then resized with `fit: 'contain'` onto a transparent
 * square canvas.
 *
 * @throws Error when the source SVG does not exist, or when the injected/real
 *   ICO converter fails (fail loudly rather than silently shipping a
 *   stale/absent icon or an NSIS-incompatible PNG).
 */
export async function generateAppIcons(
  options: GenerateAppIconsOptions = {},
): Promise<GenerateAppIconsResult> {
  const sourceSvg = options.sourceSvg ?? DEFAULT_SOURCE_SVG;
  const publicDir = options.publicDir ?? join(ROOT, 'public');
  const buildDir = options.buildDir ?? join(ROOT, 'build');
  const log = options.log ?? ((message: string) => console.log(message));

  if (!existsSync(sourceSvg)) {
    throw new Error(
      `App icon source SVG not found: ${sourceSvg}\n` +
        `Expected the tracked tableau emblem at public/favicon.svg.`,
    );
  }

  const readSvg = await import('fs').then((fs) => fs.readFileSync(sourceSvg));
  const written: string[] = [];

  for (const target of APP_ICON_TARGETS) {
    const outDir = target.dir === 'build' ? buildDir : publicDir;
    mkdirSync(outDir, { recursive: true });
    const outPath = join(outDir, target.file);

    // Render at a density high enough to hit the target size natively.
    const density = Math.max(72, Math.round((Math.max(target.width, target.height) / 64) * 72));
    const buffer = await sharp(readSvg, { density })
      .resize(target.width, target.height, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer();

    // Write the deterministic buffer (so a re-run is byte-identical).
    await sharp(buffer).png({ compressionLevel: 9 }).toFile(outPath);

    log(`  ${target.file.padEnd(22)} ${target.width}x${target.height}  ${target.purpose}`);
    written.push(outPath);
  }

  // NSIS rejects a PNG for installerIcon/uninstallerIcon (it needs a real ICO
  // container), so derive `build/icon.ico` from the desktop PNG here — before
  // electron-builder runs — rather than handing it the PNG.
  const desktopPng = APP_ICON_TARGETS.find((target) => target.dir === 'build');
  if (!desktopPng) {
    throw new Error('No desktop (build/) icon target is defined.');
  }
  const icoPath = join(buildDir, BUILD_ICO_FILE);
  const convertIco = options.icoConverter ?? convertPngToIco;
  await convertIco(join(buildDir, desktopPng.file), icoPath);
  log(`  ${BUILD_ICO_FILE.padEnd(22)} multi-size   NSIS installer/uninstaller icon`);
  written.push(icoPath);

  return { written };
}

/** Parse `--flag value` / `--flag=value` CLI arguments. */
function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const eq = token.indexOf('=');
    if (eq !== -1) {
      args[token.slice(2, eq)] = token.slice(eq + 1);
    } else {
      args[token.slice(2)] = argv[i + 1] ?? '';
      i += 1;
    }
  }
  return args;
}

function resolvePath(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  return isAbsolute(value) ? value : resolve(process.cwd(), value);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const sourceSvg = resolvePath(args.source, DEFAULT_SOURCE_SVG);
  const publicDir = resolvePath(args['public-dir'], join(ROOT, 'public'));
  const buildDir = resolvePath(args['build-dir'], join(ROOT, 'build'));

  console.log('Generating app icons from tableau emblem…');
  console.log(`  source: ${sourceSvg}`);

  const { written } = await generateAppIcons({ sourceSvg, publicDir, buildDir });

  console.log(`Generated ${written.length} icon artefact(s).`);
}

// Only run when invoked as a script, not when imported by tests.
if (process.argv[1] && resolve(process.argv[1]) === resolve(__filename)) {
  main().catch((err: unknown) => {
    console.error('Fatal error:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
