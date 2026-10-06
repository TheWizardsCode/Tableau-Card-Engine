/**
 * Structural contract for the committed ToneForge runtime synth module
 * (engine item CG-0MUTU0MFE0077H0F).
 *
 * ## Corrected root-cause note (CG-0MUU9PSWI005EZ56)
 *
 * A first investigation (child CG-0MUU9PPA3003S1S4) concluded, from a
 * Node-only reproduction, that the module's `new Tone.Gain(clamp(v))`
 * positional voice construction threw `param must be an AudioParam` and that
 * every factory was therefore unplayable. **That conclusion was a
 * Node-environment artefact, not a runtime defect.**
 *
 * In Node there is no real Web Audio context, so `Tone.context.createGain()`
 * does not return an `AudioParam` and Tone.js's `Param` assertion fails for
 * *any* `Gain` construction (positional, options-object or no-arg alike).
 * In a **real browser** every committed factory constructs a voice
 * successfully. The real-browser proof lives in
 * `tests/core-engine/tf-runtime-integration.browser.test.ts`, and the real
 * scene attaches an active synth player (`isSynthActive() === true`,
 * 12 factories, no load error).
 *
 * This Node-scoped test therefore asserts only the **environment-independent
 * structural contract** — the module ships the expected factory keys and the
 * player's key resolution works — and never asserts that factory construction
 * throws (that would encode the environment artefact as a requirement).
 */

import { describe, it, expect } from 'vitest';

import * as runtimeSynth from '../../src/core-engine/tf-runtime/main-street-runtime-synth.mjs';
import { createTfPlayer } from '../../src/core-engine/tfAdapter';

/** Every synth factory key shipped by the committed runtime module. */
const RUNTIME_FACTORY_KEYS = [
  'card-draw',
  'card-slide',
  'card-place',
  'card-discard',
  'card-coin-collect',
  'ui-notification-chime',
  'card-table-ambience',
  'construction-hammer',
  'construction-saw',
  'construction-lite-hammer',
  'construction-lite-saw',
  'crowd-cheer',
] as const;

describe('ToneForge runtime synth module structure', () => {
  it('exposes exactly the expected synth factory keys', () => {
    const actual = Object.keys(runtimeSynth.factories ?? {}).sort();
    expect(actual).toEqual([...RUNTIME_FACTORY_KEYS].sort());
  });

  it('exposes a factory function and a descriptor for every expected key', () => {
    for (const key of RUNTIME_FACTORY_KEYS) {
      expect(typeof runtimeSynth.factories?.[key]).toBe('function');
      expect(runtimeSynth.descriptors?.[key]).toBeDefined();
    }
  });

  it('resolves logical keys through the player mapping and reports missing factories', () => {
    // A missing factory must be reported by the adapter rather than silently
    // dropped (the missing-factory silent-drop defect is tracked separately
    // under CG-0MUU9PSWC009CW76).
    const warnings: string[] = [];
    const player = createTfPlayer(runtimeSynth.TF_RUNTIME_MODULE, {
      keyMap: { 'sfx-unknown': 'no-such-factory' },
      logger: { warn: (message: string) => warnings.push(message) },
    });

    player.play('sfx-unknown');

    expect(warnings.some((warning) => warning.includes('no-such-factory'))).toBe(true);
  });
});
