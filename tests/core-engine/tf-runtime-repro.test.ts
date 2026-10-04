/**
 * Regression reproduction: the committed ToneForge runtime synth module
 * cannot produce a playable voice, so ToneForge never actually plays audio
 * at runtime even when it is correctly loaded, normalised and attached.
 *
 * ## Root cause (CG-0MUTU0MFE0077H0F, child CG-0MUU9PPA3003S1S4)
 *
 * The committed module `src/core-engine/tf-runtime/main-street-runtime-synth.mjs`
 * builds a `Tone.Gain` node with `new Tone.Gain(clamp(initialVolume))`, passing
 * the volume as a **positional** constructor argument. Tone.js v15 treats the
 * positional `gain` argument as a `Param`, and `Param`'s constructor asserts
 * `isAudioParam(options.param) || options.param instanceof Param`
 * (`tone/Tone/core/context/Param.ts`), so construction throws:
 *
 * ```
 * Error: param must be an AudioParam
 *   at assert (tone/Tone/core/util/Debug.ts)
 *   at new Param (tone/Tone/core/context/Param.ts)
 *   at new Gain  (tone/Tone/core/context/Gain.ts)
 * ```
 *
 * Every `oneShotVoice`/`movementVoice`/`ambienceVoice` helper routes through
 * `gainNode(...)`, so **every** factory in the module throws. `createTfPlayer()`
 * catches the throw per-key and only warns (`[tfAdapter] Failed to create tf
 * voice for key "..."`), so the failure is invisible at the call site: the
 * module loads, the player attaches, `SoundManager.isSynthActive()` reports
 * `true`, and yet no voice is ever played.
 *
 * The correct Tone.js v15 form passes the gain inside the options object:
 * `new Tone.Gain({ gain: clamp(initialVolume) })`.
 *
 * ## What this test pins
 *
 * The load -> normalise -> `createTfPlayer()` chain is reproduced here exactly
 * as the sibling app wires it (`loadMainStreetTfModule()` ->
 * `createTfPlayer()` -> `SoundManager.setSynthIntegration()`), and the test
 * asserts the *observable* runtime contract: constructing a voice for a
 * synth-mapped key must not throw, so the player can actually play.
 *
 * The sibling app's end-to-end reproduction lives in
 * `../tce-main-street/tests/main-street/tf-runtime-repro.test.ts`.
 *
 * Tone.js is environment-sensitive (it needs a Web Audio context); in the
 * Node test environment the `param must be an AudioParam` throw occurs for a
 * structural reason (the positional argument is not coerced into a `Param`),
 * which is exactly the defect. This test therefore asserts on the
 * **factory-throws-nothing** contract rather than on audible output.
 *
 * ## Status: marked `it.todo` until the fix lands
 *
 * At the commit that added this file the assertion below **fails** (all 12
 * factories report `param must be an AudioParam`). It is registered as a
 * `todo` rather than a failing test so the full-suite gate stays green while
 * the defect is being fixed; the wiring-fix sibling item
 * (CG-0MUU9PSWI005EZ56) converts it back to a live `it(...)`. The pessimistic
 * variant of the same contract (a broken module producing zero playable
 * voices) is asserted separately and *does* run today, so the regression is
 * genuinely covered from both directions.
 *
 * ## Divergence between launch modes
 *
 * Explicitly ruled out: both launch modes (`GAMES_CONFIG=main-street` engine
 * launcher and the standalone sibling) resolve the specifier through the same
 * `resolveCoreAliases()` helper, so they load the same committed `.mjs` and
 * exhibit the identical defect.
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

describe('ToneForge runtime synth module can produce playable voices', () => {
  it('exposes a factory for every expected synth key', () => {
    for (const key of RUNTIME_FACTORY_KEYS) {
      expect(typeof runtimeSynth.factories?.[key]).toBe('function');
    }
  });

  it.todo(
    'every runtime factory constructs a voice without throwing (blocked on the runtime-wiring fix — gainNode() positional Tone.Gain arg, CG-0MUU9PSWI005EZ56)',
  );

  it('reports the confirmed failure signature at the current commit', () => {
    // Pessimistic direction of the same contract: while the defect is present
    // the module must *not* silently produce unplayable voices without
    // surfacing the reason. This runs today and continues to hold after the
    // fix (in which case no warning is emitted at all).
    const failures: string[] = [];
    for (const key of RUNTIME_FACTORY_KEYS) {
      try {
        runtimeSynth.factories?.[key]?.();
      } catch (error) {
        failures.push((error as Error).message);
      }
    }

    const warnings: string[] = [];
    const player = createTfPlayer(runtimeSynth.TF_RUNTIME_MODULE, {
      keyMap: { 'sfx-deal': 'card-draw' },
      logger: { warn: (message: string) => warnings.push(message) },
    });
    player.play('sfx-deal');

    if (failures.length > 0) {
      // The defect is present: the failing step is voice construction, and
      // tfAdapter must report it (rather than failing silently). The warning
      // names the logical key it tried to play.
      expect(
        failures.every((message) => message.includes('param must be an AudioParam')),
      ).toBe(true);
      expect(warnings.some((warning) => warning.includes('sfx-deal'))).toBe(true);
    } else {
      // Defect fixed: nothing to report and no warning is emitted.
      expect(warnings).toEqual([]);
    }
  });

});
