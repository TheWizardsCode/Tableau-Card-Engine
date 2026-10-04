/**
 * Unit tests for the app-icon generator (scripts/generate-app-icons.ts)
 * — CG-0MUTTXRWZ009NUB9 / CG-0MUU3Q3C8007AGQ5.
 *
 * The generator rasterises the tracked tableau-emblem SVG
 * (`public/favicon.svg`) into every web and desktop icon binary, so the
 * variants can never drift from the single source of truth. These tests pin
 * the observable contract the icon pipeline depends on:
 *   - a run writes each expected artefact (PNG signature + exact dimensions),
 *   - it is idempotent (a second run produces identical bytes),
 *   - it fails loudly when the source SVG is missing, and
 *   - the output directories are overridable (tests never touch the repo).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import sharp from 'sharp';
import { APP_ICON_TARGETS, generateAppIcons } from '../../scripts/generate-app-icons';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SOURCE_SVG = path.join(REPO_ROOT, 'public', 'favicon.svg');
/** Silent logger so the test output is not polluted by per-file progress. */
const NO_LOG = () => {};

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

interface Size {
  width: number;
  height: number;
}

/** Read a PNG's dimensions and assert the file starts with the PNG signature. */
async function readPngSize(file: string): Promise<Size> {
  const buffer = fs.readFileSync(file);
  expect(buffer.subarray(0, 8).equals(PNG_SIGNATURE), `${file} must be a PNG`).toBe(true);
  const metadata = await sharp(buffer).metadata();
  return { width: metadata.width ?? 0, height: metadata.height ?? 0 };
}

describe('generateAppIcons', () => {
  let tmpDir: string;
  let publicDir: string;
  let buildDir: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-icons-test-'));
    publicDir = path.join(tmpDir, 'public');
    buildDir = path.join(tmpDir, 'build');
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writes every web and desktop icon artefact at its declared size', async () => {
    const result = await generateAppIcons({ sourceSvg: SOURCE_SVG, publicDir, buildDir, log: NO_LOG });

    expect(result.written.length).toBe(APP_ICON_TARGETS.length);
    for (const target of APP_ICON_TARGETS) {
      const file = path.join(target.dir === 'build' ? buildDir : publicDir, target.file);
      expect(fs.existsSync(file), `${target.file} must exist`).toBe(true);
      const size = await readPngSize(file);
      expect(size.width, `${target.file} width`).toBe(target.width);
      expect(size.height, `${target.file} height`).toBe(target.height);
    }
  });

  it('only writes into the provided output directories', async () => {
    // A run targeting temp dirs must not touch the repo's own build/ output
    // (where electron-builder resources live). The temp dirs are the sole
    // writers; the committed public/ PNGs are generated separately by the
    // `generate:icons` npm script and are intentionally tracked.
    const repoBuildIcon = path.join(REPO_ROOT, 'build', 'icon.png');
    const existedBefore = fs.existsSync(repoBuildIcon);
    const bytesBefore = existedBefore ? fs.readFileSync(repoBuildIcon) : null;

    await generateAppIcons({ sourceSvg: SOURCE_SVG, publicDir, buildDir, log: NO_LOG });

    const existedAfter = fs.existsSync(repoBuildIcon);
    // The run must neither create nor modify the repo build/ icon.
    expect(existedAfter).toBe(existedBefore);
    if (existedBefore && existedAfter) {
      expect(
        fs.readFileSync(repoBuildIcon).equals(bytesBefore as Buffer),
        'a temp-dir run must not modify the repo build/ icon',
      ).toBe(true);
    }
  });

  it('is idempotent — a second run produces byte-identical artefacts', async () => {
    await generateAppIcons({ sourceSvg: SOURCE_SVG, publicDir, buildDir, log: NO_LOG });
    const firstPass = APP_ICON_TARGETS.map((t) =>
      fs.readFileSync(path.join(t.dir === 'build' ? buildDir : publicDir, t.file)),
    );

    await generateAppIcons({ sourceSvg: SOURCE_SVG, publicDir, buildDir, log: NO_LOG });
    const secondPass = APP_ICON_TARGETS.map((t) =>
      fs.readFileSync(path.join(t.dir === 'build' ? buildDir : publicDir, t.file)),
    );

    for (let i = 0; i < APP_ICON_TARGETS.length; i += 1) {
      expect(secondPass[i].equals(firstPass[i]), `${APP_ICON_TARGETS[i].file}`).toBe(true);
    }
  });

  it('throws an actionable error when the source SVG is missing', async () => {
    const missing = path.join(tmpDir, 'does-not-exist.svg');
    await expect(
      generateAppIcons({ sourceSvg: missing, publicDir, buildDir, log: NO_LOG }),
    ).rejects.toThrow(/source.*(not found|missing)/i);
  });
});
