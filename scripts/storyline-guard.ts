#!/usr/bin/env node
/**
 * Authored-content route-space and scene-space guard CLI.
 *
 * Promotes the Long Erasure playtest harness's route-space enumeration into a
 * CI guard over any story-line content file: it enumerates the **playable**
 * route space (resource gates and `#when` rules respected) and fails when an
 * authored branch cannot pay out.
 *
 * ```bash
 * npm run storylines:guard                       # every configured target
 * npm run storylines:guard -- --csv a.csv --game gym --initial coins=3
 * npm run storylines:guard -- --manifest episode.json --json
 * ```
 *
 * The no-argument form reads the committed target list
 * (`configs/storyline-guard.json`), so CI runs one command and the content
 * registry of guarded files is data, not code. A target names **exactly one**
 * input: a `csv` (route-space mode) or a `manifest` (scene-space mode, which
 * resolves the content file the manifest itself declares).
 *
 * Exit codes: `0` = every invariant holds, `1` = a violation, a content error,
 * an exhausted search bound, or an unreadable/misconfigured target.
 *
 * Runs under `tsx`; nothing here imports a game module or Phaser.
 *
 * @module
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  contentGuardToJson,
  evaluateContentGuardCsv,
  formatContentGuardReport,
  type ContentGuardOptions,
  type ContentGuardReport,
} from '../src/story-line/content/guard';
import {
  CONTENT_ADAPTERS,
  getContentAdapter,
  resolveContentAdapter,
} from '../src/story-line/content/adapters';
import { cardsFromCsv, parseCsv } from '../src/story-line/content/csv';
import {
  validateEpisodeManifest,
  type EpisodeManifest,
} from '../src/story-line/content/episode-manifest';
import {
  enumerateSceneSpace,
  formatSceneGuardReport,
  sceneGuardToJson,
  type SceneGuardReport,
} from '../src/story-line/content/scene-guard';
import type { ContentAdapter } from '../src/story-line/content/types';
import { resolveResourceKeys } from '../src/story-line/resources';
import { parseArgv, readEpisodeContentBinding } from './storyline-cli-support';

/** Repository-relative default target list. */
export const DEFAULT_GUARD_CONFIG_PATH = 'configs/storyline-guard.json';

/** CLI usage text. */
export const GUARD_USAGE = `Guard authored story-line content against the route-space and scene-space invariants.

Usage:
  npx tsx scripts/storyline-guard.ts [options]

Modes (mutually exclusive):
  --csv <path>                  Guard one content CSV (route-space mode)
  --manifest <path>             Guard one episode manifest and the content file
                                it declares (scene-space mode)

Options:
  --game <id>                   Content adapter id, CSV mode only (default: gym)
  --entry <ids>                 Comma-separated entry card ids (default: every root)
  --initial <k=v,...>           Starting resource bag (default: every declared key = 0)
  --min-rejoin <n>              Minimum rejoin distance for marked choices (default: 2)
  --max-depth <n>               Beats-per-route bound (default: 48)
  --max-states <n>              Explored-state bound (default: 20000)
  --endings <ids>               Comma-separated ending card ids (default: the
                                ending column, then structural terminals)
  --consequential-column <name> Column marking consequential options (default: consequential)
  --ending-column <name>        Column marking ending cards (default: ending)
  --config <path>               Target list for the no-argument form
                                (default: ${DEFAULT_GUARD_CONFIG_PATH})
  --json                        Emit the machine-readable report
  --help                        Show this help

CSV-mode options (--game, --entry, --initial, --min-rejoin, --endings and the two
column overrides) do not apply to --manifest: a manifest declares its own
content adapter and starting bag.

Invariants (route space, CSV mode):
  gated-branch-survivable  every #cost / #when gated option reaches an ending
  ending-reachable         every ending is reachable on a playable route
  consequential-rejoin     every choice marked consequential keeps its branches
                           apart for at least --min-rejoin beats

Invariants (scene space, --manifest mode):
  no-success-on-exhausted-close  no refused beat's exhausted close classifies success
  refusal-reaches-ending         every refusal's exhausted close reaches a declared ending

Marking is ordinary content data: a "consequential" column names the option
labels (or "*"), and an "ending" column marks endings (absent: structural
terminals are the endings).

Combining --csv and --manifest is rejected: each run guards one mode.

Exit codes: 0 = all invariants hold, 1 = a violation, a truncated search, or
an unreadable/misconfigured input (manifest, content or config).`;

