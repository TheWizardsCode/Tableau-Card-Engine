/**
 * Episode manifest card-resolution and chaining rules (CG-0MWSJYGEG007WOIU).
 *
 * The identity family validates a manifest against itself; this family needs
 * the **bound content** as a second input. `unknown-card` proves every card
 * reference resolves, `unassigned-card` proves no choice card of the episode's
 * storyline is orphaned, `dangling-chain` proves a chain route can always
 * target something, and `ending-successor` proves the reset loop only points at
 * assigned beats or another ending.
 *
 * The rules read option successors through the shared content compilation seam
 * (`compileContentOptions` → `optionSuccessorIds`); the validator never
 * re-parses the `options` cell. The fixtures under
 * `fixtures/episode-manifest/cards-*.json` are the committed Appendix A
 * manifest plus exactly one documented assignment mutation, so a fixture
 * cannot quietly grow a second defect. The clean control is the committed
 * Appendix A manifest bound to the shipped `long-erasure.csv`.
 *
 * `unassigned-card` and `ending-successor` have no manifest fixture on
 * purpose. Every assigned card of this episode is also a successor of a beat
 * or of the reset ending, so orphaning one through the manifest alone always
 * cascades into `dangling-chain` or `ending-successor`. Their failing inputs
 * are therefore one-field content overrides of the shipped rows, built
 * in-memory here and asserted to change exactly that one field.
 *
 * @module
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { LONG_ERASURE_CONTENT_ADAPTER } from '../../../src/story-line/content/adapters';
import {
  cardsFromCsv,
  parseCsv,
} from '../../../src/story-line/content/csv';
import {
  EPISODE_MANIFEST_ISSUE_CODES,
  episodeManifestValidationToJson,
  formatEpisodeManifestReport,
  validateEpisodeManifest,
  type EpisodeManifestRule,
  type EpisodeManifestValidationResult,
} from '../../../src/story-line/content/episode-manifest';
import type { ContentCard } from '../../../src/story-line/content/types';
import { REPO_ROOT } from './test-support';

/** The committed card-resolution fixtures. */
const FIXTURE_DIR = join(REPO_ROOT, 'tests/story-line/content/fixtures/episode-manifest');

/** The committed Appendix A manifest — the clean control and fixture base. */
const REFERENCE_PATH = resolve(REPO_ROOT, 'example-games/gym/content/long-erasure-episode.json');

/** The shipped story-line content the episode is authored against. */
const CONTENT_PATH = resolve(REPO_ROOT, 'example-games/gym/content/long-erasure.csv');

/** The card-resolution rules this child implements, in table order. */
const CARD_RULES: readonly EpisodeManifestRule[] = [
  'unknown-card',
  'unassigned-card',
  'dangling-chain',
  'ending-successor',
];

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

/** The reference manifest's declared resource keys. */
function declaredResourcesOf(manifest: Record<string, unknown>): readonly string[] {
  const resources = manifest.resources as { declared?: unknown } | undefined;
  return Array.isArray(resources?.declared) ? (resources?.declared as string[]) : [];
}

/** Validates a manifest against the shipped content (and its declared keys). */
function validate(
  manifest: unknown,
  cards: readonly ContentCard[] = shippedCards(),
): EpisodeManifestValidationResult {
  return validateEpisodeManifest(
    manifest,
    cards,
    declaredResourcesOf(readJson(REFERENCE_PATH)),
    LONG_ERASURE_CONTENT_ADAPTER,
  );
}

/** The `code@path` pair (the validator's identity) for every finding. */
function pairs(result: EpisodeManifestValidationResult): string[] {
  return result.findings.map((finding) => `${finding.code}@${finding.path}`);
}

/** The finding with the given code and path, or `undefined`. */
function findingAt(result: EpisodeManifestValidationResult, path: string) {
  return result.findings.find((finding) => finding.path === path);
}

/** Reads a committed card-resolution fixture. */
function readFixture(name: string): Record<string, unknown> {
  return readJson(join(FIXTURE_DIR, name));
}

/** A shallow copy of the shipped rows with one card's options replaced. */
function withOptions(
  cards: readonly ContentCard[],
  cardId: string,
  options: string,
): ContentCard[] {
  expect(cards.some((card) => card.id === cardId)).toBe(true);
  return cards.map((card) => (card.id === cardId ? { ...card, options } : card));
}

/** A synthetic content row appended to a fixture card list. */
function syntheticCard(overrides: Partial<ContentCard> & { id: string }): ContentCard {
  return {
    name: overrides.id,
    effect: '',
    options: '',
    storylineId: null,
    storylineTitle: null,
    fields: {},
    resourceKeys: [],
    ...overrides,
  };
}

