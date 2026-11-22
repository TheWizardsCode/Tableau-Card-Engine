#!/usr/bin/env node
/**
 * Story-line content authoring CLI.
 *
 * Safe, self-validating content edits through the **single** transactional
 * author API (`src/story-line/content/author.ts`):
 *
 * - `add-card`     appends a new card row (correct column count, no duplicate
 *                  id) and validates the resulting content.
 * - `add-linked-card` appends a new card **and** links it in from an existing
 *                  card in one transaction: the predecessor gains an option
 *                  pointing at the new card, and only the combined candidate
 *                  is validated — so a forward reference is authored in one
 *                  step instead of backwards from its target.
 * - `add-option`   appends **one** option to an existing card's `options`
 *                  cell without retyping the options already there, and
 *                  validates the resulting content.
 * - `update-card`  edits an existing card (name, effect, context/epilogue
 *                  prose, options encoding, story-line id/title and game
 *                  columns).
 *
 * A card's choice-ness is authored **only** through `--options`; the removed
 * legacy choice/link flags (`--has-choices`, `--accept-next`,
 * `--clear-accept-next`, `--reject-next`, `--clear-reject-next`) are rejected
 * with an explicit usage error rather than being silently ignored.
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
 * npm run storylines:author -- add-linked-card --id evt-branch --name "Branch" \
 *   --link-from evt-x --link-label "Take the branch" --storyline-id storyline-x
 * npm run storylines:author -- add-option --id evt-x --label "Ask after the road" \
 *   --target evt-y --attr cost=coins:2
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
  addLinkedContentCard,
  addOptionToContentCard,
  applyContentEditToFile,
  updateContentCard,
  type AddContentCardSpec,
  type AddLinkedCardSpec,
  type AddOptionContentCardSpec,
  type ContentEditResult,
  type UpdateContentCardSpec,
} from '../src/story-line/content/author';
import {
  nullableFlag,
  parseArgv,
} from './storyline-cli-support';

/** CLI usage text. */
export const AUTHOR_USAGE = `Transactional story-line content authoring.

Usage:
  npx tsx scripts/storyline-author.ts add-card [options]
  npx tsx scripts/storyline-author.ts add-linked-card [options]
  npx tsx scripts/storyline-author.ts add-option [options]
  npx tsx scripts/storyline-author.ts update-card [options]

Common options:
  --csv <path>               Content CSV (default: ${DEFAULT_CONTENT_PATH})
  --game <id>                Content adapter id (default: gym)
  --dry-run                  Validate and print the candidate; write nothing
  --field <column=value>     Set a game-specific column (repeatable)
  --help                     Show this help

add-card options:
  --id <id> --name <name> [--effect <text>] [--options <encoding>]
  [--context <text>] [--epilogue <text>]
  [--storyline-id <id>] [--storyline-title <title>] [--resources <keys>]

add-linked-card options (add-card options, plus):
  --link-from <card-id>      Predecessor that gains the option (required)
  --link-label <label>       Option label (default: the new card's name)

add-option options (append one option without retyping the cell):
  --id <card-id>             Existing card that gains the option (required)
  --label <label>            Option label, unique on that card (required)
  --target <card-id>         Successor card id; omit for a terminal option
  --attr <name=value>        Option attribute (repeatable); the leading # is
                             optional, e.g. --attr cost=coins:2
                             --attr extra=reputation:+1

update-card options:
  --id <id> [--name <name>] [--effect <text>]
  [--options <encoding> | --clear-options]
  [--context <text> | --clear-context]
  [--epilogue <text> | --clear-epilogue]
  [--storyline-id <id> | --clear-storyline]
  [--storyline-title <title>]
  [--resources <keys> | --clear-resources]

Choice nodes are authored through --options (label|target;label2|target2), which
replaces the cell, or add-option, which appends one entry.
Declared resources (--resources "coins,hull") are the keys the option
#cost/#extra/#when attributes may name. Prose is authored only through
--context / --epilogue; the mapped columns are refused as --field keys.

Exit codes: 0 = applied (or dry-run valid), 1 = refused (invalid usage/content).`;

/** Parsed author CLI invocation. */
export type AuthorCliOptions =
  | { readonly command: 'add-card'; readonly csvPath: string; readonly gameId?: string; readonly dryRun: boolean; readonly spec: AddContentCardSpec }
  | { readonly command: 'add-linked-card'; readonly csvPath: string; readonly gameId?: string; readonly dryRun: boolean; readonly spec: AddLinkedCardSpec }
  | { readonly command: 'add-option'; readonly csvPath: string; readonly gameId?: string; readonly dryRun: boolean; readonly spec: AddOptionContentCardSpec }
  | { readonly command: 'update-card'; readonly csvPath: string; readonly gameId?: string; readonly dryRun: boolean; readonly spec: UpdateContentCardSpec }
  | { readonly command: 'help' }
  | { readonly error: string };

