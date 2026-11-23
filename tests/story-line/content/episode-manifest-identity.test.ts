/**
 * Episode manifest validator core and identity rules (CG-0MWSJYDLK0046BK8).
 *
 * This is the validator's tracer bullet: one traversal, one finding shape, one
 * deterministic ordering and one pair of formatters, exercised end-to-end by
 * the first rule family (identity/scope, GDD §2.4). Every later rule family
 * plugs into the same traversal and asserts against the same report, so the
 * properties pinned here are the ones the whole validator inherits:
 *
 * - **total** — a malformed manifest (missing arrays, wrong types, `null`
 *   members) is reported, never thrown on;
 * - **pure** — the input is never mutated (a deep-frozen manifest validates);
 * - **deterministic** — findings sort by `path` then `code`, and two runs over
 *   the same input produce byte-identical text and JSON;
 * - **scoped** — `valid` is computed from the *implemented* rules and the
 *   result names them, so declaring the whole §2.4 code union up front can
 *   never make a fixture assert nothing.
 *
 * Each identity code has one committed fixture under
 * `tests/story-line/content/fixtures/episode-manifest/`, derived from the
 * committed Appendix A manifest by exactly one documented mutation; a drift pin
 * asserts that, so a fixture cannot quietly grow a second defect. The clean
 * control is the Appendix A manifest itself.
 *
 * @module
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  EPISODE_MANIFEST_ISSUE_CODES,
  episodeManifestValidationToJson,
  formatEpisodeManifestReport,
  validateEpisodeManifest,
  type EpisodeManifestIssueCode,
} from '../../../src/story-line/content/episode-manifest';
import * as barrel from '../../../src/story-line/content/index';
import { REPO_ROOT } from './test-support';

/** The committed identity fixtures. */
const FIXTURE_DIR = join(REPO_ROOT, 'tests/story-line/content/fixtures/episode-manifest');

/** The committed Appendix A manifest — the clean control and fixture base. */
const REFERENCE_PATH = resolve(REPO_ROOT, 'example-games/gym/content/long-erasure-episode.json');

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

/** A fresh mutable copy of the committed Appendix A manifest. */
function mutableReference(): MutableManifest {
  return readJson(REFERENCE_PATH) as MutableManifest;
}

/** Applies one mutation to a fresh reference copy and returns that copy. */
function mutated(mutate: (manifest: MutableManifest) => void): MutableManifest {
  const manifest = mutableReference();
  mutate(manifest);
  return manifest;
}

/** The `code@path` pair (the validator's identity) for every finding. */
function pairs(manifest: unknown): string[] {
  return validateEpisodeManifest(manifest).findings.map((finding) => `${finding.code}@${finding.path}`);
}

/** Reads a committed identity fixture. */
function readFixture(name: string): Record<string, unknown> {
  return readJson(join(FIXTURE_DIR, name));
}

/** The identity/scope rules this child implements, in table order. */
const IDENTITY_RULES: readonly EpisodeManifestIssueCode[] = [
  'duplicate-act',
  'duplicate-scene',
  'duplicate-beat',
  'unknown-act',
  'unknown-scene',
];

/**
 * The committed fixtures, and the one mutation each carries.
 *
 * The path is the *manifest field* the mutation touches; the code/path pair is
 * what the validator reports. Keeping both means a fixture cannot silently
 * drift into a second defect (see the drift pin below).
 */
const IDENTITY_FIXTURES: ReadonlyArray<{
  readonly file: string;
  readonly mutation: string;
  readonly code: EpisodeManifestIssueCode;
  readonly findingPath: string;
}> = [
  {
    file: 'identity-duplicate-act.json',
    mutation: 'acts[2].id',
    code: 'duplicate-act',
    findingPath: 'acts[2].id',
  },
  {
    file: 'identity-duplicate-scene.json',
    mutation: 'acts[1].scenes[1].id',
    code: 'duplicate-scene',
    findingPath: 'acts[1].scenes[1].id',
  },
  {
    file: 'identity-duplicate-beat.json',
    mutation: 'acts[1].scenes[1].beats[4].cardId',
    code: 'duplicate-beat',
    findingPath: 'acts[1].scenes[1].beats[4].cardId',
  },
  {
    file: 'identity-unknown-act.json',
    mutation: 'acts[0].scenes[0].routes[1].to.act',
    code: 'unknown-act',
    findingPath: 'acts[0].scenes[0].routes[1].to.act',
  },
  {
    file: 'identity-unknown-scene.json',
    mutation: 'start.scene',
    code: 'unknown-scene',
    findingPath: 'start.scene',
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

/** Recursively freezes a JSON value so a mutation throws in strict mode. */
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const member of Object.values(value as Record<string, unknown>)) deepFreeze(member);
    Object.freeze(value);
  }
  return value;
}

