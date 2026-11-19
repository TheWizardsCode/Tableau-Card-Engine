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
  DEFAULT_CONTENT_FILES,
  DEFAULT_CONTENT_PATH,
  getContentAdapter,
  resolveContentAdapter,
  type ContentFileSpec,
} from '../src/story-line/content/adapters';
import {
  contentValidationToJson,
  formatContentValidationReport,
  validateContentCsv,
  type ContentValidationResult,
} from '../src/story-line/content/validate';
import { parseArgv } from './storyline-cli-support';

/** CLI usage text. */
export const VALIDATE_USAGE = `Validate story-line content against the generic story-line rules.

Usage:
  npx tsx scripts/validate-storylines.ts [options]

Options:
  --csv <path>       Validate one content CSV (default: every shipped content file)
  --game <id>        Override the content adapter (default: each file's own adapter)
  --json             Emit the machine-readable JSON report
  --fail-on-cycle    Treat cycles as hard errors (default: informational)
  --help             Show this help

With no --csv, every file in the shipped content registry is validated, each
with the adapter it declares, so a second content file cannot escape CI.

Exit codes: 0 = valid, 1 = invalid or unreadable content.`;

/** Parsed validator CLI options. */
export interface ValidateStorylinesCliOptions {
  readonly csvPath: string;
  /** True when `--csv` was supplied (single-file mode). */
  readonly csvProvided: boolean;
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
  const csv = flags.get('csv');
  return {
    csvPath: csv ?? DEFAULT_CONTENT_PATH,
    csvProvided: csv !== undefined,
    gameId: flags.get('game'),
    json: flags.has('json'),
    failOnCycle: flags.has('fail-on-cycle'),
    help: flags.has('help'),
  };
}

/** One validated content file, paired with the spec it was read through. */
interface ValidatedFile {
  readonly spec: ContentFileSpec;
  readonly result: ContentValidationResult;
}

/**
 * Validates every file in the shipped content registry.
 *
 * Each file is read through its **own** adapter, so one shipped content file
 * cannot borrow another's column mapping. An unreadable file is reported and
 * makes the run invalid rather than aborting the remaining files.
 *
 * @param opts Parsed CLI options.
 * @returns Exit code: 0 when every file is valid, 1 otherwise.
 */
function runAllContentFiles(opts: ValidateStorylinesCliOptions): number {
  const override =
    opts.gameId === undefined ? undefined : resolveContentAdapter(opts.gameId);
  if (opts.gameId !== undefined && override === undefined) {
    process.stderr.write(
      `validate-storylines: unknown --game "${opts.gameId}" (shipped adapters: gym, long-erasure)\n`,
    );
    return 1;
  }

  const validated: ValidatedFile[] = [];
  let ok = true;

  for (const spec of DEFAULT_CONTENT_FILES) {
    const adapter = override ?? getContentAdapter(spec.adapterId);
    if (!adapter) {
      process.stderr.write(
        `validate-storylines: content file ${spec.csv} declares unknown adapter "${spec.adapterId}"\n`,
      );
      ok = false;
      continue;
    }
    let csv: string;
    try {
      csv = readFileSync(resolve(process.cwd(), spec.csv), 'utf-8');
    } catch (err) {
      process.stderr.write(
        `validate-storylines: cannot read ${spec.csv}: ${(err as Error).message}\n`,
      );
      ok = false;
      continue;
    }
    const result = validateContentCsv(csv, adapter, { failOnCycle: opts.failOnCycle });
    if (!result.valid) ok = false;
    validated.push({ spec, result });
  }

  if (opts.json) {
    process.stdout.write(
      `${JSON.stringify(
        {
          valid: ok,
          files: validated.map(({ spec, result }) => ({
            csv: spec.csv,
            adapterId: result.gameId,
            ...JSON.parse(contentValidationToJson(result)),
          })),
        },
        null,
        2,
      )}\n`,
    );
    return ok ? 0 : 1;
  }

  for (const { spec, result } of validated) {
    process.stdout.write(`${spec.csv} (adapter ${result.gameId})\n`);
    process.stdout.write(`${formatContentValidationReport(result)}\n\n`);
  }
  return ok ? 0 : 1;
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

  // No `--csv`: validate every shipped content file through its own adapter.
  if (!opts.csvProvided) return runAllContentFiles(opts);

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
