import { describe, it, expect, vi } from 'vitest';

import { createTfPlayer, type TfGeneratedModule } from '../../src/core-engine/tfAdapter';

describe('createTfPlayer', () => {
  it('delegates play/stop to tf factory voices', () => {
    const play = vi.fn();
    const stop = vi.fn();
    const setVolume = vi.fn();
    const setMute = vi.fn();

    const tfModule: TfGeneratedModule = {
      factories: {
        'sfx-place': () => ({ play, stop, setVolume, setMute }),
      },
    };

    const player = createTfPlayer(tfModule);

    player.play('sfx-place');
    expect(play).toHaveBeenCalledOnce();

    player.stop('sfx-place');
    expect(stop).toHaveBeenCalledOnce();
  });

  it('supports logical key mapping', () => {
    const play = vi.fn();
    const tfModule: TfGeneratedModule = {
      factories: {
        'card-place': () => ({ play }),
      },
    };

    const player = createTfPlayer(tfModule, {
      keyMap: {
        'sfx-place': 'card-place',
      },
    });

    player.play('sfx-place');
    expect(play).toHaveBeenCalledOnce();
  });

  it('applies setVolume/setMute to existing and future voices', () => {
    const setVolume = vi.fn();
    const setMute = vi.fn();
    const tfModule: TfGeneratedModule = {
      factories: {
        loop: () => ({ setVolume, setMute }),
      },
    };

    const player = createTfPlayer(tfModule);
    player.setVolume(0.25);
    player.setMute(true);

    player.play('loop');

    expect(setVolume).toHaveBeenCalledWith(0.25);
    expect(setMute).toHaveBeenCalledWith(true);
  });

  it('toggleMute returns new value', () => {
    const tfModule: TfGeneratedModule = {
      factories: {
        loop: () => ({ play: vi.fn() }),
      },
    };

    const player = createTfPlayer(tfModule);

    expect(player.toggleMute()).toBe(true);
    expect(player.toggleMute()).toBe(false);
  });

  it('logs warning and fails gracefully when factory is missing', () => {
    const warn = vi.fn();
    const tfModule: TfGeneratedModule = {
      factories: {},
    };

    const player = createTfPlayer(tfModule, { logger: { warn } });

    // Returns false so the caller can fall back to the WAV/Phaser path
    // rather than dropping the sound silently (CG-0MUU9PSWC009CW76).
    expect(player.play('missing-sfx')).toBe(false);
    expect(warn).toHaveBeenCalledWith(
      '[tfAdapter] Missing tf factory for key "missing-sfx" (mapped: "missing-sfx")',
    );
  });

  it('returns true when a voice was played', () => {
    const tfModule: TfGeneratedModule = {
      factories: { 'card-draw': () => ({ play: vi.fn() }) },
    };

    const player = createTfPlayer(tfModule);

    expect(player.play('card-draw')).toBe(true);
  });

  it('returns false when voice creation throws', () => {
    const warn = vi.fn();
    const tfModule: TfGeneratedModule = {
      factories: {
        'card-draw': () => {
          throw new Error('boom');
        },
      },
    };

    const player = createTfPlayer(tfModule, { logger: { warn } });

    expect(player.play('card-draw')).toBe(false);
    expect(warn).toHaveBeenCalledWith('[tfAdapter] Failed to create tf voice for key "card-draw"');
  });
});