describe('clean control — the committed Appendix A manifest bound to long-erasure.csv', () => {
  it('reports no findings for any rule implemented so far', () => {
    const result = validate(reference());
    expect(pairs(result)).toEqual([]);
    expect(result.valid).toBe(true);
    expect(result.manifestId).toBe('long-erasure');
  });

  it('reports the manifest-only rules, the four card-resolution rules and the resource rule', () => {
    expect(validate(reference()).rules).toEqual([
      'duplicate-act',
      'duplicate-scene',
      'duplicate-beat',
      'unknown-act',
      'unknown-scene',
      'non-total-routes',
      'non-total-outcome-rules',
      'objective-invalid',
      'loss-not-irreversible',
      'numeric-invalid',
      ...CARD_RULES,
      // The resource rules run because `validate()` binds a declared set.
      'resource-set-mismatch',
    ]);
  });

  it('counts the same traversal as the manifest-only validation', () => {
    expect(validate(reference()).counts).toEqual({ acts: 3, scenes: 5, beats: 15 });
  });

  it('keeps the text and JSON reports in agreement', () => {
    const result = validate(reference());
    expect(formatEpisodeManifestReport(result)).toContain('ERRORS (0): none');
    expect(formatEpisodeManifestReport(result)).toContain('RESULT: VALID');
    expect(JSON.parse(episodeManifestValidationToJson(result)).findings).toEqual(result.findings);
  });
});

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
 * The committed card-resolution fixtures and the documented mutation each
 * carries. Two fixtures drop an array element, so their "mutation" is the
 * array that shrank rather than a single leaf.
 */
const CARD_FIXTURES: ReadonlyArray<{
  readonly file: string;
  readonly mutations: readonly string[];
  readonly findings: readonly string[];
}> = [
  {
    file: 'cards-unknown-card.json',
    mutations: ['acts[2].scenes[0].routes[1].to.cardId'],
    findings: ['unknown-card@acts[2].scenes[0].routes[1].to.cardId'],
  },
  {
    file: 'cards-dangling-chain.json',
    mutations: ['endings'],
    findings: ['dangling-chain@acts[1].scenes[1].beats[0].cardId'],
  },
];

describe('card-resolution fixtures', () => {
  it.each(CARD_FIXTURES)('$file reports exactly the documented findings', (fixture) => {
    expect(pairs(validate(readFixture(fixture.file)))).toEqual(fixture.findings);
  });

  it.each(CARD_FIXTURES)(
    '$file is the Appendix A manifest plus exactly its documented mutation',
    (fixture) => {
      expect(changedPaths(readJson(REFERENCE_PATH), readFixture(fixture.file)).sort()).toEqual(
        [...fixture.mutations].sort(),
      );
    },
  );

  it('covers every card-resolution rule with a failing fixture or content override', () => {
    const covered = [
      ...CARD_FIXTURES.flatMap((fixture) =>
        fixture.findings.map((pair) => pair.slice(0, pair.indexOf('@')) as EpisodeManifestRule),
      ),
      'unassigned-card',
      'ending-successor',
    ];
    expect(new Set(covered).size).toBe(covered.length);
    expect([...covered].sort()).toEqual([...CARD_RULES].sort());
  });
});

describe('unknown-card', () => {
  it('reports a route target naming a card absent from the bound content', () => {
    const [finding] = validate(readFixture('cards-unknown-card.json')).findings;
    expect(finding.code).toBe('unknown-card');
    expect(finding.path).toBe('acts[2].scenes[0].routes[1].to.cardId');
    expect(finding.message).toContain('"le-end-missing"');
    expect(finding.manifestId).toBe('long-erasure');
  });

  it('reports a beat card id absent from the bound content', () => {
    const manifest = reference();
    const beats = (manifest.acts as Array<{ scenes: Array<{ beats: Array<{ cardId: string }> }> }>)[0]
      .scenes[0].beats;
    beats[0].cardId = 'le-i-missing';
    const result = validate(manifest);
    expect(findingAt(result, 'acts[0].scenes[0].beats[0].cardId')?.code).toBe('unknown-card');
    // Orphaning the card cascades by design: the card is no longer assigned and
    // the reset ending's successor now dangles. The rule under test still fires.
    expect(result.findings.some((finding) => finding.code === 'unknown-card')).toBe(true);
  });

  it('reports start.beat naming a card absent from the bound content', () => {
    const manifest = reference();
    (manifest.start as Record<string, unknown>).beat = 'le-i-missing';
    expect(pairs(validate(manifest))).toEqual(['unknown-card@start.beat']);
  });

  it('reports an endings[] entry absent from the bound content', () => {
    const manifest = reference();
    (manifest.endings as string[]).push('le-end-missing');
    expect(pairs(validate(manifest))).toEqual(['unknown-card@endings[4]']);
  });

  it('reports a beat route target naming a card absent from the bound content', () => {
    const manifest = reference();
    const to = (
      manifest.acts as Array<{
        scenes: Array<{ routes: Array<{ to: Record<string, unknown> }> }>;
      }>
    )[0].scenes[0].routes[1].to;
    to.beat = 'le-i-missing';
    expect(pairs(validate(manifest))).toEqual([
      'unknown-card@acts[0].scenes[0].routes[1].to.beat',
    ]);
  });

  it('stays silent when every reference resolves', () => {
    expect(validate(reference()).findings).toEqual([]);
  });
});