/** One configured guard target (a CSV or an episode manifest, plus options). */
export interface StorylineGuardTarget {
  /** Repository-relative (or absolute) content CSV path (route-space mode). */
  readonly csv?: string;
  /**
   * Repository-relative (or absolute) episode manifest path (scene-space mode).
   * The manifest declares its own content adapter and content file.
   */
  readonly manifest?: string;
  /** Content adapter id, CSV mode only (default `gym`). */
  readonly game?: string;
  /** Explicit entry card ids, CSV mode only (default: every root). */
  readonly entry?: readonly string[];
  /** Starting resource bag, CSV mode only. */
  readonly initial?: Readonly<Record<string, number>>;
  /** Minimum rejoin distance override, CSV mode only. */
  readonly minRejoin?: number;
  /** Beats-per-route bound override (both modes). */
  readonly maxDepth?: number;
  /** Explored-state bound override (both modes). */
  readonly maxStates?: number;
  /** Consequential column override, CSV mode only. */
  readonly consequentialColumn?: string;
  /** Ending column override, CSV mode only. */
  readonly endingColumn?: string;
  /** Explicit ending card ids, CSV mode only. */
  readonly endings?: readonly string[];
}

/** The committed target list. */
export interface StorylineGuardConfig {
  /** Targets guarded by the no-argument form, in report order. */
  readonly targets: readonly StorylineGuardTarget[];
}

/** Parsed guard CLI options. */
export interface StorylineGuardCliOptions {
  readonly csvPath: string | null;
  readonly manifestPath: string | null;
  readonly gameId: string | null;
  readonly entryIds: readonly string[] | null;
  readonly initial: Readonly<Record<string, number>> | null;
  readonly minRejoin: number | null;
  readonly maxDepth: number | null;
  readonly maxStates: number | null;
  readonly consequentialColumn: string | null;
  readonly endingColumn: string | null;
  readonly endings: readonly string[] | null;
  readonly configPath: string;
  readonly json: boolean;
  readonly help: boolean;
}

/** Parses a `k=v` resource bag (`coins=3,reputation=1`). */
function parseInitialBag(text: string): Record<string, number> {
  const bag: Record<string, number> = {};
  for (const pair of text.split(',')) {
    const trimmed = pair.trim();
    if (trimmed === '') continue;
    const separator = trimmed.indexOf('=');
    if (separator <= 0) {
      throw new Error(`--initial expects key=value pairs ("coins=3"); got "${trimmed}".`);
    }
    const key = trimmed.slice(0, separator).trim();
    const value = Number(trimmed.slice(separator + 1).trim());
    if (!Number.isFinite(value)) {
      throw new Error(`--initial value for "${key}" is not a number.`);
    }
    bag[key] = value;
  }
  return bag;
}

/** Parses a bounded non-negative integer flag. */
function parseBound(name: string, text: string): number {
  const value = Number(text);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`--${name} expects a positive integer; got "${text}".`);
  }
  return value;
}

/** Parses a comma-separated id list. */
function parseIdList(text: string): string[] {
  return text
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id !== '');
}

/**
 * Parses guard CLI argv.
 *
 * `--csv` and `--manifest` select different guard modes, so passing both is
 * rejected here (with both mode names in the message) instead of silently
 * preferring one.
 *
 * @param argv Raw arguments (without the node/script prefix).
 * @returns The parsed options.
 * @throws Error on a malformed flag value or on a mode combination.
 */
