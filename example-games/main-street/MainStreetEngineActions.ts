/**
 * Main Street: Action Dispatch
 *
 * Dispatches a `PlayerAction` to its handler, the action-budget helpers, and
 * the community-favour/peek actions.
 *
 * @module
 */

import { buyAndPlaceBusiness, hireStaffCard } from './MainStreetEngineCommands';
import { evaluateChallengesAfterAction } from './MainStreetChallenges';
import { applyCompetitiveEventEffects } from './MainStreetEngineEvents';
import { PlayerAction } from './MainStreetEngineTypes';
import type { EventCard } from './MainStreetCards';
import { purchaseBusiness, moveToHand, purchaseUpgrade, buyAndPlaceUpgrade, purchaseEvent, playBusinessFromHand, playUpgradeFromHand, playEventFromHand, discardFromHand } from './MainStreetMarket';
import type { PurchaseResult } from './MainStreetMarket';
import { hasPeekCapableStaff } from './MainStreetStaffSkills';
import type { MainStreetState } from './MainStreetState';
import { addLog, syncResourceBankToLedger, describeEventEffects, classifyEffect } from './MainStreetState';

/**
 * Validates and executes a player action during the MarketPhase.
 *
 * @param state   Current game state (mutated in-place).
 * @param action  The player action to execute.
 * @returns PurchaseResult for buy actions, or null for end-turn / play-event.
 * @throws Error if the action is illegal or out of phase.
 */
export function executeAction(
  state: MainStreetState,
  action: PlayerAction,
): PurchaseResult | null {
  if (state.gameResult !== 'playing') {
    throw new Error('Game is over. No more actions allowed.');
  }

  if (action.type === 'end-turn') {
    if (state.phase !== 'MarketPhase') {
      throw new Error(`Cannot end turn during ${state.phase}. Must be in MarketPhase.`);
    }
    state._newlyCompletedThisAction = [];
    return null;
  }

  if (state.phase !== 'MarketPhase') {
    throw new Error(`Cannot perform ${action.type} during ${state.phase}. Must be in MarketPhase.`);
  }

  // Reset the transient per-action challenge buffer, then dispatch. Per-action
  // challenge evaluation (CG-0MU37CKRR008252I, producer decision Q2 = A: all
  // paths) runs only AFTER a successful dispatch, so a failed action (which
  // throws before returning) never reports a spurious completion. The
  // end-of-turn EndCheck remains as a safety net for completions caused by
  // the closing phases (Income / Incident) and skips challenges already
  // flagged complete here.
  state._newlyCompletedThisAction = [];
  const result = dispatchPlayerAction(state, action);
  evaluateChallengesAfterAction(state);
  return result;
}

/**
 * Dispatches an already-validated player action to its handler. Split out of
 * {@link executeAction} so per-action challenge evaluation can run once, after
 * a successful dispatch, regardless of which case handled the action.
 *
 * @param state   Current game state (mutated in-place).
 * @param action  The player action to execute (never `end-turn`).
 * @returns PurchaseResult for buy actions, or null for play-event.
 * @throws Error if the action is illegal or out of phase.
 */
