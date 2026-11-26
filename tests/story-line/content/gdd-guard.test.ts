/**
 * Authored-content route-space guard tests.
 *
 * Covers both sides of the guard's contract:
 *
 * - the **pass** case — the GDD's worked-example content set satisfies all
 *   three invariants and validates cleanly through `storylines:validate`;
 * - the **fail** case — a known-bad (unwinnable) branch fixture fails one
 *   invariant per authored fault, which is the guard's positive control: the
 *   failure proves the guard can, in fact, fail.
 *
 * The rejoin threshold is exercised separately so a failure can be attributed
 * to the configured minimum rather than to a blanket rejection. The CLI cases
 * assert the exit-code contract (0 = batch clean, 1 = a violation) and the
 * committed `configs/storyline-guard.json` target list, which is what CI runs.
 *
 * @module
 */
import { describe, expect, it } from 'vitest';

import { GYM_CONTENT_ADAPTER } from '../../../src/story-line/content/adapters';
import {
  contentGuardToJson,
  evaluateContentGuardCsv,
  formatContentGuardReport,
  type ContentGuardReport,
} from '../../../src/story-line/content/guard';
import { validateContentCsv } from '../../../src/story-line/content/validate';
import { runStorylineGuardCli } from '../../../scripts/storyline-guard';
import { runValidateStorylinesCli } from '../../../scripts/validate-storylines';
import { captureOutput, fixturePath, readFixture } from './test-support';

/** Starting bag for the worked-example fixture (three coins, one goodwill). */
const WORKED_INITIAL = { coins: 3, reputation: 1 };

/** Starting bag for the known-bad fixture (one coin, already spent at the gate). */
const BAD_INITIAL = { coins: 1 };

/** Guards a named fixture with the Gym adapter. */
function guardFixture(
  name: string,
  initialResources: Readonly<Record<string, number>> = WORKED_INITIAL,
  options: Record<string, unknown> = {},
): ContentGuardReport {
  return evaluateContentGuardCsv(readFixture(name), GYM_CONTENT_ADAPTER, {
    initialResources,
    ...options,
  });
}

/** Runs the guard CLI in-process and captures its output. */
function runGuardCli(args: readonly string[]): { code: number; stdout: string; stderr: string } {
  return captureOutput(() => runStorylineGuardCli(args));
}

describe('GDD worked examples — the pass case', () => {
  it('validates cleanly through storylines:validate', () => {
    const result = validateContentCsv(
      readFixture('gdd-worked-examples.csv'),
      GYM_CONTENT_ADAPTER,
    );
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.cardCount).toBe(7);
  });

  it('validates cleanly through the storylines:validate CLI', () => {
    const { code, stdout } = captureOutput(() =>
      runValidateStorylinesCli([
        '--csv',
        fixturePath('gdd-worked-examples.csv'),
        '--game',
        'gym',
      ]),
    );
    expect(code).toBe(0);
    expect(stdout).toContain('RESULT: VALID');
  });

  it('passes all three route-space invariants', () => {
    const report = guardFixture('gdd-worked-examples.csv');
    expect(report.valid).toBe(true);
    expect(report.violations).toEqual([]);
    expect(report.errors).toEqual([]);
    expect(report.exploration.truncated).toBe(false);
  });

  it('checks every state-gated branch and every ending', () => {
    const report = guardFixture('gdd-worked-examples.csv');
    expect(report.entryIds).toEqual(['gx-open']);
    expect(report.endingIds).toEqual(['gx-end-quiet', 'gx-end-bold']);

    // The cost-gated options plus the `#when`-gated "Run the strait".
    expect(report.gatedBranches.map((branch) => branch.option)).toEqual([
      'Chart the reef',
      'Signal the shore',
      'Run the strait',
    ]);
    expect(report.gatedBranches.every((branch) => branch.survivable)).toBe(true);
    expect(report.gatedBranches.every((branch) => branch.endingId !== null)).toBe(true);
    expect(report.endings.every((ending) => ending.reachable)).toBe(true);
  });

  it('measures the marked consequential choices against the minimum', () => {
    const report = guardFixture('gdd-worked-examples.csv');
    expect(report.consequentialChoices).toEqual([
      { cardId: 'gx-open', option: 'Take the helm', distance: 2, meetsMinimum: true },
      { cardId: 'gx-crossing', option: 'Chart the reef', distance: 2, meetsMinimum: true },
    ]);
  });

  it('does not flag unmarked cosmetic choices (the same-target pair)', () => {
    // gx-wait offers two options that both lead to gx-end-quiet; neither is
    // marked, so the guard must leave them alone.
    const report = guardFixture('gdd-worked-examples.csv');
    expect(report.consequentialChoices.some((choice) => choice.cardId === 'gx-wait')).toBe(
      false,
    );
  });

  it('is deterministic', () => {
    const first = contentGuardToJson(guardFixture('gdd-worked-examples.csv'));
    const second = contentGuardToJson(guardFixture('gdd-worked-examples.csv'));
    expect(second).toBe(first);
  });
});