export function parseStorylineGuardArgs(
  argv: readonly string[],
): StorylineGuardCliOptions {
  const { flags } = parseArgv(argv);
  const csvPath = flags.get('csv') ?? null;
  const manifestPath = flags.get('manifest') ?? null;
  if (csvPath !== null && manifestPath !== null) {
    throw new Error(
      '--csv (route-space mode) and --manifest (scene-space mode) are mutually ' +
        'exclusive; pass exactly one of them.',
    );
  }
  const idFlag = (key: string): string | null => flags.get(key) ?? null;
  const initial = idFlag('initial');
  const entry = idFlag('entry');
  const minRejoin = idFlag('min-rejoin');
  const maxDepth = idFlag('max-depth');
  const maxStates = idFlag('max-states');
  const endings = idFlag('endings');
  return {
    csvPath,
    manifestPath,
    gameId: idFlag('game'),
    entryIds: entry === null ? null : parseIdList(entry),
    initial: initial === null ? null : parseInitialBag(initial),
    minRejoin: minRejoin === null ? null : parseBound('min-rejoin', minRejoin),
    maxDepth: maxDepth === null ? null : parseBound('max-depth', maxDepth),
    maxStates: maxStates === null ? null : parseBound('max-states', maxStates),
    consequentialColumn: idFlag('consequential-column'),
    endingColumn: idFlag('ending-column'),
    endings: endings === null ? null : parseIdList(endings),
    configPath: flags.get('config') ?? DEFAULT_GUARD_CONFIG_PATH,
    json: flags.has('json'),
    help: flags.has('help'),
  };
}

/** Resolves a `--game` id to a shipped adapter, or throws an actionable error. */
function requireAdapter(gameId: string): ContentAdapter {
  const adapter = resolveContentAdapter(gameId);
  if (adapter === undefined) {
    throw new Error(
      `unknown --game "${gameId}" (shipped adapters: gym, long-erasure)`,
    );
  }
  return adapter;
}

/** Turns CLI flags (or a config target) into guard options. */
function guardOptionsFrom(source: {
  entry?: readonly string[] | null;
  initial?: Readonly<Record<string, number>> | null;
  minRejoin?: number | null;
  maxDepth?: number | null;
  maxStates?: number | null;
  consequentialColumn?: string | null;
  endingColumn?: string | null;
  endings?: readonly string[] | null;
}): ContentGuardOptions {
  return {
    ...(source.entry !== undefined && source.entry !== null
      ? { entryIds: source.entry }
      : {}),
    ...(source.initial !== undefined && source.initial !== null
      ? { initialResources: source.initial }
      : {}),
    ...(source.minRejoin !== undefined && source.minRejoin !== null
      ? { minRejoinDistance: source.minRejoin }
      : {}),
    ...(source.maxDepth !== undefined && source.maxDepth !== null
      ? { maxDepth: source.maxDepth }
      : {}),
    ...(source.maxStates !== undefined && source.maxStates !== null
      ? { maxStates: source.maxStates }
      : {}),
    ...(source.consequentialColumn !== undefined && source.consequentialColumn !== null
      ? { consequentialColumn: source.consequentialColumn }
      : {}),
    ...(source.endingColumn !== undefined && source.endingColumn !== null
      ? { endingColumn: source.endingColumn }
      : {}),
    ...(source.endings !== undefined && source.endings !== null
      ? { endings: source.endings }
      : {}),
  };
}

/**
 * Loads and minimally validates the committed target list.
 *
 * The document shape is checked here (a readable `targets` array); each
 * target's **input** is resolved per target at guard time, so one malformed
 * target is reported without aborting the rest of the batch.
 */
