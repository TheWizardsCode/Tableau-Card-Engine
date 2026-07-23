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
import { type ActiveEffect, createSeededRng } from '../../src/core-engine';
import { createEconomyLedger, type EconomyLedger } from '../../src/rule-engine/EconomyLedger';
import {
  type BusinessCard,
  type CommunitySpaceCard,
  type EventCard,
  type UpgradeCard,
  type StaffCard,
  createBusinessDeck,
  createCommunitySpaceDeck,
  createEventDeck,
  createUpgradeDeck,
  createStaffDeck,
  CSV_CHECKSUM,
  GRID_SIZE,
  MARKET_BUSINESS_SLOTS,
  MARKET_INVESTMENT_UPGRADE_COUNT,
  MARKET_INVESTMENT_EVENT_COUNT,
  INCIDENT_QUEUE_SIZE,
} from './MainStreetCards';
import {
  type ActiveChallenge,
  CHALLENGE_TEMPLATES,
  selectChallenges,
} from './MainStreetChallenges';
import {
  type GameConfig,
  type DifficultyName,
  getPreset,
} from './MainStreetDifficulty';

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

/**
 * Syncs the shared EconomyLedger from resourceBank values.
 * Called after direct resourceBank mutations to keep the ledger consistent.
 */
export function syncResourceBankToLedger(state: MainStreetState): void {
  const coins = state.resourceBank.coins;
  const rep = state.resourceBank.reputation;
  const coinDelta = coins - state.ledger.get('coins');
  const repDelta = rep - state.ledger.get('reputation');
  if (coinDelta !== 0 || repDelta !== 0) {
    state.ledger.apply({ coins: coinDelta, reputation: repDelta }, 'sync-from-resourceBank');
  }
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
  /** Cards in the development row (business and community space cards). */
  development: (BusinessCard | CommunitySpaceCard)[];
  /**
   * Mixed investment row: upgrade cards and Investment-trigger event cards.
   * Typically 2 upgrades + 1 investment event = 3 slots.
   */
  investments: (UpgradeCard | EventCard)[];
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
  /** Runtime configuration derived from the selected difficulty preset. */
  config: GameConfig;
  /** Current turn number (1-based, max config.maxTurns). */
  turn: number;
  /** Current phase within the turn. */
  phase: DayPhase;
  /** The 10-slot linear street grid (null = empty slot). Supports BusinessCard and CommunitySpaceCard. */
  streetGrid: (BusinessCard | CommunitySpaceCard | null)[];
  /** Face-up cards available for purchase. */
  market: MarketState;
  /** Player resources. */
  resourceBank: ResourceBank;
  /** Shared EconomyLedger for resource mutation (synced with resourceBank). */
  ledger: EconomyLedger;
  /** Remaining cards in each deck (draw from end = top). */
  decks: {
    business: BusinessCard[];
    communitySpace: CommunitySpaceCard[];
    event: EventCard[];
    upgrade: UpgradeCard[];
  };
  /** Discard piles for each deck (cards removed from markets are placed here). */
  discards: {
    business: BusinessCard[];
    communitySpace: CommunitySpaceCard[];
    event: EventCard[];
    upgrade: UpgradeCard[];
  };
  /** IDs of completed challenges. */
  challengesCompleted: string[];
  /** Active challenges for this run (selected at setup, evaluated each EndCheck). */
  activeChallenges: ActiveChallenge[];
  /** Held Investment event awaiting play (max 1 at a time, null = none). */
  heldEvent: EventCard | null;
  /** Visible FIFO queue of upcoming Incident events (front = next to resolve). */
  incidentQueue: EventCard[];
  /** Current game result. */
  gameResult: GameResult;
  /** Reason the game ended (null while playing). */
  endReason: EndReason;
  /** Computed final score (updated each EndCheck or at game over). */
  finalScore: number;
  /** The seed string used for this game. */
  seed: string;
  /** Numeric seed derived from the seed string (used for restore). */
  numericSeed: number;
  /** Number of RNG draws consumed so far (used for deterministic restore). */
  rngCalls: number;
  /** The RNG function for this game (seeded, deterministic). */
  rng: () => number;
  /** Chronological log of game activities for the UI activity log panel. */
  activityLog: LogEntry[];
  /** Active duration-based modifiers (e.g. Flu outbreak income reduction). */
  activeEffects: ActiveEffect[];
  /** Cards held in the player's hand (not placed on tableau). */
  hand: BusinessCard[];
  /** Maximum number of cards the player can hold in hand (default 2, expanded by staff cards). */
  maxHandSize: number;
  /** Discard pile for cycled and sold cards (unified discard pool). */
  discardPile: BusinessCard[];
  /** Active staff cards providing hand capacity bonuses. */
  staffCards: StaffCard[];
  /** Staff cards available for purchase in the market. */
  staffCardMarket: StaffCard[];
  /**
   * If true, `processEndOfTurn()` will skip `cycleMarketCards()`.
   * Used during the tutorial to preserve scenario-placed market cards
   * until the T7 purchase step completes.
   */
  skipMarketCycleOnEndTurn: boolean;
  /**
   * Tracks which street grid slots have been sold. Length = GRID_SIZE.
   * true = card in this slot has been sold (non-functional, no income/synergy).
   * false = card is active (default).
   */
  soldSlots: boolean[];
}

