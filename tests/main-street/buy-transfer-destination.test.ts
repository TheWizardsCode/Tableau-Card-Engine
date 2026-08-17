/**
 * Buy Transfer Destination Tests
 *
 * Verifies that market→hand buy transfer animations in Main Street target the
 * exact resting position of the purchased card in the HandView layout (single
 * source of truth), rather than the old left-edge slot estimate that caused
 * the flying card to snap sideways when the hand re-rendered.
 *
 * Covers both buy paths:
 *  - business cards bought to hand (`onBusinessCardClick`)
 *  - investment events bought as the held event (`onEventCardClick`)
 *
 * @module tests/main-street/buy-transfer-destination
 */

import { describe, it, expect, vi, afterEach } from 'vitest';

import { setupMainStreetGame } from '../../example-games/main-street/MainStreetState';
import { MainStreetTurnController } from '../../example-games/main-street/scenes/MainStreetTurnController';
import { canPurchaseEvent } from '../../example-games/main-street/MainStreetMarket';
import { createBusinessDeck, createEventDeck } from '../../example-games/main-street/MainStreetCards';
import { HandView } from '../../src/ui/HandView';

// ── Minimal Phaser mock (for real HandView instances) ──────
// HandView uses scene.add.image(), scene.add.text(), scene.tweens.
// This mirrors the mock in tests/ui/handView.test.ts.
function createPhaserMock(): any {
  const mockImage = (x: number, y: number, texture: string) => {
    const img = {
      x,
      y,
      texture: { key: texture },
      active: true,
      setInteractive: vi.fn().mockReturnThis(),
      setTint: vi.fn().mockReturnThis(),
      clearTint: vi.fn().mockReturnThis(),
      setOrigin: vi.fn().mockReturnThis(),
      setAlpha: vi.fn().mockReturnThis(),
      setDepth: vi.fn().mockReturnThis(),
      on: vi.fn().mockReturnThis(),
      off: vi.fn().mockReturnThis(),
      destroy: vi.fn(),
      scaleX: 1,
      scaleY: 1,
      alpha: 1,
      rotation: 0,
      displayWidth: 48,
      displayHeight: 65,
    };
    return img;
  };

  const mockText = (x: number, y: number, text: string, _style?: any) => {
    const txt = {
      x,
      y,
      text,
      setOrigin: vi.fn().mockReturnThis(),
      setTint: vi.fn().mockReturnThis(),
      clearTint: vi.fn().mockReturnThis(),
      setColor: vi.fn().mockReturnThis(),
      setDepth: vi.fn().mockReturnThis(),
      active: true,
      destroy: vi.fn(),
    };
    return txt;
  };

  return {
    add: {
      image: vi.fn().mockImplementation(mockImage),
      text: vi.fn().mockImplementation(mockText),
      graphics: vi.fn().mockReturnValue({
        fillStyle: vi.fn().mockReturnThis(),
        fillRoundedRect: vi.fn().mockReturnThis(),
        lineStyle: vi.fn().mockReturnThis(),
        strokeRoundedRect: vi.fn().mockReturnThis(),
        clear: vi.fn().mockReturnThis(),
        destroy: vi.fn(),
      }),
      rectangle: vi.fn().mockReturnValue({
        setPosition: vi.fn().mockReturnThis(),
        setOrigin: vi.fn().mockReturnThis(),
        setDepth: vi.fn().mockReturnThis(),
        setAlpha: vi.fn().mockReturnThis(),
        setRotation: vi.fn().mockReturnThis(),
        setFillStyle: vi.fn().mockReturnThis(),
        destroy: vi.fn(),
        active: true,
      }),
    },
    tweens: {
      add: vi.fn().mockReturnValue({ stop: vi.fn() }),
      killTweensOf: vi.fn(),
    },
    input: {
      on: vi.fn(),
      off: vi.fn(),
    },
    events: {
      once: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    },
    time: {
      delayedCall: vi.fn().mockReturnValue({ remove: vi.fn() }),
    },
    sound: {
      play: vi.fn(),
    },
  };
}

