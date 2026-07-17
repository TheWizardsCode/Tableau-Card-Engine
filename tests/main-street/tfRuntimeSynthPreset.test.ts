import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('tf runtime synth generation presets', () => {
  it('uses tuned movement and transfer-family presets', () => {
    const scriptPath = resolve(process.cwd(), 'scripts/tf-generate-synths.sh');
    const script = readFileSync(scriptPath, 'utf8');

    expect(script).toContain('function movementVoice(durationMs = 1500)');
    expect(script).toContain('const output = gainNode(0.28125);');
    expect(script).toContain("noise: { type: 'brown' }");
    expect(script).toContain("new Tone.Filter(1100, 'lowpass')");
    expect(script).toContain('output.gain.value = clamp(v);');

    expect(script).toContain("'construction-hammer': () => constructionHammerVoice()");
    expect(script).toContain("'construction-saw': () => constructionSawVoice()");
    expect(script).toContain("'construction-lite-hammer': () => constructionHammerVoice({ lite: true })");
    expect(script).toContain("'construction-lite-saw': () => constructionSawVoice({ lite: true })");
    expect(script).toContain("'crowd-cheer': () => crowdCheerVoice()");
  });
});