describe('known-bad unwinnable branch — the fail case', () => {
  it('fails, and fails each of the three invariants', () => {
    const report = guardFixture('guard-unwinnable-branch.csv', BAD_INITIAL);
    expect(report.valid).toBe(false);
    expect(report.violations.map((violation) => violation.invariant).sort()).toEqual([
      'consequential-rejoin',
      'ending-reachable',
      'gated-branch-survivable',
      'gated-branch-survivable',
    ]);
  });

  it('explains the unwinnable gate and the dead-end option', () => {
    const report = guardFixture('guard-unwinnable-branch.csv', BAD_INITIAL);
    const messages = report.violations.map((violation) => violation.message);
    expect(messages).toContain(
      '"Take the gate" on "bad-open" is state-gated (cost) but no route that takes it reaches an ending.',
    );
    expect(messages).toContain(
      '"Buy the chart" on "bad-gate" is state-gated (cost) but is never offered on any playable route, so it cannot reach an ending.',
    );
    expect(messages).toContain(
      'Ending "bad-end-lost" is not reachable on any playable route.',
    );
    expect(messages).toContain(
      '"Turn back" on "bad-mid" is marked consequential but its branches rejoin after 1 beat(s); the minimum is 2.',
    );
  });

  it('is a positive control: the same content passes the rejoin check at a minimum of 1', () => {
    const report = guardFixture('guard-unwinnable-branch.csv', BAD_INITIAL, {
      minRejoinDistance: 1,
    });
    // The rejoin check no longer fails (the branches rejoin after 1 beat),
    // while the genuine unwinnable-branch faults remain.
    expect(
      report.violations.filter((violation) => violation.invariant === 'consequential-rejoin'),
    ).toEqual([]);
    expect(
      report.violations.some(
        (violation) => violation.invariant === 'gated-branch-survivable',
      ),
    ).toBe(true);
    expect(report.valid).toBe(false);
  });

  it('reports the structural endings when no ending is annotated', () => {
    const report = guardFixture('guard-unwinnable-branch.csv', BAD_INITIAL);
    expect(report.endingsAnnotated).toBe(false);
    expect(report.endingIds).toEqual(['bad-end-quiet', 'bad-end-lost']);
    expect(report.warnings.some((warning) => warning.includes('structural terminal'))).toBe(
      true,
    );
  });
});

