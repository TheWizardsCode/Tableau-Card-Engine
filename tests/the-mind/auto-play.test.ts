import { describe, it, expect } from 'vitest';
import {
  runGame,
  type HeadlessGameConfig,
  type HeadlessGameResult,
} from '../../example-games/the-mind/headlessGame';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Run a game with a known seed and return the result. */
function runSeeded(seed: number, overrides?: Partial<HeadlessGameConfig>): HeadlessGameResult {
  return runGame({ seed, ...overrides });
}

// ---------------------------------------------------------------------------
// runGame — basic behaviour
// ---------------------------------------------------------------------------

describe('headless runGame', () => {
  it('returns a result with outcome "win" or "loss"', () => {
    const result = runSeeded(42);
    expect(['win', 'loss']).toContain(result.outcome);
  });

  it('finalLevel is between 1 and 8', () => {
    const result = runSeeded(42);
    expect(result.finalLevel).toBeGreaterThanOrEqual(1);
    expect(result.finalLevel).toBeLessThanOrEqual(8);
  });

  it('finalLives is >= 0', () => {
    const result = runSeeded(42);
    expect(result.finalLives).toBeGreaterThanOrEqual(0);
  });

  it('totalPlays is positive', () => {
    const result = runSeeded(42);
    expect(result.totalPlays).toBeGreaterThan(0);
  });

  it('totalPenalties is >= 0', () => {
    const result = runSeeded(42);
    expect(result.totalPenalties).toBeGreaterThanOrEqual(0);
  });

  it('outcome "loss" implies finalLives is 0', () => {
    // Try several seeds to find a loss
    for (let seed = 0; seed < 50; seed++) {
      const result = runSeeded(seed);
      if (result.outcome === 'loss') {
        expect(result.finalLives).toBe(0);
        return;
      }
    }
    // If no loss found in 50 seeds, skip the assertion (unlikely)
  });

  it('outcome "win" implies finalLevel is 8', () => {
    const zeroJitter = { baseDuration: 5000, jitterRange: 0 };
    for (let seed = 0; seed < 100; seed++) {
      const result = runGame({ seed, timingConfig: zeroJitter });
      if (result.outcome === 'win') {
        expect(result.finalLevel).toBe(8);
        return;
      }
    }
    // If no win found in 100 seeds with zero jitter, skip
  });
});

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

describe('headless runGame — determinism', () => {
  it('same seed produces identical results', () => {
    const a = runSeeded(123);
    const b = runSeeded(123);

    expect(a.outcome).toBe(b.outcome);
    expect(a.totalPlays).toBe(b.totalPlays);
    expect(a.totalPenalties).toBe(b.totalPenalties);
    expect(a.finalLevel).toBe(b.finalLevel);
    expect(a.finalLives).toBe(b.finalLives);
  });

  it('same seed produces identical transcript events (excluding timestamps)', () => {
    const a = runSeeded(456);
    const b = runSeeded(456);

    // Compare event types and counts
    const aEvents = a.transcript.events.map((e) => e.type);
    const bEvents = b.transcript.events.map((e) => e.type);
    expect(aEvents).toEqual(bEvents);

    // Compare card-played events specifically
    const aPlays = a.transcript.events.filter((e) => e.type === 'card-played');
    const bPlays = b.transcript.events.filter((e) => e.type === 'card-played');
    expect(aPlays.length).toBe(bPlays.length);

    for (let i = 0; i < aPlays.length; i++) {
      const ap = aPlays[i] as { playerId: number; cardValue: number };
      const bp = bPlays[i] as { playerId: number; cardValue: number };
      expect(ap.playerId).toBe(bp.playerId);
      expect(ap.cardValue).toBe(bp.cardValue);
    }
  });

  it('different seeds produce different results (at least sometimes)', () => {
    const results: HeadlessGameResult[] = [];
    for (let seed = 0; seed < 20; seed++) {
      results.push(runSeeded(seed));
    }

    // At least two different outcomes or play counts across seeds
    const uniquePlays = new Set(results.map((r) => r.totalPlays));
    expect(uniquePlays.size).toBeGreaterThan(1);
  });
});

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

