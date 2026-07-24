/**
 * Economy Ledger — Unit & Integration Tests
 *
 * Tests for the shared EconomyLedger module extracted into
 * `src/rule-engine/EconomyLedger.ts`. These tests lock in the baseline
 * economy/resource mutation semantics from Main Street so that future
 * extractions preserve game behavior.
 *
 * Coverage:
 *  - `get` semantics for coins, reputation, score
 *  - `canApply` with and without constraints
 *  - `apply` semantics for resource deltas
 *  - Invariant checks (no illegal underflow guards, deterministic ordering)
 *  - Integration with Main Street turn/economy outcomes
 *
 * Work item: CG-0MPWZ5RFI001DJUA
 */
import { describe, it, expect } from 'vitest';

import {
  createEconomyLedger,
  type EconomyLedger,
  type EconomyLedgerConfig,
} from '../../src/rule-engine/EconomyLedger';

import {
  setupMainStreetGame,
  type MainStreetState,
} from '../../example-games/main-street/MainStreetState';

import {
  purchaseBusiness,
  purchaseUpgrade,
  purchaseEvent,
} from '../../example-games/main-street/MainStreetMarket';

import {
  executeDayStart,
  processEndOfTurn,
  resolveEvent,
  playHeldEvent,
  computeScore,
} from '../../example-games/main-street/MainStreetEngine';

import {
  applyIncome,
} from '../../example-games/main-street/MainStreetAdjacency';

import {
  applyReputationMultiplier,
} from '../../example-games/main-street/MainStreetDifficulty';

import type { EventCard, UpgradeCard } from '../../example-games/main-street/MainStreetCards';

// ── Helpers ─────────────────────────────────────────────────

function createLedger(config: EconomyLedgerConfig = {}): EconomyLedger {
  return createEconomyLedger(config);
}

// ── Unit tests: get ─────────────────────────────────────────

describe('EconomyLedger — get', () => {
  it('returns default 0 for all resources when no config provided', () => {
    const ledger = createLedger();
    expect(ledger.get('coins')).toBe(0);
    expect(ledger.get('reputation')).toBe(0);
    expect(ledger.get('score')).toBe(0);
  });

  it('returns configured initial values', () => {
    const ledger = createLedger({ coins: 10, reputation: 5, score: 50 });
    expect(ledger.get('coins')).toBe(10);
    expect(ledger.get('reputation')).toBe(5);
    expect(ledger.get('score')).toBe(50);
  });

  it('returns individual resources after mutations', () => {
    const ledger = createLedger({ coins: 10 });
    ledger.apply({ coins: -3, reputation: 2 });
    expect(ledger.get('coins')).toBe(7);
    expect(ledger.get('reputation')).toBe(2);
    expect(ledger.get('score')).toBe(0);
  });
});

// ── Unit tests: snapshot ────────────────────────────────────

describe('EconomyLedger — snapshot', () => {
  it('returns a copy of current resource values', () => {
    const ledger = createLedger({ coins: 8, reputation: 3, score: 0 });
    const snap = ledger.snapshot();
    expect(snap).toEqual({ coins: 8, reputation: 3, score: 0 });
  });

  it('snapshot is independent — mutations after snapshot do not affect it', () => {
    const ledger = createLedger({ coins: 10 });
    const snap = ledger.snapshot();
    ledger.apply({ coins: -5 });
    expect(snap.coins).toBe(10);
    expect(ledger.get('coins')).toBe(5);
  });

  it('snapshot reflects latest state', () => {
    const ledger = createLedger({ coins: 10, reputation: 3 });
    ledger.apply({ coins: -5, reputation: -1 });
    const snap = ledger.snapshot();
    expect(snap).toEqual({ coins: 5, reputation: 2, score: 0 });
  });
});

// ── Unit tests: canApply (no constraints — Main Street baseline) ──

