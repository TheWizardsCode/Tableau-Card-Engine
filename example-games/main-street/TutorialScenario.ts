/**
 * Main Street: Tutorial Scenario System
 *
 * Defines a scenario mechanism for pre-building the exact game state for the
 * Main Street tutorial, without relying on seed-based shuffling or RNG-driven
 * card selection.
 *
 * The system is designed with future scenario/sandbox modes in mind: the
 * `TutorialScenario` interface can be reused by non-tutorial scenario
 * definitions (e.g., sandbox mode, pre-built challenges) without requiring
 * rework. Those use cases are explicitly out of scope for this module.
 *
 * ## Architecture
 *
 * - `TutorialScenario` — A data-only interface describing the desired initial
 *   game state (market cards, resources, incident deck, difficulty).
 * - `STANDARD_TUTORIAL_SCENARIO` — The concrete scenario used by the
 *   Main Street tutorial. All card IDs reference Tier-1 cards only.
 * - `createTutorialScenario()` — Builds a fully initialised `MainStreetState`
 *   from the scenario definition, using the standard deck builders and then
 *   explicitly extracting and placing the scenario's cards into the market
 *   and the face-down incident deck (CG-0MSTOATDP000JNHH). Cards are
 *   identified by their **base template ID** (without copy/serial suffix)
 *   so the scenario is robust across deck construction ordering.
 * - `ensureTutorialMarketForUpcomingSteps()` — The single-row market holds
 *   only `MARKET_TOTAL_SLOTS` (3) cards, but the tutorial needs six purchase
 *   targets across six days (Laundromat T3, Local Festival T9, Bookshop T11,
 *   Library T17 — moved to hand, then placed from hand the next day). At
 *   each day start the turn controller calls this hook, which forces the
 *   upcoming action steps' required cards into the visible line (from
 *   decks/discards), mirroring the legacy two-row scenario-placing behaviour.
 *
 * ## Coin Budget (Easy / 12 coins) — cost-at-play, two-turn plan-ahead (CG-0MT53NXGZ004H5AE)
 *
 * Every purchase is a two-turn flow: move to hand on day N (action), End
 * Turn, place from hand on day N+1 at LISTED cost (action). No same-turn
 * premium is ever requested, so the budget stays positive throughout.
 *
 * | Step | Action                          | Coins In | Coins Out | Balance |
 * |------|---------------------------------|----------|-----------|---------|
 * | T1   | Start (Easy, 12 coins)          | 12       | 0         | 12      |
 * | T3   | Move Laundromat to hand (free)  | 0        | 0         | 12      |
 * | T6   | End Turn (held-card cost -1)    | 0        | 1         | 11      |
 * | T7   | Place Laundromat (listed $4)    | 0        | 4         | 7       |
 * | T9   | Move Local Festival to hand     | 0        | 0         | 7       |
 * | T10  | End Turn + income (~2.15)       | 2.154    | 0         | 9.154   |
 * | T11  | Move Bookshop to hand           | 0        | 0         | 9.154   |
 * | T13  | Community Favour (2 rep → 3c)   | 3        | 0         | 12.154  |
 * | T14  | End Turn + income (~1.33)       | 1.333    | 0         | 13.487  |
 * | T15  | Place Bookshop (listed $3)      | 0        | 3         | 10.487  |
 * | T16  | End Turn + income (~3.91)       | 3.911    | 0         | 14.398  |
 * | T17  | Move Library to hand            | 0        | 0         | 14.398  |
 * | T18  | End Turn + income (~3.92)       | 3.918    | 0         | 18.316  |
 * | T19  | Place Library (listed $7)       | 0        | 7         | 11.316  |
 * | T20  | Play Local Festival (~+1 net)   | 1.0      | 0         | 12.316  |
 * | T21+ | Confirm steps (no cost)         | 0        | 0         | ≥ 12.3  |
 *
 * All placements are at listed cost because each follows an End Turn
 * (plan-ahead). The rep→coins Community Favour exchange teaches the
 * mechanic but is not strictly required: even without it the balance before
 * the Library (18.316 - 3 favour) ≥ $7. Reputation stays safely above the
 * collapse threshold throughout (start 5, +2 rep per Community Award).
 *
 * @module
 */

