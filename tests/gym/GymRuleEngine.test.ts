/**
 * Gym Rule Engine demo scene tests.
 *
 * Validates the demo logic that the GymRuleEngineScene interactive
 * buttons invoke — simulating legal/illegal actions and
 * EconomyLedger resource operations.
 *
 * The scene itself is smoke-tested in GymSceneSmoke.browser.test.ts.
 */
import { describe, it, expect } from 'vitest';
import {
  legalAction,
  illegalAction,
  createEconomyLedger,
  type LegalityResult,
  type ResourceDelta,
} from '../../src/rule-engine/index';

// ── LegalityResult demo scenarios ──────────────────────────

describe('GymRuleEngineScene / LegalityResult demo scenarios', () => {
  it('simulates a legal move action', () => {
    const result: LegalityResult = legalAction();
    expect(result).toEqual({ legal: true });
  });

  it('simulates an illegal action: not your turn', () => {
    const result: LegalityResult = illegalAction('Not your turn');
    expect(result).toEqual({ legal: false, reason: 'Not your turn' });
  });

  it('simulates an illegal action: insufficient funds', () => {
    const result: LegalityResult = illegalAction('Insufficient funds (need 50, have 20)');
    expect(result).toEqual({ legal: false, reason: 'Insufficient funds (need 50, have 20)' });
  });

  it('simulates an illegal action: out of bounds', () => {
    const result: LegalityResult = illegalAction('Card position out of bounds');
    expect(result).toEqual({ legal: false, reason: 'Card position out of bounds' });
  });

  it('simulates an illegal action: wrong phase', () => {
    const result: LegalityResult = illegalAction('Cannot act during opponent turn');
    expect(result).toEqual({ legal: false, reason: 'Cannot act during opponent turn' });
  });

  it('narrows discriminated union correctly for legal vs illegal', () => {
    const legal = legalAction();
    const illegal = illegalAction('Some reason');

    // Legal branch
    if (legal.legal) {
      expect(legal).toEqual({ legal: true });
    } else {
      throw new Error('legal result should have legal: true');
    }

    // Illegal branch
    if (!illegal.legal) {
      expect(typeof illegal.reason).toBe('string');
      expect(illegal.reason).toBe('Some reason');
    } else {
      throw new Error('illegal result should have legal: false');
    }
  });

  it('reason message is surfaced correctly when displayed', () => {
    // The scene displays the result as "legal: true" or "legal: false — reason"
    const legal = legalAction();
    const illegal = illegalAction('Card not in hand');

    const legalDisplay = legal.legal ? 'legal: true' : 'legal: false';
    const illegalDisplay = illegal.legal
      ? 'legal: true'
      : `legal: false — ${illegal.reason}`;

    expect(legalDisplay).toBe('legal: true');
    expect(illegalDisplay).toBe('legal: false — Card not in hand');
  });
});

// ── EconomyLedger demo scenarios ───────────────────────────

describe('GymRuleEngineScene / EconomyLedger demo scenarios', () => {
  it('adds coins and displays updated value', () => {
    const ledger = createEconomyLedger({ coins: 10 });
    ledger.apply({ coins: 5 });
    expect(ledger.get('coins')).toBe(15);
  });

  it('subtracts coins and displays updated value', () => {
    const ledger = createEconomyLedger({ coins: 10 });
    ledger.apply({ coins: -3 });
    expect(ledger.get('coins')).toBe(7);
  });

  it('adds reputation', () => {
    const ledger = createEconomyLedger({ reputation: 5 });
    ledger.apply({ reputation: 2 });
    expect(ledger.get('reputation')).toBe(7);
  });

  it('subtracts reputation', () => {
    const ledger = createEconomyLedger({ reputation: 5 });
    ledger.apply({ reputation: -1 });
    expect(ledger.get('reputation')).toBe(4);
  });

  it('sets score to an absolute value', () => {
    const ledger = createEconomyLedger({ score: 0 });
    ledger.setScore(100);
    expect(ledger.get('score')).toBe(100);
  });

  it('displays all resource values as a formatted string', () => {
    const ledger = createEconomyLedger({ coins: 15, reputation: 7, score: 100 });
    const display = `Coins: ${ledger.get('coins')} | Reputation: ${ledger.get('reputation')} | Score: ${ledger.get('score')}`;
    expect(display).toBe('Coins: 15 | Reputation: 7 | Score: 100');
  });

  it('applies multiple resource deltas in one call', () => {
    const ledger = createEconomyLedger({ coins: 10, reputation: 5, score: 0 });
    ledger.apply({ coins: -3, reputation: 2 });
    expect(ledger.get('coins')).toBe(7);
    expect(ledger.get('reputation')).toBe(7);
    expect(ledger.get('score')).toBe(0); // unchanged
  });

  it('checks canApply with constraints (minCoins enforcement)', () => {
    const ledger = createEconomyLedger({
      coins: 5,
      constraints: { minCoins: 0 },
    });

    // Allowed: would result in coins = 0
    expect(ledger.canApply({ coins: -5 })).toBe(true);
    // Blocked: would result in coins = -1
    expect(ledger.canApply({ coins: -6 })).toBe(false);
  });

  it('checks canApply with constraints (minReputation enforcement)', () => {
    const ledger = createEconomyLedger({
      reputation: 3,
      constraints: { minReputation: 0 },
    });

    expect(ledger.canApply({ reputation: -3 })).toBe(true);
    expect(ledger.canApply({ reputation: -4 })).toBe(false);
  });

  it('canApply returns true when no constraints set', () => {
    const ledger = createEconomyLedger({ coins: 5, reputation: 3 });
    // Without constraints, all deltas are allowed (even negative)
    expect(ledger.canApply({ coins: -10 })).toBe(true);
    expect(ledger.canApply({ reputation: -10 })).toBe(true);
  });

  it('rejects canApply when delta would violate both constraints', () => {
    const ledger = createEconomyLedger({
      coins: 5,
      reputation: 3,
      constraints: { minCoins: 0, minReputation: 0 },
    });

    expect(ledger.canApply({ coins: -10, reputation: -10 })).toBe(false);
    expect(ledger.canApply({ coins: -1, reputation: -1 })).toBe(true);
  });

  it('displays constraint violation message', () => {
    const ledger = createEconomyLedger({
      coins: 5,
      constraints: { minCoins: 0 },
    });

    let message = '';
    if (!ledger.canApply({ coins: -10 })) {
      message = 'ILLEGAL: Cannot subtract 10 coins (min 0)';
    }

    expect(message).toBe('ILLEGAL: Cannot subtract 10 coins (min 0)');
  });

  it('displays success message on valid apply', () => {
    const ledger = createEconomyLedger({ coins: 10, reputation: 5 });
    const delta: ResourceDelta = { coins: -3, reputation: 2 };
    ledger.apply(delta);

    const message = `Applied: coins ${delta.coins! >= 0 ? '+' : ''}${delta.coins}, reputation ${delta.reputation! >= 0 ? '+' : ''}${delta.reputation}`;
    expect(message).toBe('Applied: coins -3, reputation +2');
    expect(ledger.get('coins')).toBe(7);
    expect(ledger.get('reputation')).toBe(7);
  });

  it('snapshot returns current state for display', () => {
    const ledger = createEconomyLedger({ coins: 15, reputation: 7, score: 100 });
    const snap = ledger.snapshot();
    expect(snap).toEqual({ coins: 15, reputation: 7, score: 100 });
  });
});
