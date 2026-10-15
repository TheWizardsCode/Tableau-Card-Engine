import { describe, it, expect, vi } from 'vitest';

import { SoundManager, type SoundPlayer } from '../../src/core-engine/SoundManager';

function createMockPlayer(): SoundPlayer {
  return {
    play: vi.fn(),
    stop: vi.fn(),
    setVolume: vi.fn(),
    setMute: vi.fn(),
  };
}

describe('SoundManager tf integration', () => {
  it('retains synth options but does not attach them at construction (opt-in)', () => {
    const wavPlayer = createMockPlayer();
    const synthPlayer = createMockPlayer();

    const manager = new SoundManager(wavPlayer, {
      storage: null,
      synthPlayer,
      synthKeyMap: { 'sfx-place': 'card-place' },
    });

    // Opt-in by default: nothing is attached until explicit enablement.
    expect(manager.isSynthActive()).toBe(false);

    manager.register('sfx-place', 'sfx-place-wav');
    manager.play('sfx-place');

    expect(wavPlayer.play).toHaveBeenCalledWith('sfx-place-wav');
    expect(synthPlayer.play).not.toHaveBeenCalled();

    // Explicit enablement activates the retained integration.
    expect(manager.enableSynth()).toBe(true);
    expect(manager.isSynthActive()).toBe(true);
    manager.play('sfx-place');
    expect(synthPlayer.play).toHaveBeenCalledWith('card-place');
  });

  it('delegates mapped keys to synth player when enabled', () => {
    const wavPlayer = createMockPlayer();
    const synthPlayer = createMockPlayer();

    const manager = new SoundManager(wavPlayer, {
      storage: null,
      synthPlayer,
      synthKeyMap: {
        'sfx-place': 'card-place',
      },
    });
    manager.enableSynth();

    manager.register('sfx-place', 'sfx-place-wav');
    manager.play('sfx-place');

    expect(synthPlayer.play).toHaveBeenCalledWith('card-place');
    expect(wavPlayer.play).not.toHaveBeenCalled();
  });

  it('falls back to wav player for keys without synth mapping', () => {
    const wavPlayer = createMockPlayer();
    const synthPlayer = createMockPlayer();

    const manager = new SoundManager(wavPlayer, {
      storage: null,
      synthPlayer,
      synthKeyMap: {
        'sfx-place': 'card-place',
      },
    });
    manager.enableSynth();

    manager.register('sfx-click', 'click.wav');
    manager.play('sfx-click');

    expect(wavPlayer.play).toHaveBeenCalledWith('click.wav');
    expect(synthPlayer.play).not.toHaveBeenCalled();
  });

  it('applies mute and volume to both wav and synth players', () => {
    const wavPlayer = createMockPlayer();
    const synthPlayer = createMockPlayer();

    const manager = new SoundManager(wavPlayer, {
      storage: null,
      synthPlayer,
      synthKeyMap: {
        'sfx-place': 'card-place',
      },
    });
    manager.enableSynth();

    manager.setVolume(0.7);
    manager.setMute(true);

    expect(wavPlayer.setVolume).toHaveBeenCalledWith(0.7);
    expect(synthPlayer.setVolume).toHaveBeenCalledWith(0.7);
    expect(wavPlayer.setMute).toHaveBeenCalledWith(true);
    expect(synthPlayer.setMute).toHaveBeenCalledWith(true);
  });

  it('supports late synth attachment for async module loading', () => {
    const wavPlayer = createMockPlayer();
    const synthPlayer = createMockPlayer();

    const manager = new SoundManager(wavPlayer, {
      storage: null,
    });

    manager.register('sfx-place', 'sfx-place-wav');
    manager.play('sfx-place');
    expect(wavPlayer.play).toHaveBeenCalledWith('sfx-place-wav');

    manager.setSynthIntegration(synthPlayer, { 'sfx-place': 'card-place' });
    manager.play('sfx-place');
    expect(synthPlayer.play).toHaveBeenCalledWith('card-place');
  });
});