export interface MainStreetSerializedState {
  config: GameConfig;
  turn: number;
  phase: DayPhase;
  streetGrid: (BusinessCard | CommunitySpaceCard | null)[];
  market: MarketState;
  resourceBank: ResourceBank;
  decks: {
    business: BusinessCard[];
    communitySpace: CommunitySpaceCard[];
    event: EventCard[];
    upgrade: UpgradeCard[];
  };
  /** Discard piles snapshot (for save/restore) */
  discards: {
    business: BusinessCard[];
    communitySpace: CommunitySpaceCard[];
    event: EventCard[];
    upgrade: UpgradeCard[];
  };
  challengesCompleted: string[];
  activeChallenges: {
    challengeId: string;
    completed: boolean;
  }[];
  heldEvent: EventCard | null;
  incidentQueue: EventCard[];
  gameResult: GameResult;
  endReason: EndReason;
  finalScore: number;
  seed: string;
  numericSeed: number;
  rngCalls: number;
  activityLog: LogEntry[];
  activeEffects: ActiveEffect[];
  /** Serialized hand cards. */
  hand: BusinessCard[];
  /** Maximum hand size at the time of save. */
  maxHandSize: number;
  /** Serialized discard pile. */
  discardPile: BusinessCard[];
  /** Serialized active staff cards. */
  staffCards: StaffCard[];
  /** Serialized staff card market. */
  staffCardMarket: StaffCard[];
  /** Whether market cycling should be skipped on next end-of-turn. */
  skipMarketCycleOnEndTurn: boolean;
  /**
   * Checksum of the card-data.csv at the time this save was created.
   * Used to detect CSV changes between saves, triggering SVG regeneration.
   * Empty string indicates a legacy save before this field was added.
   */
  csvChecksum: string;
  /**
   * Tracks which street grid slots have been sold. Length = GRID_SIZE.
   * true = card in this slot has been sold (non-functional).
   */
  soldSlots: boolean[];
}

/** Record of a single milestone (tier unlock) achievement. */
export interface MilestoneRecord {
  /** Tier ID that was unlocked, e.g. 'tier-3'. */
  tierId: string;
  /** Which trigger path caused the unlock. */
  triggerType: 'reputation' | 'challenge';
  /** For reputation triggers: the reputation value at end-of-run. For challenge triggers: null. */
  reputationAtUnlock: number | null;
  /** For challenge triggers: the IDs of challenges completed that satisfied the condition. For reputation triggers: null. */
  challengeIdsAtUnlock: string[] | null;
  /** The final score of the run that triggered the unlock. */
  runFinalScore: number;
  /** The seed of the run that triggered the unlock. */
  runSeed: string;
  /** ISO 8601 timestamp when the milestone was achieved. */
  unlockedAt: string;
}

export interface MainStreetCampaignProgress {
  /** Schema version for forward-compatible deserialization. */
  schemaVersion: number;
  /** List of unlocked tier IDs, e.g. ['tier-1', 'tier-2']. Always includes 'tier-1'. */
  unlockedTiers: string[];
  /**
   * IDs of all cards unlocked via tier progression. Derived from unlockedTiers
   * at runtime, but persisted for fast lookup and offline validation.
   */
  unlockedCardIds: string[];
  /**
   * History of milestone achievements. Each entry records when a tier was
   * unlocked, which trigger path was used, and the run context.
   */
  milestoneHistory: MilestoneRecord[];
  /** Highest single-run reputation achieved across all runs. */
  persistentReputation: number;
  /** Highest final score achieved across all runs. */
  highestScore: number;
  /** Total number of completed runs (win or loss). */
  totalRuns: number;
  /** Total number of winning runs. */
  totalWins: number;
  /** ISO 8601 timestamp of the last update to this campaign data. */
  lastUpdatedAt: string;
  /** Whether the introductory tutorial has been completed by the player. */
  tutorialSeen?: boolean;
}

