/**
 * GymStorylineDemo — the Phaser-free pure logic behind `GymStorylineScene`.
 *
 * The scene is deliberately thin: everything that decides *what happens* when
 * a card is drawn or an option is chosen lives here, so the demo's branching
 * narrative can be unit-tested without booting Phaser or a browser:
 *
 * - {@link demoCardsFromCsv} — projects the **authored** content
 *   (`example-games/gym/content/storylines.csv`, the file
 *   `npm run storylines:editor` writes) onto the demo's card catalogue. The
 *   demo therefore plays the content an author edits: there is no second,
 *   hand-maintained catalogue to keep in step, and every authored option
 *   attribute (`#cost`, `#extra`, `#when`, `#says`) reaches play.
 * - {@link demoCardCost} — the beat's authored `cost` column, charged as a
 *   real payment when the card resolves (settled with the card's own effect,
 *   so the demo's `Public Investment` branch nets +20 coins rather than
 *   reading as a free reward).
 * - {@link createDemoState} — the initial demo state (coins, reputation,
 *   turn, seeded rng, activity log, chain deck).
 * - {@link createDemoEngine} — the {@link StorylineEngineAdapter} mapping the
 *   generic story-line seams (rng draw, effect application, resource reads,
 *   activity log, template lookup, chain-card sink) onto that state.
 * - {@link startDemo} / {@link drawDemoCard} / {@link applyDemoChoice} — the
 *   three pure transitions the scene renders. Each returns plain data
 *   (compiled/available options, resource deltas, the pushed successor) and
 *   leaves all presentation to the caller.
 *
 * Nothing in this module imports `phaser` or any game beyond the generic
 * `@story-line` contract, which is what makes it directly testable — see
 * `core/tests/gym/GymStorylineDemo.test.ts`.
 *
 * The CSV text is a **parameter**, never an import: the scene supplies it with
 * Vite's `?raw` suffix (mirroring `GymLongErasureScene`), while the Node unit
 * tests read the same file with `node:fs`. That keeps this module free of both
 * Phaser and the bundler.
 *
 * @module example-games/gym/GymStorylineDemo
 */

import {
  createResourceProjection,
  createStorylineSystem,
  type PendingStorylineChoice,
  type StorylineCard,
  type StorylineEngineAdapter,
  type StorylineLogEntry,
  type StorylineOption,
  type StorylineSystem,
} from '@story-line';
import { GYM_CONTENT_ADAPTER } from '../../src/story-line/content/adapters';
import { cardsFromCsv, parseCsv } from '../../src/story-line/content/csv';
import type { ContentCard } from '../../src/story-line/content/types';

/** The demo's minimal game state. */
export interface DemoState {
  coins: number;
  reputation: number;
  turn: number;
  rngSeed: number;
  activityLog: StorylineLogEntry[];
  deck: StorylineCard[];
}

/** Identifier of the demo's first (drawn) card. */
export const DEMO_START_CARD_ID = 'gym-story-start';

/** Deterministic LCG seed used by {@link createDemoState}. */
export const DEMO_RNG_SEED = 0x5eed;

/**
 * A demo card template.
 *
 * `context` is the beat's authored situation paragraph, projected from the CSV
 * `context` column (`example-games/gym/content/storylines.csv`). It is
 * optional, exactly like the content model's prose field: a card without one
 * renders no context block. `#says` outcome prose rides on the card's
 * `options` encoding and compiles onto {@link StorylineOption.says}.
 */
export interface DemoCard extends StorylineCard {
  /** The beat's situation paragraph, or `null`/absent when none is authored. */
  readonly context?: string | null;
  /**
   * The beat's authored `cost` (the content file's `cost` column), in coins.
   *
   * A beat's cost is a **real payment**, not a display label: it settles
   * together with the card's own effect when the card resolves (see
   * {@link demoCardCost}), so `Public Investment` ("Gain 120 coins", `cost`
   * 100) is a trade of 100 coins for 120 rather than a free reward.
   */
  readonly cost?: number;
}

