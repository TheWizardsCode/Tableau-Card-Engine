/**
 * Unit coverage for the `public/` snapshot helper (CG-0MWW8D6N6006ZR49).
 *
 * The helper is the isolation seam the electron build-output tests rely on, so
 * its two guarantees are asserted directly: the snapshot is a real copy (no
 * reads through the shared tree, no dangling-link failures) and cleanup always
 * removes the temp dir.
 */
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createPublicSnapshot, DEFAULT_PUBLIC_DIR } from './public-snapshot';

/** Temp dirs created by a fixture; cleaned up even when an assertion throws. */
const fixtureDirs: string[] = [];

afterEach(() => {
  for (const dir of fixtureDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

/** Build a small `public/`-shaped fixture (root files + a nested assets tree). */
function makePublicFixture(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tce-public-fixture-'));
  fixtureDirs.push(dir);
  fs.writeFileSync(path.join(dir, 'favicon.svg'), '<svg id="favicon" />');
  fs.writeFileSync(path.join(dir, '404.html'), '<link rel="icon" href="favicon.svg" />');
  fs.mkdirSync(path.join(dir, 'assets', 'cards'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'assets', 'cards', 'card.txt'), 'card-face');
  return dir;
}

describe('createPublicSnapshot', () => {
  it('copies the whole tree into a fresh temp dir and removes it on cleanup', () => {
    const source = makePublicFixture();
    const snapshot = createPublicSnapshot({ sourceDir: source, prefix: 'tce-public-test-' });
    try {
      expect(snapshot.publicDir).not.toBe(source);
      expect(snapshot.publicDir.startsWith(os.tmpdir())).toBe(true);
      expect(fs.readFileSync(path.join(snapshot.publicDir, 'favicon.svg'), 'utf-8')).toBe(
        '<svg id="favicon" />',
      );
      expect(fs.readFileSync(path.join(snapshot.publicDir, '404.html'), 'utf-8')).toContain(
        'favicon.svg',
      );
      expect(
        fs.readFileSync(path.join(snapshot.publicDir, 'assets', 'cards', 'card.txt'), 'utf-8'),
      ).toBe('card-face');
    } finally {
      snapshot.cleanup();
    }
    expect(fs.existsSync(snapshot.publicDir)).toBe(false);
  });

  it('dereferences symlinked content so the snapshot never reads through the shared tree', () => {
    const source = makePublicFixture();
    fs.symlinkSync(
      path.join(source, 'assets', 'cards'),
      path.join(source, 'assets', 'linked-cards'),
      'dir',
    );
    const snapshot = createPublicSnapshot({ sourceDir: source, prefix: 'tce-public-test-' });
    try {
      const linked = path.join(snapshot.publicDir, 'assets', 'linked-cards');
      expect(fs.lstatSync(linked).isSymbolicLink()).toBe(false);
      // Detaching the source must not affect the snapshot.
      fs.rmSync(path.join(source, 'assets', 'cards'), { recursive: true, force: true });
      expect(fs.readFileSync(path.join(linked, 'card.txt'), 'utf-8')).toBe('card-face');
    } finally {
      snapshot.cleanup();
    }
  });

  it('copies a dangling composed link faithfully instead of failing', () => {
    const source = makePublicFixture();
    fs.symlinkSync(
      path.join(source, 'missing-sibling', 'assets', 'cards'),
      path.join(source, 'assets', 'gone-cards'),
      'dir',
    );
    const snapshot = createPublicSnapshot({ sourceDir: source, prefix: 'tce-public-test-' });
    try {
      const gone = path.join(snapshot.publicDir, 'assets', 'gone-cards');
      expect(fs.lstatSync(gone).isSymbolicLink()).toBe(true);
      // The live parts of the tree still made it across.
      expect(fs.readFileSync(path.join(snapshot.publicDir, 'favicon.svg'), 'utf-8')).toContain(
        'favicon',
      );
    } finally {
      snapshot.cleanup();
    }
    expect(fs.existsSync(snapshot.publicDir)).toBe(false);
  });

  it('terminates on a symlink cycle instead of recursing forever', () => {
    const source = makePublicFixture();
    fs.symlinkSync(source, path.join(source, 'assets', 'loop'), 'dir');
    const snapshot = createPublicSnapshot({ sourceDir: source, prefix: 'tce-public-test-' });
    try {
      expect(fs.readFileSync(path.join(snapshot.publicDir, 'favicon.svg'), 'utf-8')).toContain(
        'favicon',
      );
    } finally {
      snapshot.cleanup();
    }
  });

  it('cleanup is idempotent', () => {
    const snapshot = createPublicSnapshot({ sourceDir: makePublicFixture(), prefix: 'tce-public-test-' });
    snapshot.cleanup();
    expect(() => snapshot.cleanup()).not.toThrow();
  });

  it('snapshots the real repo public tree, including the icon/manifest files', () => {
    const snapshot = createPublicSnapshot();
    try {
      expect(fs.existsSync(path.join(DEFAULT_PUBLIC_DIR, 'favicon.svg'))).toBe(true);
      for (const file of ['favicon.svg', 'apple-touch-icon.png', 'icon-192.png', '404.html']) {
        expect(fs.existsSync(path.join(snapshot.publicDir, file)), `${file} missing`).toBe(true);
      }
    } finally {
      snapshot.cleanup();
    }
  });
});
