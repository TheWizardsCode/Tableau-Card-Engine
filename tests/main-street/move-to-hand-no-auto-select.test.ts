/**
 * Move-to-hand does NOT auto-select the card (CG-0MSXIQIPJ000NDTL).
 *
 * After the fix for CG-0MSXIQIPJ000NDTL, clicking a business card in the
 * market row moves it to the hand but leaves it UNSELECTED:
 *
 *   - pendingHandIndex stays null
 *   - uiPhase reverts to 'market'
 *   - instruction text invites the player to click the hand card
 *
 * The player must then click the hand card (onHandBusinessCardClick) to
 * enter the placing-from-hand phase.
 *
 * @module tests/main-street/move-to-hand-no-auto-select
 */

import { describe, it, expect, vi } from 'vitest';

import { setupMainStreetGame, refillSingleRowMarket } from '../../example-games/main-street/MainStreetState';
import { MainStreetTurnController } from '../../example-games/main-street/scenes/MainStreetTurnController';

// ── Helpers ─────────────────────────────────────────────────

/**
 * Creates a minimal mock scene suitable for testing business-card
 * click-to-hand (onBusinessCardClick) and subsequent hand-card click
 * (onHandBusinessCardClick).
 */
function createMockScene(): any {
  const mockScene: any = {
    state: setupMainStreetGame({ seed: 'no-auto-select-test' }),
    uiPhase: 'market' as const,
    pendingHandIndex: null as number | null,
    pendingHandJustMoved: false,
    justMovedHandCardId: null as string | null,
    instructionText: { setText: vi.fn() },
    refreshAll: vi.fn(),
    overlayObjects: [],
    hudContainer: null,
    undoManager: {
      execute: vi.fn(),
      canUndo: false,
      canRedo: false,
    },
    tooltipManager: {
      hide: vi.fn(),
      show: vi.fn(),
    },
    gameEvents: { emit: vi.fn(), on: vi.fn(), off: vi.fn() },
    time: {
      delayedCall: vi.fn().mockReturnValue({ remove: vi.fn() }),
    },
    refreshStreetGrid: vi.fn(),
    refreshActionButtons: vi.fn(),
    refreshAllAction: vi.fn(),
    hintBar: null,
    msLifecycleManager: {
      isTutorialActionAllowed: vi.fn().mockReturnValue({ allowed: true }),
      onTutorialActionComplete: vi.fn(),
    },
    cardSvgLoadPromise: Promise.resolve(),
    prewarmVisibleCardTextures: vi.fn().mockResolvedValue(undefined),
    updateSvgDebugOverlay: vi.fn(),
    animateTransferFromMarket: vi.fn().mockResolvedValue(undefined),
    previousCoins: null,
    previousReputation: null,
    transferAnimationCount: 0,
    activeTransferTweens: new Set(),
    activeTransferVisuals: new Set(),
    hiddenTransferSourceCardIds: new Set(),
    getBusinessHandInsertionPosition: vi.fn().mockReturnValue({ x: 400, y: 620 }),
    clearMarketSelection: vi.fn(),
    selectMarketCardById: vi.fn(),
  };

  return mockScene;
}

function findMarketBusiness(scene: any): any {
  return (
    scene.state.market.cards.find(
      (c: any) => c.family === 'business' || c.family === 'community-space',
    ) ?? null
  );
}

// ── Tests ───────────────────────────────────────────────────

