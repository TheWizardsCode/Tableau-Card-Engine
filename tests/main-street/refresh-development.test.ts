/**
 * Refresh Development Row Tests
 *
 * Validates the Discover button functionality for the Development market row.
 *
 * Acceptance criteria:
 * AC1: Clicking the Discover button in the Development row re-rolls the Development cards.
 * AC2: Clicking the Discover button in the Development row does NOT affect Investment cards.
 * AC3: Investment cards have their own Discover/Research button that only affects investments.
 * AC4: Clicking Discover in Development when insufficient funds shows appropriate feedback.
 *
 * @module
 */

import { describe, it, expect } from 'vitest';

import { setupMainStreetGame } from '../../example-games/main-street/MainStreetState';
import {
  canRefreshDevelopment,
  refreshDevelopment,
  refreshInvestments,
  canRefreshInvestments,
} from '../../example-games/main-street/MainStreetMarket';
import {
  REFRESH_DEVELOPMENT_COST,
  REFRESH_INVESTMENTS_COST,
  MARKET_BUSINESS_SLOTS,
} from '../../example-games/main-street/MainStreetCards';

function createTestState(seed = 'refresh-dev-test') {
  return setupMainStreetGame({ seed });
}

// ── AC1: Development refresh re-rolls development cards ────

describe('canRefreshDevelopment (AC1 - legal checks)', () => {
  it('should be legal during MarketPhase with sufficient coins', () => {
    const s = createTestState();
    s.phase = 'MarketPhase';
    s.resourceBank.coins = REFRESH_DEVELOPMENT_COST + 5;
    const res = canRefreshDevelopment(s);
    expect(res.legal).toBe(true);
  });

  it('should be illegal outside MarketPhase', () => {
    const s = createTestState();
    s.phase = 'DayStart';
    s.resourceBank.coins = REFRESH_DEVELOPMENT_COST + 5;
    const res = canRefreshDevelopment(s);
    expect(res.legal).toBe(false);
    expect((res as { legal: false; reason: string }).reason).toContain('MarketPhase');
  });

  it('should be illegal when player lacks coins', () => {
    const s = createTestState();
    s.phase = 'MarketPhase';
    s.resourceBank.coins = 0;
    const res = canRefreshDevelopment(s);
    expect(res.legal).toBe(false);
    expect((res as { legal: false; reason: string }).reason).toContain('Not enough coins');
  });
});

