/**
 * Main Street: Engine Scoring and Event Severity
 *
 * Score computation/updates (single-player and competitive), event coin-delta
 * projection, severity classification, and AI event-choice helpers.
 *
 * @module
 */

import type { EventCard } from './MainStreetCards';
import { getEventTemplates } from './MainStreetCards';
import { applyReputationMultiplier } from './MainStreetDifficulty';
import type { DifficultyName } from './MainStreetDifficulty';
import { eventCoinDeltaFor } from './MainStreetEngineEvents';
import type { MainStreetState } from './MainStreetState';
import { syncResourceBankToLedger } from './MainStreetState';

/**
 * Computes the final score.
 * Formula: coins + reputation + (challengesCompleted * challengeBonusPoints)
 */
export function computeScore(state: MainStreetState): number {
  // Sync the ledger from resourceBank before reading, to ensure it reflects
  // any direct resourceBank mutations made by tests or external code.
  syncResourceBankToLedger(state);
  // Use shared EconomyLedger for resource values
  return (
    state.ledger.get('coins') +
    state.ledger.get('reputation') +
    state.challengesCompleted.length * state.config.challengeBonusPoints
  );
}

/**
 * Updates the finalScore field on the state.
 */
export function updateScore(state: MainStreetState): void {
  state.finalScore = computeScore(state);
}

export function updateCompetitiveScores(state: MainStreetState): void {
  if (!state.players || state.players.length === 0) {
    updateScore(state);
    return;
  }
  const bonus = state.challengesCompleted.length * state.config.challengeBonusPoints;
  let maxScore = -Infinity;
  for (const p of state.players) {
    p.score = p.coins + p.reputation + bonus;
    if (p.score > maxScore) maxScore = p.score;
  }
  // Keep the shared ledger/finalScore as the current best (open single-player API).
  syncResourceBankToLedger(state);
  state.finalScore = maxScore;
  // Also mirror max into shared coins/rep history where used.
}

/**
 * Non-mutating projection of the effective coin delta an event would apply
 * RIGHT NOW, mirroring the engine's resolveEvent math WITHOUT staff
 * mitigation (static effect-size comparison per producer decision
 * 2026-09-08 Q1 — no turn simulation). Used for affordability checks.
 *
 * @param state Current game state (read-only).
 * @param event The event whose coin effect is projected.
 * @returns Projected coin delta (negative = loss).
 */
export function projectEventCoinDelta(state: MainStreetState, event: EventCard): number {
  const cfg = state.config;
  const rep = state.resourceBank.reputation;
  // Proportional events (CG-0MTQ7W0ZX0059R3J) project the same
  // percentage-of-balance magnitude the engine applies; flat events keep
  // their per-target `coinDelta` semantics. Routing through the shared helper
  // keeps the AI affordability / accept-reject path in lock-step with
  // resolveEvent (AC5).
  const base = eventCoinDeltaFor(state, event);
  let raw: number;
  switch (event.target) {
    case 'SpecificSynergy': {
      const matchCount = state.streetGrid.filter(
        (b) => b !== null && b.synergyTypes.includes(event.targetSynergy as never),
      ).length;
      raw = event.coinPercentDelta !== undefined ? base : base * matchCount;
      break;
    }
    case 'RandomBusiness': {
      const placed = state.streetGrid.filter((b) => b !== null).length;
      raw = placed > 0 ? base : 0;
      break;
    }
    case 'All':
    default:
      raw = base;
      break;
  }
  return applyReputationMultiplier(raw, rep, cfg);
}

/**
 * Static severity of an event's net effect: magnitude of (coinDelta +
 * reputationDelta) with reputation scaled up. Larger = worse for negative
 * events / more impactful for positive ones.
 */
export function eventSeverity(event: EventCard): number {
  return Math.abs(
    event.coinDelta + event.reputationDelta * REPUTATION_SEVERITY_SCALE,
  );
}

