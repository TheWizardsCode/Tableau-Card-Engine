/**
 * Unit tests for the `tce-games://` protocol resolution logic
 * (`electron/game-protocol.ts`, feature F3 / CG-0MUG2ZJMS006JB40).
 *
 * The handler is Electron-free and reads files through an injectable
 * `readFile`, so the security-critical path resolution and MIME selection are
 * exercised here without booting Electron. The invariant under test: a request
 * resolves to a file *inside* `<contentDir>/games/<id>/` or is denied (404),
 * never anything outside that root.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

import {
  GAMES_DIRNAME,
  DEFAULT_MIME_TYPE,
  mimeTypeForPath,
  resolveAssetFilePath,
  handleGameAssetRequest,
  type GameAssetFileReader,
} from '../../electron/game-protocol.js';
import { resolveGameAssetUrl, GAME_ASSET_URL_SCHEME } from '../../src/ui/game-asset-url';

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

let contentDir: string;

function gameRoot(id = 'fixture-game'): string {
  return path.join(contentDir, GAMES_DIRNAME, id);
}

function writeAsset(relativePath: string, bytes: Buffer = PNG_BYTES): string {
  const filePath = path.join(gameRoot(), relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, bytes);
  return filePath;
}

beforeEach(() => {
  contentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tce-game-assets-'));
});

afterEach(() => {
  fs.rmSync(contentDir, { recursive: true, force: true });
});

describe('mimeTypeForPath', () => {
  it('maps .png to image/png (case-insensitive)', () => {
    expect(mimeTypeForPath('thumbnail.png')).toBe('image/png');
    expect(mimeTypeForPath('THUMBNAIL.PNG')).toBe('image/png');
  });

  it('maps other known image types', () => {
    expect(mimeTypeForPath('a.jpg')).toBe('image/jpeg');
    expect(mimeTypeForPath('a.jpeg')).toBe('image/jpeg');
    expect(mimeTypeForPath('a.webp')).toBe('image/webp');
    expect(mimeTypeForPath('a.svg')).toBe('image/svg+xml');
  });

  it('falls back to application/octet-stream for unknown or missing extensions', () => {
    expect(mimeTypeForPath('archive.bin')).toBe(DEFAULT_MIME_TYPE);
    expect(mimeTypeForPath('README')).toBe(DEFAULT_MIME_TYPE);
  });
});

describe('resolveAssetFilePath', () => {
  it('resolves a valid asset URL inside <contentDir>/games/<id>/', () => {
    const resolved = resolveAssetFilePath(
      contentDir,
      `${GAME_ASSET_URL_SCHEME}://fixture-game/assets/thumbnail.png`,
    );

    expect(resolved).toEqual({
      filePath: path.join(gameRoot(), 'assets', 'thumbnail.png'),
      mimeType: 'image/png',
    });
  });

  it('lower-cases the game id (matching URL host semantics)', () => {
    const resolved = resolveAssetFilePath(contentDir, 'tce-games://Fixture-Game/a.png');
    expect(resolved?.filePath).toBe(path.join(gameRoot(), 'a.png'));
  });

  it('agrees with the renderer URL builder (scheme round-trip)', () => {
    const url = resolveGameAssetUrl('fixture-game', 'assets/thumbnail.png');
    const resolved = resolveAssetFilePath(contentDir, url);
    expect(resolved?.filePath).toBe(path.join(gameRoot(), 'assets', 'thumbnail.png'));
  });

  it('rejects a non-tce-games scheme', () => {
    expect(resolveAssetFilePath(contentDir, 'https://example.com/a.png')).toBeNull();
    expect(resolveAssetFilePath(contentDir, 'file:///a.png')).toBeNull();
  });

  it('rejects an invalid game id', () => {
    for (const url of [
      'tce-games://../etc/passwd',
      'tce-games:///assets/thumbnail.png',
      'tce-games://a%20b/x.png',
    ]) {
      expect(resolveAssetFilePath(contentDir, url)).toBeNull();
    }
  });

  it('rejects encoded traversal in the path', () => {
    for (const url of [
      'tce-games://fixture-game/%2e%2e%2fsecret.png',
      'tce-games://fixture-game/..%2fsecret.png',
      'tce-games://fixture-game/%2e%2e%5csecret.png',
    ]) {
      expect(resolveAssetFilePath(contentDir, url)).toBeNull();
    }
  });

  it('rejects an absolute path expressed via a double slash', () => {
    expect(resolveAssetFilePath(contentDir, 'tce-games://fixture-game//etc/passwd')).toBeNull();
  });

  it('denies malformed percent-encoding', () => {
    expect(resolveAssetFilePath(contentDir, 'tce-games://fixture-game/%ZZ')).toBeNull();
  });

  it('never resolves outside <contentDir>/games/ for hostile inputs', () => {
    const hostile = [
      'tce-games://fixture-game/%2e%2e%2fsecret.png',
      'tce-games://fixture-game/..%2fsecret.png',
      'tce-games://fixture-game/%2e%2e%5csecret.png',
      'tce-games://fixture-game/../../etc/passwd',
      'tce-games://fixture-game/%2e%2e/secret.png',
      'tce-games://fixture-game//etc/passwd',
      'tce-games://fixture-game/%2e%2e%2f%2e%2e%2fsecret.png',
    ];
    const gamesRoot = path.join(contentDir, GAMES_DIRNAME) + path.sep;

    for (const url of hostile) {
      const resolved = resolveAssetFilePath(contentDir, url);
      if (resolved) {
        expect(resolved.filePath.startsWith(gamesRoot)).toBe(true);
      }
    }
  });
});

describe('handleGameAssetRequest', () => {
  it('serves an existing asset with the correct content type', async () => {
    const body = Buffer.from('png-bytes');
    const readFile = vi.fn<GameAssetFileReader>(async () => body);

    const result = await handleGameAssetRequest(
      'tce-games://fixture-game/assets/thumbnail.png',
      { contentDir, readFile },
    );

    expect(result.status).toBe(200);
    expect(result.headers['content-type']).toBe('image/png');
    expect(result.body).toEqual(body);
    expect(readFile).toHaveBeenCalledWith(
      path.join(gameRoot(), 'assets', 'thumbnail.png'),
    );
  });

  it('serves unknown extensions as application/octet-stream', async () => {
    const result = await handleGameAssetRequest('tce-games://fixture-game/data.bin', {
      contentDir,
      readFile: async () => Buffer.from('x'),
    });

    expect(result.status).toBe(200);
    expect(result.headers['content-type']).toBe(DEFAULT_MIME_TYPE);
  });

  it('returns 404 when the file cannot be read', async () => {
    const result = await handleGameAssetRequest(
      'tce-games://fixture-game/assets/missing.png',
      {
        contentDir,
        readFile: async () => {
          throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
        },
      },
    );

    expect(result.status).toBe(404);
    expect(result.body).toBeNull();
  });

  it('denies traversal without touching the file system', async () => {
    const readFile = vi.fn<GameAssetFileReader>(async () => Buffer.from('nope'));

    const result = await handleGameAssetRequest(
      'tce-games://fixture-game/%2e%2e%2fsecret.png',
      { contentDir, readFile },
    );

    expect(result.status).toBe(404);
    expect(result.body).toBeNull();
    expect(readFile).not.toHaveBeenCalled();
  });

  it('reads real files through the default file reader', async () => {
    writeAsset('assets/thumbnail.png');

    const result = await handleGameAssetRequest(
      'tce-games://fixture-game/assets/thumbnail.png',
      { contentDir },
    );

    expect(result.status).toBe(200);
    expect(result.headers['content-type']).toBe('image/png');
    expect(Buffer.from(result.body as Uint8Array).subarray(0, 8).equals(PNG_BYTES)).toBe(true);
  });

  it('returns 404 for a missing file through the default reader', async () => {
    const result = await handleGameAssetRequest(
      'tce-games://fixture-game/assets/absent.png',
      { contentDir },
    );

    expect(result.status).toBe(404);
    expect(result.body).toBeNull();
  });
});
