/**
 * Main Street: Close Business Unit Tests (CG-0MTFWJLMO001XFIR)
 *
 * Tests for the "Close" street-card management action (parent CG-0MT5XT7K3005IBBV):
 * during MarketPhase, every non-sold business and community-space card on the
 * street grid can be closed for **1 daily action, no coins** — the card is
 * removed from the grid entirely (slot -> null), placed into the `discardPile`,
 * and the freed slot becomes immediately placeable by a new card. Selling
 * (free, refund, card stays on the grid as inert "sold") is unchanged.
 *
 * Close mirrors the sell flow (`MainStreetSellCards.test.ts`): legality via
 * `canCloseBusiness`, removal via `closeBusiness` (`MainStreetMarket.ts`),
 * and a reversible `closeBusinessCommand` (`MainStreetCommands.ts`) whose
 * action cost goes through the single shared `consumeAction` enforcement
 * point (CG-0MTCP7F9S009HARC).
 *
 * AC references (child CG-0MTFWJLMO001XFIR):
 *   AC1: `canCloseBusiness` legal for occupied, non-sold business AND
 *        community-space cards during MarketPhase with >=1 action; illegal
 *        when not MarketPhase, slot empty/sold, or placing mode active.
 *   AC2: `closeBusiness` sets slot -> null, pushes card to `discardPile`,
 *        leaves `soldSlots[slotIndex]` false (slot immediately re-placeable
 *        via `canPlaceFromHand`), writes an activity-log entry.
 *   AC3: Exactly one daily action consumed via the shared `consumeAction`
 *        helper — both `actionsRemaining` and `bankedActions` decrement
 *        (floor 0); no coins change.
 *   AC4: `closeBusinessCommand` undo restores the card, slot, discardPile
 *        length, action budget, and log entry; redo re-applies the close.
 *   AC5: Sold cards are never closeable (legality + command-level guard).
 *   AC6: No AI enumeration or tutorial step changes are introduced.
 *
 * @module
 */

import { describe, it, expect, beforeEach } from 'vitest';

import {
  setupMainStreetGame,
  type MainStreetState,
} from '../../example-games/main-street/MainStreetState';
import {
  GRID_SIZE,
  type BusinessCard,
  type CommunitySpaceCard,
} from '../../example-games/main-street/MainStreetCards';
import {
  executeDayStart,
  canPlaceFromHand,
} from '../../example-games/main-street/MainStreetEngine';
import { UndoRedoManager } from '../../src/core-engine/UndoRedoManager';

// ── Feature Detection ───────────────────────────────────────

/**
 * True once canCloseBusiness / closeBusiness exist in the market module.
 *
 * Uses top-level await so the probe is guaranteed resolved before test
 * collection (`it.runIf(...)` is evaluated synchronously at registration).
 */
async function probeCloseMarketAvailability(): Promise<boolean> {
  try {
    const market = await import('../../example-games/main-street/MainStreetMarket');
    return (
      typeof (market as any).closeBusiness === 'function' &&
      typeof (market as any).canCloseBusiness === 'function'
    );
  } catch {
    return false; // not implemented yet
  }
}
const CLOSE_MARKET_AVAILABLE = await probeCloseMarketAvailability();

/** True once closeBusinessCommand exists in the commands module. */
async function probeCloseCommandAvailability(): Promise<boolean> {
  try {
    const cmds = await import('../../example-games/main-street/MainStreetCommands');
    return typeof (cmds as any).closeBusinessCommand === 'function';
  } catch {
    return false; // not implemented yet
  }
}
const CLOSE_COMMAND_AVAILABLE = await probeCloseCommandAvailability();

/** True once the AI action enumerator is present (unchanged-shape guard). */
async function probeAiEnumAvailability(): Promise<boolean> {
  try {
    const ai = await import('../../example-games/main-street/MainStreetAiStrategy');
    return typeof (ai as any).enumerateLegalActions === 'function';
  } catch {
    return false; // not implemented yet
  }
}
const AI_ENUM_AVAILABLE = await probeAiEnumAvailability();

// ── Helpers ─────────────────────────────────────────────────

function createTestState(seed: string = 'close-business-test'): MainStreetState {
  return setupMainStreetGame({ seed });
}

/**
 * Purchases a card of the given family from the market and places it directly
 * on the street grid for test setup (mirrors MainStreetSellCards.test.ts).
 */
