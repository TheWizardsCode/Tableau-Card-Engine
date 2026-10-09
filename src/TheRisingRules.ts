/**
 * 1916: The Rising — timeline legality, placement scoring and win/loss.
 *
 * The rules layer is pure and renderer-free. It composes the timeline helpers
 * from {@link ./TheRisingState} with the content roster to answer three
 * questions:
 *
 * 1. **Legality** — may a spirit be placed on the timeline at a given slot
 *    without breaking the relative chronological order of the placed spirits?
 * 2. **Scoring** — how much Insight does a correct placement award, and does
 *    it complete an era sub-sequence (an era bonus)?
 * 3. **Outcome** — is the session won, lost, or still in progress?
 *
 * Every function is deterministic: the same state and the same placement
 * always produce the same result and the same score change.
 *
 * @module TheRisingRules
 */

import { illegalAction, legalAction, type LegalityResult } from '@rule-engine';
import { ROSTER, type Roster, type Spirit } from './TheRisingContent';
import {
  RISING_FINAL_YEAR,
  isSlotLegal,
  isTimelineOrdered,
  resolvePlacementSlot,
  transition,
  type RisingState,
  type SpiritPlacement,
} from './TheRisingState';

// Re-export the pure timeline helpers so rules consumers have one entry point.
export { isTimelineOrdered, isSlotLegal, resolvePlacementSlot } from './TheRisingState';

/** Insight awarded for any correct placement. */
export const BASE_PLACEMENT_INSIGHT = 2;

/** Bonus Insight awarded when a placement completes an era sub-sequence. */
export const ERA_COMPLETION_BONUS = 5;

// ── Legality ────────────────────────────────────────────────

/**
 * Every slot at which `spirit` could legally be inserted, in ascending order.
 *
 * Returns `[]` when the timeline is already unordered (a defensive guard: a
 * valid timeline can always accept at least one slot for any spirit).
 */
export function findLegalSlots(
  timeline: readonly SpiritPlacement[],
  spirit: Spirit,
): number[] {
  if (!isTimelineOrdered(timeline)) {
    return [];
  }
  const slots: number[] = [];
  for (let slot = 0; slot <= timeline.length; slot += 1) {
    if (isSlotLegal(timeline, spirit.dateRange.from, slot)) {
      slots.push(slot);
    }
  }
  return slots;
}

/**
 * Whether `spirit` may be placed on the timeline.
 *
 * Checks that the spirit is not already placed, that the timeline is already
 * ordered, and — when a `slotIndex` is supplied — that the chosen slot
 * preserves chronological order. With no slot, the placement is legal when at
 * least one slot exists.
 */
export function canPlaceSpirit(
  state: RisingState,
  spirit: Spirit,
  slotIndex?: number,
): LegalityResult {
  if (state.timeline.some((entry) => entry.spiritId === spirit.id)) {
    return illegalAction(`${spirit.name} is already on the timeline.`);
  }
  if (state.placedSpiritIds.includes(spirit.id)) {
    return illegalAction(`${spirit.name} is already on the timeline.`);
  }
  if (!isTimelineOrdered(state.timeline)) {
    return illegalAction('The timeline is not in chronological order.');
  }
  const year = spirit.dateRange.from;
  if (slotIndex === undefined) {
    return findLegalSlots(state.timeline, spirit).length > 0
      ? legalAction()
      : illegalAction(`${spirit.name} cannot be placed in chronological order.`);
  }
  if (isSlotLegal(state.timeline, year, slotIndex)) {
    return legalAction();
  }
  return illegalAction(
    `Placing ${spirit.name} at slot ${slotIndex} breaks the timeline's chronological order.`,
  );
}

/**
 * Whether a spirit held in hand (or currently being met) may be placed.
 *
 * Resolves an id against the roster; the spirit must be in `state.hand` or be
 * the `activeSpiritId`.
 */
export function canPlaceFromHand(
  state: RisingState,
  spiritOrId: Spirit | string,
  slotIndex?: number,
  roster: Roster = ROSTER,
): LegalityResult {
  const spirit =
    typeof spiritOrId === 'string'
      ? roster.spirits.find((candidate) => candidate.id === spiritOrId)
      : spiritOrId;
  if (!spirit) {
    return illegalAction(`Unknown spirit "${String(spiritOrId)}".`);
  }
  const inHand = state.hand.includes(spirit.id);
  const isActive = state.activeSpiritId === spirit.id;
  if (!inHand && !isActive) {
    return illegalAction(`${spirit.name} is not in hand.`);
  }
  return canPlaceSpirit(state, spirit, slotIndex);
}

// ── Scoring ─────────────────────────────────────────────────

/** The Insight breakdown for a single placement. */
export interface PlacementScore {
  /** Insight for the correct placement itself. */
  readonly base: number;
  /** Bonus Insight for completing an era sub-sequence (`0` when none). */
  readonly eraBonus: number;
  /** Total Insight awarded (`base + eraBonus`). */
  readonly total: number;
  /** The era completed by this placement, or `null`. */
  readonly completedEraId: string | null;
}

/**
 * Score a correct placement.
 *
 * Era bonus: when every spirit in the placement's era has now been placed
 * (counting the spirit being placed), the placement completes the era's
 * sub-sequence and awards {@link ERA_COMPLETION_BONUS}.
 *
 * Pure and deterministic — this function does not mutate any state and is safe
 * to call speculatively before committing a placement.
 */
