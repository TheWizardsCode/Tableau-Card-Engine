/**
 * Runtime game asset URL resolution (feature F3, CG-0MUG2ZJMS006JB40).
 *
 * Runtime games ship their own assets (thumbnails, sprites) inside their
 * artifact directory (`<contentDir>/games/<id>/…`). The renderer must load
 * those through the scoped `tce-games://` scheme rather than the launcher's
 * own `public/` root, so the Electron main process can resolve the file inside
 * the content directory and deny everything else.
 *
 * This module is the renderer-safe half of that contract: it turns a game id
 * and a manifest-relative asset path into a `tce-games://` URL. It imports no
 * Node builtins so it can be bundled into the browser build. The inverse —
 * validating an incoming `tce-games://` URL and resolving it to a real file
 * under `<contentDir>/games/` — lives in `electron/game-protocol.ts`, which is
 * Node-only and is unit-tested through an injectable file reader.
 *
 * @see docs/DEVELOPER.md — "Runtime game plugins"
 */

/** URL scheme used to serve per-game assets to the renderer. */
export const GAME_ASSET_URL_SCHEME = 'tce-games';

/** Why {@link resolveGameAssetUrl} rejected its input. */
export type GameAssetUrlErrorCode = 'INVALID_GAME_ID' | 'INVALID_PATH';

/**
 * Thrown when a game id or asset path could not be turned into a safe
 * `tce-games://` URL (invalid id, absolute path, NUL byte, or traversal out of
 * the game's artifact directory).
 */
export class GameAssetUrlError extends Error {
  readonly code: GameAssetUrlErrorCode;

  constructor(code: GameAssetUrlErrorCode, message: string) {
    super(message);
    this.name = 'GameAssetUrlError';
    this.code = code;
  }
}

/**
 * Valid game id: a lower-cased slug that is safe as a URL host and as a single
 * path segment (no separators, no `..`, no NUL). Mirrored in
 * `electron/game-protocol.ts`; both sides lower-case before matching.
 */
const GAME_ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;

/**
 * Normalise a manifest-relative asset path to a slash-separated, traversal-free
 * form, or throw {@link GameAssetUrlError}.
 *
 * Percent-encoding is decoded first (best effort) so encoded traversal such as
 * `%2e%2e%2f` is treated the same as `../`. A path that cannot be decoded is
 * kept verbatim — a literal `%` in a filename is not an error. Internal `..`
 * segments that stay within the directory are collapsed; one that would escape
 * the game directory is rejected.
 */
function normaliseRelativePath(relativePath: string): string {
  if (typeof relativePath !== 'string' || relativePath.trim() === '') {
    throw new GameAssetUrlError('INVALID_PATH', 'Asset path must be a non-empty string.');
  }
  if (relativePath.includes('\0')) {
    throw new GameAssetUrlError('INVALID_PATH', 'Asset path must not contain a NUL byte.');
  }

  let candidate = relativePath;
  try {
    candidate = decodeURIComponent(relativePath);
  } catch {
    // Not valid percent-encoding — treat the raw text as the path.
    candidate = relativePath;
  }

  // Backslashes are separators on Windows; treat them as separators here so
  // `..\` cannot slip past the traversal check.
  candidate = candidate.replace(/\\/g, '/');

  if (candidate.startsWith('/') || /^[A-Za-z]:/.test(candidate)) {
    throw new GameAssetUrlError(
      'INVALID_PATH',
      `Asset path must be relative (got "${relativePath}").`,
    );
  }

  const segments: string[] = [];
  for (const segment of candidate.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      if (segments.length === 0) {
        throw new GameAssetUrlError(
          'INVALID_PATH',
          `Asset path escapes the game directory (got "${relativePath}").`,
        );
      }
      segments.pop();
      continue;
    }
    segments.push(segment);
  }

  if (segments.length === 0) {
    throw new GameAssetUrlError(
      'INVALID_PATH',
      `Asset path does not name a file (got "${relativePath}").`,
    );
  }

  return segments.join('/');
}

/**
 * Build the `tce-games://<id>/<path>` URL the renderer uses to load a game's
 * asset through the launcher's scoped protocol.
 *
 * @throws {GameAssetUrlError} when *gameId* is not a valid slug or
 * *relativePath* is absolute, contains a NUL byte, or escapes the game
 * directory.
 */
export function resolveGameAssetUrl(gameId: string, relativePath: string): string {
  if (typeof gameId !== 'string') {
    throw new GameAssetUrlError('INVALID_GAME_ID', 'Game id must be a string.');
  }

  // Lower-case so the id matches URL host semantics (hosts are case-
  // insensitive; the main-process resolver reads `url.hostname`).
  const normalisedId = gameId.toLowerCase();
  if (!GAME_ID_PATTERN.test(normalisedId)) {
    throw new GameAssetUrlError(
      'INVALID_GAME_ID',
      `Invalid game id "${gameId}" — expected a lower-case slug.`,
    );
  }

  const normalisedPath = normaliseRelativePath(relativePath);
  return `${GAME_ASSET_URL_SCHEME}://${normalisedId}/${normalisedPath}`;
}
