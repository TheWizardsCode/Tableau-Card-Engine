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
 *   game state (market cards, resources, incident queue, difficulty).
 * - `STANDARD_TUTORIAL_SCENARIO` — The concrete scenario used by the
 *   Main Street tutorial. All card IDs reference Tier-1 cards only.
 * - `createTutorialScenario()` — Builds a fully initialised `MainStreetState`
 *   from the scenario definition, using the standard deck builders and then
 *   explicitly extracting and placing the scenario's cards into the market
 *   and incident queue. Cards are identified by their **base template ID**
 *   (without copy/serial suffix) so the scenario is robust across deck
 *   construction ordering.
 *
 * ## Coin Budget (Easy / 12 coins)
 *
 * | Step | Action                     | Coins In | Coins Out | Balance |
 * |------|----------------------------|----------|-----------|---------|
 * | T1   | Start (Easy, 12 coins)     | 12       | 0         | 12      |
 * | T2   | Confirm (no cost)          | 0        | 0         | 12      |
 * | T3   | Buy Laundromat ($4)        | 0        | 4         | 8       |
 * | T4   | Place business (free)      | 0        | 0         | 8       |
 * | T5   | Confirm (no cost)          | 0        | 0         | 8       |
 * | T6   | End Turn + income (~1 coin)| 1        | 0         | 9       |
 * | T7   | Buy Local Festival ($3)    | 0        | 3         | 6       |
 * | T8   | Buy Bookshop ($3) + auto-place | 0     | 3         | 3       |
 * | T9+  | Confirm steps (no cost)    | 0        | 0         | ≥3      |
 *
 * @module
 */

import type { MainStreetState, ResourceBank } from './MainStreetState';
import {
  type BusinessCard,
  type EventCard,
  type UpgradeCard,
  type CommunitySpaceCard,
  MARKET_BUSINESS_SLOTS,
  MARKET_INVESTMENT_UPGRADE_COUNT,
  MARKET_INVESTMENT_EVENT_COUNT,
  INCIDENT_QUEUE_SIZE,
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

// ── Scenario Interface ───────────────────────────────────────

/**
 * Describes a pre-built game state for a Main Street scenario.
 *
 * The scenario explicitly defines which cards appear in the market,
 * incident queue, and the player's starting resources — bypassing all
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
  /** Base template IDs for the development row (exactly MARKET_BUSINESS_SLOTS). */
  market: {
    development: string[];
    investments: string[];
  };
  /** Base template IDs for the incident queue (exactly INCIDENT_QUEUE_SIZE). */
  incidentQueue: string[];
  /**
   * Seed string for deterministic RNG (used for challenge selection and
   * any remaining RNG-dependent game mechanics). Does NOT affect market
   * or incident queue composition — those are driven by card IDs above.
   */
  seed: string;
}

// ── Standard Tutorial Scenario ───────────────────────────────

/**
 * The concrete tutorial scenario used by the Main Street tutorial.
 *
 * All card IDs reference Tier-1 pool cards. The market is set up so that:
 *
 * **Development Row (4 slots):**
 *   - `biz-bakery` (Bakery, $3, Food)
 *   - `biz-laundromat` (Laundromat, $4, Service) — T3 purchase target
 *   - `cs-park` (Park, $3, Culture)
 *   - `biz-bookshop` (Bookshop, $3, Culture) — T8 purchase target
 *
 * **Investments Row (3 slots: 2 upgrades + 1 investment event):**
 *   - `upg-patisserie` (Upgrade to Patisserie, $4, targets Bakery)
 *   - `upg-garden` (Upgrade to Garden, $3, targets Park)
 *   - `evt-festival` (Local Festival, $3) — T7 purchase target
 *
 * **Incident Queue (2 cards):**
 *   - `evt-award` (Community Award, +2 reputation)
 *   - `evt-rainy` (Rainy Day, -1 coin per Food business)
 *
 * **Coin Budget:** 12 starting (Easy), $4 Laundromat (T3), $3 Local Festival (T7),
 * $3 Bookshop (T8), remaining ≥2 coins. RNG-independent.
 */