describe('clean control — the committed Appendix A manifest', () => {
  it('reports no findings for the rules implemented in this child', () => {
    const result = validateEpisodeManifest(readJson(REFERENCE_PATH));
    expect(result.findings).toEqual([]);
    expect(result.valid).toBe(true);
    expect(result.manifestId).toBe('long-erasure');
    expect(result.rules).toEqual([
      'duplicate-act',
      'duplicate-scene',
      'duplicate-beat',
      'unknown-act',
      'unknown-scene',
      'non-total-routes',
      'non-total-outcome-rules',
    ]);
  });

  it('counts the acts, scenes and beats it traversed', () => {
    const result = validateEpisodeManifest(readJson(REFERENCE_PATH));
    expect(result.counts).toEqual({ acts: 3, scenes: 5, beats: 15 });
  });

  it('agrees between the text and the JSON report', () => {
    const result = validateEpisodeManifest(readJson(REFERENCE_PATH));
    expect(formatEpisodeManifestReport(result)).toContain('ERRORS (0): none');
    expect(formatEpisodeManifestReport(result)).toContain('RESULT: VALID');
    expect(JSON.parse(episodeManifestValidationToJson(result)).findings).toEqual(result.findings);
  });
});

describe('identity fixtures', () => {
  it.each(IDENTITY_FIXTURES)('$file reports exactly $code at $findingPath', (fixture) => {
    expect(pairs(readFixture(fixture.file))).toEqual([`${fixture.code}@${fixture.findingPath}`]);
  });

  it.each(IDENTITY_FIXTURES)(
    '$file is the Appendix A manifest plus exactly one documented mutation',
    (fixture) => {
      expect(changedPaths(readJson(REFERENCE_PATH), readFixture(fixture.file))).toEqual([
        fixture.mutation,
      ]);
    },
  );

  it('covers every identity rule exactly once', () => {
    const covered = IDENTITY_FIXTURES.map((fixture) => fixture.code);
    expect(new Set(covered).size).toBe(covered.length);
    expect([...covered].sort()).toEqual([...IDENTITY_RULES].sort());
  });
});

describe('duplicate-act', () => {
  it('reports an act id reused later in the manifest, naming the first declaration', () => {
    const [finding] = validateEpisodeManifest(readFixture('identity-duplicate-act.json')).findings;
    expect(finding.code).toBe('duplicate-act');
    expect(finding.path).toBe('acts[2].id');
    expect(finding.message).toContain('"act-i"');
    expect(finding.message).toContain('acts[0].id');
    expect(finding.manifestId).toBe('long-erasure');
  });

  it('reports a reused act order, because order is the only ordering authority', () => {
    const manifest = mutated((candidate) => {
      candidate.acts[2].order = 1;
    });
    expect(pairs(manifest)).toEqual(['duplicate-act@acts[2].order']);
  });
});

describe('duplicate-scene', () => {
  it('reports a scene id reused across acts, naming the first declaration', () => {
    const [finding] = validateEpisodeManifest(readFixture('identity-duplicate-scene.json')).findings;
    expect(finding.code).toBe('duplicate-scene');
    expect(finding.path).toBe('acts[1].scenes[1].id');
    expect(finding.message).toContain('"s-i-open"');
    expect(finding.message).toContain('acts[0].scenes[0].id');
  });
});

describe('duplicate-beat', () => {
  it('reports a card id used by two beats, because beat identity is the card id', () => {
    const [finding] = validateEpisodeManifest(readFixture('identity-duplicate-beat.json')).findings;
    expect(finding.code).toBe('duplicate-beat');
    expect(finding.path).toBe('acts[1].scenes[1].beats[4].cardId');
    expect(finding.message).toContain('"le-i-open"');
    expect(finding.message).toContain('acts[0].scenes[0].beats[0].cardId');
  });
});

