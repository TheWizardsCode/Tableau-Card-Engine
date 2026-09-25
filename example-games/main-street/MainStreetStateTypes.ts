/**
 * Main Street: Game State Type Definitions
 *
 * All interfaces, type aliases, and enums describing Main Street game state:
 * activity log entries, day phases, market, resource bank, game result,
 * competitive state, the aggregate `MainStreetState`, serialized form, and
 * setup options. No runtime logic — types only.
 *
 * Import graph: imports card/engine/rule-engine types plus type-only imports
 * from sibling Main Street modules; no State runtime module imports.
 *
 * @module
 */

import type { StreetCameraState } from './MainStreetMapView';
import type { ActiveEffect } from '@core-engine';
import type { EconomyLedger } from '@rule-engine/EconomyLedger';
import type {
  BusinessCard,
  CommunitySpaceCard,
  EventCard,
  UpgradeCard,
  StaffCard,
  IncidentBalanceState,
} from './MainStreetCards';
import type { ActiveChallenge } from './MainStreetChallenges';
import type { GameConfig, DifficultyName } from './MainStreetDifficulty';

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
// ── Phase Types ─────────────────────────────────────────────

/**
 * The phases of a Main Street turn (simplified for walking skeleton).
 *
 * Single-player:
 *   WeekStart -> MarketPhase -> InvestmentResolution -> IncomePhase -> IncidentPhase -> EndCheck
 *   EndCheck -> WeekStart (next turn) | GameOver
 *
 * Competitive (CG-0MT5X3GMA007EG30 — Option A, shared day):
 *   MarketPhases ALTERNATE within the same shared day; the closing phases
 *   run ONCE after every active player has taken a MarketPhase. In code
 *   this is modelled as a per-day loop over PlayerRecord[] (N-player-ready;
 *   the current player is state.activePlayerId):
 *
 *            WeekStart
 *               |
 *       +-------+--------+
 *       |   activePlayerId = 0
 *       |   MarketPhase (player 0 acts, actionsRemaining consumed, may end)
 *       |   InvestmentResolution (per-owner if needed — sibling)
 *       +-------+--------+
 *               |  activePlayerId = 1 .. N-1 (repeat Market for each player)
 *       +-------+--------+
 *       |   MarketPhase (player 1) → ... → MarketPhase (player N-1)
 *       +-------+--------+
 *               |
 *           IncomePhase   (shared; per-owner income routed by slot owner)
 *           IncidentPhase (shared; face-down incidentDeck, shared balance)
 *           EndCheck      (shared; first-to-threshold — first player whose
 *                          per-owner score >= winThreshold wins; winnerId
 *                          stored as state.competitiveWinnerId; N=1 uses
 *                          the existing single-player end check)
 *               |
 *           WeekStart (next turn) | GameOver
 *
 * N=1 is identical to the legacy single-player sequence (one MarketPhase).
 * The shared day’s market/decks/incidentDeck remain single-owner and
 * unchanged (see createCompetitiveState). Diagrams here and in
 * MainStreetEngine.executeCompetitiveTurn are the canonical reference for
 * transition tests (tests/main-street/competitive-phase.test.ts).
 */
export type TurnPhase =
  | 'WeekStart'
  | 'MarketPhase'
  | 'InvestmentResolution'
  | 'IncomePhase'
  | 'IncidentPhase'
  | 'EndCheck';

