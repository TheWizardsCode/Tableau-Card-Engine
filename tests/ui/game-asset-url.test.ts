/**
 * Unit tests for the runtime game asset URL builder
 * (`src/ui/game-asset-url.ts`, feature F3 / CG-0MUG2ZJMS006JB40).
 *
 * `resolveGameAssetUrl` is the renderer/protocol contract: it turns a game id
 * and a manifest-relative asset path into a `tce-games://` URL. The Electron
 * main process resolves that URL back to a file inside `<contentDir>/games/`
 * (see `tests/electron/game-protocol.test.ts`), so the builder must never emit
 * a URL that could point outside the game's artifact directory.
 */

import { describe, it, expect } from 'vitest';

import {
  resolveGameAssetUrl,
  GameAssetUrlError,
  GAME_ASSET_URL_SCHEME,
} from '../../src/ui/game-asset-url';

describe('GAME_ASSET_URL_SCHEME', () => {
  it('is the tce-games scheme', () => {
    expect(GAME_ASSET_URL_SCHEME).toBe('tce-games');
  });
});

describe('resolveGameAssetUrl', () => {
  it('builds a tce-games URL for a valid relative asset path', () => {
    expect(resolveGameAssetUrl('fixture-game', 'assets/thumbnail.png')).toBe(
      'tce-games://fixture-game/assets/thumbnail.png',
    );
  });

  it('round-trips through the WHATWG URL parser (host + path preserved)', () => {
    const url = new URL(resolveGameAssetUrl('fixture-game', 'assets/thumbnail.png'));
    expect(url.protocol).toBe('tce-games:');
    expect(url.hostname).toBe('fixture-game');
    expect(url.pathname).toBe('/assets/thumbnail.png');
  });

  it('normalises redundant separators and "." segments', () => {
    expect(resolveGameAssetUrl('fixture-game', './assets//thumbnail.png')).toBe(
      'tce-games://fixture-game/assets/thumbnail.png',
    );
  });

  it('normalises an internal ".." that does not escape the game directory', () => {
    expect(resolveGameAssetUrl('fixture-game', 'assets/../thumbnail.png')).toBe(
      'tce-games://fixture-game/thumbnail.png',
    );
  });

  it('lower-cases the game id so it matches URL host semantics', () => {
    expect(resolveGameAssetUrl('Fixture-Game', 'a.png')).toBe(
      'tce-games://fixture-game/a.png',
    );
  });

  it('rejects a path that escapes via a plain ".." segment', () => {
    for (const bad of ['../secret.png', 'assets/../../secret.png', '..']) {
      expect(() => resolveGameAssetUrl('fixture-game', bad)).toThrow(GameAssetUrlError);
    }
  });

  it('rejects a path that escapes via percent-encoded traversal', () => {
    for (const bad of [
      '%2e%2e%2fsecret.png',
      '..%2fsecret.png',
      '%2e%2e%5csecret.png',
      'assets/%2e%2e/%2e%2e/secret.png',
    ]) {
      expect(() => resolveGameAssetUrl('fixture-game', bad)).toThrow(GameAssetUrlError);
    }
  });

  it('rejects absolute and drive-qualified paths', () => {
    for (const bad of ['/etc/passwd', '\\windows\\system32', 'C:\\Windows\\x.png', '//host/share/x.png']) {
      expect(() => resolveGameAssetUrl('fixture-game', bad)).toThrow(GameAssetUrlError);
    }
  });

  it('rejects a path containing a NUL byte', () => {
    expect(() => resolveGameAssetUrl('fixture-game', 'assets/\0.png')).toThrow(
      GameAssetUrlError,
    );
  });

  it('rejects empty / dot-only paths', () => {
    for (const bad of ['', '   ', '.', './']) {
      expect(() => resolveGameAssetUrl('fixture-game', bad)).toThrow(GameAssetUrlError);
    }
  });

  it('reports INVALID_PATH when the relative path is rejected', () => {
    try {
      resolveGameAssetUrl('fixture-game', '../secret.png');
      expect.unreachable('expected resolveGameAssetUrl to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(GameAssetUrlError);
      expect((error as GameAssetUrlError).code).toBe('INVALID_PATH');
    }
  });

  it('rejects invalid game ids', () => {
    for (const bad of ['', '   ', ' ..', 'a/b', 'a\\b', 'a\0b', 'A B', '...', 'a~b']) {
      expect(() => resolveGameAssetUrl(bad, 'a.png')).toThrow(GameAssetUrlError);
    }
  });

  it('reports INVALID_GAME_ID when the game id is rejected', () => {
    try {
      resolveGameAssetUrl('a/b', 'a.png');
      expect.unreachable('expected resolveGameAssetUrl to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(GameAssetUrlError);
      expect((error as GameAssetUrlError).code).toBe('INVALID_GAME_ID');
    }
  });
});
