#!/usr/bin/env node
/**
 * Story-line content authoring CLI.
 *
 * Safe, self-validating content edits through the **single** transactional
 * author API (`src/story-line/content/author.ts`):
 *
 * - `add-card`     appends a new card row (correct column count, no duplicate
 *                  id) and validates the resulting content.
 * - `update-card`  edits an existing card (name, effect, choice links, options
 *                  encoding, story-line id/title and game columns).
 *
 * Every edit is built and validated **in memory** first; an invalid result
 * leaves the content file byte-identical and exits non-zero. `--dry-run`
 * prints the candidate content without writing it.
 *
 * ```bash
 * npm run storylines:author -- add-card --id evt-x --name "X" --effect "…" \
 *   --options "Invest|evt-y;Walk away|" --storyline-id storyline-x \
 *   --storyline-title "X Arc"
 * npm run storylines:author -- update-card --id evt-x --storyline-id storyline-y
 * npm run storylines:author -- add-card --id evt-z --name "Z" --dry-run
 * ```
 *
 * Runs under `tsx`; nothing here imports a game or Phaser.
 *
 * @module
 */

import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

import {
  DEFAULT_CONTENT_PATH,
  resolveContentAdapter,
} from '../src/story-line/content/adapters';
import {
  addContentCard,
  applyContentEditToFile,
  updateContentCard,
  type AddContentCardSpec,
  type ContentEditResult,
  type UpdateContentCardSpec,
} from '../src/story-line/content/author';
import {
  booleanFlag,
  nullableFlag,
  parseArgv,
} from './storyline-cli-support';

/** CLI usage text. */
export const AUTHOR_USAGE = `Transactional story-line content authoring.

Usage:
  npx tsx scripts/storyline-author.ts add-card [options]
  npx tsx scripts/storyline-author.ts update-card [options]

Common options:
  --csv <path>               Content CSV (default: ${DEFAULT_CONTENT_PATH})
  --game <id>                Content adapter id (default: gym)
  --dry-run                  Validate and print the candidate; write nothing
  --field <column=value>     Set a game-specific column (repeatable)
  --help                     Show this help

add-card options:
  --id <id> --name <name> [--effect <text>] [--options <encoding>]
  [--has-choices] [--accept-next <id>] [--reject-next <id>]
  [--storyline-id <id>] [--storyline-title <title>]

update-card options:
  --id <id> [--name <name>] [--effect <text>] [--options <encoding>]
  [--clear-options] [--has-choices true|false]
  [--accept-next <id> | --clear-accept-next]
  [--reject-next <id> | --clear-reject-next]
  [--storyline-id <id> | --clear-storyline]
  [--storyline-title <title>]

Exit codes: 0 = applied (or dry-run valid), 1 = refused (invalid content).`;

/** Parsed author CLI invocation. */
export type AuthorCliOptions =
  | { readonly command: 'add-card'; readonly csvPath: string; readonly gameId?: string; readonly dryRun: boolean; readonly spec: AddContentCardSpec }
  | { readonly command: 'update-card'; readonly csvPath: string; readonly gameId?: string; readonly dryRun: boolean; readonly spec: UpdateContentCardSpec }
  | { readonly command: 'help' }
  | { readonly error: string };

/**
 * Parses author argv into an invocation, a help request, or an error.
 *
 * @param argv Raw arguments.
 * @returns The parsed invocation.
 */
export function parseAuthorCliArgs(argv: readonly string[]): AuthorCliOptions {
  const { flags, positionals, fieldPairs } = parseArgv(argv);
  if (flags.has('help')) return { command: 'help' };
  if (flags.has('field-error')) {
    return { error: `--field expects <column=value>, got "${flags.get('field-error')}"` };
  }
  const command = positionals[0];
  if (command !== 'add-card' && command !== 'update-card') {
    return { error: 'expected a command: add-card | update-card' };
  }

  const csvPath = resolve(process.cwd(), flags.get('csv') ?? DEFAULT_CONTENT_PATH);
  const gameId = flags.get('game');
  const dryRun = flags.has('dry-run');

  const fields: Record<string, string> = {};
  for (const [column, value] of fieldPairs) fields[column] = value;

  const optionalText = (key: string): string | undefined => flags.get(key);

  if (command === 'add-card') {
    const spec: AddContentCardSpec = {
      id: flags.get('id') ?? '',
      name: flags.get('name') ?? '',
      effect: optionalText('effect'),
      hasChoices: booleanFlag(flags, 'has-choices'),
      acceptNextCardId: nullableFlag(flags, 'accept-next', 'clear-accept-next'),
      rejectNextCardId: nullableFlag(flags, 'reject-next', 'clear-reject-next'),
      options: optionalText('options'),
      storylineId: nullableFlag(flags, 'storyline-id', 'clear-storyline'),
      storylineTitle: nullableFlag(flags, 'storyline-title', 'clear-storyline-title'),
      fields,
    };
    return { command, csvPath, gameId, dryRun, spec };
  }

  const spec: UpdateContentCardSpec = {
    id: flags.get('id') ?? '',
    name: optionalText('name'),
    effect: optionalText('effect'),
    hasChoices: booleanFlag(flags, 'has-choices'),
    acceptNextCardId: nullableFlag(flags, 'accept-next', 'clear-accept-next'),
    rejectNextCardId: nullableFlag(flags, 'reject-next', 'clear-reject-next'),
    options: nullableFlag(flags, 'options', 'clear-options'),
    storylineId: nullableFlag(flags, 'storyline-id', 'clear-storyline'),
    storylineTitle: nullableFlag(flags, 'storyline-title', 'clear-storyline-title'),
    fields,
  };
  return { command, csvPath, gameId, dryRun, spec };
}

/**
 * Runs the authoring CLI.
 *
 * @param argv Raw arguments (defaults to `process.argv.slice(2)`).
 * @returns Exit code: 0 = applied or valid dry-run, 1 = refused.
 */
export function runStorylineAuthorCli(
  argv: readonly string[] = process.argv.slice(2),
): number {
  const parsed = parseAuthorCliArgs(argv);
  if ('error' in parsed) {
    process.stderr.write(`storyline-author: ${parsed.error}\n`);
    return 1;
  }
  if (parsed.command === 'help') {
    process.stdout.write(`${AUTHOR_USAGE}\n`);
    return 0;
  }

  const adapter = resolveContentAdapter(parsed.gameId);
  if (!adapter) {
    process.stderr.write(
      `storyline-author: unknown --game "${parsed.gameId ?? ''}" (shipped adapters: gym)\n`,
    );
    return 1;
  }

  const mutate = (csv: string): ContentEditResult =>
    parsed.command === 'add-card'
      ? addContentCard(csv, adapter, parsed.spec)
      : updateContentCard(csv, adapter, parsed.spec);

  const result = applyContentEditToFile({
    contentPath: parsed.csvPath,
    adapter,
    mutate,
    dryRun: parsed.dryRun,
  });

  if (!result.ok) {
    process.stderr.write('storyline-author: refusing to write — validation failed:\n');
    for (const error of result.errors) process.stderr.write(`  - ${error}\n`);
    return 1;
  }

  if (parsed.dryRun) {
    process.stdout.write(
      `storyline-author: dry-run OK (${parsed.command}); no file written\n`,
    );
    process.stdout.write(result.csv);
  } else {
    process.stdout.write(
      `storyline-author: ${parsed.command} applied to ${parsed.csvPath}\n`,
    );
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = runStorylineAuthorCli();
}
