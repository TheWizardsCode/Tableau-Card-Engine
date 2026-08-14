/**
 * Main Street drag-to-buy/place integration tests (unit).
 *
 * Covers the Main Street wiring for the reusable core-engine drag-drop
 * module (src/ui/dragDrop.ts):
 *  - pickup validation (`canPickUpBusinessCard`): business/community-space
 *    pickup, affordability, empty-slot availability, phase, tutorial gating
 *    and requiredCardId;
 *  - drop-zone validation (`canDropBusinessCard`): canPurchaseBusiness plus
 *    tutorial place-business gating and T13 synergy adjacency enforcement;
 *  - drag → buy+place (`onDragDropBusiness`): single undoable
 *    buyBusinessCommand, state mutation, events, tutorial completion;
 *  - module wiring: pickup veto keeps the card in place with illegal
 *    feedback; valid drops execute the buy; invalid drops snap back.
 *
 * @module tests/main-street/drag
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { setupMainStreetGame } from '../../example-games/main-street/MainStreetState';
import { MainStreetTurnController } from '../../example-games/main-street/scenes/MainStreetTurnController';
import { UndoRedoManager } from '../../src/core-engine/UndoRedoManager';
import { COMMON_SFX_KEYS } from '../../src/core-engine/SoundManager';
import { UNIFIED_TUTORIAL_STEPS } from '../../example-games/main-street/TutorialFlow';

// ── Mocks ──────────────────────────────────────────────────

/** Minimal Phaser plumbing needed by createDragDropManager. */
function createPhaserMock(): any {
  const tweenTargets: Array<{ x: number; y: number }> = [];
  return {
    tweens: {
      add: vi.fn((config: any) => {
        const targets = Array.isArray(config.targets) ? config.targets : [config.targets];
        for (const t of targets) {
          tweenTargets.push(t);
          if (t && config.x !== undefined) t.x = config.x;
          if (t && config.y !== undefined) t.y = config.y;
        }
        // Complete snap-back / shake tweens synchronously so callers observe
        // restored positions (same convention as the dragDrop unit tests).
        config.onComplete?.();
        return { stop: vi.fn(), destroy: vi.fn() };
      }),
    },
    input: {
      on: vi.fn(),
      off: vi.fn(),
      setDraggable: vi.fn(),
      dragDistanceThreshold: 0,
    },
    sound: { play: vi.fn(), stopByKey: vi.fn(), volume: 1, mute: false },
  };
}

/** Container-shaped draggable (no setTint — like a real Phaser Container). */
function createMockContainer(x = 300, y = 150, depth = 5): any {
  const go: any = {
    x,
    y,
    depth,
    input: null,
    setDepth: vi.fn((d: number) => { go.depth = d; }),
    setInteractive: vi.fn(),
    setName: vi.fn(),
    on: vi.fn(),
  };
  return go;
}

/**
 * Minimal Main Street scene mock with a real state and undo manager, plus
 * the Phaser plumbing required by the drag-drop module.
 */
