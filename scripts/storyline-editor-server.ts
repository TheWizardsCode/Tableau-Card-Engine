/**
 * Story-line editor host: a Vite dev server that serves the editor page.
 *
 * The editor page (`tools/storyline-editor/`) is a plain-DOM development tool
 * with its own dedicated Vite config (`vite.editor.config.ts`) so it never
 * touches the game/build config. This module composes that config with the
 * host wiring — a middleware that answers `GET /manifest.json` with the
 * manifest built from the user's content CSV + adapter, and (when the host is
 * given a session) the **write bridge API** for preview / validate / apply —
 * and boots it.
 *
 * Because the manifest is served from memory (built at launch, no file write),
 * the page makes a single request for the whole graph and stays responsive:
 * node selection and pan/zoom never round-trip to the host. This is also what
 * keeps the editor inside the single-write-path rule: nothing here writes a
 * file; the transactional author API owns all writes, and the bridge
 * (`src/story-line/editor/api.ts`) routes every edit through it.
 *
 * The manifest/URL contract with the page is pinned in
 * `tools/storyline-editor/config.ts` and unit-guarded by
 * `tests/story-line/editor/cli.test.ts`.
 *
 * @module
 */

import { createServer, type Plugin, type PluginOption, type ViteDevServer } from 'vite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  EDITOR_EDIT_KINDS,
  applyEdit,
  previewEdit,
  validateEdit,
  type EditorEdit,
} from '../src/story-line/editor/api';
import {
  DEFAULT_ARTEFACT_PATHS,
  type ArtefactPaths,
} from '../src/story-line/content/artefacts';
import {
  buildStorylineManifestFromCsv,
  serialiseManifest,
  type StorylineManifest,
} from '../src/story-line/content/manifest';
import { computeContentChecksum } from '../src/story-line/content/csv';
import { readContentCards } from '../src/story-line/content/mutate';
import type {
  ContentAdapter,
  ContentCard,
  ContentFieldMapping,
} from '../src/story-line/content/types';
import {
  EDITOR_API_PATHS,
  EDITOR_CONTENT_PATH,
  EDITOR_MANIFEST_PATH,
  EDITOR_PREVIEW_PATH,
  EDITOR_VALIDATE_PATH,
} from '../tools/storyline-editor/config';
export { EDITOR_API_PATHS, EDITOR_CONTENT_PATH } from '../tools/storyline-editor/config';
import editorConfig, { EDITOR_SERVER_PORT } from '../vite.editor.config';
import {
  DEFAULT_MANUAL_DOC_SECTIONS,
  type ManualDocSection,
} from '../src/story-line/editor/manual-docs';

/** Default host the editor server binds to (loopback only — a local dev tool). */
export const DEFAULT_EDITOR_HOST = '127.0.0.1';

/** The middleware plugin's Vite plugin id. */
export const EDITOR_MANIFEST_PLUGIN_NAME = 'tce-storyline-editor-manifest';

/** Minimal request shape the handler needs from an HTTP request. */
export interface EditorManifestRequest {
  readonly url?: string;
}

/** Minimal response shape the handler needs from an HTTP response. */
export interface EditorManifestResponse {
  setHeader(name: string, value: string): void;
  end(body?: string): void;
}

/**
 * Serves the generated manifest, or reports it was not handled.
 *
 * @param manifest The manifest to serve.
 * @param request  The incoming request.
 * @param response A writable response.
 * @returns `true` when this middleware handled the request, `false` otherwise
 *          (the caller should chain to the next middleware).
 */
export function serveEditorManifest(
  manifest: StorylineManifest,
  request: EditorManifestRequest,
  response: EditorManifestResponse,
): boolean {
  const path = (request.url ?? '').split('?')[0];
  if (path !== EDITOR_MANIFEST_PATH) return false;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(serialiseManifest(manifest));
  return true;
}

// ── Editable content (read-only, for the curated forms) ─────

/**
 * The content adapter's **declarative** projection: columns, the story-line
 * field mapping and the authoring defaults.
 *
 * The optional adapter hooks (`baseId`, `describeImpact`) are functions and
 * therefore not serialisable; the page only needs the data to derive form
 * fields, so the projection deliberately omits them (`ContentAdapter`'s hooks
 * are optional, so the projection is structurally assignable to it).
 */
