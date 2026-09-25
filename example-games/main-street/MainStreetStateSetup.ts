/**
 * Main Street: Game Setup and Seed Helpers
 *
 * Deterministic state construction (seeded RNG, start-week roll, decks,
 * market refill), competitive-state creation, incident-balance limits, and
 * street-grid lattice configuration.
 *
 * Import graph: depends on `MainStreetStateTypes` (+ card/difficulty/challenge
 * runtime helpers). Must not import `MainStreetStateSerialize` (avoid cycles).
 *
 * @module
 */

import { shuffleArray } from '@card-system';
import { createSeededRng } from '@core-engine';
import { createEconomyLedger } from '@rule-engine/EconomyLedger';
import {
  type BusinessCard,
  type CommunitySpaceCard,
  type EventCard,
  createBusinessDeck,
  createCommunitySpaceDeck,
  createEventDeck,
  createUpgradeDeck,
  createStaffDeck,
  GRID_SIZE,
  worldWidth,
  worldHeight,
  MARKET_TOTAL_SLOTS,
  MARKET_BUSINESS_MIN,
  MARKET_BUSINESS_MAX,
  MARKET_UPGRADE_MAX,
  MARKET_EVENT_MAX,
  MARKET_STAFF_MAX,
  createIncidentBalanceState,
  isCardAvailableInWeek,
  resetTemplatesToDefault,
  type IncidentBalanceState,
} from './MainStreetCards';
import { CHALLENGE_TEMPLATES, selectChallenges } from './MainStreetChallenges';
import { assignStaffApplicantSkills } from './MainStreetStaffSkills';
import { getPreset } from './MainStreetDifficulty';
import type {
  MainStreetState,
  MainStreetSetupOptions,
  MarketState,
  CompetitiveStateOptions,
  PlayerRecord,
  OwnerTaggedSlot,
} from './MainStreetStateTypes';
import { addLog } from './MainStreetStateLog';

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
 * Allowed starting weeks for a new game (CG-0MTT0K9RX0004QTE).
 * Drawn uniformly at setup via the game's seeded RNG.
 */
export const ALLOWED_START_WEEKS: readonly number[] = [
  1, 2, 3, 4, 5, 6, 7, 8, 16, 17, 18, 19, 20, 21, 22, 23, 24, 40, 41, 42, 43, 44, 45, 46,
] as const;

/**
 * Rolls a start week from the allowed set using the game's seeded RNG.
 * Consumes exactly one RNG call.
 */
export function rollStartWeek(rng: () => number): number {
  const idx = Math.floor(rng() * ALLOWED_START_WEEKS.length);
  return ALLOWED_START_WEEKS[idx];
}

/**
 * Advances the calendar by one week (wraps 52→1, increments year on wrap).
 */
