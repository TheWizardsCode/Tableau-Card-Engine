/**
 * GDD §2.8 resource model and economy — contract tests.
 *
 * The GDD states a five-key resource model (`hull`, `morale`, `stores`,
 * `goodwill`, `charge`), one deliberate trade per act, and the rule that the
 * irreversible key is never restored. The model is only credible if the prose
 * and the authored content cannot drift apart, so this suite pins the working
 * fixture (`gdd-resource-trades.csv`) to the model it illustrates:
 *
 * - every row declares exactly the GDD's key set;
 * - the fixture validates through the command the GDD quotes for a writer;
 * - each act carries a real cost/gain trade, with the numbers the GDD prints;
 * - the irreversible key is never granted by any option;
 * - every authored cost is affordable from the starting bag plus the extra
 *   effects the fixture itself can supply;
 * - the state-gated branch is reachable **and** survivable (the spike's
 *   measured failure, absorbed as a checked invariant).
 *
 * @module
 */
import { describe, expect, it } from 'vitest';

import { LONG_ERASURE_CONTENT_ADAPTER } from '../../../src/story-line/content/adapters';
import {
  cardsFromCsv,
  compileContentOptions,
  parseCsv,
} from '../../../src/story-line/content/csv';
import {
  evaluateContentGuardCsv,
  type ContentGuardReport,
} from '../../../src/story-line/content/guard';
import { validateContentCsv } from '../../../src/story-line/content/validate';
import type { StorylineOption } from '../../../src/story-line/types';
import { runValidateStorylinesCli } from '../../../scripts/validate-storylines';
import { captureOutput, fixturePath, readFixture } from './test-support';

/** The GDD §2.8 declared resource set, in declaration order. */
const MODEL_KEYS = ['hull', 'morale', 'stores', 'goodwill', 'charge'] as const;

/** The GDD §2.8 starting bag (`resources.start` in the proposed manifest shape). */
const START_BAG: Readonly<Record<string, number>> = {
  hull: 5,
  morale: 5,
  stores: 4,
  goodwill: 0,
  charge: 2,
};

/** The one key the GDD marks irreversible (never granted, never restored). */
const IRREVERSIBLE_KEY = 'hull';

/** The fixture's ending cards, in authoring order. */
const ENDING_IDS = ['gxr-end-quiet', 'gxr-end-ram', 'gxr-end-reset'] as const;

/** Parses the working fixture through the Long Erasure adapter. */
function fixtureCards() {
  return cardsFromCsv(
    parseCsv(readFixture('gdd-resource-trades.csv')),
    LONG_ERASURE_CONTENT_ADAPTER,
  );
}

/** Compiles one card's authored options. */
function optionsOf(cardId: string): StorylineOption<unknown>[] {
  const card = fixtureCards().find((candidate) => candidate.id === cardId);
  if (card === undefined) throw new Error(`fixture card "${cardId}" not found`);
  return compileContentOptions(card);
}

/** Finds an option by label, failing loudly when the label drifts. */
function option(cardId: string, label: string): StorylineOption<unknown> {
  const found = optionsOf(cardId).find((candidate) => candidate.label === label);
  if (found === undefined) {
    throw new Error(`card "${cardId}" has no option "${label}"`);
  }
  return found;
}

/** Guards the fixture with the GDD's starting bag and its authored endings. */
function guardFixture(): ContentGuardReport {
  return evaluateContentGuardCsv(
    readFixture('gdd-resource-trades.csv'),
    LONG_ERASURE_CONTENT_ADAPTER,
    { initialResources: START_BAG, endings: ENDING_IDS },
  );
}

describe('GDD resource model — the declared set', () => {
  it('declares exactly the GDD key set on every row', () => {
    const cards = fixtureCards();
    expect(cards).toHaveLength(6);
    for (const card of cards) {
      expect([...card.resourceKeys]).toEqual([...MODEL_KEYS]);
    }
  });

  it('validates cleanly through storylines:validate', () => {
    const result = validateContentCsv(
      readFixture('gdd-resource-trades.csv'),
      LONG_ERASURE_CONTENT_ADAPTER,
    );
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.cardCount).toBe(6);
  });

  it('validates cleanly through the CLI form the GDD quotes for writers', () => {
    const { code, stdout } = captureOutput(() =>
      runValidateStorylinesCli([
        '--csv',
        fixturePath('gdd-resource-trades.csv'),
        '--game',
        'long-erasure',
      ]),
    );
    expect(code).toBe(0);
    expect(stdout).toContain('RESULT: VALID');
  });
});