export type EditorContentAdapter = Omit<ContentAdapter, 'baseId' | 'describeImpact'>;

/** The read-only content payload the editor page fetches to prefill forms. */
export interface EditorContentResponse {
  /** The adapter's game id. */
  readonly gameId: string;
  /** Checksum of the served content (the load-time concurrency token). */
  readonly checksum: string;
  /** The adapter's declarative field mapping/defaults. */
  readonly adapter: EditorContentAdapter;
  /** The raw content cards, in file order, including legacy link columns. */
  readonly cards: readonly ContentCard[];
}

/**
 * Projects an adapter to its serialisable declarative part.
 *
 * @param adapter The game content adapter.
 * @returns Columns, field mapping and authoring defaults (no hooks).
 */
export function serialisableContentAdapter(
  adapter: ContentAdapter,
): EditorContentAdapter {
  const fields: ContentFieldMapping = adapter.fields;
  return {
    gameId: adapter.gameId,
    columns: adapter.columns,
    fields,
    ...(adapter.editableColumns !== undefined
      ? { editableColumns: adapter.editableColumns }
      : {}),
    ...(adapter.newCardDefaults !== undefined
      ? { newCardDefaults: adapter.newCardDefaults }
      : {}),
  };
}

/**
 * Builds the read-only content payload for a session (adapter schema + cards).
 *
 * @param session The loaded editor session.
 * @returns The content response the page fetches.
 */
export function buildEditorContent(session: EditorSession): EditorContentResponse {
  return {
    gameId: session.adapter.gameId,
    checksum: computeContentChecksum(session.csv),
    adapter: serialisableContentAdapter(session.adapter),
    cards: readContentCards(session.csv, session.adapter),
  };
}

/**
 * Serves the editable content, or reports it was not handled.
 *
 * Read-only: it exposes the already-loaded session snapshot (the adapter's
 * declarative schema plus the raw cards) so the curated forms can prefill
 * themselves. Nothing here writes a file — every mutation still goes through
 * the preview/validate/apply endpoints and the single author API.
 *
 * @param session  The current editor session.
 * @param request  The incoming request.
 * @param response A writable response.
 * @returns `true` when this middleware handled the request.
 */
export function serveEditorContent(
  session: EditorSession,
  request: EditorManifestRequest,
  response: EditorManifestResponse,
): boolean {
  const path = (request.url ?? '').split('?')[0];
  if (path !== EDITOR_CONTENT_PATH) return false;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(buildEditorContent(session)));
  return true;
}

// ── Session (the loaded snapshot + its concurrency token) ───

/** Options for {@link loadEditorSession}. */
export interface EditorSessionOptions {
  /** Content CSV path (absolute, or relative to `baseDir`). */
  readonly contentPath: string;
  /** The game content adapter. */
  readonly adapter: ContentAdapter;
  /** Base directory relative paths resolve against (default `process.cwd()`). */
  readonly baseDir?: string;
  /** Hand-written documentation registry (defaults to the shipped sections). */
  readonly manualDocs?: readonly ManualDocSection[];
  /** Generated-artefact paths (defaults to the committed Gym artefacts). */
  readonly artefactPaths?: ArtefactPaths;
}

/**
 * The editor's loaded content snapshot.
 *
 * `csv` is what previews are computed against — the same text the author sees —
 * and `checksum` is the concurrency token handed to the write bridge. After an
 * accepted edit the session is reloaded (`reload()`), so the next preview and
 * the served manifest reflect the new content.
 */
export interface EditorSession {
  /** Absolute path of the content CSV. */
  readonly contentPath: string;
  /** The game content adapter. */
  readonly adapter: ContentAdapter;
  /** The loaded content CSV text (the preview snapshot). */
  readonly csv: string;
  /** The loaded content checksum (the write bridge's concurrency token). */
  readonly checksum: string;
  /** The manifest of the loaded content. */
  readonly manifest: StorylineManifest;
  /** Hand-written documentation registry for this game. */
  readonly manualDocs: readonly ManualDocSection[];
  /** Generated-artefact paths for this game. */
  readonly artefactPaths: ArtefactPaths;
  /** Base directory relative paths resolve against. */
  readonly baseDir: string;
  /** Builds the manifest from the **current on-disk** content (page refresh). */
  readManifest(): StorylineManifest;
  /** Re-reads the content from disk, returning a fresh session. */
  reload(): EditorSession;
}

