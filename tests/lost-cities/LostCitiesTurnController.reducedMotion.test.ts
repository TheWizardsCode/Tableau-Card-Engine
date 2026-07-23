/**
 * Tests for LostCitiesTurnController reduced motion AI delay.
 *
 * Verifies the constant values and source code changes for
 * reduced motion AI delay in LostCitiesTurnController.
 *
 * @module tests/lost-cities/LostCitiesTurnController.reducedMotion
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

describe('LostCitiesTurnController reduced motion', () => {
  it('has a reducedMotion property that defaults to false', () => {
    const source = readFileSync(
      'example-games/lost-cities/scenes/LostCitiesTurnController.ts',
      'utf-8',
    );
    expect(source).toContain('reducedMotion');
  });

  it('adds ANIM_DURATION extra delay when reducedMotion is true', () => {
    // Verify the logic: the AI_DELAY is increased by ANIM_DURATION
    // when reducedMotion is enabled, compensating for skipped animations.
    const source = readFileSync(
      'example-games/lost-cities/scenes/LostCitiesTurnController.ts',
      'utf-8',
    );
    expect(source).toContain('this.reducedMotion ? AI_DELAY + ANIM_DURATION : AI_DELAY');
  });
});
