/**
 * Main Street turn-controller composite pricing tests (CG-0MT24X0SX007RLHN).
 *
 * Verifies the controller-level same-turn buy-and-play pricing:
 *  - a just-moved (same-day) card placed with 0 actions remaining charges
 *    the +50% premium (premium replaces the missing action, no action
 *    consumed) and fires the explainer dialog;
 *  - the same placement on a Golden Mile 2-action day consumes the second
 *    action at listed cost (no dialog);
 *  - a held card (plan-ahead) keeps paying listed cost + 1 action;
 *  - the dialog cancel aborts the placement (card stays in hand, no coins
 *    deducted);
 *  - drag-drop parity: 1-action drag = premium + 1 action; GM 2-action drag
 *    = listed cost + 2 actions.
 *
 * @module tests/main-street/controller-composite-pricing
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { setupMainStreetGame } from '../../example-games/main-street/MainStreetState';
import { MainStreetTurnController } from '../../example-games/main-street/scenes/MainStreetTurnController';
import { UndoRedoManager } from '../../src/core-engine/UndoRedoManager';

/** Business card factory (matches action-economy test convention). */
function makeBiz(id: string, name: string, cost: number): any {
  return { id, name, cost, family: 'business', tier: 1 };
}

/**
 * Minimal Main Street scene mock with a real state + undo manager.
 * Supports the hand-placement composite path in onSlotClick and the
 * drag path in onDragDropBusiness.
 */
function createMockScene(overrides: Record<string, unknown> = {}): any {
  const state = setupMainStreetGame({ seed: 'controller-pricing-test' });
  const scene: any = {
    state,
    uiPhase: 'placing-from-hand',
    // Composite flow fields
    pendingHandIndex: null as number | null,
    pendingHandJustMoved: false,
    justMovedHandCardId: null as string | null,
    layout: {
      streetCols: 5,
      streetX: 60,
      streetTop: 220,
      slotW: 100,
      slotH: 64,
      slotGap: 8,
      streetRowGap: 8,
      handX: 0,
      handY: 600,
      handCardW: 80,
      handCardH: 110,
    },
    settingsPanel: { reducedMotion: false },
    msLifecycleManager: {
      isTutorialActionAllowed: vi.fn().mockReturnValue({ allowed: true }),
      onTutorialActionComplete: vi.fn(),
    },
    instructionText: { setText: vi.fn() },
    tooltipManager: { hide: vi.fn(), show: vi.fn() },
    selectMarketCardById: vi.fn(),
    clearMarketSelection: vi.fn(),
    hiddenTransferSourceCardIds: new Set(),
    refreshAll: vi.fn(),
    refreshStreetGrid: vi.fn(),
    refreshActionButtons: vi.fn(),
    gameEvents: { emit: vi.fn(), on: vi.fn(), off: vi.fn() },
    undoManager: new UndoRedoManager(),
    time: {
      delayedCall: vi.fn().mockReturnValue({ remove: vi.fn() }),
    },
    sound: {
      play: vi.fn(),
      stopByKey: vi.fn(),
      volume: 1,
      mute: false,
    },
    tweens: {
      add: vi.fn((config: any) => {
        config.onComplete?.();
        return { stop: vi.fn(), destroy: vi.fn() };
      }),
    },
    animateTransferFromMarket: vi.fn().mockResolvedValue(undefined),
    getStreetSlotCenter: vi.fn((slotIndex: number) => ({ x: 500 + slotIndex, y: 260 })),
    getBusinessHandInsertionPosition: vi.fn().mockReturnValue({ x: 400, y: 620 }),
    msRenderer: {
      handView: {
        getBasePosition: vi.fn().mockReturnValue({ x: 300, y: 610 }),
        getSpriteAt: vi.fn().mockReturnValue(null),
      },
      getMarketRowCards: vi.fn().mockReturnValue([]),
      clearDragHighlights: vi.fn(),
    },
    // Explainer dialog mock: captures callbacks for explicit invocation.
    showBuyAndPlacePremiumDialog: vi.fn((cardName: string, onProceed: () => void, onCancel: () => void) => {
      scene.premiumDialogCardName = cardName;
      scene.premiumDialogOnProceed = onProceed;
      scene.premiumDialogOnCancel = onCancel;
    }),
    premiumDialogCardName: null as string | null,
    premiumDialogOnProceed: null as (() => void) | null,
    premiumDialogOnCancel: null as (() => void) | null,
    ...overrides,
  };
  return scene;
}

/** Runs the composite hand-placement branch of onSlotClick and flushes the
 *  transfer-completion microtask (mock resolves immediately). */
