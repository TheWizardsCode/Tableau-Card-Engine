/**
 * Irreversible-grant authoring gate — end-to-end coverage.
 *
 * The GDD's Long Erasure resource model marks `hull` **never restored**: the
 * runtime resolution guard refuses a grant on it. Content that authors
 * `#extra=hull:…` would therefore never play as written, so the authoring-time
 * validator reports a hard `irreversible-grant` issue instead of letting the
 * author discover it at run time.
 *
 * This suite pins the diagnostic end to end: the option-level rule, the CSV
 * content validator (card id, 1-based row, `options` column, offending key) and
 * the CLI exit code/output the GDD's authoring command produces.
 *
 * @module
 */
import { describe, expect, it } from 'vitest';

import {
  LONG_ERASURE_CONTENT_ADAPTER,
  GYM_CONTENT_ADAPTER,
} from '../../../src/story-line/content/adapters';
import {
  contentValidationToJson,
  validateContentCsv,
  type ContentIssue,
} from '../../../src/story-line/content/validate';
import { runValidateStorylinesCli } from '../../../scripts/validate-storylines';
import {
  GYM_CONTENT_PATH,
  LONG_ERASURE_CONTENT_PATH,
  captureOutput,
  fixturePath,
  readFixture,
  readText,
} from './test-support';

/** The fixture whose only fault is the irreversible `#extra`. */
const FIXTURE = 'irreversible-grant.csv';

/** Every issue of the given code in a validation result. */
function issuesOfCode(
  result: ReturnType<typeof validateContentCsv>,
  code: ContentIssue['code'],
): ContentIssue[] {
  return result.issues.filter((issue) => issue.code === code);
}

describe('irreversible-grant — CSV content validator', () => {
  it('reports the offending row, options column, card and key', () => {
    const result = validateContentCsv(
      readFixture(FIXTURE),
      LONG_ERASURE_CONTENT_ADAPTER,
    );

    expect(result.valid).toBe(false);
    const grants = issuesOfCode(result, 'irreversible-grant');
    expect(grants).toHaveLength(1);
    expect(grants[0]).toMatchObject({
      code: 'irreversible-grant',
      cardId: 'igr-i-wreck',
      row: 2,
      column: 'options',
      reason: 'irreversible-grant',
      path: 'options[0].extraEffect.hull',
      resource: 'hull',
    });
    expect(grants[0]?.message).toContain('hull');

    // The row grants nothing else, so the irreversible grant is the only fault.
    expect(result.issues).toHaveLength(1);
  });

  it('surfaces the diagnostic in the JSON report', () => {
    const result = validateContentCsv(
      readFixture(FIXTURE),
      LONG_ERASURE_CONTENT_ADAPTER,
    );
    const json = JSON.parse(contentValidationToJson(result)) as {
      valid: boolean;
      issues: ContentIssue[];
    };
    expect(json.valid).toBe(false);
    expect(json.issues).toEqual([
      expect.objectContaining({
        code: 'irreversible-grant',
        cardId: 'igr-i-wreck',
        row: 2,
        column: 'options',
        resource: 'hull',
      }),
    ]);
  });

  it('accepts spending the irreversible key and granting a recoverable one', () => {
    // The shipped GDD fixture costs `hull` and grants `stores`/`morale`.
    const result = validateContentCsv(
      readFixture('gdd-resource-trades.csv'),
      LONG_ERASURE_CONTENT_ADAPTER,
    );
    expect(result.valid).toBe(true);
    expect(issuesOfCode(result, 'irreversible-grant')).toEqual([]);
  });

  it('reports nothing when the adapter declares no irreversible key', () => {
    // The Gym adapter declares no irreversible set, so its content output is
    // unchanged: the shipped file still validates cleanly.
    const result = validateContentCsv(readText(GYM_CONTENT_PATH), GYM_CONTENT_ADAPTER);
    expect(result.valid).toBe(true);
    expect(issuesOfCode(result, 'irreversible-grant')).toEqual([]);
  });

  it('adds no issue to the shipped Long Erasure content', () => {
    // `hull` is declared irreversible for the shipped story-line, and no
    // authored option grants it.
    const result = validateContentCsv(
      readText(LONG_ERASURE_CONTENT_PATH),
      LONG_ERASURE_CONTENT_ADAPTER,
    );
    expect(result.valid).toBe(true);
    expect(issuesOfCode(result, 'irreversible-grant')).toEqual([]);
  });
});

describe('irreversible-grant — storylines:validate CLI', () => {
  it('exits non-zero naming the row and the key', () => {
    const { code, stdout } = captureOutput(() =>
      runValidateStorylinesCli([
        '--csv',
        fixturePath(FIXTURE),
        '--game',
        'long-erasure',
      ]),
    );

    expect(code).toBe(1);
    expect(stdout).toContain('[irreversible-grant]');
    expect(stdout).toContain('row 2');
    expect(stdout).toContain('column "options"');
    expect(stdout).toContain('hull');
    expect(stdout).toContain('RESULT: INVALID');
  });

  it('emits the diagnostic in --json mode with a non-zero exit', () => {
    const { code, stdout } = captureOutput(() =>
      runValidateStorylinesCli([
        '--csv',
        fixturePath(FIXTURE),
        '--game',
        'long-erasure',
        '--json',
      ]),
    );

    expect(code).toBe(1);
    const report = JSON.parse(stdout) as {
      valid: boolean;
      issues: ContentIssue[];
    };
    expect(report.valid).toBe(false);
    expect(report.issues).toEqual([
      expect.objectContaining({
        code: 'irreversible-grant',
        cardId: 'igr-i-wreck',
        row: 2,
        column: 'options',
        resource: 'hull',
      }),
    ]);
  });
});
