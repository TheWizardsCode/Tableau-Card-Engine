import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('GymHandPileScene rotation slider presence', () => {
  it('scene source contains createRotationSlider and setMaxRotationDegrees usage', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../../example-games/gym/scenes/GymHandPileScene.ts'), 'utf-8');
    expect(source).toContain('createRotationSlider');
    expect(source).toContain('setMaxRotationDegrees(');
  });

  it('HandView exposes setMaxRotationDegrees and applies rotation to sprites', () => {
    const hv = fs.readFileSync(path.resolve(__dirname, '../../src/ui/HandView.ts'), 'utf-8');
    expect(hv).toContain('setMaxRotationDegrees');
    // Check that rotation is applied to sprites (radians assignment)
    expect(hv).toMatch(/\.rotation\s*=|\.rotation\s*=/);
  });
});