// ── Setup Options ───────────────────────────────────────────

/** Options for setting up a new Main Street game. */
export interface MainStreetSetupOptions {
  /** Seed string for deterministic RNG. If omitted, a random seed is generated. */
  seed?: string;
  /** Difficulty preset name. Defaults to 'Medium' if omitted. */
  difficulty?: DifficultyName;
  /**
   * Card IDs unlocked via campaign tier progression. When provided, deck builders
   * filter templates to include only cards whose IDs are in this list. When omitted,
   * the full card pool is used (non-campaign / backward-compatible mode).
   */
  unlockedCardIds?: string[];
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
  const baseRng = createSeededRng(numericSeed);
  let rngCalls = 0;
  let state!: MainStreetState;
  const rng = (): number => {
    rngCalls += 1;
    if (state) {
      state.rngCalls = rngCalls;
    }
    return baseRng();
  };

  // Resolve difficulty preset into runtime config
  const config = getPreset(options.difficulty);

  // Create and shuffle decks
  const businessDeck = createBusinessDeck(3, options.unlockedCardIds);
  const communitySpaceDeck = createCommunitySpaceDeck(3, options.unlockedCardIds);
  // Apply positive-incident weighting from the runtime difficulty config.
  // Pass the game's seeded RNG into createEventDeck so fractional duplicates
  // are selected deterministically per-game-seed rather than by template order.
  const eventDeck = createEventDeck(3, options.unlockedCardIds, rng, config.positiveIncidentMultiplier);
  const upgradeDeck = createUpgradeDeck(2, options.unlockedCardIds);
  const staffDeck = createStaffDeck(1);

  shuffleArray(businessDeck, rng);
  shuffleArray(communitySpaceDeck, rng);
  shuffleArray(eventDeck, rng);
  shuffleArray(upgradeDeck, rng);
  shuffleArray(staffDeck, rng);

  // Populate initial market
  // Development row: fill from business deck (community space cards are
  // integrated into the development row via the community-space deck during refill)
  // Investments row: 2 upgrades + 1 investment event
  const investments: (import('./MainStreetCards').UpgradeCard | import('./MainStreetCards').EventCard)[] = [];
  // Draw upgrades
  for (let i = 0; i < MARKET_INVESTMENT_UPGRADE_COUNT && upgradeDeck.length > 0; i++) {
    investments.push(upgradeDeck.pop()!);
  }
  // Draw investment event(s)
  for (let i = 0; i < MARKET_INVESTMENT_EVENT_COUNT; i++) {
    const idx = eventDeck.findIndex(e => e.trigger === 'Investment');
    if (idx === -1) break;
    investments.push(eventDeck.splice(idx, 1)[0]);
  }

  const market: MarketState = {
    development: fillMarketSlots(businessDeck, MARKET_BUSINESS_SLOTS),
    investments,
  };

  // Pre-draw incident cards into the visible FIFO queue
  const incidentQueue: EventCard[] = [];
  for (let i = 0; i < INCIDENT_QUEUE_SIZE; i++) {
    const idx = eventDeck.findIndex(e => e.trigger === 'Incident');
    if (idx === -1) break;
    incidentQueue.push(eventDeck.splice(idx, 1)[0]);
  }

  // Build initial state -- use config values instead of hard-coded constants
  const initCoins = config.startingCoins;
  const initRep = config.startingReputation;
  state = {
    config,
    turn: 1,
    phase: 'DayStart',
    streetGrid: new Array<BusinessCard | CommunitySpaceCard | null>(GRID_SIZE).fill(null),
    market,
    resourceBank: {
      coins: initCoins,
      reputation: initRep,
    },
    ledger: createEconomyLedger({
      coins: initCoins,
      reputation: initRep,
      score: 0,
    }),
    decks: {
      business: businessDeck,
      communitySpace: communitySpaceDeck,
      event: eventDeck,
      upgrade: upgradeDeck,
    },
    // Discard piles for removed market cards
    discards: {
      business: [],
      communitySpace: [],
      event: [],
      upgrade: [],
    },
    challengesCompleted: [],
    activeChallenges: [],
    heldEvent: null,
    incidentQueue,
    gameResult: 'playing',
    endReason: null,
    finalScore: 0,
    seed,
    numericSeed,
    rngCalls,
    rng,
    activityLog: [],
    activeEffects: [],
    hand: [],
    maxHandSize: 2,
    discardPile: [],
    staffCards: [],
    staffCardMarket: staffDeck,
    skipMarketCycleOnEndTurn: false,
    soldSlots: new Array<boolean>(GRID_SIZE).fill(false),
  };

