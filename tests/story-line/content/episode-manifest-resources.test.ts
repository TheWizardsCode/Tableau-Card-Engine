/**
 * Episode manifest resource-block rules (CG-0MWSJYLZ3005C2V1).
 *
 * The manifest carries the resource model as **data**: the declared key set, the
 * irreversible subset, the run's starting bag (`resources.start`) and the
 * per-key design bounds (`resources.bounds`). This family proves that block
 * agrees with itself and with the content file, so a later reachability guard
 * can argue from declared data instead of from the game constant
 * `DEFAULT_RESOURCES`.
 *
 * Four defects share the §2.4 code `resource-set-mismatch`, each with its own
 * stable `reason` (the same machine-readable field `content/validate.ts`
 * carries): `declared-set-mismatch`, `irreversible-not-declared`,
 * `missing-start-entry`, `missing-bounds-entry`, `bounds-inverted` and
 * `start-outside-bounds`.
 *
 * The declared set is the **content file's**, derived exactly as the route-space
 * guard derives it (`cardsFromCsv` → each card's `resourceKeys` →
 * `resolveResourceKeys`), so the validator's `declaredResources` argument is the
 * only source of that set: nothing on the validation path reads
 * `DEFAULT_RESOURCES`, a game module, or the engine's `coins` / `reputation`
 * projection. The starting bag and bounds are read through the pure
 * `src/story-line/resources.ts` read-throughs, which fail closed on a missing
 * key rather than substituting a default.
 *
 * Each structural variant has its own committed fixture under
 * `fixtures/episode-manifest/resources-*.json`, derived from the committed
 * Appendix A manifest by exactly one documented mutation (pinned below). The
 * `declared-set-mismatch` variant has **no** manifest fixture on purpose: the
 * defect lives in the content binding, so its failing input is an in-memory
 * one-key override of the derived declared set.
 *
 * @module
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { LONG_ERASURE_CONTENT_ADAPTER } from '../../../src/story-line/content/adapters';
import { cardsFromCsv, parseCsv, parseResourceDeclaration } from '../../../src/story-line/content/csv';
import {
  episodeManifestValidationToJson,
  formatEpisodeManifestReport,
  validateEpisodeManifest,
  type EpisodeManifestRule,
  type EpisodeManifestValidationResult,
} from '../../../src/story-line/content/episode-manifest';
import type { ContentCard } from '../../../src/story-line/content/types';
import {
  DEFAULT_RESOURCE_KEYS,
  readManifestBounds,
  readManifestStartBag,
  resolveResourceKeys,
} from '../../../src/story-line/resources';
import { REPO_ROOT } from './test-support';

/** The committed resource-block fixtures. */
const FIXTURE_DIR = join(REPO_ROOT, 'tests/story-line/content/fixtures/episode-manifest');

/** The committed Appendix A manifest — the clean control and fixture base. */
const REFERENCE_PATH = resolve(REPO_ROOT, 'example-games/gym/content/long-erasure-episode.json');

/** The shipped story-line content the episode is authored against. */
const CONTENT_PATH = resolve(REPO_ROOT, 'example-games/gym/content/long-erasure.csv');

/** The resource rule this child implements. */
const RESOURCE_RULES: readonly EpisodeManifestRule[] = ['resource-set-mismatch'];

/** Reads and parses a JSON file. */
function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, 'utf-8')) as Record<string, unknown>;
}

/** The reference manifest as a mutable deep copy. */
function reference(): Record<string, unknown> {
  return readJson(REFERENCE_PATH);
}

/** The shipped content rows, parsed through the real adapter. */
function shippedCards(): ContentCard[] {
  return cardsFromCsv(
    parseCsv(readFileSync(CONTENT_PATH, 'utf-8')),
    LONG_ERASURE_CONTENT_ADAPTER,
  );
}

/**
 * The content file's declared resource key set, derived the way the guard
 * derives it: the union of every card's effective `resourceKeys` (its row's
 * `resources` cell, else the file-level `#resources:` declaration), normalised
 * through `resolveResourceKeys`.
 */
