/**
 * Main Street: Event Resolution
 *
 * Resolution of Investment/Incident events (single-player and competitive)
 * and the duration/incident helper predicates.
 *
 * @module
 */

import { createActiveEffect } from '@core-engine/ActiveEffect';
import { applyCompetitiveIncome, getSlotOwnerId } from './MainStreetAdjacency';
import type { EventCard, SynergyType, SpecializationSkill, DurationEventCard } from './MainStreetCards';
import { isDurationEventCard } from './MainStreetCards';
import { applyReputationMultiplier, roundInt } from './MainStreetDifficulty';
import { computeIncidentSkillBuffs, computeReputationGainMultiplier, getEmployedSpecializationSkills, computeTaxAuditRate, computeProportionalCoinLoss } from './MainStreetStaffBuffs';
import { deserializeSkillIds } from './MainStreetStaffSkills';
import type { MainStreetState } from './MainStreetState';
import { addLog, syncResourceBankToLedger, describeEventEffects, classifyEffect } from './MainStreetState';
import { recordMainStreetEvent } from './MainStreetTranscript';

/**
 * Resolves a single event card's effects on the game state.
 *
 * DurationEventCards branch to ActiveEffect creation instead of applying
 * one-shot coin/reputation deltas. Regular EventCards apply deltas as before.
 */
export function resolveEvent(state: MainStreetState, event: EventCard): void {
  // ── DurationEventCard branch ────────────────────────────────
  if (isDurationEventCard(event)) {
    const dEvent = event as DurationEventCard;

    // Compute effective duration (check clinic/medical center for duration
    // mitigation — negative effects only; positive effects keep full duration).
    let effectiveDuration = computeDurationWithClinicReduction(dEvent.duration, state, dEvent.multiplier);

    // Create the ActiveEffect
    const effect = createActiveEffect(
      dEvent.effectType,
      dEvent.multiplier,
      effectiveDuration,
      dEvent.id,
      `${dEvent.name}: ${dEvent.effect}`,
    );
    state.activeEffects.push(effect);

    // Log the onset (generic wording covering both negative cuts and
    // positive boosts — Group C adds positive income-multiplier and
    // rep-multiplier effects).
    const multiplierLabel = Math.round(dEvent.multiplier * 100);
    const what = dEvent.effectType === 'rep-multiplier' ? 'Reputation' : 'Income';
    const logText = effectiveDuration > 0
      ? `${dEvent.name}: ${what} multiplier ${multiplierLabel}% for ${effectiveDuration} turns`
      : `${dEvent.name}: Resolved with no effect (fully neutralized)`;
    addLog(state, logText, 'loss');

    // Record transcript event
    recordMainStreetEvent({
      type: 'active-effect',
      turn: state.turn,
      effectType: dEvent.effectType,
      sourceEventId: dEvent.id,
      duration: effectiveDuration,
      description: logText,
    });

    syncResourceBankToLedger(state);
    return;
  }

  // ── Regular EventCard resolution ────────────────────────────
  // Staff specialization incident/rep buffs (I4, CG-0MT4WXV2J000M35M):
  // damage reductions apply to Incident events only; the Brand Ambassador
  // +50% gains multiplier applies to positive reputation deltas from both
  // incidents and investments.
  const employedSkills = getEmployedSpecializationSkills(state);
  const repGainMultiplier = computeReputationGainMultiplier(employedSkills);
  const incidentBuffs = event.trigger === 'Incident' ? computeIncidentSkillBuffs(employedSkills) : null;
  const theftNeutralized =
    incidentBuffs !== null && incidentBuffs.immuneToTheftLoss && isTheftLossIncident(event);
  /** Effective coin delta after quality-inspector / security-consultant mitigation (integer). */
  const cDelta = (effect: number): number => {
    if (theftNeutralized && effect < 0) return 0; // theft immunity: no coin loss
    if (incidentBuffs === null || effect >= 0) return roundInt(effect);
    return roundInt(effect + Math.abs(effect) * incidentBuffs.coinDamageReductionPct);
  };
  /** Effective reputation delta after brand-ambassador / compliance mitigation (integer). */
  const rDelta = (effect: number): number => {
    if (effect > 0) return roundInt(effect * repGainMultiplier);
    if (incidentBuffs === null) return roundInt(effect);
    return roundInt(Math.min(0, effect + incidentBuffs.reputationDamageReductionFlat));
  };
  const rep = state.resourceBank.reputation;
  const cfg = state.config;
  // Event's own coin delta before staff mitigation / reputation scaling:
  // flat events use `coinDelta`; proportional events (CG-0MTQ7W0ZX0059R3J)
  // collect a percentage of the current banked balance at the effective rate.
  const baseCoinDelta = eventCoinDeltaFor(state, event);

  switch (event.target) {
    case 'SpecificSynergy': {
      // Count matching businesses and apply coinDelta per match. A
      // proportional event is a whole-balance effect, so its loss is applied
      // once rather than per match.
      const matchCount = state.streetGrid.filter(
        b => b !== null && b.synergyTypes.includes(event.targetSynergy as SynergyType),
      ).length;
      const rawDelta = event.coinPercentDelta !== undefined
        ? baseCoinDelta
        : baseCoinDelta * matchCount;
      state.resourceBank.coins += applyReputationMultiplier(cDelta(rawDelta), rep, cfg);
      state.resourceBank.reputation += rDelta(event.reputationDelta);
      break;
    }
    case 'All': {
      // Apply to all -- direct delta on resource bank
      state.resourceBank.coins += applyReputationMultiplier(cDelta(baseCoinDelta), rep, cfg);
      state.resourceBank.reputation += rDelta(event.reputationDelta);
      break;
    }
    case 'RandomBusiness': {
      // Pick a random placed business and apply effect
      const placed = state.streetGrid.filter(b => b !== null);
      if (placed.length > 0) {
        // Use RNG for deterministic random selection
        // Consume RNG for deterministic selection (used in future milestones)
        const _targetIdx = Math.floor(state.rng() * placed.length);
        void _targetIdx;
        state.resourceBank.coins += applyReputationMultiplier(cDelta(baseCoinDelta), rep, cfg);
      }
      state.resourceBank.reputation += rDelta(event.reputationDelta);
      break;
    }
  }

  // Sync shared EconomyLedger after resourceBank mutations
  syncResourceBankToLedger(state);
}