export function loadGuardConfig(configPath: string): StorylineGuardConfig {
  const absolute = resolve(process.cwd(), configPath);
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(absolute, 'utf-8'));
  } catch (error) {
    throw new Error(`cannot read guard config ${configPath}: ${(error as Error).message}`);
  }
  const targets = (parsed as { targets?: unknown }).targets;
  if (!Array.isArray(targets) || targets.length === 0) {
    throw new Error(`guard config ${configPath} declares no targets.`);
  }
  return { targets: targets as StorylineGuardTarget[] };
}

/** Guards one CSV file and returns its report. */
function guardFile(
  csvPath: string,
  adapter: ContentAdapter,
  options: ContentGuardOptions,
): ContentGuardReport {
  const absolute = resolve(process.cwd(), csvPath);
  const csv = readFileSync(absolute, 'utf-8');
  return evaluateContentGuardCsv(csv, adapter, options);
}

/** The report for one guarded manifest: provenance plus the scene-space report. */
export interface StorylineGuardManifestResult {
  /** The manifest path as given (CLI argument or config value). */
  readonly manifest: string;
  /** The content file path as the manifest's `content.file` declares it. */
  readonly content: string;
  /** The shipped content adapter id the manifest's `content.adapter` names. */
  readonly adapter: string;
  /** The scene-space enumeration's report. */
  readonly report: SceneGuardReport;
}

/** How many validation findings a refusal message quotes before summarising. */
const MAX_QUOTED_FINDINGS = 3;

/**
 * Guards one episode manifest and the content file it declares.
 *
 * Loads the manifest, resolves `content.adapter` through the shipped adapter
 * registry, binds the content file's cards and refuses to enumerate a manifest
 * that does not validate (the validator owns those defects; the guard never
 * guesses at a scene space it cannot describe).
 *
 * @param manifestPath The manifest path as given on the CLI or in the config.
 * @param options      Optional bounds (defaults are the guard's own).
 * @returns The manifest's provenance and its frozen scene-space report.
 * @throws Error when the manifest/content is unreadable, the adapter is
 *         unknown, or the manifest fails validation.
 */
export function guardManifest(
  manifestPath: string,
  options: { readonly maxDepth?: number | null; readonly maxStates?: number | null } = {},
): StorylineGuardManifestResult {
  const absoluteManifest = resolve(process.cwd(), manifestPath);
  let manifestText: string;
  try {
    manifestText = readFileSync(absoluteManifest, 'utf-8');
  } catch (error) {
    throw new Error(`cannot read manifest ${manifestPath}: ${(error as Error).message}`);
  }
  let document: unknown;
  try {
    document = JSON.parse(manifestText) as unknown;
  } catch (error) {
    throw new Error(`cannot parse manifest ${manifestPath}: ${(error as Error).message}`);
  }

  const binding = readEpisodeContentBinding(document);
  if ('error' in binding) {
    throw new Error(`${binding.error} (${manifestPath})`);
  }
  const adapter = getContentAdapter(binding.adapter);
  if (adapter === undefined) {
    throw new Error(
      `unknown content.adapter "${binding.adapter}" in ${manifestPath} ` +
        `(shipped adapters: ${Object.keys(CONTENT_ADAPTERS).join(', ')})`,
    );
  }

  const absoluteContent = resolve(process.cwd(), binding.file);
  let contentText: string;
  try {
    contentText = readFileSync(absoluteContent, 'utf-8');
  } catch (error) {
    throw new Error(
      `cannot read content ${binding.file} declared by ${manifestPath}: ` +
        `${(error as Error).message}`,
    );
  }

  const cards = cardsFromCsv(parseCsv(contentText), adapter);
  const declaredKeys = cards.flatMap((card) => card.resourceKeys);
  const validation = validateEpisodeManifest(
    document,
    cards,
    resolveResourceKeys(declaredKeys.length > 0 ? declaredKeys : undefined),
    adapter,
  );
  if (!validation.valid) {
    const quoted = validation.findings
      .slice(0, MAX_QUOTED_FINDINGS)
      .map((finding) => `${finding.code}: ${finding.message}`)
      .join('; ');
    const remainder = validation.findings.length - MAX_QUOTED_FINDINGS;
    throw new Error(
      `manifest ${manifestPath} fails validation ` +
        `(${validation.findings.length} finding${validation.findings.length === 1 ? '' : 's'}): ` +
        `${quoted}${remainder > 0 ? `; +${remainder} more` : ''}`,
    );
  }

  const report = enumerateSceneSpace(document as EpisodeManifest, cards, {
    ...(options.maxDepth === undefined || options.maxDepth === null
      ? {}
      : { maxDepth: options.maxDepth }),
    ...(options.maxStates === undefined || options.maxStates === null
      ? {}
      : { maxStates: options.maxStates }),
    adapter,
  });
  return { manifest: manifestPath, content: binding.file, adapter: adapter.gameId, report };
}