import type { MainStreetState, ResourceBank } from './MainStreetState';
import { addLog } from './MainStreetState';
import {
  type BusinessCard,
  type EventCard,
  type UpgradeCard,
  type CommunitySpaceCard,
  MARKET_TOTAL_SLOTS,
  GRID_SIZE,
  createBusinessDeck,
  createCommunitySpaceDeck,
  createEventDeck,
  createUpgradeDeck,
  createIncidentBalanceFromQueue,
} from './MainStreetCards';
import { getPreset, type DifficultyName } from './MainStreetDifficulty';
import { deriveUnlockedCardIds } from './MainStreetTiers';
import { createSeededRng } from '../../src/core-engine';
import { createEconomyLedger } from '../../src/rule-engine/EconomyLedger';
import { CHALLENGE_TEMPLATES, selectChallenges } from './MainStreetChallenges';
import { getBaseTypeId } from './MainStreetCards';
import { UNIFIED_TUTORIAL_STEPS, type TutorialControllerState } from './TutorialFlow';

// ── Scenario Interface ───────────────────────────────────────

/**
 * Describes a pre-built game state for a Main Street scenario.
 *
 * The scenario explicitly defines which cards appear in the market,
 * incident deck, and the player's starting resources — bypassing all
 * seed-based shuffling.
 *
 * Card IDs are **base template IDs** (without copy/serial suffix).
 * For example, `'biz-laundromat'` matches any instance of the Laundromat
 * card regardless of its copy number (`biz-laundromat-0`, `biz-laundromat-1`,
 * etc.). This makes the scenario robust across deck construction order.
 *
 * This interface is designed to be reusable for non-tutorial scenarios
 * (e.g., sandbox mode, pre-built challenges) by simply changing the
 * card IDs and resource values.
 */
export interface TutorialScenario {
  /** Difficulty preset. Tutorial always uses Easy. */
  difficulty: DifficultyName;
  /** Starting resources. */
  resourceBank: ResourceBank;
  /**
   * Day-1 single-row market (exactly `MARKET_TOTAL_SLOTS` cards). Later days
   * are assembled by `ensureTutorialMarketForUpcomingSteps`, which forces
   * the upcoming step's required cards into the line from the decks.
   */
  market: {
    cards: string[];
  };
  /** Base template IDs for the face-down incident deck (one per End Turn). */
  incidentDeck: string[];
  /**
   * Seed string for deterministic RNG (used for challenge selection and
   * any remaining RNG-dependent game mechanics). Does NOT affect market
   * or incident deck composition — those are driven by card IDs above.
   */
  seed: string;
}

// ── Standard Tutorial Scenario ───────────────────────────────

/**
 * The concrete tutorial scenario used by the Main Street tutorial.
 *
 * All card IDs reference Tier-1 pool cards. The market is one single row
 * (CG-0MSTOATDT009BRX2) of exactly 3 cards on day 1:
 *   - `biz-bakery` (Bakery, $3, Food) — filler slot
 *   - `biz-laundromat` (Laundromat, $4, Service) — T3 purchase target
 *   - `evt-festival` (Local Festival, $3) — T9 purchase target
 *
 * Later tutorial days force the remaining targets (Bookshop for T11,
 * Library for T17) into the line via `ensureTutorialMarketForUpcomingSteps`
 * (called by the turn controller at day start).
 *
 * **Investments row is gone:** the two upgrade cards (upg-patisserie,
 * upg-garden) are no longer scenario-placed; upgrades may appear in the
 * line randomly but no tutorial step requires them.
 *
 * **Incident Deck (face-down, 5 cards — CG-0MT53NXGZ004H5AE):**
 * The two-turn flow runs 6 days with 5 End Turns (T6, T10, T14, T16, T18),
 * so the deterministic deck holds exactly 5 incidents. All are budget-safe
 * on the tutorial street (no Food businesses are placed):
 *   - `evt-award` (Community Award, +2 reputation) ×3
 *   - `evt-rainy` (Rainy Day, -1 coin per Food business → 0 here) ×2
 *
 * **Coin Budget:** 12 starting coins; payments happen at play time
 * (cost-at-play, listed cost — every placement follows an End Turn, so no
 * same-turn premium is requested): Laundromat placement $4 (T7) + Bookshop
 * placement $3 (T15) + Library placement $7 (T19) + Local Festival play $3
 * (T20, net +1 with the two Culture cards) — all covered by 12 + income
 * across the five end-turn steps + the T13 Community Favour exchange.
 * RNG-independent. See the budget table in the module docs.
 */