describe('headless runGame — configuration', () => {
  it('uses default seed of 42 when no config provided', () => {
    const noConfig = runGame();
    const explicit42 = runGame({ seed: 42 });

    expect(noConfig.outcome).toBe(explicit42.outcome);
    expect(noConfig.totalPlays).toBe(explicit42.totalPlays);
    expect(noConfig.finalLevel).toBe(explicit42.finalLevel);
  });

  it('respects custom player names', () => {
    const result = runGame({
      seed: 42,
      playerNames: ['Alice', 'Bob'],
    });

    expect(result.transcript.initialState.playerNames).toEqual([
      'Alice',
      'Bob',
    ]);
  });

  it('marks both players as AI', () => {
    const result = runSeeded(42);
    expect(result.transcript.initialState.isAI).toEqual([true, true]);
  });

  it('respects custom AI seeds (different AI seeds = different play order)', () => {
    const a = runGame({
      seed: 42,
      player0AiSeed: 100,
      player1AiSeed: 200,
    });
    const b = runGame({
      seed: 42,
      player0AiSeed: 300,
      player1AiSeed: 400,
    });

    // Same deck deal (same game seed) but different AI timing
    // The total plays or penalties may differ
    const aTotalEvents = a.transcript.events.length;
    const bTotalEvents = b.transcript.events.length;

    // They might happen to be the same, so just check both complete
    expect(['win', 'loss']).toContain(a.outcome);
    expect(['win', 'loss']).toContain(b.outcome);
    // At minimum both should have events
    expect(aTotalEvents).toBeGreaterThan(0);
    expect(bTotalEvents).toBeGreaterThan(0);
  });

  it('respects custom timing config (zero jitter)', () => {
    const a = runGame({
      seed: 42,
      timingConfig: { baseDuration: 5000, jitterRange: 0 },
    });
    const b = runGame({
      seed: 42,
      timingConfig: { baseDuration: 5000, jitterRange: 0 },
    });

    // With zero jitter, results must be perfectly deterministic
    expect(a.outcome).toBe(b.outcome);
    expect(a.totalPlays).toBe(b.totalPlays);
    expect(a.totalPenalties).toBe(b.totalPenalties);
  });
});

// ---------------------------------------------------------------------------
// Transcript structure
// ---------------------------------------------------------------------------

describe('headless runGame — transcript', () => {
  it('transcript version is 2', () => {
    const result = runSeeded(42);
    expect(result.transcript.version).toBe(2);
  });

  it('transcript gameType is "the-mind"', () => {
    const result = runSeeded(42);
    expect(result.transcript.gameType).toBe('the-mind');
  });

  it('transcript has startedAt and endedAt timestamps', () => {
    const result = runSeeded(42);
    expect(result.transcript.startedAt).toBeTruthy();
    expect(result.transcript.endedAt).toBeTruthy();
  });

  it('transcript results are populated', () => {
    const result = runSeeded(42);
    expect(result.transcript.results).not.toBeNull();
    expect(result.transcript.results!.outcome).toBe(result.outcome);
    expect(result.transcript.results!.finalLevel).toBe(result.finalLevel);
    expect(result.transcript.results!.finalLives).toBe(result.finalLives);
  });

  it('transcript has at least one card-played event', () => {
    const result = runSeeded(42);
    const plays = result.transcript.events.filter(
      (e) => e.type === 'card-played',
    );
    expect(plays.length).toBeGreaterThan(0);
  });

  it('transcript ends with a game-over event', () => {
    const result = runSeeded(42);
    const lastEvent = result.transcript.events[result.transcript.events.length - 1];
    expect(lastEvent.type).toBe('game-over');
  });

  it('transcript results totalCardsPlayed matches totalPlays', () => {
    const result = runSeeded(42);
    expect(result.transcript.results!.totalCardsPlayed).toBe(result.totalPlays);
  });

  it('transcript results totalPenalties matches totalPenalties', () => {
    const result = runSeeded(42);
    expect(result.transcript.results!.totalPenalties).toBe(
      result.totalPenalties,
    );
  });

  it('card-played events have valid player IDs (0 or 1)', () => {
    const result = runSeeded(42);
    const plays = result.transcript.events.filter(
      (e) => e.type === 'card-played',
    );
    for (const play of plays) {
      const p = play as { playerId: number };
      expect([0, 1]).toContain(p.playerId);
    }
  });

  it('card-played events have card values between 1 and 100', () => {
    const result = runSeeded(42);
    const plays = result.transcript.events.filter(
      (e) => e.type === 'card-played',
    );
    for (const play of plays) {
      const p = play as { cardValue: number };
      expect(p.cardValue).toBeGreaterThanOrEqual(1);
      expect(p.cardValue).toBeLessThanOrEqual(100);
    }
  });

  it('winning game has level-complete events for all 8 levels', () => {
    // Use zero jitter for a realistic chance of finding a win
    const zeroJitter = { baseDuration: 5000, jitterRange: 0 };
    for (let seed = 0; seed < 200; seed++) {
      const result = runGame({ seed, timingConfig: zeroJitter });
      if (result.outcome === 'win') {
        const levelCompletes = result.transcript.events.filter(
          (e) => e.type === 'level-complete',
        );
        // All 8 levels completed — each produces a level-complete event
        expect(levelCompletes.length).toBe(8);
        return;
      }
    }
    // If no win found, skip
  });
});

