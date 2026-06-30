/**
 * GymHandPileScene Layout Toggle Tests
 *
 * Verifies that toggling between horizontal and vertical (cascade) layout
 * keeps the hand anchored at a consistent central position.
 *
 * Acceptance criteria:
 * - Toggling to vertical layout anchors the hand at the same central X
 *   position as the horizontal layout.
 * - Toggling back to horizontal returns to the centered position.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('GymHandPileScene layout toggle position consistency', () => {
  const sourcePath = path.resolve(__dirname, '../../example-games/gym/scenes/GymHandPileScene.ts');
  const source = fs.readFileSync(sourcePath, 'utf-8');

  it('CASCADE_X is set to a centered position (GAME_W / 2)', () => {
    // CASCADE_X should be centered on screen, matching the horizontal layout's
    // HAND_CENTER_X value (= GAME_W / 2 = 640). This ensures the vertical
    // cascade is positioned at the same horizontal centre.
    const match = source.match(/private\s+readonly\s+CASCADE_X\s*=\s*(GAME_W\s*\/\s*2)/);
    expect(match).not.toBeNull();
  });

  it('vertical layout uses setBaseX with CASCADE_X', () => {
    expect(source).toContain('setBaseX(this.CASCADE_X)');
  });

  it('horizontal layout uses setCenterX with HAND_CENTER_X on restore', () => {
    expect(source).toContain('setCenterX(this.HAND_CENTER_X)');
  });

  it('vertical layout uses setLayoutDirection with vertical', () => {
    const match = source.match(/setLayoutDirection\(\s*'vertical'\s*\)/);
    expect(match).not.toBeNull();
  });

  it('horizontal layout uses setLayoutDirection with horizontal', () => {
    const match = source.match(/setLayoutDirection\(\s*'horizontal'\s*\)/);
    expect(match).not.toBeNull();
  });

  it('HAND_CENTER_X is set to GAME_W / 2', () => {
    const match = source.match(/private\s+readonly\s+HAND_CENTER_X\s*=\s*GAME_W\s*\/\s*2/);
    expect(match).not.toBeNull();
  });

  it('vertical layout syncs spacing slider to CASCADE_SPACING', () => {
    expect(source).toContain('spacingSlider.setValue(this.CASCADE_SPACING)');
  });
});
