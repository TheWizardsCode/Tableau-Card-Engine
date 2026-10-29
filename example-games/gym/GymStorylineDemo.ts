/**
 * GymStorylineDemo — the Phaser-free pure logic behind `GymStorylineScene`.
 *
 * The scene is deliberately thin: everything that decides *what happens* when
 * a card is drawn or an option is chosen lives here, so the demo's branching
 * fixture can be unit-tested without booting Phaser or a browser:
 *
 * - {@link DEMO_CARDS} — the four-card branching fixture (two-way choice →
 *   successor choice → terminal, plus a terminal option that ends the chain
 *   immediately).
 * - {@link createDemoState} — the initial demo state (coins, reputation,
 *   turn, seeded rng, activity log, chain deck).
 * - {@link createDemoEngine} — the {@link StorylineEngineAdapter} mapping the
 *   generic story-line seams (rng draw, effect application, resource reads,
 *   activity log, template lookup, chain-card sink) onto that state.
 * - {@link startDemo} / {@link applyDemoChoice} / {@link applyTerminalCard} —
 *   the three pure transitions the scene renders. Each returns plain data
 *   (compiled/available options, resource deltas, the pushed successor) and
 *   leaves all presentation to the caller.
 *
 * Nothing in this module imports `phaser` or any game beyond the generic
 * `@story-line` contract, which is what makes it directly testable — see
 * `core/tests/gym/GymStorylineDemo.test.ts`.
 *
 * @module example-games/gym/GymStorylineDemo
 */

import {
  createStorylineSystem,
  type PendingStorylineChoice,
  type StorylineCard,
  type StorylineEngineAdapter,
  type StorylineLogEntry,
  type StorylineOption,
  type StorylineSystem,
} from '@story-line';

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
 * The demo's card catalogue (templates, no instance serials).
 *
 * Shape: `Town Meeting` (Invest / Ignore) → `Public Investment` (Celebrate /
 * Double down) or `Neglected Roads` (Repair / Let it be) → terminal
 * `New Beginning`. `Double down` and `Let it be` carry an empty successor, so
 * they end the chain immediately.
 */
export const DEMO_CARDS: readonly StorylineCard[] = [
  {
    id: 'gym-story-start',
    name: 'Town Meeting',
    storylineId: 'gym-story',
    storylineTitle: 'Gym Storyline',
    effect: 'Lose 50 coins',
    coinDelta: -50,
    options: 'Invest|gym-story-invest;Ignore|gym-story-ignore',
  },
  {
    id: 'gym-story-invest',
    name: 'Public Investment',
    storylineId: 'gym-story',
    storylineTitle: 'Gym Storyline',
    effect: 'Gain 120 coins',
    coinDelta: 120,
    options: 'Celebrate|gym-story-end;Double down|',
  },
  {
    id: 'gym-story-ignore',
    name: 'Neglected Roads',
    storylineId: 'gym-story',
    storylineTitle: 'Gym Storyline',
    effect: 'Lose 80 coins',
    coinDelta: -80,
    options: 'Repair|gym-story-end;Let it be|',
  },
  {
    id: 'gym-story-end',
    name: 'New Beginning',
    storylineId: 'gym-story',
    storylineTitle: 'Gym Storyline',
    effect: 'Gain 60 reputation',
    reputationDelta: 60,
  },
];

const TEMPLATES = new Map<string, StorylineCard>(
  DEMO_CARDS.map((card) => [card.id, card]),
);

/** Looks up a demo card template by id (undefined when unknown). */
export function getDemoTemplate(id: string): StorylineCard | undefined {
  return TEMPLATES.get(id);
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

/** Fresh demo state, identical to what `[ Reset ]` installs. */
export function createDemoState(): DemoState {
  return {
    coins: 1000,
    reputation: 50,
    turn: 1,
    rngSeed: DEMO_RNG_SEED,
    activityLog: [],
    deck: [],
  };
}

/** Engine adapter mapping the generic seams onto the demo state. */
export function createDemoEngine(): StorylineEngineAdapter<DemoState, StorylineCard> {
  return {
    rng: (state) => nextRandom(state),
    applyEffect: (state, card) => {
      state.coins += card.coinDelta ?? 0;
      state.reputation += card.reputationDelta ?? 0;
    },
    applyResourceDelta: (state, delta) => {
      state.coins += delta.coins ?? 0;
      state.reputation += delta.reputation ?? 0;
    },
    getResources: (state) => ({ coins: state.coins, reputation: state.reputation }),
    appendLog: (state, text) => {
      state.activityLog.push({ turn: state.turn, text });
    },
    getActivityLog: (state) => state.activityLog,
    getTemplate: (id) => TEMPLATES.get(id) ?? null,
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
}

/** Builds a fresh demo runtime (default UI adapter, deterministic seed). */
export function createDemoRuntime(): DemoRuntime {
  return {
    system: createStorylineSystem({ engine: createDemoEngine() }),
    state: createDemoState(),
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
  };
}

/** Draws the demo's first card onto a fresh runtime. */
export function startDemo(runtime: DemoRuntime): DemoDraw & { card: StorylineCard } {
  const card = TEMPLATES.get(DEMO_START_CARD_ID);
  if (!card) throw new Error(`Demo start card ${DEMO_START_CARD_ID} is missing`);
  return { ...drawDemoCard(runtime.system, runtime.state, card), card };
}