export function scorePlacement(
  state: RisingState,
  spirit: Spirit,
  roster: Roster = ROSTER,
): PlacementScore {
  const placed = new Set(state.placedSpiritIds);
  placed.add(spirit.id);
  const era = roster.eras.find((candidate) => candidate.id === spirit.eraId);
  const completesEra =
    era !== undefined && era.spiritIds.every((spiritId) => placed.has(spiritId));
  const eraBonus = completesEra ? ERA_COMPLETION_BONUS : 0;
  return {
    base: BASE_PLACEMENT_INSIGHT,
    eraBonus,
    total: BASE_PLACEMENT_INSIGHT + eraBonus,
    completedEraId: completesEra && era ? era.id : null,
  };
}

// ── Placement application ───────────────────────────────────

/** The result of attempting to place a spirit. */
export interface PlacementResult {
  /** The next state (unchanged when the placement is illegal). */
  readonly state: RisingState;
  /** Whether the placement was legal. */
  readonly result: LegalityResult;
  /** The score applied, or `null` when the placement was rejected. */
  readonly score: PlacementScore | null;
  /** The committed placement, or `null` when rejected. */
  readonly placement: SpiritPlacement | null;
}

/**
 * Validate and commit a placement.
 *
 * The supplied `slotIndex` (optional) must preserve chronological order; when
 * omitted, the card is inserted at its canonical chronological slot.
 * A legal placement moves the spirit from hand to the timeline, advances the
 * phase to `resolved`, and awards the {@link scorePlacement} Insight.
 */
export function applyPlacement(
  state: RisingState,
  spirit: Spirit,
  slotIndex?: number,
  roster: Roster = ROSTER,
): PlacementResult {
  const legality = canPlaceSpirit(state, spirit, slotIndex);
  if (!legality.legal) {
    return { state, result: legality, score: null, placement: null };
  }

  const slot = slotIndex ?? resolvePlacementSlot(state.timeline, spirit.dateRange.from);
  const score = scorePlacement(state, spirit, roster);
  const placement: SpiritPlacement = {
    spiritId: spirit.id,
    eraId: spirit.eraId,
    year: spirit.dateRange.from,
    slotIndex: slot,
  };

  const placed = transition(state, { type: 'place-spirit', placement });
  if (!placed.result.legal) {
    return { state, result: placed.result, score: null, placement: null };
  }

  return {
    state: { ...placed.state, insight: placed.state.insight + score.total },
    result: legalAction(),
    score,
    placement,
  };
}

// ── Win / loss ──────────────────────────────────────────────

/** The evaluated outcome of a session. */
export type RisingOutcome = 'in-progress' | 'won' | 'lost';

/** Why a session ended. */
export type RisingOutcomeReason = 'timeline-complete' | 'memory-depleted' | 'clock-expired';

/** A full, inspectable outcome evaluation. */
export interface OutcomeEvaluation {
  readonly outcome: RisingOutcome;
  readonly reason: RisingOutcomeReason | null;
  readonly timelineComplete: boolean;
  readonly insight: number;
  readonly insightTarget: number;
  readonly memory: number;
  readonly clock: number;
}

/**
 * Whether every target spirit has been placed and the timeline is ordered.
 *
 * The target defaults to the full roster (set at session creation) so the win
 * condition is "the full seven-era timeline is correctly ordered".
 */
export function isTimelineComplete(state: RisingState): boolean {
  if (!isTimelineOrdered(state.timeline)) {
    return false;
  }
  const placed = new Set(state.timeline.map((entry) => entry.spiritId));
  return state.targetSpiritIds.every((spiritId) => placed.has(spiritId));
}

/** Whether the session is won: timeline complete and Insight at or above target. */
export function isWin(state: RisingState): boolean {
  return isTimelineComplete(state) && state.insight >= state.insightTarget;
}

/**
 * Whether the session is lost.
 *
 * Loss when the timeline is incomplete and either Memory is depleted or the
 * Rising clock has reached {@link RISING_FINAL_YEAR}. A complete-but-under-target
 * timeline that runs out of time also loses (the clock has expired).
 */
export function isLoss(state: RisingState): boolean {
  if (isWin(state)) {
    return false;
  }
  const complete = isTimelineComplete(state);
  if (state.clock >= RISING_FINAL_YEAR) {
    return true;
  }
  return !complete && state.memory <= 0;
}

/** Evaluate the session outcome with an inspectable reason. */
export function evaluateOutcome(state: RisingState): OutcomeEvaluation {
  const timelineComplete = isTimelineComplete(state);
  const base = {
    timelineComplete,
    insight: state.insight,
    insightTarget: state.insightTarget,
    memory: state.memory,
    clock: state.clock,
  } as const;

  if (timelineComplete && state.insight >= state.insightTarget) {
    return { ...base, outcome: 'won', reason: 'timeline-complete' };
  }
  if (state.clock >= RISING_FINAL_YEAR) {
    return { ...base, outcome: 'lost', reason: 'clock-expired' };
  }
  if (!timelineComplete && state.memory <= 0) {
    return { ...base, outcome: 'lost', reason: 'memory-depleted' };
  }
  return { ...base, outcome: 'in-progress', reason: null };
}
