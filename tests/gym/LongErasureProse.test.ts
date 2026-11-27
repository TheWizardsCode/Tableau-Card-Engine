/**
 * The Long Erasure: authored prose and the frozen mechanics
 * (CG-0MWO7CX0V000PR5K).
 *
 * The content rewrite fills the three prose surfaces the sibling items added:
 * a `context` paragraph on every beat, a `#says=` outcome on every option and
 * an `epilogue` on every ending. This suite pins the *authoring contract* the
 * rewrite promised, all of it through the public content API:
 *
 * - every beat narrates where the crew are, what changed and what is at stake
 *   (`context`, 2–4 sentences, inside the adopted budget);
 * - every option narrates its own consequence (`#says`, 1–2 sentences, one
 *   prose segment so it never reads as a parallel list);
 * - the first beat introduces the Ashlight, the Unwriting, the Revision Loom
 *   and Archivist Vane in the fiction;
 * - every ending carries a distinct `epilogue`, so no two endings close on
 *   the same words;
 * - **mechanics are frozen**: the compiled successor graph, option
 *   costs/extras and `#when` conditions are identical to the pre-rewrite
 *   baseline in `tests/fixtures/story-line/prose/long-erasure-mechanics-
 *   baseline.json` (captured from `dev` before a word of prose was written);
 * - the CSV escaping policy holds over the real file: parse → serialise is
 *   byte-identical and the rewriting introduced no backslash outside a
 *   `#says` value.
 *
 * The structural / IP guards live in `LongErasureContent.test.ts`; this suite
 * is the prose contract, so a later content edit that improves the story
 * without breaking the contract still passes.
 *
 * @module tests/gym/LongErasureProse
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  LONG_ERASURE_CONTENT_ADAPTER,
  LONG_ERASURE_CONTENT_PATH,
} from '../../src/story-line/content/adapters';
import {
  cardsFromCsv,
  compileContentOptions,
  escapeCsvField,
  parseCsv,
  serialiseCsv,
} from '../../src/story-line/content/csv';
import { buildStorylineManifestFromCsv } from '../../src/story-line/content/manifest';
import { PROSE_FIELD_SPECS } from '../../src/story-line/content/prose';
import type { ContentCard } from '../../src/story-line/content/types';
import type { StorylineOption } from '../../src/story-line/types';
import { longErasureContentFromCsv } from '../../example-games/gym/GymLongErasureGame';

/** Repository root, resolved from this file rather than `process.cwd()`. */
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** The authored content file (the same one the game and the toolchain read). */
const CONTENT_PATH = LONG_ERASURE_CONTENT_PATH;

/** The pre-rewrite mechanics baseline captured before any prose was authored. */
const BASELINE_PATH =
  'tests/fixtures/story-line/prose/long-erasure-mechanics-baseline.json';

/** The committed episode manifest: the authoritative act/pacing beat sheet. */
const EPISODE_MANIFEST_PATH = 'example-games/gym/content/long-erasure-episode.json';

/** Reads a repository-relative UTF-8 file. */
function readRepoFile(relativePath: string): string {
  return readFileSync(join(REPO_ROOT, relativePath), 'utf-8');
}

/** The adopted prose budget for a field, from one source of truth. */
function budgetOf(field: 'context' | 'epilogue'): number {
  const spec = PROSE_FIELD_SPECS.find((entry) => entry.field === field);
  if (spec === undefined) throw new Error(`no prose budget declared for "${field}"`);
  return spec.budget;
}

/** Counts the sentences of a prose paragraph (a run of `.`, `!` or `?` ends one). */
function sentenceCount(text: string): number {
  const trimmed = text.trim();
  if (trimmed === '') return 0;
  return trimmed.split(/(?<=[.!?])\s+/).filter((sentence) => sentence.trim() !== '')
    .length;
}

const CSV_TEXT = readRepoFile(CONTENT_PATH);
const CARDS: readonly ContentCard[] = cardsFromCsv(
  parseCsv(CSV_TEXT),
  LONG_ERASURE_CONTENT_ADAPTER,
);
const CARD_BY_ID = new Map(CARDS.map((card) => [card.id, card]));
const ENTRY_ID = 'le-i-open';

/**
 * The content loaded through the run module, which resolves each card's act
 * and clock cost from the episode manifest (the retired CSV columns are gone).
 */
const LOADED = longErasureContentFromCsv(CSV_TEXT, {
  episode: JSON.parse(readRepoFile(EPISODE_MANIFEST_PATH)) as {
    acts: {
      order: number;
      scenes: { beats: { cardId: string; clockCost: number }[] }[];
    }[];
    endings: string[];
  },
});
const LOADED_BY_ID = new Map(LOADED.cards.map((card) => [card.id, card]));

/** The compiled options of every card, keyed by card id. */
const OPTIONS_BY_CARD = new Map<string, StorylineOption<unknown>[]>(
  CARDS.map((card) => [card.id, compileContentOptions(card)]),
);

/** The cards the content declares as endings, via the episode manifest. */
const ENDING_CARDS = LOADED.cards.filter((card) => card.act === 'Ending');

