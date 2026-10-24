/**
 * Story-line editor host: a Vite dev server that serves the editor page.
 *
 * The editor page (`tools/storyline-editor/`) is a plain-DOM development tool
 * with its own dedicated Vite config (`vite.editor.config.ts`) so it never
 * touches the game/build config. This module composes that config with one
 * extra piece of wiring — a middleware that answers `GET /manifest.json` with
 * the manifest built from the user's content CSV + adapter — and boots it.
 *
 * Because the manifest is served from memory (built at launch, no file write),
 * the page makes a single request for the whole graph and stays responsive:
 * node selection and pan/zoom never round-trip to the host. This is also what
 * keeps the editor inside the single-write-path rule: nothing here writes a
 * file; the transactional author API owns all writes (later slices).
 *
 * The manifest/URL contract with the page is pinned in
 * `tools/storyline-editor/config.ts` and unit-guarded by
 * `tests/story-line/editor/cli.test.ts`.
 *
 * @module
 */

import { createServer, type Plugin, type ViteDevServer } from 'vite';

import {
  serialiseManifest,
  type StorylineManifest,
} from '../src/story-line/content/manifest';
import { EDITOR_MANIFEST_PATH } from '../tools/storyline-editor/config';
import editorConfig, { EDITOR_SERVER_PORT } from '../vite.editor.config';

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

/** A Vite plugin serving the manifest to the editor page. */
export function storylineEditorManifestPlugin(manifest: StorylineManifest): Plugin {
  return {
    name: EDITOR_MANIFEST_PLUGIN_NAME,
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const handled = serveEditorManifest(manifest, req, {
          setHeader: (name, value) => {
            res.setHeader(name, value);
          },
          end: (body) => {
            res.end(body);
          },
        });
        if (!handled) next();
      });
    },
  };
}

/** Options for {@link createEditorHost}. */
export interface EditorHostOptions {
  /** The manifest to serve to the page. */
  readonly manifest: StorylineManifest;
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
 * the manifest middleware — the game/build config is never involved.
 *
 * @param options Host options.
 * @returns The started host handle.
 */
export async function createEditorHost(options: EditorHostOptions): Promise<EditorHost> {
  const port = options.port ?? EDITOR_SERVER_PORT;
  const host = options.host ?? DEFAULT_EDITOR_HOST;
  const listen = options.listen ?? true;

  const server = await createServer({
    ...editorConfig,
    configFile: false,
    logLevel: options.logLevel ?? 'info',
    plugins: [...(editorConfig.plugins ?? []), storylineEditorManifestPlugin(options.manifest)],
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
