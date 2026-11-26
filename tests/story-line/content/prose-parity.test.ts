/**
 * Story-line prose **parity harness** (`CG-0MWO7CRT9001BLNL`).
 *
 * The prose slice promises "zero change for existing content": with an
 * adapter that maps **no** prose column, existing content must parse,
 * serialise, resolve and journal exactly as it does today. This suite is that
 * promise made machine-checkable, and unlike the contract's red cases it is
 * green today and must **stay** green through every sibling item.
 *
 * Two frozen baselines pin "today":
 *
 * - `prose/parity-gym-baseline.csv` — a byte-for-byte copy of
 *   `example-games/gym/content/storylines.csv` taken before the slice began.
 *   The shipped file is deliberately edited later (the Gym demo authors
 *   `context`, sibling `CG-0MWO7CW99007F8JW`), so the baseline is the frozen
 *   reference, not the live file.
 * - `prose/parity-main-street-baseline.csv` — story-line rows in Main Street's
 *   card-data shape, mapped by the same adapter shape Main Street uses
 *   (`id`, `name`, `effect`, `options`, `storylineId`, `storylineTitle`, no
 *   prose columns, no `resources` column).
 *
 * Assertions deliberately check **today's** keys and values individually
 * rather than deep-equalling a whole object: the slice adds optional fields,
 * and an absent optional field (`null` / `undefined`) is not a behaviour
 * change. Any change to a pre-existing value is a parity failure.
 *
 * @module tests/story-line/content/prose-parity
 */
import { describe, expect, it } from 'vitest';

import { GYM_CONTENT_ADAPTER } from '../../../src/story-line/content/adapters';
import {
  cardsFromCsv,
  compileContentOptions,
  parseCsv,
  serialiseCsv,
} from '../../../src/story-line/content/csv';
import type {
  ContentAdapter,
  ContentCard,
} from '../../../src/story-line/content/types';
import { resolveStorylineOption } from '../../../src/story-line/resolve';
import { buildJournal } from '../../../src/story-line/journal';
import {
  createDefaultStorylineUiAdapter,
  defaultStoryUpdateLine,
} from '../../../src/story-line/ui-adapter';
import type {
  StorylineCard,
  StorylineLogEntry,
  StorylineOption,
  StorylineResolution,
} from '../../../src/story-line/types';
import { addTemplate, makeAdapter, makeCard, makeState } from '../helpers';
import { readProseFixture } from './test-support';

/** A content card carrying the (optional) prose fields the slice adds. */
interface ProseCard extends ContentCard {
  readonly context?: string | null;
  readonly epilogue?: string | null;
}

/** A resolution result carrying the (optional) authored prose. */
interface ProseResolution extends StorylineResolution {
  readonly outcomeProse?: string | null;
}

/**
 * The Main Street card-data projection: the story-line columns only.
 *
 * Main Street's own adapter (`tce-main-street`) maps exactly these names and
 * declares no `resources` column, so the engine's default `coins` /
 * `reputation` projection applies. Mirrored here so the parity fixture is
 * driven through the same seam without a cross-repo import.
 */
const MAIN_STREET_SHAPED_ADAPTER: ContentAdapter = {
  gameId: 'main-street-shaped-fixture',
  columns: [
    'family',
    'id',
    'name',
    'effect',
    'options',
    'storylineId',
    'storylineTitle',
    'coinDelta',
    'reputationDelta',
    'trigger',
  ],
  fields: {
    id: 'id',
    name: 'name',
    effect: 'effect',
    options: 'options',
    storylineId: 'storylineId',
    storylineTitle: 'storylineTitle',
  },
};

/** Narrows a content card to the prose-aware shape. */
function asProse(card: ContentCard): ProseCard {
  return card as ProseCard;
}

/** The pre-existing (today's) values of a content card, key for key. */
function legacyCardValues(card: ContentCard): Record<string, unknown> {
  return {
    id: card.id,
    name: card.name,
    effect: card.effect,
    options: card.options,
    storylineId: card.storylineId,
    storylineTitle: card.storylineTitle,
    resourceKeys: [...card.resourceKeys],
    fields: { ...card.fields },
  };
}

/** The authored prose on a compiled option, or `null` when none is authored. */
function saysOf(option: StorylineOption<unknown>): string | null {
  return (option as { says?: string | null }).says ?? null;
}

/** The Gym demo baseline, parsed once through the shipped Gym adapter. */
const GYM_BASELINE_TEXT = readProseFixture('parity-gym-baseline.csv');
const GYM_BASELINE_CARDS = cardsFromCsv(
  parseCsv(GYM_BASELINE_TEXT),
  GYM_CONTENT_ADAPTER,
);

// ── Gym demo baseline ───────────────────────────────────────────────

