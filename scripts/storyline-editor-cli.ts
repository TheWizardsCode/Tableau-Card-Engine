#!/usr/bin/env node
/**
 * Story-line editor CLI — the single launch point for the read-only editor.
 *
 * ```bash
 * npm run storylines:editor                       # Gym content, http://127.0.0.1:5174
 * npm run storylines:editor -- --port 5180
 * npm run storylines:editor -- --content path/to/storylines.csv
 * npm run storylines:editor -- --adapter ./my-game-adapter.ts
 * npm run storylines:editor -- --help
 * ```
 *
 * The CLI resolves a game's **content adapter** (a shipped id such as `gym`,
 * or a module exporting one), reads the content CSV through it, builds the
 * deterministic manifest, and hands both the manifest and the dedicated editor
 * Vite config to {@link createEditorHost}. The page then renders from that one
 * manifest — there is no per-node network round-trip.
 *
 * `tsx` is the core tooling runner (no Vite loader), and nothing here writes a
 * file: the manifest is served from memory, so the editor stays inside the
 * epic's single-write-path rule.
 *
 * @module
 */

import { readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  DEFAULT_CONTENT_ADAPTER,
  DEFAULT_CONTENT_PATH,
  getContentAdapter,
} from '../src/story-line/content/adapters';
import {
  buildStorylineManifestFromCsv,
  type StorylineManifest,
} from '../src/story-line/content/manifest';
import type { ContentAdapter } from '../src/story-line/content/types';
import { parseArgv } from './storyline-cli-support';
import { EDITOR_SERVER_PORT } from '../vite.editor.config';
import {
  createEditorHost,
  DEFAULT_EDITOR_HOST,
  type EditorHost,
} from './storyline-editor-server';

/** CLI usage text. */
export const EDITOR_USAGE = `Open the read-only story-line editor (a local dev tool).

Usage:
  npm run storylines:editor -- [options]

Options:
  --content <path>    Content CSV to load (default: ${DEFAULT_CONTENT_PATH})
  --adapter <module>  Content adapter: a shipped id (default: gym) or a module
                      path/specifier exporting a ContentAdapter as its default,
                      \`adapter\` or \`contentAdapter\` export
  --port <number>     Dev-server port (default: ${EDITOR_SERVER_PORT})
  --host <host>       Bind host (default: ${DEFAULT_EDITOR_HOST}; loopback only)
  --help              Show this help

Exit codes: 0 = serving / help shown, 1 = bad option, unknown adapter,
unreadable content or host failure.`.trim();

/** Loads a module specifier (a real dynamic `import()` by default). */
export type AdapterImporter = (specifier: string) => Promise<unknown>;

/** Parsed editor CLI options. */
export interface StorylineEditorCliOptions {
  /** True when `--help` was requested. */
  readonly help: boolean;
  /** Dev-server port. */
  readonly port: number;
  /** Bind host. */
  readonly host: string;
  /** Content CSV path, as written on the command line. */
  readonly contentPath: string;
  /** Raw `--adapter` value (a shipped id or a module specifier). */
  readonly adapterRef: string | undefined;
}

/** Optional seams for tests. */
export interface StorylineEditorCliDeps {
  /** Overrides the dynamic `import()` used to load an adapter module. */
  readonly importer?: AdapterImporter;
}

/** The default adapter importer (a real dynamic ESM import). */
const defaultImporter: AdapterImporter = (specifier) => import(specifier);

/**
 * Parses editor argv.
 *
 * @param argv Raw arguments (without the node/script prefix).
 * @returns The parsed options.
 * @throws Error when `--port` is not a valid TCP port.
 */
export function parseStorylineEditorArgs(argv: readonly string[]): StorylineEditorCliOptions {
  const { flags } = parseArgv(argv);

  const portRaw = flags.get('port');
  let port = EDITOR_SERVER_PORT;
  if (portRaw !== undefined) {
    port = Number(portRaw);
    if (!Number.isInteger(port) || port < 0 || port > 65535) {
      throw new Error(`--port must be an integer between 0 and 65535 (got "${portRaw}")`);
    }
  }

  return {
    help: flags.has('help'),
    port,
    host: flags.get('host') ?? DEFAULT_EDITOR_HOST,
    contentPath: flags.get('content') ?? DEFAULT_CONTENT_PATH,
    adapterRef: flags.get('adapter'),
  };
}

/**
 * Resolves an adapter module reference to a specifier `import()` accepts.
 *
 * A relative/absolute path (or a file with a script extension) becomes a file
 * URL; a bare specifier (including a scoped package) is returned unchanged.
 */
export function resolveAdapterSpecifier(ref: string, baseDir: string): string {
  const looksLikePath =
    ref.startsWith('.') ||
    ref.startsWith('/') ||
    /^[A-Za-z]:[\\/]/.test(ref) ||
    /\.(?:ts|tsx|mts|cts|js|mjs|cjs)$/.test(ref);
  if (!looksLikePath) return ref;
  return pathToFileURL(isAbsolute(ref) ? ref : resolve(baseDir, ref)).href;
}

/** Type guard for a structurally valid {@link ContentAdapter}. */
export function isContentAdapter(value: unknown): value is ContentAdapter {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as {
    gameId?: unknown;
    columns?: unknown;
    fields?: { id?: unknown; name?: unknown } | null;
  };
  return (
    typeof candidate.gameId === 'string' &&
    candidate.gameId !== '' &&
    Array.isArray(candidate.columns) &&
    typeof candidate.fields === 'object' &&
    candidate.fields !== null &&
    typeof candidate.fields.id === 'string' &&
    candidate.fields.id !== '' &&
    typeof candidate.fields.name === 'string' &&
    candidate.fields.name !== ''
  );
}

