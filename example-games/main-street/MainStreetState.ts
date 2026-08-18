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
  CARD_DATA_RAW,
  GRID_SIZE,
  MARKET_TOTAL_SLOTS,
  MARKET_BUSINESS_MIN,
  MARKET_BUSINESS_MAX,
  MARKET_UPGRADE_MAX,
  MARKET_EVENT_MAX,
  loadTemplatesFromCsv,
  resetTemplatesToDefault,
  type IncidentBalanceState,
  createIncidentBalanceState,
  createIncidentBalanceFromQueue,
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

/** The face-up cards available for purchase (single-row market). */
export interface MarketState {
  /**
   * Single-row marketplace: exactly `MARKET_TOTAL_SLOTS` (3) cards,
   * always at least `MARKET_BUSINESS_MIN` business card, drawn within
   * "1–2 business, 0–1 upgrade, 0–1 event" bounds (CG-0MSTOATDT009BRX2).
   * Community-space cards count as business for the composition.
   */
  cards: (BusinessCard | CommunitySpaceCard | UpgradeCard | EventCard)[];
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
  | 'turn_limit_victory' // opt-in: only when a config sets maxTurns (CG-0MSLXJCHH001DLIO)
  | 'bankruptcy'
  | 'reputation_collapse'
  | 'turn_exhaustion' // opt-in: only when a config sets maxTurns (CG-0MSLXJCHH001DLIO)
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
  /**
   * Current turn number (1-based). Unbounded unless `config.maxTurns` is
   * explicitly set (default presets impose no turn limit —
   * CG-0MSLXJCHH001DLIO).
   */
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
  /** Face-down incident deck: cards are popped from the top (end of array) at end-of-turn. */
  incidentDeck: EventCard[];
  /**
   * Runtime-mutable incident-draw balance: repeat-spacing window, streak
   * limit, and the recent-draw history needed to enforce them. Limits can be
   * adjusted mid-session via `setIncidentBalanceLimits`; changes affect
   * subsequent draws only.
   */
  incidentBalance: IncidentBalanceState;
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
  /** Cards held in the player's hand (not placed on tableau). Any mix of business, event, and upgrade cards. */
  hand: (BusinessCard | CommunitySpaceCard | EventCard | UpgradeCard)[];
  /** Maximum number of cards the player can hold in hand (default 3, expanded by staff cards). */
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
  /**
   * Remaining actions the player can take this turn.
   * Resets at DayStart to 1 + sum(actionsPerTurn for employed staff).
   */
  actionsRemaining: number;
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
  /** Face-down incident deck at the time of save (migrated from old incidentQueue by the loader). */
  incidentDeck: EventCard[];
  /** Incident-draw balance limits + recent-draw history (see MainStreetState). */
  incidentBalance: IncidentBalanceState;
  gameResult: GameResult;
  endReason: EndReason;
  finalScore: number;
  seed: string;
  numericSeed: number;
  rngCalls: number;
  activityLog: LogEntry[];
  activeEffects: ActiveEffect[];
  /** Serialized hand cards (any mix of business, event, and upgrade cards). */
  hand: (BusinessCard | CommunitySpaceCard | EventCard | UpgradeCard)[];
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
   * Raw content of the card-data.csv at the time this save was created.
   * Stored as a raw string so that if the game's card-data.csv changes
   * between save and load, the original CSV data can be recovered and
   * used to reconstruct card templates that match the saved state.
   * Empty string indicates a legacy save before this field was added.
   */
  csvData: string;
  /**
   * Tracks which street grid slots have been sold. Length = GRID_SIZE.
   * true = card in this slot has been sold (non-functional).
   */
  soldSlots: boolean[];
  /** Remaining actions the player can take this turn. */
  actionsRemaining: number;
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
 * When a draw/refill needs cards and the deck is empty but the matching
 * discard pile is non-empty, shuffle the discard into the deck using the
 * game's seeded RNG and continue (existing reshuffle convention).
 */
function reshuffleIfNeeded<T>(state: MainStreetState, deck: T[], discard: T[], name: string): void {
  if (deck.length === 0 && discard.length > 0) {
    shuffleArray(discard, state.rng);
    while (discard.length > 0) {
      deck.push(discard.pop()!);
    }
    addLog(state, `Reshuffled ${name} discard into deck`, 'neutral');
  }
}

/**
 * Force-reshuffles the discard pile into the deck regardless of whether the
 * deck is empty. Used when the deck still holds cards but none of the
 * required trigger type (e.g. only Incident cards remain when we need an
 * Investment-trigger event).
 */
function forceReshuffleFromDiscards<T>(state: MainStreetState, deck: T[], discard: T[], name: string): void {
  if (discard.length > 0) {
    shuffleArray(discard, state.rng);
    while (discard.length > 0) {
      deck.push(discard.pop()!);
    }
    addLog(state, `Reshuffled ${name} discard into deck`, 'neutral');
  }
}

/**
 * Refills `state.market.cards` toward the single-row target composition
 * (CG-0MSTOATDT009BRX2):
 *   - at most `MARKET_TOTAL_SLOTS` (3) cards;
 *   - always ≥ `MARKET_BUSINESS_MIN` (1) business card (community-space
 *     counts as business) while any business remains drawable;
 *   - each missing slot is drawn randomly within the bounds
 *     "1–2 business, 0–1 upgrade, 0–1 event" — i.e. a full row is one of
 *     2B+1U, 2B+1E, 1B+1U+1E;
 *   - subject to deck availability and existing reshuffle conventions
 *     (empty decks reshuffle matching discards; Investment-trigger events
 *     are sought in the event deck like the legacy investments row).
 *
 * Visible cards are PRESERVED (top-up semantics), which mirrors the legacy
 * day-start refill behaviour relied on by the tutorial's
 * `skipMarketCycleOnEndTurn` flow (scenario-placed market cards survive into
 * the next day). Callers that want a full re-draw must clear the row first
 * (refreshMarket discards + clears; cycleMarketCards empties the row).
 *
 * @param state Current game state (mutated in-place).
 */
export function refillSingleRowMarket(state: MainStreetState): void {
  const { market, decks } = state;

  // Combined business + community-space pool (community-space counts as business).
  reshuffleIfNeeded(state, decks.business, state.discards.business, 'business');
  reshuffleIfNeeded(state, decks.communitySpace, state.discards.communitySpace, 'community-space');
  const businessPool: (BusinessCard | CommunitySpaceCard)[] = [];
  while (decks.business.length > 0) businessPool.push(decks.business.pop()!);
  while (decks.communitySpace.length > 0) businessPool.push(decks.communitySpace.pop()!);
  shuffleArray(businessPool, state.rng);

  // Replenish decks for the non-business families, as needed by the draws below.
  reshuffleIfNeeded(state, decks.upgrade, state.discards.upgrade, 'upgrade');
  reshuffleIfNeeded(state, decks.event, state.discards.event, 'event');

  const drawBusiness = (): boolean => {
    const card = businessPool.pop();
    if (!card) return false;
    market.cards.push(card);
    return true;
  };
  const drawUpgrade = (): boolean => {
    const card = decks.upgrade.pop();
    if (!card) return false;
    market.cards.push(card);
    return true;
  };
  const drawEvent = (): boolean => {
    let idx = decks.event.findIndex(e => e.trigger === 'Investment');
    if (idx === -1) {
      forceReshuffleFromDiscards(state, decks.event, state.discards.event, 'event');
      idx = decks.event.findIndex(e => e.trigger === 'Investment');
    }
    if (idx === -1) return false;
    market.cards.push(decks.event.splice(idx, 1)[0]);
    return true;
  };

  while (market.cards.length < MARKET_TOTAL_SLOTS) {
    const businessCount = market.cards.filter(
      c => c.family === 'business' || c.family === 'community-space',
    ).length;
    const upgradeCount = market.cards.filter(c => c.family === 'upgrade').length;
    const eventCount = market.cards.filter(c => c.family === 'event').length;

    // The ≥1-business rule is absolute: with no business visible, only a
    // business may be drawn next.
    if (businessCount < MARKET_BUSINESS_MIN) {
      if (!drawBusiness()) break;
      continue;
    }

    // Otherwise pick a random family among the legal options within bounds.
    // A pick that fails (e.g. no Investment events left) is retried against
    // the remaining legal options instead of aborting the whole refill.
    let picked = false;
    const legal: (() => boolean)[] = [];
    if (businessCount < MARKET_BUSINESS_MAX) legal.push(drawBusiness);
    if (upgradeCount < MARKET_UPGRADE_MAX && decks.upgrade.length > 0) legal.push(drawUpgrade);
    if (eventCount < MARKET_EVENT_MAX) legal.push(drawEvent);
    while (legal.length > 0) {
      const idx = Math.floor(state.rng() * legal.length);
      const fn = legal.splice(idx, 1)[0];
      if (fn()) {
        picked = true;
        break;
      }
    }
    if (!picked) {
      // Every legal option failed (deck exhaustion elsewhere): fall back to
      // any business remaining, then give up.
      if (!drawBusiness()) break;
    }
  }

  // Return any un-drawn business cards to their respective decks.
  for (const card of businessPool) {
    if (card.family === 'business') {
      decks.business.push(card as BusinessCard);
    } else {
      decks.communitySpace.push(card as CommunitySpaceCard);
    }
  }
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
  // Ensure templates use the bundled CSV data (reset any previous saved-CSV override)
  resetTemplatesToDefault();

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

  // Populate initial market — single-row marketplace (CG-0MSTOATDT009BRX2):
  // exactly 3 cards, always ≥1 business, random within 1–2B/0–1U/0–1E.
  // The row is refilled via refillSingleRowMarket after the state object is
  // assembled (it needs state.rng / decks / discards wired up).
  const market: MarketState = { cards: [] };

  // Build the face-down incident deck: move every Incident-trigger card from
  // the seeded event deck into `incidentDeck` (front = next to resolve). The
  // remaining Investment-trigger cards stay in the event deck for the market.
  // Deck order is deterministic (same seed ⇒ same shuffle ⇒ same deck); the
  // constraint-aware ordering (repeat spacing / streak) is applied at deck
  // build/reshuffle time by orderIncidentDeck (CG-0MSXOVQFL007G3VH).
  // Incident-draw balance limits come from the difficulty preset's config
  // (per-difficulty tuning, CG-0MSL0OU1E005WFJB). Configs that omit the
  // fields (legacy saves) fall back to the engine defaults N=3, M=2 via ??
  // in createIncidentBalanceState.
  const incidentBalance = createIncidentBalanceState({
    repeatSpacing: config.incidentRepeatSpacing,
    maxStreak: config.incidentMaxStreak,
  });
  const incidentDeck: EventCard[] = [];
  const remainingEventCards: EventCard[] = [];
  for (const card of eventDeck) {
    if (card.trigger === 'Incident') {
      incidentDeck.push(card);
    } else {
      remainingEventCards.push(card);
    }
  }
  eventDeck.length = 0;
  eventDeck.push(...remainingEventCards);

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
    incidentDeck,
    incidentBalance,
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
    maxHandSize: 3,
    discardPile: [],
    staffCards: [],
    staffCardMarket: staffDeck,
    skipMarketCycleOnEndTurn: false,
    soldSlots: new Array<boolean>(GRID_SIZE).fill(false),
    actionsRemaining: 1,
  };