/**
 * The event's own coin delta before staff mitigation and reputation scaling
 * (CG-0MTQ7W0ZX0059R3J).
 *
 * Flat-delta events return `event.coinDelta` unchanged. Proportional events
 * (`coinPercentDelta` defined) collect a percentage of the player's banked
 * coins RIGHT NOW: the base rate comes from the card (45% for the Tax Audit),
 * an employed staff member's `taxAuditRate` may lower it (the Accountant's
 * 25%), and the loss is rounded to the nearest integer and clamped so the
 * balance never drops below 0.
 *
 * Reads `state.resourceBank.coins` only and consumes no RNG — safe for
 * deterministic replay and CPU-side AI projection. This is the single source
 * of truth shared by {@link resolveEvent}, {@link computeEventDeltas} and
 * `projectEventCoinDelta` so the live, deferred and AI paths never diverge.
 *
 * @param state Current game state (read-only).
 * @param event The event being resolved / projected.
 * @returns The signed coin delta (negative = loss).
 */
export function eventCoinDeltaFor(state: MainStreetState, event: EventCard): number {
  if (event.coinPercentDelta === undefined) return event.coinDelta;
  const baseRate = Math.abs(event.coinPercentDelta);
  const rate = computeTaxAuditRate(state.staffCards ?? [], baseRate);
  return -computeProportionalCoinLoss(state.resourceBank.coins, rate);
}

/**
 * Plays and resolves an Investment event card from the player's hand.
 * Can only be called during the MarketPhase.
 *
 * @param state      Current game state (mutated in-place).
 * @param handIndex  Optional index of the event card in `state.hand` to play.
 *                   When omitted, the first event-family card in the hand is
 *                   played (backward-compatible with the old single-held-event
 *                   semantics used by tests and the AI).
 * @throws Error if no Investment event is found at the given index / in the hand.
 */
export function playHeldEvent(state: MainStreetState, handIndex?: number): void {
  const hand = state.hand ?? [];
  let index = handIndex;
  if (index === undefined) {
    index = hand.findIndex(c => c.family === 'event');
  }
  if (index === undefined || index < 0 || index >= hand.length) {
    throw new Error('No Investment event is currently held in hand.');
  }
  const card = hand[index];
  if (card.family !== 'event') {
    throw new Error(`Card at hand index ${index} is not an Investment event.`);
  }

  const event = card as EventCard;
  const coinsBefore = state.resourceBank.coins;
  const repBefore = state.resourceBank.reputation;
  resolveEvent(state, event);
  // Investment played by the active player: per-owner routing in competitive
  // mode (CG-0MTIIL6J200291ZQ) — benefit lands in the acting player's wallet.
  if ((state.players?.length ?? 0) > 1) {
    applyCompetitiveEventEffects(state, event, state.activePlayerId ?? 0);
  }
  const coinChange = state.resourceBank.coins - coinsBefore;
  const repChange = state.resourceBank.reputation - repBefore;
  addLog(
    state,
    `Investment: ${event.name} (${describeEventEffects(coinChange, repChange)})`,
    classifyEffect(coinChange, repChange),
  );
  hand.splice(index, 1);
}

