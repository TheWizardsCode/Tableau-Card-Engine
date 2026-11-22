/**
 * Validator CLI tests.
 *
 * Exit codes are the CLI's contract (0 = valid, 1 = invalid), so they are
 * asserted directly alongside the report content. One end-to-end subprocess
 * case proves the three thin entry points really run under `tsx` with no Vite
 * loader or game dependency.
 *
 * @module
 */
import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_CONTENT_PATH,
  DEFAULT_CONTENT_FILES,
  GYM_CONTENT_ADAPTER,
  LONG_ERASURE_CONTENT_PATH,
} from '../../../src/story-line/content/adapters';
import {
  addOptionToContentCard,
  updateContentCard,
} from '../../../src/story-line/content/author';
import { cardsFromCsv, parseCsv } from '../../../src/story-line/content/csv';
import {
  AUTHOR_USAGE,
  parseAuthorCliArgs,
  runStorylineAuthorCli,
} from '../../../scripts/storyline-author';
import { DEFAULT_GRAPH_OUTPUTS, runStorylineGraphCli } from '../../../scripts/storyline-graph';
import {
  parseValidateStorylinesArgs,
  runValidateStorylinesCli,
} from '../../../scripts/validate-storylines';
import { REPO_ROOT, captureOutput, fixturePath, makeTempDir, readText } from './test-support';

const GYM_CONTENT = join(REPO_ROOT, DEFAULT_CONTENT_PATH);