export const STANDARD_TUTORIAL_SCENARIO: TutorialScenario = {
  difficulty: 'Easy',
  resourceBank: { coins: 12, reputation: 5 },
  market: {
    development: [
      'biz-bakery',
      'biz-laundromat',
      'cs-park',
      'biz-bookshop',
    ],
    investments: [
      'upg-patisserie',
      'upg-garden',
      'evt-festival',
    ],
  },
  incidentQueue: [
    'evt-award',
    'evt-rainy',
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
 * 3. Place extracted cards into the market (development / investments)
 *    and incident queue.
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
  if (scenario.market.development.length !== MARKET_BUSINESS_SLOTS) {
    throw new Error(
      `TutorialScenario: expected ${MARKET_BUSINESS_SLOTS} development row cards, ` +
      `got ${scenario.market.development.length}`,
    );
  }
  if (scenario.market.investments.length !== MARKET_INVESTMENT_UPGRADE_COUNT + MARKET_INVESTMENT_EVENT_COUNT) {
    throw new Error(
      `TutorialScenario: expected ${MARKET_INVESTMENT_UPGRADE_COUNT + MARKET_INVESTMENT_EVENT_COUNT} investments row cards, ` +
      `got ${scenario.market.investments.length}`,
    );
  }
  if (scenario.incidentQueue.length !== INCIDENT_QUEUE_SIZE) {
    throw new Error(
      `TutorialScenario: expected ${INCIDENT_QUEUE_SIZE} incident queue cards, ` +
      `got ${scenario.incidentQueue.length}`,
    );
  }

  // ── Build decks ───────────────────────────────────────────
  const businessDeck: BusinessCard[] = createBusinessDeck(3, tier1Ids);
  const communitySpaceDeck: CommunitySpaceCard[] = createCommunitySpaceDeck(3, tier1Ids);
  const eventDeck: EventCard[] = createEventDeck(3, tier1Ids, () => 0);
  const upgradeDeck: UpgradeCard[] = createUpgradeDeck(2, tier1Ids);

  // ── Extract market cards from decks by base template ID ────

  // Development row: try business deck, then community space deck
  const developmentRow: (BusinessCard | CommunitySpaceCard)[] = [];
  for (const templateId of scenario.market.development) {
    try {
      developmentRow.push(findCardByTemplate(businessDeck, templateId));
    } catch {
      // Not in business deck — try community space deck
      developmentRow.push(findCardByTemplate(communitySpaceDeck, templateId));
    }
  }

  // Investments row: try upgrade deck first, then event deck
  const investmentsRow: (UpgradeCard | EventCard)[] = [];
  for (const templateId of scenario.market.investments) {
    try {
      investmentsRow.push(findCardByTemplate(upgradeDeck, templateId));
    } catch {
      investmentsRow.push(findCardByTemplate(eventDeck, templateId));
    }
  }

  // Incident queue: from event deck
  const incidentQueue: EventCard[] = [];
  for (const templateId of scenario.incidentQueue) {
    incidentQueue.push(findCardByTemplate(eventDeck, templateId));
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
      development: developmentRow,
      investments: investmentsRow,
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
    },
    discards: {
      business: [],
      communitySpace: [],
      event: [],
      upgrade: [],
    },
    challengesCompleted: [],
    activeChallenges: [],
    incidentQueue,
    // Backfill the balance history from the scenario-defined queue so
    // subsequent constrained refills see the actual resolved sequence
    // (CG-0MSL0OP040043KKZ).
    incidentBalance: createIncidentBalanceFromQueue(incidentQueue),
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
    maxHandSize: 2,
    discardPile: [],
    staffCards: [],
    staffCardMarket: [],
    skipMarketCycleOnEndTurn: false,
    soldSlots: new Array<boolean>(GRID_SIZE).fill(false),
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
