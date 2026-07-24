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

    // Ensure the textual synergy label is not present (we now show only the icon)
    expect(content.includes('x="8"') && content.includes('font-size="9"')).toBe(false);

    // Also check that aria-label for the card title is present
    expect(content).toMatch(/aria-label=".+"/);
  });
});
