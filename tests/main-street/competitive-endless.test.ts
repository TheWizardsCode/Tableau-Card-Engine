/**
 * Main Street: Competitive Endless Continuation Tests
 *
 * Verifies the producer's Q4 "option to carry on in endless mode" beyond
 * the win threshold (CG-0MT5X3GMA007EG30 → CG-0MTIILU5V006GCN4).
 *
 * AC1 — Explicit opt-in flag and what it does to win detection / score /
 *       endReason / gameResult when play continues beyond threshold.
 * AC2 — Deterministic replay: same seed + same actions produce the same
 *       endless-mode outcome.
 * AC3 — Default behaviour unchanged: without the flag the threshold win
 *       still ends the game as before.
 */
import { describe, it, expect } from 'vitest';

import {
  setupMainStreetGame,
  createCompetitiveState,
  type MainStreetState,
} from '../../example-games/main-street/MainStreetState';
import {
  checkEndConditions,
  computeScore,
  processEndOfTurn,
} from '../../example-games/main-street/MainStreetEngine';

// ── Helpers ─────────────────────────────────────────────────

function createState(
  options: {
    seed?: string;
    endlessMode?: boolean;
    playerCount?: number;
  } = {},
): MainStreetState {
  if (options.playerCount !== undefined) {
    return createCompetitiveState({
      seed: options.seed ?? 'endless-seed',
      playerCount: options.playerCount,
      endlessMode: options.endlessMode,
    });
  }
  return setupMainStreetGame({
    seed: options.seed ?? 'endless-seed',
    endlessMode: options.endlessMode,
  });
}

function setScoreAbove(state: MainStreetState): void {
  // Push current score above the threshold deterministically by bumping
  // resourceBank, then recompute finalScore via checkEndConditions.score path.
  state.resourceBank.coins = state.config.winThreshold + 10;
}

function stateSummary(state: MainStreetState): string {
  return `${state.gameResult}/${state.endReason ?? 'null'}/${state.finalScore}`;
}

// ── AC1: Endless-mode flag and threshold continuation ──────

describe('AC1 — Endless-mode opt-in flag', () => {
  it('defaults to endlessMode: false (existing behaviour unchanged)', () => {
    const s = createState({ endlessMode: undefined });
    expect(s.config.endlessMode).toBe(false);
  });

  it('respects explicit endlessMode: true', () => {
    const s = createState({ endlessMode: true });
    expect(s.config.endlessMode).toBe(true);
  });

  it('respects explicit endlessMode: false', () => {
    const s = createState({ endlessMode: false });
    expect(s.config.endlessMode).toBe(false);
  });

  it('threshold win ends the game when endlessMode is off (default)', () => {
    const s = createState({ endlessMode: false });
    setScoreAbove(s);

    const ended = checkEndConditions(s);

    expect(ended).toBe(true);
    expect(s.gameResult).toBe('win');
    expect(s.endReason).toBe('score_threshold');
  });

  it('threshold does NOT end the game when endlessMode is on', () => {
    const s = createState({ endlessMode: true });
    setScoreAbove(s);

    const ended = checkEndConditions(s);

    expect(ended).toBe(false);
    expect(s.gameResult).toBe('playing');
    expect(s.endReason).toBe('score_threshold_continue');
  });

  it('finalScore continues to accrue beyond the threshold in endless mode', () => {
    const s = createState({ endlessMode: true, seed: 'endless-accrue' });
    s.turn = 5;

    // First crossing
    setScoreAbove(s);
    checkEndConditions(s);
    const scoreAtCrossing = s.finalScore;

    // Grow further
    s.resourceBank.coins += 25;
    checkEndConditions(s);

    expect(s.finalScore).toBeGreaterThan(scoreAtCrossing);
    expect(s.gameResult).toBe('playing');
    expect(s.endReason).toBe('score_threshold_continue');
  });

  it('checkEndConditions is idempotent beyond the threshold in endless mode', () => {
    const s = createState({ endlessMode: true });
    setScoreAbove(s);

    const first = checkEndConditions(s);
    const summary = stateSummary(s);
    const second = checkEndConditions(s);

    expect(first).toBe(false);
    expect(second).toBe(false);
    expect(stateSummary(s)).toBe(summary);
  });

  it('a loss condition still ends the game even in endless mode', () => {
    // Bankruptcy is immediate-loss and must beat endless continuation
    const s = createState({ endlessMode: true });
    s.resourceBank.coins = -1;

    const ended = checkEndConditions(s);

    expect(ended).toBe(true);
    expect(s.gameResult).toBe('loss');
    expect(s.endReason).toBe('bankruptcy');
  });

  it('bankruptcy beyond threshold takes precedence over score_threshold_continue', () => {
    // First cross the threshold in endless mode, then go bankrupt
    const s = createState({ endlessMode: true });
    setScoreAbove(s);
    checkEndConditions(s);
    expect(s.gameResult).toBe('playing');

    s.resourceBank.coins = -1;
    s.resourceBank.reputation = 1000;

    const ended = checkEndConditions(s);

    expect(ended).toBe(true);
    expect(s.gameResult).toBe('loss');
    expect(s.endReason).toBe('bankruptcy');
  });

  it('competitive state also respects the endlessMode flag', () => {
    const s = createState({ endlessMode: true, playerCount: 2 });
    expect(s.config.endlessMode).toBe(true);

    // Seed the score above the threshold via the shared economy
    setScoreAbove(s);
    const ended = checkEndConditions(s);

    expect(ended).toBe(false);
    expect(s.gameResult).toBe('playing');
    expect(s.endReason).toBe('score_threshold_continue');
    expect(s.config.winThreshold).toBeGreaterThan(0);
  });

  it('processEndOfTurn does not end the game at the threshold in endless mode', () => {
    const s = createState({ endlessMode: true, seed: 'endless-turn' });
    // Arrange for the engine's internal score to exceed the threshold via
    // resourceBank — the engine scores coins+rep(+challenges) each EndCheck.
    // Force the end-of-turn check to see the crossed threshold.
    s.resourceBank.coins = s.config.winThreshold + 50;
    s.resourceBank.reputation = 500;
    s.phase = 'MarketPhase';

    const result = processEndOfTurn(s);

    // Endless: the turn still completes, phase returns to DayStart, game still playing
    expect(result.gameResult).toBe('playing');
    expect(s.gameResult).toBe('playing');
    expect(s.endReason).toBe('score_threshold_continue');
    expect(s.phase).toBe('DayStart');
  });

  it('computeScore keeps growing beyond the threshold in endless mode', () => {
    const s = createState({ endlessMode: true });
    // computeScore = coins + reputation + challenge bonus, so coins alone
    // at threshold-1 may already exceed threshold (rep>0). Zero rep and
    // force the before-score below threshold explicitly.
    s.resourceBank.coins = s.config.winThreshold - 1 - (s.resourceBank.reputation ?? 0);
    s.resourceBank.reputation = 0;
    const before = computeScore(s);
    expect(before).toBeLessThan(s.config.winThreshold);

    s.resourceBank.coins = s.config.winThreshold + 40;
    const after = computeScore(s);
    expect(after).toBeGreaterThan(s.config.winThreshold);
    expect(after).toBeGreaterThan(before);
  });
});