/** All phases in order for the PhaseManager. */
export const PHASE_ORDER: readonly TurnPhase[] = [
  'WeekStart',
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
   * "1–2 business, 0–1 upgrade, 0–1 event, 0–1 staff" bounds (CG-0MT3KZNQB0053K55).
   * Community-space cards count as business for the composition.
   */
  cards: (BusinessCard | CommunitySpaceCard | UpgradeCard | EventCard | StaffCard)[];
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

/** Reason for game ending (or threshold continuation in endless mode). */
export type EndReason =
  | 'score_threshold'
  // Endless mode (CG-0MTIILU5V006GCN4): threshold reached but play continues
  // (`config.endlessMode === true`). `gameResult` stays `playing` while
  // `endReason` records that the threshold was crossed — winner-declared-
  // but-still-playing. Score keeps accruing and the game only ends via
  // the remaining conditions (bankruptcy, reputation collapse, all
  // challenges, turn limit).
  | 'score_threshold_continue'
  | 'all_challenges'
  | 'turn_limit_victory' // opt-in: only when a config sets maxTurns (CG-0MSLXJCHH001DLIO)
  | 'bankruptcy'
  | 'reputation_collapse'
  | 'turn_exhaustion' // opt-in: only when a config sets maxTurns (CG-0MSLXJCHH001DLIO)
  | null;

// ── Competitive State (CG-0MT5X3GMA007EG30) ─────────────────

/** Per-player record for competitive mode (N-player-ready). */
export interface PlayerRecord {
  /** Zero-based owner index; also the index into PlayerRecord[]. */
  playerId: number;
  /** Coins owned by this player. */
  coins: number;
  /** Reputation owned by this player. */
  reputation: number;
  /** Cards held in this player's hand. */
  hand: (BusinessCard | CommunitySpaceCard | EventCard | UpgradeCard)[];
  /** Active staff cards owned by this player. */
  staffCards: StaffCard[];
  /** Remaining actions this player can take this turn. */
  actionBudget: number;
  /** Computed score for this player (updated each EndCheck). */
  score: number;
}

/** A single street slot tagged with its owner. */
export interface OwnerTaggedSlot {
  /** Card occupying the slot, or null when empty. */
  card: BusinessCard | CommunitySpaceCard | null;
  /** Owner index of the occupying card, or null when empty/unowned. */
  ownerId: number | null;
}

/** Options for creating a competitive game. */
export interface CompetitiveStateOptions extends MainStreetSetupOptions {
  /** Number of players (N >= 1); each gets a PlayerRecord. Must be >= 1. */
  playerCount: number;
}

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
  /** Current calendar week (1–52). Chosen at setup from the allowed set (CG-0MTT0K9RX0004QTE). */
  week: number;
  /** Current calendar year (>=1). Increments when week wraps 52→1. */
  year: number;
  /** Current phase within the turn. */
  phase: TurnPhase;
  /**
   * The street grid — world-indexed flat array of world slots. Each street owns
   * its own ten plots, so the array is `worldSlotCount(cols,rows)` long
   * (see MainStreetAdjacency.worldSlotCount). For 1×1 this is the legacy
   * 10-slot linear grid. Indexed by world order, not per-street slot index;
   * use toWorldPosition/fromWorldPosition for mapping.
   */
  streetGrid: (BusinessCard | CommunitySpaceCard | null)[];
  /** World grid dimensions (cols × rows of 5×2 street cells). Null/omitted → 1×1 legacy (10 slots). Max 5×5. */
  streetGridCols: number;
  streetGridRows: number;
  /** Street-map camera state (zoom + pan). Serialised for checkpoint/save. */
  streetCamera: StreetCameraState;
  /** Face-up cards available for purchase. */
  market: MarketState;
  /** Player resources. */
  resourceBank: ResourceBank;
  /** Shared EconomyLedger for resource mutation (synced with resourceBank). */
  ledger: EconomyLedger;
  /**
   * Coins at the start of the current turn (day-start snapshot). Used to
   * compute the per-turn net summary row in the activity log; must survive
   * save/load so the resumed turn's net is computed against the snapshot
   * taken when the turn began (CG-0MT5W7UJJ0065MEZ AC3).
   */
  weekStartCoins: number;
  /** Reputation at the start of the current turn (day-start snapshot). */
  weekStartRep: number;
  /** Score at the start of the current turn (day-start snapshot). */
  weekStartScore: number;
  /** Remaining cards in each deck (draw from end = top). */
  decks: {
    business: BusinessCard[];
    communitySpace: CommunitySpaceCard[];
    event: EventCard[];
    upgrade: UpgradeCard[];
    /** Staff cards pool, drawn into the market row like other families (CG-0MT3KZNQB0053K55). */
    staff: StaffCard[];
  };
  /** Discard piles for each deck (cards removed from markets are placed here). */
  discards: {
    business: BusinessCard[];
    communitySpace: CommunitySpaceCard[];
    event: EventCard[];
    upgrade: UpgradeCard[];
    /** Laid-off/cycled staff cards, available again on next refill (CG-0MT3KZNQB0053K55). */
    staff: StaffCard[];
  };
  /** IDs of completed challenges. */
  challengesCompleted: string[];
  /**
   * Active challenges for this run. Evaluated after **every** action
   * (CG-0MU37CKRR008252I), with the end-of-turn EndCheck retained as a safety
   * net for completions caused by the closing phases (Income / Incident).
   */
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
  /**
   * Tracks which street grid slots have been sold. Length = GRID_SIZE.
   * true = card in this slot has been sold (no income/reputation for itself,
   * but still acts as a synergy anchor — its neighbours retain synergy bonuses
   * and same-type penalties as if the card were active).
   * false = card is active (default).
   */
  soldSlots: boolean[];
  /**
   * Remaining actions the player can take this turn.
   * Resets at WeekStart to 1 + sum(actionsPerTurn for employed staff) + bankedActions.
   */
  actionsRemaining: number;
  /**
   * Unused base actions banked from previous days (capped at 2).
   * Composed into the daily budget at WeekStart. Staff-derived actions
   * (e.g. General Manager +1) are never banked — only the base action
   * banks each day. (CG-0MT3IOPZB005LNAR)
   */
  bankedActions: number;
  /**
   * Staff peek gate (CG-0MSXOW6GN008ZSMN): whether the once-per-turn peek
   * at the top of the incident deck has already been used this turn.
   * Reset to false at WeekStart.
   */
  peekUsedThisTurn: boolean;
  /**
   * Staff peek skill (CG-0MSXOW6GN008ZSMN): the top incident-deck card
   * revealed by the most recent peek action. The scene reads it to render
   * the face-up reveal, then clears it. Null when no peek is pending.
   * Never resolved — the card stays on top of the face-down deck.
   */
  revealedPeekedCard: EventCard | null;
  /**
   * Community Favour gate (CG-0MSTOATDQ005XDET): whether the once-per-turn
   * resource exchange has already been used this turn.
   * Reset to false at WeekStart.
   */
  favourUsedThisTurn: boolean;
  /**
   * Same-week Investment event composite (CG-0MTFWBNL30043ZBM): ID of the
   * event card just moved from the market to hand this week. Playing that
   * same card later this week is free (move+play = 1 action total). Cleared
   * at WeekStart / after play / on undo.
   */
  justMovedEventCardId: string | null;
  /**
   * Tracks the upgrade card moved to hand this turn for same-week composite
   * detection (CG-0MT3IYSRL001VVUP). When an upgrade is moved to hand via
   * `move-to-hand`, this is set to its cardId; `play-upgrade-from-hand` then
   * checks if the playing card matches — if so, the action is free (no
   * additional action consumed). Cleared after the composite play or on
   * WeekStart.
   */
  justMovedUpgradeCardId?: string | null;
  /**
   * Whether a business or community-space card has been placed onto the
   * street grid this turn (CG-0MTIOCBH400970OB). Gates `evt-grand-opening`
   * (Grand Opening Sale) play: the event can only be played from hand on a
   * turn where a business was placed. Set to true whenever a card is
   * placed on `streetGrid` (via `purchaseBusiness`, `playBusinessFromHand`,
   * or `buyAndPlaceBusiness`); reset to false at `WeekStart`.
   */
  businessPlacedThisTurn?: boolean;
  // ── Competitive mode (CG-0MT5X3GMA007EG30) ─────────────────
  /** Per-player records; undefined in single-player mode. */
  players?: PlayerRecord[] | null;
  /** Owner-tagged street grid; undefined in single-player mode. */
  ownerTaggedGrid?: OwnerTaggedSlot[];
  /** Number of players; 1 in single-player mode is implicit when players is undefined. */
  playerCount?: number;
  /** Active player within the shared day (index into players[]). 0 in single-player. */
  activePlayerId?: number | null;
  /** Winning player in competitive mode (first-to-threshold). null while playing or in single-player. */
  competitiveWinnerId?: number | null;
  /**
   * Pending staff applicant for the current day (CG-0MSTOATDU006UGAX).
   * Populated during WeekStart when the applicant trigger fires and a business
   * has a free employment slot. The scene renders the applicant overlay and
   * resolves it via hireStaffApplicant or declineStaffApplicant.
   * Cleared on hire, decline, or at the next WeekStart.
   */
  pendingApplicant: PendingApplicant | null;
  /** Suppresses the staff-applicant trigger at WeekStart (CG-0MSTOATDU006UGAX: tutorial/headless). */
  suppressApplicant?: boolean;
  /**
   * Dev-only: forces a staff applicant to appear every day start, bypassing
   * the RNG roll (CG-0MTY9PB51008OG5A). Must still satisfy the eligible-
   * business constraint. Not serialized in save/load.
   */
  forcedStaffApplicant?: boolean;
  /**
   * Pending dual-choice incident event (CG-0MTSHG8RP008E128).
   *
   * Populated when `resolveIncident()` draws an incident whose card has
   * `hasChoices: true`. The event's effect is DEFERRED — `resolveIncident`
   * returns null and `processEndOfTurn` pauses before EndCheck with
   * `TurnResult.choicePending === true`. The scene presents the Accept/Reject
   * dialog and resolves via {@link resolveEventChoice} (typed field per
   * producer decision 2026-09-08 Q3 — NOT the `(state as any)` precedent).
   *
   * Cleared when the choice is resolved and the deferred closing phases run.
   * Serialized/restored by save/load so an unresolved choice survives a save.
   */
  pendingEventChoice: PendingEventChoice | null;
  /**
   * Transient buffer of challenge IDs completed by the most recent
   * per-action evaluation (CG-0MU37CKRR008252I). Reset to `[]` at the start
   * of every `executeAction` call and populated by
   * `evaluateChallengesAfterAction`. The interactive scene reads it to fire
   * immediate celebration VFX/SFX; the closing EndCheck skips challenges
   * already flagged completed, so nothing is reported twice. Never
   * serialized (transient presentation state).
   */
  _newlyCompletedThisAction?: string[];
}

