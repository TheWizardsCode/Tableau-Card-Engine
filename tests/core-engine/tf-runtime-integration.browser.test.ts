/**
 * Engine integration test: the committed ToneForge runtime module actually
 * activates end-to-end in a **real browser** Web Audio context
 * (CG-0MUTU0MFE0077H0F, child CG-0MUU9PSWI005EZ56).
 *
 * This pins the load-success contract AC 2/AC 4 describe:
 *   committed module -> `createTfPlayer()` -> `SoundManager.setSynthIntegration()`
 *   -> `isSynthActive()` true -> a synth-mapped `play()` delegates to the
 *   synth player and the WAV/Phaser player is **not** used for that key.
 *
 * Why a browser test: the earlier investigation concluded (from a Node-only
 * reproduction) that the module's `new Tone.Gain(value)` voice construction
 * throws `param must be an AudioParam`. That is a **Node-environment
 * artefact** — Tone.js has no real Web Audio context under Node, so
 * `context.createGain()` does not return an `AudioParam`. In a real browser
 * every factory constructs a voice successfully, so the wiring fault could
 * not be reproduced here. This test locks in the real-browser behaviour so a
 * genuine future regression (in either the module or the wiring) is caught.
 *
 * Note: this test deliberately does **not** call `Tone.start()` — that
 * requires a user gesture and hangs under headless Chromium. It asserts the
 * wiring/attach contract, not audible output.
 */

import { describe, expect, it } from 'vitest';

import { SoundManager, type SoundPlayer } from '../../src/core-engine/SoundManager';
import { createTfPlayer } from '../../src/core-engine/tfAdapter';
import * as runtimeSynth from '../../src/core-engine/tf-runtime/main-street-runtime-synth.mjs';

/** Logical key -> synth factory key, mirroring MAIN_STREET_TF_SFX_MAPPING. */
const KEY_MAP: Record<string, string> = {
  'sfx-deal': 'card-draw',
  'sfx-place': 'card-place',
};

/** Records play/stop calls so the WAV fallback path is observable. */
function createRecordingPlayer(): { player: SoundPlayer; played: string[] } {
  const played: string[] = [];
  return {
    played,
    player: {
      play: (key: string) => {
        played.push(key);
      },
      stop: () => {},
      setVolume: () => {},
      setMute: () => {},
    },
  };
}

describe('ToneForge runtime activation (real browser)', () => {
  it('constructs a voice for every committed factory key', () => {
    const failures: string[] = [];

    for (const [key, factory] of Object.entries(runtimeSynth.factories ?? {})) {
      try {
        const voice = factory();
        voice.stop?.();
      } catch (error) {
        failures.push(`${key}: ${(error as Error).message}`);
      }
    }

    expect(Object.keys(runtimeSynth.factories ?? {})).toHaveLength(12);
    expect(failures).toEqual([]);
  });

  it('attaches a live synth player and delegates a mapped key away from WAV', () => {
    const { player: wavPlayer, played } = createRecordingPlayer();
    const manager = new SoundManager(wavPlayer, { storage: null });

    const synthPlayer = createTfPlayer(runtimeSynth.TF_RUNTIME_MODULE, { keyMap: KEY_MAP });
    const synthCalls: string[] = [];
    const originalPlay = synthPlayer.play.bind(synthPlayer);
    synthPlayer.play = (key: string): boolean => {
      synthCalls.push(key);
      return originalPlay(key);
    };

    manager.setSynthIntegration(synthPlayer, KEY_MAP);
    manager.register('sfx-deal', 'sfx-deal');

    expect(manager.isSynthActive()).toBe(true);

    manager.play('sfx-deal');

    expect(synthCalls).toEqual(['card-draw']);
    expect(played).toEqual([]);
    expect(manager.getSynthStatus().active).toBe(true);
    expect(manager.getSynthStatus().factoryCount).toBeGreaterThan(0);
  });

  it('reports an accurate factory count from the committed module', () => {
    const { player: wavPlayer } = createRecordingPlayer();
    const manager = new SoundManager(wavPlayer, { storage: null });
    manager.setSynthIntegration(
      createTfPlayer(runtimeSynth.TF_RUNTIME_MODULE, { keyMap: KEY_MAP }),
      KEY_MAP,
      { factoryCount: Object.keys(runtimeSynth.factories ?? {}).length },
    );

    expect(manager.getSynthStatus().factoryCount).toBe(12);
  });
});