function dispatchPlayerAction(
  state: MainStreetState,
  action: PlayerAction,
): PurchaseResult | null {
  switch (action.type) {
    case 'move-to-hand': {
      const hadBanked = (state.bankedActions ?? 0) > 0;
      consumeAction(state);
      try {
        return moveToHand(state, action.cardId);
      } catch (e) {
        state.actionsRemaining += 1;
        if (hadBanked) {
          state.bankedActions = Math.min(2, (state.bankedActions ?? 0) + 1);
        }
        throw e;
      }
    }
    case 'buy-business': {
      const hadBanked = (state.bankedActions ?? 0) > 0;
      consumeAction(state);
      try {
        return purchaseBusiness(state, action.cardId, action.slotIndex);
      } catch (e) {
        state.actionsRemaining += 1;
        if (hadBanked) {
          state.bankedActions = Math.min(2, (state.bankedActions ?? 0) + 1);
        }
        throw e;
      }
    }
    case 'play-business-from-hand': {
      const hadBanked = (state.bankedActions ?? 0) > 0;
      consumeAction(state);
      try {
        return playBusinessFromHand(state, action.handIndex, action.slotIndex);
      } catch (e) {
        state.actionsRemaining += 1;
        if (hadBanked) {
          state.bankedActions = Math.min(2, (state.bankedActions ?? 0) + 1);
        }
        throw e;
      }
    }
    case 'buy-and-place': {
      const hadBanked = (state.bankedActions ?? 0) > 0;
      consumeAction(state);
      try {
        return buyAndPlaceBusiness(state, action.cardId, action.slotIndex);
      } catch (e) {
        state.actionsRemaining += 1;
        if (hadBanked) {
          state.bankedActions = Math.min(2, (state.bankedActions ?? 0) + 1);
        }
        throw e;
      }
    }
    case 'hire-staff': {
      const hadBanked = (state.bankedActions ?? 0) > 0;
      consumeAction(state);
      try {
        return hireStaffCard(state, action.cardId);
      } catch (e) {
        state.actionsRemaining += 1;
        if (hadBanked) {
          state.bankedActions = Math.min(2, (state.bankedActions ?? 0) + 1);
        }
        throw e;
      }
    }
    case 'buy-upgrade': {
      // One daily action, exactly like the click composite it stands in for
      // (move-to-hand 1 action + free same-week apply, listed cost). Without
      // this the AI and Monte Carlo scored upgrades as free actions
      // (CG-0MT40HTYN008TJ6Q).
      const hadBanked = (state.bankedActions ?? 0) > 0;
      consumeAction(state);
      try {
        return purchaseUpgrade(state, action.cardId, action.targetSlot);
      } catch (e) {
        state.actionsRemaining += 1;
        if (hadBanked) {
          state.bankedActions = Math.min(2, (state.bankedActions ?? 0) + 1);
        }
        throw e;
      }
    }
    case 'buy-event': {
      const hadBanked = (state.bankedActions ?? 0) > 0;
      consumeAction(state);
      try {
        return purchaseEvent(state, action.cardId);
      } catch (e) {
        state.actionsRemaining += 1;
        if (hadBanked) {
          state.bankedActions = Math.min(2, (state.bankedActions ?? 0) + 1);
        }
        throw e;
      }
    }
    case 'play-upgrade-from-hand': {
      // Same-week composite detection (CG-0MT3IYSRL001VVUP): if the upgrade
      // was just moved to hand this turn (same card id), the play is free
      // — the move already consumed the action.
      const card = (state.hand ?? [])[action.handIndex];
      const isSameWeekComposite = card && state.justMovedUpgradeCardId === card.id;
      const hadBanked = (state.bankedActions ?? 0) > 0;
      if (!isSameWeekComposite) {
        consumeAction(state);
      }
      try {
        const result = playUpgradeFromHand(state, action.handIndex, action.targetSlot);
        // Clear the composite tracker after play (whether same-week or not).
        if (state.justMovedUpgradeCardId === card?.id) {
          state.justMovedUpgradeCardId = null;
        }
        return result;
      } catch (e) {
        if (!isSameWeekComposite) {
          state.actionsRemaining += 1;
          if (hadBanked) {
            state.bankedActions = Math.min(2, (state.bankedActions ?? 0) + 1);
          }
        }
        throw e;
      }
    }
    case 'buy-and-place-upgrade': {
      const extra = action.extraActions ?? 0;
      const hadBanked = (state.bankedActions ?? 0) > 0;
      try {
        for (let i = 0; i < extra; i += 1) consumeAction(state);
        consumeAction(state);
        return buyAndPlaceUpgrade(state, action.cardId, action.targetSlot, action.priceOverride);
      } catch (e) {
        // Restore all consumed actions (extra + 1)
        for (let i = 0; i <= extra; i += 1) {
          state.actionsRemaining += 1;
          if (hadBanked) {
            state.bankedActions = Math.min(2, (state.bankedActions ?? 0) + 1);
          }
        }
        throw e;
      }
    }
    case 'play-event-from-hand': {
      const hand = state.hand ?? [];
      const card = hand[action.handIndex] as any;
      const isSameWeek = card && (state as any).justMovedEventCardId != null && (state as any).justMovedEventCardId === card.id;
      const hadBanked = (state.bankedActions ?? 0) > 0;
      if (!isSameWeek) consumeAction(state);
      try {
        const result = playEventFromHand(state, action.handIndex);
        // Investment played by the active player: route the benefit to their
        // own wallet in competitive mode (CG-0MTIIL6J200291ZQ). SpecificSynergy
        // coin deltas are routed per-business to slot owners inside the helper.
        if ((state.players?.length ?? 0) > 1) {
          applyCompetitiveEventEffects(state, card as EventCard, state.activePlayerId ?? 0);
        }
        return result;
      } catch (e) {
        if (!isSameWeek) {
          state.actionsRemaining += 1;
          if (hadBanked) {
            state.bankedActions = Math.min(2, (state.bankedActions ?? 0) + 1);
          }
        }
        throw e;
      }
    }
    case 'discard-from-hand':
      discardFromHand(state, action.handIndex);
      return null;
    case 'play-event': {
      const handIndex = action.handIndex ?? (state.hand ?? []).findIndex(c => c.family === 'event');
      if (handIndex < 0) {
        throw new Error('No Investment event is currently held in hand.');
      }
      const card = (state.hand ?? [])[handIndex] as any;
      const isSameWeek = card && (state as any).justMovedEventCardId != null && (state as any).justMovedEventCardId === card.id;
      const hadBanked = (state.bankedActions ?? 0) > 0;
      if (!isSameWeek) consumeAction(state);
      try {
        const result = playEventFromHand(state, handIndex);
        // Investment played by the active player: per-owner routing (see above).
        if ((state.players?.length ?? 0) > 1) {
          applyCompetitiveEventEffects(state, card as EventCard, state.activePlayerId ?? 0);
        }
        return result;
      } catch (e) {
        if (!isSameWeek) {
          state.actionsRemaining += 1;
          if (hadBanked) {
            state.bankedActions = Math.min(2, (state.bankedActions ?? 0) + 1);
          }
        }
        throw e;
      }
    }
    case 'peek-incident-deck':
      // Consumes one action and enforces the once-per-turn gate inside
      // peekIncidentDeck. The peeked card is intentionally not surfaced
      // through executeAction (PurchaseResult | null) — presentation is the
      // scene layer's job via peekIncidentDeck directly.
      peekIncidentDeck(state);
      return null;
    case 'community-favour': {
      const result = executeCommunityFavour(state, action.direction);
      return result;
    }
    default:
      throw new Error(`Unknown action type: ${(action as PlayerAction).type}`);
  }
}

