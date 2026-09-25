/**
 * Main Street: Market Refill and Refresh
 *
 * Deck-to-market refill, paid refresh, card cycling, incident-deck
 * replenishment, and the cheat replace helper.
 *
 * Import graph: depends on `MainStreetMarketTypes`.
 *
 * @module
 */

import type { LegalityResult } from '@rule-engine';
import { shuffleArray } from '@card-system';
import type { MainStreetState } from './MainStreetState';
import { addLog, describeEventEffects, classifyEffect, refillSingleRowMarket } from './MainStreetState';
import type { BusinessCard, CommunitySpaceCard, UpgradeCard, EventCard, AnyCard, StaffCard } from './MainStreetCards';
import { REFRESH_MARKET_COST } from './MainStreetCards';
import { computeRefreshCostDiscount, getEmployedSpecializationSkills } from './MainStreetStaffBuffs';
import type { RefreshResult } from './MainStreetMarketTypes';

/** Monotonic counter for cheat-generated replacement card ids. */
let cheatNonce = 0;

/**
 * Refills the single-row marketplace toward `MARKET_TOTAL_SLOTS` cards with
 * the target composition (CG-0MSTOATDT009BRX2): at most 3 cards, always ≥1
 * business card (community-space counts as business), the remainder random
 * within "1–2 business, 0–1 upgrade, 0–1 event".
 *
 * TOP-UP semantics: currently-visible cards are preserved and only missing
 * slots are drawn (mirrors the legacy day-start refill; the tutorial relies
 * on this to keep scenario-placed cards alive across the day boundary).
 * Callers wanting a full re-draw discard/clear the row first:
 * `refreshMarket` (re-roll) and `cycleMarketCards` (end-of-day cycle) do.
 */
export function refillMarket(state: MainStreetState): void {
  refillSingleRowMarket(state);
}

/**
 * Checks whether the player can re-roll the single-row market.
 */
export function canRefreshMarket(state: MainStreetState): LegalityResult {
  if (state.phase !== 'MarketPhase') {
    return { legal: false, reason: 'Re-rolling the market is only allowed during MarketPhase.' };
  }
  const cost = refreshMarketCost(state);
  if (state.resourceBank.coins < cost) {
    return { legal: false, reason: `Not enough coins. Need ${cost}, have ${state.resourceBank.coins}.` };
  }
  return { legal: true };
}

/**
 * Effective cost to re-roll the single-row market, after staff discounts
 * (e.g. the Accountant's "refresh costs 1 less" ability — Group F,
 * CG-0MSQJ7VL9009JHF4 / CG-0MSTOATDT009BRX2). Discounts are summed across
 * hired staff and the result is clamped at 0 (never negative).
 */
export function refreshMarketCost(state: MainStreetState): number {
  const discount = (state.staffCards ?? []).reduce(
    (sum, card) => sum + (card.refreshCostDiscount ?? 0),
    0,
  );
  // Negotiator specialization skill: -1 on refreshes (I4, CG-0MT4WXV2J000M35M).
  const negotiatorDiscount = computeRefreshCostDiscount(getEmployedSpecializationSkills(state));
  return Math.max(0, REFRESH_MARKET_COST - discount - negotiatorDiscount);
}

/**
 * Re-rolls the single-row market: charges the player, discards all
 * currently-visible (unmoved/unpurchased) cards to their respective discard
 * piles, and refills the whole line to full composition. Unlimited per turn
 * while affordable (same cadence as the legacy per-row refreshes).
 */
export function refreshMarket(state: MainStreetState): RefreshResult {
  const legality = canRefreshMarket(state);
  if (!legality.legal) throw new Error(legality.reason);

  // Deduct cost (after staff refresh discounts, e.g. Accountant)
  const cost = refreshMarketCost(state);
  state.resourceBank.coins -= cost;

  // Move visible market cards to their respective discard piles
  const removed: AnyCard[] = state.market.cards.slice();
  for (const c of removed) {
    if (c.family === 'business') {
      state.discards.business.push(c as any);
    } else if (c.family === 'community-space') {
      state.discards.communitySpace.push(c as any);
    } else if (c.family === 'upgrade') {
      state.discards.upgrade.push(c as any);
    } else if (c.family === 'event') {
      state.discards.event.push(c as any);
    } else if (c.family === 'staff') {
      // Staff are a first-class market family (CG-0MT3KZNQB0053K55).
      state.discards.staff.push(c as StaffCard);
    }
  }

  // Clear the visible row and draw a fresh full line
  state.market.cards.length = 0;
  refillSingleRowMarket(state);

  // Build a detailed replacement summary for the activity log
  const replacedStrings = removed.map(c => {
    const name = (c as any).name ?? c.id;
    return `${c.id}${name ? ` (${name})` : ''}`;
  });
  addLog(state, `Re-rolled market (-€${cost}): replaced ${replacedStrings.join(', ')} (${describeEventEffects(-cost, 0)})`, classifyEffect(-cost, 0));

  return { replaced: removed, cost };
}

