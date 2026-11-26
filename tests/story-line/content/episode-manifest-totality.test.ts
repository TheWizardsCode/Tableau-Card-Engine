/**
 * Episode manifest route and outcome-rule totality (CG-0MWSJYJDL00814GC).
 *
 * The two GDD §2.4 totality rules close the "a scene with no door" hole:
 * `non-total-routes` (a close must always find a route) and
 * `non-total-outcome-rules` (a close must always classify). Both read the same
 * traversal the identity and card-resolution families read, report at most one
 * finding per offending scene, and name every outcome the table fails to serve.
 *
 * The properties pinned here are the ones the parent epic's runner and the
 * scene-space guard inherit:
 *
 * - **structural, not a reachability proof** — totality is required of the
 *   declared table at this tuning, which is why a scene is accepted as soon as
 *   every outcome is named or a wildcard door exists (GDD §2.4);
 * - **the Appendix A safety net survives** — `s-i-answer` deliberately uses a
 *   gated `on: "*"` route followed by an unconditional `on: "*"` route, so a
 *   naive "last route must name an outcome" reading would reject the worked
 *   example;
 * - **malformed tables are the schema's finding** — the validator stays total
 *   (never throws) and quiet on a table that is not a table.
 *
 * Each code has one committed fixture under
 * `tests/story-line/content/fixtures/episode-manifest/`, derived from the
 * committed Appendix A manifest by exactly one documented mutation; the drift
 * pin below asserts that. The clean control is the Appendix A manifest itself.
 *
 * @module
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  SCENE_OUTCOMES,
  coveredOutcomes,
  episodeManifestValidationToJson,
  formatEpisodeManifestReport,
  validateEpisodeManifest,
  type EpisodeManifestIssueCode,
  type EpisodeManifestRule,
} from '../../../src/story-line/content/episode-manifest';
import * as barrel from '../../../src/story-line/content/index';
import { REPO_ROOT } from './test-support';

/** The committed totality fixtures. */
const FIXTURE_DIR = join(REPO_ROOT, 'tests/story-line/content/fixtures/episode-manifest');

/** The committed Appendix A manifest — the clean control and fixture base. */
const REFERENCE_PATH = resolve(REPO_ROOT, 'example-games/gym/content/long-erasure-episode.json');

/** The totality rules this child implements, in table order. */
const TOTALITY_RULES: readonly EpisodeManifestRule[] = [
  'non-total-routes',
  'non-total-outcome-rules',
];

/** A mutable view of the reference manifest for in-test mutations. */
interface MutableManifest {
  [key: string]: unknown;
  start: Record<string, unknown>;
  acts: Array<{
    [key: string]: unknown;
    scenes: Array<{
      [key: string]: unknown;
      beats: Array<Record<string, unknown>>;
      routes: Array<Record<string, unknown>>;
      outcomeRules: Array<Record<string, unknown>>;
      losses?: Array<Record<string, unknown>>;
    }>;
  }>;
}

/** Reads and parses a JSON file. */
function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, 'utf-8')) as Record<string, unknown>;
}

/** The committed Appendix A manifest as a mutable deep copy. */
function reference(): MutableManifest {
  return JSON.parse(JSON.stringify(readJson(REFERENCE_PATH))) as MutableManifest;
}

/** Applies one mutation to a fresh reference copy and returns that copy. */
function mutated(mutate: (manifest: MutableManifest) => void): MutableManifest {
  const manifest = reference();
  mutate(manifest);
  return manifest;
}

/** The `code@path` pair (the validator's identity) for every finding. */
function pairs(manifest: unknown): string[] {
  return validateEpisodeManifest(manifest).findings.map(
    (finding) => `${finding.code}@${finding.path}`,
  );
}

/** The findings that belong to the two totality rules, in report order. */
function totalityFindings(manifest: unknown) {
  return validateEpisodeManifest(manifest).findings.filter((finding) =>
    TOTALITY_RULES.includes(finding.code),
  );
}

/** Reads a committed totality fixture. */
function readFixture(name: string): Record<string, unknown> {
  return readJson(join(FIXTURE_DIR, name));
}

