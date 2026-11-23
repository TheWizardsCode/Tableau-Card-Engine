/**
 * Gym storyline demo content: authored prose and frozen mechanics
 * (`CG-0MWO7CW99007F8JW`).
 *
 * The demo authors a `context` paragraph on every card and a `#says` outcome
 * on its first-beat options, so both prose surfaces are visible in the Gym
 * demo set alongside the Long Erasure. This suite pins the two things that
 * content edit must not be able to change silently:
 *
 * - **Mechanics are frozen.** The compiled successor graph, option
 *   costs/extras/conditions and the card coin/reputation deltas are identical
 *   to `tests/fixtures/story-line/prose/gym-storyline-mechanics-baseline.json`,
 *   captured from `dev` before a word of demo prose was authored. The
 *   author-editable prose columns (`name`, `effect`, `context`, `#says`) are
 *   deliberately **not** part of the baseline: an author edits them in the
 *   story-line editor and must not have to regenerate a fixture to do it.
 * - **The scene plays the CSV.** `GymStorylineScene` builds its catalogue with
 *   `demoCardsFromCsv` over this same file, so the demo cannot drift from the
 *   content the toolchain validates and the manifest exposes — the old
 *   hand-maintained `DEMO_CARDS` copy is gone.
 *
 * The prose-authoring contract itself (budgets, escaping, round-trip) is
 * covered by `tests/story-line/content/*`; this suite is the Gym demo's own
 * slice of it.
 *
 * @module tests/gym/GymStorylineContent
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  GYM_CONTENT_ADAPTER,
  DEFAULT_CONTENT_PATH,
} from '../../src/story-line/content/adapters';
import {
  cardsFromCsv,
  compileContentOptions,
  parseCsv,
  serialiseCsv,
} from '../../src/story-line/content/csv';
import { buildStorylineManifestFromCsv } from '../../src/story-line/content/manifest';
import { PROSE_FIELD_SPECS } from '../../src/story-line/content/prose';
import type { ContentCard } from '../../src/story-line/content/types';
import {
  compileStorylineFromEvent,
  createStorylineOptionRegistry,
} from '../../src/story-line/compile';
import type { StorylineOption } from '../../src/story-line/types';
import { demoCardsFromCsv } from '../../example-games/gym/GymStorylineDemo';

/** Repository root, resolved from this file rather than `process.cwd()`. */
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** The pre-edit mechanics baseline captured before any demo prose was authored. */
const BASELINE_PATH =
  'tests/fixtures/story-line/prose/gym-storyline-mechanics-baseline.json';

/** The demo's authored content, read from the same file the toolchain uses. */
const CONTENT_TEXT = readFileSync(join(REPO_ROOT, DEFAULT_CONTENT_PATH), 'utf-8');

/** The demo's content cards, projected through the shipped Gym adapter. */
const CARDS = cardsFromCsv(parseCsv(CONTENT_TEXT), GYM_CONTENT_ADAPTER);

/** The adopted `context` budget (from one source of truth). */
function contextBudget(): number {
  const spec = PROSE_FIELD_SPECS.find((entry) => entry.field === 'context');
  if (spec === undefined) throw new Error('no prose budget declared for "context"');
  return spec.budget;
}

/** A compiled option with the optional authored prose field. */
function saysOf(option: StorylineOption<unknown>): string | null {
  return option.says ?? null;
}

/** Strips authored prose so only mechanics remain comparable. */
function mechanicsOf(option: StorylineOption<unknown>): Record<string, unknown> {
  const { says: _says, ...mechanics } = option as unknown as Record<string, unknown>;
  return mechanics;
}

/**
 * A card's **mechanics** projection, matching the committed baseline shape.
 *
 * Deliberately excludes `name` and `effect`: both are author-editable prose
 * columns (the editor exposes them), so pinning them here would force a
 * fixture regeneration for every prose edit — the friction this suite exists
 * to remove.
 */
function mechanicsOfCard(card: ContentCard): Record<string, unknown> {
  return {
    id: card.id,
    coinDelta: card.fields.coinDelta ?? null,
    reputationDelta: card.fields.reputationDelta ?? null,
    options: compileContentOptions(card).map(mechanicsOf),
  };
}

