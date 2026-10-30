#!/usr/bin/env node
/**
 * Story-line editor CLI — the single launch point for the editor.
 *
 * ```bash
 * npm run storylines:editor                       # Gym content, http://127.0.0.1:5174
 * npm run storylines:editor -- --port 5180
 * npm run storylines:editor -- --content path/to/storylines.csv
 * npm run storylines:editor -- --adapter ./my-game-adapter.ts
 * npm run storylines:editor -- --apply '{"edit":{"kind":"update-card","spec":{...}}}'
 * npm run storylines:editor -- --help
 * ```
 *
 * The CLI resolves a game's **content adapter** (a shipped id such as `gym`,
 * or a module exporting one), loads the content CSV into an **editor session**
 * (the snapshot plus its concurrency checksum) and either
 *
 * - boots the editor host with that session (manifest + preview/validate/apply
 *   endpoints), or
 * - with `--apply`, runs the same write bridge headlessly and exits non-zero
 *   when the edit is refused (invalid content, or content that changed on disk
 *   since load) — scripted/CI edits go through the same single write path.
 *
 * `tsx` is the core tooling runner (no Vite loader), and the content CSV is
 * only ever written by the core author API: the host serves the manifest from
 * memory, and the CLI's apply mode delegates to the bridge.
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
import { applyEdit, EDITOR_EDIT_KINDS, type EditorEdit } from '../src/story-line/editor/api';
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
  loadEditorSession,
  type EditorHost,
  type EditorHostOptions,
} from './storyline-editor-server';

/** CLI usage text. */
export const EDITOR_USAGE = `Open the story-line editor (a local dev tool) or apply one edit headlessly.

Usage:
  npm run storylines:editor -- [options]

Options:
  --content <path>          Content CSV to load (default: ${DEFAULT_CONTENT_PATH})
  --adapter <module>        Content adapter: a shipped id (default: gym) or a module
                            path/specifier exporting a ContentAdapter as its default,
                            \`adapter\` or \`contentAdapter\` export
  --port <number>           Dev-server port (default: ${EDITOR_SERVER_PORT})
  --host [host]             Bind host (default: ${DEFAULT_EDITOR_HOST}, loopback). A
                            valueless --host binds all interfaces (0.0.0.0, Vite's
                            convention). On startup every resolved URL is printed
                            (local and network); a non-loopback bind warns that the
                            editor is reachable from the network and can write the
                            loaded content CSV (it has no authentication)
  --apply <json|@file>      Apply one edit through the write bridge, print the JSON
                            result and exit (no dev server). The JSON is
                            { "edit": { "kind": ..., "spec": { ... } },
                              "expectedChecksum": "<hex, optional>",
                              "dryRun": false, "artefactPaths": { 
                                "json": ..., "mermaid": ... } }
  --dry-run                 With --apply: preview and validate without writing
  --help                    Show this help

Exit codes: 0 = serving / applied / help shown, 1 = bad option, unknown adapter,
unreadable content, host failure or a refused edit (invalid or stale content).`.trim();

/** Loads a module specifier (a real dynamic `import()` by default). */
export type AdapterImporter = (specifier: string) => Promise<unknown>;

/** Creates the editor host (defaults to {@link createEditorHost}, the real Vite server). */
export type EditorHostFactory = (options: EditorHostOptions) => Promise<EditorHost>;

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
  /** Raw `--apply` value (inline JSON or `@file`), undefined when serving. */
  readonly apply: string | undefined;
  /** With `--apply`: preview and validate, write nothing. */
  readonly dryRun: boolean;
}

/** Optional seams for tests. */
export interface StorylineEditorCliDeps {
  /** Overrides the dynamic `import()` used to load an adapter module. */
  readonly importer?: AdapterImporter;
  /** Overrides the host factory (tests inject a stub without binding a port). */
  readonly createHost?: EditorHostFactory;
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

  // A valueless `--host` parses as the literal string "true" (parseArgv's flag
  // sentinel). Follow Vite's own convention instead of handing that to the DNS
  // resolver: a bare `--host` binds all interfaces (0.0.0.0), omitting `--host`
  // keeps the loopback default, and an explicit `--host <addr>` passes through
  // unchanged (CG-0MVSRDOT400777NH).
  const rawHost = flags.get('host');
  const host = rawHost === undefined ? DEFAULT_EDITOR_HOST : rawHost === 'true' ? '0.0.0.0' : rawHost;