describe('EconomyLedger — canApply (unconstrained / Main Street baseline)', () => {
  it('always returns true when no constraints are set', () => {
    const ledger = createLedger({ coins: 5 });
    // Even a delta that would make coins negative is allowed
    expect(ledger.canApply({ coins: -10 })).toBe(true);
    expect(ledger.canApply({ coins: -1000 })).toBe(true);
  });

  it('returns true for zero deltas', () => {
    const ledger = createLedger({ coins: 5, reputation: 3 });
    expect(ledger.canApply({})).toBe(true);
    expect(ledger.canApply({ coins: 0 })).toBe(true);
    expect(ledger.canApply({ reputation: 0 })).toBe(true);
  });

  it('returns true for positive deltas', () => {
    const ledger = createLedger({ coins: 5 });
    expect(ledger.canApply({ coins: 100 })).toBe(true);
    expect(ledger.canApply({ coins: 100, reputation: 50 })).toBe(true);
  });

  it('returns true for reputation going negative', () => {
    const ledger = createLedger({ reputation: 3 });
    expect(ledger.canApply({ reputation: -10 })).toBe(true);
  });
});

// ── Unit tests: canApply (with constraints) ────────────────

describe('EconomyLedger — canApply (with constraints)', () => {
  it('rejects coin delta that would go below minCoins', () => {
    const ledger = createLedger({
      coins: 5,
      constraints: { minCoins: 0 },
    });
    expect(ledger.canApply({ coins: -5 })).toBe(true);  // exactly at floor
    expect(ledger.canApply({ coins: -6 })).toBe(false); // below floor
  });

  it('rejects reputation delta that would go below minReputation', () => {
    const ledger = createLedger({
      reputation: 3,
      constraints: { minReputation: 0 },
    });
    expect(ledger.canApply({ reputation: -3 })).toBe(true);
    expect(ledger.canApply({ reputation: -4 })).toBe(false);
  });

  it('allows delta when one resource is constrained and another is not', () => {
    const ledger = createLedger({
      coins: 5,
      reputation: 3,
      constraints: { minCoins: 0 },
    });
    // Coins constrained, reputation not
    expect(ledger.canApply({ coins: -6, reputation: -100 })).toBe(false);
    expect(ledger.canApply({ coins: -3, reputation: -100 })).toBe(true);
  });

  it('applies constraints after partial delta application (additive check)', () => {
    const ledger = createLedger({
      coins: 5,
      constraints: { minCoins: 0 },
    });
    // Multiple fields: coins passes, rep has no constraint
    expect(ledger.canApply({ coins: -3, reputation: -10 })).toBe(true);
  });
});

// ── Unit tests: apply ──────────────────────────────────────