/**
 * The demo's card catalogue, projected from the authored content CSV.
 *
 * This replaces the hand-maintained `DEMO_CARDS` literal the demo used to
 * ship: the CSV is the single source of truth, so a content edit made in
 * `npm run storylines:editor` (rename, effect, `context` prose, option
 * mechanics) reaches the scene without a TypeScript change.
 *
 * @param csvText Raw `storylines.csv` text (a `?raw` import in the scene, a
 *   `readFileSync` in the Node tests).
 * @returns The demo catalogue in CSV row order.
 */
export function demoCardsFromCsv(csvText: string): DemoCard[] {
  return cardsFromCsv(parseCsv(csvText), GYM_CONTENT_ADAPTER).map(demoCardFromContent);
}

/**
 * Projects one content row onto the demo's card shape.
 *
 * The game's own columns are ordinary CSV columns the generic adapter leaves
 * in {@link ContentCard.fields}; the demo reads its two resource deltas and
 * the beat's `cost` from there. A non-numeric or blank cell reads as `0`, so a
 * card always carries a concrete amount.
 */
function demoCardFromContent(card: ContentCard): DemoCard {
  return {
    id: card.id,
    name: card.name,
    effect: card.effect,
    options: card.options,
    storylineId: card.storylineId,
    storylineTitle: card.storylineTitle,
    coinDelta: demoDelta(card, 'coinDelta'),
    reputationDelta: demoDelta(card, 'reputationDelta'),
    cost: demoDelta(card, 'cost'),
    context: card.context ?? null,
  };
}

/** Reads a numeric game column, treating blank/non-numeric as `0`. */
function demoDelta(card: ContentCard, column: string): number {
  const value = Number(card.fields[column] ?? '');
  return Number.isFinite(value) ? value : 0;
}

/** One option as the scene renders it: its label plus its authored outcome. */
export interface DemoOptionView {
  /** The compiled option's label. */
  readonly label: string;
  /** The chosen path's authored `#says` prose, or `null` when none is authored. */
  readonly outcome: string | null;
}

/**
 * The beat's presentation view model.
 *
 * The scene renders exactly this: a `context` paragraph above the options when
 * the card authors one (`null` otherwise, so the layout can close up), the
 * beat's authored `cost` so the price is visible on the card line before the
 * player chooses, and the authored outcome prose per option so a choice can
 * narrate its consequence.
 */
export interface DemoCardView {
  /** The beat's authored situation paragraph, or `null` when absent. */
  readonly context: string | null;
  /** The beat's authored cost in coins (`0` when the beat costs nothing). */
  readonly cost: number;
  /** One entry per compiled option, in declaration order. */
  readonly options: readonly DemoOptionView[];
}

