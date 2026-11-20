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
 *   captured from `dev` before a word of demo prose was authored.
 * - **The scene catalogue mirrors the CSV.** `DEMO_CARDS` (what
 *   `GymStorylineScene` actually plays) carries the same authored prose as
 *   `example-games/gym/content/storylines.csv`, so the demo cannot drift from
 *   the content the toolchain validates and the manifest exposes.
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
import type { StorylineOption } from '../../src/story-line/types';
import { DEMO_CARDS } from '../../example-games/gym/GymStorylineDemo';

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

/** A card's mechanics projection, matching the committed baseline shape. */
function mechanicsOfCard(card: ContentCard): Record<string, unknown> {
  return {
    id: card.id,
    name: card.name,
    effect: card.effect,
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

describe('Gym storyline demo — scene catalogue mirrors the content', () => {
  it('carries the same card ids, context and authored outcomes as the CSV', () => {
    expect(DEMO_CARDS.map((card) => card.id)).toEqual(CARDS.map((card) => card.id));

    for (const demoCard of DEMO_CARDS) {
      const card = CARDS.find((candidate) => candidate.id === demoCard.id);
      expect(card, demoCard.id).toBeDefined();
      expect(demoCard.context ?? null, `${demoCard.id} context`).toBe(card?.context ?? null);

      const csvOptions = compileContentOptions(card!);
      const demoOptions = demoCard.options
        ? compileContentOptions({
            ...card!,
            options: demoCard.options,
          })
        : [];
      expect(
        demoOptions.map(saysOf),
        `${demoCard.id} option outcomes`,
      ).toEqual(csvOptions.map(saysOf));
      expect(
        demoOptions.map((option) => option.label),
        `${demoCard.id} option labels`,
      ).toEqual(csvOptions.map((option) => option.label));
    }
  });
});