describe('parity — Gym demo content with no prose mapping', () => {
  it('serialises byte-identically (the CSV layer never rewrites prose bytes)', () => {
    expect(serialiseCsv(parseCsv(GYM_BASELINE_TEXT))).toBe(GYM_BASELINE_TEXT);
  });

  it('projects today’s card shape unchanged', () => {
    expect(legacyCardValues(GYM_BASELINE_CARDS[0]!)).toEqual({
      id: 'gym-story-start',
      name: 'Town Meeting',
      effect: 'Lose 50 coins',
      options:
        'Invest|gym-story-invest#cost=coins:5#extra=reputation:+2#when=coins>=100>gym-story-end;Ignore|gym-story-ignore',
      storylineId: 'gym-story',
      storylineTitle: 'Gym Storyline',
      resourceKeys: ['coins', 'reputation'],
      fields: {
        trigger: 'Incident',
        cost: '0',
        coinDelta: '-50',
        reputationDelta: '0',
      },
    });
    expect(GYM_BASELINE_CARDS).toHaveLength(4);
  });

  it('reports no prose for content that authors none', () => {
    for (const card of GYM_BASELINE_CARDS) {
      expect(asProse(card).context ?? null).toBeNull();
      expect(asProse(card).epilogue ?? null).toBeNull();
    }
  });

  it('compiles today’s options unchanged', () => {
    expect(compileContentOptions(GYM_BASELINE_CARDS[0]!)).toEqual([
      {
        label: 'Invest',
        successorIds: ['gym-story-invest'],
        effectPolicy: 'apply',
        cost: { coins: 5 },
        extraEffect: { reputation: 2 },
        conditionalSuccessors: [
          {
            when: { field: 'coins', op: '>=', value: 100 },
            successorId: 'gym-story-end',
          },
        ],
      },
      {
        label: 'Ignore',
        successorIds: ['gym-story-ignore'],
        effectPolicy: 'apply',
      },
    ]);
    expect(compileContentOptions(GYM_BASELINE_CARDS[3]!)).toEqual([]);
  });

  it('never invents authored prose on a compiled option', () => {
    for (const card of GYM_BASELINE_CARDS) {
      for (const option of compileContentOptions(card)) {
        expect(saysOf(option)).toBeNull();
      }
    }
  });
});

// ── Main Street-shaped baseline ─────────────────────────────────────

describe('parity — Main Street-shaped content with no prose mapping', () => {
  const text = readProseFixture('parity-main-street-baseline.csv');
  const cards = cardsFromCsv(parseCsv(text), MAIN_STREET_SHAPED_ADAPTER);

  it('serialises byte-identically', () => {
    expect(serialiseCsv(parseCsv(text))).toBe(text);
  });

  it('projects today’s card shape unchanged', () => {
    expect(legacyCardValues(cards[0]!)).toEqual({
      id: 'evt-tax',
      name: 'Tax Audit',
      effect: 'Lose 45% of your banked coins.',
      options: 'Accept|;Reject|evt-tax-inquiry',
      storylineId: 'storyline-tax',
      storylineTitle: 'Tax Troubles',
      resourceKeys: [],
      fields: {
        family: 'event',
        coinDelta: '-300',
        reputationDelta: '0',
        trigger: 'Incident',
      },
    });
  });

  it('compiles today’s terminal-option shape unchanged', () => {
    expect(compileContentOptions(cards[0]!)).toEqual([
      { label: 'Accept', successorIds: [], effectPolicy: 'apply' },
      {
        label: 'Reject',
        successorIds: ['evt-tax-inquiry'],
        effectPolicy: 'apply',
      },
    ]);
  });
});

// ── Resolution and journal parity (no prose ⇒ today's text) ─────────

describe('parity — resolution and journal text without authored prose', () => {
  /** A no-prose card in the Gym demo's shape. */
  const card: StorylineCard = {
    id: 'gym-story-start',
    name: 'Town Meeting',
    effect: 'Lose 50 coins',
    storylineId: 'gym-story',
    storylineTitle: 'Gym Storyline',
  };

  /** A state + engine double whose template catalogue holds the successor. */
  function makeEngine(): {
    state: ReturnType<typeof makeState>;
    adapter: ReturnType<typeof makeAdapter>;
  } {
    const templates = new Map<string, ReturnType<typeof makeCard>>();
    addTemplate(templates, makeCard({ id: 'gym-story-end', name: 'Ending' }));
    return { state: makeState(), adapter: makeAdapter(templates) };
  }

  it('resolves a no-prose option to today’s result fields', () => {
    const { state, adapter } = makeEngine();
    const [option] = compileContentOptions(GYM_BASELINE_CARDS[0]!);
    const result = resolveStorylineOption(
      state,
      adapter,
      card,
      option!,
    ) as ProseResolution;

    expect(result.coinChange).toBe(-5);
    expect(result.repChange).toBe(2);
    expect(result.pushedCard?.id).toBe('gym-story-end-0');
    expect(result.outcomeProse ?? null).toBeNull();
  });

  it('writes today’s story-update line when no prose is authored', () => {
    expect(defaultStoryUpdateLine(card, 'Invest', 0, 2)).toBe(
      'Story update — Gym Storyline: you chose "Invest" (+2 rep).',
    );
    expect(defaultStoryUpdateLine(card, 'Accept', -200, 0)).toBe(
      'Story update — Gym Storyline: you accepted the consequence (-200 coins).',
    );
    expect(
      createDefaultStorylineUiAdapter().storyUpdateLine(card, 'Reject', 0, 0),
    ).toBe(
      'Story update — Gym Storyline: you refused the consequence; the thread continues.',
    );
  });

  it('builds today’s journal row from today-shaped log lines', () => {
    const { state, adapter } = makeEngine();
    const line = 'Story update — Gym Storyline: you chose "Invest" (+2 rep).';
    state.activityLog = [{ turn: 4, text: line } satisfies StorylineLogEntry];

    expect(buildJournal(state, adapter)[0]).toMatchObject({
      turn: 4,
      storyline: 'Gym Storyline',
      outcome: 'you chose "Invest" (+2 rep).',
      text: line,
    });
  });
});