describe('unknown-act', () => {
  it('reports a route target naming an act that does not exist', () => {
    const [finding] = validateEpisodeManifest(readFixture('identity-unknown-act.json')).findings;
    expect(finding.code).toBe('unknown-act');
    expect(finding.path).toBe('acts[0].scenes[0].routes[1].to.act');
    expect(finding.message).toContain('"act-iv"');
  });

  it('reports start.act naming an act that does not exist', () => {
    const manifest = mutated((candidate) => {
      candidate.start.act = 'act-iv';
    });
    expect(pairs(manifest)).toEqual(['unknown-act@start.act']);
  });

  it('reports an entryScene that resolves into a different act (the implied act is wrong)', () => {
    const manifest = mutated((candidate) => {
      candidate.acts[0].entryScene = 's-ii-shelter';
    });
    expect(pairs(manifest)).toEqual(['unknown-act@acts[0].entryScene']);
  });

  it('stays silent when a route target names an act that exists', () => {
    const manifest = mutated((candidate) => {
      (candidate.acts[0].scenes[0].routes[1].to as Record<string, unknown>).act = 'act-ii';
    });
    // The scene resolves, the act resolves: the identity rules have no opinion
    // on route reachability (that is the scene-space guard's job).
    expect(pairs(manifest)).toEqual([]);
  });
});

describe('unknown-scene', () => {
  it('reports start.scene naming a scene that does not exist', () => {
    const [finding] = validateEpisodeManifest(readFixture('identity-unknown-scene.json')).findings;
    expect(finding.code).toBe('unknown-scene');
    expect(finding.path).toBe('start.scene');
    expect(finding.message).toContain('"s-i-missing"');
  });

  it('reports an act.entryScene naming a scene that does not exist', () => {
    const manifest = mutated((candidate) => {
      candidate.acts[1].entryScene = 's-ii-nope';
    });
    expect(pairs(manifest)).toEqual(['unknown-scene@acts[1].entryScene']);
  });

  it('reports a route target naming a scene that does not exist', () => {
    const manifest = mutated((candidate) => {
      (candidate.acts[0].scenes[0].routes[1].to as Record<string, unknown>).scene = 's-i-nope';
    });
    expect(pairs(manifest)).toEqual(['unknown-scene@acts[0].scenes[0].routes[1].to.scene']);
  });
});

describe('deterministic ordering', () => {
  /** A manifest seeded with three findings whose discovery order is not path order. */
  function scrambled(): MutableManifest {
    return mutated((candidate) => {
      candidate.start.scene = 's-i-missing';
      candidate.start.act = 'act-iv';
      candidate.acts[2].id = 'act-i';
    });
  }

  it('sorts findings by path, then code, whatever order the rules ran in', () => {
    expect(
      validateEpisodeManifest(scrambled()).findings.map((finding) => finding.code),
    ).toEqual(['duplicate-act', 'unknown-act', 'unknown-scene']);
    expect(
      validateEpisodeManifest(scrambled()).findings.map((finding) => finding.path),
    ).toEqual(['acts[2].id', 'start.act', 'start.scene']);
  });

  it('produces byte-identical text and JSON reports across runs', () => {
    const first = validateEpisodeManifest(scrambled());
    const second = validateEpisodeManifest(scrambled());
    expect(formatEpisodeManifestReport(first)).toBe(formatEpisodeManifestReport(second));
    expect(episodeManifestValidationToJson(first)).toBe(episodeManifestValidationToJson(second));
  });

  it('carries no timestamp, RNG or wall-clock input in the report', () => {
    const report = episodeManifestValidationToJson(validateEpisodeManifest(scrambled()));
    expect(report).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/u);
  });
});

describe('totality — the validator never throws', () => {
  const malformed: ReadonlyArray<readonly [string, unknown]> = [
    ['an empty object', {}],
    ['null', null],
    ['undefined', undefined],
    ['a number', 42],
    ['a string', 'not a manifest'],
    ['an array', []],
    ['acts: null', { acts: null }],
    ['acts holding non-objects', { acts: [null, 5, 'x'] }],
    ['a non-array scenes member', { acts: [{ id: 'act-i', scenes: 'x' }] }],
    [
      'a scene with wrong-typed members',
      {
        acts: [
          {
            id: 'act-i',
            entryScene: 7,
            scenes: [
              { id: 1, beats: 'x', outcomeRules: {}, routes: [null], losses: 3, entryBeat: [] },
            ],
          },
        ],
      },
    ],
    ['a string start block', { start: 'start', acts: [] }],
    ['a numeric id and non-object routes', { id: 5, acts: [{ scenes: [{ routes: 'x' }] }] }],
  ];

  it.each(malformed)('returns a clean result for %s', (_label, manifest) => {
    const result = validateEpisodeManifest(manifest);
    expect(result.findings).toEqual([]);
    expect(result.valid).toBe(true);
    expect(result.manifestId).toBe('');
  });

  it('never throws on a manifest whose members are the wrong type', () => {
    for (const [, manifest] of malformed) {
      expect(() => validateEpisodeManifest(manifest)).not.toThrow();
    }
  });

  it('counts array elements it traversed without trusting their shape', () => {
    expect(validateEpisodeManifest({ acts: [null, 5, 'x'] }).counts).toEqual({
      acts: 3,
      scenes: 0,
      beats: 0,
    });
    expect(validateEpisodeManifest({ acts: [{ scenes: 'x' }] }).counts).toEqual({
      acts: 1,
      scenes: 0,
      beats: 0,
    });
    expect(validateEpisodeManifest({ acts: [{ scenes: [{ beats: 'x' }] }] }).counts).toEqual({
      acts: 1,
      scenes: 1,
      beats: 0,
    });
  });

  it('does not mutate the manifest it inspects', () => {
    const frozen = deepFreeze(mutableReference());
    expect(() => validateEpisodeManifest(frozen)).not.toThrow();
    expect(pairs(frozen)).toEqual([]);
  });
});

