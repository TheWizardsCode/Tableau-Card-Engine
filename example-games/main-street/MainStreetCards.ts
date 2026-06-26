/**
 * Main Street: Card Type Definitions and Fixture Data
 *
 * Defines the three card families (Business, Event, Upgrade), synergy types,
 * and the full card pool for Milestones 1 and 2.
 *
 * M1 pool: 5 Business, 5 Event, 3 Upgrade templates.
 * M2 additions: +12 Business (including multi-synergy bridge cards and
 * two new synergy types: Service, Entertainment), +12 Event, +14 Upgrade.
 *
 * @module
 */

// ── Synergy & Phase Enums ───────────────────────────────────

/** Synergy types used by Business cards for adjacency bonuses. */
export type SynergyType = 'Food' | 'Culture' | 'Commerce' | 'Service' | 'Entertainment' | 'Health';

/** When an Event card resolves. */
export type EventTrigger = 'Investment' | 'Incident';

/** Scope of an Event card's effect. */
export type EventTarget = 'All' | 'SpecificSynergy' | 'RandomBusiness';

/** Discriminator for the four card families (business, event, upgrade, community-space). */
export type CardFamily = 'business' | 'event' | 'upgrade' | 'community-space';

// ── Card Interfaces ─────────────────────────────────────────

/**
 * A Business card placed on the street grid.
 * Generates base income + synergy bonuses each turn.
 */
export interface BusinessCard {
  readonly family: 'business';
  readonly id: string;
  readonly name: string;
  readonly cost: number;
  readonly baseIncome: number;
  readonly synergyTypes: readonly SynergyType[];
  readonly upgradePath?: string;
  readonly maxLevel: number;
  readonly description: string;
  /** Current upgrade level (starts at 0, incremented by upgrades). */
  level: number;
  /** Cumulative income bonus from applied upgrades. */
  incomeBonus: number;
  /** Cumulative synergy range extension from applied upgrades. */
  synergyRangeBonus: number;
  /**
   * Cumulative reputation bonus from applied upgrades.
   * Initialized to 0 for all cards.
   */
  reputationBonus: number;
  /**
   * Base reputation generated per turn by this business (without upgrades).
   * Fractional values are supported (e.g. 0.2 for the Clinic).
   */
  reputationPerTurn?: number;
  /**
   * IDs of upgrade cards that have been applied to this business instance,
   * in application order. Used to enforce multi-level chain requirements and
   * to prevent the same branch being applied twice.
   *
   * Omitting this field is treated as an empty array.
   */
  appliedUpgrades?: string[];
}

/**
 * An Event card that triggers a one-off effect.
 * Investment events are purchased and held until played; Incident events are drawn automatically.
 */
export interface EventCard {
  readonly family: 'event';
  readonly id: string;
  readonly name: string;
  readonly trigger: EventTrigger;
  readonly cost: number;
  readonly effect: string;
  readonly target: EventTarget;
  readonly targetSynergy?: SynergyType;
  readonly coinDelta: number;
  readonly reputationDelta: number;
}

/**
 * A Duration-based Event card that creates an ActiveEffect rather than
 * applying a one-shot coin/reputation delta.
 *
 * Extends EventCard with fields needed for duration-based modifiers:
 * - `duration`: number of turns the effect lasts
 * - `effectType`: discriminator for which aspect of the game is modified
 *   (e.g. 'income-multiplier', 'rep-multiplier')
 * - `multiplier`: the scalar value applied each turn (e.g. 0.8 for 80% income)
 */
export interface DurationEventCard extends EventCard {
  readonly duration: number;
  readonly effectType: string;
  readonly multiplier: number;
}

/**
 * Type guard: returns true if the given card is a DurationEventCard.
 *
 * Checks for the presence of the `duration` field (an optional field not
 * present on regular EventCard instances).
 *
 * @param card  Any card object to check.
 * @returns true if the card has DurationEventCard-specific fields.
 */
export function isDurationEventCard(card: unknown): card is DurationEventCard {
  if (card === null || card === undefined) return false;
  if (typeof card !== 'object') return false;
  const maybe = card as Record<string, unknown>;
  return (
    maybe.family === 'event' &&
    typeof maybe.duration === 'number'
  );
}

/**
 * An Upgrade card that enhances a specific Business card.
 *
 * Branching upgrades: multiple `UpgradeCard` entries may share the same
 * `targetBusiness` and `requiredLevel`, giving the player a choice of which
 * upgrade branch to take.
 *
 * Multi-level chains: set `requiredLevel > 0` so the card can only be applied
 * after the business has already been upgraded that many times.
 */
export interface UpgradeCard {
  readonly family: 'upgrade';
  readonly id: string;
  readonly name: string;
  readonly targetBusiness: string;
  readonly cost: number;
  readonly incomeBonus: number;
  readonly synergyRangeBonus: number;
  readonly description: string;
  /**
   * Minimum business level required before this upgrade may be applied.
   * 0 (default) = can be applied to the base (un-upgraded) business.
   * 1 = can only be applied after the business has been upgraded once, etc.
   *
   * Omitting this field is equivalent to setting it to 0.
   */
  readonly requiredLevel?: number;
  /**
   * Additional reputation generated per turn when this upgrade is applied.
   * Works like incomeBonus but for reputation instead of coins.
   * Fractional values are supported (e.g. 0.1 for the Medical Center upgrade).
   */
  readonly reputationBonus?: number;
}

/** Union of all card types in Main Street. */
export type AnyCard = BusinessCard | CommunitySpaceCard | EventCard | DurationEventCard | UpgradeCard;

// ── Constants ───────────────────────────────────────────────

/** Number of slots in the street grid. */
export const GRID_SIZE = 10;

/** Maximum number of turns before the game ends. */
export const MAX_TURNS = 20;

/** Score required for a win via score threshold. */
export const WIN_THRESHOLD = 150;

/** Starting coin balance. */
export const STARTING_COINS = 8;

/** Starting reputation. */
export const STARTING_REPUTATION = 3;

/** Number of Business card slots visible in the market. */
export const MARKET_BUSINESS_SLOTS = 4;

/** Total number of Investment row slots (upgrades + investment events). */
export const MARKET_INVESTMENT_SLOTS = 3;

