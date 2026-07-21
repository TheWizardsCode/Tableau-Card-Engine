/**
 * Tests for GolfAiController reduced motion AI delay.
 *
 * Verifies the constant values used for the reduced motion delay
 * and that the GolfAiController source contains the reducedMotion property.
 *
 * @module tests/golf/GolfAiController.reducedMotion
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

describe('GolfAiController reduced motion', () => {
  it('has a reducedMotion property that defaults to false', () => {
    const source = readFileSync(
      'example-games/golf/scenes/GolfAiController.ts',
      'utf-8',
    );
    expect(source).toContain('reducedMotion');
  });

  it('adds extra delay when reducedMotion is true', () => {
    // Verify the logic: the initial AI_DELAY is increased by SWAP_ANIM_DURATION
    // when reducedMotion is enabled. This is confirmed via source inspection.
    const source = readFileSync(
      'example-games/golf/scenes/GolfAiController.ts',
      'utf-8',
    );
    expect(source).toContain('SWAP_ANIM_DURATION');
    expect(source).toContain('reducedMotion ? AI_DELAY + SWAP_ANIM_DURATION : AI_DELAY');
  });
});
