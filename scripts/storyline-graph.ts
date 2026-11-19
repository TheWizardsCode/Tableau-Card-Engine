#!/usr/bin/env node
/**
 * Story-line graph / manifest export CLI.
 *
 * Writes a deterministic, machine-readable picture of a game's story-line
 * content:
 *
 * - `--format mermaid` → a Mermaid flowchart (default
 *   `example-games/gym/content/storyline-graph.mmd`);
 * - `--format json` → a manifest that validates against
 *   `schemas/story-line-manifest.schema.json` (default
 *   `example-games/gym/content/storyline-manifest.json`).
 *
 * `--check` compares the generated output with the committed artefact and
 * exits non-zero on drift (a CI/pre-commit guard); `--out` targets any path.
 *
 * ```bash
 * npm run storylines:graph -- --format mermaid
 * npm run storylines:graph -- --format json --check
 * npm run storylines:graph -- --csv other.csv --game tavern --out /tmp/g.json
 * ```
 *
 * Runs under `tsx`; nothing here imports a game or Phaser.
 *
 * @module
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  DEFAULT_CONTENT_FILES,
  DEFAULT_CONTENT_PATH,
  findContentFileSpec,
  getContentAdapter,
  resolveContentAdapter,
} from '../src/story-line/content/adapters';
import {
  buildStorylineManifestFromCsv,
  type StorylineManifest,
} from '../src/story-line/content/manifest';
import {
  DEFAULT_ARTEFACT_PATHS,
  renderArtefacts,
} from '../src/story-line/content/artefacts';
import { parseArgv } from './storyline-cli-support';
import type { ContentAdapter } from '../src/story-line/content/types';

/**
 * Default committed artefact paths, relative to the repository root.
 *
 * The canonical declaration lives with the generated-artefact module
 * (`src/story-line/content/artefacts.ts`); this CLI re-exports it so existing
 * importers keep working against one source of truth.
 */
export const DEFAULT_GRAPH_OUTPUTS = DEFAULT_ARTEFACT_PATHS;

/** CLI usage text. */
export const GRAPH_USAGE = `Export a deterministic story-line manifest or Mermaid flowchart.

Usage:
  npx tsx scripts/storyline-graph.ts [options]

Options:
  --format <mermaid|json>  Output format (default: mermaid)
  --csv <path>             Content CSV to read (default: every shipped content file)
  --game <id>              Content adapter id (default: the file's own adapter)
  --out <path>             Output path (default: the content file's committed artefact)
  --check                  Compare with the committed artefact; exit 1 on drift
  --help                   Show this help

With no --csv, every file in the shipped content registry is exported with the
adapter it declares and compared against its own committed artefact, so the
drift guard covers the whole content set.

Exit codes: 0 = written / no drift, 1 = drift, missing artefact or bad input.`;

/** Parsed graph CLI options. */
export interface StorylineGraphCliOptions {
  readonly format: 'mermaid' | 'json';
  readonly csvPath: string;
  /** True when `--csv` was supplied (single-file mode). */
  readonly csvProvided: boolean;
  readonly gameId?: string;
  readonly outPath: string;
  readonly outProvided: boolean;
  readonly check: boolean;
  readonly help: boolean;
}

/**
 * Parses graph-exporter argv.
 *
 * @param argv Raw arguments.
 * @returns The parsed options (with the format-appropriate default output).
 */
export function parseStorylineGraphArgs(
  argv: readonly string[],
): StorylineGraphCliOptions {
  const { flags } = parseArgv(argv);
  const format = flags.get('format') === 'json' ? 'json' : 'mermaid';
  const csv = flags.get('csv');
  const out = flags.get('out');
  return {
    format,
    csvPath: csv ?? DEFAULT_CONTENT_PATH,
    csvProvided: csv !== undefined,
    gameId: flags.get('game'),
    outPath: out ?? DEFAULT_GRAPH_OUTPUTS[format],
    outProvided: out !== undefined,
    check: flags.has('check'),
    help: flags.has('help'),
  };
}

/**
 * Builds the artefact content for the given format.
 *
 * @param format   Artefact format (`json` serialises the manifest).
 * @param manifest The built manifest.
 * @returns The artefact text.
 */
export function renderGraphArtefact(
  format: 'mermaid' | 'json',
  manifest: StorylineManifest,
): string {
  return renderArtefacts(manifest)[format];
}

/**
 * Renders one content file's artefact text.
 *
 * @param format Artefact format.
 * @param csv    Raw content CSV.
 * @param adapter The adapter the file is read through.
 * @returns The artefact text.
 * @throws Error when the adapter is unknown or the content cannot be compiled.
 */