/**
 * The committed fixtures, and the one mutation each carries.
 *
 * The fixture path is the *manifest field* the mutation touches; the finding
 * path is what the validator reports. Keeping both means a fixture cannot
 * silently drift into a second defect (see the drift pin below).
 */
const TOTALITY_FIXTURES: ReadonlyArray<{
  readonly file: string;
  readonly mutation: string;
  readonly code: EpisodeManifestIssueCode;
  readonly findingPath: string;
}> = [
  {
    file: 'totality-outcome-rules.json',
    mutation: 'acts[0].scenes[0].outcomeRules[1].when.objective',
    code: 'non-total-outcome-rules',
    findingPath: 'acts[0].scenes[0].outcomeRules[1]',
  },
  {
    file: 'totality-routes.json',
    mutation: 'acts[0].scenes[0].routes[1].on',
    code: 'non-total-routes',
    findingPath: 'acts[0].scenes[0].routes',
  },
];

/** True for a plain (non-array) object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** The dotted JSON paths at which `actual` differs from `expected`. */
function changedPaths(expected: unknown, actual: unknown, path = ''): string[] {
  if (Array.isArray(expected) || Array.isArray(actual)) {
    const left = Array.isArray(expected) ? expected : [];
    const right = Array.isArray(actual) ? actual : [];
    if (left.length !== right.length) return [path];
    return left.flatMap((item, index) => changedPaths(item, right[index], `${path}[${index}]`));
  }
  if (isRecord(expected) || isRecord(actual)) {
    const left = isRecord(expected) ? expected : {};
    const right = isRecord(actual) ? actual : {};
    const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
    return [...keys].flatMap((key) =>
      changedPaths(left[key], right[key], path === '' ? key : `${path}.${key}`),
    );
  }
  return Object.is(expected, actual) ? [] : [path];
}

describe('clean control — the committed Appendix A manifest', () => {
  it('reports no findings for any rule implemented so far, and names both totality rules', () => {
    const result = validateEpisodeManifest(reference());
    expect(result.findings).toEqual([]);
    expect(result.valid).toBe(true);
    expect(result.manifestId).toBe('long-erasure');
    expect(result.rules).toEqual(expect.arrayContaining([...TOTALITY_RULES]));
  });

  it('keeps the s-i-answer safety net clean — a gated wildcard followed by an unconditional wildcard', () => {
    const manifest = mutated((candidate) => {
      // Keep only s-i-answer: `failed-watch` (on "*", gated by budget
      // exhaustion) followed by `follow-the-door` (on "*", unconditional).
      // No outcome is named explicitly; the wildcard tail is the door.
      candidate.acts = [{ ...candidate.acts[0], scenes: [candidate.acts[0].scenes[1]] }];
    });
    expect(totalityFindings(manifest)).toEqual([]);
  });

  it('keeps the reports in agreement and deterministic for the clean control', () => {
    const result = validateEpisodeManifest(reference());
    expect(formatEpisodeManifestReport(result)).toContain('ERRORS (0): none');
    expect(formatEpisodeManifestReport(result)).toContain('RESULT: VALID');
    expect(JSON.parse(episodeManifestValidationToJson(result)).findings).toEqual(result.findings);
  });
});

describe('totality fixtures', () => {
  it.each(TOTALITY_FIXTURES)('$file reports exactly $code at $findingPath', (fixture) => {
    expect(pairs(readFixture(fixture.file))).toEqual([`${fixture.code}@${fixture.findingPath}`]);
  });

  it.each(TOTALITY_FIXTURES)(
    '$file is the Appendix A manifest plus exactly one documented mutation',
    (fixture) => {
      expect(changedPaths(readJson(REFERENCE_PATH), readFixture(fixture.file))).toEqual([
        fixture.mutation,
      ]);
    },
  );

  it('covers both totality rules exactly once', () => {
    const covered = TOTALITY_FIXTURES.map((fixture) => fixture.code);
    expect(new Set(covered).size).toBe(covered.length);
    expect([...covered].sort()).toEqual([...TOTALITY_RULES].sort());
  });
});

