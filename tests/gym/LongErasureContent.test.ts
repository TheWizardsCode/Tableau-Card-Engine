/**
 * Structural + IP guard for *The Long Erasure* story-line content
 * (CG-0MWNHZ8NM002ZJMI).
 *
 * The narrative module and the Gym scene are built **on top of** this content,
 * so the content's graph shape is pinned here, before any runtime consumer
 * exists: three acts in order, at least three real branch points with two
 * alternatives per act, one branch reachable only by accumulated resources, a
 * deliberately terminal "abandon the voyage" option and the reset/loop ending
 * expressed through the manifest `cycles` shape.
 *
 * Everything is asserted through the public content API
 * (`parseCsv` → `cardsFromCsv` → `compileContentOptions` /
 * `buildStorylineManifestFromCsv`), so the test fails on real observable
 * output rather than on a text search. The one exception is the IP guard,
 * which is a text scan by definition — it runs over the guarded set in
 * `configs/storyline-ip-scan.json` with a positive control, so a guard that
 * cannot fail is itself a failure.
 *
 * @module
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { isOptionAffordable } from '../../src/story-line/compile';
import {
  LONG_ERASURE_CONTENT_ADAPTER,
  LONG_ERASURE_CONTENT_PATH,
} from '../../src/story-line/content/adapters';
import { checkArtefacts } from '../../src/story-line/content/artefacts';
import {
  parseProhibitedTermList,
  scanProhibitedTerms,
  type ProhibitedTermList,
} from '../../src/story-line/content/ip-terms';
import {
  cardsFromCsv,
  compileContentOptions,
  contentCardHasChoice,
  optionSuccessorIds,
  parseCsv,
  serialiseCsv,
} from '../../src/story-line/content/csv';
import { buildStorylineManifestFromCsv } from '../../src/story-line/content/manifest';
import type { ContentCard } from '../../src/story-line/content/types';
import { validateContentCsv } from '../../src/story-line/content/validate';
import type { StorylineOption } from '../../src/story-line/types';
import {
  LongErasureError,
  longErasureContentFromCsv,
} from '../../example-games/gym/GymLongErasureGame';

/** Repository root, resolved from this file rather than `process.cwd()`. */
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** Repository-relative path of the authored content. */
const CONTENT_PATH = LONG_ERASURE_CONTENT_PATH;

/** Repository-relative paths of the committed generated artefacts. */
const MANIFEST_PATH = 'example-games/gym/content/long-erasure-manifest.json';
const MERMAID_PATH = 'example-games/gym/content/long-erasure-graph.mmd';

/** Repository-relative path of the authoritative episode manifest. */
const EPISODE_MANIFEST_PATH = 'example-games/gym/content/long-erasure-episode.json';

/** The resource set the content declares on every card. */
const RESOURCES = ['hull', 'morale', 'stores', 'goodwill', 'charge'] as const;

/** The act labels the content declares, in narrative order. */
const ACTS = ['I', 'II', 'III'] as const;

/** Entry card: the run's first beat, and the target of the reset edge. */
const ENTRY_ID = 'le-i-open';

/** The act-II card that offers the deliberate terminal abandon option. */
const ABANDON_SOURCE_ID = 'le-ii-offer';

/** The reset/loop ending card. */
const RESET_ENDING_ID = 'le-end-reset';

/** The gated card reachable only through the goodwill-gated option. */
const GATED_CARD_ID = 'le-ii-sabotage';

/** Reads a repository-relative UTF-8 file. */
function readRepoFile(relativePath: string): string {
  return readFileSync(join(REPO_ROOT, relativePath), 'utf-8');
}

const CSV_TEXT = readRepoFile(CONTENT_PATH);
const CARDS: readonly ContentCard[] = cardsFromCsv(
  parseCsv(CSV_TEXT),
  LONG_ERASURE_CONTENT_ADAPTER,
);
const CARD_BY_ID = new Map(CARDS.map((card) => [card.id, card]));
const MANIFEST = buildStorylineManifestFromCsv(
  CSV_TEXT,
  LONG_ERASURE_CONTENT_ADAPTER,
);

/** The compiled options of a card. */
function optionsOf(id: string): StorylineOption<unknown>[] {
  const card = CARD_BY_ID.get(id);
  if (card === undefined) throw new Error(`unknown authored card "${id}"`);
  return compileContentOptions(card);
}

