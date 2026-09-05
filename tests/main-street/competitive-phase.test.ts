/**
 * Main Street: Competitive Shared-Day Phase Machine Tests
 *
 * AC1 — Alternating MarketPhases then shared closing (Income/Incident/EndCheck) once.
 * AC2 — First-to-threshold win (lowest player index wins on tie).
 * AC3 — N=1 preserves legacy single-player sequence.
 * AC4 — Phase diagram invariants + active-player tracking.
 */
import { describe, it, expect } from 'vitest';

import {
  createCompetitiveState,
  setupMainStreetGame,
  type MainStreetState,
} from '../../example-games/main-street/MainStreetState';
import {
  getActivePlayerId,
  setActivePlayerId,
  executeCompetitiveDayStart,
  endCompetitiveMarketTurn,
  resolveCompetitiveClosingPhases,
  executeCompetitiveDay,
  checkCompetitiveEndConditions,
  updateCompetitiveScores,
  processEndOfTurn,
  executeDayStart,
} from '../../example-games/main-street/MainStreetEngine';

// ── Helpers ─────────────────────────────────────────────────

function comp(seed = 'phase42', playerCount = 2): MainStreetState {
  return createCompetitiveState({ seed, playerCount });
}

function setScores(state: MainStreetState, scores: number[]): void {
  // score is derived as coins+rep+bonus; we set coins to achieve desired score
  // with rep=startingReputation and bonus=0, then force updateCompetitiveScores to recompute.
  const bonus = state.challengesCompleted.length * state.config.challengeBonusPoints;
  const rep = state.config.startingReputation;
  scores.forEach((desired, i) => {
    const neededCoins = desired - rep - bonus;
    state.players![i].coins = neededCoins;
    state.players![i].reputation = rep;
  });
  updateCompetitiveScores(state);
}

// ── AC1: Alternating MarketPhases then shared closing ───────

