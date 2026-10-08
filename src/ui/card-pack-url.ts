/**
 * Card-pack asset URL resolution (feature F4, CG-0MUZIS1OO009W7FY).
 *
 * A card pack extends an already-installed game with new cards and assets
 * (see `src/core-engine/CardPackManifest.ts`). The pack lives on disk at
 * `<contentDir>/packs/<gameId>/<packId>/`, and the renderer must load its
 * assets through the scoped `tce-packs://` scheme rather than the launcher's
 * own `public/` root — so the Electron main process can resolve the file
 * inside the content directory and deny everything else.
 *
 * This module is the renderer-safe half of that contract: it turns a game id,
 * a pack id, and a pack-relative asset path into a `tce-packs://` URL. It
 * imports no Node builtins so it can be bundled into the browser build. The
 * inverse — validating an incoming `tce-packs://` URL and resolving it to a
 * real file under `<contentDir>/packs/` — lives in `electron/pack-protocol.ts`,
 * which is Node-only and is unit-tested through an injectable file reader.
 *
 * The `tce-packs://<gameId>/<packId>/<path>` shape is the two-segment
 * extension of the whole-game `tce-games://<gameId>/<path>` scheme; the
 * validation rules deliberately mirror `src/ui/game-asset-url.ts` so a pack
 * asset and a game asset reject the same hostile ids and paths.
 *
 * @see electron/pack-protocol.ts — the Node-side URL resolver/denier.
 * @see src/ui/game-asset-url.ts — the single-segment whole-game equivalent.
 * @see docs/DEVELOPER.md — "Card Packs"
 */

/** URL scheme used to serve per-pack assets to the renderer. */
export const CARD_PACK_URL_SCHEME = 'tce-packs';

/** Why {@link resolveCardPackAssetUrl} rejected its input. */
export type CardPackUrlErrorCode =
  | 'INVALID_GAME_ID'
  | 'INVALID_PACK_ID'
  | 'INVALID_PATH';

/**
 * Thrown when a game id, pack id, or asset path could not be turned into a
 * safe `tce-packs://` URL (invalid id, absolute path, NUL byte, or traversal
 * out of the pack's directory).
 */
export class CardPackUrlError extends Error {
  readonly code: CardPackUrlErrorCode;

  constructor(code: CardPackUrlErrorCode, message: string) {
    super(message);
    this.name = 'CardPackUrlError';
    this.code = code;
  }
}

/**
 * Valid game/pack id: a lower-cased slug that is safe as a URL host (game id)
 * or as a single path segment (pack id) — no separators, no `..`, no NUL.
 * Mirrored in `electron/pack-protocol.ts`; both sides lower-case before
 * matching.
 */
const CARD_PACK_ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;

/**
 * Normalise a pack-relative asset path to a slash-separated, traversal-free
 * form, or throw {@link CardPackUrlError}.
 *
 * Percent-encoding is decoded first (best effort) so encoded traversal such as
 * `%2e%2e%2f` is treated the same as `../`. A path that cannot be decoded is
 * kept verbatim — a literal `%` in a filename is not an error. Internal `..`
 * segments that stay within the directory are collapsed; one that would escape
 * the pack directory is rejected.
 */
function normaliseRelativePath(relativePath: string): string {
  if (typeof relativePath !== 'string' || relativePath.trim() === '') {
    throw new CardPackUrlError('INVALID_PATH', 'Asset path must be a non-empty string.');
  }
  if (relativePath.includes('\0')) {
    throw new CardPackUrlError('INVALID_PATH', 'Asset path must not contain a NUL byte.');
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
    throw new CardPackUrlError(
      'INVALID_PATH',
      `Asset path must be relative (got "${relativePath}").`,
    );
  }

  const segments: string[] = [];
  for (const segment of candidate.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      if (segments.length === 0) {
        throw new CardPackUrlError(
          'INVALID_PATH',
          `Asset path escapes the pack directory (got "${relativePath}").`,
        );
      }
      segments.pop();
      continue;
    }
    segments.push(segment);
  }

  if (segments.length === 0) {
    throw new CardPackUrlError(
      'INVALID_PATH',
      `Asset path does not name a file (got "${relativePath}").`,
    );
  }

  return segments.join('/');
}

/**
 * Normalise and validate a game or pack id, or throw {@link CardPackUrlError}
 * with the supplied *code*.
 */
function normaliseId(id: string, code: CardPackUrlErrorCode, label: string): string {
  if (typeof id !== 'string') {
    throw new CardPackUrlError(code, `${label} must be a string.`);
  }

  // Lower-case so the id matches URL host / on-disk directory semantics.
  const normalised = id.toLowerCase();
  if (!CARD_PACK_ID_PATTERN.test(normalised)) {
    throw new CardPackUrlError(
      code,
      `Invalid ${label.toLowerCase()} "${id}" — expected a lower-case slug.`,
    );
  }
  return normalised;
}

/**
 * Build the `tce-packs://<gameId>/<packId>/<path>` URL the renderer uses to
 * load a pack asset through the launcher's scoped protocol.
 *
 * @throws {CardPackUrlError} when *gameId* or *packId* is not a valid slug, or
 * *relativePath* is absolute, contains a NUL byte, or escapes the pack
 * directory.
 */
export function resolveCardPackAssetUrl(
  gameId: string,
  packId: string,
  relativePath: string,
): string {
  const normalisedGameId = normaliseId(gameId, 'INVALID_GAME_ID', 'Game id');
  const normalisedPackId = normaliseId(packId, 'INVALID_PACK_ID', 'Pack id');
  const normalisedPath = normaliseRelativePath(relativePath);
  return `${CARD_PACK_URL_SCHEME}://${normalisedGameId}/${normalisedPackId}/${normalisedPath}`;
}