/** The commands the author CLI accepts. */
const AUTHOR_COMMANDS = [
  'add-card',
  'add-linked-card',
  'add-option',
  'update-card',
] as const;

/**
 * Legacy choice/link flags that no longer exist.
 *
 * Rejecting them explicitly keeps a stale invocation from becoming a silent
 * no-op: the caller learns that choice nodes are authored through `--options`.
 */
const REMOVED_CHOICE_FLAGS = [
  'has-choices',
  'accept-next',
  'clear-accept-next',
  'reject-next',
  'clear-reject-next',
] as const;

/**
 * Parses author argv into an invocation, a help request, or an error.
 *
 * @param argv Raw arguments.
 * @returns The parsed invocation.
 */
export function parseAuthorCliArgs(argv: readonly string[]): AuthorCliOptions {
  const { flags, positionals, fieldPairs, attributeValues } = parseArgv(argv);
  if (flags.has('help')) return { command: 'help' };
  if (flags.has('field-error')) {
    return { error: `--field expects <column=value>, got "${flags.get('field-error')}"` };
  }
  if (flags.has('attr-error')) {
    return { error: '--attr expects <name=value>, e.g. --attr cost=coins:2' };
  }
  const removedFlag = REMOVED_CHOICE_FLAGS.find((flag) => flags.has(flag));
  if (removedFlag !== undefined) {
    return {
      error: `--${removedFlag} is no longer supported: author a choice node with --options "<label>|<target>;…"`,
    };
  }
  const command = positionals[0];
  if (
    command !== 'add-card' &&
    command !== 'add-linked-card' &&
    command !== 'add-option' &&
    command !== 'update-card'
  ) {
    return { error: `expected a command: ${AUTHOR_COMMANDS.join(' | ')}` };
  }

  const csvPath = resolve(process.cwd(), flags.get('csv') ?? DEFAULT_CONTENT_PATH);
  const gameId = flags.get('game');
  const dryRun = flags.has('dry-run');

  const fields: Record<string, string> = {};
  for (const [column, value] of fieldPairs) fields[column] = value;

  const optionalText = (key: string): string | undefined => flags.get(key);

  if (command === 'add-card' || command === 'add-linked-card') {
    const spec: AddContentCardSpec = {
      id: flags.get('id') ?? '',
      name: flags.get('name') ?? '',
      effect: optionalText('effect'),
      context: optionalText('context'),
      epilogue: optionalText('epilogue'),
      options: optionalText('options'),
      storylineId: nullableFlag(flags, 'storyline-id', 'clear-storyline'),
      storylineTitle: nullableFlag(flags, 'storyline-title', 'clear-storyline-title'),
      resources: optionalText('resources'),
      fields,
    };
    if (command === 'add-card') return { command, csvPath, gameId, dryRun, spec };

    const linkLabel = optionalText('link-label');
    const linkFrom: AddLinkedCardSpec['linkFrom'] = {
      id: flags.get('link-from') ?? '',
      ...(linkLabel !== undefined ? { label: linkLabel } : {}),
    };
    return { command, csvPath, gameId, dryRun, spec: { card: spec, linkFrom } };
  }

  if (command === 'add-option') {
    if (fieldPairs.length > 0) {
      return {
        error: 'add-option appends one option and takes no --field columns; use update-card for card columns',
      };
    }
    return {
      command,
      csvPath,
      gameId,
      dryRun,
      spec: {
        id: flags.get('id') ?? '',
        label: flags.get('label') ?? '',
        target: optionalText('target'),
        ...(attributeValues.length > 0 ? { attributes: attributeValues } : {}),
      },
    };
  }

  const spec: UpdateContentCardSpec = {
    id: flags.get('id') ?? '',
    name: optionalText('name'),
    effect: optionalText('effect'),
    context: nullableFlag(flags, 'context', 'clear-context'),
    epilogue: nullableFlag(flags, 'epilogue', 'clear-epilogue'),
    options: nullableFlag(flags, 'options', 'clear-options'),
    storylineId: nullableFlag(flags, 'storyline-id', 'clear-storyline'),
    storylineTitle: nullableFlag(flags, 'storyline-title', 'clear-storyline-title'),
    resources: nullableFlag(flags, 'resources', 'clear-resources'),
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

  const mutate = (csv: string): ContentEditResult => {
    switch (parsed.command) {
      case 'add-card':
        return addContentCard(csv, adapter, parsed.spec);
      case 'add-linked-card':
        return addLinkedContentCard(csv, adapter, parsed.spec);
      case 'add-option':
        return addOptionToContentCard(csv, adapter, parsed.spec);
      case 'update-card':
        return updateContentCard(csv, adapter, parsed.spec);
    }
  };

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