/** Runs a `tsx` script in a subprocess and returns its outcome. */
function runTsx(script: string, args: readonly string[]): {
  status: number | null;
  stdout: string;
  stderr: string;
} {
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const result = spawnSync(npx, ['--no-install', 'tsx', join('scripts', script), ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf-8',
    timeout: 120_000,
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

describe('parseValidateStorylinesArgs', () => {
  it('defaults to the Gym content and the text report', () => {
    const opts = parseValidateStorylinesArgs([]);
    expect(opts.csvPath).toBe('example-games/gym/content/storylines.csv');
    expect(opts.json).toBe(false);
    expect(opts.failOnCycle).toBe(false);
    expect(opts.help).toBe(false);
  });

  it('parses flags', () => {
    const opts = parseValidateStorylinesArgs([
      '--csv',
      'a.csv',
      '--game',
      'gym',
      '--json',
      '--fail-on-cycle',
    ]);
    expect(opts).toMatchObject({
      csvPath: 'a.csv',
      gameId: 'gym',
      json: true,
      failOnCycle: true,
    });
  });
});

describe('parseAuthorCliArgs — prose flags (CG-0MWQZGVG0001T88B)', () => {
  /**
   * Narrows a parsed invocation to the prose fields two commands share.
   *
   * Prose is authored on both `add-card` and `update-card`, so the shared
   * `context` / `epilogue` shape is what these parsing tests assert; the
   * command-specific fields belong to that command's own suite.
   */
  function proseOf(argv: readonly string[]): {
    readonly context?: string | null;
    readonly epilogue?: string | null;
  } {
    const parsed = parseAuthorCliArgs(argv);
    if ('error' in parsed) throw new Error(parsed.error);
    // Prose is authored on `add-card` / `update-card` only; `add-linked-card`
    // carries the same prose fields inside its card spec and is covered by its
    // own suite.
    if (parsed.command !== 'add-card' && parsed.command !== 'update-card') {
      throw new Error(`unexpected command ${String(parsed.command)}`);
    }
    return parsed.spec;
  }

  it('parses --context and --epilogue on add-card', () => {
    const spec = proseOf([
      'add-card',
      '--id',
      'evt-x',
      '--name',
      'X',
      '--context',
      'Rain on the road.',
      '--epilogue',
      'The gate closes.',
    ]);
    expect(spec.context).toBe('Rain on the road.');
    expect(spec.epilogue).toBe('The gate closes.');
  });

  it('parses --context and --epilogue on update-card', () => {
    const spec = proseOf([
      'update-card',
      '--id',
      'evt-x',
      '--context',
      'A rewritten situation.',
      '--epilogue',
      'A rewritten ending.',
    ]);
    expect(spec.context).toBe('A rewritten situation.');
    expect(spec.epilogue).toBe('A rewritten ending.');
  });

  it('leaves prose untouched (undefined) when no prose flag is supplied', () => {
    const added = proseOf(['add-card', '--id', 'evt-x', '--name', 'X']);
    expect(added.context).toBeUndefined();
    expect(added.epilogue).toBeUndefined();

    const updated = proseOf(['update-card', '--id', 'evt-x']);
    expect(updated.context).toBeUndefined();
    expect(updated.epilogue).toBeUndefined();
  });

  it('null-clears prose with --clear-context / --clear-epilogue', () => {
    const cleared = proseOf([
      'update-card',
      '--id',
      'evt-x',
      '--context',
      'ignored when cleared',
      '--clear-context',
      '--epilogue',
      'ignored when cleared',
      '--clear-epilogue',
    ]);
    expect(cleared.context).toBeNull();
    expect(cleared.epilogue).toBeNull();
  });

  it('accepts --context through validation without a mapped-column error', () => {
    const parsed = parseAuthorCliArgs([
      'update-card',
      '--id',
      'gym-story-start',
      '--context',
      'The road budget is on the table again.',
    ]);
    if ('error' in parsed || parsed.command !== 'update-card') {
      throw new Error('expected an update-card invocation');
    }

    const result = updateContentCard(
      readText(GYM_CONTENT),
      GYM_CONTENT_ADAPTER,
      parsed.spec,
    );
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);

    const card = cardsFromCsv(parseCsv(result.csv), GYM_CONTENT_ADAPTER).find(
      (candidate) => candidate.id === 'gym-story-start',
    );
    expect(card?.context).toBe('The road budget is on the table again.');
    expect(card?.fields.context).toBeUndefined();
  });

  it('still refuses --field context=… as a mapped story-line column', () => {
    const parsed = parseAuthorCliArgs([
      'update-card',
      '--id',
      'gym-story-start',
      '--field',
      'context=set the wrong way',
    ]);
    if ('error' in parsed || parsed.command !== 'update-card') {
      throw new Error('expected an update-card invocation');
    }

    const result = updateContentCard(
      readText(GYM_CONTENT),
      GYM_CONTENT_ADAPTER,
      parsed.spec,
    );
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain(
      'field "context" is a mapped story-line column',
    );
  });

  it('documents the prose flags in the usage text', () => {
    for (const flag of [
      '--context',
      '--epilogue',
      '--clear-context',
      '--clear-epilogue',
    ]) {
      expect(AUTHOR_USAGE).toContain(flag);
    }
  });
});

describe('author CLI prose-budget warnings (CG-0MWQZJB32009KNGR)', () => {
  /** Long Erasure content, whose adapter maps both prose columns. */
  const LONG_ERASURE_CONTENT = join(REPO_ROOT, LONG_ERASURE_CONTENT_PATH);

  /** Prose of exactly `length` characters (no newlines, so CSV stays simple). */
  const prose = (length: number): string => 'R'.repeat(length);

  it('warns on an over-budget context and still applies the edit', () => {
    const temp = makeTempDir();
    try {
      const csvPath = join(temp.path, 'storylines.csv');
      writeFileSync(csvPath, readText(GYM_CONTENT));

      const { code, stdout, stderr } = captureOutput(() =>
        runStorylineAuthorCli([
          'update-card',
          '--csv',
          csvPath,
          '--id',
          'gym-story-start',
          // The adopted `context` budget is 400 characters.
          '--context',
          prose(401),
        ]),
      );

      // A budget is a warning, never a refusal: the edit still lands.
      expect(code).toBe(0);
      expect(readText(csvPath)).toContain(prose(401));
      expect(stderr).toContain('[prose-budget]');
      expect(stderr).toContain('column "context"');
      // The notice goes to stderr, so `--dry-run` stdout stays machine-readable.
      expect(stdout).not.toContain('[prose-budget]');
    } finally {
      temp.cleanup();
    }
  });

  it('stays silent when the authored prose is within its budget', () => {
    const temp = makeTempDir();
    try {
      const csvPath = join(temp.path, 'storylines.csv');
      writeFileSync(csvPath, readText(GYM_CONTENT));

      const { code, stderr } = captureOutput(() =>
        runStorylineAuthorCli([
          'update-card',
          '--csv',
          csvPath,
          '--id',
          'gym-story-start',
          '--context',
          prose(400),
        ]),
      );

      expect(code).toBe(0);
      expect(stderr).toBe('');
    } finally {
      temp.cleanup();
    }
  });

  it('reports the epilogue budget on a dry run and writes nothing', () => {
    const temp = makeTempDir();
    try {
      const csvPath = join(temp.path, 'long-erasure.csv');
      writeFileSync(csvPath, readText(LONG_ERASURE_CONTENT));
      const before = readText(csvPath);

      const { code, stdout, stderr } = captureOutput(() =>
        runStorylineAuthorCli([
          'update-card',
          '--csv',
          csvPath,
          '--game',
          'long-erasure',
          '--id',
          'le-i-open',
          // The adopted `epilogue` budget is 600 characters.
          '--epilogue',
          prose(601),
          '--dry-run',
        ]),
      );

      expect(code).toBe(0);
      expect(stderr).toContain('[prose-budget]');
      expect(stderr).toContain('column "epilogue"');
      expect(stdout).toContain(prose(601));
      expect(stdout).not.toContain('[prose-budget]');
      expect(readText(csvPath)).toBe(before);
    } finally {
      temp.cleanup();
    }
  });
});

describe('parseAuthorCliArgs — add-linked-card (CG-0MWQZIH6W003C8PG)', () => {
  /** Narrows a parsed invocation to an add-linked-card one. */
  function linkedOf(argv: readonly string[]) {
    const parsed = parseAuthorCliArgs(argv);
    if ('error' in parsed) throw new Error(parsed.error);
    if (parsed.command !== 'add-linked-card') {
      throw new Error(`expected an add-linked-card invocation, got ${parsed.command}`);
    }
    return parsed;
  }

  it('parses the card spec plus a --link-from predecessor and its label', () => {
    const parsed = linkedOf([
      'add-linked-card',
      '--id',
      'gym-detour',
      '--name',
      'A Detour',
      '--effect',
      'The scenic route.',
      '--link-from',
      'gym-story-start',
      '--link-label',
      'Take the detour',
      '--storyline-id',
      'gym-story',
      '--field',
      'coinDelta=5',
    ]);

    expect(parsed.spec.card).toMatchObject({
      id: 'gym-detour',
      name: 'A Detour',
      effect: 'The scenic route.',
      storylineId: 'gym-story',
      fields: { coinDelta: '5' },
    });
    expect(parsed.spec.linkFrom).toEqual({
      id: 'gym-story-start',
      label: 'Take the detour',
    });
  });

  it('leaves the label undefined when --link-label is omitted and honours shared flags', () => {
    const parsed = linkedOf([
      'add-linked-card',
      '--id',
      'gym-detour',
      '--name',
      'A Detour',
      '--link-from',
      'gym-story-start',
      '--dry-run',
      '--game',
      'gym',
    ]);
    expect(parsed.spec.linkFrom).toEqual({ id: 'gym-story-start' });
    expect(parsed.dryRun).toBe(true);
    expect(parsed.gameId).toBe('gym');
    expect(parsed.csvPath).toBe(resolve(process.cwd(), DEFAULT_CONTENT_PATH));
  });

  it('documents add-linked-card and its link flags in the usage text', () => {
    for (const text of ['add-linked-card', '--link-from', '--link-label']) {
      expect(AUTHOR_USAGE).toContain(text);
    }
  });
});

describe('parseAuthorCliArgs — add-option (CG-0MWQZJ6S50007XVE)', () => {
  /** Narrows a parsed invocation to an add-option one. */
  function optionOf(argv: readonly string[]) {
    const parsed = parseAuthorCliArgs(argv);
    if ('error' in parsed) throw new Error(parsed.error);
    if (parsed.command !== 'add-option') {
      throw new Error(`expected an add-option invocation, got ${parsed.command}`);
    }
    return parsed;
  }

  it('parses --id, --label, --target and repeated --attr in authored order', () => {
    const parsed = optionOf([
      'add-option',
      '--id',
      'gym-story-invest',
      '--label',
      'Wait for spring',
      '--target',
      'gym-story-end',
      '--attr',
      'cost=coins:2',
      '--attr',
      '#extra=reputation:+1',
      '--dry-run',
      '--game',
      'gym',
    ]);

    expect(parsed.spec).toEqual({
      id: 'gym-story-invest',
      label: 'Wait for spring',
      target: 'gym-story-end',
      attributes: ['cost=coins:2', '#extra=reputation:+1'],
    });
    expect(parsed.dryRun).toBe(true);
    expect(parsed.gameId).toBe('gym');
    expect(parsed.csvPath).toBe(resolve(process.cwd(), DEFAULT_CONTENT_PATH));
  });

  it('omits target and attributes for a terminal option', () => {
    const parsed = optionOf(['add-option', '--id', 'gym-story-end', '--label', 'Rest here']);
    expect(parsed.spec).toEqual({ id: 'gym-story-end', label: 'Rest here' });
  });

  it('refuses a --field column, which add-option cannot write', () => {
    const parsed = parseAuthorCliArgs([
      'add-option',
      '--id',
      'gym-story-invest',
      '--label',
      'Wait for spring',
      '--field',
      'coinDelta=1',
    ]);
    expect('error' in parsed && parsed.error).toContain('--field');
  });

  it('documents add-option and its flags in the usage text', () => {
    for (const text of ['add-option', '--label', '--target', '--attr']) {
      expect(AUTHOR_USAGE).toContain(text);
    }
  });

  it('appends an option to a content file through the CLI entry point', () => {
    const temp = makeTempDir();
    try {
      const csvPath = join(temp.path, 'storylines.csv');
      writeFileSync(csvPath, readText(GYM_CONTENT));

      const { code, stderr } = captureOutput(() =>
        runStorylineAuthorCli([
          'add-option',
          '--csv',
          csvPath,
          '--id',
          'gym-story-invest',
          '--label',
          'Wait for spring',
          '--target',
          'gym-story-end',
          '--attr',
          'cost=coins:2',
        ]),
      );
      expect(stderr).toBe('');
      expect(code).toBe(0);

      const invest = cardsFromCsv(
        parseCsv(readText(csvPath)),
        GYM_CONTENT_ADAPTER,
      ).find((candidate) => candidate.id === 'gym-story-invest');
      // The authored cell is preserved and the new option is appended last.
      expect(invest?.options).toBe(
        'Celebrate|gym-story-end;Double down|;Wait for spring|gym-story-end#cost=coins:2',
      );
    } finally {
      temp.cleanup();
    }
  });

  it('refuses an unknown successor, an unknown resource key and a duplicate label', () => {
    const parsed = (label: string, target?: string, attributes?: readonly string[]) => {
      const argv = ['add-option', '--id', 'gym-story-invest', '--label', label];
      if (target !== undefined) argv.push('--target', target);
      for (const attribute of attributes ?? []) argv.push('--attr', attribute);
      return optionOf(argv).spec;
    };

    const unknownSuccessor = addOptionToContentCard(
      readText(GYM_CONTENT),
      GYM_CONTENT_ADAPTER,
      parsed('Follow the rumour', 'gym-ghost'),
    );
    expect(unknownSuccessor.ok).toBe(false);
    expect((unknownSuccessor.validation?.issues ?? []).map((issue) => issue.code)).toContain(
      'unknown-successor',
    );

    const unknownResource = addOptionToContentCard(
      readText(GYM_CONTENT),
      GYM_CONTENT_ADAPTER,
      parsed('Buy the harbour', 'gym-story-end', ['cost=gold:1']),
    );
    expect(unknownResource.ok).toBe(false);
    expect(unknownResource.errors.join(' ')).toContain('gold');

    const duplicate = addOptionToContentCard(
      readText(GYM_CONTENT),
      GYM_CONTENT_ADAPTER,
      parsed('celebrate', 'gym-story-end'),
    );
    expect(duplicate.ok).toBe(false);
    expect(duplicate.errors.join(' ')).toContain('duplicate option label');
  });
});

describe('parseAuthorCliArgs — add-card --after (CG-0MWQZJIOR006L5PT)', () => {
  /** Narrows a parsed invocation to an add-card one. */
  function addCardOf(argv: readonly string[]) {
    const parsed = parseAuthorCliArgs(argv);
    if ('error' in parsed) throw new Error(parsed.error);
    if (parsed.command !== 'add-card') {
      throw new Error(`expected an add-card invocation, got ${parsed.command}`);
    }
    return parsed;
  }

  /** Card ids of a content file, in file order. */
  function cardIds(csvPath: string): string[] {
    const parsed = parseCsv(readText(csvPath));
    const idIndex = parsed.header.indexOf(GYM_CONTENT_ADAPTER.fields.id);
    return parsed.rows.map((row) => row[idIndex] ?? '');
  }

  it('parses --after onto the add-card spec', () => {
    const parsed = addCardOf([
      'add-card',
      '--id',
      'gym-story-detour',
      '--name',
      'A Detour',
      '--after',
      'gym-story-ignore',
    ]);
    expect(parsed.spec.after).toBe('gym-story-ignore');
  });

  it('leaves after undefined when omitted, so add-card still appends', () => {
    const parsed = addCardOf(['add-card', '--id', 'gym-story-detour', '--name', 'A Detour']);
    expect(parsed.spec.after).toBeUndefined();
  });

  it('applies --after to add-linked-card too (one shared card spec)', () => {
    const parsed = parseAuthorCliArgs([
      'add-linked-card',
      '--id',
      'gym-story-detour',
      '--name',
      'A Detour',
      '--after',
      'gym-story-ignore',
      '--link-from',
      'gym-story-ignore',
    ]);
    if ('error' in parsed || parsed.command !== 'add-linked-card') {
      throw new Error('expected an add-linked-card invocation');
    }
    expect(parsed.spec.card.after).toBe('gym-story-ignore');
  });

  it('documents --after in the usage text', () => {
    expect(AUTHOR_USAGE).toContain('--after');
  });

  it('inserts the new row directly after the named card through the CLI entry point', () => {
    const temp = makeTempDir();
    try {
      const csvPath = join(temp.path, 'storylines.csv');
      writeFileSync(csvPath, readText(GYM_CONTENT));

      const { code, stderr } = captureOutput(() =>
        runStorylineAuthorCli([
          'add-card',
          '--csv',
          csvPath,
          '--id',
          'gym-story-detour',
          '--name',
          'A Detour',
          '--after',
          'gym-story-invest',
        ]),
      );
      expect(stderr).toBe('');
      expect(code).toBe(0);
      expect(cardIds(csvPath)).toEqual([
        'gym-story-start',
        'gym-story-invest',
        'gym-story-detour',
        'gym-story-ignore',
        'gym-story-end',
      ]);
    } finally {
      temp.cleanup();
    }
  });

  it('still appends when --after is omitted', () => {
    const temp = makeTempDir();
    try {
      const csvPath = join(temp.path, 'storylines.csv');
      writeFileSync(csvPath, readText(GYM_CONTENT));

      const { code } = captureOutput(() =>
        runStorylineAuthorCli([
          'add-card',
          '--csv',
          csvPath,
          '--id',
          'gym-story-detour',
          '--name',
          'A Detour',
        ]),
      );
      expect(code).toBe(0);
      const ids = cardIds(csvPath);
      expect(ids[0]).toBe('gym-story-start');
      expect(ids[ids.length - 1]).toBe('gym-story-detour');
    } finally {
      temp.cleanup();
    }
  });

  it('refuses an --after naming no card, naming the id, and writes nothing', () => {
    const temp = makeTempDir();
    try {
      const csvPath = join(temp.path, 'storylines.csv');
      const original = readText(GYM_CONTENT);
      writeFileSync(csvPath, original);

      const { code, stderr } = captureOutput(() =>
        runStorylineAuthorCli([
          'add-card',
          '--csv',
          csvPath,
          '--id',
          'gym-story-detour',
          '--name',
          'A Detour',
          '--after',
          'gym-ghost',
        ]),
      );
      expect(code).toBe(1);
      expect(stderr).toContain('gym-ghost');
      expect(readText(csvPath)).toBe(original);
    } finally {
      temp.cleanup();
    }
  });

  it('keeps the entry card when a card is inserted then linked after its predecessor', () => {
    const temp = makeTempDir();
    try {
      const csvPath = join(temp.path, 'storylines.csv');
      writeFileSync(csvPath, readText(GYM_CONTENT));

      const { code, stderr } = captureOutput(() =>
        runStorylineAuthorCli([
          'add-linked-card',
          '--csv',
          csvPath,
          '--id',
          'gym-story-detour',
          '--name',
          'A Detour',
          '--effect',
          'The scenic route.',
          '--storyline-id',
          'gym-story',
          '--storyline-title',
          'Gym Storyline',
          '--resources',
          'coins,reputation',
          '--after',
          'gym-story-ignore',
          '--link-from',
          'gym-story-ignore',
          '--link-label',
          'Take the detour',
        ]),
      );
      expect(stderr).toBe('');
      expect(code).toBe(0);

      const ids = cardIds(csvPath);
      expect(ids).toEqual([
        'gym-story-start',
        'gym-story-invest',
        'gym-story-ignore',
        'gym-story-detour',
        'gym-story-end',
      ]);
      // The entry card is still the first member — the insert never re-points it.
      expect(ids[0]).toBe('gym-story-start');
      expect(captureOutput(() => runValidateStorylinesCli(['--csv', csvPath])).code).toBe(0);
    } finally {
      temp.cleanup();
    }
  });

  it('refuses an append that would silently re-point the entry card', () => {
    const temp = makeTempDir();
    try {
      const csvPath = join(temp.path, 'storylines.csv');
      const original = readText(GYM_CONTENT);
      writeFileSync(csvPath, original);

      const { code, stderr } = captureOutput(() =>
        runStorylineAuthorCli([
          'add-card',
          '--csv',
          csvPath,
          '--id',
          'gym-story-detour',
          '--name',
          'A Detour',
          '--storyline-id',
          'gym-story',
          '--storyline-title',
          'Gym Storyline',
          '--resources',
          'coins,reputation',
          '--options',
          'Back|gym-story-start',
        ]),
      );
      // Linking back at the old entry card would make it "linked to", so the
      // new card would become the entry. Validation alone accepts that, so the
      // author guard refuses it and names both cards — nothing is written.
      expect(code).toBe(1);
      expect(stderr).toContain('re-point');
      expect(stderr).toContain('gym-story-start');
      expect(stderr).toContain('gym-story-detour');
      expect(readText(csvPath)).toBe(original);
    } finally {
      temp.cleanup();
    }
  });

  it('refuses an unlinked member append that would strand the new card', () => {
    const temp = makeTempDir();
    try {
      const csvPath = join(temp.path, 'storylines.csv');
      const original = readText(GYM_CONTENT);
      writeFileSync(csvPath, original);

      const { code, stderr } = captureOutput(() =>
        runStorylineAuthorCli([
          'add-card',
          '--csv',
          csvPath,
          '--id',
          'gym-story-detour',
          '--name',
          'A Detour',
          '--storyline-id',
          'gym-story',
          '--storyline-title',
          'Gym Storyline',
          '--resources',
          'coins,reputation',
        ]),
      );
      expect(code).toBe(1);
      expect(stderr).toContain('unreachable from the story-line');
      expect(stderr).toContain('gym-story-detour');
      expect(readText(csvPath)).toBe(original);
    } finally {
      temp.cleanup();
    }
  });
});

describe('validate-storylines CLI', () => {
  it('exits 0 and reports VALID for valid content', () => {
    const { code, stdout } = captureOutput(() =>
      runValidateStorylinesCli(['--csv', GYM_CONTENT]),
    );
    expect(code).toBe(0);
    expect(stdout).toContain('RESULT: VALID');
  });

  it('exits 1 with a JSON report naming the offending card', () => {
    const temp = makeTempDir();
    try {
      const csvPath = join(temp.path, 'dangling.csv');
      writeFileSync(
        csvPath,
        [
          'id,name,effect,options,storylineId,storylineTitle,context',
          'gym-open,Gym Open,A card that links nowhere.,Go|gym-missing,gym-arc,Gym Arc,',
          '',
        ].join('\n'),
      );
      const { code, stdout } = captureOutput(() =>
        runValidateStorylinesCli(['--csv', csvPath, '--json']),
      );
      expect(code).toBe(1);
      const report = JSON.parse(stdout);
      expect(report.valid).toBe(false);
      expect(report.issues[0]).toMatchObject({
        code: 'unknown-successor',
        cardId: 'gym-open',
        target: 'gym-missing',
      });
    } finally {
      temp.cleanup();
    }
  });

  it('fails on a cycle only with --fail-on-cycle', () => {
    const csv = fixturePath('gym-cycle.csv');
    expect(captureOutput(() => runValidateStorylinesCli(['--csv', csv])).code).toBe(0);
    const strict = captureOutput(() =>
      runValidateStorylinesCli(['--csv', csv, '--fail-on-cycle']),
    );
    expect(strict.code).toBe(1);
    expect(strict.stdout).toContain('cycle-error');
  });

  it('exits 1 for an unknown adapter, a missing file and prints usage for --help', () => {
    expect(
      captureOutput(() => runValidateStorylinesCli(['--csv', GYM_CONTENT, '--game', 'nope']))
        .code,
    ).toBe(1);

    const temp = makeTempDir();
    try {
      const missing = captureOutput(() =>
        runValidateStorylinesCli(['--csv', join(temp.path, 'absent.csv')]),
      );
      expect(missing.code).toBe(1);
      expect(missing.stderr).toContain('cannot read');
    } finally {
      temp.cleanup();
    }

    const help = captureOutput(() => runValidateStorylinesCli(['--help']));
    expect(help.code).toBe(0);
    expect(help.stdout).toContain('Validate story-line content');
  });
});

describe('tsx entry points', () => {
  it('runs validate-storylines.ts under tsx and emits parseable JSON', () => {
    const result = runTsx('validate-storylines.ts', ['--csv', GYM_CONTENT, '--json']);
    expect(result.stderr).not.toContain('ERR_MODULE_NOT_FOUND');
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ valid: true, gameId: 'gym' });
  });

  it('runs storyline-graph.ts --check under tsx against the committed artefacts', () => {
    const result = runTsx('storyline-graph.ts', ['--format', 'json', '--check']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('is up to date');
  });
});

describe('shipped content location', () => {
  it('keeps the default content and its artefacts out of any ignore rule', () => {
    // A repo-wide `data/` ignore rule once swallowed these files while the
    // in-worktree suite still passed, so the committed demo content silently
    // disappeared. `git check-ignore` exits 1 when a path is *not* ignored;
    // that is the property the shipped artefacts need (they are committed).
    const paths = [
      DEFAULT_CONTENT_PATH,
      DEFAULT_GRAPH_OUTPUTS.json,
      DEFAULT_GRAPH_OUTPUTS.mermaid,
    ];
    for (const path of paths) {
      expect(existsSync(join(REPO_ROOT, path))).toBe(true);
      const ignored = spawnSync('git', ['check-ignore', '-q', path], {
        cwd: REPO_ROOT,
      });
      expect(ignored.status, `${path} must not be git-ignored`).toBe(1);
    }
  });
});

describe('shipped content registry (no --csv)', () => {
  it('validates every shipped content file with its own adapter', () => {
    const { code, stdout } = captureOutput(() => runValidateStorylinesCli([]));
    expect(code).toBe(0);
    for (const spec of DEFAULT_CONTENT_FILES) {
      expect(stdout).toContain(`${spec.csv} (adapter ${spec.adapterId})`);
    }
    expect(stdout.match(/RESULT: VALID/g)).toHaveLength(DEFAULT_CONTENT_FILES.length);
  });

  it('reports every shipped content file in the JSON report', () => {
    const { code, stdout } = captureOutput(() => runValidateStorylinesCli(['--json']));
    expect(code).toBe(0);
    const report = JSON.parse(stdout);
    expect(report.valid).toBe(true);
    expect(report.files.map((file: { csv: string }) => file.csv)).toEqual(
      DEFAULT_CONTENT_FILES.map((spec) => spec.csv),
    );
    for (const file of report.files) expect(file.valid).toBe(true);
  });

  it('drift-checks every shipped artefact when --csv is omitted', () => {
    const { code, stdout } = captureOutput(() =>
      runStorylineGraphCli(['--format', 'json', '--check']),
    );
    expect(code).toBe(0);
    for (const spec of DEFAULT_CONTENT_FILES) {
      expect(stdout).toContain(spec.artefacts.json);
    }
    expect(stdout.match(/is up to date/g)).toHaveLength(DEFAULT_CONTENT_FILES.length);
  });

  it('refuses --out without --csv (one content file at a time)', () => {
    const temp = makeTempDir();
    try {
      const { code, stderr } = captureOutput(() =>
        runStorylineGraphCli(['--format', 'json', '--out', join(temp.path, 'x.json')]),
      );
      expect(code).toBe(1);
      expect(stderr).toContain('--out requires --csv');
    } finally {
      temp.cleanup();
    }
  });
});
