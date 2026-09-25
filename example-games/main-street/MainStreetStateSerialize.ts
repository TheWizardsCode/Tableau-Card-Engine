/**
 * Main Street: State Serialization
 *
 * Serializes `MainStreetState` to a version-stable plain object and
 * reconstructs it (with backward-compatible migration) on load.
 *
 * Import graph: depends on `MainStreetStateTypes` and `MainStreetStateSetup`
 * (for `ALLOWED_START_WEEKS`) plus card runtime helpers. Nothing imports this
 * module from within the State split, so the graph stays acyclic.
 *
 * @module
 */

import { createSeededRng } from '@core-engine';
import { createEconomyLedger } from '@rule-engine/EconomyLedger';
import {
  type EventCard,
  type StaffCard,
  CSV_CHECKSUM,
  CARD_DATA_RAW,
  GRID_SIZE,
  MARKET_TOTAL_SLOTS,
  loadTemplatesFromCsv,
  createIncidentBalanceState,
  createIncidentBalanceFromQueue,
} from './MainStreetCards';
import { CHALLENGE_TEMPLATES } from './MainStreetChallenges';
import type { StreetCameraState } from './MainStreetMapView';
import type {
  MainStreetState,
  MainStreetSerializedState,
  PlayerRecord,
  OwnerTaggedSlot,
} from './MainStreetStateTypes';
import { ALLOWED_START_WEEKS } from './MainStreetStateSetup';

/**
 * Serializes Main Street runtime state into a JSON-safe checkpoint shape.
 */
