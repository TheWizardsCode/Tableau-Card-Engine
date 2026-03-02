/**
 * Main Street: Game State Types and Setup
 *
 * Defines the complete game state for Main Street including the street grid,
 * market, resource bank, decks, and phase tracking. Provides a setup function
 * that creates a deterministic initial state from a seed string.
 *
 * @module
 */

import { shuffleArray } from '../../src/card-system';
import { createSeededRng } from '../../src/core-engine';
import {
  type BusinessCard,
  type EventCard,
  type UpgradeCard,
  createBusinessDeck,
  createEventDeck,
  createUpgradeDeck,
  GRID_SIZE,
  STARTING_COINS,
  STARTING_REPUTATION,
  MARKET_BUSINESS_SLOTS,
  MARKET_EVENT_SLOTS,
  MARKET_UPGRADE_SLOTS,
} from './MainStreetCards';

// ── Activity Log ────────────────────────────────────────────

/** Classification of a log entry for color coding in the UI. */
export type LogEntryType = 'gain' | 'loss' | 'neutral' | 'turn-header';

/**
 * A single entry in the game activity log.
 *
 * Stored in `MainStreetState.activityLog` and rendered by the UI
 * to give the player a history of what happened each turn.
 */
export interface LogEntry {
  /** The turn number when this entry was created. */
  turn: number;
  /** Human-readable summary of the action (one line). */
  text: string;
  /** Classification for UI color coding. */
  type: LogEntryType;
}

/**
 * Appends a log entry to the activity log.
 *
 * Convenience helper so engine/market functions don't need to
 * construct the object themselves.
 */
export function addLog(
  state: MainStreetState,
  text: string,
  type: LogEntryType,
): void {
  state.activityLog.push({ turn: state.turn, text, type });
}

// ── Phase Types ─────────────────────────────────────────────

/**
 * The phases of a Main Street turn (simplified for walking skeleton).
 *
 * DayStart              -> MarketPhase (combined with ActionPhase)
 * MarketPhase           -> InvestmentResolution
 * InvestmentResolution  -> IncomePhase
 * IncomePhase           -> IncidentPhase
 * IncidentPhase         -> EndCheck
 * EndCheck              -> DayStart (next turn) | GameOver
 */
export type DayPhase =
  | 'DayStart'
  | 'MarketPhase'
  | 'InvestmentResolution'
  | 'IncomePhase'
  | 'IncidentPhase'
  | 'EndCheck';

/** All phases in order for the PhaseManager. */
export const PHASE_ORDER: readonly DayPhase[] = [
  'DayStart',
  'MarketPhase',
  'InvestmentResolution',
  'IncomePhase',
  'IncidentPhase',
  'EndCheck',
] as const;

// ── Market State ────────────────────────────────────────────

/** The face-up cards available for purchase. */
export interface MarketState {
  business: BusinessCard[];
  event: EventCard[];
  upgrade: UpgradeCard[];
}

// ── Resource Bank ───────────────────────────────────────────

/** Player's resources: coins (currency) and reputation (score multiplier). */
export interface ResourceBank {
  coins: number;
  reputation: number;
}

// ── Game Result ─────────────────────────────────────────────

/** Possible game outcomes. */
export type GameResult = 'playing' | 'win' | 'loss';

/** Reason for game ending. */
export type EndReason =
  | 'score_threshold'
  | 'all_challenges'
  | 'turn_limit_victory'
  | 'bankruptcy'
  | 'reputation_collapse'
  | 'turn_exhaustion'
  | null;

// ── Main Street State ───────────────────────────────────────

/**
 * Complete game state for Main Street.
 *
 * This is the single source of truth for the game's current state.
 * All game logic operates on and returns this state.
 */