/**
 * A staff applicant triggered at WeekStart, awaiting the player's hire or
 * decline decision (CG-0MSTOATDU006UGAX).
 */
export interface PendingApplicant {
  /** The staff card template offered to the player. */
  card: StaffCard;
  /** Street-grid slot index where the business has a free employment slot. */
  targetSlotIndex: number;
}

/**
 * A dual-choice incident event awaiting the player's Accept / Reject decision
 * (CG-0MTSHG8RP008E128). Stored as a typed field on `MainStreetState`
 * (`pendingEventChoice`) so it survives save/load and undo of the choice.
 */
export interface PendingEventChoice {
  /** The choice event drawn from the incident deck (effect deferred). */
  event: EventCard;
  /** The player's decision, once made; null while the dialog is showing. */
  chosenOption: null | 'accept' | 'reject';
  /** False while the dialog is pending; true after the choice is applied. */
  resolved: boolean;
}

export interface MainStreetSerializedState {
  config: GameConfig;
  turn: number;
  week: number;
  year: number;
  phase: TurnPhase;
  streetGrid: (BusinessCard | CommunitySpaceCard | null)[];
  /** World grid dimensions for save/load (see MainStreetState). */
  streetGridCols: number;
  streetGridRows: number;
  /** Street-map camera state (zoom + pan). Defaults to {zoomLevel:1, focusX:0, focusY:0} for legacy. */
  streetCamera: StreetCameraState;
  market: MarketState;
  resourceBank: ResourceBank;
  /** Day-start coin snapshot for the per-turn net summary row (see MainStreetState). */
  weekStartCoins: number;
  /** Day-start reputation snapshot for the per-turn net summary row. */
  weekStartRep: number;
  /** Day-start score snapshot for the per-turn net summary row. */
  weekStartScore: number;
  decks: {
    business: BusinessCard[];
    communitySpace: CommunitySpaceCard[];
    event: EventCard[];
    upgrade: UpgradeCard[];
    staff: StaffCard[];
  };
  /** Discard piles snapshot (for save/restore) */
  discards: {
    business: BusinessCard[];
    communitySpace: CommunitySpaceCard[];
    event: EventCard[];
    upgrade: UpgradeCard[];
    staff: StaffCard[];
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
  /** Unused base actions banked from previous days (capped at 2). */
  bankedActions: number;
  /** Whether the once-per-turn staff peek has been used this turn. */
  peekUsedThisTurn: boolean;
  /** Top incident-deck card revealed by the most recent peek (null = none). */
  revealedPeekedCard: EventCard | null;
  /** Whether the once-per-turn Community Favour exchange has been used this turn. */
  favourUsedThisTurn: boolean;
  /** Same-week Investment event composite (CG-0MTFWBNL30043ZBM). */
  justMovedEventCardId: string | null;
  /**
   * Same-week upgrade composite tracking (CG-0MT3IYSRL001VVUP): cardId of
   * the upgrade just moved to hand this turn. `play-upgrade-from-hand`
   * checks this to decide whether the play is free.
   */
  justMovedUpgradeCardId?: string | null;
  /** Whether a business has been placed onto the street grid this turn (CG-0MTIOCBH400970OB). Gates Grand Opening Sale. */
  businessPlacedThisTurn?: boolean;
  // ── Competitive (CG-0MT5X3GMA007EG30) ───────────────────────
  /** Per-player records; undefined in single-player saves. */
  players?: PlayerRecord[] | null;
  /** Owner-tagged street grid; undefined in single-player saves. */
  ownerTaggedGrid?: OwnerTaggedSlot[];
  /** Number of players; undefined in single-player saves. */
  playerCount?: number;
  /** Active player within the shared day (index into players[]). */
  activePlayerId?: number | null;
  /** Winning player in competitive mode (first-to-threshold). */
  competitiveWinnerId?: number | null;
  /** Pending staff applicant for the current day (CG-0MSTOATDU006UGAX). */
  pendingApplicant: PendingApplicant | null;
  /** Pending dual-choice incident event awaiting Accept/Reject (CG-0MTSHG8RP008E128). */
  pendingEventChoice: PendingEventChoice | null;
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
  /**
   * Endless continuation beyond the win threshold (CG-0MTIILU5V006GCN4).
   *
   * When true, reaching `config.winThreshold` does NOT end the game.
   * The engine sets `endReason` to `score_threshold_continue` but keeps
   * `gameResult` as `playing` so the player can continue building.
   * Default: `false` (existing behaviour — threshold ends the game).
   * Overrides `config.endlessMode` from the difficulty preset when set.
   */
  endlessMode?: boolean;
}

