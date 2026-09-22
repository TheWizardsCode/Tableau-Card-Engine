/**
 * Main Street: Deck Building Functions
 *
 * Factory functions that create shuffled card decks for each card family
 * (Business, CommunitySpace, Event, Upgrade, Staff). Each function produces
 * a fresh array of card instances from templates, with optional tier filtering.
 *
 * @module
 */

import type {
  BusinessCard,
  CommunitySpaceCard,
  EventCard,
  UpgradeCard,
  StaffCard,
} from './MainStreetCardsTypes';
import {
  getBusinessTemplates,
  getCommunitySpaceTemplates,
  getEventTemplates,
  getUpgradeTemplates,
  getStaffCardTemplates,
} from './MainStreetCardsTemplates';

// ── Card Factory Helpers ────────────────────────────────────

/**
 * Creates a fresh copy of a BusinessCard from template data.
 * Mutable fields (level, incomeBonus, synergyRangeBonus, appliedUpgrades) are reset.
 */
function makeBusiness(template: Omit<BusinessCard, 'family' | 'level' | 'incomeBonus' | 'synergyRangeBonus' | 'appliedUpgrades' | 'reputationBonus' | 'currentIncome' | 'currentReputationPerTurn' | 'ongoingCost'>): BusinessCard {
  const card: BusinessCard = {
    family: 'business',
    level: 0,
    incomeBonus: 0,
    synergyRangeBonus: 0,
    reputationBonus: 0,
    ongoingCost: 0,
    appliedUpgrades: [],
    employedStaff: [],
    ...template,
  };
  // Cached values (currentIncome, currentReputationPerTurn) are intentionally
  // left undefined until the card is placed on the grid.
  return card;
}

/**
 * Creates a fresh copy of a CommunitySpaceCard from template data.
 * Mutable fields (level, incomeBonus, synergyRangeBonus, appliedUpgrades) are reset.
 */
function makeCommunitySpace(template: Omit<CommunitySpaceCard, 'family' | 'level' | 'incomeBonus' | 'synergyRangeBonus' | 'appliedUpgrades' | 'reputationBonus' | 'currentIncome' | 'currentReputationPerTurn' | 'ongoingCost'>): CommunitySpaceCard {
  const card: CommunitySpaceCard = {
    family: 'community-space',
    level: 0,
    incomeBonus: 0,
    synergyRangeBonus: 0,
    reputationBonus: 0,
    ongoingCost: 0,
    appliedUpgrades: [],
    employedStaff: [],
    ...template,
  };
  return card;
}

// ── Deck Creation Functions ─────────────────────────────────

/**
 * Creates the full Staff deck for a game.
 *
 * Staff cards are tier-gated: only templates whose ID is in `unlockedCardIds`
 * are included when the list is provided.
 *
 * @param copies          Number of copies per template (default 1).
 * @param unlockedCardIds Optional list of unlocked card IDs for tier filtering.
 * @returns Array of StaffCard instances.
 */
export function createStaffDeck(
  copies: number = 1,
  unlockedCardIds?: string[],
): StaffCard[] {
  const templates = unlockedCardIds
    ? getStaffCardTemplates().filter((t) => unlockedCardIds.includes(t.id))
    : getStaffCardTemplates();

  const deck: StaffCard[] = [];
  for (let c = 0; c < copies; c++) {
    for (const template of templates) {
      deck.push({ ...template, id: `${template.id}-${c}` });
    }
  }
  return deck;
}

/**
 * Creates the full Business deck for a game (each template repeated
 * `copies` times).
 *
 * @param copies          Number of copies per template (default 3).
 * @param unlockedCardIds Optional list of unlocked card IDs for tier filtering.
 */
export function createBusinessDeck(
  copies: number = 3,
  unlockedCardIds?: string[],
): BusinessCard[] {
  const templates = unlockedCardIds
    ? getBusinessTemplates().filter((t) => unlockedCardIds.includes(t.id))
    : getBusinessTemplates();

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
 */
export function createCommunitySpaceDeck(
  copies: number = 3,
  unlockedCardIds?: string[],
): CommunitySpaceCard[] {
  const templates = unlockedCardIds
    ? getCommunitySpaceTemplates().filter((t) => unlockedCardIds.includes(t.id))
    : getCommunitySpaceTemplates();

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
 * Incident templates before deck assembly.
 *
 * @param copies                     Number of copies per template (default 3).
 * @param unlockedCardIds            Optional list of unlocked card IDs for tier filtering.
 * @param rng                        Seeded random function for deterministic distribution.
 * @param positiveIncidentMultiplier Multiplier applied to positive Incident templates (>=1).
 */
export function createEventDeck(
  copies: number = 3,
  unlockedCardIds: string[] | undefined,
  rng: () => number,
  positiveIncidentMultiplier: number = 1,
): EventCard[] {
  const templates = unlockedCardIds
    ? getEventTemplates().filter((t) => unlockedCardIds.includes(t.id))
    : getEventTemplates();

  const deck: EventCard[] = [];
  let serial = 0;

  const mult = Math.max(1, positiveIncidentMultiplier);
  const baseDup = Math.floor(mult);
  const fraction = mult - baseDup;

  // Identify positions of positive Incident templates
  const positiveIndices: number[] = [];
  for (let i = 0; i < templates.length; i++) {
    const t = templates[i];
    if (t.trigger === 'Incident' && (t.coinDelta + t.reputationDelta) > 0) {
      positiveIndices.push(i);
    }
  }

  const positiveCount = positiveIndices.length;
  const extraCount = Math.round(fraction * positiveCount);

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
 */
export function createUpgradeDeck(
  copies: number = 2,
  unlockedCardIds?: string[],
): UpgradeCard[] {
  const templates = unlockedCardIds
    ? getUpgradeTemplates().filter((t) => unlockedCardIds.includes(t.id))
    : getUpgradeTemplates();

  const deck: UpgradeCard[] = [];
  for (let c = 0; c < copies; c++) {
    for (const template of templates) {
      deck.push({ ...template, id: `${template.id}-${c}` });
    }
  }
  return deck;
}