export function serializeMainStreetState(state: MainStreetState): MainStreetSerializedState {
  return {
    config: structuredClone(state.config),
    turn: state.turn,
    week: state.week,
    year: state.year,
    phase: state.phase,
    streetGrid: structuredClone(state.streetGrid),
    streetGridCols: state.streetGridCols,
    streetGridRows: state.streetGridRows,
    streetCamera: { ...state.streetCamera },
    market: structuredClone(state.market),
    resourceBank: structuredClone(state.resourceBank),
    weekStartCoins: state.weekStartCoins,
    weekStartRep: state.weekStartRep,
    weekStartScore: state.weekStartScore,
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
    soldSlots: resizeSoldSlots(state.soldSlots, state.streetGrid.length),
    csvChecksum: CSV_CHECKSUM,
    csvData: CARD_DATA_RAW,
    actionsRemaining: state.actionsRemaining,
    bankedActions: state.bankedActions,
    peekUsedThisTurn: state.peekUsedThisTurn,
    revealedPeekedCard: state.revealedPeekedCard ?? null,
    favourUsedThisTurn: state.favourUsedThisTurn,
    justMovedEventCardId: state.justMovedEventCardId ?? null,
    justMovedUpgradeCardId: state.justMovedUpgradeCardId ?? null,
    businessPlacedThisTurn: state.businessPlacedThisTurn ?? false,
    players: state.players ? structuredClone(state.players) : undefined,
    ownerTaggedGrid: state.ownerTaggedGrid ? structuredClone(state.ownerTaggedGrid) : undefined,
    playerCount: state.playerCount,
    activePlayerId: state.activePlayerId ?? null,
    competitiveWinnerId: state.competitiveWinnerId ?? null,
    pendingApplicant: state.pendingApplicant
      ? { card: structuredClone(state.pendingApplicant.card), targetSlotIndex: state.pendingApplicant.targetSlotIndex }
      : null,
    pendingEventChoice: state.pendingEventChoice
      ? {
          event: structuredClone(state.pendingEventChoice.event),
          chosenOption: state.pendingEventChoice.chosenOption,
          resolved: state.pendingEventChoice.resolved,
        }
      : null,
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

  // ── Legacy staffCardMarket → decks.staff migration (CG-0MT3KZNQB0053K55) ──
  // Old saves carry `staffCardMarket` (dedicated staff-market deck). Fold those
  // cards into the new `decks.staff` pool so they remain available for future
  // market refills. Remove the legacy field.
  const legacyStaffMarket = saved.staffCardMarket as unknown[] | undefined;
  if (Array.isArray(legacyStaffMarket)) {
    const decks = saved.decks as Record<string, unknown> | undefined;
    if (decks) {
      const staffDeck = (decks.staff as unknown[] | undefined) ?? [];
      for (const card of legacyStaffMarket) {
        if (card && typeof card === 'object') {
          staffDeck.push(card);
        }
      }
      decks.staff = staffDeck;
    }
  }
  delete (saved as Record<string, unknown>).staffCardMarket;

  // ── Add decks.staff / discards.staff for old saves ─────────
  if (decks && !('staff' in decks)) {
    (decks as Record<string, unknown>).staff = [];
  }
  if (discards && !('staff' in discards)) {
    (discards as Record<string, unknown>).staff = [];
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
    const grid = (saved as Record<string, unknown>).streetGrid as unknown[] | undefined;
    (saved as Record<string, unknown>).soldSlots = new Array<boolean>(grid?.length ?? GRID_SIZE).fill(false);
  }

  // ── actionsRemaining: backfill default for legacy saves ──
  if (!('actionsRemaining' in saved)) {
    (saved as Record<string, unknown>).actionsRemaining = 1;
  }

  // ── bankedActions (CG-0MT3IOPZB005LNAR): backfill default for legacy saves ──
  // Legacy saves predate the action-banking mechanic; default to 0.
  if (!('bankedActions' in saved)) {
    (saved as Record<string, unknown>).bankedActions = 0;
  }

  // ── peekUsedThisTurn (CG-0MSXOW6GN008ZSMN): backfill default ──
  // Legacy saves predate the staff peek gate; default to false (unused).
  if (!('peekUsedThisTurn' in saved)) {
    (saved as Record<string, unknown>).peekUsedThisTurn = false;
  }

  // ── revealedPeekedCard (CG-0MSXOW6GN008ZSMN): backfill default ──
  // Legacy saves predate the peek reveal state; default to null (none).
  if (!('revealedPeekedCard' in saved)) {
    (saved as Record<string, unknown>).revealedPeekedCard = null;
  }

  // ── favourUsedThisTurn (CG-0MSTOATDQ005XDET): backfill default ──
  // Legacy saves predate the Community Favour mechanic; default to false
  // (unused). Mirrors the pattern used for actionsRemaining and peekUsedThisTurn.
  if (!('favourUsedThisTurn' in saved)) {
    (saved as Record<string, unknown>).favourUsedThisTurn = false;
  }

  // ── justMovedEventCardId (CG-0MTFWBNL30043ZBM): backfill default ──
  if (!('justMovedEventCardId' in saved)) {
    (saved as Record<string, unknown>).justMovedEventCardId = null;
  }

  // ── businessPlacedThisTurn (CG-0MTIOCBH400970OB): backfill default ──
  // Legacy saves predate the Grand Opening placement gate; default to false
  // (not yet placed this turn) so old saves remain loadable and Grand
  // Opening starts gated for the current turn.
  if (!('businessPlacedThisTurn' in saved)) {
    (saved as Record<string, unknown>).businessPlacedThisTurn = false;
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

  // ── endlessMode (CG-0MTIILU5V006GCN4): old saves predate the flag; default to false.
  const savedConfig = saved.config as Record<string, unknown> | undefined;
  if (savedConfig && !('endlessMode' in savedConfig)) {
    savedConfig.endlessMode = false;
  }

  // ── streetGridCols/Rows: backfill for pre-expanded saves (1×1) ──
  if (!('streetGridCols' in saved)) {
    (saved as Record<string, unknown>).streetGridCols = 1;
  }
  if (!('streetGridRows' in saved)) {
    (saved as Record<string, unknown>).streetGridRows = 1;
  }

  // ── streetCamera: backfill default for pre-camera saves ──
  if (!('streetCamera' in saved)) {
    (saved as Record<string, unknown>).streetCamera = { zoomLevel: 1, focusX: 0, focusY: 0 };
  }

  // ── pendingApplicant (CG-0MSTOATDU006UGAX): backfill default ─
  if (!('pendingApplicant' in saved)) {
    (saved as Record<string, unknown>).pendingApplicant = null;
  }

  // ── pendingEventChoice (CG-0MTSHG8RP008E128): backfill default ─
  // Legacy saves predate the dual-choice incident mechanic; default to null
  // (no pending choice).
  if (!('pendingEventChoice' in saved)) {
    (saved as Record<string, unknown>).pendingEventChoice = null;
  }

  // ── day → week terminology rename (CG-0MTMYIHKO001QCWL) ──
  // Pre-rename saves serialized the phase as 'DayStart' and the turn-start
  // resource snapshot as dayStartCoins/dayStartRep/dayStartScore. Map them to
  // the current names so old saves keep loading (schema v1 → v2). This runs
  // for every load and is idempotent, so it also covers callers that invoke
  // deserializeMainStreetState() directly (tests, harnesses).
  if ((saved as Record<string, unknown>).phase === 'DayStart') {
    (saved as Record<string, unknown>).phase = 'WeekStart';
  }
  const legacyDayStartFields: ReadonlyArray<[string, string]> = [
    ['dayStartCoins', 'weekStartCoins'],
    ['dayStartRep', 'weekStartRep'],
    ['dayStartScore', 'weekStartScore'],
  ];
  for (const [oldKey, newKey] of legacyDayStartFields) {
    if (!(newKey in saved) && oldKey in saved) {
      (saved as Record<string, unknown>)[newKey] = (saved as Record<string, unknown>)[oldKey];
    }
    delete (saved as Record<string, unknown>)[oldKey];
  }

  // ── week/year (CG-0MTT0K9RX0004QTE): backfill for pre-calendar saves ─
  if (!('week' in saved)) {
    // Pre-calendar saves had no calendar; reconstruct a valid start week
    // from the legacy seed's dedicated start-week stream so the calendar is
    // valid and deterministic after a reload. Mirrors createSeededRng's 5
    // warm-up iterations + first draw, otherwise legacyWeek would not
    // match setupMainStreetGame's rollStartWeek for the same seed.
    const legacyWeek = (() => {
      const numSeed = (saved as Record<string, unknown>).numericSeed as number | undefined;
      if (typeof numSeed === 'number') {
        const dedicated = (numSeed ^ 0x9e3779b9) | 0;
        let s = dedicated;
        for (let i = 0; i < 5; i++) s = (Math.imul(1664525, s) + 1013904223) | 0;
        s = (Math.imul(1664525, s) + 1013904223) | 0;
        const r = (s >>> 0) / 4294967296;
        const w = ALLOWED_START_WEEKS[Math.floor(r * ALLOWED_START_WEEKS.length)];
        return w ?? 1;
      }
      return 1;
    })();
    (saved as Record<string, unknown>).week = legacyWeek;
  }
  if (!('year' in saved)) {
    (saved as Record<string, unknown>).year = 1;
  }

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
 * Resizes a `soldSlots` boolean array to match the (world-sized) street grid,
 * preserving existing sold flags and padding with `false` (CG-0MTH9OWF2002YQQ3).
 */
function resizeSoldSlots(sold: boolean[] | undefined, gridLength: number): boolean[] {
  const target = Math.max(gridLength, 0);
  const out = new Array<boolean>(target).fill(false);
  if (sold) {
    for (let i = 0; i < Math.min(sold.length, target); i++) out[i] = sold[i] === true;
  }
  return out;
}

/**
 * Re-sizes the playable street grid to a new planar world lattice
 * (`cols`×`rows` street cells), migrating every placed card, sold flag and
 * ownership tag by WORLD POSITION (CG-0MTH9OW0H0005VKE).
 *
 * The world grid is row-major over the planar seam-sharing rectangle, so its
 * row width changes with `cols` — a legacy 1×1 board (world width 5) becomes
 * the origin cell of a larger lattice (world width `4·cols+1`), and its bottom
 * row shifts from indices 5..9 to `worldY·newWidth + worldX`. This function
 * therefore *reindexes* rather than merely re-sizing.
 *
 * Cards/tags outside the new (smaller) lattice are dropped, matching the
 * shrinkage semantics of `resizeSoldSlots`.
 *
 * @returns True when the lattice changed (arrays re-allocated), false for a no-op.
 */
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
    week: (saved as unknown as { week?: number }).week ?? 1,
    year: (saved as unknown as { year?: number }).year ?? 1,
    phase: saved.phase,
    streetGrid: structuredClone(saved.streetGrid),
    market: structuredClone(saved.market),
    resourceBank: structuredClone(saved.resourceBank),
    // Legacy saves predate the day-start snapshot; fall back to the current
    // resources so a resumed turn's net row measures from the resume point
    // (CG-0MT5W7UJJ0065MEZ AC3).
    weekStartCoins: saved.weekStartCoins ?? saved.resourceBank.coins,
    weekStartRep: saved.weekStartRep ?? saved.resourceBank.reputation,
    weekStartScore:
      saved.weekStartScore ?? saved.finalScore ?? 0,
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
    soldSlots: resizeSoldSlots(saved.soldSlots, saved.streetGrid.length),
    streetGridCols: (saved as unknown as { streetGridCols?: number }).streetGridCols ?? 1,
    streetGridRows: (saved as unknown as { streetGridRows?: number }).streetGridRows ?? 1,
    streetCamera: (saved as unknown as { streetCamera?: Partial<StreetCameraState> }).streetCamera
      ? { zoomLevel: (saved as unknown as { streetCamera?: { zoomLevel?: number } }).streetCamera?.zoomLevel ?? 1,
          focusX: (saved as unknown as { streetCamera?: { focusX?: number } }).streetCamera?.focusX ?? 0,
          focusY: (saved as unknown as { streetCamera?: { focusY?: number } }).streetCamera?.focusY ?? 0,
        }
      : { zoomLevel: 1, focusX: 0, focusY: 0 },
    actionsRemaining: saved.actionsRemaining ?? 1,
    bankedActions: saved.bankedActions ?? 0,
    peekUsedThisTurn: saved.peekUsedThisTurn ?? false,
    favourUsedThisTurn: saved.favourUsedThisTurn ?? false,
    justMovedEventCardId: (saved as any).justMovedEventCardId ?? null,
    revealedPeekedCard: (saved.revealedPeekedCard as EventCard | null) ?? null,
    businessPlacedThisTurn: (saved as unknown as { businessPlacedThisTurn?: boolean })?.businessPlacedThisTurn ?? false,
    justMovedUpgradeCardId: (saved as unknown as { justMovedUpgradeCardId?: string | null })?.justMovedUpgradeCardId ?? null,
    players: (saved as unknown as { players?: PlayerRecord[] | null })?.players
      ? structuredClone((saved as unknown as { players: PlayerRecord[] })?.players)
      : undefined,
    ownerTaggedGrid: (saved as unknown as { ownerTaggedGrid?: OwnerTaggedSlot[] })?.ownerTaggedGrid
      ? structuredClone((saved as unknown as { ownerTaggedGrid: OwnerTaggedSlot[] })?.ownerTaggedGrid)
      : undefined,
    playerCount: (saved as unknown as { playerCount?: number })?.playerCount,
    activePlayerId: (saved as unknown as { activePlayerId?: number | null })?.activePlayerId ?? null,
    competitiveWinnerId: (saved as unknown as { competitiveWinnerId?: number | null })?.competitiveWinnerId ?? null,
    pendingApplicant: (saved as unknown as { pendingApplicant?: { card: StaffCard; targetSlotIndex: number } | null })?.pendingApplicant
      ? { card: structuredClone((saved as unknown as { pendingApplicant: { card: StaffCard; targetSlotIndex: number } }).pendingApplicant!.card),
          targetSlotIndex: (saved as unknown as { pendingApplicant: { card: StaffCard; targetSlotIndex: number } }).pendingApplicant!.targetSlotIndex,
        }
      : null,
    pendingEventChoice: (saved as unknown as { pendingEventChoice?: { event: EventCard; chosenOption: null | 'accept' | 'reject'; resolved: boolean } | null })?.pendingEventChoice
      ? {
          event: structuredClone((saved as unknown as { pendingEventChoice: { event: EventCard; chosenOption: null | 'accept' | 'reject'; resolved: boolean } }).pendingEventChoice!.event),
          chosenOption: (saved as unknown as { pendingEventChoice: { chosenOption: null | 'accept' | 'reject' } }).pendingEventChoice!.chosenOption,
          resolved: (saved as unknown as { pendingEventChoice: { resolved: boolean } }).pendingEventChoice!.resolved,
        }
      : null,
  };

  // ── Per-business employedStaff backfill (CG-0MU3BNO590066H75) ──────
  // Legacy saves and pre-feature in-memory states linked employed staff via
  // `staff.employedAtSlot` only. Backfill the per-business source of truth
  // (CG-0MTIOLY2A0092OT1 AC2) from those links when a business lacks the
  // array; new-format saves carry the array and keep it as serialized
  // (entries share the same data as the matching staffCards records).
  for (let i = 0; i < state.streetGrid.length; i++) {
    const card = state.streetGrid[i];
    if (!card) continue;
    if (!Array.isArray(card.employedStaff)) {
      card.employedStaff = (state.staffCards ?? []).filter(m => m.employedAtSlot === i);
    }
  }

  return state;
}