export function advanceWeek(state: MainStreetState): void {
  if (state.week >= 52) {
    state.week = 1;
    state.year += 1;
  } else {
    state.week += 1;
  }
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
 *     "1–2 business, 0–1 upgrade, 0–1 event, 0–1 staff" (CG-0MT3KZNQB0053K55)
 *     — i.e. a full row is one of 2B+1U, 2B+1E, 1B+1U+1E, or a row with one
 *     staff card replacing the non-business slot;
 *   - subject to deck availability and existing reshuffle conventions
 *     (empty decks reshuffle matching discards — staff included; Investment-trigger events
 *     are sought in the event deck like the legacy investments row).
 *
 * Visible cards are PRESERVED (top-up semantics), so scenario-placed market
 * cards survive into the next week. Callers that want a full re-draw must clear
 * the row first (refreshMarket discards + clears; cycleMarketCards empties the row).
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
  reshuffleIfNeeded(state, decks.staff, state.discards.staff, 'staff');

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
  // Week-gated Investment offers (CG-0MTT0K9RX0004QTE / F3): a seasonal
  // Investment event is only offerable when the current `state.week` falls
  // within its declared window. Cards without a window stay year-round.
  const isOfferableInvestment = (e: EventCard): boolean =>
    e.trigger === 'Investment' && isCardAvailableInWeek(e, state.week);

  const drawEvent = (): boolean => {
    let idx = decks.event.findIndex(isOfferableInvestment);
    if (idx === -1) {
      forceReshuffleFromDiscards(state, decks.event, state.discards.event, 'event');
      idx = decks.event.findIndex(isOfferableInvestment);
    }
    if (idx === -1) return false;
    market.cards.push(decks.event.splice(idx, 1)[0]);
    return true;
  };

  // Staff cards are drawn from the staff deck into the market row (CG-0MT3KZNQB0053K55),
  // exactly like the other non-business families.
  const drawStaff = (): boolean => {
    const card = decks.staff.pop();
    if (!card) return false;
    market.cards.push(card);
    return true;
  };

  while (market.cards.length < MARKET_TOTAL_SLOTS) {
    const businessCount = market.cards.filter(
      c => c.family === 'business' || c.family === 'community-space',
    ).length;
    const upgradeCount = market.cards.filter(c => c.family === 'upgrade').length;
    const eventCount = market.cards.filter(c => c.family === 'event').length;
    const staffCount = market.cards.filter(c => c.family === 'staff').length;

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
    if (staffCount < MARKET_STAFF_MAX && decks.staff.length > 0) legal.push(drawStaff);
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
  // Pass the game's seeded RNG into createEventDeck so duplicate
  // are selected deterministically per-game-seed rather than by template order.
  const eventDeck = createEventDeck(3, options.unlockedCardIds, rng, config.positiveIncidentMultiplier);
  const upgradeDeck = createUpgradeDeck(2, options.unlockedCardIds);
  // Staff deck is tier-gated like the other families (CG-0MT2WU0CX005Z143):
  // only staff whose tier is unlocked are drawn into the general market.
  const staffDeck = createStaffDeck(1, options.unlockedCardIds);

  shuffleArray(businessDeck, rng);
  shuffleArray(communitySpaceDeck, rng);
  shuffleArray(eventDeck, rng);
  shuffleArray(upgradeDeck, rng);
  // Staff deck shuffle: draw count scales with deck size (now tier-filtered,
  // CG-0MT2WU0CX005Z143), so changing the unlocked pool shifts the seeded
  // game draws (market refill, challenge selection) — the established
  // precedent when staff template counts change (e.g. General Manager,
  // CG-0MSTOF1N5005PK2R). Seeded determinism (same seed ⇒ same game) is
  // preserved.
  shuffleArray(staffDeck, rng);

  // Populate initial market — single-row marketplace (CG-0MSTOATDT009BRX2):
  // exactly 3 cards, always ≥1 business, random within 1–2B/0–1U/0–1E.
  // The row is refilled via refillSingleRowMarket after the state object is
  // assembled (it needs state.rng / decks / discards wired up).
  const market: MarketState = { cards: [] };

  // Build the face-down incident deck: move every Incident-trigger card from
  // the seeded event deck into `incidentDeck` (candidate pool for runtime
  // selection). The remaining Investment-trigger cards stay in the event
  // deck for the market.
  // Incident-draw balance limits come from the difficulty preset's config
  // (per-difficulty tuning, CG-0MSL0OU1E005WFJB). Configs that omit the
  // fields (legacy saves) fall back to the engine defaults N=3, M=2 via ??
  // in createIncidentBalanceState.
  const incidentBalance = createIncidentBalanceState({
    repeatSpacing: config.incidentRepeatSpacing,
    maxStreak: config.incidentMaxStreak,
  });
  // Gather all Incident-trigger cards from the seeded event deck into a pool
  // (remaining Investment-trigger cards stay in the event deck for the market).
  const incidentPool: EventCard[] = [];
  const remainingEventCards: EventCard[] = [];
  for (const card of eventDeck) {
    if (card.trigger === 'Incident') {
      incidentPool.push(card);
    } else {
      remainingEventCards.push(card);
    }
  }
  eventDeck.length = 0;
  eventDeck.push(...remainingEventCards);

  // Constraint-aware deck ordering replaced by runtime selection
  // (CG-0MSZDD2TP003TZS5): the incident pool is shuffled once (seeded —
  // same seed ⇒ same deck order) and each draw is selected at runtime by
  // `findConstrainedIncidentIndex` against the resolved-draw balance
  // history. No pre-ordering; constraints (repeatSpacing / maxStreak) are
  // enforced at draw time.
  shuffleArray(incidentPool, rng);
  const incidentDeck = incidentPool;

  // Roll the start week from the allowed set BEFORE any RNG calls from deck
  // shuffling/market refill/challenge selection, so same seed ⇒ same start week
  // regardless of how the pool sizes evolve (CG-0MTT0K9RX0004QTE / F2).
  // To preserve that invariant even after existing setup code adds further RNG
  // consumption before this point (e.g. future shuffles), derive the start
  // week from a dedicated seeded stream that shares the numeric seed — the
  // main replay stream's rngCalls continue to count only main-stream draws.
  const startWeekSeed = (numericSeed ^ 0x9e3779b9) >>> 0;
  const startWeekRng = createSeededRng(startWeekSeed);
  const startWeek = rollStartWeek(() => startWeekRng());

  // Build initial state -- use config values instead of hard-coded constants
  const initCoins = config.startingCoins;
  const initRep = config.startingReputation;
  const baseState: MainStreetState = {
    config,
    turn: 1,
    week: startWeek,
    year: 1,
    phase: 'WeekStart',
    streetGrid: new Array<BusinessCard | CommunitySpaceCard | null>(GRID_SIZE).fill(null),
    streetGridCols: 1,
    streetGridRows: 1,
    streetCamera: { zoomLevel: 1, focusX: 0, focusY: 0 },
    market,
    resourceBank: {
      coins: initCoins,
      reputation: initRep,
    },
    // Day-start snapshot initialised to the opening resources; overwritten by
    // executeWeekStart each turn (CG-0MT5W7UJJ0065MEZ AC3).
    weekStartCoins: initCoins,
    weekStartRep: initRep,
    weekStartScore: 0,
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
      staff: staffDeck,
    },
    // Discard piles for removed market cards
    discards: {
      business: [],
      communitySpace: [],
      event: [],
      upgrade: [],
      staff: [],
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
    soldSlots: new Array<boolean>(GRID_SIZE).fill(false),
    actionsRemaining: 1,
    bankedActions: 0,
    peekUsedThisTurn: false,
    revealedPeekedCard: null,
    favourUsedThisTurn: false,
    justMovedEventCardId: null,
    justMovedUpgradeCardId: null,
    businessPlacedThisTurn: false,
    players: undefined,
    ownerTaggedGrid: undefined,
    playerCount: undefined,
    activePlayerId: undefined,
    competitiveWinnerId: undefined,
    pendingApplicant: null,
    pendingEventChoice: null,
  };
  // Endless-mode opt-in (CG-0MTIILU5V006GCN4): overrides the preset's
  // win-threshold semantics. Default is false (existing behaviour).
  if (options.endlessMode !== undefined) {
    baseState.config = { ...baseState.config, endlessMode: options.endlessMode };
  }

  state = baseState;

  // Refill the single-row market with its initial composition.
  refillSingleRowMarket(state);

  // Randomize specialization skills for every staff applicant once per game
  // (I3, CG-0MT4WXSWG0023VR0). Dedicated seeded stream — main RNG untouched.
  assignStaffApplicantSkills(state);

  // Select challenges for this run using seeded RNG and config count
  const selectedChallenges = selectChallenges(CHALLENGE_TEMPLATES, config.challengesPerRun, rng);
  state.activeChallenges = selectedChallenges.map(ch => ({
    challenge: ch,
    completed: false,
  }));

  return state;
}

// ── Competitive State (CG-0MT5X3GMA007EG30) ─────────────────

/**
 * Creates a competitive game state with N per-player records.
 *
 * N-player-ready (parallel PlayerRecord[] indexed by ownerId): shared
 * market, decks, and incidentDeck remain single-owner and unchanged.
 * Each player's starting coins/reputation comes from the preset.
 */
export function createCompetitiveState(
  options: CompetitiveStateOptions,
): MainStreetState {
  if (!Number.isInteger(options.playerCount) || options.playerCount < 1) {
    throw new Error(`playerCount must be an integer >= 1, got ${options.playerCount}`);
  }

  // Reuse single-player setup so seeded deck order / RNG semantics are
  // identical to MainStreet; then overlay the per-player layer.
  const { playerCount, ...singlePlayerOptions } = options;
  const state = setupMainStreetGame(singlePlayerOptions);

  const initCoins = state.config.startingCoins;
  const initRep = state.config.startingReputation;

  state.players = Array.from({ length: playerCount }, (_, playerId) => ({
    playerId,
    coins: initCoins,
    reputation: initRep,
    hand: [],
    staffCards: [],
    actionBudget: 1,
    score: 0,
  } as PlayerRecord));

  state.ownerTaggedGrid = Array.from(
    { length: state.streetGrid.length },
    (): OwnerTaggedSlot => ({ card: null, ownerId: null }),
  );

  state.playerCount = playerCount;
  state.activePlayerId = 0;
  state.competitiveWinnerId = null;

  return state;
}



/**
 * Live mid-session hook to adjust the incident-draw balance limits.
 *
 * Changes take effect on all subsequent constrained incident deck rebuilds
 * (refill/reshuffle paths); the already-ordered remainder of the current
 * deck is left untouched. This is the runtime-manipulation interface for
 * designers/balancers — difficulty presets wire values here in a follow-up
 * work item (CG-0MSL0OU1E005WFJB).
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
 * Re-sizes the playable street grid to a new city-block world lattice
 * (`cols`×`rows` street cells), migrating every placed card, sold flag and
 * ownership tag by WORLD POSITION (CG-0MTH9OW0H0005VKE).
 *
 * The world grid is row-major over the `(5·cols) × (2·rows)` plot rectangle, so
 * its row width changes with `cols` — a legacy 1×1 board (world width 5)
 * becomes the origin cell of a larger lattice (world width `5·cols`), and its
 * bottom row shifts from indices 5..9 to `worldY·newWidth + worldX`. This
 * function therefore *reindexes* rather than merely re-sizing.
 *
 * Cards/tags outside the new (smaller) lattice are dropped, matching the
 * shrinkage semantics of `resizeSoldSlots`.
 *
 * @returns True when the lattice changed (arrays re-allocated), false for a no-op.
 */
export function setStreetGridLattice(
  state: MainStreetState,
  cols: number,
  rows: number,
): boolean {
  const nextCols = Math.max(1, Math.floor(cols));
  const nextRows = Math.max(1, Math.floor(rows));
  const prevCols = Math.max(1, Math.floor(state.streetGridCols || 1));
  const prevRows = Math.max(1, Math.floor(state.streetGridRows || 1));
  if (nextCols === prevCols && nextRows === prevRows) return false;

  const prevWidth = worldWidth(prevCols);
  const nextWidth = worldWidth(nextCols);
  const nextHeight = worldHeight(nextRows);
  const nextSize = nextWidth * nextHeight;

  /** Translate an index in the previous world frame to the next frame. */
  const reindex = (index: number): number => {
    const worldX = index % prevWidth;
    const worldY = Math.floor(index / prevWidth);
    if (worldX >= nextWidth || worldY >= nextHeight) return -1;
    return worldY * nextWidth + worldX;
  };

  const nextGrid: (BusinessCard | CommunitySpaceCard | null)[] =
    new Array<BusinessCard | CommunitySpaceCard | null>(nextSize).fill(null);
  const nextSold = new Array<boolean>(nextSize).fill(false);
  const prevSold = state.soldSlots ?? [];
  for (let i = 0; i < state.streetGrid.length; i++) {
    const target = reindex(i);
    if (target < 0) continue;
    nextGrid[target] = state.streetGrid[i] ?? null;
    if (prevSold[i]) nextSold[target] = true;
  }

  let nextOwners: OwnerTaggedSlot[] | undefined;
  if (state.ownerTaggedGrid) {
    nextOwners = new Array<OwnerTaggedSlot>(nextSize).fill(undefined as unknown as OwnerTaggedSlot);
    for (let i = 0; i < state.ownerTaggedGrid.length; i++) {
      const target = reindex(i);
      if (target < 0) continue;
      nextOwners[target] = state.ownerTaggedGrid[i];
    }
  }

  state.streetGrid = nextGrid;
  state.soldSlots = nextSold;
  if (nextOwners) state.ownerTaggedGrid = nextOwners;
  state.streetGridCols = nextCols;
  state.streetGridRows = nextRows;

  addLog(
    state,
    `Street grid expanded to ${nextCols}×${nextRows} streets (${nextSize} plots)`,
    'neutral',
  );
  return true;
}
