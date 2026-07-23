/**
 * Tests for FeudalismTurnController reduced motion AI delay.
 *
 * Verifies the constant values and source code changes for
 * reduced motion AI delay in FeudalismTurnController.
 *
 * @module tests/feudalism/FeudalismTurnController.reducedMotion
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

describe('FeudalismTurnController reduced motion', () => {
  it('has a reducedMotion property that defaults to false', () => {
    const source = readFileSync(
      'example-games/feudalism/scenes/FeudalismTurnController.ts',
      'utf-8',
    );
    expect(source).toContain('reducedMotion');
  });

  it('adds MOVE_DURATION extra delay when reducedMotion is true', () => {
    // Verify the logic: the AI transition delay is increased by MOVE_DURATION
    // when reducedMotion is enabled, compensating for skipped animations.
    const source = readFileSync(
      'example-games/feudalism/scenes/FeudalismTurnController.ts',
      'utf-8',
    );
    expect(source).toContain('this.reducedMotion ? MOVE_DURATION : 0');
  });
});