// ── Event Resolution ────────────────────────────────────────

/**
 * Builds a human-readable effect description for event log entries.
 *
 * Re-exported from MainStreetState (where the pure formatter lives) so log
 * sites and tests keep the canonical entry point for enriched entry text
 * (CG-0MT5W7UJJ0065MEZ).
 */
export { describeEventEffects, classifyEffect } from './MainStreetState';

/**
 * Computes the effective duration for a DurationEventCard by scanning

/**
 * Resolves a single event card's effects on the game state.
 *
 * For the walking skeleton, events have direct coin/reputation deltas.
 * SpecificSynergy events apply their coinDelta to each matching business
 * (simplified: apply delta once per matching placed business).
 * All/other events apply the delta directly to the resource bank.
 *
 * Positive coin deltas are scaled by the reputation coin multiplier
 * (CG-0MMLR38NJ1N11DOS). Negative deltas (penalties) pass through
 * unchanged.
 */

/**
 * Consumes one action from the daily budget — the single enforcement point
 * for the action economy (CG-0MTCP7F9S009HARC).
 *
 * Decrements both `actionsRemaining` (existing behaviour) and
 * `bankedActions` (floored at 0) so the bank acts as a finite reserve that
 * depletes as the player acts. Every action-consuming operation — the
 * engine `executeAction` switch, `peekIncidentDeck`, and the command
 * layer's `consumeAction` — goes through this one helper, so the engine
 * and command paths can never diverge or double-decrement.
 *
 * Premium placements (which replace the action with a +50% coin charge)
 * and free operations do NOT call this helper and therefore leave
 * `bankedActions` untouched.
 *
 * @param state Current game state (mutated in-place).
 * @throws Error if no actions remain this week.
 */
export function consumeAction(state: MainStreetState): void {
  if (state.actionsRemaining <= 0) {
    throw new Error('No actions remaining this week. End your turn to start next week.');
  }
  state.actionsRemaining -= 1;
  state.bankedActions = Math.max(0, (state.bankedActions ?? 0) - 1);
}

/**
 * Executes the Community Favour exchange.
 *
 * This is a **free** once-per-turn action available during MarketPhase.
 * It does NOT consume `actionsRemaining` — it functions as a true fallback
 * when the player cannot afford a market purchase.
 *
 * Exchange rates (per-difficulty via `state.config`):
 *   - `coins-to-rep`: spends `favourCoinsToRepCost` coins for 1 reputation.
 *   - `rep-to-coins`: spends `favourRepToCoinsRepCost` reputation for
 *     `favourRepToCoinsCoinGain` coins.
 *
 * The round-trip is lossy (e.g. 200 coins → 1 reputation, while 200 reputation
 * → 300 coins on the default rates), preventing infinite arbitrage.
 *
 * @param state   Current game state (mutated in-place).
 * @param direction Exchange direction.
 * @returns Always null — Community Favour is a pure resource exchange.
 * @throws Error if the exchange is illegal (wrong phase, gate used,
 *         insufficient funds, game over).
 */
