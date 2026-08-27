import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';

describe('Main Street card generator: synergy icons smoke', () => {
  it('generates card SVGs with inline synergy icon or fallback', () => {
    // run generator
    execSync('node scripts/generate-main-street-card-svgs.mjs', { stdio: 'inherit' });

    const outDir = path.resolve('public/assets/games/main-street/svg/cards');
    const files = fs.readdirSync(outDir).filter(f => f.endsWith('.svg'));
    expect(files.length).toBeGreaterThan(0);

    // find a card that has a synergy (first one)
    const sample = files[0];
    const content = fs.readFileSync(path.join(outDir, sample), 'utf8');

    // Expect either an inlined icon group or a fallback circle to be present
    const hasIconGroup = content.includes('class="ms-synergy-icon"') || content.includes('ms-synergy-icon');
    const hasFallback = content.includes('ms-synergy-fallback') || content.includes('ms-synergy-fallback"');

    expect(hasIconGroup || hasFallback).toBe(true);

    // Ensure the textual synergy label is not present (we now show only the icon).
    // Legacy label was `<text x="8" ... font-size="9">Synergy</text>`; the raw
    // `includes('x="8"')` check collides with unrelated attributes in modern SVG
    // output (icon eye circles `x="8"`, the `-X/turn` ongoing-cost label which
    // shares font-size="9" with the runtime generator), so look for a *text*
    // element positioned at x="8" instead.
    expect(/<text[^>]*x="8"/.test(content)).toBe(false);

    // Also check that aria-label for the card title is present
    expect(content).toMatch(/aria-label=".+"/);
  });
});
