/**
 * Sold-Card Tooltip String Assertion Tests
 *
 * Guards the sold-card tooltip copy across the MainStreetRenderer* modules against
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
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Scene directory holding the renderer and its per-concern helper modules. */
const SCENES_DIR = resolve(
  __dirname,
  '../../example-games/main-street/scenes',
);

/**
 * Concatenated source of the renderer and all its extracted helper modules.
 * The sold-card tooltip copy may live in any of them after the
 * thin-class + helper-module decomposition (CG-0MUBOXTWJ0094CEX).
 */
const rendererSource = readdirSync(SCENES_DIR)
  .filter((f) => /^MainStreetRenderer.*\.ts$/.test(f))
  .map((f) => readFileSync(resolve(SCENES_DIR, f), 'utf8'))
  .join('\n');

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