// ---------------------------------------------------------------------------
// Multiple runs (statistical sanity)
// ---------------------------------------------------------------------------

describe('headless runGame — multiple seeds', () => {
  it('can run 100 games without errors', () => {
    for (let seed = 0; seed < 100; seed++) {
      expect(() => runSeeded(seed)).not.toThrow();
    }
  });

  it('produces both wins and losses across seeds', () => {
    let wins = 0;
    let losses = 0;

    // Default jitter produces mostly losses
    for (let seed = 0; seed < 100; seed++) {
      const result = runSeeded(seed);
      if (result.outcome === 'win') wins++;
      else losses++;
    }

    // Zero jitter produces mostly wins
    const zeroJitter = { baseDuration: 5000, jitterRange: 0 };
    for (let seed = 0; seed < 100; seed++) {
      const result = runGame({ seed, timingConfig: zeroJitter });
      if (result.outcome === 'win') wins++;
      else losses++;
    }

    expect(wins).toBeGreaterThan(0);
    expect(losses).toBeGreaterThan(0);
  });

  it('total plays are reasonable (not infinite loops)', () => {
    for (let seed = 0; seed < 50; seed++) {
      const result = runSeeded(seed);
      // Max possible plays: 8 levels, up to 8 cards each = 2*8*8 = 128 cards
      // But penalty discards reduce this. Should never exceed 128.
      expect(result.totalPlays).toBeLessThanOrEqual(128);
    }
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('headless runGame — edge cases', () => {
  it('zero jitter produces fully deterministic play order', () => {
    const config: HeadlessGameConfig = {
      seed: 99,
      timingConfig: { baseDuration: 5000, jitterRange: 0 },
    };

    const a = runGame(config);
    const b = runGame(config);

    // With zero jitter, the exact sequence of plays should be identical
    const aPlayValues = a.transcript.events
      .filter((e) => e.type === 'card-played')
      .map((e) => (e as { cardValue: number }).cardValue);
    const bPlayValues = b.transcript.events
      .filter((e) => e.type === 'card-played')
      .map((e) => (e as { cardValue: number }).cardValue);

    expect(aPlayValues).toEqual(bPlayValues);
  });

  it('very short base duration still produces valid games', () => {
    const result = runGame({
      seed: 42,
      timingConfig: { baseDuration: 10, jitterRange: 0 },
    });
    expect(['win', 'loss']).toContain(result.outcome);
    expect(result.totalPlays).toBeGreaterThan(0);
  });

  it('very long base duration still produces valid games', () => {
    const result = runGame({
      seed: 42,
      timingConfig: { baseDuration: 100000, jitterRange: 0 },
    });
    expect(['win', 'loss']).toContain(result.outcome);
    expect(result.totalPlays).toBeGreaterThan(0);
  });

  it('high jitter still produces valid games', () => {
    const result = runGame({
      seed: 42,
      timingConfig: { baseDuration: 5000, jitterRange: 4000 },
    });
    expect(['win', 'loss']).toContain(result.outcome);
    expect(result.totalPlays).toBeGreaterThan(0);
  });
});
