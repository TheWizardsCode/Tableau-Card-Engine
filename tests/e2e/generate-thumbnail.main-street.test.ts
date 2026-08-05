import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import sharp from 'sharp';
import { execSync } from 'child_process';

const ROOT = join(__dirname, '..', '..');
const SOURCE_DIR = join(ROOT, 'data', 'screenshots', 'main-street');
const OUT_PATH = join(ROOT, 'public', 'assets', 'games', 'main-street', 'thumbnail.png');

let originalThumbnail: Buffer | null = null;

describe('generate-thumbnail script (main-street)', () => {
  beforeAll(async () => {
    if (existsSync(OUT_PATH)) {
      originalThumbnail = readFileSync(OUT_PATH);
    }

    // Ensure a clean environment without touching tracked source assets.
    try { rmSync(SOURCE_DIR, { recursive: true, force: true }); } catch {}
    try { rmSync(OUT_PATH, { force: true }); } catch {}

    mkdirSync(SOURCE_DIR, { recursive: true });
    mkdirSync(join(ROOT, 'public', 'assets', 'games', 'main-street'), { recursive: true });

    // Create a dummy turn-000.png (larger than thumbnail size)
    const img = sharp({
      create: {
        width: 480,
        height: 272,
        channels: 3,
        background: { r: 60, g: 120, b: 180 },
      },
    });
    await img.png().toFile(join(SOURCE_DIR, 'turn-000.png'));
  });

  afterAll(() => {
    // cleanup generated files to avoid polluting repo working tree
    if (originalThumbnail) {
      writeFileSync(OUT_PATH, originalThumbnail);
    } else {
      try { rmSync(OUT_PATH, { force: true }); } catch {}
    }
    try { rmSync(SOURCE_DIR, { recursive: true, force: true }); } catch {}
  });

  it('produces a 120x68 thumbnail in public assets', () => {
    // Run the generate-thumbnail script
    // Generous timeout: the script boots a Phaser scene via Playwright headless,
    // which routinely takes 30-70s on CI-grade machines (see CG-0MSAZK0FF0069FY3).
    execSync('npx tsx scripts/generate-thumbnail.ts main-street', { stdio: 'inherit' });

    expect(existsSync(OUT_PATH)).toBe(true);

    // Verify dimensions
    return sharp(OUT_PATH).metadata().then((meta) => {
      expect(meta.width).toBe(120);
      expect(meta.height).toBe(68);
    });
  }, 120_000);
});