/** Number of upgrade cards in the investment row. */
export const MARKET_INVESTMENT_UPGRADE_COUNT = 2;

/** Number of investment event cards in the investment row. */
export const MARKET_INVESTMENT_EVENT_COUNT = 1;

/**
 * @deprecated Use MARKET_INVESTMENT_SLOTS-related constants instead.
 * Kept temporarily for backward-compat during UI migration.
 */
export const MARKET_EVENT_SLOTS = MARKET_INVESTMENT_EVENT_COUNT;

/**
 * @deprecated Use MARKET_INVESTMENT_SLOTS-related constants instead.
 * Kept temporarily for backward-compat during UI migration.
 */
export const MARKET_UPGRADE_SLOTS = MARKET_INVESTMENT_UPGRADE_COUNT;

/** Number of Incident cards visible in the incident queue at game start. */
export const INCIDENT_QUEUE_SIZE = 2;

/** Fixed coin cost to refresh the investments row (buy new opportunities). */
export const REFRESH_INVESTMENTS_COST = 2;

/** Fixed coin cost to refresh the development row (discover new opportunities). */
export const REFRESH_DEVELOPMENT_COST = 2;

/** Coins earned per adjacent business sharing a synergy type. */
export const SYNERGY_BONUS_PER_NEIGHBOR = 1;

/** Multiplier applied to reputation in final score. */
export const REPUTATION_SCORE_MULTIPLIER = 5;

/** Points awarded per completed challenge. */
export const CHALLENGE_BONUS_POINTS = 10;

// ── Card Fixture Data ───────────────────────────────────────

/**
 * Creates a fresh copy of a BusinessCard from template data.
 * Mutable fields (level, incomeBonus, synergyRangeBonus, appliedUpgrades) are reset.
 */
function makeBusiness(template: Omit<BusinessCard, 'family' | 'level' | 'incomeBonus' | 'synergyRangeBonus' | 'appliedUpgrades' | 'reputationBonus'>): BusinessCard {
  return {
    family: 'business',
    level: 0,
    incomeBonus: 0,
    synergyRangeBonus: 0,
    reputationBonus: 0,
    appliedUpgrades: [],
    ...template,
  };
}

/**
 * A Community Space card placed on the street grid, parallel to BusinessCard.
 * Community spaces share the same mechanical behavior as businesses (grid placement,
 * synergy bonuses, upgrade path, level tracking) but are classified as 'community-space'
 * rather than 'business'.
 */
export interface CommunitySpaceCard {
  readonly family: 'community-space';
  readonly id: string;
  readonly name: string;
  readonly cost: number;
  readonly baseIncome: number;
  readonly synergyTypes: readonly SynergyType[];
  readonly upgradePath?: string;
  readonly maxLevel: number;
  readonly description: string;
  /** Current upgrade level (starts at 0, incremented by upgrades). */
  level: number;
  /** Cumulative income bonus from applied upgrades. */
  incomeBonus: number;
  /** Cumulative synergy range extension from applied upgrades. */
  synergyRangeBonus: number;
  /**
   * Cumulative reputation bonus from applied upgrades.
   * Initialized to 0 for all cards.
   */
  reputationBonus: number;
  /**
   * Base reputation generated per turn by this community space (without upgrades).
   * Fractional values are supported (e.g. 0.2).
   */
  reputationPerTurn?: number;
  /**
   * IDs of upgrade cards that have been applied to this community space instance,
   * in application order.
   *
   * Omitting this field is treated as an empty array.
   */
  appliedUpgrades?: string[];
}

/**
 * Creates a fresh copy of a CommunitySpaceCard from template data.
 * Mutable fields (level, incomeBonus, synergyRangeBonus, appliedUpgrades) are reset.
 */
function makeCommunitySpace(template: Omit<CommunitySpaceCard, 'family' | 'level' | 'incomeBonus' | 'synergyRangeBonus' | 'appliedUpgrades' | 'reputationBonus'>): CommunitySpaceCard {
  return {
    family: 'community-space',
    level: 0,
    incomeBonus: 0,
    synergyRangeBonus: 0,
    reputationBonus: 0,
    appliedUpgrades: [],
    ...template,
  };
}