export const STANDARD_TUTORIAL_SCENARIO: TutorialScenario = {
  difficulty: 'Easy',
  // 12 starting coins: the 18-step flow places four cards (Laundromat $4 +
  // Bookshop $3 + Library $7 + Local Festival $3) and earns ~1.9 income +
  // one Community Favour conversion (2 rep → 3 coins) at T13, which is
  // REQUIRED to afford the $7 Library (6.875 + 3 = 9.875 ≥ 7). Reputation
  // starts at 5 (the conversion spends 2, leaving 3 — safely above the
  // reputation-collapse threshold).
  resourceBank: { coins: 12, reputation: 5 },
  market: {
    cards: [
      'biz-bakery',
      'biz-laundromat',
      'evt-festival',
    ],
  },
  incidentDeck: [
    'evt-award',
    'evt-rainy',
    'evt-award',
    'evt-rainy',
    'evt-award',
  ],
  seed: 'tutorial-scenario',
};

// ── State Builder ────────────────────────────────────────────

/**
 * Finds and removes a card from an array by matching its ID against a
 * base template ID (without copy/serial suffix). A card matches if its
 * `.id` field starts with the given `templateId`.
 *
 * E.g., `findCardByTemplate(deck, 'biz-laundromat')` matches
 * `biz-laundromat-0`, `biz-laundromat-1`, etc.
 *
 * Mutates the array in place. Throws if no card with the given template
 * ID is found.
 */
function findCardByTemplate<T extends { id: string }>(
  deck: T[],
  templateId: string,
): T {
  const idx = deck.findIndex(c => c.id.startsWith(templateId));
  if (idx === -1) {
    throw new Error(
      `TutorialScenario: no card matching template "${templateId}" found in deck. ` +
      'Has it been removed from the Tier-1 card pool?',
    );
  }
  return deck.splice(idx, 1)[0];
}

/**
 * Builds a fully initialised `MainStreetState` from a `TutorialScenario`
 * definition.
 *
 * Process:
 * 1. Build all four decks using the standard deck builders filtered to
 *    Tier-1 cards.
 * 2. Find cards matching each scenario template ID in the appropriate
 *    decks and extract them.
 * 3. Place extracted cards into the single-row market and incident deck.
 * 4. Build and return the complete `MainStreetState` with remaining deck
 *    contents and a deterministic RNG for challenge selection.
 *
 * @param scenario  The scenario definition (defaults to STANDARD_TUTORIAL_SCENARIO).
 * @returns A fully initialised MainStreetState ready for day 1.
 */