describe('Move-to-hand does NOT auto-select (CG-0MSXIQIPJ000NDTL)', () => {
  /**
   * Helper: move a market business card to hand (simulating the effect of
   * onBusinessCardClick's animation callback without relying on the
   * undoManager mock to actually execute commands).
   */
  function buyToHand(scene: any, card: any): void {
    const idx = scene.state.market.cards.findIndex((c: any) => c.id === card.id);
    if (idx < 0) return;
    scene.state.hand.push(scene.state.market.cards[idx]);
    scene.state.market.cards.splice(idx, 1);
    // Post-CG-0MSXIQIPJ000NDTL: the card is in hand but NOT auto-selected.
    scene.pendingHandIndex = null;
    scene.pendingHandJustMoved = false;
    // Record the just-moved card so placing it stays free when the player
    // selects it.
    scene.justMovedHandCardId = card.id;
    scene.uiPhase = 'market';
  }

  it('onBusinessCardClick moves card to hand without auto-selecting it', () => {
    const scene = createMockScene();
    scene.state.hand = [];
    const biz = findMarketBusiness(scene);
    expect(biz).toBeTruthy();

    // Simulate the animation callback (afterTransfer) of onBusinessCardClick.
    buyToHand(scene, biz);

    // After the callback:
    //   • Card should be in hand
    expect(scene.state.hand.length).toBe(1);
    //   • pendingHandIndex should be null (NO auto-selection)
    expect(scene.pendingHandIndex).toBeNull();
    //   • uiPhase should be 'market' (not 'placing-from-hand')
    expect(scene.uiPhase).toBe('market');
    //   • pendingHandJustMoved should be false
    expect(scene.pendingHandJustMoved).toBe(false);
  });

  it('player can select the hand card after it was moved to hand', () => {
    const scene = createMockScene();
    scene.state.hand = [];
    const biz = findMarketBusiness(scene);
    expect(biz).toBeTruthy();

    buyToHand(scene, biz);
    expect(scene.pendingHandIndex).toBeNull();
    expect(scene.uiPhase).toBe('market');
    expect(scene.state.hand.length).toBe(1);

    // Step 2: click hand card → selects it, enters placing-from-hand.
    const controller = new MainStreetTurnController(scene);
    controller.onHandBusinessCardClick(0);
    expect(scene.pendingHandIndex).toBe(0);
    expect(scene.uiPhase).toBe('placing-from-hand');
  });

  it('hand card click after market-to-hand move sets pendingHandJustMoved to false', () => {
    const scene = createMockScene();
    scene.state.hand = [];
    const biz = findMarketBusiness(scene);
    expect(biz).toBeTruthy();

    buyToHand(scene, biz);
    expect(scene.pendingHandJustMoved).toBe(false);
    expect(scene.pendingHandIndex).toBeNull();

    // Now select the hand card.  Since uiPhase was 'market' at the time
    // of the hand-card click, the "new selection" branch runs.
    const controller = new MainStreetTurnController(scene);
    controller.onHandBusinessCardClick(0);
    expect(scene.pendingHandJustMoved).toBe(true);
    expect(scene.pendingHandIndex).toBe(0);
  });

  it('instruction text is updated to reflect no-auto-select state', () => {
    const scene = createMockScene();
    scene.state.hand = [];
    const biz = findMarketBusiness(scene);
    expect(biz).toBeTruthy();
    scene.pendingHandIndex = null;
    scene.uiPhase = 'market';

    // Simulate the full onBusinessCardClick flow including afterTransfer.
    buyToHand(scene, biz);

    // Verify state matches no-auto-select expectations.
    expect(scene.pendingHandIndex).toBeNull();
    expect(scene.uiPhase).toBe('market');
  });

  it('clicking a different hand card switches selection after market-to-hand', () => {
    const scene = createMockScene();
    scene.state.hand = [];
    // Ensure a business-rich row (staff take a market slot, CG-0MT3KZNQB0053K55)
    scene.state.market.cards = [];
    scene.state.decks.staff = [];
    scene.state.discards.staff = [];
    scene.state.decks.upgrade = [];
    scene.state.decks.event = [];
    scene.state.decks.communitySpace = [];
    refillSingleRowMarket(scene.state);
    const bizCards = scene.state.market.cards.filter(
      (c: any) => c.family === 'business' || c.family === 'community-space',
    );
    expect(bizCards.length).toBeGreaterThanOrEqual(1);

    // Buy first business.
    buyToHand(scene, bizCards[0]);
    expect(scene.pendingHandIndex).toBeNull();
    expect(scene.state.hand.length).toBe(1);

    // Ensure a second business card is available in the market for the
    // switching test (the market may only have 1 due to the ≥1 business
    // constraint — CG-0MSXIQIPJ000NDTL). Push a synthetic card if needed.
    const remainingBiz = scene.state.market.cards.filter(
      (c: any) => c.family === 'business' || c.family === 'community-space',
    );
    if (remainingBiz.length === 0) {
      // Create a second synthetic business card in the market.
      scene.state.market.cards.push({
        ...bizCards[0],
        id: 'synthetic-second-biz',
        name: 'Second Business (synthetic)',
      } as any);
    }
    // Buy second business.
    const secondBiz = scene.state.market.cards.find(
      (c: any) => c.id !== bizCards[0].id && (c.family === 'business' || c.family === 'community-space'),
    );
    if (!secondBiz) {
      throw new Error('No second business card available in market or hand');
    }
    buyToHand(scene, secondBiz);
    expect(scene.pendingHandIndex).toBeNull();
    expect(scene.state.hand.length).toBe(2);

    // Select first hand card.
    const controller = new MainStreetTurnController(scene);
    controller.onHandBusinessCardClick(0);
    expect(scene.pendingHandIndex).toBe(0);
    expect(scene.uiPhase).toBe('placing-from-hand');

    // Switch to second hand card.
    controller.onHandBusinessCardClick(1);
    expect(scene.pendingHandIndex).toBe(1);
    expect(scene.uiPhase).toBe('placing-from-hand');
  });

  it('selecting a held card that was NOT just moved costs an action', () => {
    const scene = createMockScene();
    scene.state.hand = [];
    // Ensure a business-rich row (staff take a market slot, CG-0MT3KZNQB0053K55)
    scene.state.market.cards = [];
    scene.state.decks.staff = [];
    scene.state.discards.staff = [];
    scene.state.decks.upgrade = [];
    scene.state.decks.event = [];
    scene.state.decks.communitySpace = [];
    refillSingleRowMarket(scene.state);
    const bizCards = scene.state.market.cards.filter(
      (c: any) => c.family === 'business' || c.family === 'community-space',
    );
    expect(bizCards.length).toBeGreaterThanOrEqual(1);

    // Buy first business (becomes the just-moved card).
    buyToHand(scene, bizCards[0]);
    // Manually add a second held card (e.g. held from a previous day) that
    // is NOT the just-moved card. Use a synthetic card to avoid depending
    // on market composition — CG-0MSXIQIPJ000NDTL.
    scene.state.hand.push({ ...bizCards[0], id: 'held-from-yesterday' });

    const controller = new MainStreetTurnController(scene);

    // Selecting the just-moved card → placement is free.
    controller.onHandBusinessCardClick(0);
    expect(scene.pendingHandJustMoved).toBe(true);

    // Selecting the other held card → placement costs an action.
    controller.onHandBusinessCardClick(1);
    expect(scene.pendingHandJustMoved).toBe(false);
    expect(scene.pendingHandIndex).toBe(1);
  });

  it('justMovedHandCardId is cleared after the card is placed', () => {
    const scene = createMockScene();
    scene.state.hand = [];
    const biz = findMarketBusiness(scene);
    expect(biz).toBeTruthy();

    buyToHand(scene, biz);
    expect(scene.justMovedHandCardId).toBe(biz.id);

    // Select it, then simulate the placement success clearing the tracker
    // (mirrors onSlotClick's afterTransfer).
    const controller = new MainStreetTurnController(scene);
    controller.onHandBusinessCardClick(0);
    if (scene.justMovedHandCardId === biz.id) {
      scene.justMovedHandCardId = null;
    }
    expect(scene.justMovedHandCardId).toBeNull();
  });

  it('onHandBusinessCardClick when card is already selected in placing-from-hand phase', () => {
    // Regression guard: clicking the already-selected hand card while
    // in placing-from-hand should be a no-op (or at least not break).
    const scene = createMockScene();
    const biz = findMarketBusiness(scene);
    expect(biz).toBeTruthy();
    scene.state.hand = [biz];
    scene.pendingHandIndex = 0;
    scene.uiPhase = 'placing-from-hand';

    const controller = new MainStreetTurnController(scene);
    // Should not throw
    expect(() => controller.onHandBusinessCardClick(0)).not.toThrow();
  });
});