/** Template data for all Business cards (M1 + M2 pool). */
const BUSINESS_TEMPLATES: Omit<BusinessCard, 'family' | 'level' | 'incomeBonus' | 'synergyRangeBonus' | 'reputationBonus'>[] = [
  {
    id: 'biz-bakery',
    name: 'Bakery',
    cost: 6,
    baseIncome: 1,
    synergyTypes: ['Food'],
    upgradePath: 'Bakery',
    maxLevel: 2,
    description: 'Provides warm pastries. Gains +1 coin for each adjacent Food business.',
  },
  {
    id: 'biz-diner',
    name: 'Diner',
    cost: 8,
    baseIncome: 1,
    synergyTypes: ['Food'],
    upgradePath: 'Diner',
    maxLevel: 2,
    description: 'Serves quick meals. Gains +1 coin per adjacent Food business.',
  },
  {
    id: 'biz-bookshop',
    name: 'Bookshop',
    cost: 8,
    baseIncome: 1,
    synergyTypes: ['Culture'],
    upgradePath: 'Bookshop',
    maxLevel: 1,
    description: 'Sells books. Gains +1 coin per adjacent Culture business.',
  },
  {
    id: 'biz-hardware',
    name: 'Hardware Store',
    cost: 10,
    baseIncome: 1,
    synergyTypes: ['Commerce'],
    upgradePath: 'Hardware Store',
    maxLevel: 1,
    description: 'Supplies tools. Gains +1 coin per adjacent Commerce business.',
  },
  // ── M2 Expanded Business Templates ──────────────────────────
  // Commerce (fills the gap: M1 had only 1 Commerce business)
  {
    id: 'biz-pawnshop',
    name: 'Pawn Shop',
    cost: 6,
    baseIncome: 1,
    synergyTypes: ['Commerce'],
    upgradePath: 'Pawn Shop',
    maxLevel: 1,
    description: 'Trades second-hand goods. Does not provide or receive synergy bonuses.',
  },
  {
    id: 'biz-boutique',
    name: 'Boutique',
    cost: 8,
    baseIncome: 1,
    synergyTypes: ['Commerce'],
    upgradePath: 'Boutique',
    maxLevel: 1,
    description: 'Sells curated fashion. Gains +1 coin per adjacent Commerce business.',
  },
  // Service (new synergy type)
  {
    id: 'biz-laundromat',
    name: 'Laundromat',
    cost: 6,
    baseIncome: 1,
    synergyTypes: ['Service'],
    upgradePath: 'Laundromat',
    maxLevel: 1,
    description: 'Provides self-serve laundry. Gains +1 coin per adjacent Service business.',
  },
  {
    id: 'biz-barbershop',
    name: 'Barbershop',
    cost: 6,
    baseIncome: 1,
    synergyTypes: ['Service'],
    upgradePath: 'Barbershop',
    maxLevel: 1,
    description: 'Classic cuts and conversation. Gains +1 coin per adjacent Service business.',
  },
  // Entertainment (new synergy type)
  {
    id: 'biz-arcade',
    name: 'Arcade',
    cost: 8,
    baseIncome: 1,
    synergyTypes: ['Entertainment'],
    upgradePath: 'Arcade',
    maxLevel: 1,
    description: 'Retro fun for all ages. Gains +1 coin per adjacent Entertainment business.',
  },
  {
    id: 'biz-cinema',
    name: 'Cinema',
    cost: 10,
    baseIncome: 1,
    synergyTypes: ['Entertainment'],
    upgradePath: 'Cinema',
    maxLevel: 2,
    description: 'Shows the latest films. Gains +1 coin per adjacent Entertainment business.',
  },
  // Multi-synergy bridge cards (belong to two synergy types)
  {
    id: 'biz-cafe',
    name: 'Cafe',
    cost: 6,
    baseIncome: 1,
    synergyTypes: ['Food', 'Culture'],
    upgradePath: 'Cafe',
    maxLevel: 1,
    description: 'Coffee and conversation. Bridges Food and Culture synergies.',
  },
  {
    id: 'biz-food-truck',
    name: 'Food Truck',
    cost: 4,
    baseIncome: 0,
    synergyTypes: ['Food', 'Entertainment'],
    upgradePath: 'Food Truck',
    maxLevel: 1,
    description: 'Street eats with flair. Bridges Food and Entertainment synergies.',
  },
  {
    id: 'biz-gallery',
    name: 'Art Gallery',
    cost: 8,
    baseIncome: 1,
    synergyTypes: ['Culture', 'Entertainment'],
    upgradePath: 'Art Gallery',
    maxLevel: 1,
    description: 'Showcases local artists. Bridges Culture and Entertainment synergies.',
  },
  {
    id: 'biz-spa',
    name: 'Day Spa',
    cost: 10,
    baseIncome: 1,
    synergyTypes: ['Service', 'Entertainment'],
    upgradePath: 'Day Spa',
    maxLevel: 2,
    description: 'Relaxation and pampering. Bridges Service and Entertainment synergies.',
  },
  // Additional variety
  {
    id: 'biz-florist',
    name: 'Florist',
    cost: 4,
    baseIncome: 0,
    synergyTypes: ['Commerce', 'Culture'],
    upgradePath: 'Florist',
    maxLevel: 1,
    description: 'Beautiful arrangements for every occasion. Bridges Commerce and Culture synergies.',
  },
  {
    id: 'biz-clinic',
    name: 'Clinic',
    cost: 10,
    baseIncome: 0,
    synergyTypes: ['Health'],
    upgradePath: 'Clinic',
    maxLevel: 1,
    reputationPerTurn: 0.2,
    description: 'Walk-in medical care for the community. Provides +0.2 reputation per turn. Gains +1 coin per adjacent Health business.',
  },
  {
    id: 'biz-private-clinic',
    name: 'Private Clinic',
    cost: 8,
    baseIncome: 2,
    synergyTypes: ['Health'],
    upgradePath: 'Private Clinic',
    maxLevel: 1,
    description: 'A private medical practice focused on profitability. Gains +1 coin per adjacent Health business.',
  },
  {
    id: 'biz-pharmacy',
    name: 'Pharmacy',
    cost: 6,
    baseIncome: 1,
    synergyTypes: ['Health'],
    maxLevel: 0,
    description: 'Provides essential medications. Gains +1 coin per adjacent Health business.',
  },
];

/** Template data for all Community Space cards (reclassified Park + new community spaces). */
const COMMUNITY_SPACE_TEMPLATES: Omit<CommunitySpaceCard, 'family' | 'level' | 'incomeBonus' | 'synergyRangeBonus' | 'reputationBonus'>[] = [
  {
    id: 'cs-park',
    name: 'Park',
    cost: 4,
    baseIncome: 0,
    synergyTypes: ['Culture'],
    upgradePath: 'Park',
    maxLevel: 1,
    description: 'Offers leisure space. Gains +1 coin per adjacent Culture business or community space.',
  },
  {
    id: 'cs-library',
    name: 'Library',
    cost: 6,
    baseIncome: 1,
    synergyTypes: ['Culture'],
    upgradePath: 'Library',
    maxLevel: 1,
    description: 'A quiet community space for reading and learning. Gains +1 coin per adjacent Culture business or community space.',
  },
];

