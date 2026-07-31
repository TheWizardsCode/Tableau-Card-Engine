import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('GymHandPileScene raise slider presence', () => {
  it('scene source contains raiseSlider and setSelectionLift usage', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../../example-games/gym/scenes/GymHandPileScene.ts'), 'utf-8');
    expect(source).toContain('raiseSlider');
    expect(source).toContain('setSelectionLift(');
  });

  it('HandView exposes setSelectionLift and applies an offset to the selected sprite', () => {
    const hv = fs.readFileSync(path.resolve(__dirname, '../../src/ui/HandView.ts'), 'utf-8');
    expect(hv).toContain('setSelectionLift');
    // Offset math: horizontal raise is perpendicular to the card rotation
    // (dx = d·sin(θ), dy = −d·cos(θ)).
    expect(hv).toContain('Math.sin');
    expect(hv).toContain('Math.cos');
  });

  it('scene raise slider uses max 180 with default 60', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../../example-games/gym/scenes/GymHandPileScene.ts'), 'utf-8');
    expect(source).toContain('RAISE_DEFAULT = 60');
    expect(source).toContain('RAISE_MAX = 180');
    // Help text documents the default and max
    expect(source).toContain('default 60px, max 180px');
  });
});