/**
 * Resolves any remaining Investment event card from the player's hand.
 *
 * NOTE: This is no longer called automatically during processEndOfTurn.
 * Held events persist across turns until the player actively plays them
 * via the 'play-event' action during the MarketPhase. This function is
 * retained for programmatic / test use.
 *
 * @returns The resolved event, or null if no event was in hand.
 */
export function resolveHeldInvestment(state: MainStreetState): EventCard | null {
  const hand = state.hand ?? [];
  const index = hand.findIndex(c => c.family === 'event');
  if (index === -1) return null;

  const event = hand[index] as EventCard;
  const coinsBefore = state.resourceBank.coins;
  const repBefore = state.resourceBank.reputation;
  resolveEvent(state, event);
  const coinChange = state.resourceBank.coins - coinsBefore;
  const repChange = state.resourceBank.reputation - repBefore;
  addLog(
    state,
    `Investment (auto): ${event.name} (${describeEventEffects(coinChange, repChange)})`,
    classifyEffect(coinChange, repChange),
  );
  hand.splice(index, 1);
  return event;
}

/**
 * Non-mutating projection of the coin/reputation deltas {@link resolveEvent}
 * would apply for a regular (non-duration, non-choice) event right now
 * (CG-0MTR72P14000VO6Q).
 *
 * Mirrors the resource math inside resolveEvent — staff mitigation,
 * reputation gain multiplier, reputation multiplier scaling — WITHOUT
 * mutating `state.resourceBank`. Used by the deferred-mutation path
 * (processEndOfTurn with `deferResourceApplication`) so the incident deltas
 * are known before the end-of-turn animations complete.
 *
 * RandomBusiness consumes one RNG draw exactly as resolveEvent does (the
 * pull is unused for selection either way) so the deterministic RNG stream
 * is identical across the legacy and deferred paths. Duration events have
 * zero coin/rep deltas (they mutate activeEffects, not resourceBank).
 *
 * @param state      Current game state (read-only).
 * @param event      The already-drawn incident event.
 * @param repOverride Optional reputation value to use for the multiplier
 *                    scaling when the caller knows reputation will change
 *                    before this event applies (e.g. income rep added first).
 * @returns The coin and reputation deltas the event would apply.
 */
export function computeEventDeltas(
  state: MainStreetState,
  event: EventCard,
  repOverride?: number,
): { coinDelta: number; repDelta: number } {
  if (isDurationEventCard(event)) {
    // Duration events mutate activeEffects, not resourceBank — no deltas.
    return { coinDelta: 0, repDelta: 0 };
  }
  const employedSkills = getEmployedSpecializationSkills(state);
  const repGainMultiplier = computeReputationGainMultiplier(employedSkills);
  const incidentBuffs = event.trigger === 'Incident' ? computeIncidentSkillBuffs(employedSkills) : null;
  const theftNeutralized =
    incidentBuffs !== null && incidentBuffs.immuneToTheftLoss && isTheftLossIncident(event);
  const cDelta = (effect: number): number => {
    if (theftNeutralized && effect < 0) return 0;
    if (incidentBuffs === null || effect >= 0) return roundInt(effect);
    return roundInt(effect + Math.abs(effect) * incidentBuffs.coinDamageReductionPct);
  };
  const rDelta = (effect: number): number => {
    if (effect > 0) return roundInt(effect * repGainMultiplier);
    if (incidentBuffs === null) return roundInt(effect);
    return roundInt(Math.min(0, effect + incidentBuffs.reputationDamageReductionFlat));
  };
  const rep = repOverride ?? state.resourceBank.reputation;
  const cfg = state.config;
  // Proportional events collect from the current banked balance (same helper
  // as resolveEvent — CG-0MTQ7W0ZX0059R3J). In the deferred path income is
  // not yet applied; no non-choice proportional event ships, but routing
  // through the shared helper keeps the two paths identical for flat events.
  const baseCoinDelta = eventCoinDeltaFor(state, event);

  switch (event.target) {
    case 'SpecificSynergy': {
      const matchCount = state.streetGrid.filter(
        b => b !== null && b.synergyTypes.includes(event.targetSynergy as SynergyType),
      ).length;
      const rawDelta = event.coinPercentDelta !== undefined
        ? baseCoinDelta
        : baseCoinDelta * matchCount;
      return {
        coinDelta: applyReputationMultiplier(cDelta(rawDelta), rep, cfg),
        repDelta: rDelta(event.reputationDelta),
      };
    }
    case 'All':
      return {
        coinDelta: applyReputationMultiplier(cDelta(baseCoinDelta), rep, cfg),
        repDelta: rDelta(event.reputationDelta),
      };
    case 'RandomBusiness': {
      const placed = state.streetGrid.filter(b => b !== null);
      if (placed.length > 0) {
        // Consume RNG exactly as resolveEvent does (deterministic selection).
        void Math.floor(state.rng() * placed.length);
        return {
          coinDelta: applyReputationMultiplier(cDelta(baseCoinDelta), rep, cfg),
          repDelta: rDelta(event.reputationDelta),
        };
      }
      return {
        coinDelta: 0,
        repDelta: rDelta(event.reputationDelta),
      };
    }
    default:
      return { coinDelta: 0, repDelta: 0 };
  }
}