/**
 * Loads a content file into an editor session.
 *
 * @param options Content path, adapter and optional registries.
 * @returns The loaded session.
 * @throws Error with an actionable message when the CSV is unreadable.
 */
export function loadEditorSession(options: EditorSessionOptions): EditorSession {
  const baseDir = options.baseDir ?? process.cwd();
  const contentPath = resolve(baseDir, options.contentPath);

  const build = (): EditorSession => {
    let csv: string;
    try {
      csv = readFileSync(contentPath, 'utf-8');
    } catch (error) {
      throw new Error(`cannot read ${contentPath}: ${(error as Error).message}`);
    }
    const manifest = buildStorylineManifestFromCsv(csv, options.adapter);
    return {
      contentPath,
      adapter: options.adapter,
      csv,
      checksum: computeContentChecksum(csv),
      manifest,
      manualDocs: options.manualDocs ?? DEFAULT_MANUAL_DOC_SECTIONS,
      artefactPaths: options.artefactPaths ?? DEFAULT_ARTEFACT_PATHS,
      baseDir,
      readManifest: () =>
        buildStorylineManifestFromCsv(readFileSync(contentPath, 'utf-8'), options.adapter),
      reload: () => build(),
    };
  };

  return build();
}

// ── Host API (preview / validate / apply) ───────────────────

/** A manifest source: a fixed manifest, or a provider re-read per request. */
export type EditorManifestSource = StorylineManifest | (() => StorylineManifest);

/** Normalises a manifest source to a provider. */
function manifestProvider(source: EditorManifestSource): () => StorylineManifest {
  return typeof source === 'function' ? source : () => source;
}

/**
 * A Vite plugin serving the manifest — and, when a session is supplied, the
 * read-only editable content — to the editor page.
 *
 * @param source  A fixed manifest or a provider re-read per request.
 * @param session The loaded session; enables `GET /content.json` for the forms.
 * @returns The Vite plugin.
 */
export function storylineEditorManifestPlugin(
  source: EditorManifestSource,
  session?: EditorSession,
): Plugin {
  const getManifest = manifestProvider(source);
  return {
    name: EDITOR_MANIFEST_PLUGIN_NAME,
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const response = {
          setHeader: (name: string, value: string) => {
            res.setHeader(name, value);
          },
          end: (body?: string) => {
            res.end(body);
          },
        };
        if (serveEditorManifest(getManifest(), req, response)) return;
        if (session && serveEditorContent(session, req, response)) return;
        next();
      });
    },
  };
}

/** The Vite plugin id of the bridge API middleware. */
export const EDITOR_API_PLUGIN_NAME = 'tce-storyline-editor-api';

/** A host API request, reduced to what the handler needs. */
export interface EditorApiRequest {
  /** HTTP method (only `POST` is accepted). */
  readonly method?: string;
  /** Request path, query string included (it is stripped). */
  readonly path: string;
  /** The already-parsed JSON body. */
  readonly body?: unknown;
}

/** A host API response: status plus a JSON-serialisable body. */
export interface EditorApiResponse {
  /** HTTP status code (200 accepted, 400 bad request, 405 method, 409 stale, 422 invalid). */
  readonly status: number;
  /** JSON body. */
  readonly body: unknown;
}

/** The outcome of one API request: the response plus the session to continue with. */
export interface EditorApiOutcome {
  /** What to send back. */
  readonly response: EditorApiResponse;
  /**
   * The session the host should keep using. A successful apply replaces it
   * with a reloaded one so subsequent previews see the written content.
   */
  readonly session?: EditorSession;
}