describe('guard configuration', () => {
  it('honours explicit entry cards', () => {
    const report = guardFixture('gdd-worked-examples.csv', WORKED_INITIAL, {
      entryIds: ['gx-crossing'],
    });
    expect(report.entryIds).toEqual(['gx-crossing']);
    expect(report.valid).toBe(true);
  });

  it('rejects an entry card that does not exist', () => {
    const report = guardFixture('gdd-worked-examples.csv', WORKED_INITIAL, {
      entryIds: ['nope'],
    });
    expect(report.valid).toBe(false);
    expect(report.errors).toContain('Entry card "nope" does not exist in the content.');
  });

  it('honours explicit ending ids over the content annotations', () => {
    const report = guardFixture('gdd-worked-examples.csv', WORKED_INITIAL, {
      endings: ['gx-end-quiet', 'gx-end-bold'],
    });
    expect(report.endingsAnnotated).toBe(true);
    expect(report.endingIds).toEqual(['gx-end-quiet', 'gx-end-bold']);
    expect(report.valid).toBe(true);
  });

  it('rejects an explicit ending card that does not exist', () => {
    const report = guardFixture('gdd-worked-examples.csv', WORKED_INITIAL, {
      endings: ['nope'],
    });
    expect(report.valid).toBe(false);
    expect(report.errors).toContain('Ending card "nope" does not exist in the content.');
  });

  it('flags a consequential mark naming an option the card does not offer', () => {
    const csv = [
      'id,name,effect,options,storylineId,storylineTitle,resources,trigger,cost,coinDelta,reputationDelta,context,consequential,ending',
      'm-open,Open,Effect,"Left|m-mid;Right|m-end",arc,Arc,"coins,reputation",Incident,0,0,0,,Typo,m-end',
      'm-mid,Mid,Effect,On|m-end,arc,Arc,"coins,reputation",Incident,0,0,0,,,',
      'm-end,End,Effect,,,,,Incident,0,0,0,,,yes',
    ].join('\n');
    const report = evaluateContentGuardCsv(csv, GYM_CONTENT_ADAPTER);
    expect(report.valid).toBe(false);
    expect(report.violations).toContainEqual(
      expect.objectContaining({
        invariant: 'consequential-rejoin',
        cardId: 'm-open',
        option: 'Typo',
      }),
    );
  });

  it('treats `*` as every option on the card', () => {
    const csv = [
      'id,name,effect,options,storylineId,storylineTitle,resources,trigger,cost,coinDelta,reputationDelta,context,consequential,ending',
      's-open,Open,Effect,"A|s-end;B|s-end",arc,Arc,"coins",Incident,0,0,0,,*,',
      's-end,End,Effect,,,,,Incident,0,0,0,,,yes',
    ].join('\n');
    const report = evaluateContentGuardCsv(csv, GYM_CONTENT_ADAPTER);
    expect(report.consequentialChoices.map((choice) => choice.option)).toEqual(['A', 'B']);
    expect(report.valid).toBe(false);
    expect(report.violations).toHaveLength(2);
  });

  it('fails closed and reports truncation instead of guessing', () => {
    // A cycle whose options keep granting a resource has no finite state
    // space; the bound must be reported rather than silently claimed clean.
    const csv = [
      'id,name,effect,options,storylineId,storylineTitle,resources,trigger,cost,coinDelta,reputationDelta,context,consequential,ending',
      't-open,Open,Effect,Go|t-loop,arc,Arc,"coins",Incident,0,0,0,,,',
      't-loop,Loop,Effect,Again|t-open#extra=coins:1,arc,Arc,"coins",Incident,0,0,0,,,',
    ].join('\n');
    const report = evaluateContentGuardCsv(csv, GYM_CONTENT_ADAPTER, {
      entryIds: ['t-open'],
      maxDepth: 8,
    });
    expect(report.exploration.truncated).toBe(true);
    expect(report.valid).toBe(false);
    expect(report.warnings.some((warning) => warning.includes('cannot prove'))).toBe(true);
  });

  it('terminates on a resource-neutral cycle', () => {
    const csv = [
      'id,name,effect,options,storylineId,storylineTitle,resources,trigger,cost,coinDelta,reputationDelta,context,consequential,ending',
      'c-open,Open,Effect,Go|c-loop,arc,Arc,"coins",Incident,0,0,0,,,',
      'c-loop,Loop,Effect,"Again|c-open;Finish|c-end",arc,Arc,"coins",Incident,0,0,0,,,',
      'c-end,End,Effect,,,,,Incident,0,0,0,,,yes',
    ].join('\n');
    const report = evaluateContentGuardCsv(csv, GYM_CONTENT_ADAPTER, {
      entryIds: ['c-open'],
      endings: ['c-end'],
    });
    expect(report.exploration.truncated).toBe(false);
    expect(report.valid).toBe(true);
    expect(report.endings).toEqual([
      { endingId: 'c-end', reachable: true, path: ['c-open', 'c-loop', 'c-end'] },
    ]);
  });
});