export interface MainStreetState {
  /** Current turn number (1-based, max MAX_TURNS). */
  turn: number;
  /** Current phase within the turn. */
  phase: DayPhase;
  /** The 10-slot linear street grid (null = empty slot). */
  streetGrid: (BusinessCard | null)[];
  /** Face-up cards available for purchase. */
  market: MarketState;
  /** Player resources. */
  resourceBank: ResourceBank;
  /** Remaining cards in each deck (draw from end = top). */
  decks: {
    business: BusinessCard[];
    event: EventCard[];
    upgrade: UpgradeCard[];
  };
  /** IDs of completed challenges. */
  challengesCompleted: string[];
  /** Held Investment event awaiting play (max 1 at a time, null = none). */
  heldEvent: EventCard | null;
  /** Current game result. */
  gameResult: GameResult;
  /** Reason the game ended (null while playing). */
  endReason: EndReason;
  /** Computed final score (updated each EndCheck or at game over). */
  finalScore: number;
  /** The seed string used for this game. */
  seed: string;
  /** The RNG function for this game (seeded, deterministic). */
  rng: () => number;
  /** Chronological log of game activities for the UI activity log panel. */
  activityLog: LogEntry[];
}

// ── Setup Options ───────────────────────────────────────────

/** Options for setting up a new Main Street game. */
export interface MainStreetSetupOptions {
  /** Seed string for deterministic RNG. If omitted, a random seed is generated. */
  seed?: string;
}

// ── Seed Helpers ────────────────────────────────────────────

/**
 * Converts a string seed to a numeric seed for the LCG.
 * Uses a simple hash (djb2) to convert arbitrary strings to numbers.
 */
export function seedToNumber(seed: string): number {
  let hash = 5381;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) + hash + seed.charCodeAt(i)) | 0;
  }
  return hash;
}

/**
 * Generates a random seed string (6-character alphanumeric).
 */
export function generateSeedString(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// ── Market Helpers ──────────────────────────────────────────

/**
 * Draws cards from a deck to fill market slots.
 * Mutates the deck array (pops from end = top of deck).
 */
function fillMarketSlots<T>(deck: T[], count: number): T[] {
  const slots: T[] = [];
  for (let i = 0; i < count && deck.length > 0; i++) {
    slots.push(deck.pop()!);
  }
  return slots;
}

// ── Setup Function ──────────────────────────────────────────

/**
 * Creates a new Main Street game state from setup options.
 *
 * The decks are shuffled deterministically using the provided seed.
 * The market is populated from the shuffled decks.
 *
 * @param options  Setup options (seed is optional).
 * @returns A fully initialised MainStreetState ready for turn 1.
 */
export function setupMainStreetGame(options: MainStreetSetupOptions = {}): MainStreetState {
  const seed = options.seed ?? generateSeedString();
  const numericSeed = seedToNumber(seed);
  const rng = createSeededRng(numericSeed);

  // Create and shuffle decks
  const businessDeck = createBusinessDeck();
  const eventDeck = createEventDeck();
  const upgradeDeck = createUpgradeDeck();

  shuffleArray(businessDeck, rng);
  shuffleArray(eventDeck, rng);
  shuffleArray(upgradeDeck, rng);

  // Populate initial market
  const market: MarketState = {
    business: fillMarketSlots(businessDeck, MARKET_BUSINESS_SLOTS),
    event: fillMarketSlots(eventDeck, MARKET_EVENT_SLOTS),
    upgrade: fillMarketSlots(upgradeDeck, MARKET_UPGRADE_SLOTS),
  };

  // Build initial state
  const state: MainStreetState = {
    turn: 1,
    phase: 'DayStart',
    streetGrid: new Array<BusinessCard | null>(GRID_SIZE).fill(null),
    market,
    resourceBank: {
      coins: STARTING_COINS,
      reputation: STARTING_REPUTATION,
    },
    decks: {
      business: businessDeck,
      event: eventDeck,
      upgrade: upgradeDeck,
    },
    challengesCompleted: [],
    heldEvent: null,
    gameResult: 'playing',
    endReason: null,
    finalScore: 0,
    seed,
    rng,
    activityLog: [],
  };

  return state;
}
