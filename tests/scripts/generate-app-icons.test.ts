/**
 * Unit tests for the app-icon generator (scripts/generate-app-icons.ts)
 * — CG-0MUTTXRWZ009NUB9 / CG-0MUU3Q3C8007AGQ5 / CG-0MUWQJ279009KBMM.
 *
 * The generator rasterises the tracked tableau-emblem SVG
 * (`public/favicon.svg`) into every web and desktop icon binary, so the
 * variants can never drift from the single source of truth. These tests pin
 * the observable contract the icon pipeline depends on:
 *   - a run writes each expected PNG artefact (signature + exact dimensions),
 *   - it derives a Windows ICO (`build/icon.ico`) for the NSIS
 *     installer/uninstaller (NSIS rejects a PNG for those keys),
 *   - it is idempotent (a second run produces identical bytes),
 *   - it fails loudly when the source SVG is missing, and
 *   - a converter failure propagates rather than shipping a missing ICO,
 *   - the output directories are overridable (tests never touch the repo).
 *
 * The ICO converter is injected as a deterministic stub so the suite never
 * downloads electron-builder's icons toolset.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import sharp from 'sharp';
import {
  APP_ICON_TARGETS,
  BUILD_ICO_FILE,
  generateAppIcons,
  type IcoConverter,
} from '../../scripts/generate-app-icons';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SOURCE_SVG = path.join(REPO_ROOT, 'public', 'favicon.svg');
/** Silent logger so the test output is not polluted by per-file progress. */
const NO_LOG = () => {};

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
/** ICO `ICONDIR` header: reserved=0, type=1 (icon), image count. */
const ICO_SIGNATURE = Buffer.from([0x00, 0x00, 0x01, 0x00]);

/** Minimal structurally-valid ICO written by the injected test converter. */
const FAKE_ICO = Buffer.concat([
  ICO_SIGNATURE,
  Buffer.from([0x01, 0x00]), // one image
  Buffer.alloc(16), // a single (zeroed) ICONDIRENTRY
]);

interface StubConverter {
  converter: IcoConverter;
  calls: Array<{ sourcePng: string; outFile: string }>;
}

/** Deterministic stand-in for electron-builder's icon toolset (no network). */
function stubIcoConverter(): StubConverter {
  const calls: StubConverter['calls'] = [];
  const converter: IcoConverter = async (sourcePng, outFile) => {
    calls.push({ sourcePng, outFile });
    fs.writeFileSync(outFile, FAKE_ICO);
  };
  return { converter, calls };
}

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
    const result = await generateAppIcons({
      sourceSvg: SOURCE_SVG,
      publicDir,
      buildDir,
      log: NO_LOG,
      icoConverter: stubIcoConverter().converter,
    });

    // Every declared PNG target, plus the derived Windows ICO.
    expect(result.written.length).toBe(APP_ICON_TARGETS.length + 1);
    for (const target of APP_ICON_TARGETS) {
      const file = path.join(target.dir === 'build' ? buildDir : publicDir, target.file);
      expect(fs.existsSync(file), `${target.file} must exist`).toBe(true);
      const size = await readPngSize(file);
      expect(size.width, `${target.file} width`).toBe(target.width);
      expect(size.height, `${target.file} height`).toBe(target.height);
    }
  });

  it('derives a Windows ICO from the desktop PNG and reports it', async () => {
    const { converter, calls } = stubIcoConverter();
    const result = await generateAppIcons({
      sourceSvg: SOURCE_SVG,
      publicDir,
      buildDir,
      log: NO_LOG,
      icoConverter: converter,
    });

    const icoPath = path.join(buildDir, BUILD_ICO_FILE);
    // The ICO must be converted from the generated 1024px desktop PNG.
    expect(calls).toEqual([{ sourcePng: path.join(buildDir, 'icon.png'), outFile: icoPath }]);
    expect(result.written).toContain(icoPath);
    const bytes = fs.readFileSync(icoPath);
    expect(bytes.subarray(0, 4).equals(ICO_SIGNATURE), `${icoPath} must be an ICO`).toBe(true);
  });

  it('only writes into the provided output directories', async () => {
    // A run targeting temp dirs must not touch the repo's own build/ output
    // (where electron-builder resources live). The temp dirs are the sole
    // writers; the committed public/ PNGs are generated separately by the
    // `generate:icons` npm script and are intentionally tracked.
    const repoBuildIcon = path.join(REPO_ROOT, 'build', 'icon.png');
    const existedBefore = fs.existsSync(repoBuildIcon);
    const bytesBefore = existedBefore ? fs.readFileSync(repoBuildIcon) : null;

    await generateAppIcons({
      sourceSvg: SOURCE_SVG,
      publicDir,
      buildDir,
      log: NO_LOG,
      icoConverter: stubIcoConverter().converter,
    });

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
    const run = async (): Promise<Buffer[]> => {
      const { written } = await generateAppIcons({
        sourceSvg: SOURCE_SVG,
        publicDir,
        buildDir,
        log: NO_LOG,
        icoConverter: stubIcoConverter().converter,
      });
      return written.map((file) => fs.readFileSync(file));
    };

    const firstPass = await run();
    const secondPass = await run();

    expect(secondPass.length).toBe(firstPass.length);
    for (let i = 0; i < firstPass.length; i += 1) {
      expect(secondPass[i].equals(firstPass[i]), `artefact #${i}`).toBe(true);
    }
  });

  it('throws an actionable error when the source SVG is missing', async () => {
    const missing = path.join(tmpDir, 'does-not-exist.svg');
    await expect(
      generateAppIcons({
        sourceSvg: missing,
        publicDir,
        buildDir,
        log: NO_LOG,
        icoConverter: stubIcoConverter().converter,
      }),
    ).rejects.toThrow(/source.*(not found|missing)/i);
  });

  it('propagates an ICO conversion failure rather than shipping no ICO', async () => {
    const failing: IcoConverter = async () => {
      throw new Error('icons toolset unavailable');
    };
    await expect(
      generateAppIcons({
        sourceSvg: SOURCE_SVG,
        publicDir,
        buildDir,
        log: NO_LOG,
        icoConverter: failing,
      }),
    ).rejects.toThrow(/icons toolset unavailable/);
  });
});
