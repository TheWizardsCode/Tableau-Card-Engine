/**
 * Golf win/lose audio tests — verify the game-win / game-lost SFX contract:
 *
 * 1. `SFX_KEYS.GAME_WIN` and `SFX_KEYS.GAME_LOST` follow the `sfx-` naming
 *    convention (no game identifier) so the Golf scene can load and play them.
 * 2. The WAV assets exist at `public/assets/audio/default/` so the
 *    `audioPathWithFallback('golf', ...)` fallback chain resolves at runtime.
 */
import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { SFX_KEYS } from '../../example-games/golf/scenes/GolfConstants';

/**
 * The Golf scene loads these via
 * `audioPathWithFallback('golf', 'game-win.wav')` which tries
 * `assets/audio/golf/...` then falls back to `assets/audio/default/...`.
 * The default-directory copies below satisfy that fallback chain.
 */
function audioAssetExists(filename: string): boolean {
  return existsSync(resolve(process.cwd(), 'public/assets/audio/default', filename));
}

describe('Golf win/lose SFX keys', () => {
  it('GAME_WIN uses the convention key "sfx-game-win"', () => {
    expect(SFX_KEYS.GAME_WIN).toBe('sfx-game-win');
  });

  it('GAME_LOST uses the convention key "sfx-game-lost"', () => {
    expect(SFX_KEYS.GAME_LOST).toBe('sfx-game-lost');
  });

  it('both keys use the sfx- prefix with no game identifier', () => {
    for (const key of [SFX_KEYS.GAME_WIN, SFX_KEYS.GAME_LOST]) {
      expect(key.startsWith('sfx-')).toBe(true);
      expect(key.includes('golf')).toBe(false);
    }
  });
});

describe('Golf win/lose audio assets', () => {
  it('game-win.wav exists in the default audio directory (fallback chain)', () => {
    expect(audioAssetExists('game-win.wav')).toBe(true);
  });

  it('game-lost.wav exists in the default audio directory (fallback chain)', () => {
    expect(audioAssetExists('game-lost.wav')).toBe(true);
  });
});
