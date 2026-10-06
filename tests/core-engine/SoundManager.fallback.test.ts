/**
 * Fallback contract tests (engine item CG-0MUTU0MFE0077H0F, child
 * CG-0MUU9PSWC009CW76).
 *
 * Guarantees that audio never breaks when ToneForge is unavailable, toggled
 * off, or mapped to a key the runtime module does not ship:
 *
 *  - a synth-mapped key with a **missing factory** falls back to the WAV
 *    player instead of going silent (the `income-*`/`success-fanfare`
 *    mappings currently have no factory);
 *  - detaching the synth integration (debug toggle) reverts mapped keys to
 *    the WAV path without a scene restart;
 *  - when no synth player is attached, mapped keys use WAV;
 *  - mute/volume state is applied to both paths and preserved across the
 *    fallback.
 */

import { describe, it, expect, vi } from 'vitest';

import { SoundManager, type SoundPlayer } from '../../src/core-engine/SoundManager';
import { createTfPlayer, type TfGeneratedModule } from '../../src/core-engine/tfAdapter';

function createMockPlayer(): SoundPlayer {
  return {
    play: vi.fn(),
    stop: vi.fn(),
    setVolume: vi.fn(),
    setMute: vi.fn(),
  };
}

/** A tf module that ships only a couple of factories. */
function partialTfModule(): TfGeneratedModule {
  return {
    factories: {
      'card-draw': () => ({ play: () => {} }),
      'card-place': () => ({ play: () => {} }),
    },
  };
}

describe('SoundManager fallback when ToneForge cannot handle a key', () => {
  it('falls back to WAV when the synth factory is missing', () => {
    const wavPlayer = createMockPlayer();
    const synthPlayer = createTfPlayer(partialTfModule(), {
      logger: { warn: () => {} },
    });

    const manager = new SoundManager(wavPlayer, {
      storage: null,
      synthPlayer,
      synthKeyMap: {
        'sfx-deal': 'card-draw',
        'sfx-income-positive': 'income-positive-chime', // no factory
      },
    });

    manager.register('sfx-deal', 'ms:sfx-deal');
    manager.register('sfx-income-positive', 'ms:sfx-income-positive');

    manager.play('sfx-deal');
    // The missing factory must not swallow the sound: WAV is the fallback.
    manager.play('sfx-income-positive');

    expect(wavPlayer.play).toHaveBeenCalledWith('ms:sfx-income-positive');
    // The handled key still goes to synth only.
    expect(wavPlayer.play).not.toHaveBeenCalledWith('ms:sfx-deal');
  });

  it('falls back to WAV for a missing unit-service factory key too', () => {
    const wavPlayer = createMockPlayer();
    const synthPlayer = createTfPlayer(partialTfModule(), {
      logger: { warn: () => {} },
    });

    const manager = new SoundManager(wavPlayer, {
      storage: null,
      synthPlayer,
      synthKeyMap: { 'sfx-challenge-complete': 'success-fanfare' },
    });
    manager.register('sfx-challenge-complete', 'ms:sfx-challenge-complete');

    manager.play('sfx-challenge-complete');

    expect(wavPlayer.play).toHaveBeenCalledWith('ms:sfx-challenge-complete');
  });

  it('plays WAV when no synth player is attached', () => {
    const wavPlayer = createMockPlayer();
    const manager = new SoundManager(wavPlayer, {
      storage: null,
      synthKeyMap: { 'sfx-deal': 'card-draw' },
    });
    manager.register('sfx-deal', 'ms:sfx-deal');

    manager.play('sfx-deal');

    expect(wavPlayer.play).toHaveBeenCalledWith('ms:sfx-deal');
  });

  it('reverts mapped keys to WAV after the synth integration is detached', () => {
    const wavPlayer = createMockPlayer();
    const synthPlayer = createTfPlayer(partialTfModule(), {
      logger: { warn: () => {} },
    });
    const manager = new SoundManager(wavPlayer, {
      storage: null,
      synthPlayer,
      synthKeyMap: { 'sfx-deal': 'card-draw' },
    });
    manager.register('sfx-deal', 'ms:sfx-deal');

    manager.play('sfx-deal');
    expect(wavPlayer.play).not.toHaveBeenCalled();

    // Debug toggle: detach synth -> mapped key goes back to WAV.
    expect(manager.detachSynthIntegration()).toBe(true);
    manager.play('sfx-deal');
    expect(wavPlayer.play).toHaveBeenCalledWith('ms:sfx-deal');

    // Restore re-activates the synth path without a scene restart.
    expect(manager.restoreSynthIntegration()).toBe(true);
    (wavPlayer.play as ReturnType<typeof vi.fn>).mockClear();
    manager.play('sfx-deal');
    expect(wavPlayer.play).not.toHaveBeenCalled();
  });

  it('preserves mute and volume across both paths', () => {
    const wavPlayer = createMockPlayer();
    const synthPlayer = createMockPlayer();
    const manager = new SoundManager(wavPlayer, {
      storage: null,
      synthPlayer,
      synthKeyMap: { 'sfx-deal': 'card-draw' },
    });

    manager.setVolume(0.25);
    manager.setMute(true);

    expect(wavPlayer.setVolume).toHaveBeenCalledWith(0.25);
    expect(synthPlayer.setVolume).toHaveBeenCalledWith(0.25);
    expect(wavPlayer.setMute).toHaveBeenCalledWith(true);
    expect(synthPlayer.setMute).toHaveBeenCalledWith(true);

    // Muted playback is a no-op on both paths.
    manager.register('sfx-deal', 'ms:sfx-deal');
    manager.play('sfx-deal');
    expect(wavPlayer.play).not.toHaveBeenCalled();
  });

  it('does not fall back for a missing-factory key while muted', () => {
    const wavPlayer = createMockPlayer();
    const synthPlayer = createTfPlayer(partialTfModule(), { logger: { warn: () => {} } });
    const manager = new SoundManager(wavPlayer, {
      storage: null,
      synthPlayer,
      synthKeyMap: { 'sfx-income-positive': 'income-positive-chime' },
    });
    manager.register('sfx-income-positive', 'ms:sfx-income-positive');
    manager.setMute(true);

    manager.play('sfx-income-positive');

    expect(wavPlayer.play).not.toHaveBeenCalled();
  });
});