/**
 * Serialises one guarded manifest as its stable JSON report.
 *
 * The provenance keys (`manifest`, `content`, `adapter`) lead and the
 * scene-space report spreads after them, so the report keeps the existing
 * top-level `valid` plus per-input detail and adds the scene-space keys
 * (`invariants`, `sceneExits`, `beatRefusals`, `violations`, `exploration`).
 * Key order is fixed and no clock is read, so two runs are byte-identical.
 */
export function manifestGuardToJson(result: StorylineGuardManifestResult): string {
  return JSON.stringify(
    {
      manifest: result.manifest,
      content: result.content,
      adapter: result.adapter,
      ...(JSON.parse(sceneGuardToJson(result.report)) as Record<string, unknown>),
    },
    null,
    2,
  );
}

/** Renders a report block for one CSV target. */
function renderReport(report: ContentGuardReport, csvPath: string, json: boolean): string {
  return json
    ? `${JSON.stringify({ csv: csvPath, ...JSON.parse(contentGuardToJson(report)) }, null, 2)}`
    : formatContentGuardReport(report, csvPath);
}

/** One configured target's resolved input (exactly one of the two modes). */
type ResolvedTargetInput =
  | { readonly kind: 'csv'; readonly path: string }
  | { readonly kind: 'manifest'; readonly path: string };

/**
 * Resolves a target's single input, rejecting a malformed target.
 *
 * @throws Error naming both modes when a target names both inputs, and naming
 *         the expected inputs when it names neither.
 */
function resolveTargetInput(target: StorylineGuardTarget): ResolvedTargetInput {
  const csv = typeof target?.csv === 'string' ? target.csv.trim() : '';
  const manifest = typeof target?.manifest === 'string' ? target.manifest.trim() : '';
  if (csv !== '' && manifest !== '') {
    throw new Error(
      'target names both "csv" (route-space mode) and "manifest" (scene-space ' +
        'mode); name exactly one input',
    );
  }
  if (csv === '' && manifest === '') {
    throw new Error('target names no input; add a "csv" or a "manifest" path');
  }
  return csv !== '' ? { kind: 'csv', path: csv } : { kind: 'manifest', path: manifest };
}

/** A target's label for a batch diagnostic (never throws on a malformed target). */
function targetLabel(target: StorylineGuardTarget, index: number): string {
  const csv = typeof target?.csv === 'string' ? target.csv.trim() : '';
  const manifest = typeof target?.manifest === 'string' ? target.manifest.trim() : '';
  if (csv !== '') return csv;
  if (manifest !== '') return manifest;
  return `target #${index + 1}`;
}

/** One successfully guarded configured input, in config order. */
type GuardedTarget =
  | { readonly kind: 'csv'; readonly csv: string; readonly report: ContentGuardReport }
  | { readonly kind: 'manifest'; readonly result: StorylineGuardManifestResult };