function declaredFromContent(cards: readonly ContentCard[] = shippedCards()): readonly string[] {
  const declaredKeys = cards.flatMap((card) => card.resourceKeys);
  return resolveResourceKeys(declaredKeys.length > 0 ? declaredKeys : undefined);
}

/** Validates a manifest against the shipped content and its declared set. */
function validate(
  manifest: unknown,
  declared: readonly string[] = declaredFromContent(),
): EpisodeManifestValidationResult {
  return validateEpisodeManifest(manifest, shippedCards(), declared, LONG_ERASURE_CONTENT_ADAPTER);
}

/** The `code@path` pair (the validator's identity) for every finding. */
function pairs(result: EpisodeManifestValidationResult): string[] {
  return result.findings.map((finding) => `${finding.code}@${finding.path}`);
}

/** The findings carrying a given `reason`. */
function withReason(result: EpisodeManifestValidationResult, reason: string) {
  return result.findings.filter((finding) => finding.reason === reason);
}

/** Reads a committed resource-block fixture. */
function readFixture(name: string): Record<string, unknown> {
  return readJson(join(FIXTURE_DIR, name));
}

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

/**
 * The committed resource-block fixtures, and the one mutation each carries.
 *
 * The mutation path is the *manifest field* that changed; the code/path/reason
 * triple is what the validator reports. Keeping both means a fixture cannot
 * silently drift into a second defect (see the drift pin below).
 *
 * One fixture legitimately reports a second code: removing the only
 * irreversible key also makes the Appendix A loss rule non-irreversible, which
 * the semantic family reports as `loss-not-irreversible`. That cross-rule
 * interaction is pinned in `alsoReports` rather than hidden by mutating the
 * fixture twice.
 */
const RESOURCE_FIXTURES: ReadonlyArray<{
  readonly file: string;
  readonly mutation: readonly string[];
  readonly findingPath: string;
  readonly reason: string;
  /** Additional findings this one-mutation fixture legitimately triggers. */
  readonly alsoReports?: readonly string[];
}> = [
  {
    file: 'resources-missing-start.json',
    mutation: ['resources.start.stores'],
    findingPath: 'resources.start.stores',
    reason: 'missing-start-entry',
  },
  {
    file: 'resources-missing-bounds.json',
    // A removed `{ min, max }` object is two removed leaves.
    mutation: ['resources.bounds.charge.min', 'resources.bounds.charge.max'],
    findingPath: 'resources.bounds.charge',
    reason: 'missing-bounds-entry',
  },
  {
    file: 'resources-bounds-inverted.json',
    mutation: ['resources.bounds.morale.min', 'resources.bounds.morale.max'],
    findingPath: 'resources.bounds.morale',
    reason: 'bounds-inverted',
  },
  {
    file: 'resources-start-outside-bounds.json',
    mutation: ['resources.start.goodwill'],
    findingPath: 'resources.start.goodwill',
    reason: 'start-outside-bounds',
  },
  {
    file: 'resources-irreversible-not-declared.json',
    mutation: ['resources.irreversible[0]'],
    findingPath: 'resources.irreversible[0]',
    reason: 'irreversible-not-declared',
    // The hull loss rule is now non-irreversible too (semantic rules).
    alsoReports: ['loss-not-irreversible@acts[2].scenes[0].losses[0].field'],
  },
];

