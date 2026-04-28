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
  it('delegates mapped keys to synth player when provided', () => {
    const wavPlayer = createMockPlayer();
    const synthPlayer = createMockPlayer();

    const manager = new SoundManager(wavPlayer, {
      storage: null,
      synthPlayer,
      synthKeyMap: {
        'ms-place': 'card-place',
      },
    });

    manager.register('ms-place', 'ms-place-wav');
    manager.play('ms-place');

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
        'ms-place': 'card-place',
      },
    });

    manager.register('ms-click', 'click.wav');
    manager.play('ms-click');

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
        'ms-place': 'card-place',
      },
    });

    manager.setVolume(0.7);
    manager.setMute(true);

    expect(wavPlayer.setVolume).toHaveBeenCalledWith(0.7);
    expect(synthPlayer.setVolume).toHaveBeenCalledWith(0.7);
    expect(wavPlayer.setMute).toHaveBeenCalledWith(true);
    expect(synthPlayer.setMute).toHaveBeenCalledWith(true);
  });
});