function renderContentArtefact(
  format: 'mermaid' | 'json',
  csv: string,
  adapter: ContentAdapter,
): string {
  return renderGraphArtefact(format, buildStorylineManifestFromCsv(csv, adapter));
}

/**
 * Exports (writes or drift-checks) one content file's artefact.
 *
 * @param format    Artefact format.
 * @param csvPath   Content CSV path (as supplied, resolved for reading).
 * @param outPath   Artefact path (as supplied, resolved for writing).
 * @param check     `true` compares with the committed artefact instead of writing.
 * @param gameId    Optional adapter override (defaults to the file's own adapter).
 * @param ownAdapterId The adapter the content registry declares for this file.
 * @returns `true` on success, `false` on a read/build/drift failure.
 */
function exportContentArtefact(
  format: 'mermaid' | 'json',
  csvPath: string,
  outPath: string,
  check: boolean,
  gameId: string | undefined,
  ownAdapterId: string | undefined,
): boolean {
  const adapterId = gameId ?? ownAdapterId;
  const adapter =
    adapterId === undefined ? resolveContentAdapter() : getContentAdapter(adapterId);
  if (!adapter) {
    process.stderr.write(
      `storyline-graph: unknown --game "${adapterId ?? ''}" (shipped adapters: gym, long-erasure)\n`,
    );
    return false;
  }

  const absoluteCsv = resolve(process.cwd(), csvPath);
  const absoluteOut = resolve(process.cwd(), outPath);

  let csv: string;
  try {
    csv = readFileSync(absoluteCsv, 'utf-8');
  } catch (err) {
    process.stderr.write(
      `storyline-graph: cannot read ${absoluteCsv}: ${(err as Error).message}\n`,
    );
    return false;
  }

  let content: string;
  try {
    content = renderContentArtefact(format, csv, adapter);
  } catch (err) {
    process.stderr.write(
      `storyline-graph: cannot build the manifest from ${absoluteCsv}: ${(err as Error).message}\n`,
    );
    return false;
  }

  if (check) {
    if (!existsSync(absoluteOut)) {
      process.stderr.write(`storyline-graph: missing committed artefact ${absoluteOut}\n`);
      return false;
    }
    if (readFileSync(absoluteOut, 'utf-8') !== content) {
      process.stderr.write(
        `storyline-graph: drift detected in ${absoluteOut} — regenerate with ` +
          `\`npm run storylines:graph -- --format ${format}\`\n`,
      );
      return false;
    }
    process.stdout.write(`storyline-graph: ${absoluteOut} is up to date\n`);
    return true;
  }

  writeFileSync(absoluteOut, content, 'utf-8');
  process.stdout.write(`storyline-graph: wrote ${absoluteOut}\n`);
  return true;
}

/**
 * Runs the graph-export CLI.
 *
 * @param argv Raw arguments (defaults to `process.argv.slice(2)`).
 * @returns Exit code: 0 on success / no drift, 1 on drift or bad input.
 */
export function runStorylineGraphCli(
  argv: readonly string[] = process.argv.slice(2),
): number {
  const opts = parseStorylineGraphArgs(argv);
  if (opts.help) {
    process.stdout.write(`${GRAPH_USAGE}\n`);
    return 0;
  }

  // No `--csv`: export every shipped content file against its own artefact.
  if (!opts.csvProvided) {
    if (opts.outProvided) {
      process.stderr.write(
        'storyline-graph: --out requires --csv (one content file at a time)\n',
      );
      return 1;
    }
    let ok = true;
    for (const spec of DEFAULT_CONTENT_FILES) {
      if (
        !exportContentArtefact(
          opts.format,
          spec.csv,
          spec.artefacts[opts.format],
          opts.check,
          opts.gameId,
          spec.adapterId,
        )
      ) {
        ok = false;
      }
    }
    return ok ? 0 : 1;
  }

  // Single-file mode: an ad-hoc file keeps the format default; a registered
  // file uses its own paired artefact unless --out overrides it.
  const spec = findContentFileSpec(opts.csvPath);
  const outPath = opts.outProvided
    ? opts.outPath
    : (spec?.artefacts[opts.format] ?? DEFAULT_GRAPH_OUTPUTS[opts.format]);
  return exportContentArtefact(
    opts.format,
    opts.csvPath,
    outPath,
    opts.check,
    opts.gameId,
    spec?.adapterId,
  )
    ? 0
    : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = runStorylineGraphCli();
}
