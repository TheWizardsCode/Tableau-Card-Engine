import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import sharp from 'sharp';
import { execSync } from 'child_process';

const ROOT = join(__dirname, '..', '..');
const SOURCE_DIR = join(ROOT, 'data', 'screenshots', 'main-street');
const OUT_PATH = join(ROOT, 'public', 'assets', 'games', 'main-street', 'thumbnail.png');

describe('generate-thumbnail script (main-street)', () => {
  beforeAll(async () => {
    // Ensure a clean environment
    try { rmSync(SOURCE_DIR, { recursive: true, force: true }); } catch {}
    try { rmSync(join(ROOT, 'public', 'assets', 'games', 'main-street'), { recursive: true, force: true }); } catch {}

    mkdirSync(SOURCE_DIR, { recursive: true });

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
    try { rmSync(join(ROOT, 'public', 'assets', 'games', 'main-street'), { recursive: true, force: true }); } catch {}
    try { rmSync(SOURCE_DIR, { recursive: true, force: true }); } catch {}
  });

  it('produces a 120x68 thumbnail in public assets', () => {
    // Run the generate-thumbnail script
    execSync('npx tsx scripts/generate-thumbnail.ts main-street', { stdio: 'inherit' });

    expect(existsSync(OUT_PATH)).toBe(true);

    // Verify dimensions
    return sharp(OUT_PATH).metadata().then((meta) => {
      expect(meta.width).toBe(120);
      expect(meta.height).toBe(68);
    });
  });
});