/**
 * Routes a shared Investment/Incident event's effects per-owner for
 * competitive states (N >= 2, CG-0MTIIL6J200291ZQ).
 *
 * Retains the shared resolution semantics of {@link resolveEvent} but applies
 * the deltas to each owning player's wallet rather than the shared host
 * wallet (which is left unchanged — the host path already resolved the event
 * on the resourceBank before this helper runs):
 *
 *  - Duration events are board-wide ActiveEffects (the shared activeEffects
 *    list) and are NOT re-routed here — they are applied once by the host
 *    path and influence every owner's income phase via
 *    {@link applyCompetitiveIncome}.
 *  - `All` / `RandomBusiness`:
 *      - Investment events (actingPlayerId provided): the acting player's own
 *        wallet receives the delta (playing the event benefits the acting
 *        player).
 *      - Incidents (shared deck, no acting player): every owner's wallet
 *        receives the delta, each scaled by its OWN reputation multiplier and
 *        staff mitigation (street-wide semantics). RandomBusiness resolves
 *        deterministically to the owner of the lowest-index placed business
 *        without consuming RNG (no such cards ship in the CSV at present —
 *        verified — so this path is a documented fallback).
 *  - `SpecificSynergy` (both triggers): coinDelta is multiplied by the count
 *    of matching businesses OWNED by that player (per-match rule retained)
 *    and credited to each slot owner; the reputation delta applies once per
 *    owner that owns at least one matching business (mirrors the shared
 *    resolution where rep is applied once regardless of match count).
 *
 * Consumes no RNG (deterministic replay, AC3).
 *
 * @param state           Competitive game state (players[] mutated in-place).
 * @param event           The already-resolved shared event card to route.
 * @param actingPlayerId  Owner index of the player who played the event
 *                        (Investment trigger). Omit for shared incidents.
 */