// Layout mirroring the MainStreet hand zone used by the real renderer
// (MainStreetLayoutAdapter + MainStreetRenderer.createContainers).
const LAYOUT = {
  gameW: 1280,
  gameH: 720,
  handX: 40,
  handY: 620,
  handCardW: 140,
  handCardH: 80,
  handCenterX: 400,
};

/**
 * Creates a minimal mock Main Street scene with a real HandView instance that
 * mirrors the renderer's merged `handView` configuration (single horizontal
 * row holding any mix of business and event cards), plus the scene
 * delegations the turn controller uses for destination prediction.
 *
 * `animateTransferFromMarket` returns a never-resolving promise so the
 * transfer-completion callback (which mutates state) never runs — tests focus
 * on the destination argument passed to the transfer.
 */
function createMockScene(): any {
  const phaser = createPhaserMock();
  const state = setupMainStreetGame({ seed: 'buy-transfer-dest' });
  // Coin cushion so the seeded investments row always contains a purchasable
  // event regardless of which cards the expanded pool draws.
  state.resourceBank.coins = 100;

  // Merged hand — mirrors handView in MainStreetRenderer.
  const handView = new HandView(phaser, {
    baseX: LAYOUT.handX + LAYOUT.handCardW / 2,
    baseY: LAYOUT.handY,
    centerX: LAYOUT.handCenterX,
    spacing: LAYOUT.handCardW + 8,
    cardWidth: LAYOUT.handCardW,
    showLabels: false,
    selectionEnabled: false,
    clickEnabled: true,
  });

  const scene: any = {
    state,
    uiPhase: 'market',
    layout: LAYOUT,
    handView,
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
    refreshAllAction: vi.fn(),
    gameEvents: { emit: vi.fn(), on: vi.fn(), off: vi.fn() },
    time: { delayedCall: vi.fn().mockReturnValue({ remove: vi.fn() }) },
    undoManager: null,
    overlayObjects: [],
    hudContainer: null,
    hintBar: null,
    cardSvgLoadPromise: Promise.resolve(),
    prewarmVisibleCardTextures: vi.fn().mockResolvedValue(undefined),
    updateSvgDebugOverlay: vi.fn(),
    previousCoins: null,
    previousReputation: null,
    transferAnimationCount: 0,
    activeTransferTweens: new Set(),
    activeTransferVisuals: new Set(),
    // Never resolve — keeps the test focused on the transfer destination.
    animateTransferFromMarket: vi.fn(() => new Promise(() => {})),
    // Scene delegations mirroring MainStreetScene.getBusinessHandInsertionPosition /
    // getEventHandInsertionPosition (both delegate to the single merged view).
    getBusinessHandInsertionPosition: (insertIndex: number) =>
      handView.getInsertionPosition(insertIndex),
    getEventHandInsertionPosition: (insertIndex: number) =>
      handView.getInsertionPosition(insertIndex),
  };

  return scene;
}

// ── Tests ───────────────────────────────────────────────────

