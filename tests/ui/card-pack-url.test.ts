/**
 * Unit tests for the card-pack asset URL builder
 * (`src/ui/card-pack-url.ts`, feature F4 / CG-0MUZIS1OO009W7FY).
 *
 * `resolveCardPackAssetUrl` is the renderer/protocol contract: it turns a game
 * id, a pack id, and a pack-relative asset path into a `tce-packs://` URL. The
 * Electron main process resolves that URL back to a file inside
 * `<contentDir>/packs/<gameId>/<packId>/` (see
 * `tests/electron/pack-protocol.test.ts`), so the builder must never emit a URL
 * that could point outside the pack's directory.
 */

import { describe, it, expect } from 'vitest';

import {
  resolveCardPackAssetUrl,
  CardPackUrlError,
  CARD_PACK_URL_SCHEME,
} from '../../src/ui/card-pack-url';

describe('CARD_PACK_URL_SCHEME', () => {
  it('is the tce-packs scheme', () => {
    expect(CARD_PACK_URL_SCHEME).toBe('tce-packs');
  });
});

describe('resolveCardPackAssetUrl', () => {
  it('builds a tce-packs URL for a valid relative asset path', () => {
    expect(
      resolveCardPackAssetUrl('fixture-game', 'fixture-pack', 'assets/icon.png'),
    ).toBe('tce-packs://fixture-game/fixture-pack/assets/icon.png');
  });

  it('round-trips through the WHATWG URL parser (host + two path segments preserved)', () => {
    const url = new URL(
      resolveCardPackAssetUrl('fixture-game', 'fixture-pack', 'assets/icon.png'),
    );
    expect(url.protocol).toBe('tce-packs:');
    expect(url.hostname).toBe('fixture-game');
    expect(url.pathname).toBe('/fixture-pack/assets/icon.png');
  });

  it('normalises redundant separators and "." segments', () => {
    expect(
      resolveCardPackAssetUrl('fixture-game', 'fixture-pack', './assets//icon.png'),
    ).toBe('tce-packs://fixture-game/fixture-pack/assets/icon.png');
  });

  it('normalises an internal ".." that does not escape the pack directory', () => {
    expect(
      resolveCardPackAssetUrl('fixture-game', 'fixture-pack', 'assets/../icon.png'),
    ).toBe('tce-packs://fixture-game/fixture-pack/icon.png');
  });

  it('lower-cases the game and pack ids so they match on-disk directory names', () => {
    expect(
      resolveCardPackAssetUrl('Fixture-Game', 'Fixture-Pack', 'a.png'),
    ).toBe('tce-packs://fixture-game/fixture-pack/a.png');
  });

  it('rejects a path that escapes via a plain ".." segment', () => {
    for (const bad of ['../secret.png', 'assets/../../secret.png', '..']) {
      expect(() =>
        resolveCardPackAssetUrl('fixture-game', 'fixture-pack', bad),
      ).toThrow(CardPackUrlError);
    }
  });

  it('rejects a path that escapes via percent-encoded traversal', () => {
    for (const bad of [
      '%2e%2e%2fsecret.png',
      '..%2fsecret.png',
      '%2e%2e%5csecret.png',
      'assets/%2e%2e/%2e%2e/secret.png',
    ]) {
      expect(() =>
        resolveCardPackAssetUrl('fixture-game', 'fixture-pack', bad),
      ).toThrow(CardPackUrlError);
    }
  });

  it('rejects absolute and drive-qualified paths', () => {
    for (const bad of [
      '/etc/passwd',
      '\\windows\\system32',
      'C:\\Windows\\x.png',
      '//host/share/x.png',
    ]) {
      expect(() =>
        resolveCardPackAssetUrl('fixture-game', 'fixture-pack', bad),
      ).toThrow(CardPackUrlError);
    }
  });

  it('rejects a path containing a NUL byte', () => {
    expect(() =>
      resolveCardPackAssetUrl('fixture-game', 'fixture-pack', 'assets/\0.png'),
    ).toThrow(CardPackUrlError);
  });

  it('rejects empty / dot-only paths', () => {
    for (const bad of ['', '   ', '.', './']) {
      expect(() =>
        resolveCardPackAssetUrl('fixture-game', 'fixture-pack', bad),
      ).toThrow(CardPackUrlError);
    }
  });

  it('reports INVALID_PATH when the relative path is rejected', () => {
    try {
      resolveCardPackAssetUrl('fixture-game', 'fixture-pack', '../secret.png');
      expect.unreachable('expected resolveCardPackAssetUrl to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(CardPackUrlError);
      expect((error as CardPackUrlError).code).toBe('INVALID_PATH');
    }
  });

  it('rejects invalid game ids', () => {
    for (const bad of ['', '   ', ' ..', 'a/b', 'a\\b', 'a\0b', 'A B', '...', 'a~b']) {
      expect(() =>
        resolveCardPackAssetUrl(bad, 'fixture-pack', 'a.png'),
      ).toThrow(CardPackUrlError);
    }
  });

  it('reports INVALID_GAME_ID when the game id is rejected', () => {
    try {
      resolveCardPackAssetUrl('a/b', 'fixture-pack', 'a.png');
      expect.unreachable('expected resolveCardPackAssetUrl to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(CardPackUrlError);
      expect((error as CardPackUrlError).code).toBe('INVALID_GAME_ID');
    }
  });

  it('rejects invalid pack ids (separators, traversal, NUL, whitespace)', () => {
    for (const bad of ['', '   ', '..', '../pack', 'a/b', 'a\\b', 'a\0b', 'A B', 'a~b']) {
      expect(() =>
        resolveCardPackAssetUrl('fixture-game', bad, 'a.png'),
      ).toThrow(CardPackUrlError);
    }
  });

  it('reports INVALID_PACK_ID when the pack id is rejected', () => {
    try {
      resolveCardPackAssetUrl('fixture-game', 'a/b', 'a.png');
      expect.unreachable('expected resolveCardPackAssetUrl to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(CardPackUrlError);
      expect((error as CardPackUrlError).code).toBe('INVALID_PACK_ID');
    }
  });

  it('never emits a URL whose path escapes the pack directory for hostile paths', () => {
    const hostile = [
      '../secret.png',
      '%2e%2e%2fsecret.png',
      '..%2fsecret.png',
      '%2e%2e%5csecret.png',
      'assets/../../secret.png',
      '/etc/passwd',
    ];
    for (const bad of hostile) {
      expect(() =>
        resolveCardPackAssetUrl('fixture-game', 'fixture-pack', bad),
      ).toThrow(CardPackUrlError);
    }
  });
});