describe('clean control — the Appendix A manifest as a resource block given long-erasure.csv', () => {
  it('reports no findings and runs the resource rule', () => {
    const result = validate(reference());
    expect(pairs(result)).toEqual([]);
    expect(result.valid).toBe(true);
    expect(result.rules).toEqual(expect.arrayContaining([...RESOURCE_RULES]));
  });

  it('reads the declared set from the content file, not from a game constant', () => {
    // This file declares its keys per row; it has no file-level declaration.
    expect(parseResourceDeclaration(parseCsv(readFileSync(CONTENT_PATH, 'utf-8')).declarations)).toEqual(
      [],
    );
    expect(declaredFromContent()).toEqual(['hull', 'morale', 'stores', 'goodwill', 'charge']);
    // The engine's default projection is deliberately a different set, so a
    // rule that fell back to it would report a mismatch here.
    expect(declaredFromContent()).not.toEqual([...DEFAULT_RESOURCE_KEYS]);
  });

  it('compares the declared sets order-insensitively', () => {
    const reversed = [...declaredFromContent()].reverse();
    expect(validate(reference(), reversed).findings).toEqual([]);
  });

  it('keeps the text and JSON reports in agreement and deterministic', () => {
    const first = validate(reference());
    const second = validate(reference());
    expect(formatEpisodeManifestReport(first)).toContain('ERRORS (0): none');
    expect(formatEpisodeManifestReport(first)).toBe(formatEpisodeManifestReport(second));
    expect(episodeManifestValidationToJson(first)).toBe(episodeManifestValidationToJson(second));
    expect(JSON.parse(episodeManifestValidationToJson(first)).findings).toEqual(first.findings);
  });
});

describe('declared-set-mismatch — the manifest against the content file', () => {
  // No manifest fixture: the defect is in the content binding, so the failing
  // input is one key of the derived declared set.
  const withExtraKey = (): readonly string[] => [...declaredFromContent(), 'supplies'];

  it('reports one finding at resources.declared naming the missing key', () => {
    const result = validate(reference(), withExtraKey());
    expect(pairs(result)).toEqual(['resource-set-mismatch@resources.declared']);
    expect(withReason(result, 'declared-set-mismatch')).toHaveLength(1);
    const [finding] = result.findings;
    expect(finding.message).toContain('missing supplies');
    expect(finding.message).toContain('extra (none)');
  });

  it('names both the missing and the extra keys when the sets diverge both ways', () => {
    const declared = [...declaredFromContent()];
    declared[declared.indexOf('stores')] = 'supplies';
    const result = validate(reference(), declared);
    expect(pairs(result)).toEqual(['resource-set-mismatch@resources.declared']);
    const [finding] = result.findings;
    expect(finding.message).toContain('missing supplies');
    expect(finding.message).toContain('extra stores');
  });

  it('honours an explicitly empty declared set instead of substituting the default projection', () => {
    const result = validate(reference(), []);
    expect(pairs(result)).toEqual(['resource-set-mismatch@resources.declared']);
    const [finding] = result.findings;
    expect(finding.message).toContain('extra hull, morale, stores, goodwill, charge');
    // If the engine's projection had been substituted, `coins` would appear.
    expect(finding.message).not.toContain('coins');
  });

  it('is reported once for the whole set, never once per key', () => {
    const result = validate(reference(), ['hull']);
    expect(pairs(result)).toEqual(['resource-set-mismatch@resources.declared']);
  });
});

describe('resource-block fixtures', () => {
  it.each(RESOURCE_FIXTURES)(
    '$file reports exactly $reason at $findingPath',
    (fixture) => {
      const result = validate(readFixture(fixture.file));
      expect(result.valid).toBe(false);
      expect(pairs(result)).toEqual(
        [`resource-set-mismatch@${fixture.findingPath}`, ...(fixture.alsoReports ?? [])].sort(),
      );
      expect(
        result.findings.find((finding) => finding.code === 'resource-set-mismatch')?.reason,
      ).toBe(fixture.reason);
    },
  );

  it.each(RESOURCE_FIXTURES)(
    '$file is the Appendix A manifest plus exactly one documented mutation',
    (fixture) => {
      expect(changedPaths(reference(), readFixture(fixture.file))).toEqual([...fixture.mutation]);
    },
  );

  it('renders the stable reason in the text report so a reviewer sees which variant failed', () => {
    const report = formatEpisodeManifestReport(validate(readFixture('resources-missing-start.json')));
    expect(report).toContain(
      '✗ [resource-set-mismatch] (missing-start-entry) resources.start.stores:',
    );
  });
});

