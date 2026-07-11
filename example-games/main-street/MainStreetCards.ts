/**
 * Main Street: Card Type Definitions and Fixture Data
 *
 * Defines the five card families (Business, Community Space, Event, Upgrade,
 * Staff), synergy types, game constants, and the full card pool for
 * Milestones 1–3.
 *
 * Card template data is loaded from a single CSV file (`card-data.csv`)
 * at module load time. The CSV is bundled at build time via Vite's `?raw`
 * import suffix. Only the fixture data is externalised — type definitions,
 * constants, and helper functions remain in this module.
 *
 * @module
 */

// ── CSV import & parsing ────────────────────────────────────

import cardDataRaw from './card-data.csv?raw';
import { parseCsv } from '@core-engine/CsvLoader';
const csvRows = parseCsv(cardDataRaw);

// ── Synergy & Phase Enums ───────────────────────────────────

/** Synergy types used by Business cards for adjacency bonuses. */
export type SynergyType = 'Food' | 'Culture' | 'Commerce' | 'Service' | 'Entertainment' | 'Health';

/** When an Event card resolves. */
export type EventTrigger = 'Investment' | 'Incident';

/** Scope of an Event card's effect. */
export type EventTarget = 'All' | 'SpecificSynergy' | 'RandomBusiness';

/** Discriminator for the card families (business, event, upgrade, community-space, staff). */
export type CardFamily = 'business' | 'event' | 'upgrade' | 'community-space' | 'staff';

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
   * Coin synergy contribution per matching neighbor.
   * Defaults to 1 (the standard +1 coin per matching adjacency) when undefined.
   * Set to 0 to exclude this card from contributing synergy to neighbors.
   */
  readonly synergyCoinBonus?: number;
  /**
   * Reputation synergy contribution per matching neighbor.
   * Defaults to 0 (no reputation from adjacency synergy) when undefined.
   */
  readonly synergyRepBonus?: number;
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

/**
 * A Staff card that increases hand capacity.
 * Staff cards are a new card family distinct from business/event/upgrade.
 * They do NOT occupy hand slots and have an ongoing per-turn coin cost.
 */
export interface StaffCard {
  readonly family: 'staff';
  readonly id: string;
  readonly name: string;
  readonly cost: number;
  readonly ongoingCost: number;
  readonly handSlotsAdded: number;
  readonly description: string;
}

/** Union of all card types in Main Street. */
export type AnyCard = BusinessCard | CommunitySpaceCard | EventCard | DurationEventCard | UpgradeCard | StaffCard;

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

/**
 * @deprecated Per-card synergy bonus values replace this global constant.
 * Each BusinessCard and CommunitySpaceCard now has its own `synergyCoinBonus`
 * (default 1) and `synergyRepBonus` (default 0). The difficulty preset
 * `synergyBonusPerNeighbor` value still acts as a multiplier on per-card
 * coin synergy contributions.
 *
 * Kept for backward compatibility with existing test code.
 */
export const SYNERGY_BONUS_PER_NEIGHBOR = 1;

/** Multiplier applied to reputation in final score. */
export const REPUTATION_SCORE_MULTIPLIER = 5;

/** Points awarded per completed challenge. */
export const CHALLENGE_BONUS_POINTS = 10;

// ── Multi-Use Card Economy Ratios ───────────────────────────

/** Cost ratio when placing a card from hand to tableau (80% of purchase cost). */
export const PLACE_COST_RATIO = 0.8;

/** Value ratio when selling a card (75% of purchase value). */
export const SELL_VALUE_RATIO = 0.75;

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

// ── Community Space Interface ───────────────────────────────

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
   * Coin synergy contribution per matching neighbor.
   * Defaults to 1 (the standard +1 coin per matching adjacency) when undefined.
   * Set to 0 to exclude this card from contributing synergy to neighbors.
   */
  readonly synergyCoinBonus?: number;
  /**
   * Reputation synergy contribution per matching neighbor.
   * Defaults to 0 (no reputation from adjacency synergy) when undefined.
   */
  readonly synergyRepBonus?: number;
  /**
   * IDs of upgrade cards that have been applied to this community space instance,
   * in application order.
   *
   * Omitting this field is treated as an empty array.
   */
  appliedUpgrades?: string[];
}

// ── CSV → typed template arrays ─────────────────────────────

/** All Business card templates parsed from the CSV. */
const BUSINESS_TEMPLATES: Omit<BusinessCard, 'family' | 'level' | 'incomeBonus' | 'synergyRangeBonus' | 'reputationBonus'>[] =
  csvRows
    .filter(r => r.family === 'business')
    .map(r => ({
      id: r.id,
      name: r.name,
      cost: Number(r.cost) || 0,
      baseIncome: Number(r.baseIncome) || 0,
      synergyTypes: (r.synergyTypes || '').split('|').filter(Boolean) as unknown as SynergyType[],
      upgradePath: r.upgradePath || undefined,
      maxLevel: Number(r.maxLevel) || 0,
      reputationPerTurn: r.reputationPerTurn ? Number(r.reputationPerTurn) : undefined,
      synergyCoinBonus: r.synergyCoinBonus !== undefined && r.synergyCoinBonus !== '' ? Number(r.synergyCoinBonus) : undefined,
      synergyRepBonus: r.synergyRepBonus !== undefined && r.synergyRepBonus !== '' ? Number(r.synergyRepBonus) : undefined,
      description: r.description,
    }));

