/**
 * 1916: The Rising — the Memory economy and the Conversation mechanic.
 *
 * This module is deliberately renderer-free and deterministic. It sits between
 * the pure state machine ({@link ./TheRisingState}) and the content roster
 * ({@link ./TheRisingContent}), and answers two questions:
 *
 * 1. **Economy** — may the player spend Memory to meet a spirit? Meeting costs
 *    a fixed amount; the affordability check is enforced through an
 *    {@link EconomyLedger} with a zero floor, so an unaffordable meet is
 *    rejected with a structured {@link LegalityResult} and leaves the state
 *    untouched.
 * 2. **Conversation** — which questions does a spirit offer, and what
 *    testimony does the chosen question yield? The 2–3 questions are the
 *    spirit's testimonies presented in an order derived from the session seed
 *    and the spirit id, so the same seed and the same chosen index always
 *    produce the same testimony.
 *
 * All functions are pure: they never mutate the supplied state and always
 * return a new state plus a structured result.
 *
 * @module TheRisingEconomy
 */

import { shuffleArray } from '@card-system';
import { createSeededRng } from '@core-engine/SeededRng';
import {
  createEconomyLedger,
  illegalAction,
  legalAction,
  type LegalityResult,
} from '@rule-engine';
import { ROSTER, seedToNumber, type Roster, type Spirit, type Testimony } from './TheRisingContent';
import { transition, type RisingState } from './TheRisingState';

/** The fixed Memory cost of meeting one spirit. */
export const SPIRIT_MEET_MEMORY_COST = 1;

/** Insight awarded for choosing a testimony during a conversation. */
export const CONVERSATION_INSIGHT = 1;

/** The number of question options a conversation offers when available. */
export const CONVERSATION_OPTION_COUNT = 3;

/** The minimum number of question options a conversation must offer. */
export const CONVERSATION_MIN_OPTIONS = 2;

/** Options accepted by the economy helpers. */
export interface EconomyOptions {
  /** The roster to resolve spirits against (defaults to {@link ROSTER}). */
  readonly roster?: Roster;
  /** The Memory cost of meeting a spirit (defaults to {@link SPIRIT_MEET_MEMORY_COST}). */
  readonly meetCost?: number;
}

/** Options accepted by the conversation helpers. */
export interface ConversationOptions {
  /** The roster to resolve spirits against (defaults to {@link ROSTER}). */
  readonly roster?: Roster;
  /** Maximum number of options to offer (defaults to {@link CONVERSATION_OPTION_COUNT}). */
  readonly count?: number;
  /** Insight awarded for choosing (defaults to {@link CONVERSATION_INSIGHT}). */
  readonly insight?: number;
}

/** The resolved Memory cost for an economy operation. */
export function meetCostOf(options: EconomyOptions = {}): number {
  return options.meetCost ?? SPIRIT_MEET_MEMORY_COST;
}

function resolveSpirit(spiritOrId: Spirit | string, roster: Roster): Spirit | undefined {
  return typeof spiritOrId === 'string'
    ? roster.spirits.find((candidate) => candidate.id === spiritOrId)
    : spiritOrId;
}

// ── Memory economy ──────────────────────────────────────────

/**
 * Whether the player may spend Memory to meet `spiritOrId`.
 *
 * Enforced via an {@link EconomyLedger} whose coins floor is zero, so the check
 * is the same mechanism that guards every other engine economy.
 */
export function canMeetSpirit(
  state: RisingState,
  spiritOrId: Spirit | string,
  options: EconomyOptions = {},
): LegalityResult {
  const roster = options.roster ?? ROSTER;
  const cost = meetCostOf(options);
  const spirit = resolveSpirit(spiritOrId, roster);
  if (!spirit) {
    return illegalAction(`Unknown spirit "${String(spiritOrId)}".`);
  }
  if (state.phase !== 'idle') {
    return illegalAction(`Cannot meet a spirit while in phase "${state.phase}".`);
  }
  if (!state.spiritRow.includes(spirit.id)) {
    return illegalAction(`${spirit.name} is not available in the Spirit Row.`);
  }
  if (state.hand.includes(spirit.id)) {
    return illegalAction(`${spirit.name} has already been met.`);
  }
  if (state.timeline.some((entry) => entry.spiritId === spirit.id)) {
    return illegalAction(`${spirit.name} is already on the timeline.`);
  }
  const ledger = createEconomyLedger({
    coins: state.memory,
    constraints: { minCoins: 0 },
  });
  if (!ledger.canApply({ coins: -cost })) {
    return illegalAction(
      `Not enough Memory to meet ${spirit.name}: ${state.memory} remaining, ${cost} required.`,
    );
  }
  return legalAction();
}

/** The outcome of attempting to meet (and pay for) a spirit. */
export interface MeetResult {
  /** The next state (unchanged when the meet is rejected). */
  readonly state: RisingState;
  /** Whether the meet was accepted. */
  readonly result: LegalityResult;
  /** The Memory cost that applied (or would have applied). */
  readonly cost: number;
  /** The resolved spirit, or `null` when the id was unknown. */
  readonly spirit: Spirit | null;
}

/**
 * Spend Memory to meet a spirit.
 *
 * A legal meet deducts {@link EconomyOptions.meetCost} from the state's Memory
 * and drives the state machine into the `meeting` phase. An illegal meet (wrong
 * phase, unavailable spirit, insufficient Memory) leaves the state untouched.
 */
