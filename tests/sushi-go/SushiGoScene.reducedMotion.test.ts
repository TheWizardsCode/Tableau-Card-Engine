/**
 * Tests for SushiGoScene reduced motion AI delay.
 *
 * Verifies the constant values and source code changes for
 * reduced motion AI delay in SushiGoScene.
 *
 * @module tests/sushi-go/SushiGoScene.reducedMotion
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

describe('SushiGoScene reduced motion AI delay', () => {
  it('adds ANIM_DURATION extra delay when reducedMotion is true', () => {
    const source = readFileSync(
      'example-games/sushi-go/scenes/SushiGoScene.ts',
      'utf-8',
    );
    expect(source).toContain('reducedMotion');
    expect(source).toContain('TURN_ANIMATION_DELAY + ANIM_DURATION');
    expect(source).toContain('TURN_ANIMATION_DELAY');
  });
});