interface BaselineOption {
  readonly label: string;
  readonly successorIds: readonly string[];
  readonly cost?: Readonly<Record<string, number>>;
  readonly extraEffect?: Readonly<Record<string, number>>;
  readonly conditionalSuccessors?: readonly {
    readonly when: { readonly field: string; readonly op: string; readonly value: number };
    readonly successorId: string | null;
  }[];
}

interface BaselineCard {
  readonly id: string;
  readonly storylineId: string | null;
  readonly act: string;
  readonly clockCost: number;
  readonly resourceKeys: readonly string[];
  readonly options: readonly BaselineOption[];
}

interface Baseline {
  readonly cards: readonly BaselineCard[];
  readonly edges: readonly {
    readonly from: string;
    readonly to: string | null;
    readonly choice: string | null;
    readonly cycle: boolean;
  }[];
  readonly cycles: readonly (readonly string[])[];
}

const BASELINE: Baseline = JSON.parse(readRepoFile(BASELINE_PATH)) as Baseline;

/** The mechanics a card contributes, in the shape the baseline stores. */
function mechanicsOf(card: ContentCard): BaselineCard {
  const loaded = LOADED_BY_ID.get(card.id);
  if (loaded === undefined) throw new Error(`card "${card.id}" was not loaded`);
  return {
    id: card.id,
    storylineId: card.storylineId,
    act: loaded.act,
    clockCost: loaded.clockCost,
    resourceKeys: [...card.resourceKeys],
    options: (OPTIONS_BY_CARD.get(card.id) ?? []).map((option) => ({
      label: option.label,
      successorIds: [...(option.successorIds ?? [])],
      ...(option.cost === undefined
        ? {}
        : { cost: { ...option.cost } as Record<string, number> }),
      ...(option.extraEffect === undefined
        ? {}
        : { extraEffect: { ...option.extraEffect } as Record<string, number> }),
      ...(option.conditionalSuccessors === undefined
        ? {}
        : {
            conditionalSuccessors: option.conditionalSuccessors.map((rule) => ({
              when: {
                field: rule.when.field,
                op: rule.when.op,
                value: rule.when.value,
              },
              successorId: rule.successorId,
            })),
          }),
    })),
  };
}

/** Sorts manifest edges so set comparison never depends on emission order. */
function sortEdges(
  edges: readonly { from: string; to: string | null }[],
): { from: string; to: string | null }[] {
  return [...edges]
    .map((edge) => ({ from: edge.from, to: edge.to }))
    .sort((a, b) =>
      `${a.from}->${a.to ?? ''}`.localeCompare(`${b.from}->${b.to ?? ''}`),
    );
}

describe('The Long Erasure prose: beat context', () => {
  it('authors a context paragraph on every card', () => {
    for (const card of CARDS) {
      expect(card.context, `card "${card.id}" authors no context`).toBeTypeOf(
        'string',
      );
      expect(
        (card.context ?? '').trim().length,
        `card "${card.id}" context is blank`,
      ).toBeGreaterThan(0);
    }
  });

  it('keeps every context inside the adopted budget and at story-beat length', () => {
    const budget = budgetOf('context');
    for (const card of CARDS) {
      const context = (card.context ?? '').trim();
      expect(
        context.length,
        `card "${card.id}" context is ${context.length} chars (budget ${budget})`,
      ).toBeLessThanOrEqual(budget);

      const sentences = sentenceCount(context);
      expect(
        sentences,
        `card "${card.id}" context has ${sentences} sentences`,
      ).toBeGreaterThanOrEqual(2);
      expect(
        sentences,
        `card "${card.id}" context has ${sentences} sentences`,
      ).toBeLessThanOrEqual(4);
    }
  });

  it('introduces the Ashlight, the Unwriting, the Revision Loom and Vane on beat 1', () => {
    const entry = CARD_BY_ID.get(ENTRY_ID);
    expect(entry, `entry card "${ENTRY_ID}" is missing`).toBeDefined();
    const context = (entry?.context ?? '').trim();
    expect(context.length).toBeGreaterThan(0);

    for (const name of ['Ashlight', 'Unwriting', 'Revision Loom', 'Vane']) {
      expect(
        context,
        `beat 1 context never names "${name}" in the fiction`,
      ).toContain(name);
    }
  });

  it('gives every beat a distinct context (no reused situation)', () => {
    const contexts = CARDS.map((card) => (card.context ?? '').trim());
    expect(new Set(contexts).size).toBe(contexts.length);
  });
});

