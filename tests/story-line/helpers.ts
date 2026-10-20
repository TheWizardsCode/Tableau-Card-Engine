/**
 * Shared test fixtures for the story-line parity tests.
 *
 * A minimal in-memory state + engine adapter double exercising the generic
 * story-line API without any game dependency. Mirrors the shape of Main
 * Street's engine adapter (resolved later by the adapters work item).
 *
 * @module
 */

import type {
  StorylineCard,
  StorylineEngineAdapter,
  StorylineLogEntry,
} from '../../src/story-line';

/** Minimal card shape used by the tests (structurally assignable). */
export interface TestCard extends StorylineCard {
  readonly id: string;
  readonly name: string;
}

/** Minimal in-memory game state the double mutates. */
export interface TestState {
  coins: number;
  reputation: number;
  turn: number;
  activityLog: StorylineLogEntry[];
  deck: TestCard[];
  discards: TestCard[];
  /** Deterministic RNG queue consumed by `engine.rng` (default 0.5). */
  rngQueue: number[];
  /** Total `engine.rng` calls (asserting the one-draw-per-selection rule). */
  rngCalls: number;
}

/** Builds a well-formed test card with the given overrides. */
export function makeCard(overrides: Partial<TestCard> & { id: string }): TestCard {
  return {
    name: overrides.id.replace(/^evt-/, '').replace(/-/g, ' '),
    ...overrides,
  } as TestCard;
}

/** Builds a fresh test state. */
export function makeState(overrides: Partial<TestState> = {}): TestState {
  return {
    coins: 1000,
    reputation: 50,
    turn: 1,
    activityLog: [],
    deck: [],
    discards: [],
    rngQueue: [],
    rngCalls: 0,
    ...overrides,
  };
}

/** A template catalogue: card template id → card. */
export type TemplateMap = Map<string, TestCard>;

/** Builds a template from a card spec and adds it to the map. */
export function addTemplate(
  templates: TemplateMap,
  card: TestCard,
): TestCard {
  templates.set(card.id, card);
  return card;
}

/**
 * Builds the engine adapter double for the test state.
 *
 * Semantics mirror Main Street's adapter contract:
 * - `rng` pops the next queued value (fallback 0.5) and counts the call.
 * - `applyEffect` applies `coinDelta` / `reputationDelta`.
 * - `pushChainCard` pushes onto `state.deck`; the serial-naming scan covers
 *   `deck` + `discards`.
 */
export function makeAdapter(
  templates: TemplateMap,
): StorylineEngineAdapter<TestState, TestCard> {
  return {
    rng(state) {
      state.rngCalls += 1;
      return state.rngQueue.length > 0 ? state.rngQueue.shift()! : 0.5;
    },
    applyEffect(state, card) {
      state.coins += card.coinDelta ?? 0;
      state.reputation += card.reputationDelta ?? 0;
    },
    getResources(state) {
      return { coins: state.coins, reputation: state.reputation };
    },
    appendLog(state, text) {
      state.activityLog.push({ turn: state.turn, text });
    },
    getActivityLog(state) {
      return state.activityLog;
    },
    getTemplate(id) {
      return templates.get(id) ?? null;
    },
    getBaseTypeId(id) {
      return id.replace(/-\d+$/, '');
    },
    getChainScanCards(state) {
      return [...state.deck, ...state.discards];
    },
    pushChainCard(state, card) {
      state.deck.push(card);
    },
  };
}
