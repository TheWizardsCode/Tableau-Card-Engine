/**
 * `tce-games://` protocol resolution (feature F3, CG-0MUG2ZJMS006JB40).
 *
 * The Electron main process registers a `tce-games://` handler that serves a
 * runtime game's assets (thumbnails, sprites) from
 * `<contentDir>/games/<id>/…`. This module holds the Electron-free logic:
 *
 *  - {@link resolveAssetFilePath} validates a request URL and resolves it to a
 *    file, or returns `null` (deny) when the game id is invalid, the path is
 *    absolute/malformed, or it escapes the game's artifact directory.
 *  - {@link handleGameAssetRequest} reads the file (via an injectable
 *    `readFile`, so the logic is unit-testable without Electron or a real
 *    file) and returns a plain `{ status, headers, body }` result. The thin
 *    Electron wrapper in `main.ts` turns that into a `Response`.
 *
 * No Electron import: the security-critical path handling is covered by
 * `tests/electron/game-protocol.test.ts`.
 *
 * @see src/ui/game-asset-url.ts — the renderer-side URL builder that produces
 * the URLs this module consumes.
 */

import fs from 'fs';
import path from 'path';

/** Subdirectory of the content directory that holds runtime game artifacts. */
export const GAMES_DIRNAME = 'games';

/** MIME type served for extensions that are not recognised. */
export const DEFAULT_MIME_TYPE = 'application/octet-stream';

/** Minimal extension → MIME map; unknown extensions fall back to octet-stream. */
const MIME_TYPES: Readonly<Record<string, string>> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.txt': 'text/plain',
};

/**
 * Valid game id: safe as a URL host and as a single path segment. Mirrors the
 * pattern in `src/ui/game-asset-url.ts`; both sides lower-case before matching.
 */
const GAME_ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;

/** The scheme served by {@link handleGameAssetRequest}. */
const GAME_ASSET_URL_SCHEME = 'tce-games';

/** Select a MIME type from a file path's extension (case-insensitive). */
export function mimeTypeForPath(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  return MIME_TYPES[extension] ?? DEFAULT_MIME_TYPE;
}

/** A resolved asset request: absolute file path plus the MIME type to serve. */
export interface GameAssetPathResolution {
  readonly filePath: string;
  readonly mimeType: string;
}

/** Injectable reader used by {@link handleGameAssetRequest} (defaults to `fs`). */
export type GameAssetFileReader = (filePath: string) => Promise<Uint8Array>;

/** Plain result of {@link handleGameAssetRequest}; `body` is `null` on denial. */
export interface GameAssetRequestResult {
  readonly status: number;
  readonly headers: Record<string, string>;
  readonly body: Uint8Array | null;
}

export interface GameAssetRequestOptions {
  /** Content root containing the `games/` directory. */
  readonly contentDir: string;
  /** Override the file reader (tests); defaults to `fs.promises.readFile`. */
  readonly readFile?: GameAssetFileReader;
}

/**
 * Normalise an already percent-decoded request path into safe path segments, or
 * return `null` when it is absolute, contains a NUL byte, or escapes the game
 * directory.
 */
function normaliseUrlPath(decodedPath: string): string[] | null {
  if (decodedPath.includes('\0')) return null;

  // Backslashes are separators on Windows; treat them as such so `..\` cannot
  // slip past the traversal check.
  let candidate = decodedPath.replace(/\\/g, '/');

  // `url.pathname` always begins with "/"; strip exactly one, then any
  // remaining leading slash marks an absolute path (e.g. `//etc/passwd`).
  if (candidate.startsWith('/')) candidate = candidate.slice(1);
  if (candidate.startsWith('/') || /^[A-Za-z]:/.test(candidate)) return null;

  const segments: string[] = [];
  for (const segment of candidate.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      if (segments.length === 0) return null;
      segments.pop();
      continue;
    }
    segments.push(segment);
  }

  return segments.length > 0 ? segments : null;
}

/**
 * Validate a `tce-games://` request URL and resolve it to an absolute file path
 * inside `<contentDir>/games/<id>/`.
 *
 * Returns `null` (deny) for a non-`tce-games` scheme, an invalid game id,
 * malformed percent-encoding, an absolute path, or any path that escapes the
 * game's artifact directory — so callers can answer with a 404 without leaking
 * whether a file exists. Raw `..` segments are normalised away by the WHATWG
 * URL parser; encoded forms (`%2e%2e%2f`, `..%2f`, `%2e%2e%5c`) survive
 * parsing and are rejected here.
 */
export function resolveAssetFilePath(
  contentDir: string,
  requestUrl: string | URL,
): GameAssetPathResolution | null {
  let url: URL;
  try {
    url = typeof requestUrl === 'string' ? new URL(requestUrl) : requestUrl;
  } catch {
    return null;
  }

  if (url.protocol !== `${GAME_ASSET_URL_SCHEME}:`) return null;

  const gameId = url.hostname.toLowerCase();
  if (!GAME_ID_PATTERN.test(gameId)) return null;

  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(url.pathname);
  } catch {
    return null;
  }

  const segments = normaliseUrlPath(decodedPath);
  if (!segments) return null;

  const gameRoot = path.resolve(contentDir, GAMES_DIRNAME, gameId);
  const filePath = path.resolve(gameRoot, ...segments);

  // Defence in depth: the segments are already traversal-free, but never trust
  // a resolved path that lands outside the game's own directory.
  const prefix = gameRoot + path.sep;
  if (filePath !== gameRoot && !filePath.startsWith(prefix)) return null;

  return { filePath, mimeType: mimeTypeForPath(filePath) };
}

/**
 * Resolve and read a `tce-games://` asset request.
 *
 * Denies (404, `body: null`) when the URL is invalid, escapes the games root,
 * or the file cannot be read; otherwise returns 200 with the file bytes and the
 * extension-derived `content-type`.
 */
export async function handleGameAssetRequest(
  requestUrl: string | URL,
  options: GameAssetRequestOptions,
): Promise<GameAssetRequestResult> {
  const resolved = resolveAssetFilePath(options.contentDir, requestUrl);
  if (!resolved) {
    return { status: 404, headers: {}, body: null };
  }

  const readFile: GameAssetFileReader = options.readFile ?? fs.promises.readFile;

  try {
    const body = await readFile(resolved.filePath);
    return {
      status: 200,
      headers: { 'content-type': resolved.mimeType },
      body,
    };
  } catch {
    return { status: 404, headers: {}, body: null };
  }
}