describe('The Long Erasure prose: option outcomes', () => {
  it('authors a #says outcome on every option of every card', () => {
    for (const card of CARDS) {
      const options = OPTIONS_BY_CARD.get(card.id) ?? [];
      for (const option of options) {
        expect(
          option.says,
          `option "${card.id}" / "${option.label}" authors no #says`,
        ).toBeTypeOf('string');
        expect(
          (option.says ?? '').trim().length,
          `option "${card.id}" / "${option.label}" #says is blank`,
        ).toBeGreaterThan(0);
      }
    }
  });

  it('keeps every outcome to one short consequence and one prose segment', () => {
    for (const card of CARDS) {
      for (const option of OPTIONS_BY_CARD.get(card.id) ?? []) {
        const says = (option.says ?? '').trim();
        const where = `option "${card.id}" / "${option.label}"`;

        // AC 1: 1–2 sentences, ≤ 200 chars.
        expect(says.length, `${where} #says is ${says.length} chars`).toBeLessThanOrEqual(
          200,
        );
        const sentences = sentenceCount(says);
        expect(sentences, `${where} #says has ${sentences} sentences`).toBeGreaterThanOrEqual(1);
        expect(sentences, `${where} #says has ${sentences} sentences`).toBeLessThanOrEqual(2);

        // A `;` delimits options, so a parallel list in prose is a content bug.
        expect(says, `${where} #says reads as a list, not a consequence`).not.toContain(
          ';',
        );
        // The rewrite needs no escape: no reserved delimiter is literalled in.
        expect(says, `${where} #says contains a raw "#"`).not.toContain('#');
        expect(says, `${where} #says contains a backslash`).not.toContain('\\');
      }
    }
  });

  it('attaches each outcome to its own option (order-independent prose)', () => {
    // Prose belongs to the option that produced it: the first option's
    // consequence is its own, and no two options share one sentence.
    for (const card of CARDS) {
      const says = (OPTIONS_BY_CARD.get(card.id) ?? []).map((option) =>
        (option.says ?? '').trim(),
      );
      expect(new Set(says).size, `card "${card.id}" reuses an option outcome`).toBe(
        says.length,
      );
    }
  });
});

describe('The Long Erasure prose: ending epilogues', () => {
  it('authors an epilogue on every ending card', () => {
    expect(ENDING_CARDS.length).toBeGreaterThan(0);
    for (const card of ENDING_CARDS) {
      expect(card.epilogue, `ending "${card.id}" authors no epilogue`).toBeTypeOf(
        'string',
      );
      expect(
        (card.epilogue ?? '').trim().length,
        `ending "${card.id}" epilogue is blank`,
      ).toBeGreaterThan(0);
    }
  });

  it('keeps every epilogue inside the adopted budget', () => {
    const budget = budgetOf('epilogue');
    for (const card of ENDING_CARDS) {
      const epilogue = (card.epilogue ?? '').trim();
      expect(
        epilogue.length,
        `ending "${card.id}" epilogue is ${epilogue.length} chars (budget ${budget})`,
      ).toBeLessThanOrEqual(budget);
    }
  });

  it('never reuses another ending’s closing prose', () => {
    const epilogues = ENDING_CARDS.map((card) => (card.epilogue ?? '').trim());
    expect(new Set(epilogues).size).toBe(epilogues.length);
    for (const epilogue of epilogues) {
      // A closing paragraph, not a beat: at least two sentences.
      expect(sentenceCount(epilogue)).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('The Long Erasure prose: mechanics frozen', () => {
  it('captured the baseline from the pre-rewrite content', () => {
    // Guard the guard: the fixture must describe this content set, or the
    // comparison below would "pass" for the wrong reason.
    expect(BASELINE.cards.map((card) => card.id)).toEqual(CARDS.map((card) => card.id));
    expect(BASELINE.cards.length).toBe(19);
  });

  it('keeps every card’s compiled mechanics identical to the baseline', () => {
    for (const card of CARDS) {
      const baseline = BASELINE.cards.find((entry) => entry.id === card.id);
      expect(baseline, `card "${card.id}" is absent from the baseline`).toBeDefined();
      expect(mechanicsOf(card), `card "${card.id}" mechanics changed`).toEqual(baseline);
    }
  });

  it('keeps the compiled successor graph and its single cycle identical', () => {
    const manifest = buildStorylineManifestFromCsv(
      CSV_TEXT,
      LONG_ERASURE_CONTENT_ADAPTER,
    );
    expect(sortEdges(manifest.edges)).toEqual(sortEdges(BASELINE.edges));

    const currentCycles = manifest.cycles.map((cycle) => [...cycle].sort());
    const baselineCycles = BASELINE.cycles.map((cycle) => [...cycle].sort());
    expect(currentCycles).toEqual(baselineCycles);
  });
});

describe('The Long Erasure prose: CSV escaping and round-trip', () => {
  it('round-trips the real file through parse → serialise byte-identically', () => {
    expect(serialiseCsv(parseCsv(CSV_TEXT))).toBe(CSV_TEXT);
  });

  it('needs no escape anywhere in the file (backslashes are says-only)', () => {
    // The decided policy: `\` is meaningful **only** inside a `#says` value.
    // The authored prose was written to need none at all, so a stray backslash
    // anywhere is either a typo or an escape that silently changes the prose.
    expect(CSV_TEXT).not.toContain('\\');
  });

  it('quotes each cell minimally (only a comma, quote or newline forces it)', () => {
    const parsed = parseCsv(CSV_TEXT);
    const lines = CSV_TEXT.replace(/\n$/, '').split('\n');
    const canonical = [parsed.header, ...parsed.rows].map((row) =>
      row.map(escapeCsvField).join(','),
    );
    expect(lines).toEqual(canonical);
  });
});