describe('unassigned-card', () => {
  it('reports a choice card of the episode storyline absent from the manifest', () => {
    // No manifest-only fixture: every assigned card is also a successor, so
    // dropping one from `beats`/`endings` cascades into a chaining rule. The
    // content override adds the orphan the manifest omits, which is the
    // reviewer's actual defect.
    const cards = [
      ...shippedCards(),
      syntheticCard({ id: 'le-i-orphan', options: 'Go|le-i-open', storylineId: 'long-erasure' }),
    ];
    expect(pairs(validate(reference(), cards))).toEqual(['unassigned-card@content.le-i-orphan']);
  });

  it('reports every orphaned choice card, naming each id', () => {
    const cards = [
      ...shippedCards(),
      syntheticCard({ id: 'le-i-orphan', options: 'Go|le-i-open', storylineId: 'long-erasure' }),
      syntheticCard({ id: 'le-ii-orphan', options: 'Go|le-ii-offer', storylineId: 'long-erasure' }),
    ];
    const result = validate(reference(), cards);
    expect(pairs(result)).toEqual([
      'unassigned-card@content.le-i-orphan',
      'unassigned-card@content.le-ii-orphan',
    ]);
    expect(result.findings[0].message).toContain('"le-i-orphan"');
    expect(result.findings[0].message).toContain('long-erasure');
  });

  it('ignores an orphan choice card belonging to another storyline', () => {
    const cards = [
      ...shippedCards(),
      syntheticCard({ id: 'other-orphan', options: 'Go|le-i-open', storylineId: 'other-arc' }),
    ];
    expect(validate(reference(), cards).findings).toEqual([]);
  });

  it('ignores a non-choice card of the episode storyline — only choices are content', () => {
    const cards = [
      ...shippedCards(),
      syntheticCard({ id: 'le-i-prose', options: '', storylineId: 'long-erasure' }),
    ];
    expect(validate(reference(), cards).findings).toEqual([]);
  });
});

describe('dangling-chain', () => {
  it('reports a chain-scene beat whose successor resolves to neither a beat nor an ending', () => {
    const [finding] = validate(readFixture('cards-dangling-chain.json')).findings;
    expect(finding.code).toBe('dangling-chain');
    expect(finding.path).toBe('acts[1].scenes[1].beats[0].cardId');
    expect(finding.message).toContain('"le-ii-offer"');
    expect(finding.message).toContain('le-end-abandon');
    expect(finding.message).toContain('acts[1].scenes[1].routes[0]');
  });

  it('reports a successor that no content card declares at all', () => {
    const cards = withOptions(shippedCards(), 'le-ii-offer', 'Only|le-ii-nowhere');
    expect(pairs(validate(reference(), cards))).toEqual([
      'dangling-chain@acts[1].scenes[1].beats[0].cardId',
    ]);
  });

  it('stays silent when the successor is an ending', () => {
    const cards = withOptions(shippedCards(), 'le-ii-offer', 'Leave|le-end-abandon');
    expect(validate(reference(), cards).findings).toEqual([]);
  });

  it('stays silent when the beat is terminal (no successors)', () => {
    const cards = withOptions(shippedCards(), 'le-ii-offer', '');
    expect(validate(reference(), cards).findings).toEqual([]);
  });

  it('stays silent for a scene with no chain route', () => {
    const manifest = readFixture('cards-dangling-chain.json');
    const routes = (
      manifest.acts as Array<{
        scenes: Array<{ routes: Array<{ to: Record<string, unknown> }> }>;
      }>
    )[1].scenes[1].routes;
    routes[0].to = { kind: 'beat', act: 'act-i', scene: 's-i-open' };
    expect(validate(manifest).findings).toEqual([]);
  });

  it('never throws on a content card whose options encoding is malformed', () => {
    const cards = withOptions(shippedCards(), 'le-ii-offer', 'not an encoding');
    expect(() => validate(reference(), cards)).not.toThrow();
    expect(pairs(validate(reference(), cards))).toEqual([]);
  });
});