/** Template data for all Event cards (M1 + M2 pool). */
const EVENT_TEMPLATES: EventCard[] = [
  {
    family: 'event',
    id: 'evt-festival',
    name: 'Local Festival',
    trigger: 'Investment',
    cost: 3,
    effect: '+2 coins to all Culture businesses and +1 reputation.',
    target: 'SpecificSynergy',
    targetSynergy: 'Culture',
    coinDelta: 2,
    reputationDelta: 1,
  },
  {
    family: 'event',
    id: 'evt-rainy',
    name: 'Rainy Day',
    trigger: 'Incident',
    cost: 0,
    effect: '-1 coin to all Food businesses this turn.',
    target: 'SpecificSynergy',
    targetSynergy: 'Food',
    coinDelta: -1,
    reputationDelta: 0,
  },
  {
    family: 'event',
    id: 'evt-tax',
    name: 'Tax Audit',
    trigger: 'Incident',
    cost: 0,
    effect: 'Lose 3 coins.',
    target: 'All',
    coinDelta: -3,
    reputationDelta: 0,
  },
  {
    family: 'event',
    id: 'evt-award',
    name: 'Community Award',
    trigger: 'Incident',
    cost: 0,
    effect: 'Gain 2 reputation from community recognition.',
    target: 'All',
    coinDelta: 0,
    reputationDelta: 2,
  },
  {
    family: 'event',
    id: 'evt-inspection',
    name: 'Health Inspection',
    trigger: 'Incident',
    cost: 0,
    effect: '-2 coins per Food business and -1 reputation.',
    target: 'SpecificSynergy',
    targetSynergy: 'Food',
    coinDelta: -2,
    reputationDelta: -1,
  },
  // ── M2 Expanded Event Templates ─────────────────────────────
  // Investment events (positive, purchased)
  {
    family: 'event',
    id: 'evt-grand-opening',
    name: 'Grand Opening Sale',
    trigger: 'Investment',
    cost: 2,
    effect: '+3 coins from a Commerce promotion.',
    target: 'SpecificSynergy',
    targetSynergy: 'Commerce',
    coinDelta: 3,
    reputationDelta: 0,
  },
  {
    family: 'event',
    id: 'evt-wellness-fair',
    name: 'Wellness Fair',
    trigger: 'Investment',
    cost: 3,
    effect: '+2 coins per Service business and +1 reputation.',
    target: 'SpecificSynergy',
    targetSynergy: 'Service',
    coinDelta: 2,
    reputationDelta: 1,
  },
  {
    family: 'event',
    id: 'evt-block-party',
    name: 'Block Party',
    trigger: 'Investment',
    cost: 4,
    effect: '+2 coins per Entertainment business and +2 reputation.',
    target: 'SpecificSynergy',
    targetSynergy: 'Entertainment',
    coinDelta: 2,
    reputationDelta: 2,
  },
  {
    family: 'event',
    id: 'evt-charity-drive',
    name: 'Charity Drive',
    trigger: 'Investment',
    cost: 2,
    effect: '+3 reputation from generous donations.',
    target: 'All',
    coinDelta: 0,
    reputationDelta: 3,
  },
  // Incident events (negative/disruptive, drawn automatically)
  {
    family: 'event',
    id: 'evt-power-outage',
    name: 'Power Outage',
    trigger: 'Incident',
    cost: 0,
    effect: '-2 coins from lost business during the outage.',
    target: 'All',
    coinDelta: -2,
    reputationDelta: 0,
  },
  {
    family: 'event',
    id: 'evt-shoplifting',
    name: 'Shoplifting Spree',
    trigger: 'Incident',
    cost: 0,
    effect: '-2 coins per Commerce business from theft losses.',
    target: 'SpecificSynergy',
    targetSynergy: 'Commerce',
    coinDelta: -2,
    reputationDelta: 0,
  },
  {
    family: 'event',
    id: 'evt-noise-complaint',
    name: 'Noise Complaint',
    trigger: 'Incident',
    cost: 0,
    effect: '-1 coin per Entertainment business and -1 reputation.',
    target: 'SpecificSynergy',
    targetSynergy: 'Entertainment',
    coinDelta: -1,
    reputationDelta: -1,
  },
  {
    family: 'event',
    id: 'evt-pipe-burst',
    name: 'Pipe Burst',
    trigger: 'Incident',
    cost: 0,
    effect: '-2 coins per Service business from water damage.',
    target: 'SpecificSynergy',
    targetSynergy: 'Service',
    coinDelta: -2,
    reputationDelta: 0,
  },
  {
    family: 'event',
    id: 'evt-food-critic',
    name: 'Food Critic Visit',
    trigger: 'Incident',
    cost: 0,
    effect: '+1 coin per Food business and +1 reputation from a glowing review.',
    target: 'SpecificSynergy',
    targetSynergy: 'Food',
    coinDelta: 1,
    reputationDelta: 1,
  },
  {
    family: 'event',
    id: 'evt-construction',
    name: 'Road Construction',
    trigger: 'Incident',
    cost: 0,
    effect: '-1 coin to all businesses from reduced foot traffic.',
    target: 'All',
    coinDelta: -1,
    reputationDelta: 0,
  },
  {
    family: 'event',
    id: 'evt-viral-review',
    name: 'Viral Review',
    trigger: 'Incident',
    cost: 0,
    effect: '+2 coins and +1 reputation from sudden online fame.',
    target: 'All',
    coinDelta: 2,
    reputationDelta: 1,
  },
  {
    family: 'event',
    id: 'evt-vandalism',
    name: 'Vandalism',
    trigger: 'Incident',
    cost: 0,
    effect: '-1 coin to all businesses and -1 reputation.',
    target: 'All',
    coinDelta: -1,
    reputationDelta: -1,
  },
  // ── Duration-based Event (M2 Tier 4) ────────────────────────
  {
    family: 'event',
    id: 'evt-flu-outbreak',
    name: 'Flu Outbreak',
    trigger: 'Incident',
    cost: 0,
    effect: 'All businesses generate 80% income for 5 turns. Duration reduced by Clinic/Medical Center.',
    target: 'All',
    coinDelta: 0,
    reputationDelta: 0,
    duration: 5,
    effectType: 'income-multiplier',
    multiplier: 0.8,
  } as DurationEventCard,
  // ── M3 Expanded Event Templates (doubled unique event count) ─────
  // Investment events (positive, purchased)
  {
    family: 'event',
    id: 'evt-harvest-festival',
    name: 'Harvest Festival',
    trigger: 'Investment',
    cost: 3,
    effect: '+2 coins to each Food business and +1 reputation from a bountiful harvest celebration.',
    target: 'SpecificSynergy',
    targetSynergy: 'Food',
    coinDelta: 2,
    reputationDelta: 1,
  },
  {
    family: 'event',
    id: 'evt-health-campaign',
    name: 'Health Campaign',
    trigger: 'Investment',
    cost: 3,
    effect: '+1 coin to each Health business and +1 reputation from a wellness initiative.',
    target: 'SpecificSynergy',
    targetSynergy: 'Health',
    coinDelta: 1,
    reputationDelta: 1,
  },
  {
    family: 'event',
    id: 'evt-street-performer',
    name: 'Street Performer',
    trigger: 'Investment',
    cost: 2,
    effect: '+2 coins to each Entertainment business from a popular busker drawing crowds.',
    target: 'SpecificSynergy',
    targetSynergy: 'Entertainment',
    coinDelta: 2,
    reputationDelta: 0,
  },
  {
    family: 'event',
    id: 'evt-bulk-purchase',
    name: 'Bulk Purchase',
    trigger: 'Investment',
    cost: 3,
    effect: '+1 coin to each Commerce business and +2 reputation from collective buying power.',
    target: 'SpecificSynergy',
    targetSynergy: 'Commerce',
    coinDelta: 1,
    reputationDelta: 2,
  },
  {
    family: 'event',
    id: 'evt-book-fair',
    name: 'Book Fair',
    trigger: 'Investment',
    cost: 3,
    effect: '+1 coin to each Culture business and +2 reputation from literary events.',
    target: 'SpecificSynergy',
    targetSynergy: 'Culture',
    coinDelta: 1,
    reputationDelta: 2,
  },
  {
    family: 'event',
    id: 'evt-volunteer-day',
    name: 'Volunteer Day',
    trigger: 'Investment',
    cost: 2,
    effect: '+1 coin to each Service business and +2 reputation from community volunteering.',
    target: 'SpecificSynergy',
    targetSynergy: 'Service',
    coinDelta: 1,
    reputationDelta: 2,
  },
  {
    family: 'event',
    id: 'evt-community-garden',
    name: 'Community Garden',
    trigger: 'Investment',
    cost: 2,
    effect: '+1 coin and +1 reputation from a new community garden project.',
    target: 'All',
    coinDelta: 1,
    reputationDelta: 1,
  },
  {
    family: 'event',
    id: 'evt-festival-season',
    name: 'Festival Season',
    trigger: 'Investment',
    cost: 4,
    effect: '+3 coins from increased tourist spending during festival season.',
    target: 'All',
    coinDelta: 3,
    reputationDelta: 0,
  },
  // Incident events (mixed positive/negative, drawn automatically)
  {
    family: 'event',
    id: 'evt-protest',
    name: 'Protest',
    trigger: 'Incident',
    cost: 0,
    effect: '-2 coins from reduced foot traffic and -1 reputation from negative publicity.',
    target: 'All',
    coinDelta: -2,
    reputationDelta: -1,
  },
  {
    family: 'event',
    id: 'evt-supply-chain',
    name: 'Supply Chain Delay',
    trigger: 'Incident',
    cost: 0,
    effect: '-2 coins per Commerce business from delayed inventory.',
    target: 'SpecificSynergy',
    targetSynergy: 'Commerce',
    coinDelta: -2,
    reputationDelta: 0,
  },
  {
    family: 'event',
    id: 'evt-power-surge',
    name: 'Power Surge',
    trigger: 'Incident',
    cost: 0,
    effect: '-2 coins per Service business from equipment damage.',
    target: 'SpecificSynergy',
    targetSynergy: 'Service',
    coinDelta: -2,
    reputationDelta: 0,
  },
  {
    family: 'event',
    id: 'evt-strike',
    name: 'Strike',
    trigger: 'Incident',
    cost: 0,
    effect: '-2 coins from work stoppages affecting the street.',
    target: 'All',
    coinDelta: -2,
    reputationDelta: 0,
  },
  {
    family: 'event',
    id: 'evt-heatwave',
    name: 'Heatwave',
    trigger: 'Incident',
    cost: 0,
    effect: '-1 coin per Food business from spoiled goods and -1 reputation.',
    target: 'SpecificSynergy',
    targetSynergy: 'Food',
    coinDelta: -1,
    reputationDelta: -1,
  },
  {
    family: 'event',
    id: 'evt-pest-infestation',
    name: 'Pest Infestation',
    trigger: 'Incident',
    cost: 0,
    effect: '-2 coins per Food business from health-related closures.',
    target: 'SpecificSynergy',
    targetSynergy: 'Food',
    coinDelta: -2,
    reputationDelta: 0,
  },
  {
    family: 'event',
    id: 'evt-slow-season',
    name: 'Slow Season',
    trigger: 'Incident',
    cost: 0,
    effect: '-1 coin to all businesses from reduced customer traffic.',
    target: 'All',
    coinDelta: -1,
    reputationDelta: 0,
  },
  {
    family: 'event',
    id: 'evt-good-press',
    name: 'Good Press',
    trigger: 'Incident',
    cost: 0,
    effect: '+1 reputation from a favourable news article about Main Street.',
    target: 'All',
    coinDelta: 0,
    reputationDelta: 1,
  },
  {
    family: 'event',
    id: 'evt-tourist-bus',
    name: 'Tourist Bus',
    trigger: 'Incident',
    cost: 0,
    effect: '+2 coins per Entertainment business from a tour bus dropping visitors.',
    target: 'SpecificSynergy',
    targetSynergy: 'Entertainment',
    coinDelta: 2,
    reputationDelta: 0,
  },
  {
    family: 'event',
    id: 'evt-cultural-grant',
    name: 'Cultural Grant',
    trigger: 'Incident',
    cost: 0,
    effect: '+1 coin per Culture business and +1 reputation from a government arts grant.',
    target: 'SpecificSynergy',
    targetSynergy: 'Culture',
    coinDelta: 1,
    reputationDelta: 1,
  },
];