describe('GDD resource model — one deliberate trade per act', () => {
  it('Act I trades the objective’s store for the record', () => {
    expect(option('gxr-i-record', 'Log the erasure')).toMatchObject({
      cost: { stores: 1 },
    });
    expect(option('gxr-i-record', 'Rally the crew')).toMatchObject({
      extraEffect: { morale: 1 },
    });
    // The cheaper alternative must not also spend the objective's key.
    expect(option('gxr-i-record', 'Rally the crew').cost).toBeUndefined();
  });

  it('Act II trades the irreversible hull for stores', () => {
    expect(option('gxr-ii-locker', 'Strip the locker')).toMatchObject({
      cost: { hull: 1 },
      extraEffect: { stores: 2 },
    });
    const sealed = option('gxr-ii-locker', 'Leave it sealed');
    expect(sealed.cost).toBeUndefined();
    expect(sealed.extraEffect).toBeUndefined();
  });

  it('Act III trades recoverable charge, irreversible hull and nothing', () => {
    expect(option('gxr-iii-core', 'Unwrite the Loom')).toMatchObject({
      cost: { charge: 2 },
    });
    expect(option('gxr-iii-core', 'Break for the core')).toMatchObject({
      conditionalSuccessors: [
        {
          when: { field: 'charge', op: '>=', value: 2 },
          successorId: 'gxr-end-ram',
        },
      ],
    });
    const reset = option('gxr-iii-core', 'Finish the weave');
    expect(reset.cost).toBeUndefined();
    expect(reset.extraEffect).toBeUndefined();
  });
});

describe('GDD resource model — the irreversible key', () => {
  it('is never granted by any authored option', () => {
    for (const card of fixtureCards()) {
      for (const option of compileContentOptions(card)) {
        expect(option.extraEffect?.[IRREVERSIBLE_KEY]).toBeUndefined();
      }
    }
  });

  it('is only ever spent, and never by more than the starting hull', () => {
    const spends: number[] = [];
    for (const card of fixtureCards()) {
      for (const option of compileContentOptions(card)) {
        const amount = option.cost?.[IRREVERSIBLE_KEY];
        if (amount !== undefined) spends.push(amount);
      }
    }
    expect(spends.length).toBeGreaterThan(0);
    for (const spend of spends) {
      expect(spend).toBeGreaterThan(0);
      expect(spend).toBeLessThanOrEqual(START_BAG[IRREVERSIBLE_KEY] as number);
    }
  });

  it('costs no key by more than its starting bag plus authored gains', () => {
    const supply: Record<string, number> = { ...START_BAG };
    for (const card of fixtureCards()) {
      for (const option of compileContentOptions(card)) {
        for (const [key, amount] of Object.entries(option.extraEffect ?? {})) {
          supply[key] = (supply[key] ?? 0) + Math.max(0, amount ?? 0);
        }
      }
    }
    for (const card of fixtureCards()) {
      for (const option of compileContentOptions(card)) {
        for (const [key, amount] of Object.entries(option.cost ?? {})) {
          if (amount === undefined) continue;
          expect(Object.keys(START_BAG)).toContain(key);
          expect(amount).toBeLessThanOrEqual(supply[key] as number);
        }
      }
    }
  });
});

describe('GDD resource model — gates are reachable and survivable', () => {
  it('passes the route-space guard with the GDD starting bag', () => {
    const report = guardFixture();
    expect(report.errors).toEqual([]);
    expect(report.violations).toEqual([]);
    expect(report.valid).toBe(true);
    expect([...report.resourceKeys]).toEqual([...MODEL_KEYS]);
    expect([...report.endingIds]).toEqual([...ENDING_IDS]);
  });

  it('proves the charge-gated branch reachable and survivable', () => {
    const report = guardFixture();
    const gated = report.gatedBranches.filter(
      (branch) => branch.cardId === 'gxr-iii-core',
    );
    expect(gated.length).toBeGreaterThan(0);
    expect(gated.every((branch) => branch.survivable)).toBe(true);
  });

  it('reaches every authored ending', () => {
    const report = guardFixture();
    expect(report.endings.map((ending) => ending.endingId)).toEqual([
      ...ENDING_IDS,
    ]);
    expect(report.endings.every((ending) => ending.reachable)).toBe(true);
  });
});