describe('AC1 — Shared-day alternation and shared closing', () => {
  it('executeCompetitiveDayStart arms P0 MarketPhase and resets per-player budgets', () => {
    const s = comp('ac1-start', 2);
    // Initially DayStart
    expect(s.phase).toBe('DayStart');
    executeCompetitiveDayStart(s);
    expect(s.phase).toBe('MarketPhase');
    expect(getActivePlayerId(s)).toBe(0);
    expect(s.activePlayerId).toBe(0);
    // Budgets reset to base 1 (no staff)
    for (const p of s.players!) expect(p.actionBudget).toBe(1);
    expect(s.competitiveWinnerId).toBeNull();
  });

  it('endCompetitiveMarketTurn alternates P0 -> P1 staying in MarketPhase', () => {
    const s = comp('ac1-alt-1', 2);
    executeCompetitiveDayStart(s);
    expect(s.phase).toBe('MarketPhase');
    expect(getActivePlayerId(s)).toBe(0);
    endCompetitiveMarketTurn(s);
    expect(s.phase).toBe('MarketPhase');
    expect(getActivePlayerId(s)).toBe(1);
  });

  it('final endCompetitiveMarketTurn transitions to InvestmentResolution', () => {
    const s = comp('ac1-alt-final', 2);
    executeCompetitiveDayStart(s);
    endCompetitiveMarketTurn(s); // P0 -> P1
    expect(s.phase).toBe('MarketPhase');
    endCompetitiveMarketTurn(s); // P1 -> closing
    expect(s.phase).toBe('InvestmentResolution');
  });

  it('resolveCompetitiveClosingPhases runs shared closing once and returns to DayStart (next day)', () => {
    const s = comp('ac1-closing', 2);
    s.resourceBank.coins = 1000;
    s.resourceBank.reputation = 1000;
    s.ledger.apply({ coins: 1000 - s.ledger.get('coins'), reputation: 1000 - s.ledger.get('reputation') } as any, 'test');
    executeCompetitiveDayStart(s);
    endCompetitiveMarketTurn(s); // P0->P1
    endCompetitiveMarketTurn(s); // P1->InvestmentResolution
    expect(s.phase).toBe('InvestmentResolution');
    const beforeTurn = s.turn;
    const result = resolveCompetitiveClosingPhases(s);
    // Closing ran once; on continue we are back at DayStart next day, activePlayer 0
    expect(s.phase).toBe('DayStart');
    expect(s.turn).toBe(beforeTurn + 1);
    expect(s.activePlayerId).toBe(0);
    expect(result.gameResult).toBe('playing');
    // Income may be 0 with empty grid but should be present
    expect(result.income).not.toBeNull();
  });

  it('shared closing with N=3 alternates P0->P1->P2 then closing', () => {
    const s = comp('ac1-n3', 3);
    executeCompetitiveDayStart(s);
    expect(getActivePlayerId(s)).toBe(0);
    endCompetitiveMarketTurn(s);
    expect(getActivePlayerId(s)).toBe(1);
    expect(s.phase).toBe('MarketPhase');
    endCompetitiveMarketTurn(s);
    expect(getActivePlayerId(s)).toBe(2);
    expect(s.phase).toBe('MarketPhase');
    endCompetitiveMarketTurn(s);
    expect(s.phase).toBe('InvestmentResolution');
    // Ensure not yet closed
    s.resourceBank.coins = 500;
    s.resourceBank.reputation = 500;
    resolveCompetitiveClosingPhases(s);
    expect(s.phase).toBe('DayStart');
    expect(s.activePlayerId).toBe(0);
  });

  it('shared closing with N=4 alternates through all players', () => {
    const s = comp('ac1-n4', 4);
    executeCompetitiveDayStart(s);
    for (let i = 0; i < 3; i++) {
      expect(getActivePlayerId(s)).toBe(i);
      endCompetitiveMarketTurn(s);
      expect(s.phase).toBe('MarketPhase');
    }
    expect(getActivePlayerId(s)).toBe(3);
    endCompetitiveMarketTurn(s);
    expect(s.phase).toBe('InvestmentResolution');
  });

  it('action budget hand-off: each day resets per-player budgets from staff+bank', () => {
    const s = comp('ac1-budget', 2);
    // Give P0 a staff with +1 action to verify per-player derivation
    s.players![0].staffCards = [{ id: 'staff-gm', name: 'GM', family: 'staff', cost: 2, actionsPerTurn: 1, handSlotsAdded: 0, ongoingCost: 0, specializationSkillIds: [] } as any];
    s.bankedActions = 1;
    executeCompetitiveDayStart(s);
    expect(s.players![0].actionBudget).toBe(3); // 1 base +1 staff +1 bank
    expect(s.players![1].actionBudget).toBe(2); // 1 base +0 staff +1 bank
  });

  it('executeCompetitiveDay convenience runs DayStart -> N markets -> shared closing', () => {
    const s = comp('ac1-conv', 2);
    s.resourceBank.coins = 1000;
    s.resourceBank.reputation = 1000;
    const beforeTurn = s.turn;
    const result = executeCompetitiveDay(s, [[], []]);
    // After one shared day, turn advanced and phase reset
    expect(result.gameResult).toBe('playing');
    expect(s.turn).toBe(beforeTurn + 1);
    expect(s.phase).toBe('DayStart');
    expect(s.activePlayerId).toBe(0);
  });

  it('phase entry/exit invariants: endCompetitiveMarketTurn throws outside MarketPhase', () => {
    const s = comp('ac1-inv-phase', 2);
    s.phase = 'DayStart';
    expect(() => endCompetitiveMarketTurn(s)).toThrow(/MarketPhase/);
  });

  it('phase entry/exit invariants: resolveCompetitiveClosingPhases throws outside InvestmentResolution', () => {
    const s = comp('ac1-inv-close', 2);
    executeCompetitiveDayStart(s);
    // Still in MarketPhase, not InvestmentResolution
    expect(() => resolveCompetitiveClosingPhases(s)).toThrow(/InvestmentResolution/);
  });

  it('single-player (no players[]) throws for competitive-only helpers', () => {
    const s = setupMainStreetGame({ seed: 'ac1-single-helpers' });
    s.phase = 'MarketPhase';
    expect(() => endCompetitiveMarketTurn(s)).toThrow(/competitive state/);
    s.phase = 'InvestmentResolution';
    expect(() => resolveCompetitiveClosingPhases(s)).toThrow(/competitive state|InvestmentResolution/);
  });

  it('setActivePlayerId throws out of range', () => {
    const s = comp('ac1-range', 2);
    expect(() => setActivePlayerId(s, -1)).toThrow(/out of range/);
    expect(() => setActivePlayerId(s, 2)).toThrow(/out of range/);
    // Valid sets
    setActivePlayerId(s, 1);
    expect(getActivePlayerId(s)).toBe(1);
  });

  it('getActivePlayerId returns 0 in single-player (no players[])', () => {
    const s = setupMainStreetGame({ seed: 'ac1-get-single' });
    expect(getActivePlayerId(s)).toBe(0);
  });
});

