/**
 * Core Engine: ChallengeSystem Generic API Tests
 *
 * Tests for the generic selectChallenges and evaluateChallenges functions
 * using a mock game state type (no dependency on any example game).
 */
import { describe, it, expect, vi } from 'vitest';

import {
  selectChallenges,
  evaluateChallenges,
  type ChallengeDefinition,
  type ActiveChallengeRecord,
  type ChallengeCompletionCallback,
} from '../../src/core-engine/ChallengeSystem';

// ── Mock Types ──────────────────────────────────────────────

/** Minimal game state for testing. */
interface MockState {
  score: number;
  itemCount: number;
}

// ── Test Fixtures ───────────────────────────────────────────

function makeChallenge(
  id: string,
  evaluator: (s: MockState) => boolean,
  rewardPoints = 10,
): ChallengeDefinition<MockState> {
  return {
    id,
    title: `Challenge ${id}`,
    description: `Description for ${id}`,
    category: 'test',
    evaluator,
    rewardPoints,
  };
}

function makeActive(
  challenge: ChallengeDefinition<MockState>,
  completed = false,
): ActiveChallengeRecord<MockState> {
  return { challenge, completed };
}

/** Deterministic counter-based RNG for testing. */
function makeCounterRng(): () => number {
  let i = 0;
  return () => {
    // Produces 0.0, 0.1, 0.2, ... 0.9, 0.0, 0.1, ...
    const val = (i % 10) / 10;
    i++;
    return val;
  };
}

/** Fixed-value RNG (always returns the same value). */
function makeFixedRng(value: number): () => number {
  return () => value;
}

// ── selectChallenges ────────────────────────────────────────

