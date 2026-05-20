import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('GymHandPileScene spacing slider presence', () => {
  it('source contains createSpacingSlider and setSpacing usage', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../../example-games/gym/scenes/GymHandPileScene.ts'), 'utf-8');
    expect(source).toContain('createSpacingSlider');
    expect(source).toContain('setSpacing(');
    expect(source).toContain('CARD_W');
  });
});