// ── AC2: First-to-threshold win ─────────────────────────────

describe('AC2 — First-to-threshold win', () => {
  it('first player reaching winThreshold wins and sets competitiveWinnerId', () => {
    const s = comp('ac2-first', 2);
    s.config = { ...s.config, winThreshold: 10 } as any;
    // P0 crosses, P1 does not
    setScores(s, [12, 5]);
    const ended = checkCompetitiveEndConditions(s);
    expect(ended).toBe(true);
    expect(s.gameResult).toBe('win');
    expect(s.endReason).toBe('score_threshold');
    expect(s.competitiveWinnerId).toBe(0);
  });

  it('lowest index wins on tie when both cross in same EndCheck', () => {
    const s = comp('ac2-tie', 2);
    s.config = { ...s.config, winThreshold: 10 } as any;
    setScores(s, [15, 20]); // both cross, P1 higher but P0 should win
    const ended = checkCompetitiveEndConditions(s);
    expect(ended).toBe(true);
    expect(s.competitiveWinnerId).toBe(0);
  });

  it('P1 wins when only P1 crosses threshold', () => {
    const s = comp('ac2-p1', 2);
    s.config = { ...s.config, winThreshold: 10 } as any;
    setScores(s, [5, 12]);
    const ended = checkCompetitiveEndConditions(s);
    expect(ended).toBe(true);
    expect(s.competitiveWinnerId).toBe(1);
  });

  it('no win when no player reaches threshold', () => {
    const s = comp('ac2-none', 2);
    s.config = { ...s.config, winThreshold: 100 } as any;
    setScores(s, [10, 20]);
    const ended = checkCompetitiveEndConditions(s);
    expect(ended).toBe(false);
    expect(s.gameResult).toBe('playing');
    expect(s.competitiveWinnerId).toBeNull();
  });

  it('all-challenges win goes to player 0 (shared milestone)', () => {
    const s = comp('ac2-chal', 2);
    // Mark all challenges completed
    for (const ac of s.activeChallenges) ac.completed = true;
    if (s.activeChallenges.length === 0) {
      // Ensure at least one challenge exists for this branch
      s.activeChallenges = [{ challenge: { id: 'c1' } as any, completed: true }];
    }
    s.config = { ...s.config, winThreshold: 9999 } as any;
    const ended = checkCompetitiveEndConditions(s);
    expect(ended).toBe(true);
    expect(s.endReason).toBe('all_challenges');
    expect(s.competitiveWinnerId).toBe(0);
  });

  it('N=3 first-to-threshold respects index order', () => {
    const s = comp('ac2-n3', 3);
    s.config = { ...s.config, winThreshold: 10 } as any;
    setScores(s, [5, 11, 12]); // P1 and P2 cross, P1 should win
    const ended = checkCompetitiveEndConditions(s);
    expect(ended).toBe(true);
    expect(s.competitiveWinnerId).toBe(1);
  });

  it('updateCompetitiveScores recomputes per-player scores (coins+rep+bonus) and syncs finalScore to max', () => {
    const s = comp('ac2-scores', 2);
    s.challengesCompleted = ['c1'];
    const bonus = s.config.challengeBonusPoints;
    s.players![0].coins = 10;
    s.players![0].reputation = 5;
    s.players![1].coins = 3;
    s.players![1].reputation = 2;
    updateCompetitiveScores(s);
    expect(s.players![0].score).toBe(10 + 5 + bonus);
    expect(s.players![1].score).toBe(3 + 2 + bonus);
    expect(s.finalScore).toBe(Math.max(s.players![0].score, s.players![1].score));
  });

  it('delegates to legacy checkEndConditions when no players[]', () => {
    const s = setupMainStreetGame({ seed: 'ac2-delegate' });
    s.config = { ...s.config, winThreshold: 5 } as any;
    s.resourceBank.coins = 10;
    s.resourceBank.reputation = 10;
    // force score >= threshold via direct coins/rep
    s.ledger.apply({ coins: 10 - s.ledger.get('coins'), reputation: 10 - s.ledger.get('reputation') } as any, 'test');
    const ended = checkCompetitiveEndConditions(s);
    expect(ended).toBe(true);
    expect(s.gameResult).toBe('win');
    expect(s.endReason).toBe('score_threshold');
  });
});

// ── AC3: N=1 regression ────────────────────────────────────

