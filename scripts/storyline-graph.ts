#!/usr/bin/env node
/**
 * Story-line graph / manifest export CLI.
 *
 * Writes a deterministic, machine-readable picture of a game's story-line
 * content:
 *
 * - `--format mermaid` → a Mermaid flowchart (default
 *   `example-games/gym/data/storyline-graph.mmd`);
 * - `--format json` → a manifest that validates against
 *   `schemas/story-line-manifest.schema.json` (default
 *   `example-games/gym/data/storyline-manifest.json`).
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
  DEFAULT_CONTENT_PATH,
  resolveContentAdapter,
} from '../src/story-line/content/adapters';
import {
  buildStorylineManifestFromCsv,
  renderMermaid,
  serialiseManifest,
  type StorylineManifest,
} from '../src/story-line/content/manifest';
import { parseArgv } from './storyline-cli-support';

/** Default committed artefact paths, relative to the repository root. */
export const DEFAULT_GRAPH_OUTPUTS = {
  mermaid: 'example-games/gym/data/storyline-graph.mmd',
  json: 'example-games/gym/data/storyline-manifest.json',
} as const;

/** CLI usage text. */
export const GRAPH_USAGE = `Export a deterministic story-line manifest or Mermaid flowchart.

Usage:
  npx tsx scripts/storyline-graph.ts [options]

Options:
  --format <mermaid|json>  Output format (default: mermaid)
  --csv <path>             Content CSV to read (default: ${DEFAULT_CONTENT_PATH})
  --game <id>              Content adapter id (default: gym)
  --out <path>             Output path (default: the committed Gym artefact)
  --check                  Compare with the committed artefact; exit 1 on drift
  --help                   Show this help

Exit codes: 0 = written / no drift, 1 = drift, missing artefact or bad input.`;

/** Parsed graph CLI options. */
export interface StorylineGraphCliOptions {
  readonly format: 'mermaid' | 'json';
  readonly csvPath: string;
  readonly gameId?: string;
  readonly outPath: string;
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
  return {
    format,
    csvPath: flags.get('csv') ?? DEFAULT_CONTENT_PATH,
    gameId: flags.get('game'),
    outPath: flags.get('out') ?? DEFAULT_GRAPH_OUTPUTS[format],
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
  return format === 'json' ? serialiseManifest(manifest) : renderMermaid(manifest);
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

  const adapter = resolveContentAdapter(opts.gameId);
  if (!adapter) {
    process.stderr.write(
      `storyline-graph: unknown --game "${opts.gameId ?? ''}" (shipped adapters: gym)\n`,
    );
    return 1;
  }

  const csvPath = resolve(process.cwd(), opts.csvPath);
  const outPath = resolve(process.cwd(), opts.outPath);

  let csv: string;
  try {
    csv = readFileSync(csvPath, 'utf-8');
  } catch (err) {
    process.stderr.write(
      `storyline-graph: cannot read ${csvPath}: ${(err as Error).message}\n`,
    );
    return 1;
  }

  let content: string;
  try {
    content = renderGraphArtefact(
      opts.format,
      buildStorylineManifestFromCsv(csv, adapter),
    );
  } catch (err) {
    process.stderr.write(
      `storyline-graph: cannot build the manifest from ${csvPath}: ${(err as Error).message}\n`,
    );
    return 1;
  }

  if (opts.check) {
    if (!existsSync(outPath)) {
      process.stderr.write(`storyline-graph: missing committed artefact ${outPath}\n`);
      return 1;
    }
    if (readFileSync(outPath, 'utf-8') !== content) {
      process.stderr.write(
        `storyline-graph: drift detected in ${outPath} — regenerate with ` +
          `\`npm run storylines:graph -- --format ${opts.format}\`\n`,
      );
      return 1;
    }
    process.stdout.write(`storyline-graph: ${outPath} is up to date\n`);
    return 0;
  }

  writeFileSync(outPath, content, 'utf-8');
  process.stdout.write(`storyline-graph: wrote ${outPath}\n`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = runStorylineGraphCli();
}