  // Select challenges for this run using seeded RNG and config count
  const selectedChallenges = selectChallenges(CHALLENGE_TEMPLATES, config.challengesPerRun, rng);
  state.activeChallenges = selectedChallenges.map(ch => ({
    challenge: ch,
    completed: false,
  }));

  return state;
}

/**
 * Serializes Main Street runtime state into a JSON-safe checkpoint shape.
 */
export function serializeMainStreetState(state: MainStreetState): MainStreetSerializedState {
  return {
    config: structuredClone(state.config),
    turn: state.turn,
    phase: state.phase,
    streetGrid: structuredClone(state.streetGrid),
    market: structuredClone(state.market),
    resourceBank: structuredClone(state.resourceBank),
    decks: structuredClone(state.decks),
    discards: structuredClone(state.discards),
    challengesCompleted: [...state.challengesCompleted],
    activeChallenges: state.activeChallenges.map((ac) => ({
      challengeId: ac.challenge.id,
      completed: ac.completed,
    })),
    heldEvent: structuredClone(state.heldEvent),
    incidentQueue: structuredClone(state.incidentQueue),
    gameResult: state.gameResult,
    endReason: state.endReason,
    finalScore: state.finalScore,
    seed: state.seed,
    numericSeed: state.numericSeed,
    rngCalls: state.rngCalls,
    activityLog: structuredClone(state.activityLog),
    activeEffects: structuredClone(state.activeEffects),
    hand: structuredClone(state.hand),
    maxHandSize: state.maxHandSize,
    discardPile: structuredClone(state.discardPile),
    staffCards: structuredClone(state.staffCards),
    staffCardMarket: structuredClone(state.staffCardMarket),
    skipMarketCycleOnEndTurn: state.skipMarketCycleOnEndTurn,
    soldSlots: [...state.soldSlots],
    csvChecksum: CSV_CHECKSUM,
  };
}

/**
 * Migrates an old-format serialized state to the current schema.
 *
 * Handles:
 * - `market.business` → `market.development` rename
 * - Park cards with `family: 'business'` → `family: 'community-space'`
 * - Missing `communitySpace` deck/discard in old saves
 * - Missing `activeEffects` field (defaults to [])
 */