describe('finding shape', () => {
  it('carries the code, the dotted JSON path, the message and the manifest id', () => {
    const [finding] = validateEpisodeManifest(readFixture('identity-unknown-scene.json')).findings;
    expect(Object.keys(finding)).toEqual(['code', 'path', 'message', 'manifestId']);
    expect(finding.path).toMatch(/^[A-Za-z][\w-]*(\[\d+\]|\.[A-Za-z][\w-]*)+$/u);
    expect(finding.message.length).toBeGreaterThan(0);
    expect(EPISODE_MANIFEST_ISSUE_CODES).toContain(finding.code);
  });
});

describe('the declared rule-code union', () => {
  it('declares every GDD §2.4 code, including the families later children implement', () => {
    // The union is declared in full here so a later rule family adds a
    // predicate, never a new code. `clock-cost-mismatch` is the migration-only
    // rule that G10 retires with the legacy CSV column; it stays declared
    // until then so the parent epic's migration rule has a home.
    expect([...EPISODE_MANIFEST_ISSUE_CODES]).toEqual([
      'duplicate-act',
      'duplicate-scene',
      'duplicate-beat',
      'unknown-card',
      'unknown-scene',
      'unknown-act',
      'unassigned-card',
      'dangling-chain',
      'non-total-routes',
      'non-total-outcome-rules',
      'objective-invalid',
      'loss-not-irreversible',
      'numeric-invalid',
      'resource-set-mismatch',
      'clock-cost-mismatch',
      'ending-successor',
    ]);
  });

  it('names each code once', () => {
    expect(new Set(EPISODE_MANIFEST_ISSUE_CODES).size).toBe(EPISODE_MANIFEST_ISSUE_CODES.length);
  });
});

describe('formatters', () => {
  it('render an invalid manifest with one line per finding', () => {
    const result = validateEpisodeManifest(readFixture('identity-duplicate-beat.json'));
    const text = formatEpisodeManifestReport(result);
    expect(text).toContain('Episode manifest validation report');
    expect(text).toContain('Manifest: long-erasure');
    expect(text).toContain('ERRORS (1):');
    expect(text).toContain(
      '✗ [duplicate-beat] acts[1].scenes[1].beats[4].cardId:',
    );
    expect(text).toContain('RESULT: INVALID');
    expect(result.valid).toBe(false);
  });

  it('emits a stable JSON document with a fixed key order', () => {
    const result = validateEpisodeManifest(readFixture('identity-duplicate-act.json'));
    const parsed = JSON.parse(episodeManifestValidationToJson(result)) as Record<string, unknown>;
    expect(Object.keys(parsed)).toEqual(['valid', 'manifestId', 'counts', 'rules', 'findings']);
    expect(parsed.valid).toBe(false);
    expect(parsed.manifestId).toBe('long-erasure');
    expect(parsed.rules).toEqual(result.rules);
    expect(parsed.counts).toEqual(result.counts);
  });
});

describe('barrel exports', () => {
  it('re-exports the validator, its result types and the formatters', () => {
    expect(barrel.validateEpisodeManifest).toBe(validateEpisodeManifest);
    expect(barrel.formatEpisodeManifestReport).toBe(formatEpisodeManifestReport);
    expect(barrel.episodeManifestValidationToJson).toBe(episodeManifestValidationToJson);
    expect(barrel.EPISODE_MANIFEST_ISSUE_CODES).toBe(EPISODE_MANIFEST_ISSUE_CODES);
  });
});