/**
 * Runs the guard CLI.
 *
 * @param argv Raw arguments (defaults to `process.argv.slice(2)`).
 * @returns Exit code: `0` when every invariant holds, `1` otherwise.
 */
export function runStorylineGuardCli(
  argv: readonly string[] = process.argv.slice(2),
): number {
  let opts: StorylineGuardCliOptions;
  try {
    opts = parseStorylineGuardArgs(argv);
  } catch (error) {
    process.stderr.write(`storyline-guard: ${(error as Error).message}\n`);
    return 1;
  }
  if (opts.help) {
    process.stdout.write(`${GUARD_USAGE}\n`);
    return 0;
  }

  // ── Ad-hoc single-input modes ───────────────────────────────
  if (opts.csvPath !== null) {
    try {
      const adapter = requireAdapter(opts.gameId ?? 'gym');
      const report = guardFile(opts.csvPath, adapter, guardOptionsFrom(opts));
      process.stdout.write(`${renderReport(report, opts.csvPath, opts.json)}\n`);
      return report.valid ? 0 : 1;
    } catch (error) {
      process.stderr.write(`storyline-guard: ${(error as Error).message}\n`);
      return 1;
    }
  }

  if (opts.manifestPath !== null) {
    try {
      const result = guardManifest(opts.manifestPath, {
        maxDepth: opts.maxDepth,
        maxStates: opts.maxStates,
      });
      process.stdout.write(
        `${opts.json ? manifestGuardToJson(result) : formatSceneGuardReport(result.report, result.manifest)}\n`,
      );
      return result.report.valid ? 0 : 1;
    } catch (error) {
      process.stderr.write(`storyline-guard: ${(error as Error).message}\n`);
      return 1;
    }
  }

  // ── Configured-target mode (the CI invocation) ──────────────
  let config: StorylineGuardConfig;
  try {
    config = loadGuardConfig(opts.configPath);
  } catch (error) {
    process.stderr.write(`storyline-guard: ${(error as Error).message}\n`);
    return 1;
  }

  const guarded: GuardedTarget[] = [];
  let ok = true;
  for (const [index, target] of config.targets.entries()) {
    try {
      const input = resolveTargetInput(target);
      if (input.kind === 'csv') {
        const adapter = requireAdapter(target.game ?? 'gym');
        const report = guardFile(input.path, adapter, guardOptionsFrom(target));
        guarded.push({ kind: 'csv', csv: input.path, report });
        if (!report.valid) ok = false;
        continue;
      }
      const result = guardManifest(input.path, {
        maxDepth: target.maxDepth ?? null,
        maxStates: target.maxStates ?? null,
      });
      guarded.push({ kind: 'manifest', result });
      if (!result.report.valid) ok = false;
    } catch (error) {
      process.stderr.write(
        `storyline-guard: ${targetLabel(target, index)}: ${(error as Error).message}\n`,
      );
      ok = false;
    }
  }

  if (opts.json) {
    process.stdout.write(
      `${JSON.stringify(
        {
          valid: ok,
          files: guarded.flatMap((entry) =>
            entry.kind === 'csv'
              ? [
                  {
                    csv: entry.csv,
                    ...(JSON.parse(contentGuardToJson(entry.report)) as Record<string, unknown>),
                  },
                ]
              : [],
          ),
          manifests: guarded.flatMap((entry) =>
            entry.kind === 'manifest'
              ? [(JSON.parse(manifestGuardToJson(entry.result)) as Record<string, unknown>)]
              : [],
          ),
        },
        null,
        2,
      )}\n`,
    );
    return ok ? 0 : 1;
  }

  for (const entry of guarded) {
    process.stdout.write(
      `${entry.kind === 'csv' ? formatContentGuardReport(entry.report, entry.csv) : formatSceneGuardReport(entry.result.report, entry.result.manifest)}\n\n`,
    );
  }
  return ok ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = runStorylineGuardCli();
}
