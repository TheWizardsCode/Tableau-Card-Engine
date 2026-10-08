/**
 * Unit tests for the `tce-packs://` protocol resolution logic
 * (`electron/pack-protocol.ts`, feature F4 / CG-0MUZIS1OO009W7FY).
 *
 * The handler is Electron-free and reads files through an injectable
 * `readFile`, so the security-critical path resolution and MIME selection are
 * exercised here without booting Electron. The invariant under test: a request
 * resolves to a file *inside* `<contentDir>/packs/<gameId>/<packId>/` or is
 * denied (404), never anything outside that root.
 *
 * The on-disk cases run against the committed card-pack fixtures (F1) via the
 * disposable content-directory helper, so the protocol and the fixtures agree
 * on the real `<contentDir>/packs/` layout.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

import {
  PACKS_DIRNAME,
  DEFAULT_MIME_TYPE,
  CARD_PACK_ASSET_SCHEME,
  mimeTypeForPath,
  resolveCardPackFilePath,
  handleCardPackRequest,
  registerCardPackAssetHandler,
  type CardPackFileReader,
  type ProtocolRegistrar,
} from '../../electron/pack-protocol.js';
import { resolveCardPackAssetUrl } from '../../src/ui/card-pack-url';
import {
  FIXTURE_GAME_ID,
  FIXTURE_PACK_ID,
  FIXTURE_PACK_TWO_ID,
  materialiseCardPackFixture,
  type MaterialisedCardPackFixture,
} from '../fixtures/card-pack/helpers';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

let fixture: MaterialisedCardPackFixture;
let contentDir: string;

function packRoot(packId = FIXTURE_PACK_ID, gameId = FIXTURE_GAME_ID): string {
  return path.join(contentDir, PACKS_DIRNAME, gameId, packId);
}

function packUrl(relativePath: string, packId = FIXTURE_PACK_ID): string {
  return `tce-packs://${FIXTURE_GAME_ID}/${packId}/${relativePath}`;
}

beforeEach(() => {
  fixture = materialiseCardPackFixture();
  contentDir = fixture.contentDir;
});

afterEach(() => {
  fixture.cleanup();
});

describe('mimeTypeForPath', () => {
  it('maps .png to image/png (case-insensitive)', () => {
    expect(mimeTypeForPath('icon.png')).toBe('image/png');
    expect(mimeTypeForPath('ICON.PNG')).toBe('image/png');
  });

  it('maps other known image, audio, and data types', () => {
    expect(mimeTypeForPath('a.jpg')).toBe('image/jpeg');
    expect(mimeTypeForPath('a.jpeg')).toBe('image/jpeg');
    expect(mimeTypeForPath('a.webp')).toBe('image/webp');
    expect(mimeTypeForPath('a.svg')).toBe('image/svg+xml');
    expect(mimeTypeForPath('cards.csv')).toBe('text/csv');
    expect(mimeTypeForPath('theme.wav')).toBe('audio/wav');
    expect(mimeTypeForPath('music.mp3')).toBe('audio/mpeg');
  });

  it('falls back to application/octet-stream for unknown or missing extensions', () => {
    expect(mimeTypeForPath('archive.bin')).toBe(DEFAULT_MIME_TYPE);
    expect(mimeTypeForPath('README')).toBe(DEFAULT_MIME_TYPE);
  });
});

describe('resolveCardPackFilePath', () => {
  it('resolves a valid asset URL inside <contentDir>/packs/<gameId>/<packId>/', () => {
    const resolved = resolveCardPackFilePath(
      contentDir,
      `${CARD_PACK_ASSET_SCHEME}://${FIXTURE_GAME_ID}/${FIXTURE_PACK_ID}/assets/icon.png`,
    );

    expect(resolved).toEqual({
      filePath: path.join(packRoot(), 'assets', 'icon.png'),
      mimeType: 'image/png',
    });
  });

  it('resolves a second pack under the same game independently', () => {
    const resolved = resolveCardPackFilePath(
      contentDir,
      packUrl('assets/icon.png', FIXTURE_PACK_TWO_ID),
    );

    expect(resolved?.filePath).toBe(
      path.join(packRoot(FIXTURE_PACK_TWO_ID), 'assets', 'icon.png'),
    );
  });

  it('lower-cases the game and pack ids (matching on-disk directory names)', () => {
    const resolved = resolveCardPackFilePath(
      contentDir,
      'tce-packs://Fixture-Game/Fixture-Pack/a.png',
    );
    expect(resolved?.filePath).toBe(path.join(packRoot(), 'a.png'));
  });

  it('agrees with the renderer URL builder (scheme round-trip)', () => {
    const url = resolveCardPackAssetUrl(
      FIXTURE_GAME_ID,
      FIXTURE_PACK_ID,
      'assets/icon.png',
    );
    const resolved = resolveCardPackFilePath(contentDir, url);
    expect(resolved?.filePath).toBe(path.join(packRoot(), 'assets', 'icon.png'));
  });

  it('rejects a non-tce-packs scheme', () => {
    expect(
      resolveCardPackFilePath(contentDir, 'https://example.com/a.png'),
    ).toBeNull();
    expect(resolveCardPackFilePath(contentDir, 'tce-games://fixture-game/a.png')).toBeNull();
    expect(resolveCardPackFilePath(contentDir, 'file:///a.png')).toBeNull();
  });

  it('rejects an invalid game id', () => {
    for (const url of [
      'tce-packs://../etc/passwd',
      'tce-packs:///fixture-pack/assets/icon.png',
      'tce-packs://a%20b/fixture-pack/x.png',
    ]) {
      expect(resolveCardPackFilePath(contentDir, url)).toBeNull();
    }
  });

  it('rejects an invalid pack id', () => {
    for (const url of [
      packUrl('assets/icon.png', '%2e%2e%2f'),
      packUrl('assets/icon.png', 'a%20b'),
      packUrl('assets/icon.png', 'a~b'),
    ]) {
      expect(resolveCardPackFilePath(contentDir, url)).toBeNull();
    }
  });

  it('denies a request that names a pack but no file inside it', () => {
    expect(resolveCardPackFilePath(contentDir, packUrl(''))).toBeNull();
    expect(resolveCardPackFilePath(contentDir, `tce-packs://${FIXTURE_GAME_ID}/${FIXTURE_PACK_ID}`)).toBeNull();
    expect(resolveCardPackFilePath(contentDir, `tce-packs://${FIXTURE_GAME_ID}/${FIXTURE_PACK_ID}/`)).toBeNull();
  });

  it('rejects encoded traversal in the path', () => {
    for (const url of [
      packUrl('%2e%2e%2fsecret.png'),
      packUrl('..%2fsecret.png'),
      packUrl('%2e%2e%5csecret.png'),
      packUrl('assets/%2e%2e/%2e%2e/secret.png'),
    ]) {
      expect(resolveCardPackFilePath(contentDir, url)).toBeNull();
    }
  });

  it('rejects encoded traversal that would escape into the game packs root', () => {
    // `fixture-pack/../fixture-pack-two/icon.png` must not resolve as if the
    // caller had legitimately asked for the sibling pack.
    expect(
      resolveCardPackFilePath(
        contentDir,
        packUrl('%2e%2e%2ffixture-pack-two/assets/icon.png'),
      ),
    ).toBeNull();
  });

  it('rejects an absolute path expressed via a double slash', () => {
    expect(
      resolveCardPackFilePath(contentDir, `tce-packs://${FIXTURE_GAME_ID}//etc/passwd`),
    ).toBeNull();
  });

  it('denies malformed percent-encoding', () => {
    expect(resolveCardPackFilePath(contentDir, packUrl('%ZZ'))).toBeNull();
  });

  it('never resolves outside <contentDir>/packs/ for hostile inputs', () => {
    const hostile = [
      packUrl('%2e%2e%2fsecret.png'),
      packUrl('..%2fsecret.png'),
      packUrl('%2e%2e%5csecret.png'),
      packUrl('../../etc/passwd'),
      packUrl('%2e%2e/secret.png'),
      packUrl('%2e%2e%2f%2e%2e%2fsecret.png'),
      `tce-packs://${FIXTURE_GAME_ID}//etc/passwd`,
    ];
    const packsRoot = path.join(contentDir, PACKS_DIRNAME) + path.sep;

    for (const url of hostile) {
      const resolved = resolveCardPackFilePath(contentDir, url);
      if (resolved) {
        expect(resolved.filePath.startsWith(packsRoot)).toBe(true);
      }
    }
  });

  it('shares validation with the URL builder: hostile paths are rejected on both sides', () => {
    const hostile = [
      '../secret.png',
      'assets/../../secret.png',
      '%2e%2e%2fsecret.png',
      '..%2fsecret.png',
      '%2e%2e%5csecret.png',
      'assets/%2e%2e/%2e%2e/secret.png',
    ];

    for (const bad of hostile) {
      expect(() =>
        resolveCardPackAssetUrl(FIXTURE_GAME_ID, FIXTURE_PACK_ID, bad),
      ).toThrow();
      expect(
        resolveCardPackFilePath(
          contentDir,
          `tce-packs://${FIXTURE_GAME_ID}/${FIXTURE_PACK_ID}/${bad}`,
        ),
      ).toBeNull();
    }
  });
});

describe('handleCardPackRequest', () => {
  it('serves an existing pack asset with the correct content type', async () => {
    const body = Buffer.from('png-bytes');
    const readFile = vi.fn<CardPackFileReader>(async () => body);

    const result = await handleCardPackRequest(packUrl('assets/icon.png'), {
      contentDir,
      readFile,
    });

    expect(result.status).toBe(200);
    expect(result.headers['content-type']).toBe('image/png');
    expect(result.body).toEqual(body);
    expect(readFile).toHaveBeenCalledWith(path.join(packRoot(), 'assets', 'icon.png'));
  });

  it('serves unknown extensions as application/octet-stream', async () => {
    const result = await handleCardPackRequest(packUrl('data.bin'), {
      contentDir,
      readFile: async () => Buffer.from('x'),
    });

    expect(result.status).toBe(200);
    expect(result.headers['content-type']).toBe(DEFAULT_MIME_TYPE);
  });

  it('returns 404 when the file cannot be read', async () => {
    const result = await handleCardPackRequest(packUrl('assets/missing.png'), {
      contentDir,
      readFile: async () => {
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      },
    });

    expect(result.status).toBe(404);
    expect(result.body).toBeNull();
  });

  it('denies traversal without touching the file system', async () => {
    const readFile = vi.fn<CardPackFileReader>(async () => Buffer.from('nope'));

    const result = await handleCardPackRequest(
      packUrl('%2e%2e%2fsecret.png'),
      { contentDir, readFile },
    );

    expect(result.status).toBe(404);
    expect(result.body).toBeNull();
    expect(readFile).not.toHaveBeenCalled();
  });

  it('reads real fixture files through the default file reader', async () => {
    const result = await handleCardPackRequest(packUrl('assets/icon.png'), {
      contentDir,
    });

    expect(result.status).toBe(200);
    expect(result.headers['content-type']).toBe('image/png');
    const bytes = Buffer.from(result.body as Uint8Array);
    expect(bytes.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
  });

  it('reads a pack CSV fragment through the default file reader', async () => {
    const result = await handleCardPackRequest(packUrl('cards.csv'), { contentDir });

    expect(result.status).toBe(200);
    expect(result.headers['content-type']).toBe('text/csv');
    expect(result.body).not.toBeNull();
  });

  it('returns 404 for a missing file through the default reader', async () => {
    const result = await handleCardPackRequest(packUrl('assets/absent.png'), {
      contentDir,
    });

    expect(result.status).toBe(404);
    expect(result.body).toBeNull();
  });

  it('does not leak the existence of a file outside the pack directory', async () => {
    // A real secret sits one level above the pack directory; a traversal that
    // targets it must be indistinguishable from a missing file.
    const secretPath = path.join(contentDir, PACKS_DIRNAME, FIXTURE_GAME_ID, 'secret.png');
    fs.writeFileSync(secretPath, PNG_SIGNATURE);
    const readFile = vi.fn<CardPackFileReader>(async () => PNG_SIGNATURE);

    const outside = await handleCardPackRequest(
      packUrl('%2e%2e%2fsecret.png'),
      { contentDir, readFile },
    );
    const missing = await handleCardPackRequest(packUrl('assets/absent.png'), {
      contentDir,
      readFile: async () => {
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      },
    });

    expect(outside).toEqual({ status: 404, headers: {}, body: null });
    expect(missing).toEqual({ status: 404, headers: {}, body: null });
    expect(readFile).not.toHaveBeenCalled();
  });
});

/** Capture the handler registered against a fake Electron `protocol`. */
function fakeProtocol() {
  const handlers = new Map<string, (request: { url: string }) => Promise<Response>>();
  const protocolLike: ProtocolRegistrar = {
    handle: (scheme, handler) => {
      handlers.set(scheme, handler);
    },
  };
  return { protocolLike, handlers };
}