  return {
    help: flags.has('help'),
    port,
    host,
    contentPath: flags.get('content') ?? DEFAULT_CONTENT_PATH,
    adapterRef: flags.get('adapter'),
    apply: flags.get('apply'),
    dryRun: flags.has('dry-run'),
  };
}

/** True when a bind host is loopback-only (never exposed beyond this machine). */
export function isLoopbackHost(host: string): boolean {
  return host === '127.0.0.1' || host === 'localhost' || host === '::1';
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

  let session;
  try {
    session = loadEditorSession({ contentPath: options.contentPath, adapter });
  } catch (error) {
    return { ok: false, code: 1, message: (error as Error).message };
  }

  try {
    const createHost = deps.createHost ?? createEditorHost;
    const host = await createHost({
      session,
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

// ── Headless apply (the same bridge, no dev server) ─────────

/** A parsed `--apply` payload. */
export interface EditorApplyRequest {
  /** The edit to apply. */
  readonly edit: EditorEdit;
  /** Optional explicit concurrency token (defaults to the load-time checksum). */
  readonly expectedChecksum?: string;
  /** When true, preview and validate without writing. */
  readonly dryRun?: boolean;
  /** Optional generated-artefact paths (defaults to the committed Gym artefacts). */
  readonly artefactPaths?: { readonly json: string; readonly mermaid: string };
}

/**
 * Parses an `--apply` payload (inline JSON, or `@path` to a JSON file).
 *
 * @param raw     The `--apply` value from argv.
 * @param baseDir Base directory for an `@path` (default `process.cwd()`).
 * @returns The parsed request, or an actionable error.
 */
export function parseEditorApplyRequest(
  raw: string,
  baseDir: string = process.cwd(),
): { readonly request: EditorApplyRequest } | { readonly error: string } {
  let text = raw;
  if (raw.startsWith('@')) {
    const file = resolve(baseDir, raw.slice(1));
    try {
      text = readFileSync(file, 'utf-8');
    } catch (error) {
      return { error: `cannot read --apply payload ${file}: ${(error as Error).message}` };
    }
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return { error: `--apply must be JSON (inline or @file): ${(error as Error).message}` };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { error: '--apply must be a JSON object' };
  }

  const record = parsed as Record<string, unknown>;
  const edit = record.edit;
  if (typeof edit !== 'object' || edit === null || Array.isArray(edit)) {
    return { error: '--apply requires an "edit" object ({ kind, spec })' };
  }
  const kind = (edit as Record<string, unknown>).kind;
  const spec = (edit as Record<string, unknown>).spec;
  if (typeof kind !== 'string' || EDITOR_EDIT_KINDS.every((known) => known !== kind)) {
    return {
      error: `--apply edit.kind "${String(kind)}" is not one of: ${EDITOR_EDIT_KINDS.join(', ')}`,
    };
  }
  if (typeof spec !== 'object' || spec === null || Array.isArray(spec)) {
    return { error: '--apply edit.spec must be an object' };
  }
  if (record.expectedChecksum !== undefined && typeof record.expectedChecksum !== 'string') {
    return { error: '--apply expectedChecksum must be a string when supplied' };
  }
  if (record.dryRun !== undefined && typeof record.dryRun !== 'boolean') {
    return { error: '--apply dryRun must be a boolean when supplied' };
  }
  if (record.artefactPaths !== undefined) {
    const paths = record.artefactPaths;
    if (typeof paths !== 'object' || paths === null || Array.isArray(paths)) {
      return { error: '--apply artefactPaths must be an object { json, mermaid }' };
    }
    for (const key of ['json', 'mermaid'] as const) {
      if (typeof (paths as Record<string, unknown>)[key] !== 'string') {
        return { error: `--apply artefactPaths.${key} must be a string` };
      }
    }
  }

  return {
    request: {
      edit: edit as unknown as EditorEdit,
      ...(record.expectedChecksum !== undefined
        ? { expectedChecksum: record.expectedChecksum as string }
        : {}),
      ...(record.dryRun !== undefined ? { dryRun: record.dryRun as boolean } : {}),
      ...(record.artefactPaths !== undefined
        ? { artefactPaths: record.artefactPaths as EditorApplyRequest['artefactPaths'] }
        : {}),
    },
  };
}

/** Runs one headless apply through the write bridge. */
export interface EditorApplyOutcome {
  /** True when the edit was accepted (written, or valid on a dry run). */
  readonly ok: boolean;
  /** Process exit code (0 accepted, 1 refused/failed). */
  readonly code: number;
  /** The bridge result, when the edit got that far. */
  readonly result?: import('../src/story-line/editor/api').EditApplyResult;
  /** Actionable failure message. */
  readonly message: string;
}

/**
 * Applies one edit headlessly (`--apply`).
 *
 * The load-time checksum is the default concurrency token, so an external edit
 * between load and apply is refused rather than clobbered.
 *
 * @param options Content path and CLI flags.
 * @param adapter The game content adapter.
 * @param request The parsed apply payload.
 * @returns The bridge result plus an exit code.
 */
export function applyHeadlessEdit(
  options: StorylineEditorCliOptions,
  adapter: ContentAdapter,
  request: EditorApplyRequest,
): EditorApplyOutcome {
  let session;
  try {
    session = loadEditorSession({ contentPath: options.contentPath, adapter });
  } catch (error) {
    return { ok: false, code: 1, message: (error as Error).message };
  }

  const result = applyEdit({
    contentPath: session.contentPath,
    adapter,
    edit: request.edit,
    expectedChecksum: request.expectedChecksum ?? session.checksum,
    dryRun: request.dryRun ?? options.dryRun,
    artefactPaths: request.artefactPaths ?? session.artefactPaths,
    manualDocs: session.manualDocs,
    baseDir: session.baseDir,
  });

  return { ok: result.ok, code: result.ok ? 0 : 1, result, message: result.message };
}

/**
 * Runs the `--apply` mode: resolve the adapter, parse the payload, apply once.
 *
 * @param options The CLI options (including the raw `--apply` value).
 * @param deps Optional test seams.
 * @returns Process exit code (0 accepted, 1 refused/failed).
 */
async function runApplyMode(
  options: StorylineEditorCliOptions,
  deps: StorylineEditorCliDeps,
): Promise<number> {
  const adapter = await resolveEditorAdapter(options.adapterRef, deps.importer);
  if (!adapter) {
    process.stderr.write(
      `storyline-editor: unknown --adapter "${options.adapterRef ?? ''}" — use a shipped adapter id ` +
        '(gym) or a module exporting a ContentAdapter\n',
    );
    return 1;
  }

  const parsed = parseEditorApplyRequest(options.apply as string);
  if ('error' in parsed) {
    process.stderr.write(`storyline-editor: ${parsed.error}\n`);
    return 1;
  }

  const outcome = applyHeadlessEdit(options, adapter, parsed.request);
  if (outcome.result) {
    process.stdout.write(`${JSON.stringify(outcome.result, null, 2)}\n`);
  }
  if (!outcome.ok) process.stderr.write(`storyline-editor: ${outcome.message}\n`);
  return outcome.code;
}

/**
 * Runs the editor CLI.
 *
 * @param argv Raw arguments (defaults to `process.argv.slice(2)`).
 * @param deps Optional test seams.
 * @returns Exit code: 0 when serving (the dev server keeps the process alive),
 *          when help was shown or when a headless apply succeeded; 1 on any
 *          failure, including a refused edit.
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

  if (options.apply !== undefined) {
    return runApplyMode(options, deps);
  }

  const launched = await launchEditor(options, deps);
  if (!launched.ok) {
    process.stderr.write(`storyline-editor: ${launched.message}\n`);
    return launched.code;
  }

  const { host } = launched;

  const localUrls =
    host.urls.local.length > 0 ? host.urls.local : [host.url ?? `http://${options.host}:${options.port}`];
  const banner: string[] = ['storyline-editor: serving the story-line graph:'];
  for (const url of localUrls) banner.push(`storyline-editor:   local:   ${url}`);
  for (const url of host.urls.network) banner.push(`storyline-editor:   network: ${url}`);
  banner.push('storyline-editor: press Ctrl+C to stop');

  if (!isLoopbackHost(options.host)) {
    // The editor has no authentication and can write the loaded content CSV, so
    // a non-loopback bind must be visible (CG-0MVSRDOT400777NH AC4).
    banner.push(
      'storyline-editor: WARNING: bound to a non-loopback interface — the editor is reachable',
      `storyline-editor: from the network and can write the loaded content CSV (${options.contentPath});`,
      'storyline-editor: it has no authentication. Stop it when done, or relaunch with --host 127.0.0.1.',
    );
  }
  process.stdout.write(`${banner.join('\n')}\n`);

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