/**
 * Difficulty-based Accept/Reject decision for a pending dual-choice incident
 * (CG-0MTSHG8RP008E128 AC22). Deterministic and side-effect free.
 *
 * Strategy mapping:
 * - Easy: always accept — avoid escalation risk, short-term thinking.
 * - Medium: accept when the event's effect is affordable (coins stay > 0
 *   after the projected delta); reject when it would be unaffordable.
 * - Hard (static full-chain evaluation):
 *   - Positive/neutral events (net >= 0): accept — a guaranteed benefit is
 *     never refused (rejecting only defers value to a speculative draw).
 *   - Negative events:
 *       * accepting ends the chain (acceptNextCardId null) AND the current
 *         effect is manageable → accept (the safe terminal).
 *       * otherwise compare the full chain costs — accept pays the current
 *         effect plus the accept-next card (if the chain continues); reject
 *         skips the current effect and pays only the reject-next card.
 *         Choose the cheaper path; when rejecting is
 *         AI_EVENT_CHOICE_SIGNIFICANTLY_WORSE_RATIO× costlier, accept the
 *         manageable hit instead (the escalation is "significantly worse").
 *       * if the current effect is NOT manageable (would bankrupt), reject
 *         (avoid the imminent loss) unless rejecting is also strictly worse
 *         than accepting — both paths bad → accept (deterministic default).
 *
 * @param state      Current game state (read-only).
 * @param event      The drawn choice event (effect deferred).
 * @param difficulty Difficulty preset ('Easy' | 'Medium' | 'Hard').
 * @returns 'accept' or 'reject'.
 */
export function decideEventChoice(
  state: MainStreetState,
  event: EventCard,
  difficulty: DifficultyName,
): 'accept' | 'reject' {
  // Positive/neutral events: the benefit is guaranteed; no difficulty
  // refuses a free gain (reject only delays value to an unknown later draw).
  if (event.coinDelta + event.reputationDelta >= 0) return 'accept';

  if (difficulty === 'Easy') return 'accept';

  const projected = projectEventCoinDelta(state, event);
  const manageable = state.resourceBank.coins + projected > 0;

  if (difficulty === 'Medium') {
    return manageable ? 'accept' : 'reject';
  }

  // ── Hard: static full-chain evaluation ──
  const currentCost = eventSeverity(event);
  const acceptChainCost = currentCost + chainCardSeverity(event.acceptNextCardId);
  const rejectChainCost = chainCardSeverity(event.rejectNextCardId);

  // Accepting ends the chain (no accept-next card): the known effect is the
  // whole story — prefer the safe terminal when we can afford it (AC22).
  if (event.acceptNextCardId === null || event.acceptNextCardId === undefined) {
    if (manageable) return 'accept';
    // Unaffordable terminal: refusing skips the loss entirely (nothing is
    // added on reject either, since rejectChainCost == 0) → reject.
    return rejectChainCost === 0 ? 'reject' : 'accept';
  }

  // Rejecting adds nothing — refusing the current effect is free.
  if (rejectChainCost === 0) return 'reject';

  if (!manageable) {
    // Accepting bankrupts now. Reject delays the (potentially worse) card;
    // prefer reject unless rejecting is also the strictly worse path.
    return rejectChainCost < acceptChainCost ? 'reject' : 'accept';
  }

  if (rejectChainCost > acceptChainCost * AI_EVENT_CHOICE_SIGNIFICANTLY_WORSE_RATIO) {
    // The escalation is significantly worse than accepting — swallow the
    // manageable current effect (AC22 "reject if escalation significantly
    // worse" ⇒ prefer accept here).
    return 'accept';
  }
  if (rejectChainCost < acceptChainCost) return 'reject';
  return 'accept';
}

/**
 * "Significantly worse" guard (Hard policy): when the reject path's full
 * chain cost exceeds the accept path's full chain cost by at least this
 * ratio, the policy swallows the current manageable effect rather than risk
 * the escalation (AC22 — "reject if the escalation card is significantly
 * worse" maps onto rejecting being costlier). Exported for tests.
 */
export const AI_EVENT_CHOICE_SIGNIFICANTLY_WORSE_RATIO = 1.5;

/**
 * Looks up the next chain card template (registry lookup only — static, no
 * simulation) and returns its severity; null/absent/missing template → 0.
 */
function chainCardSeverity(nextId: string | null | undefined): number {
  if (!nextId) return 0;
  const template = getEventTemplates().find((t) => t.id === nextId);
  return template ? eventSeverity(template) : 0;
}

/**
 * Severity factor applied to a chain card's reputation delta when comparing
 * event severities: reputation points are worth more than raw coins to the
 * score (1 rep ≈ +1 score; 1 coin ≈ +1 score), but incident coin deltas are
 * per-business multiples while reputation deltas are flat. The scale keeps
 * both axes comparable for severity ranking. Internal heuristic constant.
 */
const REPUTATION_SEVERITY_SCALE = 100;