describe('AC3 — N=1 preserves legacy single-player sequence', () => {
  it('competitive N=1 has one MarketPhase then shared closing', () => {
    const s = comp('ac3-n1-phase', 1);
    s.resourceBank.coins = 500;
    s.resourceBank.reputation = 500;
    executeCompetitiveDayStart(s);
    expect(s.phase).toBe('MarketPhase');
    expect(getActivePlayerId(s)).toBe(0);
    endCompetitiveMarketTurn(s);
    expect(s.phase).toBe('InvestmentResolution');
    const result = resolveCompetitiveClosingPhases(s);
    expect(result.gameResult).toBe('playing');
    expect(s.phase).toBe('DayStart');
  });

  it('executeCompetitiveDay N=1 collapses to legacy path (processEndOfTurn)', () => {
    const seed = 'ac3-n1-conv';
    const a = comp(seed, 1);
    const b = comp(seed, 1);
    // Avoid loss from bankruptcy: give ample resources
    for (const s of [a, b]) {
      s.resourceBank.coins = 500;
      s.resourceBank.reputation = 500;
    }
    // N=1 competitive convenience
    const rComp = executeCompetitiveDay(a, [[]]);
    // Legacy single-player path for comparison: DayStart + processEndOfTurn
    executeDayStart(b);
    const rLegacy = processEndOfTurn(b);
    expect(rComp.gameResult).toBe(rLegacy.gameResult);
    expect(a.turn).toBe(b.turn);
    expect(a.phase).toBe(b.phase);
  });

  it('N=1 deterministic market/decks same as single-player (sanity via competitive-state)', () => {
    const seed = 'ac3-determinism';
    const single = setupMainStreetGame({ seed });
    const comp1 = comp(seed, 1);
    expect(comp1.market.cards.map(c => c.id)).toEqual(single.market.cards.map(c => c.id));
    expect(comp1.decks.business.map(c => c.id)).toEqual(single.decks.business.map(c => c.id));
  });

  it('N=1 win uses threshold like single-player (winner is player 0)', () => {
    const s = comp('ac3-n1-win', 1);
    s.config = { ...s.config, winThreshold: 10 } as any;
    setScores(s, [12]);
    const ended = checkCompetitiveEndConditions(s);
    expect(ended).toBe(true);
    expect(s.competitiveWinnerId).toBe(0);
    expect(s.gameResult).toBe('win');
  });
});

// ── AC4: Phase diagram invariants ───────────────────────────

describe('AC4 — Phase diagram and invariants', () => {
  it('full shared day via executeCompetitiveDay matches manual alternation', () => {
    const seed = 'ac4-manual-vs-conv';
    const a = comp(seed, 2);
    const b = comp(seed, 2);
    for (const s of [a, b]) {
      s.resourceBank.coins = 800;
      s.resourceBank.reputation = 800;
    }
    // Manual
    executeCompetitiveDayStart(a);
    endCompetitiveMarketTurn(a);
    endCompetitiveMarketTurn(a);
    const rManual = resolveCompetitiveClosingPhases(a);
    // Convenience
    const rConv = executeCompetitiveDay(b, [[], []]);
    expect(rManual.gameResult).toBe(rConv.gameResult);
    expect(a.turn).toBe(b.turn);
    expect(a.phase).toBe(b.phase);
    expect(a.activePlayerId).toBe(b.activePlayerId);
  });

  it('determinism: same seed same shared-day phase transitions', () => {
    const s1 = comp('ac4-det', 2);
    const s2 = comp('ac4-det', 2);
    executeCompetitiveDayStart(s1);
    executeCompetitiveDayStart(s2);
    expect(s1.phase).toBe(s2.phase);
    expect(getActivePlayerId(s1)).toBe(getActivePlayerId(s2));
    endCompetitiveMarketTurn(s1);
    endCompetitiveMarketTurn(s2);
    expect(s1.phase).toBe(s2.phase);
    expect(getActivePlayerId(s1)).toBe(getActivePlayerId(s2));
  });

  it('phase diagram: InvestmentResolution -> IncomePhase -> IncidentPhase -> EndCheck -> DayStart is exercised', () => {
    const s = comp('ac4-diagram', 2);
    s.resourceBank.coins = 1000;
    s.resourceBank.reputation = 1000;
    executeCompetitiveDayStart(s);
    endCompetitiveMarketTurn(s);
    endCompetitiveMarketTurn(s);
    // Currently InvestmentResolution
    expect(s.phase).toBe('InvestmentResolution');
    resolveCompetitiveClosingPhases(s);
    // After closing, we are back at DayStart (the diagram's cycle point)
    expect(s.phase).toBe('DayStart');
  });
});
