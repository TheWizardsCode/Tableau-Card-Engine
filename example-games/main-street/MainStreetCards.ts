/**
 * Main Street: Card Type Definitions and Fixture Data
 *
 * Defines the three card families (Business, Event, Upgrade), synergy types,
 * and the minimal card pool used in Milestone 1 (walking skeleton).
 *
 * @module
 */

// ── Synergy & Phase Enums ───────────────────────────────────

/** Synergy types used by Business cards for adjacency bonuses. */
export type SynergyType = 'Food' | 'Culture' | 'Commerce';

/** When an Event card resolves. */
export type EventTrigger = 'Day' | 'Night';

/** Scope of an Event card's effect. */
export type EventTarget = 'All' | 'SpecificSynergy' | 'RandomBusiness';

/** Discriminator for the three card families. */
export type CardFamily = 'business' | 'event' | 'upgrade';

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
}

/**
 * An Event card that triggers a one-off effect.
 * Day events are purchased; Night events are drawn automatically.
 */
export interface EventCard {
  readonly family: 'event';
  readonly id: string;
  readonly name: string;
  readonly trigger: EventTrigger;
  readonly effect: string;
  readonly target: EventTarget;
  readonly targetSynergy?: SynergyType;
  readonly coinDelta: number;
  readonly reputationDelta: number;
}

/**
 * An Upgrade card that enhances a specific Business card.
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
}

/** Union of all card types in Main Street. */
export type AnyCard = BusinessCard | EventCard | UpgradeCard;

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

/** Number of Event card slots visible in the market. */
export const MARKET_EVENT_SLOTS = 2;

/** Number of Upgrade card slots visible in the market. */
export const MARKET_UPGRADE_SLOTS = 2;

/** Coins earned per adjacent business sharing a synergy type. */
export const SYNERGY_BONUS_PER_NEIGHBOR = 1;

/** Multiplier applied to reputation in final score. */
export const REPUTATION_SCORE_MULTIPLIER = 5;

/** Points awarded per completed challenge. */
export const CHALLENGE_BONUS_POINTS = 10;

// ── Card Fixture Data ───────────────────────────────────────

/**
 * Creates a fresh copy of a BusinessCard from template data.
 * Mutable fields (level, incomeBonus, synergyRangeBonus) are reset.
 */
function makeBusiness(template: Omit<BusinessCard, 'family' | 'level' | 'incomeBonus' | 'synergyRangeBonus'>): BusinessCard {
  return {
    family: 'business',
    level: 0,
    incomeBonus: 0,
    synergyRangeBonus: 0,
    ...template,
  };
}

/** Template data for all Business cards in the Milestone 1 pool. */
const BUSINESS_TEMPLATES: Omit<BusinessCard, 'family' | 'level' | 'incomeBonus' | 'synergyRangeBonus'>[] = [
  {
    id: 'biz-bakery',
    name: 'Bakery',
    cost: 3,
    baseIncome: 2,
    synergyTypes: ['Food'],
    upgradePath: 'Bakery',
    maxLevel: 1,
    description: 'Provides warm pastries. Gains +1 coin for each adjacent Food business.',
  },
  {
    id: 'biz-diner',
    name: 'Diner',
    cost: 4,
    baseIncome: 3,
    synergyTypes: ['Food'],
    upgradePath: 'Diner',
    maxLevel: 1,
    description: 'Serves quick meals. Gains +1 coin per adjacent Food business.',
  },
  {
    id: 'biz-bookshop',
    name: 'Bookshop',
    cost: 4,
    baseIncome: 2,
    synergyTypes: ['Culture'],
    upgradePath: 'Bookshop',
    maxLevel: 1,
    description: 'Sells books. Gains +1 coin per adjacent Culture business.',
  },
  {
    id: 'biz-park',
    name: 'Park',
    cost: 2,
    baseIncome: 1,
    synergyTypes: ['Culture'],
    upgradePath: 'Park',
    maxLevel: 1,
    description: 'Offers leisure. Gains +1 coin per adjacent Culture business.',
  },
  {
    id: 'biz-hardware',
    name: 'Hardware Store',
    cost: 5,
    baseIncome: 3,
    synergyTypes: ['Commerce'],
    upgradePath: 'Hardware Store',
    maxLevel: 1,
    description: 'Supplies tools. Gains +1 coin per adjacent Commerce business.',
  },
];