/** Template data for all Upgrade cards (M1 + M2 pool). */
const UPGRADE_TEMPLATES: UpgradeCard[] = [
  // ── M1 Base Upgrades (requiredLevel: 0) ─────────────────────
  {
    family: 'upgrade',
    id: 'upg-patisserie',
    name: 'Upgrade to Patisserie',
    targetBusiness: 'Bakery',
    cost: 4,
    incomeBonus: 1,
    synergyRangeBonus: 1,
    requiredLevel: 0,
    description: 'Turns a Bakery into a Patisserie, increasing income and synergy range.',
  },
  {
    family: 'upgrade',
    id: 'upg-bistro',
    name: 'Upgrade to Bistro',
    targetBusiness: 'Diner',
    cost: 4,
    incomeBonus: 1,
    synergyRangeBonus: 1,
    requiredLevel: 0,
    description: 'Turns a Diner into a Bistro with higher foot-traffic.',
  },
  {
    family: 'upgrade',
    id: 'upg-library',
    name: 'Upgrade to Library',
    targetBusiness: 'Bookshop',
    cost: 3,
    incomeBonus: 1,
    synergyRangeBonus: 0,
    requiredLevel: 0,
    description: 'Adds a cultural boost to the Bookshop.',
  },
  // ── M2 Expanded Upgrade Templates ───────────────────────────
  {
    family: 'upgrade',
    id: 'upg-garden',
    name: 'Upgrade to Garden',
    targetBusiness: 'Park',
    cost: 3,
    incomeBonus: 1,
    synergyRangeBonus: 1,
    requiredLevel: 0,
    description: 'Expands the Park into a Garden with extended cultural reach.',
  },
  {
    family: 'upgrade',
    id: 'upg-home-improvement',
    name: 'Upgrade to Home Improvement',
    targetBusiness: 'Hardware Store',
    cost: 4,
    incomeBonus: 1,
    synergyRangeBonus: 1,
    requiredLevel: 0,
    description: 'Transforms the Hardware Store into a Home Improvement center.',
  },
  {
    family: 'upgrade',
    id: 'upg-vintage-shop',
    name: 'Upgrade to Vintage Shop',
    targetBusiness: 'Pawn Shop',
    cost: 3,
    incomeBonus: 1,
    synergyRangeBonus: 0,
    requiredLevel: 0,
    description: 'Rebrands the Pawn Shop as a trendy Vintage Shop.',
  },
  {
    family: 'upgrade',
    id: 'upg-designer-store',
    name: 'Upgrade to Designer Store',
    targetBusiness: 'Boutique',
    cost: 4,
    incomeBonus: 1,
    synergyRangeBonus: 1,
    requiredLevel: 0,
    description: 'Elevates the Boutique to a Designer Store with premium clientele.',
  },
  {
    family: 'upgrade',
    id: 'upg-dry-cleaners',
    name: 'Upgrade to Dry Cleaners',
    targetBusiness: 'Laundromat',
    cost: 3,
    incomeBonus: 1,
    synergyRangeBonus: 0,
    requiredLevel: 0,
    description: 'Upgrades the Laundromat to a full-service Dry Cleaners.',
  },
  {
    family: 'upgrade',
    id: 'upg-salon',
    name: 'Upgrade to Salon',
    targetBusiness: 'Barbershop',
    cost: 3,
    incomeBonus: 1,
    synergyRangeBonus: 1,
    requiredLevel: 0,
    description: 'Expands the Barbershop into a modern Salon.',
  },
  {
    family: 'upgrade',
    id: 'upg-gaming-lounge',
    name: 'Upgrade to Gaming Lounge',
    targetBusiness: 'Arcade',
    cost: 4,
    incomeBonus: 1,
    synergyRangeBonus: 1,
    requiredLevel: 0,
    description: 'Transforms the Arcade into a state-of-the-art Gaming Lounge.',
  },
  {
    family: 'upgrade',
    id: 'upg-imax',
    name: 'Upgrade to IMAX Theater',
    targetBusiness: 'Cinema',
    cost: 5,
    incomeBonus: 2,
    synergyRangeBonus: 1,
    requiredLevel: 0,
    description: 'Upgrades the Cinema to an IMAX Theater with premium experience.',
  },
  {
    family: 'upgrade',
    id: 'upg-roastery',
    name: 'Upgrade to Roastery',
    targetBusiness: 'Cafe',
    cost: 3,
    incomeBonus: 1,
    synergyRangeBonus: 1,
    requiredLevel: 0,
    description: 'Turns the Cafe into a specialty Roastery with artisan appeal.',
  },
  {
    family: 'upgrade',
    id: 'upg-gourmet-truck',
    name: 'Upgrade to Gourmet Truck',
    targetBusiness: 'Food Truck',
    cost: 2,
    incomeBonus: 1,
    synergyRangeBonus: 0,
    requiredLevel: 0,
    description: 'Elevates the Food Truck with gourmet offerings.',
  },
  {
    family: 'upgrade',
    id: 'upg-museum',
    name: 'Upgrade to Museum',
    targetBusiness: 'Art Gallery',
    cost: 4,
    incomeBonus: 1,
    synergyRangeBonus: 1,
    requiredLevel: 0,
    description: 'Expands the Art Gallery into a full Museum.',
  },
  {
    family: 'upgrade',
    id: 'upg-resort-spa',
    name: 'Upgrade to Resort Spa',
    targetBusiness: 'Day Spa',
    cost: 5,
    incomeBonus: 2,
    synergyRangeBonus: 1,
    requiredLevel: 0,
    description: 'Transforms the Day Spa into a luxurious Resort Spa.',
  },
  {
    family: 'upgrade',
    id: 'upg-garden-center',
    name: 'Upgrade to Garden Center',
    targetBusiness: 'Florist',
    cost: 3,
    incomeBonus: 1,
    synergyRangeBonus: 1,
    requiredLevel: 0,
    description: 'Expands the Florist into a full Garden Center.',
  },
  {
    family: 'upgrade',
    id: 'upg-medical-center',
    name: 'Upgrade to Medical Center',
    targetBusiness: 'Clinic',
    cost: 5,
    incomeBonus: 0,
    synergyRangeBonus: 1,
    reputationBonus: 0.1,
    requiredLevel: 0,
    description: 'Upgrades the Clinic to a comprehensive Medical Center. Provides +0.1 reputation per turn.',
  },
  {
    family: 'upgrade',
    id: 'upg-private-medical-center',
    name: 'Upgrade to Private Medical Center',
    targetBusiness: 'Private Clinic',
    cost: 4,
    incomeBonus: 2,
    synergyRangeBonus: 0,
    requiredLevel: 0,
    description: 'Expands the Private Clinic into a high-revenue Private Medical Center.',
  },
  // ── Branching Upgrades (alternative level-0 paths) ──────────
  // Bakery branches: Patisserie (above, food-artisan) vs Bread Factory (volume)
  {
    family: 'upgrade',
    id: 'upg-bread-factory',
    name: 'Upgrade to Bread Factory',
    targetBusiness: 'Bakery',
    cost: 3,
    incomeBonus: 2,
    synergyRangeBonus: 0,
    requiredLevel: 0,
    description: 'Scales the Bakery into a high-volume Bread Factory. More income, no range boost.',
  },
  // Diner branches: Bistro (above, quality) vs Fast Food (volume)
  {
    family: 'upgrade',
    id: 'upg-fast-food',
    name: 'Upgrade to Fast Food',
    targetBusiness: 'Diner',
    cost: 3,
    incomeBonus: 2,
    synergyRangeBonus: 0,
    requiredLevel: 0,
    description: 'Converts the Diner to a Fast Food outlet. Higher income, smaller synergy radius.',
  },
  // Cinema branches: IMAX (above, premium) vs Drive-In (community)
  {
    family: 'upgrade',
    id: 'upg-drive-in',
    name: 'Upgrade to Drive-In Theater',
    targetBusiness: 'Cinema',
    cost: 4,
    incomeBonus: 1,
    synergyRangeBonus: 2,
    requiredLevel: 0,
    description: 'Turns the Cinema into a Drive-In Theater with a much wider community reach.',
  },
  // Day Spa branches: Resort Spa (above, premium) vs Wellness Center (service-range)
  {
    family: 'upgrade',
    id: 'upg-wellness-center',
    name: 'Upgrade to Wellness Center',
    targetBusiness: 'Day Spa',
    cost: 4,
    incomeBonus: 1,
    synergyRangeBonus: 2,
    requiredLevel: 0,
    description: 'Expands the Day Spa into a Wellness Center with a broader service footprint.',
  },
  // ── Multi-Level Upgrades (requiredLevel: 1) ──────────────────
  // Level-2 upgrade for Bakery (after Patisserie or Bread Factory)
  {
    family: 'upgrade',
    id: 'upg-grand-bakehouse',
    name: 'Upgrade to Grand Bakehouse',
    targetBusiness: 'Bakery',
    cost: 5,
    incomeBonus: 2,
    synergyRangeBonus: 1,
    requiredLevel: 1,
    description: 'The pinnacle of baking craft — a Grand Bakehouse drawing visitors from afar.',
  },
  // Level-2 upgrade for Diner (after Bistro or Fast Food)
  {
    family: 'upgrade',
    id: 'upg-restaurant',
    name: 'Upgrade to Restaurant',
    targetBusiness: 'Diner',
    cost: 5,
    incomeBonus: 2,
    synergyRangeBonus: 1,
    requiredLevel: 1,
    description: 'Elevates the Diner all the way to a full-service Restaurant.',
  },
  // Level-2 upgrade for Cinema (after IMAX or Drive-In)
  {
    family: 'upgrade',
    id: 'upg-multiplex',
    name: 'Upgrade to Multiplex',
    targetBusiness: 'Cinema',
    cost: 6,
    incomeBonus: 3,
    synergyRangeBonus: 1,
    requiredLevel: 1,
    description: 'A massive Multiplex complex — the entertainment heart of Main Street.',
  },
  // Level-2 upgrade for Day Spa (after Resort Spa or Wellness Center)
  {
    family: 'upgrade',
    id: 'upg-luxury-retreat',
    name: 'Upgrade to Luxury Retreat',
    targetBusiness: 'Day Spa',
    cost: 6,
    incomeBonus: 3,
    synergyRangeBonus: 1,
    requiredLevel: 1,
    description: 'A destination Luxury Retreat — the most prestigious business on the street.',
  },
  // ── Community Space Upgrades ────────────────────────────────
  {
    family: 'upgrade',
    id: 'upg-community-hub',
    name: 'Upgrade to Community Hub',
    targetBusiness: 'Library',
    cost: 4,
    incomeBonus: 1,
    synergyRangeBonus: 1,
    requiredLevel: 0,
    description: 'Expands the Library into a Community Hub with extended cultural reach.',
  },
];