/** The successor ids of a card's options, in declaration order. */
function successorsOf(id: string): string[] {
  return optionsOf(id).flatMap((option) =>
    optionSuccessorIds(option, LONG_ERASURE_CONTENT_ADAPTER),
  );
}

/** The card ids reachable from `start` over the authored choice graph. */
function reachableFrom(start: string): Set<string> {
  const reached = new Set<string>([start]);
  const queue = [start];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    for (const next of successorsOf(current)) {
      if (reached.has(next)) continue;
      reached.add(next);
      queue.push(next);
    }
  }
  return reached;
}

/** True when `target` is reachable from `start` (inclusive). */
function canReach(start: string, target: string): boolean {
  return reachableFrom(start).has(target);
}

/** The distinct successor cards of a card (empty for a terminal card). */
function distinctSuccessors(id: string): string[] {
  return [...new Set(successorsOf(id))];
}

/** True when a card offers at least two genuinely different successors. */
function isBranchPoint(card: ContentCard): boolean {
  return distinctSuccessors(card.id).length >= 2;
}

/** The act a card declares. */
function actOf(card: ContentCard): string {
  return (card.fields.act ?? '').trim();
}

/** Every authored card whose declared act is `act`. */
function cardsInAct(act: string): ContentCard[] {
  return CARDS.filter((card) => actOf(card) === act);
}

/** The options of the whole content set that target `target`. */
function optionsTargeting(
  target: string,
): { readonly card: ContentCard; readonly option: StorylineOption<unknown> }[] {
  const matches: {
    readonly card: ContentCard;
    readonly option: StorylineOption<unknown>;
  }[] = [];
  for (const card of CARDS) {
    for (const option of optionsOf(card.id)) {
      if (optionSuccessorIds(option, LONG_ERASURE_CONTENT_ADAPTER).includes(target)) {
        matches.push({ card, option });
      }
    }
  }
  return matches;
}

/** Builds a full resource bag from overrides over a generous baseline. */
function resourcesWith(overrides: Readonly<Record<string, number>>): Record<string, number> {
  const bag: Record<string, number> = {};
  for (const key of RESOURCES) bag[key] = 9;
  return { ...bag, ...overrides };
}

/** The compiled options of `id` a player holding `resources` can take. */
function availableOptions(
  id: string,
  resources: Readonly<Record<string, number>>,
): StorylineOption<unknown>[] {
  return optionsOf(id).filter((option) =>
    isOptionAffordable(option, resources, RESOURCES),
  );
}

describe('The Long Erasure: authored content shape', () => {
  it('is a separate, additive content file with its own storyline id', () => {
    expect(CONTENT_PATH).toBe('example-games/gym/content/long-erasure.csv');
    expect(parseCsv(CSV_TEXT).header).toEqual(LONG_ERASURE_CONTENT_ADAPTER.columns);
    expect(CARDS.length).toBeGreaterThan(0);
    for (const card of CARDS) {
      expect(card.storylineId).toBe('long-erasure');
      expect(card.storylineTitle).toBe('The Long Erasure');
    }
    expect(MANIFEST.gameId).toBe('long-erasure');
    expect(MANIFEST.storylineIds).toEqual(['long-erasure']);
  });

  it('declares the act of every card and a pressure-clock cost per beat', () => {
    for (const card of CARDS) {
      const act = actOf(card);
      expect(
        [...ACTS, 'Ending'] as readonly string[],
        `card "${card.id}" declares an unknown act`,
      ).toContain(act);

      const clockCost = Number((card.fields.clockCost ?? '').trim());
      expect(Number.isFinite(clockCost), `card "${card.id}" clockCost`).toBe(true);

      if (act === 'Ending') {
        expect(clockCost, `ending "${card.id}" must not cost clock`).toBe(0);
      } else {
        expect(clockCost, `beat "${card.id}" must cost clock`).toBeGreaterThan(0);
      }
    }

    // The clock escalates: act III beats cost at least as much as act I beats.
    const maxClock = (act: string): number =>
      Math.max(...cardsInAct(act).map((card) => Number(card.fields.clockCost)));
    expect(maxClock('III')).toBeGreaterThanOrEqual(maxClock('I'));
    expect(maxClock('II')).toBeGreaterThanOrEqual(maxClock('I'));
  });

  it('uses the declared arbitrary resource set and never the coins/reputation projection', () => {
    for (const card of CARDS) {
      expect(card.resourceKeys, `card "${card.id}" resources`).toEqual([...RESOURCES]);
    }
    expect(CSV_TEXT).not.toMatch(/\bcoins\b/i);
    expect(CSV_TEXT).not.toMatch(/\breputation\b/i);
    // Every declared resource is actually exercised by an authored attribute.
    for (const key of RESOURCES) {
      expect(CSV_TEXT, `resource "${key}" is never used`).toContain(`${key}:`);
    }
  });

  it('round-trips byte-identically through the CSV parser/serialiser', () => {
    expect(serialiseCsv(parseCsv(CSV_TEXT))).toBe(CSV_TEXT);
  });

  it('validates clean with exactly one intended cycle and no artefact drift', () => {
    const result = validateContentCsv(CSV_TEXT, LONG_ERASURE_CONTENT_ADAPTER);
    expect(result.issues).toEqual([]);
    expect(result.valid).toBe(true);
    expect(result.cardCount).toBe(CARDS.length);
    expect(result.findings.map((finding) => finding.kind)).toEqual(['cycle']);

    const drifts = checkArtefacts(
      MANIFEST,
      { json: MANIFEST_PATH, mermaid: MERMAID_PATH },
      REPO_ROOT,
    );
    expect(drifts).toEqual([]);
  });
});