/** Template data for all Event cards in the Milestone 1 pool. */
const EVENT_TEMPLATES: EventCard[] = [
  {
    family: 'event',
    id: 'evt-festival',
    name: 'Local Festival',
    trigger: 'Night',
    effect: '+2 coins to all Culture businesses and +1 reputation.',
    target: 'SpecificSynergy',
    targetSynergy: 'Culture',
    coinDelta: 2,
    reputationDelta: 1,
  },
  {
    family: 'event',
    id: 'evt-rainy',
    name: 'Rainy Night',
    trigger: 'Night',
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
    trigger: 'Day',
    effect: 'Lose 3 coins.',
    target: 'All',
    coinDelta: -3,
    reputationDelta: 0,
  },
  {
    family: 'event',
    id: 'evt-award',
    name: 'Community Award',
    trigger: 'Night',
    effect: 'Gain 2 reputation from community recognition.',
    target: 'All',
    coinDelta: 0,
    reputationDelta: 2,
  },
  {
    family: 'event',
    id: 'evt-inspection',
    name: 'Health Inspection',
    trigger: 'Night',
    effect: '-2 coins per Food business and -1 reputation.',
    target: 'SpecificSynergy',
    targetSynergy: 'Food',
    coinDelta: -2,
    reputationDelta: -1,
  },
];

/** Template data for all Upgrade cards in the Milestone 1 pool. */
const UPGRADE_TEMPLATES: UpgradeCard[] = [
  {
    family: 'upgrade',
    id: 'upg-patisserie',
    name: 'Upgrade to Patisserie',
    targetBusiness: 'Bakery',
    cost: 4,
    incomeBonus: 1,
    synergyRangeBonus: 1,
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
    description: 'Adds a cultural boost to the Bookshop.',
  },
];

// ── Deck Building ───────────────────────────────────────────

/**
 * Creates the full Business deck for a game (each template repeated
 * `copies` times to ensure adequate supply for 20 turns).
 */
export function createBusinessDeck(copies: number = 3): BusinessCard[] {
  const deck: BusinessCard[] = [];
  for (let c = 0; c < copies; c++) {
    for (const template of BUSINESS_TEMPLATES) {
      deck.push(makeBusiness({ ...template, id: `${template.id}-${c}` }));
    }
  }
  return deck;
}

/**
 * Creates the full Event deck for a game.
 */
export function createEventDeck(copies: number = 3): EventCard[] {
  const deck: EventCard[] = [];
  for (let c = 0; c < copies; c++) {
    for (const template of EVENT_TEMPLATES) {
      deck.push({ ...template, id: `${template.id}-${c}` });
    }
  }
  return deck;
}

/**
 * Creates the full Upgrade deck for a game.
 */
export function createUpgradeDeck(copies: number = 2): UpgradeCard[] {
  const deck: UpgradeCard[] = [];
  for (let c = 0; c < copies; c++) {
    for (const template of UPGRADE_TEMPLATES) {
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
    case 'Food':     return 0xE67E22; // Orange
    case 'Culture':  return 0x3498DB; // Blue
    case 'Commerce': return 0x27AE60; // Green
  }
}

/**
 * Returns a short label for a card (used in UI rendering).
 */
export function cardLabel(card: AnyCard): string {
  switch (card.family) {
    case 'business': return `${card.name} ($${card.cost})`;
    case 'event':    return card.name;
    case 'upgrade':  return `${card.name} ($${card.cost})`;
  }
}