export function createTutorialScenario(
  scenario: TutorialScenario = STANDARD_TUTORIAL_SCENARIO,
): MainStreetState {
  // ── Resolve config ────────────────────────────────────────
  const config = getPreset(scenario.difficulty);
  const tier1Ids = deriveUnlockedCardIds(['tier-1']);

  // Validate scenario card counts
  if (scenario.market.cards.length !== MARKET_TOTAL_SLOTS) {
    throw new Error(
      `TutorialScenario: expected ${MARKET_TOTAL_SLOTS} single-row market cards, ` +
      `got ${scenario.market.cards.length}`,
    );
  }
  if (scenario.incidentDeck.length < 1) {
    throw new Error(
      'TutorialScenario: incident deck must not be empty.',
    );
  }
  // The tutorial's two-turn flow (CG-0MT53NXGZ004H5AE) spans 6 days with 5
  // End Turns (T6, T10, T14, T16, T18), so the scenario declares a
  // deterministic incident card per resolution. INCIDENT_QUEUE_SIZE (the
  // legacy face-down-queue size, still 2 for the real game) no longer constrains
  // the scripted scenario deck — the scenario's own list is authoritative.

  // ── Build decks ───────────────────────────────────────────
  const businessDeck: BusinessCard[] = createBusinessDeck(3, tier1Ids);
  const communitySpaceDeck: CommunitySpaceCard[] = createCommunitySpaceDeck(3, tier1Ids);
  const eventDeck: EventCard[] = createEventDeck(3, tier1Ids, () => 0);
  const upgradeDeck: UpgradeCard[] = createUpgradeDeck(2, tier1Ids);

  // ── Extract market cards from decks by base template ID ────
  const marketCards: (BusinessCard | CommunitySpaceCard | UpgradeCard | EventCard)[] = [];
  for (const templateId of scenario.market.cards) {
    // Business / community-space: try business deck, then community space deck
    try {
      marketCards.push(findCardByTemplate(businessDeck, templateId));
    } catch {
      try {
        marketCards.push(findCardByTemplate(communitySpaceDeck, templateId));
      } catch {
        try {
          marketCards.push(findCardByTemplate(upgradeDeck, templateId));
        } catch {
          marketCards.push(findCardByTemplate(eventDeck, templateId));
        }
      }
    }
  }

  // Incident deck (face-down, CG-0MSTOATDP000JNHH): scenario-placed
  // incidents at the deck front (next to resolve). The tutorial flow now runs
  // 5 End Turns (6 days, CG-0MT53NXGZ004H5AE) so the scenario declares exactly
  // 5 deterministic, budget-safe incidents (see STANDARD_TUTORIAL_SCENARIO).
  // All are non-negative on the tutorial street (no Food businesses are
  // placed), so the tight coin budget stays deterministic — a larger random
  // deck could still resolve an unbudgeted, coin-costing incident, which is
  // why the deck is scripted rather than drawn from the event pool.
  const incidentDeck: EventCard[] = [];
  for (const templateId of scenario.incidentDeck) {
    incidentDeck.push(findCardByTemplate(eventDeck, templateId));
  }

  // ── Setup deterministic RNG ───────────────────────────────
  // Use a simple seeded RNG for challenge selection and any
  // RNG-dependent game mechanics. The market composition is NOT
  // affected by this RNG — it's explicitly defined by the scenario.
  const numericSeed = hashString(scenario.seed);
  const baseRng = createSeededRng(numericSeed);
  let rngCalls = 0;
  let state!: MainStreetState;
  const rng = (): number => {
    rngCalls += 1;
    state.rngCalls = rngCalls;
    return baseRng();
  };

  // ── Build state ───────────────────────────────────────────
  const initCoins = scenario.resourceBank.coins;
  const initRep = scenario.resourceBank.reputation;

  state = {
    config,
    turn: 1,
    phase: 'DayStart',
    streetGrid: new Array<BusinessCard | CommunitySpaceCard | null>(GRID_SIZE).fill(null),
    market: {
      cards: marketCards,
    },
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
      staff: [],
    },
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
    // Backfill the balance history from the scenario-defined deck so
    // subsequent constrained rebuilds see the actual sequence
    // (CG-0MSL0OP040043KKZ).
    incidentBalance: createIncidentBalanceFromQueue(incidentDeck),
    gameResult: 'playing',
    endReason: null,
    finalScore: 0,
    seed: scenario.seed,
    numericSeed,
    rngCalls,
    rng,
    activityLog: [],
    activeEffects: [],
    hand: [],
    maxHandSize: 3,
    discardPile: [],
    staffCards: [],
    skipMarketCycleOnEndTurn: false,
    soldSlots: new Array<boolean>(GRID_SIZE).fill(false),
    actionsRemaining: 1,
    bankedActions: 0,
    peekUsedThisTurn: false,
    revealedPeekedCard: null,
    favourUsedThisTurn: false,
  };

  // Select challenges for this run using seeded RNG
  const selectedChallenges = selectChallenges(
    CHALLENGE_TEMPLATES,
    config.challengesPerRun,
    rng,
  );
  state.activeChallenges = selectedChallenges.map(ch => ({
    challenge: ch,
    completed: false,
  }));

  return state;
}

// ── Day-Start Market Guarantee ───────────────────────────────

/**
 * Returns all upcoming action steps (before the next `end-turn` step) that
 * reference a market card the tutorial will ask the player to buy.
 */