/** Extracts an adapter from a loaded module's exports. */
function extractAdapter(module: unknown): unknown {
  if (typeof module !== 'object' || module === null) return undefined;
  const record = module as Record<string, unknown>;
  return record.default ?? record.adapter ?? record.contentAdapter;
}

/**
 * Resolves the editor's content adapter.
 *
 * @param adapterRef Shipped adapter id or module specifier (`undefined` →
 *                   the shipped default adapter).
 * @param importer   Dynamic importer (overridable in tests).
 * @param baseDir    Directory relative adapter paths resolve against
 *                   (defaults to `process.cwd()`).
 * @returns The adapter, or `undefined` when it cannot be resolved.
 */
export async function resolveEditorAdapter(
  adapterRef?: string,
  importer: AdapterImporter = defaultImporter,
  baseDir: string = process.cwd(),
): Promise<ContentAdapter | undefined> {
  if (adapterRef === undefined || adapterRef === '') return DEFAULT_CONTENT_ADAPTER;

  const shipped = getContentAdapter(adapterRef);
  if (shipped) return shipped;

  let loaded: unknown;
  try {
    loaded = await importer(resolveAdapterSpecifier(adapterRef, baseDir));
  } catch {
    return undefined;
  }

  const adapter = extractAdapter(loaded);
  return isContentAdapter(adapter) ? adapter : undefined;
}

/** A manifest loaded from a content CSV. */
export interface LoadedEditorManifest {
  /** The generated manifest. */
  readonly manifest: StorylineManifest;
  /** Absolute path of the CSV it was generated from. */
  readonly csvPath: string;
}

/**
 * Reads a content CSV and builds its manifest through the content adapter.
 *
 * @param contentPath CSV path (relative paths resolve against `baseDir`).
 * @param adapter     The game content adapter.
 * @param baseDir     Base directory (defaults to `process.cwd()`).
 * @returns The manifest plus the resolved CSV path.
 * @throws Error with an actionable message when the file is unreadable.
 */
export function loadEditorManifest(
  contentPath: string,
  adapter: ContentAdapter,
  baseDir: string = process.cwd(),
): LoadedEditorManifest {
  const csvPath = isAbsolute(contentPath) ? contentPath : resolve(baseDir, contentPath);
  let csv: string;
  try {
    csv = readFileSync(csvPath, 'utf-8');
  } catch (error) {
    throw new Error(`cannot read ${csvPath}: ${(error as Error).message}`);
  }
  return { manifest: buildStorylineManifestFromCsv(csv, adapter), csvPath };
}

/** The running editor, or a user-facing failure message. */
export type EditorLaunchResult =
  | { readonly ok: true; readonly host: EditorHost }
  | { readonly ok: false; readonly code: number; readonly message: string };

/**
 * Launches the editor host and returns it, or a failure describing why not.
 *
 * Kept separate from {@link runStorylineEditorCli} so tests can assert the
 * failure paths without binding a port.
 */
export async function launchEditor(
  options: StorylineEditorCliOptions,
  deps: StorylineEditorCliDeps = {},
): Promise<EditorLaunchResult> {
  const adapter = await resolveEditorAdapter(options.adapterRef, deps.importer);
  if (!adapter) {
    return {
      ok: false,
      code: 1,
      message:
        `unknown --adapter "${options.adapterRef ?? ''}" — use a shipped adapter id ` +
        `(gym) or a module exporting a ContentAdapter`,
    };
  }

  let loaded: LoadedEditorManifest;
  try {
    loaded = loadEditorManifest(options.contentPath, adapter);
  } catch (error) {
    return { ok: false, code: 1, message: (error as Error).message };
  }

  try {
    const host = await createEditorHost({
      manifest: loaded.manifest,
      port: options.port,
      host: options.host,
    });
    return { ok: true, host };
  } catch (error) {
    return {
      ok: false,
      code: 1,
      message: `cannot start the editor host: ${(error as Error).message}`,
    };
  }
}

/**
 * Runs the editor CLI.
 *
 * @param argv Raw arguments (defaults to `process.argv.slice(2)`).
 * @param deps Optional test seams.
 * @returns Exit code: 0 when serving (the dev server keeps the process alive)
 *          or when help was shown, 1 on any failure.
 */
export async function runStorylineEditorCli(
  argv: readonly string[] = process.argv.slice(2),
  deps: StorylineEditorCliDeps = {},
): Promise<number> {
  let options: StorylineEditorCliOptions;
  try {
    options = parseStorylineEditorArgs(argv);
  } catch (error) {
    process.stderr.write(`storyline-editor: ${(error as Error).message}\n\n${EDITOR_USAGE}\n`);
    return 1;
  }

  if (options.help) {
    process.stdout.write(`${EDITOR_USAGE}\n`);
    return 0;
  }

  const launched = await launchEditor(options, deps);
  if (!launched.ok) {
    process.stderr.write(`storyline-editor: ${launched.message}\n`);
    return launched.code;
  }

  const { host } = launched;
  process.stdout.write(
    `storyline-editor: serving the story-line graph at ${host.url ?? `http://${options.host}:${options.port}`}\n` +
      'storyline-editor: press Ctrl+C to stop\n',
  );

  const shutdown = (): void => {
    void host.close().finally(() => {
      process.exit(0);
    });
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);

  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runStorylineEditorCli()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error: unknown) => {
      process.stderr.write(`storyline-editor: ${(error as Error).message}\n`);
      process.exitCode = 1;
    });
}