describe('non-total-outcome-rules', () => {
  it('reports a gated tail that leaves an outcome unclassified, naming the missing outcome', () => {
    const [finding] = validateEpisodeManifest(readFixture('totality-outcome-rules.json')).findings;
    expect(finding.code).toBe('non-total-outcome-rules');
    expect(finding.path).toBe('acts[0].scenes[0].outcomeRules[1]');
    expect(finding.message).toContain('failure');
    expect(finding.message).toContain('"survey-shaken"');
    expect(finding.message).toContain('s-i-open');
    expect(finding.manifestId).toBe('long-erasure');
  });

  it('reports one finding per scene, naming every missing outcome', () => {
    const manifest = mutated((candidate) => {
      candidate.acts[0].scenes[0].outcomeRules = [
        { id: 'only-rule', when: { objective: 'met' }, outcome: 'success' },
      ];
    });
    const findings = validateEpisodeManifest(manifest).findings;
    expect(findings).toHaveLength(1);
    expect(findings[0].code).toBe('non-total-outcome-rules');
    expect(findings[0].message).toContain('partial');
    expect(findings[0].message).toContain('failure');
  });

  it('stays clean when every outcome is named, even though the last rule is gated', () => {
    // GDD §2.4 as written against the AC: coverage is what totality needs when
    // the tail is conditional — the tail's `when` is then only one of three
    // first-match gates, not the sole classifier.
    const manifest = mutated((candidate) => {
      candidate.acts[0].scenes[0].outcomeRules = [
        { id: 'held', when: { objective: 'met' }, outcome: 'success' },
        { id: 'shaken', when: { budget: 'intact' }, outcome: 'partial' },
        { id: 'spent', when: { budget: 'exhausted' }, outcome: 'failure' },
      ];
    });
    expect(totalityFindings(manifest)).toEqual([]);
  });

  it('reports an empty rule table, because no close can classify', () => {
    const manifest = mutated((candidate) => {
      candidate.acts[0].scenes[0].outcomeRules = [];
    });
    expect(pairs(manifest)).toEqual([
      'non-total-outcome-rules@acts[0].scenes[0].outcomeRules',
    ]);
    expect(validateEpisodeManifest(manifest).findings[0].message).toContain('no outcome rules');
  });

  it('stays silent on a table that is not a table (the schema owns that)', () => {
    const notATable = mutated((candidate) => {
      candidate.acts[0].scenes[0].outcomeRules = {} as never;
    });
    const nonObjectEntries = mutated((candidate) => {
      candidate.acts[0].scenes[0].outcomeRules = [null as never];
    });
    expect(totalityFindings(notATable)).toEqual([]);
    expect(totalityFindings(nonObjectEntries)).toEqual([]);
  });
});