function upcomingStepCardIds(controllerState: TutorialControllerState): string[] {
  const result: string[] = [];
  if (!controllerState.isActive) return result;
  // INCLUSIVE start: after an end-turn step completes, the controller is
  // already ON the next step (e.g. T11 move-Bookshop / T17 move-Library),
  // and `startDayPhase` runs the guarantee hook for it. The current step's
  // required card must be covered too (CG-0MT53NXGZ004H5AE two-turn flow).
  const startIndex = Math.max(0, controllerState.currentStepIndex);
  for (let i = startIndex; i < UNIFIED_TUTORIAL_STEPS.length; i++) {
    const step = UNIFIED_TUTORIAL_STEPS[i];
    if (step.gate !== 'action') continue;
    if (step.requiredAction === 'end-turn') break;
    if (step.requiredCardId) {
      result.push(step.requiredCardId);
    }
  }
  return result;
}

/**
 * Locates a scenario template card anywhere in the game (decks first, then
 * matching discards) and returns it, removing it from its source. Returns
 * `null` when the card is nowhere to be found.
 */
function extractTemplateCard(
  state: MainStreetState,
  templateId: string,
): BusinessCard | CommunitySpaceCard | UpgradeCard | EventCard | null {
  const matches = (id: string) => id.startsWith(templateId);
  const pools: { deck: { id: string }[]; discard: { id: string }[]; label: string }[] = [
    { deck: state.decks.business, discard: state.discards.business, label: 'business' },
    { deck: state.decks.communitySpace, discard: state.discards.communitySpace, label: 'community-space' },
    { deck: state.decks.upgrade, discard: state.discards.upgrade, label: 'upgrade' },
    { deck: state.decks.event, discard: state.discards.event, label: 'event' },
  ];
  for (const pool of pools) {
    const deckIdx = pool.deck.findIndex(c => matches(c.id));
    if (deckIdx !== -1) {
      return pool.deck.splice(deckIdx, 1)[0] as any;
    }
    const discardIdx = pool.discard.findIndex(c => matches(c.id));
    if (discardIdx !== -1) {
      return pool.discard.splice(discardIdx, 1)[0] as any;
    }
  }
  return null;
}

/**
 * Guarantees the tutorial's upcoming purchase targets are visible in the
 * single-row market at day start (CG-0MSTOATDT009BRX2).
 *
 * With only 3 visible slots and four buys spread across three days
 * (Laundromat T3, Local Festival T9, Bookshop T10, Library T13), the visible
 * line alone cannot hold every target. Scanning the upcoming action steps
 * (up to the next end-turn), this hook forces any missing required card into
 * the line: cards are drawn from the decks (or their discards), displacing
 * the last visible card when the row is full (the displaced card returns to
 * its family deck). Day-1 cards are scenario-placed by
 * `createTutorialScenario`; this hook covers days 2+.
 *
 * Caller: `MainStreetTurnController.startDayPhase` when the tutorial is
 * active. Deterministic — no RNG is consumed.
 *
 * @param state           Current game state (mutated in-place).
 * @param controllerState The active tutorial controller state.
 */
export function ensureTutorialMarketForUpcomingSteps(
  state: MainStreetState,
  controllerState: TutorialControllerState,
): void {
  if (!controllerState?.isActive) return;

  for (const requiredCardId of upcomingStepCardIds(controllerState)) {
    const baseId = getBaseTypeId(requiredCardId);
    // Already visible (any copy of the template)?
    const visible = state.market.cards.some(c => getBaseTypeId(c.id) === baseId);
    if (visible) continue;

    const card = extractTemplateCard(state, baseId);
    if (!card) continue;

    if (state.market.cards.length >= MARKET_TOTAL_SLOTS) {
      // Row full — displace the last visible card back to its family deck.
      const displaced = state.market.cards.pop()!;
      if (displaced.family === 'business') state.decks.business.push(displaced as BusinessCard);
      else if (displaced.family === 'community-space') state.decks.communitySpace.push(displaced as CommunitySpaceCard);
      else if (displaced.family === 'upgrade') state.decks.upgrade.push(displaced as UpgradeCard);
      else state.decks.event.push(displaced as EventCard);
    }
    state.market.cards.push(card);
    addLog(state, `Scenario: showed ${card.name} in the market for the next step`, 'neutral');
  }
}

// ── Helpers ──────────────────────────────────────────────────

/**
 * Simple string hash (djb2) used for converting the scenario seed string
 * into a numeric seed.
 */
function hashString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return hash;
}