  // Refill the single-row market with its initial composition.
  refillSingleRowMarket(state);

  // Select challenges for this run using seeded RNG and config count
  const selectedChallenges = selectChallenges(CHALLENGE_TEMPLATES, config.challengesPerRun, rng);
  state.activeChallenges = selectedChallenges.map(ch => ({
    challenge: ch,
    completed: false,
  }));

  return state;
}

/**
 * Live mid-session hook to adjust the incident-draw balance limits.
 *
 * Changes take effect on all subsequent constrained incident draws (refills,
 * reshuffle paths); the currently-visible queue is left untouched. This is
 * the runtime-manipulation interface for designers/balancers — difficulty
 * presets wire values here in a follow-up work item (CG-0MSL0OU1E005WFJB).
 *
 * @param state   Current game state (mutated in place).
 * @param limits  Partial limits to update: `repeatSpacing` (N) and/or `maxStreak` (M).
 * @throws Error if a provided limit is not an integer >= 1.
 */
export function setIncidentBalanceLimits(
  state: MainStreetState,
  limits: Partial<Pick<IncidentBalanceState, 'repeatSpacing' | 'maxStreak'>>,
): void {
  if (limits.repeatSpacing !== undefined) {
    if (!Number.isInteger(limits.repeatSpacing) || limits.repeatSpacing < 1) {
      throw new Error(
        `repeatSpacing must be an integer >= 1, got ${limits.repeatSpacing}`,
      );
    }
    state.incidentBalance.repeatSpacing = limits.repeatSpacing;
  }
  if (limits.maxStreak !== undefined) {
    if (!Number.isInteger(limits.maxStreak) || limits.maxStreak < 1) {
      throw new Error(
        `maxStreak must be an integer >= 1, got ${limits.maxStreak}`,
      );
    }
    state.incidentBalance.maxStreak = limits.maxStreak;
  }
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
    incidentDeck: structuredClone(state.incidentDeck),
    incidentBalance: structuredClone(state.incidentBalance),
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
    csvData: CARD_DATA_RAW,
    actionsRemaining: state.actionsRemaining,
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

  // ── Market: merge two-row development + investments into single row ──
  // (CG-0MSTOATDT009BRX2). Old saves carry `market.development` (up to 4
  // business/community-space cards) and `market.investments` (up to 3
  // upgrades/events). The new market is one `cards` row of up to
  // `MARKET_TOTAL_SLOTS` (3). Merge with business cards first (priority for
  // the ≥1-business rule) and trim to the new row size.
  if (market && !('cards' in market)) {
    const devCards = (market.development as unknown[] | undefined) ?? [];
    const invCards = (market.investments as unknown[] | undefined) ?? [];
    const merged = [...devCards, ...invCards].slice(0, MARKET_TOTAL_SLOTS);
    market.cards = merged;
    delete market.development;
    delete market.investments;
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
  const marketCards = (market?.cards as Record<string, unknown>[] | undefined) ?? [];
  if (marketCards) {
    for (const card of marketCards) {
      if (card && card.family === 'business' && card.name === 'Park') {
        card.family = 'community-space';
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

  // ── Held event → hand merge (CG-0MSKU0BE5003I2ZD) ────────
  // Legacy saves stored the held Investment event separately in `heldEvent`.
  // The merged hand model folds it into `hand` alongside business cards.
  if ('heldEvent' in saved) {
    const held = (saved as Record<string, unknown>).heldEvent as Record<string, unknown> | null | undefined;
    delete (saved as Record<string, unknown>).heldEvent;
    if (held && typeof held === 'object') {
      const handArr = saved.hand as unknown[] | undefined;
      if (Array.isArray(handArr)) {
        handArr.push(held);
      } else {
        (saved as Record<string, unknown>).hand = [held];
      }
    }
  }
  if (!('maxHandSize' in saved)) {
    (saved as Record<string, unknown>).maxHandSize = 3;
  } else {
    // Base hand grew 2 → 3 (CG-0MSTOATDT009BRX2). Bump legacy base-2 saves;
    // grown values (> 2, from staff `handSlotsAdded`) are preserved as-is.
    const existing = (saved as { maxHandSize: number }).maxHandSize;
    if (typeof existing === 'number' && existing <= 2) {
      (saved as Record<string, unknown>).maxHandSize = 3;
    }
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

  // ── csvData: add missing field (defaults to '' for legacy saves) ─
  if (!('csvData' in saved)) {
    (saved as Record<string, unknown>).csvData = '';
  }

  // ── soldSlots: add missing field (defaults to all false for legacy saves) ─
  if (!('soldSlots' in saved)) {
    (saved as Record<string, unknown>).soldSlots = new Array<boolean>(GRID_SIZE).fill(false);
  }

  // ── actionsRemaining: backfill default for legacy saves ──
  if (!('actionsRemaining' in saved)) {
    (saved as Record<string, unknown>).actionsRemaining = 1;
  }

  // ── incidentBalance (CG-0MSL0OP040043KKZ): backfill from the queue for ──
  // legacy saves that predate the balance state. The queue cards are recorded
  // in draw order so subsequent constrained draws see the actual sequence.
  if (!('incidentBalance' in saved)) {
    const queue = (saved.incidentQueue as EventCard[] | undefined) ?? [];
    (saved as Record<string, unknown>).incidentBalance = createIncidentBalanceFromQueue(queue);
  }

  // ── incidentQueue → incidentDeck (CG-0MSTOATDP000JNHH) ──────────
  // Old saves stored up to 2 pre-drawn Incident cards in `incidentQueue`
  // (front = next to resolve) with the remaining incidents still in the
  // event deck. The new model is a single face-down `incidentDeck`: the
  // queue cards first (they are the next to resolve), then the remaining
  // Incident-trigger cards from the event deck in their existing order.
  // Incident cards are removed from the event deck — they now live solely
  // in the incident deck.
  if ('incidentQueue' in saved && !('incidentDeck' in saved)) {
    const queue = (saved.incidentQueue as EventCard[] | undefined) ?? [];
    delete (saved as Record<string, unknown>).incidentQueue;
    const eventDeck = (saved.decks as Record<string, unknown> | undefined)?.event as EventCard[] | undefined;
    const remainingIncidents: EventCard[] = [];
    const remainingEvents: EventCard[] = [];
    for (const card of eventDeck ?? []) {
      if (card.trigger === 'Incident') remainingIncidents.push(card);
      else remainingEvents.push(card);
    }
    if (eventDeck) {
      eventDeck.length = 0;
      eventDeck.push(...remainingEvents);
    }
    (saved as Record<string, unknown>).incidentDeck = [...queue, ...remainingIncidents];
  }

  // ── currentIncome / currentReputationPerTurn: add missing fields for legacy saves ─
  // These fields were introduced by CG-0MRV84ZT60069PW6 (per-card incremental tracking).
  // Legacy saves won't have them. We leave them as undefined so the income phase
  // can detect them and fall back to computing from scratch. After any placement or
  // sale, the incremental update system will populate them correctly.
  // No explicit migration needed — undefined is the natural default.

  // ── ongoingCost: default to 0 for legacy community-space cards ─
  // Added by CG-0MRXYGM9B006I3PE (community-space ongoing costs). Community space
  // cards serialized before this field existed must default to 0 so the income
  // phase never deducts a cost from cards that never had one.
  const csCardLocations: unknown[][] = [];
  if (grid) csCardLocations.push(grid);
  if (marketCards) csCardLocations.push(marketCards);
  if (decks) {
    const csDeck = decks.communitySpace as unknown[] | undefined;
    if (csDeck) csCardLocations.push(csDeck);
    const bizDeck = decks.business as unknown[] | undefined;
    if (bizDeck) csCardLocations.push(bizDeck);
  }
  if (discards) {
    const csDiscard = discards.communitySpace as unknown[] | undefined;
    if (csDiscard) csCardLocations.push(csDiscard);
  }
  const handArr = saved.hand as unknown[] | undefined;
  if (handArr) csCardLocations.push(handArr);
  for (const arr of csCardLocations) {
    for (const card of arr) {
      if (
        card &&
        typeof card === 'object' &&
        (card as { family?: unknown }).family === 'community-space' &&
        !('ongoingCost' in (card as Record<string, unknown>))
      ) {
        (card as Record<string, unknown>).ongoingCost = 0;
      }
    }
  }
}

/**
 * Rehydrates runtime state from a serialized checkpoint.
 */
export function deserializeMainStreetState(saved: MainStreetSerializedState): MainStreetState {
  migrateSerializedState(saved as unknown as Record<string, unknown>);

  // ── CSV mismatch detection ────────────────────────────────
  // If the saved checkpoint was created with a different card-data.csv,
  // detect the mismatch and either use the embedded CSV data or reject
  // legacy saves that lack it.
  if (saved.csvChecksum && saved.csvChecksum !== CSV_CHECKSUM) {
    if (saved.csvData && saved.csvData.length > 0) {
      // Use the saved CSV data to reconstruct card templates
      loadTemplatesFromCsv(saved.csvData);
    } else {
      // Legacy save without embedded CSV data — reject gracefully
      throw new Error(
        'This saved state was created with a different version of card-data.csv ' +
        'and does not include the embedded card data required for compatibility. ' +
        'Starting a fresh game instead.',
      );
    }
  }

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
    incidentDeck: structuredClone(saved.incidentDeck),
    incidentBalance: saved.incidentBalance
      ? structuredClone(saved.incidentBalance)
      // New-format saves always carry incidentBalance; this fallback only
      // fires for malformed saves. History tracks the RESOLVED sequence, so
      // a fresh (empty) balance is correct — never backfill from the deck.
      : createIncidentBalanceState({}),
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
    actionsRemaining: saved.actionsRemaining ?? 1,
  };

  return state;
}
