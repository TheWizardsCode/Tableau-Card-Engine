import { describe, expect, it } from 'vitest';
import type { Era, Roster, Spirit } from '../../src/TheRisingContent';
import {
  RISING_FINAL_YEAR,
  createInitialState,
  isTimelineOrdered,
  type RisingState,
  type SpiritPlacement,
} from '../../src/TheRisingState';
import {
  BASE_PLACEMENT_INSIGHT,
  ERA_COMPLETION_BONUS,
  applyPlacement,
  canPlaceFromHand,
  canPlaceSpirit,
  evaluateOutcome,
  findLegalSlots,
  isLoss,
  isTimelineComplete,
  isWin,
  scorePlacement,
} from '../../src/TheRisingRules';

// ── Fixtures ────────────────────────────────────────────────

const REFERENCE = { id: 'source' };

function spirit(id: string, eraId: string, from: number): Spirit {
  return {
    id,
    name: id.toUpperCase(),
    commonName: id,
    eraId,
    dateRange: { from, to: from + 40, label: `${from}–${from + 40}` },
    summary: `Summary for ${id}`,
    primaryReference: REFERENCE,
    testimonies: [],
  };
}

const A = spirit('a', 'era-1', 1100);
const B = spirit('b', 'era-1', 1200);
const C = spirit('c', 'era-1', 1300);
const D = spirit('d', 'era-2', 1400);
const E = spirit('e', 'era-2', 1500);

const ERA_1: Era = {
  id: 'era-1',
  title: 'Era One',
  from: 1100,
  to: 1300,
  description: 'First era.',
  spiritIds: ['a', 'b', 'c'],
};

const ERA_2: Era = {
  id: 'era-2',
  title: 'Era Two',
  from: 1400,
  to: 1500,
  description: 'Second era.',
  spiritIds: ['d', 'e'],
};

const ROSTER: Roster = { eras: [ERA_1, ERA_2], spirits: [A, B, C, D, E] };

function entry(candidate: Spirit, slotIndex = 0): SpiritPlacement {
  return {
    spiritId: candidate.id,
    eraId: candidate.eraId,
    year: candidate.dateRange.from,
    slotIndex,
  };
}

/** A state held in the `placing` phase, ready for `applyPlacement`. */
function placingState(overrides: Partial<RisingState> = {}): RisingState {
  const base = createInitialState({ roster: ROSTER, insightTarget: 6 });
  return { ...base, phase: 'placing', ...overrides };
}

function stateWithTimeline(timeline: SpiritPlacement[], overrides: Partial<RisingState> = {}): RisingState {
  return {
    ...createInitialState({ roster: ROSTER, insightTarget: 6 }),
    timeline,
    placedSpiritIds: timeline.map((placed) => placed.spiritId),
    ...overrides,
  };
}

// ── AC1: timeline placement legality ────────────────────────