// ── Deck Building ───────────────────────────────────────────

/**
 * Creates the full Business deck for a game (each template repeated
 * `copies` times to ensure adequate supply for 20 turns).
 *
 * @param copies          Number of copies per template (default 3).
 * @param unlockedCardIds Optional list of unlocked card IDs for tier filtering.
 *                        When provided, only templates whose ID is in this list
 *                        are included. When omitted, the full pool is used.
 */
export function createBusinessDeck(
  copies: number = 3,
  unlockedCardIds?: string[],
): BusinessCard[] {
  const templates = unlockedCardIds
    ? BUSINESS_TEMPLATES.filter((t) => unlockedCardIds.includes(t.id))
    : BUSINESS_TEMPLATES;

  const deck: BusinessCard[] = [];
  for (let c = 0; c < copies; c++) {
    for (const template of templates) {
      deck.push(makeBusiness({ ...template, id: `${template.id}-${c}` }));
    }
  }
  return deck;
}

/**
 * Creates the full Community Space deck for a game (each template repeated
 * `copies` times). Community space cards are mixed into the development market
 * row alongside business cards.
 *
 * @param copies          Number of copies per template (default 3).
 * @param unlockedCardIds Optional list of unlocked card IDs for tier filtering.
 *                        When provided, only templates whose ID is in this list
 *                        are included. When omitted, the full pool is used.
 */