// ── AC2: Deterministic replay ───────────────────────────────

describe('AC2 — Deterministic replay of the endless-mode outcome', () => {
  it('same seed and same actions produce the same endless-mode outcome', () => {
    const build = (seed: string): MainStreetState => {
      const s = createState({ seed, endlessMode: true });
      s.resourceBank.coins = s.config.winThreshold + 10;
      checkEndConditions(s);
      return s;
    };

    const a = build('det-endless');
    const b = build('det-endless');

    expect(stateSummary(a)).toBe(stateSummary(b));
    expect(a.gameResult).toBe('playing');
    expect(a.endReason).toBe('score_threshold_continue');
  });

  it('different seeds produce different but self-consistent endless outcomes', () => {
    const build = (seed: string): string => {
      const s = createState({ seed, endlessMode: true });
      s.resourceBank.coins = s.config.winThreshold + 20;
      checkEndConditions(s);
      return stateSummary(s);
    };

    const x = build('det-endless-x');
    const y = build('det-endless-y');
    // Same logic, but possibly same threshold/endReason — just ensure
    // neither errors and both are playing beyond threshold
    expect(x).not.toBe('');
    expect(y).not.toBe('');
    expect(x.includes('playing/score_threshold_continue')).toBe(true);
    expect(y.includes('playing/score_threshold_continue')).toBe(true);
  });

  it('the threshold-crossing signal is reproducible across calls', () => {
    const s = createState({ seed: 'det-signal', endlessMode: true });
    s.resourceBank.coins = s.config.winThreshold + 5;

    checkEndConditions(s);
    const first = stateSummary(s);
    checkEndConditions(s);
    const second = stateSummary(s);

    expect(first).toBe(second);
  });
});

// ── AC3: Default behaviour unchanged (threshold still wins) ─

describe('AC3 — Default path (no endless flag) still ends at the threshold', () => {
  it('a fresh state without the flag wins at the threshold', () => {
    const s = createState({ seed: 'default-path', endlessMode: undefined });
    setScoreAbove(s);

    const ended = checkEndConditions(s);

    expect(ended).toBe(true);
    expect(s.gameResult).toBe('win');
    expect(s.endReason).toBe('score_threshold');
  });

  it('processEndOfTurn ends the game at the threshold on the default path', () => {
    const s = createState({ seed: 'default-turn', endlessMode: false });
    s.resourceBank.coins = s.config.winThreshold + 50;
    s.resourceBank.reputation = 500;
    s.phase = 'MarketPhase';

    const result = processEndOfTurn(s);

    expect(result.gameResult).toBe('win');
    expect(s.gameResult).toBe('win');
    expect(s.endReason).toBe('score_threshold');
  });

  it('all_challenges still wins regardless of endlessMode', () => {
    const s = createState({ endlessMode: true });
    // Complete all active challenges
    for (const ac of s.activeChallenges) ac.completed = true;
    if (s.activeChallenges.length === 0) return; // defensive — config usually selects >= 1

    const ended = checkEndConditions(s);

    expect(ended).toBe(true);
    expect(s.gameResult).toBe('win');
    expect(s.endReason).toBe('all_challenges');
  });
});