describe('refreshDevelopment (AC1 - execution)', () => {
  it('should deduct coins and replace development cards', () => {
    const s = createTestState('refresh-dev-exec');
    s.phase = 'MarketPhase';
    s.resourceBank.coins = REFRESH_DEVELOPMENT_COST + 10;

    const visibleBefore = s.market.development.map(c => c.id);
    expect(visibleBefore.length).toBeGreaterThan(0);

    const coinsBefore = s.resourceBank.coins;

    const result = refreshDevelopment(s);

    // Coins deducted
    expect(s.resourceBank.coins).toBe(coinsBefore - REFRESH_DEVELOPMENT_COST);
    expect(result.cost).toBe(REFRESH_DEVELOPMENT_COST);

    // Removed cards were recorded in the return value
    expect(result.replaced.length).toBe(visibleBefore.length);

    // Development row has new cards (may differ or be same if deck only had those cards)
    expect(s.market.development.length).toBeLessThanOrEqual(MARKET_BUSINESS_SLOTS);

    // Cards went to respective discards
    const discardedIds = [
      ...s.discards.business.map((c: any) => c.id),
      ...s.discards.communitySpace.map((c: any) => c.id),
    ];
    for (const id of result.replaced.map(c => c.id)) {
      expect(discardedIds).toContain(id);
    }

    // No duplicate ids in visible market
    const ids = s.market.development.map((c: any) => c.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('should throw when illegal', () => {
    const s = createTestState('refresh-dev-illegal');
    s.phase = 'MarketPhase';
    s.resourceBank.coins = 0;

    expect(() => refreshDevelopment(s)).toThrow();
  });
});

// ── AC2: Development refresh does NOT affect investments ───

describe('Development refresh leaves investments untouched (AC2)', () => {
  it('should not change the investments row', () => {
    const s = createTestState('refresh-dev-ac2');
    s.phase = 'MarketPhase';
    s.resourceBank.coins = REFRESH_DEVELOPMENT_COST + 10;

    const investmentsBefore = s.market.investments.map(c => ({ id: c.id, family: c.family }));

    refreshDevelopment(s);

    const investmentsAfter = s.market.investments.map(c => ({ id: c.id, family: c.family }));
    expect(investmentsAfter).toEqual(investmentsBefore);
  });

  it('should not modify upgrade or event discards', () => {
    const s = createTestState('refresh-dev-ac2b');
    s.phase = 'MarketPhase';
    s.resourceBank.coins = REFRESH_DEVELOPMENT_COST + 10;

    const upgDiscardBefore = [...s.discards.upgrade];
    const evtDiscardBefore = [...s.discards.event];

    refreshDevelopment(s);

    expect(s.discards.upgrade).toEqual(upgDiscardBefore);
    expect(s.discards.event).toEqual(evtDiscardBefore);
  });

  it('should not change the player hand', () => {
    const s = createTestState('refresh-dev-ac2c');
    s.phase = 'MarketPhase';
    s.resourceBank.coins = REFRESH_DEVELOPMENT_COST + 10;

    const handBefore = s.hand;

    refreshDevelopment(s);

    expect(s.hand).toBe(handBefore);
  });
});

// ── AC3: Investment Research button is independent ─────────

describe('Investment Research is independent of Development Discover (AC3)', () => {
  it('should have separate legality checks for development and investments', () => {
    const s = createTestState('refresh-dev-ac3');
    s.phase = 'MarketPhase';
    s.resourceBank.coins = 0;

    // Both should report insufficient-funds (independently)
    const devCheck = canRefreshDevelopment(s);
    const invCheck = canRefreshInvestments(s);

    expect(devCheck.legal).toBe(false);
    expect(invCheck.legal).toBe(false);

    // When coins are available
    s.resourceBank.coins = REFRESH_DEVELOPMENT_COST + REFRESH_INVESTMENTS_COST;

    expect(canRefreshDevelopment(s).legal).toBe(true);
    expect(canRefreshInvestments(s).legal).toBe(true);
  });

  it('should refresh investments independently after a development refresh', () => {
    const s = createTestState('refresh-dev-ac3b');
    s.phase = 'MarketPhase';
    s.resourceBank.coins = REFRESH_DEVELOPMENT_COST + REFRESH_INVESTMENTS_COST + 10;

    // Snapshot investment card IDs
    const invBefore = s.market.investments.map(c => c.id);

    // Refresh development
    refreshDevelopment(s);

    // Investment row should be unchanged
    const invAfterRefreshDev = s.market.investments.map(c => c.id);
    expect(invAfterRefreshDev).toEqual(invBefore);

    // Now refresh investments - should work independently
    const invResult = refreshInvestments(s);
    expect(invResult.replaced.length).toBeGreaterThan(0);
  });
});

// ── AC4: Insufficient funds feedback ───────────────────────

describe('Insufficient funds feedback (AC4)', () => {
  it('should report the exact shortfall in the reason', () => {
    const s = createTestState('refresh-dev-ac4');
    s.phase = 'MarketPhase';
    s.resourceBank.coins = 0;

    const res = canRefreshDevelopment(s);
    expect(res.legal).toBe(false);
    const resIllegal = res as { legal: false; reason: string };
    expect(resIllegal.reason).toContain(String(REFRESH_DEVELOPMENT_COST));
    expect(resIllegal.reason).toContain('0');
  });

  it('should report insufficient funds when coins are below cost', () => {
    const s = createTestState('refresh-dev-ac4b');
    s.phase = 'MarketPhase';
    s.resourceBank.coins = REFRESH_DEVELOPMENT_COST - 1;

    const res = canRefreshDevelopment(s);
    expect(res.legal).toBe(false);
    expect((res as { legal: false; reason: string }).reason).toContain('Not enough coins');
  });
});