/** All Community Space card templates parsed from the CSV. */
const COMMUNITY_SPACE_TEMPLATES: Omit<CommunitySpaceCard, 'family' | 'level' | 'incomeBonus' | 'synergyRangeBonus' | 'reputationBonus'>[] =
  csvRows
    .filter(r => r.family === 'community-space')
    .map(r => ({
      id: r.id,
      name: r.name,
      cost: Number(r.cost) || 0,
      baseIncome: Number(r.baseIncome) || 0,
      synergyTypes: (r.synergyTypes || '').split('|').filter(Boolean) as unknown as SynergyType[],
      upgradePath: r.upgradePath || undefined,
      maxLevel: Number(r.maxLevel) || 0,
      reputationPerTurn: r.reputationPerTurn ? Number(r.reputationPerTurn) : undefined,
      synergyCoinBonus: r.synergyCoinBonus !== undefined && r.synergyCoinBonus !== '' ? Number(r.synergyCoinBonus) : undefined,
      synergyRepBonus: r.synergyRepBonus !== undefined && r.synergyRepBonus !== '' ? Number(r.synergyRepBonus) : undefined,
      description: r.description,
    }));

/** All Event card templates parsed from the CSV. */
const EVENT_TEMPLATES: EventCard[] =
  csvRows
    .filter(r => r.family === 'event')
    .map(r => {
      const base: EventCard = {
        family: 'event',
        id: r.id,
        name: r.name,
        cost: Number(r.cost) || 0,
        trigger: r.trigger as EventTrigger,
        effect: r.effect,
        target: r.target as EventTarget,
        targetSynergy: (r.targetSynergy || undefined) as SynergyType | undefined,
        coinDelta: Number(r.coinDelta) || 0,
        reputationDelta: Number(r.reputationDelta) || 0,
      };
      // Duration events carry extra fields — cast to DurationEventCard if present
      if (r.duration) {
        return {
          ...base,
          duration: Number(r.duration),
          effectType: r.effectType,
          multiplier: Number(r.multiplier) || 0,
        } as DurationEventCard;
      }
      return base;
    });

/** All Upgrade card templates parsed from the CSV. */
const UPGRADE_TEMPLATES: UpgradeCard[] =
  csvRows
    .filter(r => r.family === 'upgrade')
    .map(r => ({
      family: 'upgrade',
      id: r.id,
      name: r.name,
      targetBusiness: r.targetBusiness,
      cost: Number(r.cost) || 0,
      incomeBonus: Number(r.incomeBonus) || 0,
      synergyRangeBonus: Number(r.synergyRangeBonus) || 0,
      description: r.description,
      requiredLevel: r.requiredLevel ? Number(r.requiredLevel) : undefined,
      reputationBonus: r.reputationBonus ? Number(r.reputationBonus) : undefined,
    }));

/** All Staff card templates parsed from the CSV. */
export const STAFF_CARD_TEMPLATES: StaffCard[] =
  csvRows
    .filter(r => r.family === 'staff')
    .map(r => ({
      family: 'staff',
      id: r.id,
      name: r.name,
      cost: Number(r.cost) || 0,
      ongoingCost: Number(r.ongoingCost) || 0,
      handSlotsAdded: Number(r.handSlotsAdded) || 0,
      description: r.description,
    }));

// ── Deck Building ───────────────────────────────────────────

/**
 * Creates the full Staff deck for a game.
 *
 * @param copies  Number of copies per template (default 1).
 * @returns Array of StaffCard instances.
 */
export function createStaffDeck(copies: number = 1): StaffCard[] {
  const deck: StaffCard[] = [];
  for (let c = 0; c < copies; c++) {
    for (const template of STAFF_CARD_TEMPLATES) {
      deck.push({ ...template, id: `${template.id}-${c}` });
    }
  }
  return deck;
}

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
 * Supports an optional `positiveIncidentMultiplier` to increase the
 * relative frequency of positive Incident events by duplicating positive
 * Incident templates before deck assembly. This keeps selection deterministic
 * under the seeded RNG used throughout Main Street while allowing tuning
 * without changing core selection logic.
 *
 * @param copies          Number of copies per template (default 3).
 * @param unlockedCardIds Optional list of unlocked card IDs for tier filtering.
 * @param positiveIncidentMultiplier Multiplier applied to positive Incident templates (>=1).
 * @param rng             Seeded random function used for deterministic fractional distribution.
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
    case 'business':        return `${card.name} (€${card.cost})`;
    case 'community-space': return `${card.name} (€${card.cost})`;
    case 'event':           return card.cost > 0 ? `${card.name} (€${card.cost})` : card.name;
    case 'upgrade':         return `${card.name} (€${card.cost})`;
    case 'staff':           return `${card.name} (€${card.cost})`;
  }
}



// ---------------------------------------------------------------------------
// Card template ID → display-name lookup
// ---------------------------------------------------------------------------

/**
 * Read-only map from card template ID (e.g. `'biz-cafe'`) to its display name
 * (e.g. `'Cafe'`). Built once at module load from the CSV-derived template arrays.
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

// ---------------------------------------------------------------------------
// Card template ID → tier mapping (from CSV tier column)
// ---------------------------------------------------------------------------

/**
 * Read-only map from card template ID (e.g. `'biz-cafe'`) to its tier number
 * (as a numeric string, e.g. `'1'` through `'5'`).
 *
 * Built once at module load from the CSV `tier` column.
 * Cards without a tier assignment (e.g. staff cards) are omitted from this map.
 */
export const CARD_TIER_MAP: ReadonlyMap<string, string> = (() => {
  const m = new Map<string, string>();
  for (const row of csvRows) {
    if (row.tier && row.tier.trim() !== '') {
      m.set(row.id, row.tier.trim());
    }
  }
  return m;
})();
