import { describe, it, expect } from 'vitest';

import { setupMainStreetGame } from '../../example-games/main-street/MainStreetState';
import {
  canRefreshInvestments,
  refreshInvestments,
  refillInvestmentsMarket,
} from '../../example-games/main-street/MainStreetMarket';
import {
  REFRESH_INVESTMENTS_COST,
  MARKET_INVESTMENT_SLOTS,
  MARKET_INVESTMENT_UPGRADE_COUNT,
  MARKET_INVESTMENT_EVENT_COUNT,
} from '../../example-games/main-street/MainStreetCards';

function createTestState(seed = 'refresh-test') {
  return setupMainStreetGame({ seed });
}

describe('refreshInvestments', () => {
  it('should be illegal outside MarketPhase', () => {
    const s = createTestState();
    s.phase = 'DayStart';
    const res = canRefreshInvestments(s as any);
    expect(res.legal).toBe(false);
  });

  it('should be illegal when player lacks coins', () => {
    const s = createTestState();
    s.phase = 'MarketPhase';
    s.resourceBank.coins = 0;
    const res = canRefreshInvestments(s as any);
    expect(res.legal).toBe(false);
  });

  it('should deduct coins, discard removed cards, and refill using market rules', () => {
    const s = createTestState('refresh-exec');
    s.phase = 'MarketPhase';
    // Ensure we have enough coins
    s.resourceBank.coins = REFRESH_INVESTMENTS_COST + 5;

    // Snapshot initial decks and discards
    const upgDeckBefore = s.decks.upgrade.length;
    const evtDeckBefore = s.decks.event.length;
    expect(s.discards.upgrade).toHaveLength(0);
    expect(s.discards.event).toHaveLength(0);

    // Force a small visible investments row for determinism
    s.market.investments = [];
    // Draw explicitly using existing refill helper
    refillInvestmentsMarket(s as any);

    const visibleBefore = s.market.investments.map(c => c.id);
    expect(visibleBefore.length).toBeGreaterThan(0);

    const coinsBefore = s.resourceBank.coins;

    const result = refreshInvestments(s as any);

    // Coins deducted
    expect(s.resourceBank.coins).toBe(coinsBefore - REFRESH_INVESTMENTS_COST);
    expect(result.cost).toBe(REFRESH_INVESTMENTS_COST);

    // Removed cards were recorded in the return value
    expect(result.replaced.length).toBe(visibleBefore.length);

    // Discards increased accordingly (each removed card goes to its family discard)
    const discardedIds = [...s.discards.upgrade.map((c:any)=>c.id), ...s.discards.event.map((c:any)=>c.id)];
    for (const id of result.replaced.map(c => c.id)) {
      expect(discardedIds).toContain(id);
    }

    // Investments row was refilled up to slot limits (or fewer if decks exhausted)
    const upgCount = s.market.investments.filter((c:any) => c.family === 'upgrade').length;
    const evtCount = s.market.investments.filter((c:any) => c.family === 'event').length;
    expect(upgCount).toBeLessThanOrEqual(MARKET_INVESTMENT_UPGRADE_COUNT);
    expect(evtCount).toBeLessThanOrEqual(MARKET_INVESTMENT_EVENT_COUNT);
    expect(s.market.investments.length).toBeLessThanOrEqual(MARKET_INVESTMENT_SLOTS);

    // No duplicate ids in visible market
    const ids = s.market.investments.map((c:any)=>c.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });
});