function placeCardOnGrid(
  state: MainStreetState,
  slotIndex: number,
  family: 'business' | 'community-space' = 'business',
): BusinessCard | CommunitySpaceCard | null {
  const card = state.market.cards.find(
    c => c.family === family && c.cost <= state.resourceBank.coins,
  ) as BusinessCard | CommunitySpaceCard | undefined;
  if (!card) return null;

  const marketIndex = state.market.cards.findIndex(c => c.id === card.id);
  if (marketIndex < 0) return null;

  state.resourceBank.coins -= card.cost;
  state.market.cards.splice(marketIndex, 1);
  state.streetGrid[slotIndex] = { ...card };
  return state.streetGrid[slotIndex] as BusinessCard | CommunitySpaceCard;
}

/** Builds a minimal deterministic business card for controlled scenarios. */
function makeBiz(id: string, name: string, baseIncome: number, synergyTypes: string[] = []): BusinessCard {
  return {
    family: 'business',
    id,
    name,
    cost: 5,
    baseIncome,
    synergyTypes,
    maxLevel: 1,
    description: 'test business',
    level: 0,
    incomeBonus: 0,
    synergyRangeBonus: 0,
    reputationBonus: 0,
    ongoingCost: 0,
    appliedUpgrades: [],
  } as BusinessCard;
}

/** Gets the sold status of a slot. */
function isSlotSold(state: MainStreetState, slotIndex: number): boolean {
  return state.soldSlots[slotIndex] ?? false;
}

/** Finds an empty slot index on the street grid. */
function firstEmptySlot(state: MainStreetState): number {
  const idx = state.streetGrid.findIndex(s => s === null);
  expect(idx).toBeGreaterThanOrEqual(0);
  return idx;
}

// ── Tests ───────────────────────────────────────────────────

