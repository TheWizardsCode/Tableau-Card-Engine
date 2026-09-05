/**
 * Sold-Card Tooltip String Assertion Tests
 *
 * Guards the sold-card tooltip copy at MainStreetRenderer.ts against
 * regressing to the old "no longer produces income or synergy" claim.
 *
 * The sold-business semantics (CG-0MT5XUE2200047IJ, CG-0MTFS4PP40064GHE):
 * a sold business produces 0 income/reputation for itself, but still acts
 * as a synergy anchor for adjacent businesses. The tooltip must reflect
 * that — it must NOT claim synergy stops.
 *
 * @module
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Source file containing the street-grid sold-card tooltip string. */
const RENDERER_PATH = resolve(
  __dirname,
  '../../example-games/main-street/scenes/MainStreetRenderer.ts',
);

const rendererSource = readFileSync(RENDERER_PATH, 'utf8');

/** The exact synergy-anchor line currently emitted for sold cards. */
const SOLD_TOOLTIP_LINE =
  'This card no longer produces income, but still provides synergy to adjacent businesses.';

describe('Main Street sold-card tooltip (CG-0MTFS4PP40064GHE)', () => {
  it('no longer claims synergy stops for a sold card', () => {
    expect(rendererSource).not.toContain(
      'no longer produces income or synergy',
    );
  });

  it('states the sold card still provides synergy to adjacent businesses', () => {
    expect(rendererSource).toContain(SOLD_TOOLTIP_LINE);
  });
});