export function createCommunitySpaceDeck(
  copies: number = 3,
  unlockedCardIds?: string[],
): CommunitySpaceCard[] {
  const templates = unlockedCardIds
    ? COMMUNITY_SPACE_TEMPLATES.filter((t) => unlockedCardIds.includes(t.id))
    : COMMUNITY_SPACE_TEMPLATES;

  const deck: CommunitySpaceCard[] = [];
  for (let c = 0; c < copies; c++) {
    for (const template of templates) {
      deck.push(makeCommunitySpace({ ...template, id: `${template.id}-${c}` }));
    }
  }
  return deck;
}

/**
 * Creates the full Event deck for a game.
 *
 * @param copies          Number of copies per template (default 3).
 * @param unlockedCardIds Optional list of unlocked card IDs for tier filtering.
 *                        When provided, only templates whose ID is in this list
 *                        are included. When omitted, the full pool is used.
 */
/**
 * Creates the full Event deck for a game.
 *
 * Supports an optional `positiveIncidentMultiplier` to increase the
 * relative frequency of positive Incident events by duplicating positive
 * Incident templates before deck assembly. This keeps selection deterministic
 * under the seeded RNG used throughout Main Street while allowing tuning
 * without changing core selection logic.
 *
 * @param copies          Number of copies per template (default 3).
 * @param unlockedCardIds Optional list of unlocked card IDs for tier filtering.
 * @param positiveIncidentMultiplier Multiplier applied to positive Incident templates (>=1).
 */