describe('TheRisingRules — timeline legality (AC1)', () => {
  it('always permits the first placement on an empty timeline', () => {
    const state = createInitialState({ roster: ROSTER });
    for (const candidate of ROSTER.spirits) {
      expect(canPlaceSpirit(state, candidate).legal, candidate.id).toBe(true);
      expect(canPlaceSpirit(state, candidate, 0).legal, candidate.id).toBe(true);
    }
    expect(findLegalSlots(state.timeline, C)).toEqual([0]);
  });

  it('permits in-order placements on either side of the timeline', () => {
    const state = stateWithTimeline([entry(A), entry(C)]);
    // B (1200) belongs between A and C.
    expect(canPlaceSpirit(state, B).legal).toBe(true);
    expect(canPlaceSpirit(state, B, 1).legal).toBe(true);
    expect(findLegalSlots(state.timeline, B)).toEqual([1]);
    // A later spirit appends at the end.
    expect(canPlaceSpirit(state, E, 2).legal).toBe(true);
  });

  it('rejects out-of-order placements with a structured reason', () => {
    const state = stateWithTimeline([entry(A), entry(C)]);
    // B before A breaks order.
    const before = canPlaceSpirit(state, B, 0);
    expect(before.legal).toBe(false);
    if (!before.legal) {
      expect(before.reason).toMatch(/order/i);
    }
    // B after C breaks order.
    expect(canPlaceSpirit(state, B, 2).legal).toBe(false);
    // D (1400) cannot precede C.
    expect(canPlaceSpirit(state, D, 1).legal).toBe(false);
  });

  it('handles the earliest and latest boundary slots', () => {
    const state = stateWithTimeline([entry(B), entry(D)]);
    // Earliest spirit may take slot 0 but not slot 1.
    expect(canPlaceSpirit(state, A, 0).legal).toBe(true);
    expect(canPlaceSpirit(state, A, 1).legal).toBe(false);
    // Latest spirit may append but not lead.
    expect(canPlaceSpirit(state, E, 2).legal).toBe(true);
    expect(canPlaceSpirit(state, E, 0).legal).toBe(false);
  });

  it('rejects a spirit already on the timeline', () => {
    const state = stateWithTimeline([entry(A)]);
    const result = canPlaceSpirit(state, A, 1);
    expect(result.legal).toBe(false);
    if (!result.legal) {
      expect(result.reason).toMatch(/already/);
    }
  });

  it('rejects any slot out of range', () => {
    const state = stateWithTimeline([entry(A)]);
    expect(canPlaceSpirit(state, B, -1).legal).toBe(false);
    expect(canPlaceSpirit(state, B, 2).legal).toBe(false);
  });

  it('detects an unordered timeline as a defensive guard', () => {
    const unordered = [entry(C), entry(A)];
    expect(isTimelineOrdered(unordered)).toBe(false);
    expect(findLegalSlots(unordered, B)).toEqual([]);
    const state = stateWithTimeline(unordered);
    expect(canPlaceSpirit(state, B).legal).toBe(false);
  });

  it('validates placement from hand and resolves spirit ids', () => {
    const inHand = placingState({ hand: ['a'], activeSpiritId: 'a' });
    expect(canPlaceFromHand(inHand, 'a', undefined, ROSTER).legal).toBe(true);
    expect(canPlaceFromHand(inHand, A, undefined, ROSTER).legal).toBe(true);

    const notInHand = placingState({ hand: [], activeSpiritId: null });
    expect(canPlaceFromHand(notInHand, 'a', undefined, ROSTER).legal).toBe(false);
    expect(canPlaceFromHand(notInHand, 'unknown', undefined, ROSTER).legal).toBe(false);
    if (!canPlaceFromHand(notInHand, 'unknown', undefined, ROSTER).legal) {
      expect(canPlaceFromHand(notInHand, 'unknown', undefined, ROSTER)).toMatchObject({
        reason: expect.stringMatching(/Unknown/),
      });
    }
  });
});

// ── AC3: scoring ────────────────────────────────────────────

describe('TheRisingRules — scoring (AC3)', () => {
  it('awards base Insight for a placement with no era completion', () => {
    const state = stateWithTimeline([entry(A)]);
    const score = scorePlacement(state, B, ROSTER);
    expect(score.base).toBe(BASE_PLACEMENT_INSIGHT);
    expect(score.eraBonus).toBe(0);
    expect(score.total).toBe(BASE_PLACEMENT_INSIGHT);
    expect(score.completedEraId).toBeNull();
  });

  it('awards an era bonus when the placement completes an era sub-sequence', () => {
    const state = stateWithTimeline([entry(A), entry(B)]);
    const score = scorePlacement(state, C, ROSTER);
    expect(score.eraBonus).toBe(ERA_COMPLETION_BONUS);
    expect(score.completedEraId).toBe('era-1');
    expect(score.total).toBe(BASE_PLACEMENT_INSIGHT + ERA_COMPLETION_BONUS);
  });

  it('is deterministic: same state + same placement → same score change', () => {
    const state = stateWithTimeline([entry(A), entry(B)]);
    const first = scorePlacement(state, C, ROSTER);
    const second = scorePlacement(state, C, ROSTER);
    expect(second).toEqual(first);
  });
});

// ── Placement application ───────────────────────────────────