/**
 * Cycles all unpurchased market cards to their respective discard piles
 * and refills the market from the decks.
 *
 * Called at the end of each MarketPhase (before IncomePhase) to ensure
 * fresh cards are available each turn. Player-owned cards (hand, tableau)
 * are not affected.
 *
 * Uses the existing seeded RNG for any reshuffles that occur during refill.
 *
 * @param state  Current game state (mutated in-place).
 */
export function cycleMarketCards(state: MainStreetState): void {
  // ── Cycle the single-row market cards to discards ────────
  const visibleCards = state.market.cards.splice(0);
  for (const card of visibleCards) {
    if (card.family === 'business') {
      state.discards.business.push(card as BusinessCard);
    } else if (card.family === 'community-space') {
      state.discards.communitySpace.push(card as CommunitySpaceCard);
    } else if (card.family === 'upgrade') {
      state.discards.upgrade.push(card as UpgradeCard);
    } else if (card.family === 'event') {
      state.discards.event.push(card as EventCard);
    } else if (card.family === 'staff') {
      // Staff are a first-class market family (CG-0MT3KZNQB0053K55).
      state.discards.staff.push(card as StaffCard);
    }
  }

  // ── Refill the single row from decks ─────────────────────
  refillSingleRowMarket(state);
}

/**
 * Replenishes the face-down incident deck when it is exhausted: gathers
 * remaining Incident-trigger cards from the event deck and event discards
 * and shuffles them into a new face-down deck (seeded, so the order is
 * deterministic per game seed). Constraint satisfaction (repeat spacing /
 * streak) happens at draw time via `findConstrainedIncidentIndex`, not by
 * pre-ordering the deck (CG-0MSZDD2TP003TZS5).
 *
 * No visible refill loop: the deck is face-down and only its remaining
 * count is shown. Called by `resolveIncident` when `incidentDeck` is empty.
 * Does nothing when no Incident-trigger cards are available anywhere.
 */
export function replenishIncidentDeck(state: MainStreetState): void {
  if (state.incidentDeck.length > 0) return;

  const pool: EventCard[] = [];
  const eventDeck = state.decks.event;
  for (let i = eventDeck.length - 1; i >= 0; i--) {
    if (eventDeck[i].trigger === 'Incident') {
      pool.push(eventDeck.splice(i, 1)[0]);
    }
  }
  const eventDiscards = state.discards.event;
  for (let i = eventDiscards.length - 1; i >= 0; i--) {
    if (eventDiscards[i].trigger === 'Incident') {
      pool.push(eventDiscards.splice(i, 1)[0]);
    }
  }
  if (pool.length === 0) return;

  // Seeded shuffle only — no pre-ordering. `resolveIncident` selects each
  // card at draw time via `findConstrainedIncidentIndex` (deterministic,
  // consumes no RNG), so the deck order here only sets the candidate order.
  shuffleArray(pool, state.rng);
  state.incidentDeck = pool;
  addLog(state, 'Reshuffled incident deck from event cards', 'neutral');
}

/**
 * Dev-mode cheat helper: replace a uniformly-random slot from
 * `state.market.cards` with a shallow copy of the chosen template
 * (unique id `${templateId}--cheat-${nonce}`), push the displaced
 * card to its family's discard pile, and return the displaced card.
 *
 * The market row is NOT refilled here; callers should re-render via
 * the existing renderer path (e.g. `scene.refreshMarket()`).
 */
export function cheatReplaceMarketCard(
  state: MainStreetState,
  template: AnyCard,
  family: string,
  rng?: () => number,
): AnyCard | null {
  const slots = state.market.cards.length;
  if (slots === 0) return null;
  const slotIndex = Math.floor((rng?.() ?? Math.random()) * slots);
  const displaced = state.market.cards[slotIndex] ?? null;
  const baseId = (template as any).id ?? family;
  const newCard: AnyCard = { ...(template as any), id: `${baseId}--cheat-${cheatNonce++}` } as AnyCard;
  if (family === 'business' || family === 'community-space') {
    (newCard as any).level = 0;
    (newCard as any).incomeBonus = 0;
    (newCard as any).synergyRangeBonus = 0;
    (newCard as any).reputationBonus = 0;
    (newCard as any).ongoingCost = (newCard as any).ongoingCost ?? 0;
    (newCard as any).appliedUpgrades = [];
    (newCard as any).totalUpgradeCost = 0;
  }
  state.market.cards[slotIndex] = newCard;
  if (displaced) {
    const fam = (displaced as any).family as string;
    if (fam === 'business') state.discards.business.push(displaced as BusinessCard);
    else if (fam === 'community-space') state.discards.communitySpace.push(displaced as CommunitySpaceCard);
    else if (fam === 'event') state.discards.event.push(displaced as EventCard);
    else if (fam === 'upgrade') state.discards.upgrade.push(displaced as UpgradeCard);
    else if (fam === 'staff') state.discards.staff.push(displaced as StaffCard);
  }
  return displaced;
}

