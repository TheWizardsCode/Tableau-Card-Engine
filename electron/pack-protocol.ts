/**
 * `tce-packs://` protocol resolution (feature F4, CG-0MUZIS1OO009W7FY).
 *
 * The Electron main process registers a `tce-packs://` handler that serves a
 * card pack's assets (icons, art, audio) from
 * `<contentDir>/packs/<gameId>/<packId>/…`. This module holds the
 * Electron-free logic:
 *
 *  - {@link resolveCardPackFilePath} validates a request URL and resolves it
 *    to a file, or returns `null` (deny) when the scheme, game id, or pack id
 *    is invalid, the path is absolute/malformed, or it escapes the pack's
 *    directory.
 *  - {@link handleCardPackRequest} reads the file (via an injectable
 *    `readFile`, so the logic is unit-testable without Electron or a real
 *    file) and returns a plain `{ status, headers, body }` result. The thin
 *    Electron wrapper in `main.ts` turns that into a `Response`.
 *
 * No Electron import: the security-critical path handling is covered by
 * `tests/electron/pack-protocol.test.ts`.
 *
 * The `tce-packs://<gameId>/<packId>/<path>` shape is the two-segment
 * extension of the whole-game `tce-games://<gameId>/<path>` scheme; the
 * validation rules deliberately mirror `electron/game-protocol.ts` so a pack
 * request and a game request deny the same hostile ids and paths.
 *
 * @see src/ui/card-pack-url.ts — the renderer-side URL builder that produces
 * the URLs this module consumes.
 * @see electron/game-protocol.ts — the single-segment whole-game equivalent.
 * @see docs/DEVELOPER.md — "Card Packs"
 */

import fs from 'fs';
import path from 'path';

/** Subdirectory of the content directory that holds installed card packs. */
export const PACKS_DIRNAME = 'packs';

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
  '.csv': 'text/csv',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
};

/**
 * Valid game/pack id: safe as a URL host (game id) or as a single path segment
 * (pack id). Mirrors the pattern in `src/ui/card-pack-url.ts`; both sides
 * lower-case before matching.
 */
const CARD_PACK_ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;

/** Scheme served by {@link handleCardPackRequest}. */
export const CARD_PACK_ASSET_SCHEME = 'tce-packs';

/** Select a MIME type from a file path's extension (case-insensitive). */
export function mimeTypeForPath(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  return MIME_TYPES[extension] ?? DEFAULT_MIME_TYPE;
}

/** A resolved pack asset request: absolute file path plus the MIME type. */
export interface CardPackPathResolution {
  readonly filePath: string;
  readonly mimeType: string;
}

/** Injectable reader used by {@link handleCardPackRequest} (defaults to `fs`). */
export type CardPackFileReader = (filePath: string) => Promise<Uint8Array>;

/** Plain result of {@link handleCardPackRequest}; `body` is `null` on denial. */
export interface CardPackRequestResult {
  readonly status: number;
  readonly headers: Record<string, string>;
  readonly body: Uint8Array | null;
}

export interface CardPackRequestOptions {
  /** Content root containing the `packs/` directory. */
  readonly contentDir: string;
  /** Override the file reader (tests); defaults to `fs.promises.readFile`. */
  readonly readFile?: CardPackFileReader;
}

/**
 * Split an already percent-decoded request path into raw segments, or return
 * `null` when it is absolute, contains a NUL byte, or uses a drive letter.
 *
 * `url.pathname` always begins with "/"; strip exactly one, then any remaining
 * leading slash marks an absolute path (e.g. `//etc/passwd`). Empty and `.`
 * segments are dropped; `..` is preserved so the caller can reject it in the
 * pack-id position and normalise it in the relative path.
 */
function splitRequestSegments(decodedPath: string): string[] | null {
  if (decodedPath.includes('\0')) return null;

  // Backslashes are separators on Windows; treat them as such so `..\` cannot
  // slip past the traversal check.
  let candidate = decodedPath.replace(/\\/g, '/');

  if (candidate.startsWith('/')) candidate = candidate.slice(1);
  if (candidate.startsWith('/') || /^[A-Za-z]:/.test(candidate)) return null;

  return candidate.split('/').filter((segment) => segment !== '' && segment !== '.');
}

/**
 * Collapse `.`/`..` segments in a pack-relative path, or return `null` when a
 * `..` would escape the pack directory.
 */
