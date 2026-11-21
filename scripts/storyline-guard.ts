#!/usr/bin/env node
/**
 * Authored-content route-space guard CLI.
 *
 * Promotes the Long Erasure playtest harness's route-space enumeration into a
 * CI guard over any story-line content file: it enumerates the **playable**
 * route space (resource gates and `#when` rules respected) and fails when an
 * authored branch cannot pay out.
 *
 * ```bash
 * npm run storylines:guard                       # every configured target
 * npm run storylines:guard -- --csv a.csv --game gym --initial coins=3
 * npm run storylines:guard -- --csv a.csv --json
 * ```
 *
 * The no-argument form reads the committed target list
 * (`configs/storyline-guard.json`), so CI runs one command and the content
 * registry of guarded files is data, not code. A `--csv` run is ad-hoc: every
 * option comes from the flags (or its default).
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
import { resolveContentAdapter } from '../src/story-line/content/adapters';
import type { ContentAdapter } from '../src/story-line/content/types';
import { parseArgv } from './storyline-cli-support';

/** Repository-relative default target list. */
export const DEFAULT_GUARD_CONFIG_PATH = 'configs/storyline-guard.json';

/** CLI usage text. */
export const GUARD_USAGE = `Guard authored story-line content against the route-space invariants.

Usage:
  npx tsx scripts/storyline-guard.ts [options]

Options:
  --csv <path>                  Guard one content CSV (default: every configured target)
  --game <id>                   Content adapter id (default: gym)
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

Invariants:
  gated-branch-survivable  every #cost / #when gated option reaches an ending
  ending-reachable         every ending is reachable on a playable route
  consequential-rejoin     every choice marked consequential keeps its branches
                           apart for at least --min-rejoin beats

Marking is ordinary content data: a "consequential" column names the option
labels (or "*"), and an "ending" column marks endings (absent: structural
terminals are the endings).

Exit codes: 0 = all invariants hold, 1 = a violation or unreadable/misconfigured
content.`;

/** One configured guard target (a content file plus its starting state). */
export interface StorylineGuardTarget {
  /** Repository-relative (or absolute) content CSV path. */
  readonly csv: string;
  /** Content adapter id (default `gym`). */
  readonly game?: string;
  /** Explicit entry card ids (default: every root). */
  readonly entry?: readonly string[];
  /** Starting resource bag. */
  readonly initial?: Readonly<Record<string, number>>;
  /** Minimum rejoin distance override. */
  readonly minRejoin?: number;
  /** Beats-per-route bound override. */
  readonly maxDepth?: number;
  /** Explored-state bound override. */
  readonly maxStates?: number;
  /** Consequential column override. */
  readonly consequentialColumn?: string;
  /** Ending column override. */
  readonly endingColumn?: string;
  /** Explicit ending card ids (default: the ending column / structural terminals). */
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
 * @param argv Raw arguments (without the node/script prefix).
 * @returns The parsed options.
 * @throws Error on a malformed flag value.
 */
export function parseStorylineGuardArgs(
  argv: readonly string[],
): StorylineGuardCliOptions {
  const { flags } = parseArgv(argv);
  const idFlag = (key: string): string | null => flags.get(key) ?? null;
  const initial = idFlag('initial');
  const entry = idFlag('entry');
  const minRejoin = idFlag('min-rejoin');
  const maxDepth = idFlag('max-depth');
  const maxStates = idFlag('max-states');
  const endings = idFlag('endings');
  return {
    csvPath: idFlag('csv'),
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

/** Loads and minimally validates the committed target list. */
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
  for (const target of targets as StorylineGuardTarget[]) {
    if (typeof target?.csv !== 'string' || target.csv.trim() === '') {
      throw new Error(`guard config ${configPath} has a target without a "csv" path.`);
    }
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

/** Renders a report block for one target. */
function renderReport(report: ContentGuardReport, csvPath: string, json: boolean): string {
  return json
    ? `${JSON.stringify({ csv: csvPath, ...JSON.parse(contentGuardToJson(report)) }, null, 2)}`
    : formatContentGuardReport(report, csvPath);
}

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

  // ── Ad-hoc single-file mode ─────────────────────────────────
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

  // ── Configured-target mode (the CI invocation) ──────────────
  let config: StorylineGuardConfig;
  try {
    config = loadGuardConfig(opts.configPath);
  } catch (error) {
    process.stderr.write(`storyline-guard: ${(error as Error).message}\n`);
    return 1;
  }

  const reports: { csv: string; report: ContentGuardReport }[] = [];
  let ok = true;
  for (const target of config.targets) {
    try {
      const adapter = requireAdapter(target.game ?? 'gym');
      const report = guardFile(target.csv, adapter, guardOptionsFrom(target));
      reports.push({ csv: target.csv, report });
      if (!report.valid) ok = false;
    } catch (error) {
      process.stderr.write(
        `storyline-guard: ${target.csv}: ${(error as Error).message}\n`,
      );
      ok = false;
    }
  }

  if (opts.json) {
    process.stdout.write(
      `${JSON.stringify(
        {
          valid: ok,
          files: reports.map(({ csv, report }) => ({
            csv,
            ...JSON.parse(contentGuardToJson(report)),
          })),
        },
        null,
        2,
      )}\n`,
    );
    return ok ? 0 : 1;
  }

  for (const { csv, report } of reports) {
    process.stdout.write(`${formatContentGuardReport(report, csv)}\n\n`);
  }
  return ok ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = runStorylineGuardCli();
}