export function createEventDeck(
  copies: number = 3,
  unlockedCardIds: string[] | undefined,
  rng: () => number,
  positiveIncidentMultiplier: number = 1,
): EventCard[] {
  const templates = unlockedCardIds
    ? EVENT_TEMPLATES.filter((t) => unlockedCardIds.includes(t.id))
    : EVENT_TEMPLATES;

  // If multiplier > 1, positive Incident templates should appear more often.
  // Implement fractional multipliers deterministically without introducing
  // a seeded RNG dependency: we give every positive Incident template
  // `baseDup = floor(multiplier)` repeats, then distribute the fractional
  // remainder by granting one extra repeat to `extraCount` templates. The
  // selection is deterministic (first N positive templates in template
  // order) so behavior is stable across runs.
  const deck: EventCard[] = [];
  let serial = 0;

  const mult = Math.max(1, positiveIncidentMultiplier);
  const baseDup = Math.floor(mult);
  const fraction = mult - baseDup;

  // Identify positions (indices) of positive Incident templates in the
  // `templates` array so we can select which ones receive the fractional
  // extra duplicates.
  const positiveIndices: number[] = [];
  for (let i = 0; i < templates.length; i++) {
    const t = templates[i];
    if (t.trigger === 'Incident' && (t.coinDelta + t.reputationDelta) > 0) {
      positiveIndices.push(i);
    }
  }

  const positiveCount = positiveIndices.length;
  const extraCount = Math.round(fraction * positiveCount);

  // Decide which positive template indices receive the extra +1 duplicate.
  // Always use the provided seeded RNG to shuffle and choose extraCount
  // indices. This makes the fractional distribution deterministic per-game
  // seed and removes order bias.
  const extraSet = new Set<number>();
  if (extraCount > 0 && positiveCount > 0) {
    // Shuffle a copy of positiveIndices using Fisher-Yates with provided RNG
    const idxs = positiveIndices.slice();
    for (let i = idxs.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = idxs[i]; idxs[i] = idxs[j]; idxs[j] = tmp;
    }
    for (let k = 0; k < extraCount; k++) extraSet.add(idxs[k]);
  }

  // Iterate templates and assign duplicates. For positive templates, add
  // `baseDup` plus 1 if the template's index is in extraSet. For all others, use 1.
  for (let i = 0; i < templates.length; i++) {
    const template = templates[i];
    const net = template.coinDelta + template.reputationDelta;
    const isPositiveIncident = template.trigger === 'Incident' && net > 0;
    let dupCount = 1;
    if (isPositiveIncident) {
      dupCount = baseDup + (extraSet.has(i) ? 1 : 0);
    }

    const repeat = copies * dupCount;
    for (let r = 0; r < repeat; r++) {
      deck.push({ ...template, id: `${template.id}-${serial}` });
      serial += 1;
    }
  }

  return deck;
}

/**
 * Creates the full Upgrade deck for a game.
 *
 * @param copies          Number of copies per template (default 2).
 * @param unlockedCardIds Optional list of unlocked card IDs for tier filtering.
 *                        When provided, only templates whose ID is in this list
 *                        are included. When omitted, the full pool is used.
 */
export function createUpgradeDeck(
  copies: number = 2,
  unlockedCardIds?: string[],
): UpgradeCard[] {
  const templates = unlockedCardIds
    ? UPGRADE_TEMPLATES.filter((t) => unlockedCardIds.includes(t.id))
    : UPGRADE_TEMPLATES;

  const deck: UpgradeCard[] = [];
  for (let c = 0; c < copies; c++) {
    for (const template of templates) {
      deck.push({ ...template, id: `${template.id}-${c}` });
    }
  }
  return deck;
}

/**
 * Returns the synergy-type color used for placeholder card rendering.
 */
export function synergyColor(type: SynergyType): number {
  switch (type) {
    case 'Food':          return 0xE67E22; // Orange
    case 'Culture':       return 0x3498DB; // Blue
    case 'Commerce':      return 0x27AE60; // Green
    case 'Service':       return 0x9B59B6; // Purple
    case 'Entertainment': return 0xE74C3C; // Red
    case 'Health':        return 0x1ABC9C; // Teal/Cyan
  }
}

/**
 * Returns a short label for a card (used in UI rendering).
 */
export function cardLabel(card: AnyCard): string {
  switch (card.family) {
    case 'business':        return `${card.name} ($${card.cost})`;
    case 'community-space': return `${card.name} ($${card.cost})`;
    case 'event':           return card.cost > 0 ? `${card.name} ($${card.cost})` : card.name;
    case 'upgrade':         return `${card.name} ($${card.cost})`;
  }
}

/**
 * Determines if a card is a Pawn Shop card (biz-pawnshop).
 *
 * Pawn Shop cards neither receive nor contribute synergy bonuses.
 * This holds true even after upgrading to Vintage Shop — the card's
 * base synergy restriction remains.
 *
 * This special case should be removed once synergy bonuses are generalized
 * to per-card values (see CG-0MQRA9QTA0012PNZ).
 *
 * @param card  A card object with an `id` field.
 * @returns true if the card's base template ID is `biz-pawnshop`.
 */
export function isPawnShopCard(card: { id: string } | null | undefined): boolean {
  if (!card) return false;
  const baseId = card.id.replace(/-\d+$/, '');
  return baseId === 'biz-pawnshop';
}

// ---------------------------------------------------------------------------
// Card template ID → display-name lookup
// ---------------------------------------------------------------------------

/**
 * Read-only map from card template ID (e.g. `'biz-cafe'`) to its display name
 * (e.g. `'Cafe'`). Built once at module load from the private template arrays.
 *
 * This is used by the meta-progression UI to show which cards a newly unlocked
 * tier adds to the player's card pool.
 */
export const CARD_TEMPLATE_NAMES: ReadonlyMap<string, string> = (() => {
  const m = new Map<string, string>();
  for (const t of BUSINESS_TEMPLATES)       m.set(t.id, t.name);
  for (const t of COMMUNITY_SPACE_TEMPLATES) m.set(t.id, t.name);
  for (const t of EVENT_TEMPLATES)          m.set(t.id, t.name);
  for (const t of UPGRADE_TEMPLATES)        m.set(t.id, t.name);
  return m;
})();