function migrateSerializedState(saved: Record<string, unknown>): void {
  // ── Market: rename business → development ────────────────
  const market = saved.market as Record<string, unknown> | undefined;
  if (market && 'business' in market && !('development' in market)) {
    market.development = market.business;
    delete market.business;
  }

  // ── Street grid: convert Park cards from business → community-space ──
  const grid = saved.streetGrid as Record<string, unknown>[] | undefined;
  if (grid) {
    for (const slot of grid) {
      if (slot && slot.family === 'business' && slot.name === 'Park') {
        slot.family = 'community-space';
      }
    }
  }

  // ── Development row cards: convert Park cards from business → community-space ──
  if (market) {
    const devCards = market.development as Record<string, unknown>[] | undefined;
    if (devCards) {
      for (const card of devCards) {
        if (card && card.family === 'business' && card.name === 'Park') {
          card.family = 'community-space';
        }
      }
    }
  }

  // ── Decks: add missing communitySpace deck ────────────────
  const decks = saved.decks as Record<string, unknown> | undefined;
  if (decks && !('communitySpace' in decks)) {
    decks.communitySpace = [];
  }

  // Convert Park cards in business deck from business → community-space
  if (decks) {
    const bizDeck = decks.business as Record<string, unknown>[] | undefined;
    if (bizDeck) {
      for (let i = bizDeck.length - 1; i >= 0; i--) {
        const card = bizDeck[i];
        if (card && card.family === 'business' && card.name === 'Park') {
          card.family = 'community-space';
          // Move to community space deck
          if (Array.isArray(decks.communitySpace)) {
            (decks.communitySpace as unknown[]).push(card);
          }
          bizDeck.splice(i, 1);
        }
      }
    }
  }

  // ── Discards: add missing communitySpace discard ──────────
  const discards = saved.discards as Record<string, unknown> | undefined;
  if (discards && !('communitySpace' in discards)) {
    discards.communitySpace = [];
  }

  // ── ActiveEffects: add missing activeEffects field ────────
  if (!('activeEffects' in saved)) {
    (saved as Record<string, unknown>).activeEffects = [];
  }

  // ── Hand management fields (Multi-Use Card Economy) ──────
  if (!('hand' in saved)) {
    (saved as Record<string, unknown>).hand = [];
  }
  if (!('maxHandSize' in saved)) {
    (saved as Record<string, unknown>).maxHandSize = 2;
  }
  if (!('discardPile' in saved)) {
    (saved as Record<string, unknown>).discardPile = [];
  }
  if (!('staffCards' in saved)) {
    (saved as Record<string, unknown>).staffCards = [];
  }
  if (!('staffCardMarket' in saved)) {
    (saved as Record<string, unknown>).staffCardMarket = [];
  }

  // ── skipMarketCycleOnEndTurn: add missing flag (defaults to false) ─
  if (!('skipMarketCycleOnEndTurn' in saved)) {
    (saved as Record<string, unknown>).skipMarketCycleOnEndTurn = false;
  }

  // ── csvChecksum: add missing field (defaults to '' for legacy saves) ─
  if (!('csvChecksum' in saved)) {
    (saved as Record<string, unknown>).csvChecksum = '';
  }

  // ── soldSlots: add missing field (defaults to all false for legacy saves) ─
  if (!('soldSlots' in saved)) {
    (saved as Record<string, unknown>).soldSlots = new Array<boolean>(GRID_SIZE).fill(false);
  }

  // ── currentIncome / currentReputationPerTurn: add missing fields for legacy saves ─
  // These fields were introduced by CG-0MRV84ZT60069PW6 (per-card incremental tracking).
  // Legacy saves won't have them. We leave them as undefined so the income phase
  // can detect them and fall back to computing from scratch. After any placement or
  // sale, the incremental update system will populate them correctly.
  // No explicit migration needed — undefined is the natural default.
}

/**
 * Rehydrates runtime state from a serialized checkpoint.
 */
export function deserializeMainStreetState(saved: MainStreetSerializedState): MainStreetState {
  migrateSerializedState(saved as unknown as Record<string, unknown>);

  const baseRng = createSeededRng(saved.numericSeed);
  for (let i = 0; i < saved.rngCalls; i++) {
    baseRng();
  }

  let rngCalls = saved.rngCalls;
  let state!: MainStreetState;
  const rng = (): number => {
    rngCalls += 1;
    state.rngCalls = rngCalls;
    return baseRng();
  };

  state = {
    config: structuredClone(saved.config),
    turn: saved.turn,
    phase: saved.phase,
    streetGrid: structuredClone(saved.streetGrid),
    market: structuredClone(saved.market),
    resourceBank: structuredClone(saved.resourceBank),
    ledger: createEconomyLedger({
      coins: saved.resourceBank.coins,
      reputation: saved.resourceBank.reputation,
      score: saved.finalScore,
    }),
    decks: structuredClone(saved.decks),
    discards: structuredClone(saved.discards),
    challengesCompleted: [...saved.challengesCompleted],
    activeChallenges: saved.activeChallenges.map((ac) => {
      const challenge = CHALLENGE_TEMPLATES.find((tpl) => tpl.id === ac.challengeId);
      if (!challenge) {
        throw new Error(`Unknown challenge id in save: ${ac.challengeId}`);
      }
      return {
        challenge,
        completed: ac.completed,
      };
    }),
    heldEvent: structuredClone(saved.heldEvent),
    incidentQueue: structuredClone(saved.incidentQueue),
    gameResult: saved.gameResult,
    endReason: saved.endReason,
    finalScore: saved.finalScore,
    seed: saved.seed,
    numericSeed: saved.numericSeed,
    rngCalls: saved.rngCalls,
    rng,
    activityLog: structuredClone(saved.activityLog),
    activeEffects: structuredClone(saved.activeEffects),
    hand: structuredClone(saved.hand),
    maxHandSize: saved.maxHandSize,
    discardPile: structuredClone(saved.discardPile),
    staffCards: structuredClone(saved.staffCards),
    staffCardMarket: structuredClone(saved.staffCardMarket),
    skipMarketCycleOnEndTurn: saved.skipMarketCycleOnEndTurn ?? false,
    soldSlots: saved.soldSlots ?? new Array<boolean>(GRID_SIZE).fill(false),
  };

  return state;
}