describe('reports', () => {
  it('renders a PASS summary for clean content', () => {
    const report = guardFixture('gdd-worked-examples.csv');
    const text = formatContentGuardReport(report, 'worked.csv');
    expect(text).toContain('Content guard: worked.csv (adapter gym)');
    expect(text).toContain('✓ gated-branch-survivable');
    expect(text).toContain('✓ ending-reachable');
    expect(text).toContain('✓ consequential-rejoin');
    expect(text).toContain('PASS');
  });

  it('renders the violations and the FAIL verdict for bad content', () => {
    const report = guardFixture('guard-unwinnable-branch.csv', BAD_INITIAL);
    const text = formatContentGuardReport(report);
    expect(text).toContain('✗ [gated-branch-survivable]');
    expect(text).toContain('✗ [ending-reachable]');
    expect(text).toContain('✗ [consequential-rejoin]');
    expect(text).toContain('FAIL');
  });

  it('serialises a JSON-safe report', () => {
    const report = guardFixture('guard-unwinnable-branch.csv', BAD_INITIAL);
    const parsed = JSON.parse(contentGuardToJson(report)) as ContentGuardReport;
    expect(parsed.valid).toBe(false);
    expect(parsed.violations.length).toBe(report.violations.length);
    expect(parsed.initialResources).toEqual({ coins: 1, reputation: 0 });
  });
});

describe('guard CLI', () => {
  const CLEAN_ARGS = [
    '--csv',
    fixturePath('gdd-worked-examples.csv'),
    '--game',
    'gym',
    '--initial',
    'coins=3,reputation=1',
  ];

  it('exits 0 and prints PASS for clean content', () => {
    const { code, stdout } = runGuardCli(CLEAN_ARGS);
    expect(code).toBe(0);
    expect(stdout).toContain('PASS');
  });

  it('exits 1 and names every violation for bad content', () => {
    const { code, stdout } = runGuardCli([
      '--csv',
      fixturePath('guard-unwinnable-branch.csv'),
      '--game',
      'gym',
      '--initial',
      'coins=1',
    ]);
    expect(code).toBe(1);
    expect(stdout).toContain('FAIL');
    expect(stdout).toContain('[gated-branch-survivable]');
    expect(stdout).toContain('[ending-reachable]');
    expect(stdout).toContain('[consequential-rejoin]');
  });

  it('emits a machine-readable JSON report', () => {
    const { code, stdout } = runGuardCli([
      '--csv',
      fixturePath('guard-unwinnable-branch.csv'),
      '--game',
      'gym',
      '--initial',
      'coins=1',
      '--json',
    ]);
    expect(code).toBe(1);
    const parsed = JSON.parse(stdout) as {
      csv: string;
      valid: boolean;
      violations: { invariant: string }[];
    };
    expect(parsed.csv).toBe(fixturePath('guard-unwinnable-branch.csv'));
    expect(parsed.valid).toBe(false);
    expect(parsed.violations.length).toBeGreaterThanOrEqual(4);
  });

  it('guards every committed target when invoked with no arguments (the CI form)', () => {
    const { code, stdout } = runGuardCli([]);
    expect(code).toBe(0);
    // One PASS block per configured target.
    expect(stdout.match(/^PASS$/gm)?.length).toBe(3);
  });

  it('prints usage on --help', () => {
    const { code, stdout } = runGuardCli(['--help']);
    expect(code).toBe(0);
    expect(stdout).toContain('gated-branch-survivable');
  });

  it('exits 1 on an unknown adapter', () => {
    const { code, stderr } = runGuardCli([
      '--csv',
      fixturePath('gdd-worked-examples.csv'),
      '--game',
      'not-a-game',
    ]);
    expect(code).toBe(1);
    expect(stderr).toContain('unknown --game "not-a-game"');
  });

  it('exits 1 on a malformed --initial bag', () => {
    const { code, stderr } = runGuardCli([
      '--csv',
      fixturePath('gdd-worked-examples.csv'),
      '--game',
      'gym',
      '--initial',
      'coins',
    ]);
    expect(code).toBe(1);
    expect(stderr).toContain('--initial expects key=value pairs');
  });

  it('exits 1 on an unreadable config', () => {
    const { code, stderr } = runGuardCli(['--config', 'configs/does-not-exist.json']);
    expect(code).toBe(1);
    expect(stderr).toContain('cannot read guard config');
  });
});