describe('ending-successor', () => {
  it('reports an ending whose successor resolves to neither a beat nor another ending', () => {
    // The one-field content override: an ending that can no longer reach the
    // reset loop. Orphaning `le-i-open` through the manifest instead would also
    // report `unassigned-card`, which is why this family's failing input is a
    // content override rather than a manifest fixture.
    const original = shippedCards();
    const cards = withOptions(original, 'le-end-reset', 'Begin again|le-i-nowhere');
    const changed = cards.filter((card, index) => card.options !== original[index].options);
    expect(changed.map((card) => card.id)).toEqual(['le-end-reset']);
    const result = validate(reference(), cards);
    expect(pairs(result)).toEqual(['ending-successor@endings[0]']);
    expect(result.findings[0].message).toContain('"le-end-reset"');
    expect(result.findings[0].message).toContain('le-i-nowhere');
  });

  it('stays silent when the successor is an assigned beat (the reset loop)', () => {
    expect(validate(reference()).findings).toEqual([]);
  });

  it('stays silent when the successor is another ending', () => {
    const cards = withOptions(shippedCards(), 'le-end-reset', 'Rest quietly|le-end-quiet');
    expect(validate(reference(), cards).findings).toEqual([]);
  });

  it('stays silent for an ending with no successors', () => {
    const [ram, quiet, abandon] = ['le-end-ram', 'le-end-quiet', 'le-end-abandon'];
    const cards = shippedCards();
    for (const id of [ram, quiet, abandon]) {
      expect(cards.find((card) => card.id === id)?.options.trim()).toBe('');
    }
    expect(validate(reference()).findings).toEqual([]);
  });
});

describe('rule activation — the content binding is what turns the rules on', () => {
  it('reports only the manifest-only rules when no content is bound', () => {
    const result = validateEpisodeManifest(reference());
    expect([...result.rules]).toEqual([
      'duplicate-act',
      'duplicate-scene',
      'duplicate-beat',
      'unknown-act',
      'unknown-scene',
      'non-total-routes',
      'non-total-outcome-rules',
      'objective-invalid',
      'loss-not-irreversible',
      'numeric-invalid',
    ]);
    expect(result.findings).toEqual([]);
  });

  it('reports every card reference as unknown when an explicitly empty content list is bound', () => {
    const result = validateEpisodeManifest(reference(), []);
    expect([...result.rules]).toEqual([
      'duplicate-act',
      'duplicate-scene',
      'duplicate-beat',
      'unknown-act',
      'unknown-scene',
      'non-total-routes',
      'non-total-outcome-rules',
      'objective-invalid',
      'loss-not-irreversible',
      'numeric-invalid',
      ...CARD_RULES,
    ]);
    expect(new Set(result.findings.map((finding) => finding.code))).toEqual(
      new Set(['unknown-card']),
    );
    expect(result.findings.map((finding) => finding.path)).toEqual(
      expect.arrayContaining([
        'start.beat',
        'endings[0]',
        'acts[0].scenes[0].beats[0].cardId',
        'acts[0].scenes[0].routes[1].to.beat',
        'acts[2].scenes[0].routes[1].to.cardId',
      ]),
    );
    // 15 beats + start.beat + 4 endings + 1 ending route + 2 beat routes.
    expect(result.findings).toHaveLength(15 + 1 + 4 + 1 + 2);
  });
});

describe('totality — a malformed content binding never throws', () => {
  it('tolerates cards with the wrong member types', () => {
    const malformed = [
      { id: 5, options: null },
      { id: 'le-i-open', options: 7 },
      { id: 'le-i-open', options: '' },
      {},
    ] as unknown as ContentCard[];
    expect(() => validate(reference(), malformed)).not.toThrow();
  });

  it('tolerates a manifest with no endings and no acts while content is bound', () => {
    expect(() => validate({}, shippedCards())).not.toThrow();
  });
});

describe('determinism with a content binding', () => {
  it('produces byte-identical text and JSON reports across runs', () => {
    const first = validate(readFixture('cards-dangling-chain.json'));
    const second = validate(readFixture('cards-dangling-chain.json'));
    expect(formatEpisodeManifestReport(first)).toBe(formatEpisodeManifestReport(second));
    expect(episodeManifestValidationToJson(first)).toBe(episodeManifestValidationToJson(second));
  });
});

describe('the declared rule-code union', () => {
  it('still declares the four card codes in table order', () => {
    const declared = [...EPISODE_MANIFEST_ISSUE_CODES];
    expect(declared).toEqual(expect.arrayContaining([...CARD_RULES]));
    expect(declared.indexOf('unknown-card')).toBeLessThan(declared.indexOf('unassigned-card'));
    expect(declared.indexOf('unassigned-card')).toBeLessThan(declared.indexOf('dangling-chain'));
    expect(declared.indexOf('dangling-chain')).toBeLessThan(declared.indexOf('ending-successor'));
  });
});