/** True when a value is a plain object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Validates and extracts the `edit` field of a request body. */
function readEdit(body: unknown): { readonly edit: EditorEdit } | { readonly error: string } {
  if (!isRecord(body)) return { error: 'request body must be a JSON object' };
  const edit = body.edit;
  if (!isRecord(edit)) return { error: 'request body must carry an "edit" object' };
  if (typeof edit.kind !== 'string') return { error: 'edit.kind must be a string' };
  if (!isRecord(edit.spec)) return { error: 'edit.spec must be an object' };
  if (!EDITOR_EDIT_KINDS.includes(edit.kind as (typeof EDITOR_EDIT_KINDS)[number])) {
    return {
      error: `unknown edit kind "${edit.kind}" (expected one of: ${EDITOR_EDIT_KINDS.join(', ')})`,
    };
  }
  return { edit: edit as unknown as EditorEdit };
}

/** Builds a 400 response for a malformed request. */
function badRequest(message: string): EditorApiOutcome {
  return { response: { status: 400, body: { ok: false, error: message } } };
}

/**
 * Handles one host API request.
 *
 * Pure with respect to HTTP: it takes a parsed body and returns a status +
 * body, so the endpoint contract is unit-testable without a socket.
 *
 * | Path | Method | Operation |
 * |---|---|---|
 * | `POST /api/preview` | preview | diff + validation report, nothing written |
 * | `POST /api/validate` | validate | validator report only, nothing written |
 * | `POST /api/apply` | apply | the transactional write + artefact regeneration |
 *
 * @param session The current editor session.
 * @param request The request (method, path, parsed JSON body).
 * @returns The response plus the session to continue with.
 */
export function handleEditorApiRequest(
  session: EditorSession,
  request: EditorApiRequest,
): EditorApiOutcome {
  const path = request.path.split('?')[0];
  const known = Object.values(EDITOR_API_PATHS) as string[];
  if (!known.includes(path)) {
    return { response: { status: 404, body: { ok: false, error: `unknown API path ${path}` } } };
  }
  if ((request.method ?? 'POST').toUpperCase() !== 'POST') {
    return {
      response: { status: 405, body: { ok: false, error: `${path} accepts POST only` } },
    };
  }

  const parsed = readEdit(request.body);
  if ('error' in parsed) return badRequest(parsed.error);
  const { edit } = parsed;

  if (path === EDITOR_PREVIEW_PATH) {
    return {
      response: { status: 200, body: previewEdit(session.csv, session.adapter, edit) },
    };
  }

  if (path === EDITOR_VALIDATE_PATH) {
    return {
      response: { status: 200, body: validateEdit(session.csv, session.adapter, edit) },
    };
  }

  const body = isRecord(request.body) ? request.body : {};
  const result = applyEdit({
    contentPath: session.contentPath,
    adapter: session.adapter,
    edit,
    // The session checksum is the load-time token; a caller may state its own
    // (e.g. a client holding an older snapshot).
    expectedChecksum:
      typeof body.expectedChecksum === 'string' ? body.expectedChecksum : session.checksum,
    dryRun: body.dryRun === true,
    artefactPaths: session.artefactPaths,
    manualDocs: session.manualDocs,
    baseDir: session.baseDir,
  });

  if (!result.ok) return { response: { status: result.code, body: result } };

  const reloaded = result.written ? session.reload() : undefined;
  return {
    response: {
      status: result.code,
      body: reloaded ? { ...result, manifest: reloaded.manifest } : result,
    },
    ...(reloaded ? { session: reloaded } : {}),
  };
}

/** A minimal readable request stream (Node's `IncomingMessage` satisfies it). */
export interface EditorBodyStream {
  [Symbol.asyncIterator](): AsyncIterator<string | Uint8Array>;
}

/**
 * Reads and parses a JSON request body.
 *
 * @param stream The request stream.
 * @param limit  Maximum accepted body size in bytes (default 1 MiB).
 * @returns The parsed JSON value (`undefined` for an empty body).
 * @throws Error when the body exceeds the limit or is not valid JSON.
 */
export async function readJsonBody(
  stream: EditorBodyStream,
  limit = 1_048_576,
): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of stream) {
    const buffer = typeof chunk === 'string' ? Buffer.from(chunk, 'utf-8') : Buffer.from(chunk);
    size += buffer.length;
    if (size > limit) throw new Error(`request body exceeds ${limit} bytes`);
    chunks.push(buffer);
  }
  const text = Buffer.concat(chunks).toString('utf-8').trim();
  if (text === '') return undefined;
  return JSON.parse(text) as unknown;
}

