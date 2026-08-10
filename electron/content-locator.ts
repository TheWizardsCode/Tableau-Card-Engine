/**
 * Game-content resolution for the TCE Electron launcher.
 *
 * The launcher loads the renderer from a "content root" directory. This
 * module resolves that directory, supporting the Steam DLC model:
 *
 *  - **Bundled app (default):** the Vite `dist/` directory shipped inside the
 *    packaged binary (or the repo `dist/` in development). The launcher's
 *    main process computes this path (e.g. `path.join(__dirname, '..', 'dist')`
 *    from the compiled launcher) and passes it in as `bundledDir` — this
 *    module stays pure Node and Electron-agnostic.
 *  - **External override (option a, v1):** a Steam-managed DLC install
 *    directory, supplied via the `--content-dir` CLI flag or the
 *    `TCE_CONTENT_DIR` environment variable. Steam downloads/installs the DLC;
 *    the launcher just reads it.
 *  - **Programmatic DLC management (option b, v2):** implement
 *    `ContentDirectoryProvider` backed by the Steamworks API to compute the
 *    DLC path at runtime — no rewrite of the launcher's load path required.
 *
 * Pure Node — no Electron import — so it is unit-testable without a browser
 * or the Electron runtime.
 */
import fs from 'fs';
import path from 'path';

export type ContentSource = 'bundled' | 'override';

export interface ResolvedContent {
  /** Absolute path to the directory containing the game content. */
  contentDir: string;
  /** Absolute path to the HTML entry file within contentDir. */
  entryFile: string;
  /** Where the content was resolved from. */
  source: ContentSource;
}

export interface ContentLocatorOptions {
  /** Bundled app content (the Vite `dist/` directory). Required — the caller
   * (launcher main process) computes it from its own compiled location. */
  bundledDir: string;
  /** Explicit override (CLI `--content-dir`); falls back to TCE_CONTENT_DIR. */
  override?: string | null;
  /** Entry HTML filename within the content root (default: 'index.html'). */
  entryFileName?: string;
}

export const DEFAULT_ENTRY_FILE = 'index.html';

/** Environment variable carrying the external (Steam DLC) content directory. */
export const CONTENT_DIR_ENV = 'TCE_CONTENT_DIR';

export class ContentLocatorError extends Error {
  readonly code: 'CONTENT_DIR_NOT_FOUND' | 'ENTRY_FILE_NOT_FOUND';
  /** Process exit code the launcher should use when surfacing this error. */
  readonly exitCode = 1;

  constructor(code: ContentLocatorError['code'], message: string) {
    super(message);
    this.name = 'ContentLocatorError';
    this.code = code;
  }
}

/**
 * Pluggable content-directory provider.
 *
 * v1 resolves from the bundled app or an external override (Steam DLC install
 * dir). A future Steamworks-backed implementation (option b) returns the DLC
 * content path programmatically; return `null` to fall back to the bundled
 * app. The launcher composes providers in order.
 */
export interface ContentDirectoryProvider {
  resolve(): ResolvedContent | null;
}

/**
 * Resolve the game-content root directory.
 *
 * Precedence: explicit `override` option > `TCE_CONTENT_DIR` env var >
 * the caller-supplied `bundledDir`.
 *
 * @throws {ContentLocatorError} when the resolved root does not exist or does
 * not contain the entry file.
 */
export function resolveContentDir(options: ContentLocatorOptions): ResolvedContent {
  const entryFileName = options.entryFileName ?? DEFAULT_ENTRY_FILE;
  const override = options.override ?? process.env[CONTENT_DIR_ENV] ?? null;

  if (override) {
    return resolveFromRoot(override, entryFileName, 'override');
  }
  return resolveFromRoot(options.bundledDir, entryFileName, 'bundled');
}

function resolveFromRoot(
  root: string,
  entryFileName: string,
  source: ContentSource,
): ResolvedContent {
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    const hint =
      source === 'override'
        ? `Pass --content-dir <dir> or set ${CONTENT_DIR_ENV} to a valid directory.`
        : 'The bundled app content is missing — rebuild with `npm run build:electron`.';
    throw new ContentLocatorError(
      'CONTENT_DIR_NOT_FOUND',
      `Game content directory not found: ${root}. ${hint}`,
    );
  }

  const entryFile = path.join(root, entryFileName);
  if (!fs.existsSync(entryFile)) {
    throw new ContentLocatorError(
      'ENTRY_FILE_NOT_FOUND',
      `Entry file not found: ${entryFile}. The content directory must contain ${entryFileName}.`,
    );
  }

  return { contentDir: root, entryFile, source };
}