export function meetSpirit(
  state: RisingState,
  spiritOrId: Spirit | string,
  options: EconomyOptions = {},
): MeetResult {
  const cost = meetCostOf(options);
  const roster = options.roster ?? ROSTER;
  const spirit = resolveSpirit(spiritOrId, roster) ?? null;
  const legality = canMeetSpirit(state, spiritOrId, options);
  if (!legality.legal) {
    return { state, result: legality, cost, spirit };
  }
  const met = transition(state, { type: 'meet', spiritId: spirit!.id });
  if (!met.result.legal) {
    return { state, result: met.result, cost, spirit };
  }
  return {
    state: { ...met.state, memory: met.state.memory - cost },
    result: legalAction(),
    cost,
    spirit,
  };
}

// ── Conversation ────────────────────────────────────────────

/** A question offered to the player during a conversation. */
export interface ConversationOption {
  /** The presented index (`0`-based) the player chooses. */
  readonly index: number;
  /** The underlying testimony index in the spirit's data. */
  readonly testimonyIndex: number;
  /** The question text shown on the button. */
  readonly question: string;
}

/**
 * Derive the deterministic RNG seed for a spirit's conversation options.
 *
 * Combining the session seed with the spirit id means the option order is
 * reproducible for a given seed and spirit, and independent between spirits.
 */
export function conversationSeed(seed: number, spiritId: string): number {
  return seedToNumber(`${seed}:${spiritId}`);
}

/**
 * The deterministic, seeded order of a spirit's testimony indices.
 *
 * Returns every testimony index exactly once, in an order derived from the
 * session seed and the spirit id.
 */
export function testimonyOrder(spirit: Spirit, seed: number): number[] {
  const indices = spirit.testimonies.map((_testimony, index) => index);
  shuffleArray(indices, createSeededRng(conversationSeed(seed, spirit.id)));
  return indices;
}

/** The spirit currently being conversed with, or `null`. */
function activeSpirit(
  state: RisingState,
  spiritOrId: Spirit | string | undefined,
  roster: Roster,
): Spirit | null {
  const id = spiritOrId ?? state.activeSpiritId ?? undefined;
  if (id === undefined) {
    return null;
  }
  return resolveSpirit(id, roster) ?? null;
}

/**
 * The 2–3 questions a spirit offers, in deterministic order.
 *
 * Returns `[]` when no spirit is active or the id is unknown. The count is
 * clamped to the number of testimonies and never exceeds
 * {@link CONVERSATION_OPTION_COUNT}.
 */
export function conversationOptions(
  state: RisingState,
  spiritOrId?: Spirit | string,
  options: ConversationOptions = {},
): ConversationOption[] {
  const roster = options.roster ?? ROSTER;
  const spirit = activeSpirit(state, spiritOrId, roster);
  if (!spirit) {
    return [];
  }
  const order = testimonyOrder(spirit, state.seed);
  const requested = options.count ?? CONVERSATION_OPTION_COUNT;
  const count = Math.max(0, Math.min(Math.trunc(requested), order.length));
  return order.slice(0, count).map((testimonyIndex, index) => ({
    index,
    testimonyIndex,
    question: spirit.testimonies[testimonyIndex].question,
  }));
}

/** The outcome of choosing a testimony. */
export interface TestimonyChoice {
  /** The next state (unchanged when the choice is rejected). */
  readonly state: RisingState;
  /** Whether the choice was accepted. */
  readonly result: LegalityResult;
  /** The chosen testimony, or `null` when the choice was rejected. */
  readonly testimony: Testimony | null;
  /** The presented option index the player chose. */
  readonly optionIndex: number;
  /** The underlying testimony index, or `null` when rejected. */
  readonly testimonyIndex: number | null;
  /** The Insight awarded for the choice (`0` when rejected). */
  readonly insightAwarded: number;
}

function rejectedChoice(state: RisingState, optionIndex: number): TestimonyChoice {
  return {
    state,
    result: illegalAction('The testimony choice was rejected.'),
    testimony: null,
    optionIndex,
    testimonyIndex: null,
    insightAwarded: 0,
  };
}

/**
 * Choose one of a spirit's offered questions.
 *
 * A legal choice records the underlying testimony index on the state machine,
 * advances to the `placing` phase and awards {@link CONVERSATION_INSIGHT}. The
 * same state seed and the same presented index always yield the same testimony.
 */
export function chooseTestimony(
  state: RisingState,
  optionIndex: number,
  options: ConversationOptions = {},
): TestimonyChoice {
  const roster = options.roster ?? ROSTER;
  if (state.phase !== 'conversing') {
    return {
      ...rejectedChoice(state, optionIndex),
      result: illegalAction(`Cannot choose a testimony while in phase "${state.phase}".`),
    };
  }
  if (state.activeSpiritId === null) {
    return {
      ...rejectedChoice(state, optionIndex),
      result: illegalAction('No spirit is being conversed with.'),
    };
  }
  const offered = conversationOptions(state, state.activeSpiritId, options);
  if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex >= offered.length) {
    return {
      ...rejectedChoice(state, optionIndex),
      result: illegalAction(
        `Invalid question index ${optionIndex}; ${offered.length} options are offered.`,
      ),
    };
  }
  const spirit = activeSpirit(state, state.activeSpiritId, roster)!;
  const option = offered[optionIndex];
  const chosen = transition(state, {
    type: 'choose-testimony',
    testimonyIndex: option.testimonyIndex,
  });
  if (!chosen.result.legal) {
    return { ...rejectedChoice(state, optionIndex), result: chosen.result };
  }
  const insight = options.insight ?? CONVERSATION_INSIGHT;
  return {
    state: { ...chosen.state, insight: chosen.state.insight + insight },
    result: legalAction(),
    testimony: spirit.testimonies[option.testimonyIndex],
    optionIndex,
    testimonyIndex: option.testimonyIndex,
    insightAwarded: insight,
  };
}