describe('non-total-routes', () => {
  it('reports a table with no wildcard that leaves an outcome doorless, naming the missing outcome', () => {
    const [finding] = validateEpisodeManifest(readFixture('totality-routes.json')).findings;
    expect(finding.code).toBe('non-total-routes');
    expect(finding.path).toBe('acts[0].scenes[0].routes');
    expect(finding.message).toContain('failure');
    expect(finding.message).toContain('s-i-open');
    expect(finding.message).not.toContain('when');
    expect(finding.manifestId).toBe('long-erasure');
  });

  it('reports a gated tail even when the wildcard covers every outcome, pointing at that route', () => {
    const manifest = mutated((candidate) => {
      candidate.acts[0].scenes[0].routes[1].when = { budget: 'exhausted' };
    });
    const [finding] = validateEpisodeManifest(manifest).findings;
    expect(`${finding.code}@${finding.path}`).toBe(
      'non-total-routes@acts[0].scenes[0].routes[1]',
    );
    expect(finding.message).toContain('"quiet-answer"');
    expect(finding.message).toContain('last route');
  });

  it('reports one finding per scene, naming every missing outcome', () => {
    const manifest = mutated((candidate) => {
      candidate.acts[0].scenes[0].routes = [
        {
          id: 'only-door',
          on: 'success',
          to: { kind: 'chain' },
        },
      ];
    });
    const findings = validateEpisodeManifest(manifest).findings;
    expect(findings).toHaveLength(1);
    expect(findings[0].code).toBe('non-total-routes');
    expect(findings[0].message).toContain('partial');
    expect(findings[0].message).toContain('failure');
  });

  it('accepts a table that names no outcome but ends in an unconditional wildcard', () => {
    const manifest = mutated((candidate) => {
      candidate.acts[0].scenes[0].routes = [
        {
          id: 'failed-watch',
          on: '*',
          when: { budget: 'exhausted' },
          to: { kind: 'beat', act: 'act-i', scene: 's-i-answer', beat: 'le-i-silent' },
        },
        { id: 'follow-the-door', on: '*', to: { kind: 'chain' } },
      ];
    });
    expect(totalityFindings(manifest)).toEqual([]);
  });

  it('reports an empty route table, because a close has no door at all', () => {
    const manifest = mutated((candidate) => {
      candidate.acts[0].scenes[0].routes = [];
    });
    expect(pairs(manifest)).toEqual(['non-total-routes@acts[0].scenes[0].routes']);
    expect(validateEpisodeManifest(manifest).findings[0].message).toContain('no route');
  });

  it('stays silent on a table that is not a table (the schema owns that)', () => {
    const notATable = mutated((candidate) => {
      candidate.acts[0].scenes[0].routes = 'nope' as never;
    });
    const nonObjectEntries = mutated((candidate) => {
      candidate.acts[0].scenes[0].routes = [5 as never];
    });
    expect(totalityFindings(notATable)).toEqual([]);
    expect(totalityFindings(nonObjectEntries)).toEqual([]);
  });
});

describe('coveredOutcomes — the coverage definition both rules share', () => {
  it('declares the three outcomes in classification order', () => {
    expect(SCENE_OUTCOMES).toEqual(['success', 'partial', 'failure']);
  });

  it('reads a route table through `on` and a rule table through `outcome`', () => {
    expect(coveredOutcomes([{ on: 'success', when: {} }, { on: 'partial' }])).toEqual([
      'success',
      'partial',
    ]);
    expect(coveredOutcomes([{ outcome: 'failure' }, { outcome: 'success' }])).toEqual([
      'failure',
      'success',
    ]);
  });

  it('keeps first-appearance order and does not expand a wildcard into three outcomes', () => {
    expect(coveredOutcomes([{ on: '*' }, { on: 'failure' }, { on: 'success' }])).toEqual([
      'failure',
      'success',
    ]);
  });

  it('is total: unknown outcomes, non-objects and absent members contribute nothing', () => {
    expect(coveredOutcomes([])).toEqual([]);
    expect(coveredOutcomes([null, 5, 'success', {}, { on: 'nope' }])).toEqual([]);
  });
});

describe('totality — ordering and barrel exports', () => {
  it('sorts findings across scenes by path, then code', () => {
    const manifest = mutated((candidate) => {
      // Two offending scenes, and two codes on the first one.
      candidate.acts[2].scenes[0].routes = [{ id: 'only-door', on: 'success', to: { kind: 'chain' } }];
      const scene = candidate.acts[0].scenes[0];
      scene.routes = [{ id: 'only-door', on: 'success', to: { kind: 'chain' } }];
      scene.outcomeRules = [{ id: 'only-rule', when: { objective: 'met' }, outcome: 'success' }];
    });
    expect(
      validateEpisodeManifest(manifest).findings.map((finding) => `${finding.code}@${finding.path}`),
    ).toEqual([
      'non-total-outcome-rules@acts[0].scenes[0].outcomeRules[0]',
      'non-total-routes@acts[0].scenes[0].routes',
      'non-total-routes@acts[2].scenes[0].routes',
    ]);
  });

  it('re-exports the coverage helper and the outcome list', () => {
    expect(barrel.coveredOutcomes).toBe(coveredOutcomes);
    expect(barrel.SCENE_OUTCOMES).toBe(SCENE_OUTCOMES);
  });
});