describe('EconomyLedger — apply', () => {
  it('adds positive coin deltas', () => {
    const ledger = createLedger({ coins: 10 });
    ledger.apply({ coins: 5 });
    expect(ledger.get('coins')).toBe(15);
  });

  it('subtracts negative coin deltas', () => {
    const ledger = createLedger({ coins: 10 });
    ledger.apply({ coins: -7 });
    expect(ledger.get('coins')).toBe(3);
  });

  it('allows coins to go negative (bankruptcy checked downstream)', () => {
    const ledger = createLedger({ coins: 3 });
    ledger.apply({ coins: -10 });
    expect(ledger.get('coins')).toBe(-7);
  });

  it('adds reputation deltas (positive and negative)', () => {
    const ledger = createLedger({ reputation: 5 });
    ledger.apply({ reputation: 3 });
    expect(ledger.get('reputation')).toBe(8);
    ledger.apply({ reputation: -4 });
    expect(ledger.get('reputation')).toBe(4);
  });

  it('allows reputation to go negative', () => {
    const ledger = createLedger({ reputation: 2 });
    ledger.apply({ reputation: -5 });
    expect(ledger.get('reputation')).toBe(-3);
  });

  it('adds score deltas', () => {
    const ledger = createLedger({ score: 50 });
    ledger.apply({ score: 10 });
    expect(ledger.get('score')).toBe(60);
    ledger.apply({ score: -5 });
    expect(ledger.get('score')).toBe(55);
  });

  it('applies multiple resources in a single call', () => {
    const ledger = createLedger({ coins: 10, reputation: 5, score: 0 });
    ledger.apply({ coins: -3, reputation: 2, score: 10 });
    expect(ledger.get('coins')).toBe(7);
    expect(ledger.get('reputation')).toBe(7);
    expect(ledger.get('score')).toBe(10);
  });

  it('only mutates specified resources (unspecified fields unchanged)', () => {
    const ledger = createLedger({ coins: 10, reputation: 5, score: 0 });
    ledger.apply({ coins: -3 });
    expect(ledger.get('coins')).toBe(7);
    expect(ledger.get('reputation')).toBe(5);
    expect(ledger.get('score')).toBe(0);
  });

  it('accepts an empty delta (no-op)', () => {
    const ledger = createLedger({ coins: 10 });
    ledger.apply({});
    expect(ledger.get('coins')).toBe(10);
  });

  it('accepts a reason string (not stored, for logging)', () => {
    const ledger = createLedger({ coins: 10 });
    // Should not throw
    ledger.apply({ coins: -3 }, 'purchase-business');
    expect(ledger.get('coins')).toBe(7);
  });
});

// ── Unit tests: setScore ───────────────────────────────────

describe('EconomyLedger — setScore', () => {
  it('sets score to an absolute value', () => {
    const ledger = createLedger({ score: 10 });
    ledger.setScore(50);
    expect(ledger.get('score')).toBe(50);
  });

  it('allows setting score to 0', () => {
    const ledger = createLedger({ score: 50 });
    ledger.setScore(0);
    expect(ledger.get('score')).toBe(0);
  });

  it('allows setting score to negative', () => {
    const ledger = createLedger({ score: 10 });
    ledger.setScore(-5);
    expect(ledger.get('score')).toBe(-5);
  });
});

// ── Invariant tests ─────────────────────────────────────────

describe('EconomyLedger — invariants', () => {
  describe('No illegal underflow guards (Main Street baseline)', () => {
    it('coins can go below zero — bankruptcy is an engine-level check', () => {
      const ledger = createLedger({ coins: 3 });
      // In Main Street, coins can go negative; bankruptcy is checked
      // separately in checkImmediateLoss()
      ledger.apply({ coins: -10 });
      expect(ledger.get('coins')).toBeLessThan(0);
    });

    it('reputation can go below zero — collapse is an engine-level check', () => {
      const ledger = createLedger({ reputation: 1 });
      // In Main Street, reputation can go negative; collapse is checked
      // separately in checkImmediateLoss()
      ledger.apply({ reputation: -5 });
      expect(ledger.get('reputation')).toBeLessThan(0);
    });
  });

  describe('Deterministic delta application ordering', () => {
    it('multiple apply calls are order-dependent (sequential, not commutative)', () => {
      // When a canApply check is involved, order matters:
      // apply(-5), then apply(-5) → -10
      // vs. apply(-10) directly → -10 (same result for unconstrained)
      const ledger1 = createLedger({ coins: 8 });
      ledger1.apply({ coins: -5 });
      ledger1.apply({ coins: -5 });

      const ledger2 = createLedger({ coins: 8 });
      ledger2.apply({ coins: -10 });

      expect(ledger1.get('coins')).toBe(ledger2.get('coins'));
    });

    it('snapshot captures state at a point in time for reproducible checks', () => {
      const ledger = createLedger({ coins: 10, reputation: 3 });
      const before = ledger.snapshot();

      ledger.apply({ coins: -5, reputation: 2 });
      const after = ledger.snapshot();

      // Delta can be computed from snapshots
      expect(after.coins - before.coins).toBe(-5);
      expect(after.reputation - before.reputation).toBe(2);
    });
  });

  describe('Additive semantics', () => {
    it('apply is purely additive — no multiplicative or clamping behavior', () => {
      const ledger = createLedger({ coins: 100 });
      ledger.apply({ coins: 50 });
      ledger.apply({ coins: -30 });
      ledger.apply({ coins: -30 });
      // 100 + 50 - 30 - 30 = 90
      expect(ledger.get('coins')).toBe(90);
    });

    it('zero delta is a true no-op', () => {
      const ledger = createLedger({ coins: 7, reputation: 3, score: 20 });
      const before = ledger.snapshot();
      ledger.apply({ coins: 0, reputation: 0, score: 0 });
      expect(ledger.snapshot()).toEqual(before);
    });
  });

  describe('Independence of resources', () => {
    it('mutating coins does not affect reputation or score', () => {
      const ledger = createLedger({ coins: 10, reputation: 5, score: 50 });
      ledger.apply({ coins: -100 });
      expect(ledger.get('reputation')).toBe(5);
      expect(ledger.get('score')).toBe(50);
    });

    it('mutating reputation does not affect coins or score', () => {
      const ledger = createLedger({ coins: 10, reputation: 5, score: 50 });
      ledger.apply({ reputation: -100 });
      expect(ledger.get('coins')).toBe(10);
      expect(ledger.get('score')).toBe(50);
    });
  });
});