/** Minimal response shape the API middleware needs. */
export interface EditorApiHttpResponse {
  setHeader(name: string, value: string): void;
  end(body?: string): void;
  statusCode: number;
}

/** Minimal request shape the API middleware needs. */
export interface EditorApiHttpRequest extends EditorBodyStream, EditorManifestRequest {
  readonly method?: string;
}

/**
 * A Vite plugin exposing the write bridge as host API endpoints.
 *
 * The session is held in the closure: an accepted apply reloads it, so the
 * page's next preview (and the manifest it re-fetches) reflects the edit.
 */
export function storylineEditorApiPlugin(initial: EditorSession): Plugin {
  let session = initial;
  return {
    name: EDITOR_API_PLUGIN_NAME,
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req as { url?: string }).url ?? '';
        const path = url.split('?')[0];
        if (!Object.values(EDITOR_API_PATHS).includes(path as never)) {
          next();
          return;
        }

        void (async () => {
          let body: unknown;
          try {
            body = await readJsonBody(req as unknown as EditorBodyStream);
          } catch (error) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(
              JSON.stringify({
                ok: false,
                error: `invalid JSON body: ${(error as Error).message}`,
              }),
            );
            return;
          }

          const outcome = handleEditorApiRequest(session, {
            method: (req as { method?: string }).method,
            path,
            body,
          });
          if (outcome.session) session = outcome.session;
          res.statusCode = outcome.response.status;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store');
          res.end(JSON.stringify(outcome.response.body));
        })();
      });
    },
  };
}

/** Options for {@link createEditorHost}. */
export interface EditorHostOptions {
  /** The manifest to serve to the page (required unless `session` is given). */
  readonly manifest?: StorylineManifest;
  /** A loaded editor session: serves its manifest and exposes the API endpoints. */
  readonly session?: EditorSession;
  /** Dev-server port (defaults to the editor config's port 5174). */
  readonly port?: number;
  /** Bind host (defaults to the loopback address). */
  readonly host?: string;
  /** When `false`, creates the server without listening (tests). */
  readonly listen?: boolean;
  /** Vite log level (defaults to `info`; tests use `silent`). */
  readonly logLevel?: 'info' | 'warn' | 'error' | 'silent';
}

/** A started editor host. */
export interface EditorHost {
  /** The underlying Vite dev server. */
  readonly server: ViteDevServer;
  /** The first local URL, when the server is listening. */
  readonly url: string | undefined;
  /** Shuts the dev server down. */
  close(): Promise<void>;
}

/**
 * Creates (and by default starts) the editor dev server.
 *
 * The page config is composed from the dedicated `vite.editor.config.ts` plus
 * the manifest middleware (and, when a session is supplied, the bridge API
 * middleware) — the game/build config is never involved.
 *
 * @param options Host options.
 * @returns The started host handle.
 * @throws Error when neither a manifest nor a session is supplied.
 */
export async function createEditorHost(options: EditorHostOptions): Promise<EditorHost> {
  const port = options.port ?? EDITOR_SERVER_PORT;
  const host = options.host ?? DEFAULT_EDITOR_HOST;
  const listen = options.listen ?? true;

  if (!options.session && !options.manifest) {
    throw new Error('createEditorHost requires a manifest or an editor session');
  }

  const session = options.session;
  const source: EditorManifestSource = session
    ? () => session.readManifest()
    : (options.manifest as StorylineManifest);

  const plugins: PluginOption[] = [
    ...(editorConfig.plugins ?? []),
    storylineEditorManifestPlugin(source, session),
  ];
  if (session) plugins.push(storylineEditorApiPlugin(session));

  const server = await createServer({
    ...editorConfig,
    configFile: false,
    logLevel: options.logLevel ?? 'info',
    plugins,
    server: {
      ...editorConfig.server,
      port,
      host,
      open: false,
    },
  });

  if (listen) {
    await server.listen();
  }

  const url = server.resolvedUrls?.local[0] ?? (listen ? `http://${host}:${port}` : undefined);

  return {
    server,
    url,
    close: () => server.close(),
  };
}