describe('registerCardPackAssetHandler (Electron wiring seam)', () => {
  it('registers the tce-packs scheme', () => {
    const { protocolLike, handlers } = fakeProtocol();

    registerCardPackAssetHandler(protocolLike, contentDir);

    expect(CARD_PACK_ASSET_SCHEME).toBe('tce-packs');
    expect(handlers.has(CARD_PACK_ASSET_SCHEME)).toBe(true);
  });

  it('serves an existing pack asset as a 200 Response with the right content type', async () => {
    const { protocolLike, handlers } = fakeProtocol();
    registerCardPackAssetHandler(protocolLike, contentDir);

    const response = await handlers.get(CARD_PACK_ASSET_SCHEME)!({
      url: packUrl('assets/icon.png'),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    const bytes = Buffer.from(await response.arrayBuffer());
    expect(bytes.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
  });

  it('adapts a denied traversal request to a 404 Response', async () => {
    const { protocolLike, handlers } = fakeProtocol();
    registerCardPackAssetHandler(protocolLike, contentDir);

    const response = await handlers.get(CARD_PACK_ASSET_SCHEME)!({
      url: packUrl('%2e%2e%2fsecret.png'),
    });

    expect(response.status).toBe(404);
    expect(await response.text()).toBe('');
  });

  it('returns 404 for a request for a missing file', async () => {
    const { protocolLike, handlers } = fakeProtocol();
    registerCardPackAssetHandler(protocolLike, contentDir);

    const response = await handlers.get(CARD_PACK_ASSET_SCHEME)!({
      url: packUrl('assets/absent.png'),
    });

    expect(response.status).toBe(404);
  });
});