// ── Integration tests: Main Street economy parity ───────────

describe('EconomyLedger — Main Street integration parity', () => {
  /**
   * Helper: build a ledger from a MainStreetState's resource bank.
   * This captures the baseline state that the ledger must reproduce.
   */
  function ledgerFromState(state: MainStreetState): EconomyLedger {
    return createLedger({
      coins: state.resourceBank.coins,
      reputation: state.resourceBank.reputation,
    });
  }

  /**
   * Helper: apply the same delta that MainStreetEngine/Market would apply,
   * and verify the ledger matches the state's resource bank.
   */
  function verifyParity(
    state: MainStreetState,
    ledger: EconomyLedger,
    delta: { coins: number; reputation: number },
  ): void {
    ledger.apply({ coins: delta.coins, reputation: delta.reputation });
    expect(ledger.get('coins')).toBe(state.resourceBank.coins);
    expect(ledger.get('reputation')).toBe(state.resourceBank.reputation);
  }

  describe('Purchase parity', () => {
    it('purchaseBusiness: ledger matches state after business purchase', () => {
      const state = setupMainStreetGame({ seed: 'ledger-purchase-biz' });
      const ledger = ledgerFromState(state);

      const coinsBefore = state.resourceBank.coins;
      const businessCard = state.market.development.find(c => c.cost <= coinsBefore);
      expect(businessCard).toBeDefined();
      purchaseBusiness(state, businessCard!.id, 0);

      const expectedDelta = state.resourceBank.coins - coinsBefore;
      verifyParity(state, ledger, { coins: expectedDelta, reputation: 0 });
    });

    it('purchaseUpgrade: ledger matches state after upgrade purchase', () => {
      const state = setupMainStreetGame({ seed: 'ledger-purchase-upgrade' });

      // Place a matching business for the first upgrade in market
      const upgradeCard = state.market.investments.find(
        c => c.family === 'upgrade',
      ) as UpgradeCard | undefined;
      if (!upgradeCard) {
        return; // skip if no upgrade available
      }

      const matchingBiz = state.decks.business.find(b => b.name === upgradeCard.targetBusiness);
      if (!matchingBiz) {
        return; // skip if no matching business
      }
      state.streetGrid[0] = { ...matchingBiz, level: upgradeCard.requiredLevel ?? 0 };

      const ledger = ledgerFromState(state);
      const coinsBefore = state.resourceBank.coins;

      purchaseUpgrade(state, upgradeCard.id);

      const expectedDelta = state.resourceBank.coins - coinsBefore;
      verifyParity(state, ledger, { coins: expectedDelta, reputation: 0 });
    });

    it('purchaseEvent: ledger matches state after event purchase', () => {
      const state = setupMainStreetGame({ seed: 'ledger-purchase-event' });

      const eventCard = state.market.investments.find(
        c => c.family === 'event' && (c as EventCard).trigger === 'Investment',
      ) as EventCard | undefined;
      if (!eventCard) {
        return; // skip if no investment event available
      }

      // Ensure enough coins for the event purchase
      if (state.resourceBank.coins < eventCard.cost) {
        state.resourceBank.coins = eventCard.cost;
      }

      const ledger = ledgerFromState(state);
      const coinsBefore = state.resourceBank.coins;

      purchaseEvent(state, eventCard.id);

      const expectedDelta = state.resourceBank.coins - coinsBefore;
      verifyParity(state, ledger, { coins: expectedDelta, reputation: 0 });
    });
  });

  describe('Income parity', () => {
    it('applyIncome: ledger matches state after income with reputation multiplier', () => {
      const state = setupMainStreetGame({ seed: 'ledger-income' });

      // Place a single business for predictable income
      const biz = state.decks.business[0];
      state.streetGrid.fill(null);
      state.streetGrid[0] = { ...biz };

      const ledger = ledgerFromState(state);

      const incomeResult = applyIncome(state);
      const multipliedIncome = applyReputationMultiplier(
        incomeResult.total,
        state.resourceBank.reputation,
        state.config,
      );

      verifyParity(state, ledger, { coins: multipliedIncome, reputation: 0 });
    });

    it('income at reputation=0: no scaling, ledger matches', () => {
      const state = setupMainStreetGame({ seed: 'ledger-income-zero-rep' });
      state.resourceBank.reputation = 0;

      const biz = state.decks.business[0];
      state.streetGrid.fill(null);
      state.streetGrid[0] = { ...biz, baseIncome: 10, synergyTypes: [] };

      const ledger = ledgerFromState(state);
      const coinsBefore = state.resourceBank.coins;

      applyIncome(state);

      const expectedDelta = state.resourceBank.coins - coinsBefore;
      verifyParity(state, ledger, { coins: expectedDelta, reputation: 0 });
    });
  });

  describe('Event resolution parity', () => {
    it('resolveEvent (All, positive): ledger matches state', () => {
      const state = setupMainStreetGame({ seed: 'ledger-event-positive' });
      state.resourceBank.reputation = 10; // give some reputation for multiplier

      const ledger = ledgerFromState(state);
      const coinsBefore = state.resourceBank.coins;
      const repBefore = state.resourceBank.reputation;

      const event: EventCard = {
        family: 'event',
        id: 'evt-test-positive',
        name: 'Test Festival',
        trigger: 'Incident',
        effect: '+5 coins',
        target: 'All',
        coinDelta: 5,
        reputationDelta: 2,
        cost: 0,
      };

      resolveEvent(state, event);

      verifyParity(state, ledger, {
        coins: state.resourceBank.coins - coinsBefore,
        reputation: state.resourceBank.reputation - repBefore,
      });
    });

    it('resolveEvent (All, negative penalty): ledger matches state', () => {
      const state = setupMainStreetGame({ seed: 'ledger-event-negative' });
      state.resourceBank.reputation = 20; // high rep should NOT scale penalties

      const ledger = ledgerFromState(state);
      const coinsBefore = state.resourceBank.coins;
      const repBefore = state.resourceBank.reputation;

      const event: EventCard = {
        family: 'event',
        id: 'evt-test-negative',
        name: 'Test Robbery',
        trigger: 'Incident',
        effect: '-3 coins',
        target: 'All',
        coinDelta: -3,
        reputationDelta: -1,
        cost: 0,
      };

      resolveEvent(state, event);

      verifyParity(state, ledger, {
        coins: state.resourceBank.coins - coinsBefore,
        reputation: state.resourceBank.reputation - repBefore,
      });
    });

    it('playHeldEvent: ledger matches state after playing held investment', () => {
      const state = setupMainStreetGame({ seed: 'ledger-play-held' });
      state.resourceBank.reputation = 5;

      // Give the player a held event
      const event: EventCard = {
        family: 'event',
        id: 'evt-held-test',
        name: 'Held Investment',
        trigger: 'Investment',
        effect: '+3 coins, +1 rep',
        target: 'All',
        coinDelta: 3,
        reputationDelta: 1,
        cost: 0,
      };
      state.heldEvent = event;

      const ledger = ledgerFromState(state);
      const coinsBefore = state.resourceBank.coins;
      const repBefore = state.resourceBank.reputation;

      playHeldEvent(state);

      verifyParity(state, ledger, {
        coins: state.resourceBank.coins - coinsBefore,
        reputation: state.resourceBank.reputation - repBefore,
      });
    });
  });

  describe('Full turn parity', () => {
    it('executeDayStart + processEndOfTurn: ledger matches full turn economy', () => {
      const state = setupMainStreetGame({ seed: 'ledger-full-turn' });

      // Place a business for income
      const biz = state.decks.business[0];
      state.streetGrid.fill(null);
      state.streetGrid[0] = { ...biz };

      const ledger = ledgerFromState(state);
      const coinsBefore = state.resourceBank.coins;
      const repBefore = state.resourceBank.reputation;

      executeDayStart(state);
      processEndOfTurn(state);

      verifyParity(state, ledger, {
        coins: state.resourceBank.coins - coinsBefore,
        reputation: state.resourceBank.reputation - repBefore,
      });
    });

    it('multi-turn economy parity: 3 consecutive turns', () => {
      const state = setupMainStreetGame({ seed: 'ledger-multi-turn' });

      // Place businesses for income
      state.streetGrid.fill(null);
      state.streetGrid[0] = { ...state.decks.business[0] };
      state.streetGrid[1] = { ...state.decks.business[1] };

      const ledger = ledgerFromState(state);

      for (let turn = 0; turn < 3; turn++) {
        const coinsBefore = state.resourceBank.coins;
        const repBefore = state.resourceBank.reputation;

        executeDayStart(state);
        processEndOfTurn(state);

        ledger.apply({
          coins: state.resourceBank.coins - coinsBefore,
          reputation: state.resourceBank.reputation - repBefore,
        });

        expect(ledger.get('coins')).toBe(state.resourceBank.coins);
        expect(ledger.get('reputation')).toBe(state.resourceBank.reputation);
      }
    });
  });

  describe('Score computation parity', () => {
    it('ledger score matches Main Street computeScore formula', () => {
      const state = setupMainStreetGame({ seed: 'ledger-score' });
      const ledger = createLedger({
        coins: state.resourceBank.coins,
        reputation: state.resourceBank.reputation,
      });

      // Main Street score: coins + (reputation * reputationScoreMultiplier) + (challengesCompleted * challengeBonusPoints)
      const expectedScore =
        state.resourceBank.coins +
        state.resourceBank.reputation * state.config.reputationScoreMultiplier +
        state.challengesCompleted.length * state.config.challengeBonusPoints;

      ledger.setScore(expectedScore);
      expect(ledger.get('score')).toBe(expectedScore);
    });

    it('score updates correctly after resource changes', () => {
      const state = setupMainStreetGame({ seed: 'ledger-score-update' });

      // Place a business and run a turn
      state.streetGrid.fill(null);
      state.streetGrid[0] = { ...state.decks.business[0] };
      executeDayStart(state);
      processEndOfTurn(state);

      // Compute score the Main Street way
      const expectedScore =
        state.resourceBank.coins +
        state.resourceBank.reputation * state.config.reputationScoreMultiplier;

      const ledger = createLedger({
        coins: state.resourceBank.coins,
        reputation: state.resourceBank.reputation,
      });
      ledger.setScore(expectedScore);

      expect(ledger.get('score')).toBe(expectedScore);
    });

    it('ledger.setScore matches actual computeScore() function output', () => {
      const state = setupMainStreetGame({ seed: 'ledger-computeScore-direct' });

      // Place businesses and run a few turns to get interesting state
      state.streetGrid.fill(null);
      state.streetGrid[0] = { ...state.decks.business[0] };
      state.streetGrid[1] = { ...state.decks.business[1] };
      executeDayStart(state);
      processEndOfTurn(state);
      executeDayStart(state);
      processEndOfTurn(state);

      // Call the actual computeScore function
      const actualScore = computeScore(state);

      // Set ledger score to the same value and verify
      const ledger = createLedger({
        coins: state.resourceBank.coins,
        reputation: state.resourceBank.reputation,
        score: 0,
      });
      ledger.setScore(actualScore);

      expect(ledger.get('score')).toBe(actualScore);
      expect(ledger.get('score')).toBe(state.resourceBank.coins + state.resourceBank.reputation * state.config.reputationScoreMultiplier + state.challengesCompleted.length * state.config.challengeBonusPoints);
    });
  });

  describe('Negative economy integration (bankruptcy / reputation collapse scenarios)', () => {
    it('coins driven negative via event resolution — ledger tracks bankruptcy state', () => {
      const state = setupMainStreetGame({ seed: 'ledger-bankruptcy' });
      state.resourceBank.coins = 2; // low coins so a big penalty drives them negative
      state.resourceBank.reputation = 5;

      const ledger = createLedger({
        coins: state.resourceBank.coins,
        reputation: state.resourceBank.reputation,
      });
      const coinsBefore = state.resourceBank.coins;

      // Resolve a large negative event
      const event: EventCard = {
        family: 'event',
        id: 'evt-bankruptcy',
        name: 'Market Crash',
        trigger: 'Incident',
        effect: '-20 coins',
        target: 'All',
        coinDelta: -20,
        reputationDelta: 0,
        cost: 0,
      };

      resolveEvent(state, event);

      const coinsDelta = state.resourceBank.coins - coinsBefore;
      ledger.apply({ coins: coinsDelta, reputation: 0 });

      // Verify ledger matches state (coins now negative)
      expect(ledger.get('coins')).toBe(state.resourceBank.coins);
      expect(ledger.get('coins')).toBeLessThan(0);
      // Ledger allows negative (bankruptcy is engine-level check)
      expect(ledger.canApply({ coins: -1 })).toBe(true);
    });

    it('reputation driven negative via event resolution — ledger tracks collapse state', () => {
      const state = setupMainStreetGame({ seed: 'ledger-rep-collapse' });
      state.resourceBank.coins = 10;
      state.resourceBank.reputation = 2; // low reputation
      state.turn = 3; // past turn 1 so collapse would trigger

      const ledger = createLedger({
        coins: state.resourceBank.coins,
        reputation: state.resourceBank.reputation,
      });
      const repBefore = state.resourceBank.reputation;

      // Resolve a large negative reputation event
      const event: EventCard = {
        family: 'event',
        id: 'evt-rep-collapse',
        name: 'Public Scandal',
        trigger: 'Incident',
        effect: '-10 reputation',
        target: 'All',
        coinDelta: 0,
        reputationDelta: -10,
        cost: 0,
      };

      resolveEvent(state, event);

      const repDelta = state.resourceBank.reputation - repBefore;
      ledger.apply({ coins: 0, reputation: repDelta });

      // Verify ledger matches state (reputation now negative)
      expect(ledger.get('reputation')).toBe(state.resourceBank.reputation);
      expect(ledger.get('reputation')).toBeLessThan(0);
      // Ledger allows negative (collapse is engine-level check)
      expect(ledger.canApply({ reputation: -1 })).toBe(true);
    });

    it('both coins and reputation negative simultaneously via event resolution', () => {
      const state = setupMainStreetGame({ seed: 'ledger-double-negative' });
      state.resourceBank.coins = 3;
      state.resourceBank.reputation = 2;
      state.turn = 3;

      const ledger = createLedger({
        coins: state.resourceBank.coins,
        reputation: state.resourceBank.reputation,
      });
      const coinsBefore = state.resourceBank.coins;
      const repBefore = state.resourceBank.reputation;

      // Resolve an event that hits both resources hard
      const event: EventCard = {
        family: 'event',
        id: 'evt-double-hit',
        name: 'Catastrophic Failure',
        trigger: 'Incident',
        effect: '-15 coins, -8 reputation',
        target: 'All',
        coinDelta: -15,
        reputationDelta: -8,
        cost: 0,
      };

      resolveEvent(state, event);

      const coinsDelta = state.resourceBank.coins - coinsBefore;
      const repDelta = state.resourceBank.reputation - repBefore;
      ledger.apply({ coins: coinsDelta, reputation: repDelta });

      // Verify both resources are negative and match state
      expect(ledger.get('coins')).toBe(state.resourceBank.coins);
      expect(ledger.get('reputation')).toBe(state.resourceBank.reputation);
      expect(ledger.get('coins')).toBeLessThan(0);
      expect(ledger.get('reputation')).toBeLessThan(0);
      // Ledger permits both negative simultaneously
      expect(ledger.canApply({ coins: -1, reputation: -1 })).toBe(true);
    });
  });
});