describe('The Long Erasure: act structure and branching', () => {
  it('reaches every card from the entry card (no orphaned fragments)', () => {
    expect(CARDS[0].id).toBe(ENTRY_ID);
    const reached = reachableFrom(ENTRY_ID);
    const unreachable = CARDS.map((card) => card.id).filter((id) => !reached.has(id));
    expect(unreachable).toEqual([]);
  });

  it('lays the acts out in narrative order (Act I → II → III → ending)', () => {
    const rank = new Map<string, number>([['I', 0], ['II', 1], ['III', 2], ['Ending', 3]]);
    const violations: string[] = [];
    for (const card of CARDS) {
      for (const next of successorsOf(card.id)) {
        const from = rank.get(actOf(card)) as number;
        const to = rank.get(actOf(CARD_BY_ID.get(next) as ContentCard)) as number;
        // The only legal backward step is the reset ending looping to the entry.
        if (card.id === RESET_ENDING_ID && next === ENTRY_ID) continue;
        if (to < from) violations.push(`${card.id} (${actOf(card)}) -> ${next}`);
      }
    }
    expect(violations).toEqual([]);

    // Every act is entered from an earlier act, and every act is left for a
    // later one — the chain has no dead-end act.
    for (const act of ACTS) {
      const members = new Set(cardsInAct(act).map((card) => card.id));
      const entered = CARDS.some(
        (card) => !members.has(card.id) && successorsOf(card.id).some((id) => members.has(id)),
      );
      const left = [...members].some((id) =>
        successorsOf(id).some((next) => !members.has(next)),
      );
      expect(entered, `act ${act} is never entered`).toBe(true);
      expect(left, `act ${act} is never left`).toBe(true);
    }
  });

  it('offers at least three branch points and two alternatives in every act', () => {
    const branchPoints = CARDS.filter(isBranchPoint);
    expect(branchPoints.length).toBeGreaterThanOrEqual(3);

    for (const act of ACTS) {
      const inAct = cardsInAct(act).filter(isBranchPoint);
      expect(
        inAct.length,
        `act ${act} must offer at least two branching cards`,
      ).toBeGreaterThanOrEqual(2);
    }
  });

  it('never soft-locks a branch: every choice card offers a cost-free option', () => {
    for (const card of CARDS) {
      if (!contentCardHasChoice(card)) continue;
      const free = optionsOf(card.id).filter((option) => option.cost === undefined);
      expect(
        free.length,
        `choice card "${card.id}" has no cost-free option, so an empty player could stall`,
      ).toBeGreaterThan(0);
    }
  });

  it('keeps option costs positive and extra effects non-negative', () => {
    // The validator's authoring rule; asserted here so a future content edit
    // cannot rely on a negative "gain" to model a loss (costs model losses).
    for (const card of CARDS) {
      for (const option of optionsOf(card.id)) {
        for (const value of Object.values(option.cost ?? {})) {
          expect(value, `${card.id} / ${option.label} cost`).toBeGreaterThan(0);
        }
        for (const value of Object.values(option.extraEffect ?? {})) {
          expect(value, `${card.id} / ${option.label} extra`).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });
});

describe('The Long Erasure: state-gated branch', () => {
  const gated = optionsTargeting(GATED_CARD_ID);

  it('is reachable through exactly one option, gated on accumulated goodwill', () => {
    expect(gated).toHaveLength(1);
    const [{ card, option }] = gated;
    expect(card.id).toBe('le-ii-bargain');
    expect(option.label).toBe('Sabotage the Loom');
    expect(option.cost).toEqual({ goodwill: 3 });
    expect(card.resourceKeys).toContain('goodwill');
  });

  it('is absent below the threshold and present at or above it', () => {
    const labels = (resources: Record<string, number>): string[] =>
      availableOptions('le-ii-bargain', resources).map((option) => option.label);

    // Below threshold the gated option is filtered out; the free option remains.
    expect(labels(resourcesWith({ goodwill: 2 }))).toEqual(['Keep the bargain']);
    expect(labels(resourcesWith({ goodwill: 0 }))).toEqual(['Keep the bargain']);

    // At and above the threshold the branch opens.
    expect(labels(resourcesWith({ goodwill: 3 }))).toContain('Sabotage the Loom');
    expect(labels(resourcesWith({ goodwill: 6 }))).toContain('Sabotage the Loom');
  });

  it('accumulates enough goodwill on the authored paths to open the gate', () => {
    const upstreamGains = CARDS.filter((card) => canReach(card.id, 'le-ii-bargain'))
      .flatMap((card) => optionsOf(card.id))
      .reduce((total, option) => total + (option.extraEffect?.goodwill ?? 0), 0);
    expect(upstreamGains).toBeGreaterThanOrEqual(3);
  });
});

describe('The Long Erasure: terminal abandon option', () => {
  it('offers a deliberate "abandon the voyage" option ending at a terminal card', () => {
    const abandon = optionsOf(ABANDON_SOURCE_ID).filter((option) =>
      /abandon the voyage/i.test(option.label),
    );
    expect(abandon).toHaveLength(1);
    expect(optionSuccessorIds(abandon[0], LONG_ERASURE_CONTENT_ADAPTER)).toEqual([
      'le-end-abandon',
    ]);

    const ending = CARD_BY_ID.get('le-end-abandon') as ContentCard;
    expect(ending).toBeDefined();
    expect(contentCardHasChoice(ending)).toBe(false);
    expect(optionsOf(ending.id)).toEqual([]);
    // A terminal card is a dead end in the graph, not an implicit reset.
    expect(successorsOf(ending.id)).toEqual([]);
    expect(actOf(ending)).toBe('Ending');
  });

  it('is a real ending: only the reset ending links back into the chain', () => {
    const backEdges = CARDS.filter((card) => actOf(card) === 'Ending').flatMap((card) =>
      successorsOf(card.id).map((next) => ({ from: card.id, to: next })),
    );
    expect(backEdges).toEqual([{ from: RESET_ENDING_ID, to: ENTRY_ID }]);
  });
});

describe('The Long Erasure: reset/loop ending', () => {
  it('expresses the reset as exactly one cycle in the manifest', () => {
    expect(MANIFEST.cycles).toHaveLength(1);
    const [cycle] = MANIFEST.cycles;
    // The cycle threads the whole arc: entry, one act-II card and the act-III
    // core all participate, so the reset re-enters the story at its start.
    expect(cycle).toContain(ENTRY_ID);
    expect(cycle).toContain(RESET_ENDING_ID);
    expect(cycle).toContain('le-ii-offer');
    expect(cycle).toContain('le-iii-approach');
  });

  it('marks only the reset loop as cyclic and keeps every artefact edge consistent', () => {
    const cyclicEdges = MANIFEST.edges.filter((edge) => edge.cycle);
    expect(cyclicEdges.length).toBeGreaterThan(0);
    for (const edge of cyclicEdges) {
      expect(MANIFEST.cycles[0]).toContain(edge.from);
      expect(MANIFEST.cycles[0]).toContain(edge.to as string);
    }
    // The reset edge itself is present and flagged.
    expect(
      MANIFEST.edges.some(
        (edge) => edge.from === RESET_ENDING_ID && edge.to === ENTRY_ID && edge.cycle,
      ),
    ).toBe(true);
  });
});

describe('The Long Erasure: IP guard', () => {
  /** The guarded-set config: the same data `npm run storylines:ip-scan` reads. */
  const IP_CONFIG_PATH = 'configs/storyline-ip-scan.json';

  /** Reads the validated term list the config names. */
  function shippedTermList(): ProhibitedTermList {
    const config = JSON.parse(readRepoFile(IP_CONFIG_PATH)) as { terms?: string };
    const parsed = parseProhibitedTermList(
      JSON.parse(readRepoFile(config.terms ?? 'tests/fixtures/story-line/ip-prohibited-terms.json')),
    );
    if (!parsed.ok) throw new Error(`term list is invalid: ${parsed.errors.join('; ')}`);
    return parsed.list;
  }

  /** The repository-relative paths the gate covers. */
  function guardedTargets(): string[] {
    const config = JSON.parse(readRepoFile(IP_CONFIG_PATH)) as { targets: string[] };
    return config.targets;
  }

  it('detects a prohibited term (the guard can actually fail)', () => {
    const list = shippedTermList();
    expect(scanProhibitedTerms('The warped hull answered with phasers.', list)).toEqual(
      expect.arrayContaining([
        { term: 'warp', line: 1 },
        { term: 'phaser', line: 1 },
      ]),
    );
    expect(
      scanProhibitedTerms('The Archivist reweaves a drowned homeland.', list),
    ).toEqual([]);
  });

  it('keeps the framework allowance narrow: a narrative use is still caught', () => {
    const list = shippedTermList();
    expect(scanProhibitedTerms('A `Phaser`-free logic module.', list)).toEqual([]);
    expect(scanProhibitedTerms('The Phaser banks fired.', list)).toEqual([
      { term: 'phaser', line: 1 },
    ]);
  });

  it('guards the GDD, its examples and diagrams, and the authored content', () => {
    const targets = guardedTargets();
    expect(targets).toContain('docs/design/storyline-game-gdd.md');
    expect(targets).toContain(CONTENT_PATH);
    expect(targets).toContain(MANIFEST_PATH);
    expect(targets).toContain(MERMAID_PATH);
    for (const path of targets) {
      expect(existsSync(join(REPO_ROOT, path)), `${path} is configured but missing`).toBe(true);
    }
  });

  it('keeps the guarded set free of prohibited terms', () => {
    const list = shippedTermList();
    for (const path of guardedTargets()) {
      expect(scanProhibitedTerms(readRepoFile(path), list), `${path} contains prohibited IP`).toEqual(
        [],
      );
    }
  });
});

describe('Long Erasure content: resource bounds (GDD §2.8, G4)', () => {
  /** The committed episode manifest, read as plain data. */
  const episodeManifest = JSON.parse(readRepoFile(EPISODE_MANIFEST_PATH)) as {
    resources: { declared: string[]; bounds: Record<string, { min: number; max: number }> };
  };

  it('reads every declared key’s bounds from the committed manifest', () => {
    const content = longErasureContentFromCsv(CSV_TEXT, {
      bounds: episodeManifest.resources.bounds,
    });

    // The declared set and the bounded set are the same keys…
    expect([...content.resources]).toEqual([...episodeManifest.resources.declared]);
    // …and the ranges are the manifest's, never a hand-copied literal.
    expect(content.bounds).toEqual(episodeManifest.resources.bounds);
    expect(content.bounds.hull).toEqual({ min: 0, max: 5 });
    expect(content.bounds.charge).toEqual({ min: 0, max: 4 });
  });

  it('declares no bounds when the content is loaded without a manifest', () => {
    expect(longErasureContentFromCsv(CSV_TEXT).bounds).toEqual({});
  });

  it('fails closed when the supplied bounds do not cover the declared keys', () => {
    expect(() =>
      longErasureContentFromCsv(CSV_TEXT, { bounds: { hull: { min: 0, max: 5 } } }),
    ).toThrowError(LongErasureError);
    expect(() =>
      longErasureContentFromCsv(CSV_TEXT, { bounds: { hull: { min: 0, max: 5 } } }),
    ).toThrowError(/missing-bounds-entry: morale/);
  });

  it('fails closed on an inverted range rather than normalising it', () => {
    const inverted = {
      ...episodeManifest.resources.bounds,
      stores: { min: 6, max: 0 },
    };

    expect(() => longErasureContentFromCsv(CSV_TEXT, { bounds: inverted })).toThrowError(
      /bounds-inverted: stores/,
    );
  });

  it('ignores a bounds entry for a key the content does not declare', () => {
    const extra = {
      ...episodeManifest.resources.bounds,
      shields: { min: 0, max: 3 },
    };

    const content = longErasureContentFromCsv(CSV_TEXT, { bounds: extra });

    expect(content.resources).not.toContain('shields');
    expect('shields' in content.bounds).toBe(false);
  });
});