export function applyCompetitiveEventEffects(
  state: MainStreetState,
  event: EventCard,
  actingPlayerId?: number,
): void {
  if (!state.players || state.players.length < 2) return;
  if (isDurationEventCard(event)) return; // board-wide effect, host-applied only

  const cfg = state.config;
  const target = event.target;
  const actingId = event.trigger === 'Investment' ? actingPlayerId ?? 0 : undefined;

  // Pre-compute per-owner staff mitigation (mirrors resolveEvent).
  const owners = state.players.map((player) => {
    const ownerId = player.playerId;
    const skills = (player.staffCards ?? []).flatMap((card) =>
      Array.isArray(card.specializationSkillIds) ? deserializeSkillIds(card.specializationSkillIds) : [],
    );
    const incidentBuffs =
      event.trigger === 'Incident' ? computeIncidentSkillBuffs(skills) : null;
    const theftNeutralized =
      incidentBuffs !== null && incidentBuffs.immuneToTheftLoss && isTheftLossIncident(event);
    return { ownerId, player, skills, incidentBuffs, theftNeutralized };
  });

  const coinDeltaFor = (owner: { incidentBuffs: ReturnType<typeof computeIncidentSkillBuffs> | null; theftNeutralized: boolean }, effect: number): number => {
    if (owner.theftNeutralized && effect < 0) return 0; // theft immunity
    if (owner.incidentBuffs === null || effect >= 0) return roundInt(effect);
    return roundInt(effect + Math.abs(effect) * owner.incidentBuffs.coinDamageReductionPct);
  };
  const repDeltaFor = (owner: { skills: readonly SpecializationSkill[]; incidentBuffs: ReturnType<typeof computeIncidentSkillBuffs> | null }, effect: number): number => {
    if (effect > 0) return roundInt(effect * computeReputationGainMultiplier(owner.skills));
    if (owner.incidentBuffs === null) return roundInt(effect);
    return roundInt(Math.min(0, effect + owner.incidentBuffs.reputationDamageReductionFlat));
  };

  const changed: { ownerId: number; coins: number; rep: number }[] = [];
  for (const owner of owners) {
    let coinsGained = 0;
    let repGained = 0;
    // Proportional events (CG-0MTQ7W0ZX0059R3J): each owner is taxed on its
    // OWN banked balance at its own effective rate (an Accountant employed by
    // one player only mitigates that player's audit). Flat events keep the
    // nominal per-owner `coinDelta`.
    const baseCoinDelta = event.coinPercentDelta === undefined
      ? event.coinDelta
      : -computeProportionalCoinLoss(
          owner.player.coins,
          computeTaxAuditRate(owner.player.staffCards ?? [], Math.abs(event.coinPercentDelta)),
        );

    switch (target) {
      case 'SpecificSynergy': {
        let matchCount = 0;
        for (let i = 0; i < state.streetGrid.length; i++) {
          const b = state.streetGrid[i];
          if (!b || !b.synergyTypes) continue;
          if (getSlotOwnerId(state, i) !== owner.ownerId) continue;
          if (b.synergyTypes.includes(event.targetSynergy as SynergyType)) matchCount += 1;
        }
        if (matchCount > 0) {
          const rawDelta = event.coinPercentDelta !== undefined
            ? baseCoinDelta
            : baseCoinDelta * matchCount;
          coinsGained += applyReputationMultiplier(coinDeltaFor(owner, rawDelta), owner.player.reputation, cfg);
          repGained += repDeltaFor(owner, event.reputationDelta);
        }
        break;
      }
      case 'All':
      case 'RandomBusiness': {
        // Investment → acting player only; incident → every owner once.
        if (actingId !== undefined && owner.ownerId !== actingId) break;
        coinsGained += applyReputationMultiplier(coinDeltaFor(owner, baseCoinDelta), owner.player.reputation, cfg);
        repGained += repDeltaFor(owner, event.reputationDelta);
        break;
      }
      default:
        break;
    }

    if (coinsGained !== 0 || repGained !== 0) {
      owner.player.coins += coinsGained;
      owner.player.reputation += repGained;
      changed.push({ ownerId: owner.ownerId, coins: coinsGained, rep: repGained });
    }
  }

  for (const c of changed) {
    addLog(
      state,
      `P${c.ownerId} ${event.trigger}: ${event.name} (${describeEventEffects(c.coins, c.rep)})`,
      classifyEffect(c.coins, c.rep),
    );
  }
}

/**
 * Computes the effective duration for a DurationEventCard by scanning
 * the street grid for Clinic and Medical Center cards.
 *
 * Rules:
 * - Medical Center (upg-medical-center) reduces duration by 3
 * - Clinic (biz-clinic) reduces duration by 2
 * - Only the stronger reduction applies (Medical Center > Clinic)
 * - Minimum duration floor is 1
 * - Reduction applies ONLY to negative effects (multiplier < 1): a Clinic
 *   should shorten a harmful income cut, not a positive boost like
 *   Tourist Season / Community Renovation (Group C, CG-0MSQJ244M0055X7S).
 *
 * @param baseDuration  Base duration before reductions
 * @param state         Current game state (street grid is scanned)
 * @param multiplier    The effect's multiplier; < 1 = negative effect
 * @returns Effective duration after reductions (min 1).
 */
function computeDurationWithClinicReduction(
  baseDuration: number,
  state: MainStreetState,
  multiplier: number,
): number {
  // Positive effects (>= 1) are not shortened by medical coverage.
  if (multiplier >= 1) return baseDuration;

  let hasMedicalCenter = false;
  let hasClinic = false;

  for (const slot of state.streetGrid) {
    if (slot === null) continue;
    if (slot.id.startsWith('upg-medical-center')) {
      hasMedicalCenter = true;
    } else if (slot.id.startsWith('biz-clinic')) {
      hasClinic = true;
    }
  }

  let reduction = 0;
  if (hasMedicalCenter) {
    reduction = 3;
  } else if (hasClinic) {
    reduction = 2;
  }

  return Math.max(1, baseDuration - reduction);
}

/**
 * True for Incident events representing theft or loss of coins (targeted in
 * the Security Consultant's immunity, I4). Matches on the incident's
 * description, which is the stable design source (all incident descriptions
 * in card-data.csv state their consequence explicitly).
 */
function isTheftLossIncident(event: EventCard): boolean {
  return (
    event.trigger === 'Incident' &&
    (/\btheft\b/i.test(event.effect) || /\bloss(?:es)?\b/i.test(event.effect))
  );
}