function createMockScene(overrides: Record<string, unknown> = {}): any {
  const phaser = createPhaserMock();
  const state = setupMainStreetGame({ seed: 'ms-drag-test' });

  const scene: any = {
    state,
    uiPhase: 'market',
    layout: {
      streetCols: 5,
      streetX: 60,
      streetTop: 220,
      slotW: 100,
      slotH: 64,
      slotGap: 8,
      streetRowGap: 8,
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
    dragDropManager: undefined,
    animateTransferFromMarket: vi.fn().mockResolvedValue(undefined),
    getStreetSlotCenter: vi.fn((slotIndex: number) => ({ x: 500 + slotIndex, y: 260 })),
    // Phaser plumbing for createDragDropManager
    input: phaser.input,
    tweens: phaser.tweens,
    sound: phaser.sound,
    ...overrides,
  };
  return scene;
}

/** First business card in the development row, made affordable deterministically. */
function pickAffordableBusiness(state: any): any {
  const card = state.market.development.find((c: any) => c.family === 'business');
  if (!card) throw new Error('No business card in development row for test');
  // Ensure the player can afford it regardless of seed.
  if (state.resourceBank.coins < card.cost) state.resourceBank.coins = card.cost;
  return card;
}

/** First empty street slot index (or -1). */
function firstEmptySlot(state: any): number {
  return state.streetGrid.findIndex((slot: any) => slot === null);
}

const POINTER = { x: 0, y: 0 } as any;

// ── Tests ──────────────────────────────────────────────────

describe('MainStreet drag-to-buy wiring', () => {
  let controller: MainStreetTurnController;
  let scene: any;

  beforeEach(() => {
    scene = createMockScene();
    controller = new MainStreetTurnController(scene);
  });

  describe('canPickUpBusinessCard (pickup validation)', () => {
    it('allows an affordable business card with an empty street slot', () => {
      const card = pickAffordableBusiness(scene.state);
      expect(card).toBeTruthy();
      expect(firstEmptySlot(scene.state)).toBeGreaterThanOrEqual(0);
      expect(controller.canPickUpBusinessCard(card.id)).toBe(true);
    });

    it('allows an affordable community-space card (general drag support)', () => {
      let cs = scene.state.market.development.find((c: any) => c.family === 'community-space');
      if (!cs) {
        // Deterministic: manufacture a community-space card in the row.
        cs = scene.state.market.development[0];
        cs.family = 'community-space';
      }
      if (scene.state.resourceBank.coins < cs.cost) scene.state.resourceBank.coins = cs.cost;
      expect(firstEmptySlot(scene.state)).toBeGreaterThanOrEqual(0);
      expect(controller.canPickUpBusinessCard(cs.id)).toBe(true);
    });

    it('rejects non-business/community-space families (event/upgrade stay click-only)', () => {
      const card = scene.state.market.development[0];
      if (scene.state.resourceBank.coins < card.cost) scene.state.resourceBank.coins = card.cost;
      card.family = 'event';
      expect(controller.canPickUpBusinessCard(card.id)).toBe(false);
      card.family = 'upgrade';
      expect(controller.canPickUpBusinessCard(card.id)).toBe(false);
    });

    it('rejects a card the player cannot afford (illegal-card case)', () => {
      const card = pickAffordableBusiness(scene.state);
      scene.state.resourceBank.coins = 0;
      expect(controller.canPickUpBusinessCard(card.id)).toBe(false);
    });

    it('rejects when no empty street slot exists', () => {
      const card = pickAffordableBusiness(scene.state);
      scene.state.streetGrid = scene.state.streetGrid.map(() => ({
        family: 'business', id: `filled-${Math.random()}`,
      }));
      expect(firstEmptySlot(scene.state)).toBe(-1);
      expect(controller.canPickUpBusinessCard(card.id)).toBe(false);
    });

    it('rejects when not in the market phase', () => {
      const card = pickAffordableBusiness(scene.state);
      scene.uiPhase = 'animating';
      expect(controller.canPickUpBusinessCard(card.id)).toBe(false);
    });

    it('rejects when the card is no longer in the development row', () => {
      expect(controller.canPickUpBusinessCard('biz-not-in-market-0')).toBe(false);
    });

    it('honours select-business tutorial gating', () => {
      const card = pickAffordableBusiness(scene.state);
      scene.msLifecycleManager.isTutorialActionAllowed = vi.fn()
        .mockReturnValue({ allowed: false, reason: 'not now' });
      expect(controller.canPickUpBusinessCard(card.id)).toBe(false);
    });

    it('honours requiredCardId matching on tutorial steps', () => {
      const card = pickAffordableBusiness(scene.state);
      const stepIndex = UNIFIED_TUTORIAL_STEPS.findIndex(
        (s) => s.requiredCardId === 'biz-laundromat-0',
      );
      expect(stepIndex).toBeGreaterThanOrEqual(0);
      const tutorialController = {
        isActive: true,
        currentStepIndex: stepIndex,
        lastCompletedStepId: null,
        exited: false,
      };

      // A different card template does not match the required card.
      scene.tutorialController = tutorialController;
      card.id = 'biz-custom-1';
      expect(controller.canPickUpBusinessCard(card.id)).toBe(false);

      // The required card template itself is pickable.
      card.id = 'biz-laundromat-0';
      expect(controller.canPickUpBusinessCard(card.id)).toBe(true);
    });
  });

  describe('canDropBusinessCard (drop-zone validation)', () => {
    it('accepts an empty in-bounds slot for an affordable business card', () => {
      const card = pickAffordableBusiness(scene.state);
      const slot = firstEmptySlot(scene.state);
      expect(controller.canDropBusinessCard(card.id, slot)).toBe(true);
    });

    it('rejects an occupied slot (invalid drop)', () => {
      const card = pickAffordableBusiness(scene.state);
      const slot = firstEmptySlot(scene.state);
      scene.state.streetGrid[slot] = { family: 'business', id: 'other-biz' };
      expect(controller.canDropBusinessCard(card.id, slot)).toBe(false);
    });

    it('rejects out-of-bounds slots', () => {
      const card = pickAffordableBusiness(scene.state);
      expect(controller.canDropBusinessCard(card.id, 999)).toBe(false);
      expect(controller.canDropBusinessCard(card.id, -1)).toBe(false);
    });

    it('honours place-business tutorial gating', () => {
      const card = pickAffordableBusiness(scene.state);
      const slot = firstEmptySlot(scene.state);
      scene.msLifecycleManager.isTutorialActionAllowed = vi.fn()
        .mockReturnValue({ allowed: false, reason: 'not now' });
      expect(controller.canDropBusinessCard(card.id, slot)).toBe(false);
    });

    it('enforces synergy adjacency during T13 (Library must be next to the Bookshop)', () => {
      const t13Index = UNIFIED_TUTORIAL_STEPS.findIndex((s) => s.id === 'T13');
      expect(t13Index).toBeGreaterThanOrEqual(0);
      scene.tutorialController = {
        isActive: true,
        currentStepIndex: t13Index,
        lastCompletedStepId: null,
        exited: false,
      };

      // Deterministic cs-library card in the dev row, affordable.
      let cs = scene.state.market.development.find((c: any) => c.family === 'community-space');
      if (!cs) {
        cs = scene.state.market.development[0];
        cs.family = 'community-space';
      }
      cs.id = 'cs-library-0';
      cs.cost = 1;
      scene.state.resourceBank.coins = 10;

      // Tutorial layout: Laundromat on slot 0, Bookshop (synergy partner) on slot 1.
      scene.state.streetGrid[0] = { id: 'biz-laundromat-0', family: 'business' } as any;
      scene.state.streetGrid[1] = { id: 'biz-bookshop-0', family: 'business' } as any;

      // Adjacent slots (2, 6 orthogonal; 5 diagonal — 8-way/Chebyshev) are accepted.
      expect(controller.canDropBusinessCard(cs.id, 2)).toBe(true);
      expect(controller.canDropBusinessCard(cs.id, 6)).toBe(true);
      expect(controller.canDropBusinessCard(cs.id, 5)).toBe(true); // diagonal
      // Non-adjacent slots are rejected (drag snap-back + illegal feedback).
      expect(controller.canDropBusinessCard(cs.id, 3)).toBe(false);
      expect(controller.canDropBusinessCard(cs.id, 8)).toBe(false);
      // The synergy slot itself (occupied) is also rejected.
      expect(controller.canDropBusinessCard(cs.id, 1)).toBe(false);
    });

    it('does not enforce adjacency when the synergy card is not on the street', () => {
      const t13Index = UNIFIED_TUTORIAL_STEPS.findIndex((s) => s.id === 'T13');
      scene.tutorialController = {
        isActive: true,
        currentStepIndex: t13Index,
        lastCompletedStepId: null,
        exited: false,
      };
      let cs = scene.state.market.development.find((c: any) => c.family === 'community-space');
      if (!cs) {
        cs = scene.state.market.development[0];
        cs.family = 'community-space';
      }
      cs.id = 'cs-library-0';
      cs.cost = 1;
      scene.state.resourceBank.coins = 10;
      // Empty street (no Bookshop) → any empty slot is accepted.
      expect(controller.canDropBusinessCard(cs.id, 3)).toBe(true);
    });
  });

  describe('onDragDropBusiness (drag → buy+place)', () => {
    it('buys directly to the drop slot in a single undoable step', async () => {
      const card = pickAffordableBusiness(scene.state);
      const slot = firstEmptySlot(scene.state);
      const coinsBefore = scene.state.resourceBank.coins;

      controller.onDragDropBusiness({
        // Container parked at the drop location (it follows the pointer
        // during the drag, so x/y == where the card was released).
        gameObject: createMockContainer(412, 331, 5),
        data: card.id,
        zoneData: slot,
      });

      // Transfer animation started from the DROP LOCATION (not the market
      // slot origin) and targeted the street slot centre.
      expect(scene.animateTransferFromMarket).toHaveBeenCalledTimes(1);
      const opts = scene.animateTransferFromMarket.mock.calls[0][0];
      expect(opts.cardId).toBe(card.id);
      expect(opts.row).toBe('development');
      expect(opts.source).toEqual({ x: 412, y: 331 });
      expect(opts.destination).toEqual(scene.getStreetSlotCenter(slot));

      // Flush the transfer-completion microtask (mock resolves immediately).
      await new Promise((resolve) => setTimeout(resolve, 0));

      // afterTransfer ran → buy executed.
      expect(scene.state.market.development.find((c: any) => c.id === card.id)).toBeUndefined();
      expect(scene.state.streetGrid[slot]?.id).toBe(card.id);
      expect(scene.state.resourceBank.coins).toBe(coinsBefore - card.cost);
      expect(scene.uiPhase).toBe('market');
      expect(scene.hiddenTransferSourceCardIds.has(card.id)).toBe(false);
      expect(scene.gameEvents.emit).toHaveBeenCalledWith('card:placed', expect.objectContaining({ cardId: card.id, slotIndex: slot }));
      expect(scene.msLifecycleManager.onTutorialActionComplete).toHaveBeenCalledWith('place-business');

      // Single undo step reverses the whole buy+place.
      expect(scene.undoManager.canUndo()).toBe(true);
      scene.undoManager.undo();
      expect(scene.state.market.development.find((c: any) => c.id === card.id)).toBeTruthy();
      expect(scene.state.streetGrid[slot]).toBeNull();
      expect(scene.state.resourceBank.coins).toBe(coinsBefore);
      expect(scene.undoManager.canUndo()).toBe(false);
    });
  });

  describe('drag-drop module wiring', () => {
    it('pickup veto keeps the card in place and plays illegal feedback', () => {
      const card = pickAffordableBusiness(scene.state);
      // Make the card unaffordable → canPickUp vetoes the drag.
      scene.state.resourceBank.coins = 0;

      controller.initDragDrop();
      const manager = scene.dragDropManager;
      expect(manager).toBeTruthy();

      const container = createMockContainer(300, 150, 5);
      const hitArea = { x: -50, y: -40, width: 100, height: 80 };
      manager.registerDraggable({
        gameObject: container,
        data: card.id,
        hitArea,
        canPickUp: () => controller.canPickUpBusinessCard(card.id),
        onDrop: vi.fn(),
      });

      // Trigger the scene-level dragstart handler captured by the module.
      const dragstart = scene.input.on.mock.calls.find((c: any[]) => c[0] === 'dragstart');
      expect(dragstart).toBeTruthy();
      dragstart[1](POINTER, container);

      // Card stayed at its origin (no depth raise, no move) and the
      // illegal feedback sound fired.
      expect(container.x).toBe(300);
      expect(container.y).toBe(150);
      expect(container.depth).toBe(5);
      expect(scene.sound.play).toHaveBeenCalledWith(COMMON_SFX_KEYS.ILLEGAL_MOVE);
    });

    it('valid drop executes the buy via the module drop handler', async () => {
      const card = pickAffordableBusiness(scene.state);
      const slot = firstEmptySlot(scene.state);

      controller.initDragDrop();
      const manager = scene.dragDropManager;
      const container = createMockContainer(300, 150, 5);
      const zone = { name: 'street-slot' };

      manager.registerDraggable({
        gameObject: container,
        data: card.id,
        hitArea: { x: -50, y: -40, width: 100, height: 80 },
        canPickUp: () => controller.canPickUpBusinessCard(card.id),
        onDrop: (payload: any) => controller.onDragDropBusiness(payload),
      });
      manager.registerDropZone({
        zone,
        data: slot,
        canAccept: (payload: any) => controller.canDropBusinessCard(payload.data, slot),
      });

      const events = Object.fromEntries(
        scene.input.on.mock.calls.map((c: any[]) => [c[0], c[1]]),
      );
      events['dragstart'](POINTER, container);
      events['drop'](POINTER, container, zone);

      // Flush the transfer-completion microtask before asserting state.
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(scene.state.streetGrid[slot]?.id).toBe(card.id);
      expect(scene.undoManager.canUndo()).toBe(true);
    });

    it('invalid drop (rejected zone) snap-backs the card with illegal feedback', () => {
      const card = pickAffordableBusiness(scene.state);
      const slot = firstEmptySlot(scene.state);
      // Occupy the target slot → canAccept rejects the drop.
      scene.state.streetGrid[slot] = { family: 'business', id: 'other-biz' };

      controller.initDragDrop();
      const manager = scene.dragDropManager;
      const container = createMockContainer(300, 150, 5);
      const zone = { name: 'occupied-slot' };

      manager.registerDraggable({
        gameObject: container,
        data: card.id,
        hitArea: { x: -50, y: -40, width: 100, height: 80 },
        canPickUp: () => controller.canPickUpBusinessCard(card.id),
        onDrop: vi.fn(),
      });
      manager.registerDropZone({
        zone,
        data: slot,
        canAccept: (payload: any) => controller.canDropBusinessCard(payload.data, slot),
      });

      const events = Object.fromEntries(
        scene.input.on.mock.calls.map((c: any[]) => [c[0], c[1]]),
      );
      events['dragstart'](POINTER, container);
      // Simulate the drag moving the card away from its origin.
      container.x = 700;
      container.y = 300;
      events['drop'](POINTER, container, zone);

      // Snap-back tween restored position + depth; illegal sound played;
      // no buy happened.
      expect(container.x).toBe(300);
      expect(container.y).toBe(150);
      expect(container.depth).toBe(5);
      expect(scene.sound.play).toHaveBeenCalledWith(COMMON_SFX_KEYS.ILLEGAL_MOVE);
      expect(scene.state.market.development.find((c: any) => c.id === card.id)).toBeTruthy();
      expect(scene.state.streetGrid[slot]?.id).toBe('other-biz');
    });
  });
});