describe('Gym storyline content — authored prose', () => {
  it('authors context on every card, inside the adopted budget', () => {
    for (const card of CARDS) {
      expect(card.context, card.id).not.toBeNull();
      expect(card.context?.trim().length ?? 0).toBeGreaterThan(0);
      expect((card.context ?? '').length, card.id).toBeLessThanOrEqual(contextBudget());
    }
  });

  it('authors at least one option outcome (`#says`)', () => {
    const withOutcome = CARDS.flatMap((card) =>
      compileContentOptions(card)
        .map(saysOf)
        .filter((says): says is string => says !== null),
    );
    expect(withOutcome.length).toBeGreaterThanOrEqual(1);
  });

  it('round-trips the authored file byte-identically', () => {
    expect(serialiseCsv(parseCsv(CONTENT_TEXT))).toBe(CONTENT_TEXT);
  });

  it('exposes the authored context on the committed manifest nodes', () => {
    const manifest = buildStorylineManifestFromCsv(CONTENT_TEXT, GYM_CONTENT_ADAPTER);
    for (const node of manifest.nodes) {
      const card = CARDS.find((candidate) => candidate.id === node.id);
      expect(card, node.id).toBeDefined();
      expect(node.context, node.id).toBe(card?.context);
    }
  });
});

describe('Gym storyline content — mechanics frozen against the baseline', () => {
  it('compiles to exactly the pre-edit mechanics baseline', () => {
    const baseline = JSON.parse(
      readFileSync(join(REPO_ROOT, BASELINE_PATH), 'utf-8'),
    ) as { cards: Record<string, unknown>[] };

    expect(CARDS.map(mechanicsOfCard)).toEqual(baseline.cards);
  });
});

describe('Gym storyline demo — the scene plays the authored CSV', () => {
  it('projects the authored content onto the demo catalogue, in row order', () => {
    const demoCards = demoCardsFromCsv(CONTENT_TEXT);

    expect(demoCards.map((card) => card.id)).toEqual(CARDS.map((card) => card.id));
    for (const [index, demoCard] of demoCards.entries()) {
      const card = CARDS[index];
      expect(demoCard, demoCard.id).toBeDefined();
      // Every projections surface comes from the row, not from a code fixture.
      expect(demoCard.name, demoCard.id).toBe(card.name);
      expect(demoCard.effect, demoCard.id).toBe(card.effect);
      expect(demoCard.context ?? null, `${demoCard.id} context`).toBe(
        card.context ?? null,
      );
      expect(demoCard.options ?? '', `${demoCard.id} options`).toBe(card.options);
      expect(demoCard.coinDelta, `${demoCard.id} coinDelta`).toBe(
        Number(card.fields.coinDelta ?? 0),
      );
      expect(demoCard.reputationDelta, `${demoCard.id} reputationDelta`).toBe(
        Number(card.fields.reputationDelta ?? 0),
      );
      // The beat's authored cost is projected too: it is charged on resolution,
      // so a content edit to the `cost` column reaches play.
      expect(demoCard.cost ?? 0, `${demoCard.id} cost`).toBe(
        Number(card.fields.cost ?? 0),
      );
    }
  });

  it('compiles the same option topology the runtime resolves', () => {
    const registry = createStorylineOptionRegistry<unknown>((id) =>
      id.replace(/-\d+$/, ''),
    );
    const demoCards = demoCardsFromCsv(CONTENT_TEXT);

    // The catalogue the scene draws compiles to exactly the options the
    // content model compiles (successors, costs, conditions, prose), so a
    // content edit reaches play rather than being re-encoded by hand.
    for (const [index, demoCard] of demoCards.entries()) {
      const compiled = compileStorylineFromEvent(demoCard, registry);
      const fromContent = compileContentOptions(CARDS[index]);
      expect(compiled.compiledOptions, demoCard.id).toEqual(
        fromContent as typeof compiled.compiledOptions,
      );
    }
  });
});