// ── Test Matrix Summary ─────────────────────────────────────
//
// The following table maps test cases to ledger behaviors:
//
// | Test Group                  | Behavior Tested                          | AC Coverage |
// |----------------------------|------------------------------------------|-------------|
// | get — defaults             | get returns 0 for unconfigured resources | AC-1        |
// | get — configured           | get returns initial values               | AC-1        |
// | get — after mutations      | get reflects applied deltas              | AC-1        |
// | snapshot — copy            | snapshot returns independent copy        | AC-1        |
// | snapshot — independence    | mutations after snapshot don't affect it | AC-2        |
// | canApply — unconstrained   | always true (Main St baseline)           | AC-1, AC-2  |
// | canApply — with constraints| minCoins/minReputation guards            | AC-1        |
// | apply — positive/negative  | additive delta application               | AC-1        |
// | apply — negative allowed   | coins/rep can go below zero              | AC-2        |
// | apply — multiple resources | combined delta in single call            | AC-1        |
// | apply — selective          | only specified fields change             | AC-1        |
// | setScore — absolute        | score set to explicit value              | AC-1        |
// | Invariant — no underflow   | no guards prevent negative balance       | AC-2        |
// | Invariant — deterministic  | sequential apply is reproducible         | AC-2        |
// | Invariant — additive       | purely additive, no clamping             | AC-2        |
// | Invariant — independence   | resources don't affect each other        | AC-2        |
// | Integration — purchase     | business/upgrade/event purchase parity   | AC-3        |
// | Integration — income       | income with rep multiplier parity        | AC-3        |
// | Integration — events       | event resolution (pos/neg) parity        | AC-3        |
// | Integration — full turn    | full turn cycle parity                   | AC-3        |
// | Integration — multi-turn   | 3 consecutive turns parity               | AC-3        |
// | Integration — score        | score formula parity                     | AC-3        |
// | Integration — computeScore | direct computeScore() equivalence        | AC-3        |
// | Integration — bankruptcy   | coins driven negative via events         | AC-2, AC-3  |
// | Integration — rep collapse | reputation driven negative via events    | AC-2, AC-3  |
// | Integration — double neg   | coins + rep negative simultaneously      | AC-2, AC-3  |