describe('selectChallenges (generic)', () => {
  const templates: ChallengeDefinition<MockState>[] = [
    makeChallenge('a', () => false),
    makeChallenge('b', () => false),
    makeChallenge('c', () => false),
    makeChallenge('d', () => false),
    makeChallenge('e', () => false),
  ];

  it('selects the requested number of challenges', () => {
    const result = selectChallenges(templates, 3, makeCounterRng());
    expect(result).toHaveLength(3);
  });

  it('returns all templates when count exceeds pool size', () => {
    const result = selectChallenges(templates, 10, makeCounterRng());
    expect(result).toHaveLength(templates.length);
  });

  it('returns empty array when count is 0', () => {
    const result = selectChallenges(templates, 0, makeCounterRng());
    expect(result).toHaveLength(0);
  });

  it('returns empty array when count is negative', () => {
    const result = selectChallenges(templates, -5, makeCounterRng());
    expect(result).toHaveLength(0);
  });

  it('handles empty template pool', () => {
    const result = selectChallenges([], 3, makeCounterRng());
    expect(result).toHaveLength(0);
  });

  it('returns challenge definitions from the original pool (no fabrication)', () => {
    const result = selectChallenges(templates, 3, makeCounterRng());
    for (const ch of result) {
      expect(templates).toContain(ch);
    }
  });

  it('returns unique challenges (no duplicates)', () => {
    const result = selectChallenges(templates, 4, makeCounterRng());
    const ids = result.map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('does not mutate the original templates array', () => {
    const original = [...templates];
    selectChallenges(templates, 3, makeCounterRng());
    expect(templates).toEqual(original);
  });

  it('produces deterministic results for the same RNG sequence', () => {
    const result1 = selectChallenges(templates, 3, makeFixedRng(0.5));
    const result2 = selectChallenges(templates, 3, makeFixedRng(0.5));
    expect(result1.map(c => c.id)).toEqual(result2.map(c => c.id));
  });

  it('produces different results for different RNG sequences', () => {
    const result1 = selectChallenges(templates, 3, makeFixedRng(0.1));
    const result2 = selectChallenges(templates, 3, makeFixedRng(0.9));
    // With only 5 templates and 3 selected, different RNG values should
    // (in most cases) produce different orderings. We check IDs differ.
    const ids1 = result1.map(c => c.id);
    const ids2 = result2.map(c => c.id);
    // They select from the same pool, so they're permutations.
    // At minimum the order should differ.
    expect(ids1.join(',') !== ids2.join(',') || ids1.length === templates.length).toBe(true);
  });

  it('handles single-element pool', () => {
    const single = [makeChallenge('solo', () => true)];
    const result = selectChallenges(single, 1, makeCounterRng());
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('solo');
  });
});

// ── evaluateChallenges ──────────────────────────────────────

describe('evaluateChallenges (generic)', () => {
  it('marks challenges as completed when evaluator returns true', () => {
    const state: MockState = { score: 100, itemCount: 5 };
    const ch = makeChallenge('high-score', s => s.score >= 50);
    const active = [makeActive(ch)];

    const newlyCompleted = evaluateChallenges(active, state);

    expect(newlyCompleted).toEqual(['high-score']);
    expect(active[0].completed).toBe(true);
  });

  it('does not mark challenges when evaluator returns false', () => {
    const state: MockState = { score: 10, itemCount: 1 };
    const ch = makeChallenge('high-score', s => s.score >= 50);
    const active = [makeActive(ch)];

    const newlyCompleted = evaluateChallenges(active, state);

    expect(newlyCompleted).toEqual([]);
    expect(active[0].completed).toBe(false);
  });

  it('skips already-completed challenges', () => {
    const state: MockState = { score: 100, itemCount: 5 };
    const ch = makeChallenge('high-score', s => s.score >= 50);
    const active = [makeActive(ch, true)]; // already completed

    const newlyCompleted = evaluateChallenges(active, state);

    expect(newlyCompleted).toEqual([]);
    // Should still be completed (no revocation)
    expect(active[0].completed).toBe(true);
  });

  it('evaluates multiple challenges independently', () => {
    const state: MockState = { score: 60, itemCount: 3 };
    const ch1 = makeChallenge('high-score', s => s.score >= 50);
    const ch2 = makeChallenge('many-items', s => s.itemCount >= 5);
    const ch3 = makeChallenge('any-items', s => s.itemCount >= 1);
    const active = [makeActive(ch1), makeActive(ch2), makeActive(ch3)];

    const newlyCompleted = evaluateChallenges(active, state);

    expect(newlyCompleted).toEqual(['high-score', 'any-items']);
    expect(active[0].completed).toBe(true);
    expect(active[1].completed).toBe(false);
    expect(active[2].completed).toBe(true);
  });

  it('invokes onComplete callback for each newly completed challenge', () => {
    const state: MockState = { score: 100, itemCount: 10 };
    const ch1 = makeChallenge('a', s => s.score >= 50, 15);
    const ch2 = makeChallenge('b', s => s.itemCount >= 5, 20);
    const active = [makeActive(ch1), makeActive(ch2)];

    const callback = vi.fn<ChallengeCompletionCallback<MockState>>();
    evaluateChallenges(active, state, callback);

    expect(callback).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenCalledWith(ch1, state);
    expect(callback).toHaveBeenCalledWith(ch2, state);
  });

  it('does not invoke onComplete for already-completed challenges', () => {
    const state: MockState = { score: 100, itemCount: 10 };
    const ch = makeChallenge('a', s => s.score >= 50);
    const active = [makeActive(ch, true)];

    const callback = vi.fn<ChallengeCompletionCallback<MockState>>();
    evaluateChallenges(active, state, callback);

    expect(callback).not.toHaveBeenCalled();
  });

  it('does not invoke onComplete when evaluator returns false', () => {
    const state: MockState = { score: 10, itemCount: 1 };
    const ch = makeChallenge('a', s => s.score >= 50);
    const active = [makeActive(ch)];

    const callback = vi.fn<ChallengeCompletionCallback<MockState>>();
    evaluateChallenges(active, state, callback);

    expect(callback).not.toHaveBeenCalled();
  });

  it('works with no onComplete callback provided', () => {
    const state: MockState = { score: 100, itemCount: 5 };
    const ch = makeChallenge('a', s => s.score >= 50);
    const active = [makeActive(ch)];

    // Should not throw
    const newlyCompleted = evaluateChallenges(active, state);
    expect(newlyCompleted).toEqual(['a']);
    expect(active[0].completed).toBe(true);
  });

  it('returns empty array when active challenges list is empty', () => {
    const state: MockState = { score: 100, itemCount: 5 };
    const newlyCompleted = evaluateChallenges([], state);
    expect(newlyCompleted).toEqual([]);
  });

  it('handles mixed completed and uncompleted challenges', () => {
    const state: MockState = { score: 100, itemCount: 10 };
    const ch1 = makeChallenge('a', s => s.score >= 50);
    const ch2 = makeChallenge('b', s => s.itemCount >= 5);
    const ch3 = makeChallenge('c', s => s.score >= 200); // won't pass
    const active = [
      makeActive(ch1, true),  // already completed
      makeActive(ch2, false), // will complete
      makeActive(ch3, false), // won't complete
    ];

    const newlyCompleted = evaluateChallenges(active, state);

    expect(newlyCompleted).toEqual(['b']);
    expect(active[0].completed).toBe(true);
    expect(active[1].completed).toBe(true);
    expect(active[2].completed).toBe(false);
  });

  it('completion is permanent (re-evaluation does not revoke)', () => {
    // First evaluation: challenge completes
    const state1: MockState = { score: 100, itemCount: 5 };
    const ch = makeChallenge('a', s => s.score >= 50);
    const active = [makeActive(ch)];
    evaluateChallenges(active, state1);
    expect(active[0].completed).toBe(true);

    // Second evaluation: state no longer meets condition, but stays completed
    const state2: MockState = { score: 10, itemCount: 1 };
    const newlyCompleted = evaluateChallenges(active, state2);
    expect(newlyCompleted).toEqual([]);
    expect(active[0].completed).toBe(true);
  });
});

// ── Module Isolation (US-22) ────────────────────────────────

describe('ChallengeSystem module isolation', () => {
  it('ChallengeSystem.ts has no example-games imports (US-22 AC#4)', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync('src/core-engine/ChallengeSystem.ts', 'utf-8');
    expect(source).not.toMatch(/example-games/);
  });

  it('ChallengeSystem.ts contains M6 extraction design notes (US-22 AC#5)', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync('src/core-engine/ChallengeSystem.ts', 'utf-8');
    expect(source).toMatch(/Design Notes.*M6|M6.*Design Notes|M6 Extraction/i);
  });
});