async function placeFromHandComposite(scene: any, controller: MainStreetTurnController): Promise<void> {
  controller.onSlotClick(firstEmptySlot(scene.state));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

/** First empty street slot index (or -1). */
function firstEmptySlot(state: any): number {
  return state.streetGrid.findIndex((slot: any) => slot === null);
}

/** Sets up a same-day composite: one just-moved card in hand, pending
 *  tracker set, phase = placing-from-hand. */
function setupSameDayComposite(scene: any, cost = 6): any {
  const biz = makeBiz('biz-same-day', 'Same Day', cost);
  scene.state.hand = [biz];
  scene.state.market.cards = [makeBiz('biz-market', 'Market', cost)];
  scene.pendingHandIndex = 0;
  scene.pendingHandJustMoved = true;
  scene.justMovedHandCardId = biz.id;
  scene.uiPhase = 'placing-from-hand';
  return biz;
}

/** Sets up a held-card (plan-ahead) placement: card in hand since a
 *  previous day, pendingHandJustMoved false. */
function setupHeldCard(scene: any, cost = 6): any {
  const biz = makeBiz('biz-held', 'Held', cost);
  scene.state.hand = [biz];
  scene.state.market.cards = [makeBiz('biz-market', 'Market', cost)];
  scene.pendingHandIndex = 0;
  scene.pendingHandJustMoved = false;
  scene.justMovedHandCardId = null;
  scene.uiPhase = 'placing-from-hand';
  return biz;
}

describe('Composite buy-and-play pricing (CG-0MT24X0SX007RLHN)', () => {
  let controller: MainStreetTurnController;
  let scene: any;

  beforeEach(() => {
    scene = createMockScene();
    controller = new MainStreetTurnController(scene);
  });

  it('charges the +50% premium when no action remains for a same-day card', async () => {
    setupSameDayComposite(scene, 6);
    scene.state.actionsRemaining = 0; // move already consumed the day's action
    scene.state.resourceBank.coins = 100;
    const coinsBefore = scene.state.resourceBank.coins;

    await placeFromHandComposite(scene, controller);

    // Dialog fired with the card name; player proceeds.
    expect(scene.showBuyAndPlacePremiumDialog).toHaveBeenCalledTimes(1);
    expect(scene.premiumDialogCardName).toBe('Same Day');
    scene.premiumDialogOnProceed();

    const premium = Math.ceil(6 * 1.5 * 2) / 2; // 9
    expect(scene.state.resourceBank.coins).toBe(coinsBefore - premium);
    // The same-day card is now on the street.
    expect(scene.state.streetGrid.filter((slot: any) => slot !== null)).toHaveLength(1);
    expect(scene.state.streetGrid.some((slot: any) => slot?.name === 'Same Day')).toBe(true);
    expect(scene.state.hand).toHaveLength(0);
    // Premium replaces the missing action: none consumed.
    expect(scene.state.actionsRemaining).toBe(0);
    // Trackers reset on success.
    expect(scene.justMovedHandCardId).toBeNull();
    expect(scene.pendingHandIndex).toBeNull();
    expect(scene.uiPhase).toBe('market');
  });

  it('GM day: same-day placement consumes the remaining action at listed cost (no dialog)', async () => {
    setupSameDayComposite(scene, 6);
    scene.state.actionsRemaining = 1; // GM second action remains after the move
    scene.state.resourceBank.coins = 100;
    const coinsBefore = scene.state.resourceBank.coins;

    await placeFromHandComposite(scene, controller);

    // No dialog for the listed-cost GM path.
    expect(scene.showBuyAndPlacePremiumDialog).not.toHaveBeenCalled();
    // Listed cost charged, action consumed.
    expect(scene.state.resourceBank.coins).toBe(coinsBefore - 6);
    expect(scene.state.actionsRemaining).toBe(0);
    expect(scene.state.hand).toHaveLength(0);
    expect(scene.justMovedHandCardId).toBeNull();
  });

  it('held card (plan-ahead) still pays listed cost and consumes 1 action', async () => {
    setupHeldCard(scene, 6);
    scene.state.actionsRemaining = 1;
    scene.state.resourceBank.coins = 100;
    const coinsBefore = scene.state.resourceBank.coins;

    await placeFromHandComposite(scene, controller);

    // Held-card path unchanged: listed cost + 1 action, no dialog.
    expect(scene.showBuyAndPlacePremiumDialog).not.toHaveBeenCalled();
    expect(scene.state.resourceBank.coins).toBe(coinsBefore - 6);
    expect(scene.state.actionsRemaining).toBe(0);
    expect(scene.state.hand).toHaveLength(0);
    expect(scene.state.streetGrid.some((slot: any) => slot?.name === 'Held')).toBe(true);
  });

  it('dialog cancel aborts the premium placement (card stays in hand, no coins)', async () => {
    const biz = setupSameDayComposite(scene, 6);
    scene.state.actionsRemaining = 0;
    scene.state.resourceBank.coins = 100;
    const coinsBefore = scene.state.resourceBank.coins;

    await placeFromHandComposite(scene, controller);

    expect(scene.premiumDialogOnCancel).toBeTypeOf('function');
    scene.premiumDialogOnCancel();

    // Nothing deducted, card stays in hand, phase returns to market.
    expect(scene.state.resourceBank.coins).toBe(coinsBefore);
    expect(scene.state.hand).toHaveLength(1);
    // No card was placed.
    expect(scene.state.streetGrid.filter((slot: any) => slot !== null)).toHaveLength(0);
    expect(scene.uiPhase).toBe('market');
    // justMovedHandCardId preserved so a retry still places free.
    expect(scene.justMovedHandCardId).toBe(biz.id);
  });

  it('premium is charged for community-space cards too (parity)', async () => {
    const cs = { id: 'cs-library', name: 'Library', cost: 10, family: 'community-space', tier: 1 };
    scene.state.hand = [cs];
    scene.pendingHandIndex = 0;
    scene.pendingHandJustMoved = true;
    scene.justMovedHandCardId = cs.id;
    scene.uiPhase = 'placing-from-hand';
    scene.state.actionsRemaining = 0;
    scene.state.resourceBank.coins = 100;
    const coinsBefore = scene.state.resourceBank.coins;

    await placeFromHandComposite(scene, controller);

    const premium = Math.ceil(10 * 1.5 * 2) / 2; // 15
    scene.premiumDialogOnProceed();
    expect(scene.state.resourceBank.coins).toBe(coinsBefore - premium);
    expect(scene.state.streetGrid.some((slot: any) => slot?.name === 'Library')).toBe(true);
  });
});

describe('Drag-drop buy-and-place parity (CG-0MT24X0SX007RLHN)', () => {
  let controller: MainStreetTurnController;
  let scene: any;

  beforeEach(() => {
    scene = createMockScene();
    scene.uiPhase = 'market';
    controller = new MainStreetTurnController(scene);
  });

  /** Simulates a full drag-drop: pickup → drop → dialog proceed → transfer
   *  flush, asserting the state after a completed buy-and-place. */
  async function dragBuyAndPlace(cost: number, actionsRemaining: number, coins = 100): Promise<any> {
    const card = makeBiz('biz-drag', 'DragBiz', cost);
    scene.state.market.cards = [card];
    scene.state.resourceBank.coins = coins;
    scene.state.actionsRemaining = actionsRemaining;
    const slot = firstEmptySlot(scene.state);

    const gameObject = { x: 400, y: 300, setDepth: vi.fn(), ...{ depth: 5 } };
    controller.onDragDropBusiness({ gameObject, data: card.id, zoneData: slot } as any);
    // Premium drags gate on the dialog before the transfer starts.
    if (scene.premiumDialogOnProceed) scene.premiumDialogOnProceed();
    await new Promise((resolve) => setTimeout(resolve, 0));
    return { card, slot, coinsBefore: coins };
  }

  it('1-action day: drag charges premium and consumes 1 action (parity with composite)', async () => {
    const { slot, coinsBefore } = await dragBuyAndPlace(6, 1);
    const premium = Math.ceil(6 * 1.5 * 2) / 2; // 9

    expect(scene.showBuyAndPlacePremiumDialog).toHaveBeenCalledTimes(1);
    expect(scene.state.resourceBank.coins).toBe(coinsBefore - premium);
    expect(scene.state.actionsRemaining).toBe(0);
    expect(scene.state.streetGrid[slot]?.name).toBe('DragBiz');
    expect(scene.undoManager.canUndo()).toBe(true);
  });

  it('GM 2-action day: drag charges listed cost and consumes 2 actions (no dialog)', async () => {
    const { slot, coinsBefore } = await dragBuyAndPlace(6, 2);
    const premium = Math.ceil(6 * 1.5 * 2) / 2; // 9

    // No premium dialog on the GM listed-cost path.
    expect(scene.showBuyAndPlacePremiumDialog).not.toHaveBeenCalled();
    expect(scene.state.resourceBank.coins).toBe(coinsBefore - 6); // listed, not premium
    expect(scene.state.resourceBank.coins).toBeGreaterThan(coinsBefore - premium);
    expect(scene.state.actionsRemaining).toBe(0); // 2 − 2
    expect(scene.state.streetGrid[slot]?.name).toBe('DragBiz');
    expect(scene.undoManager.canUndo()).toBe(true);
  });

  it('GM 2-action drag is fully undoable (coins + both actions restored)', async () => {
    await dragBuyAndPlace(6, 2);
    expect(scene.undoManager.canUndo()).toBe(true);

    scene.undoManager.undo();
    expect(scene.state.market.cards).toHaveLength(1);
    expect(scene.state.actionsRemaining).toBe(2);
    expect(scene.state.resourceBank.coins).toBe(100);
  });
});