describe('TheRisingRules — applyPlacement', () => {
  it('commits a legal placement, awards Insight and moves to resolved', () => {
    const state = placingState({ hand: ['a'], activeSpiritId: 'a' });
    const { state: next, result, score, placement } = applyPlacement(state, A, undefined, ROSTER);
    expect(result.legal).toBe(true);
    expect(score?.total).toBe(BASE_PLACEMENT_INSIGHT);
    expect(placement?.year).toBe(1100);
    expect(next.phase).toBe('resolved');
    expect(next.timeline.map((placed) => placed.spiritId)).toEqual(['a']);
    expect(next.placedSpiritIds).toEqual(['a']);
    expect(next.hand).toEqual([]);
    expect(next.insight).toBe(BASE_PLACEMENT_INSIGHT);
  });

  it('inserts at the canonical chronological slot when none is supplied', () => {
    const state: RisingState = {
      ...placingState({ hand: ['b'], activeSpiritId: 'b' }),
      timeline: [entry(A), entry(C)],
      placedSpiritIds: ['a', 'c'],
    };
    const { state: next, placement } = applyPlacement(state, B, undefined, ROSTER);
    expect(placement?.slotIndex).toBe(1);
    expect(next.timeline.map((placed) => placed.spiritId)).toEqual(['a', 'b', 'c']);
  });

  it('leaves the state untouched on an illegal placement', () => {
    const state = placingState({ hand: ['b'], activeSpiritId: 'b' });
    const { state: next, result, score, placement } = applyPlacement(state, B, 5, ROSTER);
    expect(result.legal).toBe(false);
    expect(score).toBeNull();
    expect(placement).toBeNull();
    expect(next).toBe(state);
  });

  it('awards the era bonus through a full sub-sequence', () => {
    let state = placingState({ hand: ['a'], activeSpiritId: 'a' });
    state = applyPlacement(state, A, undefined, ROSTER).state;
    const afterB = applyPlacement(
      { ...state, phase: 'placing', hand: ['b'], activeSpiritId: 'b' },
      B,
      undefined,
      ROSTER,
    );
    expect(afterB.score?.eraBonus).toBe(0);
    const afterC = applyPlacement(
      { ...afterB.state, phase: 'placing', hand: ['c'], activeSpiritId: 'c' },
      C,
      undefined,
      ROSTER,
    );
    expect(afterC.score?.eraBonus).toBe(ERA_COMPLETION_BONUS);
    expect(afterC.state.insight).toBe(BASE_PLACEMENT_INSIGHT * 3 + ERA_COMPLETION_BONUS);
  });
});

// ── AC4: win / loss ─────────────────────────────────────────

describe('TheRisingRules — win/loss (AC4)', () => {
  const fullTimeline = [entry(A), entry(B), entry(C), entry(D), entry(E)];

  it('wins when the full timeline is placed and Insight meets the target', () => {
    const win = stateWithTimeline(fullTimeline, { insight: 6 });
    expect(isTimelineComplete(win)).toBe(true);
    expect(isWin(win)).toBe(true);
    expect(isLoss(win)).toBe(false);
    expect(evaluateOutcome(win)).toMatchObject({ outcome: 'won', reason: 'timeline-complete' });
  });

  it('does not win one point below the target', () => {
    const almost = stateWithTimeline(fullTimeline, { insight: 5 });
    expect(isWin(almost)).toBe(false);
    expect(evaluateOutcome(almost).outcome).toBe('in-progress');
  });

  it('loses when Memory is depleted with spirits unplaced', () => {
    const loss = stateWithTimeline([entry(A)], { memory: 0 });
    expect(isTimelineComplete(loss)).toBe(false);
    expect(isLoss(loss)).toBe(true);
    expect(evaluateOutcome(loss)).toMatchObject({ outcome: 'lost', reason: 'memory-depleted' });
  });

  it('loses when the Rising clock reaches 1916 with an incomplete timeline', () => {
    const loss = stateWithTimeline([entry(A)], { clock: RISING_FINAL_YEAR });
    expect(isLoss(loss)).toBe(true);
    expect(evaluateOutcome(loss)).toMatchObject({ outcome: 'lost', reason: 'clock-expired' });
  });

  it('prioritises the win over a simultaneous clock expiry', () => {
    const win = stateWithTimeline(fullTimeline, { insight: 6, clock: RISING_FINAL_YEAR });
    expect(evaluateOutcome(win).outcome).toBe('won');
  });

  it('reports in-progress while the timeline is incomplete and resources remain', () => {
    const state = stateWithTimeline([entry(A)], { memory: 3, clock: 1500 });
    expect(evaluateOutcome(state)).toMatchObject({ outcome: 'in-progress', reason: null });
  });

  it('treats an unordered timeline as incomplete', () => {
    const unordered = stateWithTimeline([entry(C), entry(A)], { insight: 99 });
    expect(isTimelineComplete(unordered)).toBe(false);
    expect(isWin(unordered)).toBe(false);
  });
});