describe('Buy transfer destinations (market → hand)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('business buy to hand', () => {
    it('hand size 0: animates to the exact merged handView resting position', () => {
      const scene = createMockScene();
      const card = scene.state.market.cards[0];
      expect(card).toBeTruthy();

      // Empty hand — keep the renderer HandView in sync with the state.
      scene.handView.setCards(scene.state.hand ?? []);

      const controller = new MainStreetTurnController(scene);
      controller.onBusinessCardClick(card);

      expect(scene.animateTransferFromMarket).toHaveBeenCalledTimes(1);
      const opts = scene.animateTransferFromMarket.mock.calls[0][0];
      const predicted = scene.handView.getInsertionPosition(0);

      expect(opts.destination.x).toBeCloseTo(predicted.x, 5);
      expect(opts.destination.y).toBeCloseTo(predicted.y, 5);
      // First card of an empty hand is centred on handCenterX — NOT the old
      // left-edge estimate (handX + handCardW/2).
      expect(opts.destination.x).toBeCloseTo(LAYOUT.handCenterX, 5);
      expect(opts.destination.x).not.toBeCloseTo(LAYOUT.handX + LAYOUT.handCardW / 2, 5);
      // Click-to-buy flow keeps the fixed default — no duration override
      // (drag-and-drop is the only flow that passes a proportional duration).
      expect(opts.duration).toBeUndefined();
    });

    it('hand size 1: animates to the append position of a 2-card hand', () => {
      const scene = createMockScene();
      const card = scene.state.market.cards[0];
      const second = scene.state.market.cards[1];
      expect(card).toBeTruthy();
      expect(second).toBeTruthy();

      scene.state.hand = [card];
      scene.handView.setCards(scene.state.hand);

      const controller = new MainStreetTurnController(scene);
      controller.onBusinessCardClick(second);

      expect(scene.animateTransferFromMarket).toHaveBeenCalledTimes(1);
      const opts = scene.animateTransferFromMarket.mock.calls[0][0];
      // Append index = current hand length (1).
      const predicted = scene.handView.getInsertionPosition(1);

      expect(opts.destination.x).toBeCloseTo(predicted.x, 5);
      expect(opts.destination.y).toBeCloseTo(predicted.y, 5);
      // The rendered 2-card hand is centred on handCenterX, so the appended
      // card rests to the RIGHT of centre — never at the left edge.
      expect(opts.destination.x).toBeGreaterThan(LAYOUT.handCenterX);
    });

    it('hand size 3 (full): buy is blocked, no transfer animation is started', () => {
      const scene = createMockScene();
      const card = scene.state.market.cards[0];
      const second = scene.state.market.cards[1];
      const third = scene.state.market.cards[2];

      // maxHandSize is 3 (CG-0MSTOATDT009BRX2) — fill the hand completely.
      scene.state.hand = [card, second, third];
      scene.handView.setCards(scene.state.hand);

      // Inject one more card into the row so there is something to click.
      const extra = createBusinessDeck(1, ['biz-pawnshop']).find(c => c.id.startsWith('biz-pawnshop'))!;
      scene.state.market.cards.push(extra);

      const controller = new MainStreetTurnController(scene);
      controller.onBusinessCardClick(extra);

      expect(scene.animateTransferFromMarket).not.toHaveBeenCalled();
      // Hand-full message shown to the player.
      expect(scene.instructionText.setText).toHaveBeenCalledWith(
        expect.stringContaining('Hand full'),
      );
    });
  });

  describe('event buy (shared hand)', () => {
    it('animates to the exact merged handView resting position for the appended event', () => {
      const scene = createMockScene();
      let eventCard = scene.state.market.cards.find(
        (c: any) => c && c.family === 'event' && canPurchaseEvent(scene.state, c.id).legal,
      ) as any;
      if (!eventCard) {
        // The seeded single row may not include an event — inject one
        // deterministically so the transfer path is exercised.
        eventCard = createEventDeck(1, ['evt-festival'], () => 0)
          .find(c => c.id.startsWith('evt-festival'))!;
        scene.state.market.cards.push(eventCard);
      }
      expect(eventCard).toBeTruthy();

      const controller = new MainStreetTurnController(scene);
      controller.onEventCardClick(eventCard);

      expect(scene.animateTransferFromMarket).toHaveBeenCalledTimes(1);
      const opts = scene.animateTransferFromMarket.mock.calls[0][0];
      // The event is appended to the shared hand — insertion at current hand
      // length (0 for an empty hand).
      const handIndex = (scene.state.hand ?? []).length;
      const predicted = scene.handView.getInsertionPosition(handIndex);

      expect(opts.destination.x).toBeCloseTo(predicted.x, 5);
      expect(opts.destination.y).toBeCloseTo(predicted.y, 5);
      // Centred on handCenterX, NOT the old left-anchored getHandCardCenter.
      expect(opts.destination.x).toBeCloseTo(LAYOUT.handCenterX, 5);
      expect(opts.destination.x).not.toBeCloseTo(LAYOUT.handX + LAYOUT.handCardW / 2, 5);
      expect(opts.destination.y).toBeCloseTo(LAYOUT.handY, 5);
    });
  });
});