function normaliseRelativeSegments(rawSegments: readonly string[]): string[] | null {
  const segments: string[] = [];
  for (const segment of rawSegments) {
    if (segment === '') continue;
    if (segment === '..') {
      if (segments.length === 0) return null;
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  return segments;
}

/** A validated `tce-packs://` request: game id, pack id, traversal-free path. */
interface ParsedCardPackRequest {
  readonly gameId: string;
  readonly packId: string;
  readonly segments: readonly string[];
}

/**
 * Validate and split a `tce-packs://<gameId>/<packId>/<path>` URL.
 *
 * Returns `null` (deny) for a non-`tce-packs` scheme, an invalid game id or
 * pack id, malformed percent-encoding, or an absolute/traversal path. Raw `..`
 * segments are normalised away by the WHATWG URL parser; encoded forms
 * (`%2e%2e%2f`, `..%2f`, `%2e%2e%5c`) survive parsing and are rejected here.
 */
function parseCardPackRequest(
  requestUrl: string | URL,
): ParsedCardPackRequest | null {
  let url: URL;
  try {
    url = typeof requestUrl === 'string' ? new URL(requestUrl) : requestUrl;
  } catch {
    return null;
  }

  if (url.protocol !== `${CARD_PACK_ASSET_SCHEME}:`) return null;

  const gameId = url.hostname.toLowerCase();
  if (!CARD_PACK_ID_PATTERN.test(gameId)) return null;

  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(url.pathname);
  } catch {
    return null;
  }

  const rawSegments = splitRequestSegments(decodedPath);
  // A request must name a pack directory *and* a file inside it.
  if (!rawSegments || rawSegments.length < 2) return null;

  const packId = rawSegments[0].toLowerCase();
  if (!CARD_PACK_ID_PATTERN.test(packId)) return null;

  const segments = normaliseRelativeSegments(rawSegments.slice(1));
  if (!segments || segments.length === 0) return null;

  return { gameId, packId, segments };
}

/**
 * Validate a `tce-packs://` request URL and resolve it to an absolute file path
 * inside `<contentDir>/packs/<gameId>/<packId>/`.
 *
 * Returns `null` (deny) for a non-`tce-packs` scheme, an invalid game or pack
 * id, malformed percent-encoding, an absolute path, or any path that escapes
 * the pack's directory — so callers can answer with a 404 without leaking
 * whether a file exists.
 */
export function resolveCardPackFilePath(
  contentDir: string,
  requestUrl: string | URL,
): CardPackPathResolution | null {
  const parsed = parseCardPackRequest(requestUrl);
  if (!parsed) return null;

  const packRoot = path.resolve(
    contentDir,
    PACKS_DIRNAME,
    parsed.gameId,
    parsed.packId,
  );
  const filePath = path.resolve(packRoot, ...parsed.segments);

  // Defence in depth: the segments are already traversal-free, but never trust
  // a resolved path that lands outside the pack's own directory.
  const prefix = packRoot + path.sep;
  if (filePath !== packRoot && !filePath.startsWith(prefix)) return null;

  return { filePath, mimeType: mimeTypeForPath(filePath) };
}

/**
 * Resolve and read a `tce-packs://` asset request.
 *
 * Denies (404, `body: null`) when the URL is invalid, escapes the packs root,
 * or the file cannot be read; otherwise returns 200 with the file bytes and the
 * extension-derived `content-type`.
 */
export async function handleCardPackRequest(
  requestUrl: string | URL,
  options: CardPackRequestOptions,
): Promise<CardPackRequestResult> {
  const resolved = resolveCardPackFilePath(options.contentDir, requestUrl);
  if (!resolved) {
    return { status: 404, headers: {}, body: null };
  }

  const readFile: CardPackFileReader = options.readFile ?? fs.promises.readFile;

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

/**
 * Minimal Electron `protocol` surface {@link registerCardPackAssetHandler}
 * needs. Kept structural so the Electron-free unit test can pass a fake.
 */
export interface ProtocolRegistrar {
  handle(
    scheme: string,
    handler: (request: { url: string }) => Promise<Response>,
  ): void;
}

/**
 * Register the deny-by-default `tce-packs://` handler against a
 * `protocol`-like object, adapting {@link handleCardPackRequest}'s plain
 * result to an Electron `Response`.
 *
 * Split out of `electron/main.ts` so the wiring — scheme, content root, and
 * Response adaptation — is unit-testable without booting Electron.
 */
export function registerCardPackAssetHandler(
  protocolLike: ProtocolRegistrar,
  contentDir: string,
): void {
  protocolLike.handle(CARD_PACK_ASSET_SCHEME, async (request) => {
    const result = await handleCardPackRequest(request.url, { contentDir });
    // Copy into an ArrayBuffer-backed view: the DOM `BodyInit` type (and the
    // Electron `Response`) do not accept a `Uint8Array<ArrayBufferLike>`.
    const body = result.body ? new Uint8Array(result.body) : null;
    return new Response(body, {
      status: result.status,
      headers: result.headers,
    });
  });
}