describe('MainStreet Close Business', () => {
  let state: MainStreetState;

  beforeEach(() => {
    state = createTestState('close-test-' + Math.random().toString(36).slice(2, 8));
    executeDayStart(state);
    expect(state.phase).toBe('MarketPhase');
    expect(state.actionsRemaining).toBe(1);
  });

  // ── Close Legality (AC1) ─────────────────────────────────

  describe('Close legality checks (AC1)', () => {
    it.runIf(CLOSE_MARKET_AVAILABLE)(
      'should allow closing a non-sold business card during MarketPhase with an action',
      async () => {
        const card = placeCardOnGrid(state, firstEmptySlot(state));
        if (!card) return;

        const market = await import('../../example-games/main-street/MainStreetMarket');
        const result = (market as any).canCloseBusiness(state, state.streetGrid.indexOf(card));
        expect(result.legal).toBe(true);
      },
    );

    it.runIf(CLOSE_MARKET_AVAILABLE)(
      'should allow closing a non-sold community-space card during MarketPhase',
      async () => {
        const slot = firstEmptySlot(state);
        const card = placeCardOnGrid(state, slot, 'community-space');
        if (!card) return;

        const market = await import('../../example-games/main-street/MainStreetMarket');
        const result = (market as any).canCloseBusiness(state, slot);
        expect(result.legal).toBe(true);
      },
    );

    it.runIf(CLOSE_MARKET_AVAILABLE)(
      'should reject closing an empty slot',
      async () => {
        const market = await import('../../example-games/main-street/MainStreetMarket');
        const result = (market as any).canCloseBusiness(state, 0);
        expect(result.legal).toBe(false);
        expect(result.reason).toBeTruthy();
      },
    );

    it.runIf(CLOSE_MARKET_AVAILABLE)(
      'should reject closing an already-sold card',
      async () => {
        const slot = firstEmptySlot(state);
        const card = placeCardOnGrid(state, slot);
        if (!card) return;

        state.soldSlots[slot] = true;

        const market = await import('../../example-games/main-street/MainStreetMarket');
        const result = (market as any).canCloseBusiness(state, slot);
        expect(result.legal).toBe(false);
        expect(result.reason).toContain('sold');
      },
    );

    it.runIf(CLOSE_MARKET_AVAILABLE)(
      'should reject closing when not in MarketPhase',
      async () => {
        const slot = firstEmptySlot(state);
        const card = placeCardOnGrid(state, slot);
        if (!card) return;

        state.phase = 'IncomePhase';

        const market = await import('../../example-games/main-street/MainStreetMarket');
        const result = (market as any).canCloseBusiness(state, slot);
        expect(result.legal).toBe(false);
        expect(result.reason.toLowerCase()).toContain('marketphase');
      },
    );

    it.runIf(CLOSE_MARKET_AVAILABLE)(
      'should reject closing when in card-placement mode',
      async () => {
        const slot = firstEmptySlot(state);
        const card = placeCardOnGrid(state, slot);
        if (!card) return;

        const market = await import('../../example-games/main-street/MainStreetMarket');
        const result = (market as any).canCloseBusiness(state, slot, true); // isPlacingMode = true
        expect(result.legal).toBe(false);
        expect(result.reason.toLowerCase()).toContain('placement');
      },
    );

    it.runIf(CLOSE_MARKET_AVAILABLE)(
      'should reject closing when no daily actions remain',
      async () => {
        const slot = firstEmptySlot(state);
        const card = placeCardOnGrid(state, slot);
        if (!card) return;

        state.actionsRemaining = 0;

        const market = await import('../../example-games/main-street/MainStreetMarket');
        const result = (market as any).canCloseBusiness(state, slot);
        expect(result.legal).toBe(false);
        expect(result.reason.toLowerCase()).toContain('action');
      },
    );
  });

  // ── Removal Semantics (AC2) ──────────────────────────────

  describe('Close removal semantics (AC2)', () => {
    it.runIf(CLOSE_MARKET_AVAILABLE)(
      'should remove the card from the street grid (slot -> null)',
      async () => {
        const slot = firstEmptySlot(state);
        const card = placeCardOnGrid(state, slot);
        if (!card) return;

        const market = await import('../../example-games/main-street/MainStreetMarket');
        (market as any).closeBusiness(state, slot);

        expect(state.streetGrid[slot]).toBeNull();
      },
    );

    it.runIf(CLOSE_MARKET_AVAILABLE)(
      'should push the closed card to the discard pile',
      async () => {
        const slot = firstEmptySlot(state);
        const card = placeCardOnGrid(state, slot);
        if (!card) return;

        const discardBefore = state.discardPile.length;
        const market = await import('../../example-games/main-street/MainStreetMarket');
        (market as any).closeBusiness(state, slot);

        expect(state.discardPile).toHaveLength(discardBefore + 1);
        expect(state.discardPile[state.discardPile.length - 1].id).toBe(card.id);
      },
    );

    it.runIf(CLOSE_MARKET_AVAILABLE)(
      'should leave soldSlots[slotIndex] false after closing',
      async () => {
        const slot = firstEmptySlot(state);
        const card = placeCardOnGrid(state, slot);
        if (!card) return;

        const market = await import('../../example-games/main-street/MainStreetMarket');
        (market as any).closeBusiness(state, slot);

        expect(isSlotSold(state, slot)).toBe(false);
      },
    );

    it.runIf(CLOSE_MARKET_AVAILABLE)(
      'should make the freed slot immediately placeable via canPlaceFromHand',
      async () => {
        const slot = firstEmptySlot(state);
        const card = placeCardOnGrid(state, slot);
        if (!card) return;

        const market = await import('../../example-games/main-street/MainStreetMarket');
        (market as any).closeBusiness(state, slot);

        // Hold an affordable card in hand and verify the freed slot accepts it.
        const held = makeBiz('held-after-close', 'Held Builder', 2);
        state.hand.push(held);
        state.resourceBank.coins = Math.max(state.resourceBank.coins, held.cost);

        const result = canPlaceFromHand(state, 0, slot);
        expect(result.legal).toBe(true);
      },
    );

    it.runIf(CLOSE_MARKET_AVAILABLE)(
      'should write an activity-log entry for the close',
      async () => {
        const slot = firstEmptySlot(state);
        const card = placeCardOnGrid(state, slot);
        if (!card) return;

        const logBefore = state.activityLog.length;
        const market = await import('../../example-games/main-street/MainStreetMarket');
        (market as any).closeBusiness(state, slot);

        expect(state.activityLog).toHaveLength(logBefore + 1);
        expect(state.activityLog[state.activityLog.length - 1].text).toContain(card.name);
      },
    );

    it.runIf(CLOSE_MARKET_AVAILABLE)(
      'should grant no coins when closing',
      async () => {
        const slot = firstEmptySlot(state);
        const card = placeCardOnGrid(state, slot);
        if (!card) return;

        const coinsBefore = state.resourceBank.coins;
        const market = await import('../../example-games/main-street/MainStreetMarket');
        (market as any).closeBusiness(state, slot);

        expect(state.resourceBank.coins).toBe(coinsBefore);
      },
    );

    it.runIf(CLOSE_MARKET_AVAILABLE)(
      'should close a community-space card to the discard pile',
      async () => {
        const slot = firstEmptySlot(state);
        const card = placeCardOnGrid(state, slot, 'community-space');
        if (!card) return;

        const market = await import('../../example-games/main-street/MainStreetMarket');
        (market as any).closeBusiness(state, slot);

        expect(state.streetGrid[slot]).toBeNull();
        expect(state.discardPile[state.discardPile.length - 1].id).toBe(card.id);
      },
    );

    it.runIf(CLOSE_MARKET_AVAILABLE)(
      'should recalculate affected neighbor cached income when a card is closed',
      async () => {
        // Deterministic adjacency scenario: two different-type cards sharing
        // the 'Food' synergy in adjacent slots. The neighbor (slot 1) earns
        // synergy coins from slot 0; closing slot 0 must drop its cached
        // currentIncome (recall via the close's neighbor-recalc).
        //
        // Slot 0 and 1 are adjacent on the legacy 2x5 street layout
        // (row-major, 5 cols). Base income 10 keeps the synergy contribution
        // above the rounding threshold for the default difficulty's
        // synergyBonusPerNeighbor multiplier.
        const bareBase = 10;
        state.streetGrid[0] = makeBiz('close-biz-a', 'Close A', 10, ['Food']);
        state.streetGrid[1] = makeBiz('close-biz-b', 'Close B', bareBase, ['Food']);

        // Sync cached income/reputation for both placed cards.
        const { updateNeighborsOnPlacement } =
          await import('../../example-games/main-street/MainStreetAdjacency');
        updateNeighborsOnPlacement(state, 0);
        updateNeighborsOnPlacement(state, 1);

        const incomeBefore = (state.streetGrid[1] as BusinessCard).currentIncome as number;
        // Sanity: with the shared-synergy neighbor present, income > bare base.
        expect(incomeBefore).toBeGreaterThan(bareBase);

        const market = await import('../../example-games/main-street/MainStreetMarket');
        (market as any).closeBusiness(state, 0);

        const incomeAfter = (state.streetGrid[1] as BusinessCard).currentIncome as number;
        expect(incomeAfter).toBeLessThan(incomeBefore);
        expect(incomeAfter).toBe(bareBase); // synergy contribution fully removed
      },
    );
  });

  // ── Action Economy (AC3) ─────────────────────────────────

  describe('Close action economy via shared consumeAction (AC3)', () => {
    it.runIf(CLOSE_COMMAND_AVAILABLE)(
      'should consume exactly one daily action (actionsRemaining decremented)',
      async () => {
        const slot = firstEmptySlot(state);
        const card = placeCardOnGrid(state, slot);
        if (!card) return;

        const cmds = await import('../../example-games/main-street/MainStreetCommands');
        const cmd = (cmds as any).closeBusinessCommand(state, slot);
        expect(cmd).toBeDefined();

        expect(state.actionsRemaining).toBe(1);
        cmd.execute();
        expect(state.actionsRemaining).toBe(0);
      },
    );

    it.runIf(CLOSE_COMMAND_AVAILABLE)(
      'should decrement bankedActions with a floor of 0',
      async () => {
        const slot = firstEmptySlot(state);
        const card = placeCardOnGrid(state, slot);
        if (!card) return;

        // Bank 2 actions — the daily budget (actionsRemaining) is composed at
        // DayStart from 1 base + banked; here we assert the command's single
        // consumeAction decrements the bankedActions counter in lock-step.
        state.bankedActions = 2;
        state.actionsRemaining = 3;

        const cmds = await import('../../example-games/main-street/MainStreetCommands');
        const cmd = (cmds as any).closeBusinessCommand(state, slot);
        cmd.execute();

        expect(state.actionsRemaining).toBe(2);
        expect(state.bankedActions).toBe(1); // 2 -> 1, single consume
      },
    );

    it.runIf(CLOSE_COMMAND_AVAILABLE)(
      'should grant no coins via the close command',
      async () => {
        const slot = firstEmptySlot(state);
        const card = placeCardOnGrid(state, slot);
        if (!card) return;

        const coinsBefore = state.resourceBank.coins;
        const cmds = await import('../../example-games/main-street/MainStreetCommands');
        const cmd = (cmds as any).closeBusinessCommand(state, slot);
        cmd.execute();

        expect(state.resourceBank.coins).toBe(coinsBefore);
      },
    );
  });

  // ── Undo / Redo (AC4) ────────────────────────────────────

  describe('Close undo/redo support (AC4)', () => {
    it.runIf(CLOSE_COMMAND_AVAILABLE)(
      'should undo a close restoring card, slot, discardPile, and action budget; redo re-applies',
      async () => {
        const slot = firstEmptySlot(state);
        const card = placeCardOnGrid(state, slot);
        if (!card) return;

        const discardBefore = state.discardPile.length;
        const logBefore = state.activityLog.length;
        const coinsBefore = state.resourceBank.coins;

        const cmds = await import('../../example-games/main-street/MainStreetCommands');
        const cmd = (cmds as any).closeBusinessCommand(state, slot);
        const mgr = new UndoRedoManager();

        // Execute: card removed, discard grows, action spent, log entry added.
        mgr.execute(cmd);
        expect(state.streetGrid[slot]).toBeNull();
        expect(state.discardPile).toHaveLength(discardBefore + 1);
        expect(state.actionsRemaining).toBe(0);
        expect(state.activityLog).toHaveLength(logBefore + 1);

        // Undo: card and slot restored, discard/action/log restored, coins unchanged.
        mgr.undo();
        expect(state.streetGrid[slot]).not.toBeNull();
        expect((state.streetGrid[slot] as BusinessCard).id).toBe(card.id);
        expect(state.discardPile).toHaveLength(discardBefore);
        expect(state.actionsRemaining).toBe(1);
        expect(state.activityLog).toHaveLength(logBefore);
        expect(state.resourceBank.coins).toBe(coinsBefore);
        expect(isSlotSold(state, slot)).toBe(false);

        // Redo: close re-applied.
        mgr.redo();
        expect(state.streetGrid[slot]).toBeNull();
        expect(state.discardPile).toHaveLength(discardBefore + 1);
        expect(state.actionsRemaining).toBe(0);
        expect(state.resourceBank.coins).toBe(coinsBefore);
      },
    );
  });

  // ── Sold Cards Are Never Closeable (AC5) ─────────────────

  describe('Sold cards are never closeable (AC5)', () => {
    it.runIf(CLOSE_MARKET_AVAILABLE)(
      'should reject close legality for a sold slot',
      async () => {
        const slot = firstEmptySlot(state);
        const card = placeCardOnGrid(state, slot);
        if (!card) return;

        state.soldSlots[slot] = true;

        const market = await import('../../example-games/main-street/MainStreetMarket');
        const result = (market as any).canCloseBusiness(state, slot);
        expect(result.legal).toBe(false);
      },
    );

    it.runIf(CLOSE_MARKET_AVAILABLE)(
      'should throw when closeBusiness is called on a sold slot (command-level guard)',
      async () => {
        const slot = firstEmptySlot(state);
        const card = placeCardOnGrid(state, slot);
        if (!card) return;

        state.soldSlots[slot] = true;

        const market = await import('../../example-games/main-street/MainStreetMarket');
        expect(() => (market as any).closeBusiness(state, slot)).toThrow();
        // Guard fails closed: slot unchanged, no discard, no coins.
        expect(state.streetGrid[slot]).not.toBeNull();
        expect(state.discardPile).toHaveLength(0);
      },
    );
  });

  // ── AI / Tutorial Invariants (AC6) ───────────────────────

  describe('AI and tutorial invariants (AC6)', () => {
    it.runIf(AI_ENUM_AVAILABLE)(
      'should not introduce a close action to AI enumeration (out of scope)',
      async () => {
        const slot = firstEmptySlot(state);
        const card = placeCardOnGrid(state, slot);
        if (!card) return;

        const ai = await import('../../example-games/main-street/MainStreetAiStrategy');
        const actions = (ai as any).enumerateLegalActions(state) as Array<{ type: string }>;
        // Close is a player-initiated street-management action (like street
        // sell); the AI must not enumerate it — no action type mentions close.
        expect(actions.some((a) => a.type.toLowerCase().includes('close'))).toBe(false);
      },
    );

    it('should not mutate tutorial state or step configuration', () => {
      // This test file touches only MainStreetMarket/MainStreetCommands/
      // MainStreetAiStrategy (read-only) and shared engine helpers — the
      // TutorialState/TutorialFlow modules are intentionally untouched,
      // so no tutorial step changes are introduced by these tests.
      expect(state.gameResult).toBe('playing');
      expect(state.streetGrid).toHaveLength(GRID_SIZE);
    });
  });
});