/** Normalises optional prose: blank or non-string reads as "not authored". */
function authoredProse(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

/** Builds the scene's view model for a drawn card and its compiled options. */
export function buildDemoCardView(
  card: StorylineCard,
  options: readonly StorylineOption<DemoState>[],
): DemoCardView {
  return {
    context: authoredProse((card as DemoCard).context),
    cost: demoCardCost(card),
    options: options.map((option) => ({
      label: option.label,
      outcome: authoredProse(option.says),
    })),
  };
}

/**
 * A card's authored beat cost, in coins (`0` when the card authors none).
 *
 * The beat cost is charged when the card resolves — see the demo engine's
 * `applyEffect`, which settles it together with the card's own coin delta.
 */
export function demoCardCost(card: StorylineCard): number {
  const cost = (card as DemoCard).cost;
  return typeof cost === 'number' && Number.isFinite(cost) ? cost : 0;
}

/**
 * Strips a chain instance serial (`gym-story-invest-3` → `gym-story-invest`),
 * matching the adapter's own base-type rule.
 */
export function getBaseTypeId(id: string): string {
  return id.replace(/-\d+$/, '');
}

/** Deterministic LCG so the demo is replay-safe (no candidate draws here). */
function nextRandom(state: DemoState): number {
  state.rngSeed = (state.rngSeed * 1664525 + 1013904223) >>> 0;
  return state.rngSeed / 0x100000000;
}

/**
 * The demo's starting coins.
 *
 * Tuned to the **authored** content, not to taste: the first beat costs 50
 * coins on resolution and its `Invest` option costs a further 5, so the start
 * must be at least 55 for the branch to be affordable — while staying under
 * the 100-coin floor of the authored `#when=coins>=100>gym-story-end` gate on
 * that same option. Starting above the gate would short-circuit the branch
 * straight to the ending and make `gym-story-invest` unreachable in the demo.
 * 60 keeps every authored card reachable and the cost affordable.
 *
 * Public Investment's own authored `cost` (100 coins) needs no extra float: it
 * settles against that card's +120 coin effect in a single step, so the branch
 * nets +20 and the balance never has to hold 100 coins at once.
 */
export const DEMO_STARTING_COINS = 60;

/** Fresh demo state, identical to what `[ Reset ]` installs. */
export function createDemoState(): DemoState {
  return {
    coins: DEMO_STARTING_COINS,
    reputation: 50,
    turn: 1,
    rngSeed: DEMO_RNG_SEED,
    activityLog: [],
    deck: [],
  };
}

/**
 * The demo's resource declaration, expressed as a projection of its own state
 * fields.
 *
 * The demo uses exactly the engine's **default projection** (`coins` /
 * `reputation`) — declaring it explicitly is behaviour-neutral and shows the
 * seam a multi-resource game would use (`createResourceProjection` over
 * `hull`, `morale`, … instead of `coins` / `reputation`).
 */
const demoResources = createResourceProjection<DemoState>({
  coins: {
    read: (state) => state.coins,
    apply: (state, delta) => {
      state.coins += delta;
    },
  },
  reputation: {
    read: (state) => state.reputation,
    apply: (state, delta) => {
      state.reputation += delta;
    },
  },
});

/** Engine adapter mapping the generic seams onto the demo state. */
export function createDemoEngine(
  cards: readonly DemoCard[],
): StorylineEngineAdapter<DemoState, StorylineCard> {
  const templates = new Map<string, DemoCard>(cards.map((card) => [card.id, card]));
  return {
    ...demoResources,
    rng: (state) => nextRandom(state),
    applyEffect: (state, card) => {
      // A beat's authored `cost` is a real payment, settled together with the
      // card's own effect in one step: the balance never dips through a
      // transient negative, and the reported `coinChange` is the beat's real
      // trade (Public Investment: +120 gained − 100 paid = +20).
      state.coins += (card.coinDelta ?? 0) - demoCardCost(card);
      state.reputation += card.reputationDelta ?? 0;
    },
    appendLog: (state, text) => {
      state.activityLog.push({ turn: state.turn, text });
    },
    getActivityLog: (state) => state.activityLog,
    getTemplate: (id) => templates.get(id) ?? null,
    getBaseTypeId: (id) => getBaseTypeId(id),
    getChainScanCards: (state) => state.deck,
    pushChainCard: (state, card) => {
      state.deck.push(card);
    },
  };
}

/** A wired demo system plus the state it drives. */
export interface DemoRuntime {
  system: StorylineSystem<DemoState, StorylineCard>;
  state: DemoState;
  /** The card catalogue this runtime resolves successors from. */
  cards: readonly DemoCard[];
}

/**
 * Builds a fresh demo runtime (default UI adapter, deterministic seed).
 *
 * `cards` is the catalogue to play — the scene passes
 * {@link demoCardsFromCsv} over the authored content. The parameter (rather
 * than a module-level catalogue) is the seam that lets a scene and its tests
 * play a fixture without prose to prove the "context absent" layout, and
 * keeps the demo off a second, hand-maintained card list.
 */
export function createDemoRuntime(
  cards: readonly DemoCard[],
): DemoRuntime {
  return {
    system: createStorylineSystem({ engine: createDemoEngine(cards) }),
    state: createDemoState(),
    cards,
  };
}

/** The result of drawing a card. */
export interface DemoDraw {
  /** The drawn card. */
  card: StorylineCard;
  /** Pending choice for a branching card; `null` for a terminal card. */
  pending: PendingStorylineChoice<DemoState, StorylineCard> | null;
  /** Options the player may pick (empty for a terminal card). */
  options: StorylineOption<DemoState>[];
  /** Resource deltas applied by a terminal card (zero for a choice card). */
  coinChange: number;
  reputationChange: number;
  /** True when the drawn card ended the chain instead of offering options. */
  finished: boolean;
  /** Story-update line to journal for a terminal card (null when none). */
  storyUpdate: string | null;
}

/**
 * Draws a card: returns the compiled options for a branching card, or applies
 * a terminal card's effect, journals it and reports the chain finished.
 */
export function drawDemoCard(
  system: StorylineSystem<DemoState, StorylineCard>,
  state: DemoState,
  card: StorylineCard,
): DemoDraw {
  if (system.eventHasStoryline(card)) {
    const pending = system.createPendingStorylineChoice(card, state);
    if (pending) {
      return {
        card,
        pending,
        options: system.getPendingStorylineOptions(pending, state),
        coinChange: 0,
        reputationChange: 0,
        finished: false,
        storyUpdate: null,
      };
    }
  }

  const before = system.engine.getResources(state);
  system.engine.applyEffect(state, card);
  const after = system.engine.getResources(state);
  const coinChange = after.coins - before.coins;
  const reputationChange = after.reputation - before.reputation;
  const storyUpdate = system.ui.storyUpdateLine(
    card,
    'accept',
    coinChange,
    reputationChange,
  );
  if (storyUpdate) system.engine.appendLog(state, storyUpdate);

  return {
    card,
    pending: null,
    options: [],
    coinChange,
    reputationChange,
    finished: true,
    storyUpdate,
  };
}

/** The result of resolving a chosen option. */
export interface DemoChoice {
  /** Resource deltas applied by the chosen option. */
  coinChange: number;
  reputationChange: number;
  /** Successor card pushed onto the chain, or `null` when the chain ended. */
  pushedCard: StorylineCard | null;
  /** Story-update line to journal (null when the adapter produced none). */
  storyUpdate: string | null;
  /** The chosen option's authored `#says` outcome prose (null when none). */
  outcomeProse: string | null;
}

/**
 * Resolves the chosen option, journals the story update and returns the
 * successor card (if any). The caller decides whether to draw it.
 */
export function applyDemoChoice(
  system: StorylineSystem<DemoState, StorylineCard>,
  state: DemoState,
  card: StorylineCard,
  option: StorylineOption<DemoState>,
  pending: PendingStorylineChoice<DemoState, StorylineCard> | null = null,
): DemoChoice {
  const result = system.resolveStorylineOption(state, card, option);
  if (pending) system.markChoiceResolved(pending, option.label);

  const storyUpdate = system.ui.storyUpdateLine(
    card,
    option.label,
    result.coinChange,
    result.repChange,
  );
  if (storyUpdate) system.engine.appendLog(state, storyUpdate);

  return {
    coinChange: result.coinChange,
    reputationChange: result.repChange,
    pushedCard: result.pushedCard ?? null,
    storyUpdate,
    outcomeProse: result.outcomeProse ?? null,
  };
}

/** Draws the demo's first card onto a fresh runtime. */
export function startDemo(runtime: DemoRuntime): DemoDraw & { card: StorylineCard } {
  const card = runtime.cards.find((entry) => entry.id === DEMO_START_CARD_ID);
  if (!card) throw new Error(`Demo start card ${DEMO_START_CARD_ID} is missing`);
  return { ...drawDemoCard(runtime.system, runtime.state, card), card };
}