describe('rule activation — the declared-resource binding is what turns the rule on', () => {
  it('skips the resource rules and reports no finding when no declared set is bound', () => {
    const result = validateEpisodeManifest(reference());
    expect(result.rules).not.toContain('resource-set-mismatch');
    expect(result.findings).toEqual([]);
  });

  it('stays silent about a structural defect the unbound validation never claimed to check', () => {
    const result = validateEpisodeManifest(readFixture('resources-missing-start.json'));
    expect(result.findings).toEqual([]);
  });

  it('appends the resource and migration rules after the implemented and content rules', () => {
    expect(validate(reference()).rules.slice(-3)).toEqual([
      'ending-successor',
      'resource-set-mismatch',
      'clock-cost-mismatch',
    ]);
  });
});

describe('totality — a malformed resource block never throws', () => {
  it.each([
    { resources: null },
    { resources: 'nope' },
    { resources: { declared: 'hull', start: [], bounds: 5 } },
    { resources: { declared: [5, null, ''], start: {}, bounds: {} } },
  ])('tolerates resources=%o', (manifest) => {
    expect(() => validate(manifest)).not.toThrow();
  });
});

describe('read-through — readManifestStartBag', () => {
  it('reads one value per declared key, in declaration order', () => {
    expect(readManifestStartBag(['hull', 'morale'], { hull: 5, morale: 3 })).toEqual({
      ok: true,
      bag: { hull: 5, morale: 3 },
    });
  });

  it('fails closed on a missing key rather than defaulting it to zero', () => {
    const read = readManifestStartBag(['hull', 'morale'], { hull: 5 });
    expect(read.ok).toBe(false);
    expect(read).toEqual({
      ok: false,
      issues: [{ reason: 'missing-start-entry', key: 'morale' }],
    });
  });

  it('fails closed on a non-finite value', () => {
    const read = readManifestStartBag(['hull'], { hull: '5' });
    expect(read).toEqual({
      ok: false,
      issues: [{ reason: 'missing-start-entry', key: 'hull' }],
    });
  });

  it('fails closed without substituting the engine default projection', () => {
    const read = readManifestStartBag(['hull'], {});
    expect(read.ok).toBe(false);
    expect(JSON.stringify(read)).not.toContain('coins');
  });

  it('is total: a non-object start fails closed, an empty declaration reads as an empty bag', () => {
    expect(readManifestStartBag(['hull'], undefined).ok).toBe(false);
    expect(readManifestStartBag([], undefined)).toEqual({ ok: true, bag: {} });
  });
});

describe('read-through — readManifestBounds', () => {
  it('reads one range per declared key', () => {
    expect(readManifestBounds(['hull'], { hull: { min: 0, max: 5 } })).toEqual({
      ok: true,
      bounds: { hull: { min: 0, max: 5 } },
    });
  });

  it('fails closed on a missing entry and on a malformed range', () => {
    expect(readManifestBounds(['hull'], {})).toEqual({
      ok: false,
      issues: [{ reason: 'missing-bounds-entry', key: 'hull' }],
    });
    expect(readManifestBounds(['hull'], { hull: { min: 0 } })).toEqual({
      ok: false,
      issues: [{ reason: 'missing-bounds-entry', key: 'hull' }],
    });
  });

  it('reports an inverted range instead of normalising it', () => {
    expect(readManifestBounds(['morale'], { morale: { min: 8, max: 0 } })).toEqual({
      ok: false,
      issues: [{ reason: 'bounds-inverted', key: 'morale' }],
    });
  });

  it('is total: a non-object bounds value fails closed, an empty declaration reads as an empty map', () => {
    expect(readManifestBounds(['hull'], null).ok).toBe(false);
    expect(readManifestBounds([], null)).toEqual({ ok: true, bounds: {} });
  });
});