export function executeCommunityFavour(
  state: MainStreetState,
  direction: 'coins-to-rep' | 'rep-to-coins',
): null {
  if (state.gameResult !== 'playing') {
    throw new Error('Game is over. No more actions allowed.');
  }
  if (state.phase !== 'MarketPhase') {
    throw new Error(`Cannot perform Community Favour during ${state.phase}. Must be in MarketPhase.`);
  }
  if (state.favourUsedThisTurn) {
    throw new Error('You have already used Community Favour this turn.');
  }

  // Sync the ledger from resourceBank before validating so the exchange
  // sees any direct resourceBank mutations (mirrors computeScore).
  syncResourceBankToLedger(state);

  const config = state.config;

  if (direction === 'coins-to-rep') {
    const cost = config.favourCoinsToRepCost;
    if (state.ledger.get('coins') < cost) {
      throw new Error(
        `Not enough coins for Community Favour (coins-to-rep). Need ${cost}, have ${state.ledger.get('coins')}.`,
      );
    }
    state.resourceBank.coins -= cost;
    state.resourceBank.reputation += 1;
    // Enriched with effective deltas (CG-0MT5W7UJJ0065MEZ).
    const coinDelta = -cost;
    const repDelta = 1;
    addLog(
      state,
      `Community Favour: spent ${cost} coins for 1 reputation (${describeEventEffects(coinDelta, repDelta)})`,
      classifyEffect(coinDelta, repDelta),
    );
  } else {
    // rep-to-coins
    const repCost = config.favourRepToCoinsRepCost;
    const coinGain = config.favourRepToCoinsCoinGain;
    if (state.ledger.get('reputation') < repCost) {
      throw new Error(
        `Not enough reputation for Community Favour (rep-to-coins). Need ${repCost}, have ${state.ledger.get('reputation')}.`,
      );
    }
    state.resourceBank.reputation -= repCost;
    state.resourceBank.coins += coinGain;
    // Enriched with effective deltas (CG-0MT5W7UJJ0065MEZ).
    const coinDelta = coinGain;
    const repDelta = -repCost;
    addLog(
      state,
      `Community Favour: spent ${repCost} reputation for ${coinGain} coins (${describeEventEffects(coinDelta, repDelta)})`,
      classifyEffect(coinDelta, repDelta),
    );
  }

  // Sync the ledger so the exchange is visible to other engine systems.
  syncResourceBankToLedger(state);

  // Community Favour is a FREE once-per-turn action (CG-0MSTOATDQ005XDET):
  // it deliberately does NOT call consumeAction, so it remains available as a
  // fallback even when the daily action budget is spent.
  state.favourUsedThisTurn = true;
  return null;
}

/**
 * Staff peek skill: reveals the top card of the face-down incident deck
 * once per turn, as an action, and returns it face-down without resolving
 * it.
 *
 * Requirements (all enforced):
 * - Game still in progress and phase is MarketPhase.
 * - An employed staff member carries the `peekOncePerTurn` ability.
 * - The once-per-turn gate (`state.peekUsedThisTurn`) is not yet used.
 * - At least one daily action remains (the peek consumes one action).
 *
 * The deck is NOT mutated — the peeked card stays on top (face-down return)
 * and nothing is resolved (no resource changes, no draw history, no
 * Incident log). The revealed card is exposed via `state.revealedPeekedCard`
 * for the scene to render face-up (AC2); the scene clears the field after
 * the reveal. Returns null (consuming nothing) when the deck is empty.
 *
 * @param state Current game state (mutated in-place: action + gate).
 * @returns The top EventCard of the incident deck, or null if the deck is
 *          empty.
 * @throws Error if the peek is illegal (no peek staff, gate used, no
 *         actions, wrong phase, game over).
 */
export function peekIncidentDeck(state: MainStreetState): EventCard | null {
  if (state.gameResult !== 'playing') {
    throw new Error('Game is over. No more actions allowed.');
  }
  if (state.phase !== 'MarketPhase') {
    throw new Error(`Cannot peek during ${state.phase}. Must be in MarketPhase.`);
  }
  const hasPeekStaff = hasPeekCapableStaff(state);
  if (!hasPeekStaff) {
    throw new Error('No staff member with the peek ability is employed.');
  }
  if (state.peekUsedThisTurn) {
    throw new Error('You have already peeked at the incident deck this turn.');
  }
  if (state.actionsRemaining <= 0) {
    throw new Error('No actions remaining this week. End your turn to start next week.');
  }
  // Nothing to peek: no-op (no action consumed, gate stays closed).
  if (state.incidentDeck.length === 0) return null;

  consumeAction(state);
  state.peekUsedThisTurn = true;
  addLog(state, 'Peeked at the top card of the incident deck.', 'neutral');

  // Reveal-only: expose the top card to the scene via `revealedPeekedCard`
  // (AC2) and return it without removing it from the deck. The scene
  // renders the face-up reveal, then clears the field.
  const peeked = state.incidentDeck[0];
  state.revealedPeekedCard = peeked;
  return peeked;
}

