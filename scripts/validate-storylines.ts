#!/usr/bin/env node
/**
 * Story-line content validator CLI.
 *
 * Runs the static content validator over a game's story-line content CSV and
 * exits non-zero when the content is invalid:
 *
 * ```bash
 * npm run storylines:validate
 * npm run storylines:validate -- --json
 * npm run storylines:validate -- --csv path/to/content.csv
 * npm run storylines:validate -- --csv path/to/content.csv --game gym
 * npm run storylines:validate -- --fail-on-cycle
 * ```
 *
 * Runs under `tsx` (`npx tsx scripts/validate-storylines.ts …`); the content
 * module is Phaser-free and game-import-free, so no Vite loader is needed.
 *
 * @module
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  DEFAULT_CONTENT_PATH,
  resolveContentAdapter,
} from '../src/story-line/content/adapters';
import {
  contentValidationToJson,
  formatContentValidationReport,
  validateContentCsv,
} from '../src/story-line/content/validate';
import { parseArgv } from './storyline-cli-support';

/** CLI usage text. */
export const VALIDATE_USAGE = `Validate story-line content against the generic story-line rules.

Usage:
  npx tsx scripts/validate-storylines.ts [options]

Options:
  --csv <path>       Content CSV to validate (default: ${DEFAULT_CONTENT_PATH})
  --game <id>        Content adapter id (default: gym)
  --json             Emit the machine-readable JSON report
  --fail-on-cycle    Treat cycles as hard errors (default: informational)
  --help             Show this help

Exit codes: 0 = valid, 1 = invalid or unreadable content.`;

/** Parsed validator CLI options. */
export interface ValidateStorylinesCliOptions {
  readonly csvPath: string;
  readonly gameId?: string;
  readonly json: boolean;
  readonly failOnCycle: boolean;
  readonly help: boolean;
}

/**
 * Parses validator argv.
 *
 * @param argv Raw arguments.
 * @returns The parsed options.
 */
export function parseValidateStorylinesArgs(
  argv: readonly string[],
): ValidateStorylinesCliOptions {
  const { flags } = parseArgv(argv);
  return {
    csvPath: flags.get('csv') ?? DEFAULT_CONTENT_PATH,
    gameId: flags.get('game'),
    json: flags.has('json'),
    failOnCycle: flags.has('fail-on-cycle'),
    help: flags.has('help'),
  };
}

/**
 * Runs the validator CLI.
 *
 * @param argv Raw arguments (defaults to `process.argv.slice(2)`).
 * @returns Exit code: 0 when valid, 1 when invalid or unreadable.
 */
export function runValidateStorylinesCli(
  argv: readonly string[] = process.argv.slice(2),
): number {
  const opts = parseValidateStorylinesArgs(argv);
  if (opts.help) {
    process.stdout.write(`${VALIDATE_USAGE}\n`);
    return 0;
  }

  const adapter = resolveContentAdapter(opts.gameId);
  if (!adapter) {
    process.stderr.write(
      `validate-storylines: unknown --game "${opts.gameId ?? ''}" (shipped adapters: gym)\n`,
    );
    return 1;
  }

  const csvPath = resolve(process.cwd(), opts.csvPath);
  let csv: string;
  try {
    csv = readFileSync(csvPath, 'utf-8');
  } catch (err) {
    process.stderr.write(
      `validate-storylines: cannot read ${csvPath}: ${(err as Error).message}\n`,
    );
    return 1;
  }

  const result = validateContentCsv(csv, adapter, { failOnCycle: opts.failOnCycle });
  process.stdout.write(
    `${opts.json ? contentValidationToJson(result) : formatContentValidationReport(result)}\n`,
  );
  return result.valid ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = runValidateStorylinesCli();
}
