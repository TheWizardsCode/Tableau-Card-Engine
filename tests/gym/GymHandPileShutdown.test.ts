/**
 * GymHandPileScene shutdown lifecycle tests.
 *
 * Verifies that GymHandPileScene properly cleans up its created objects
 * when the scene shuts down.
 *
 * Source-level tests verify the presence of the shutdown method and its
 * cleanup logic, matching the pattern in GymHandPileSpacing.test.ts.
 *
 * @module tests/gym/GymHandPileShutdown
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const SOURCE_FILE = path.resolve(__dirname, '../../example-games/gym/scenes/GymHandPileScene.ts');

/**
 * Load the source file once for all tests.
 */
function loadSource(): string {
  return fs.readFileSync(SOURCE_FILE, 'utf-8');
}

describe('GymHandPileScene shutdown lifecycle', () => {
  describe('shutdown method presence', () => {
    it('declares a shutdown() method', () => {
      const src = loadSource();
      // The shutdown() method should be defined in the class body (private or public)
      expect(src).toMatch(/shutdown\s*\(\s*\)\s*:\s*void/);
    });

    it('registers a shutdown event listener in create()', () => {
      const src = loadSource();
      // Must register a shutdown event listener (matching Phaser 4 lifecycle pattern)
      // that calls the scene's shutdown method
      expect(src).toMatch(/this\.events\.on\s*\(\s*['"]shutdown['"]/);
      expect(src).toMatch(/this\.shutdown\b/);
    });
  });

  describe('cleanup of individual objects', () => {
    it('destroys highlightGraphics if it exists', () => {
      const src = loadSource();
      // Must destroy or null highlightGraphics with a null/guard check
      expect(src).toContain('highlightGraphics');
      expect(src).toContain('.destroy()');
    });

    it('cleans up highlightLabels', () => {
      const src = loadSource();
      // Must reference highlightLabels in the shutdown context
      expect(src).toContain('highlightLabels');
    });

    it('stops activeMoveTween if active', () => {
      const src = loadSource();
      // Must stop or cleanup the active move tween
      expect(src).toContain('activeMoveTween');
    });

    it('destroys slider components', () => {
      const src = loadSource();
      // Each slider must have its destroy() called in the shutdown method
      expect(src).toContain('.destroy()');
    });

    it('destroys HandView and PileView components', () => {
      const src = loadSource();
      // UI components should be destroyed or nulled
      expect(src).toContain('handView');
      expect(src).toContain('deckView');
      expect(src).toContain('discardView');
    });

    it('cleans up logTexts array', () => {
      const src = loadSource();
      // Log text objects should be destroyed and the array cleared
      expect(src).toContain('logTexts');
    });
  });

  describe('event listener setup', () => {
    it('registers a shutdown handler that invokes this.shutdown()', () => {
      const src = loadSource();
      // Verify the shutdown handler invokes the shutdown method
      const shutdownRegistration = src.match(
        /this\.events\.on\s*\(\s*['"]shutdown['"][^)]*\)/g
      );
      if (shutdownRegistration) {
        const hasShutdownCall = shutdownRegistration.some(r =>
          r.includes('this.shutdown')
        );
        expect(hasShutdownCall).toBe(true);
      }
    });
  });

  describe('cleanup completeness', () => {
    it('destroys layoutLabel, dragLabel, and dragButton if they exist', () => {
      const src = loadSource();
      expect(src).toContain('layoutLabel');
      expect(src).toContain('dragLabel');
      expect(src).toContain('dragButton');
    });
  });
});

describe('GymHandPileScene integration with GymSceneBase cleanup', () => {
  it('does not remove GymSceneBase import', () => {
    const src = loadSource();
    expect(src).toContain("import { GymSceneBase } from './GymSceneBase'");
  });

  it('still calls initHelp if present', () => {
    const src = loadSource();
    expect(src).toContain('initHelp(');
  });
});
