/**
 * Main Street click-path illegal-afford feedback tests (unit).
 *
 * Verifies that the four click-path purchase rejections caused by
 * insufficient coins play the illegal-move feedback (sfx-illegal-move
 * sound + shake animation on the offending card), while non-affordability
 * rejections (hand full, occupied slot, tutorial gating, incident events,
 * no eligible target) keep their existing instruction-text-only behaviour.
 *
 * Scope of paths under test (see CG-0MSXIA61S00686G5):
 *  - onPlayHeldEvent    — playEventCommand throws "Not enough coins…"
 *  - onSlotClick        — placeFromHand throws "Not enough coins…"
 *  - onEventCardClick   — canPurchaseEvent fails with "Not enough coins…"
 *  - onUpgradeCardClick — canPurchaseUpgrade fails with "Not enough coins…"
 *
 * @module tests/main-street/illegal-afford-feedback
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { setupMainStreetGame } from '../../example-games/main-street/MainStreetState';
import { MainStreetTurnController } from '../../example-games/main-street/scenes/MainStreetTurnController';
import { COMMON_SFX_KEYS } from '../../src/core-engine/SoundManager';
import { UndoRedoManager } from '../../src/core-engine/UndoRedoManager';

// ── Mocks ──────────────────────────────────────────────────

/** Minimal Phaser plumbing (tweens, input, sound). */
function createPhaserMock(): any {
  return {
    tweens: {
      add: vi.fn((config: any) => {
        const targets = Array.isArray(config.targets) ? config.targets : [config.targets];
        for (const t of targets) {
          if (t && config.x !== undefined) t.x = config.x;
        }
        // Complete shake tweens synchronously so callers observe restored
        // positions (same convention as the dragDrop unit tests).
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

/**
 * Sprite-shaped hand card object (has setTint — like a real Phaser Sprite).
 */
function createMockSprite(x = 300, y = 150, depth = 5): any {
  const go: any = {
    x,
    y,
    depth,
    displayWidth: 80,
    displayHeight: 112,
    originX: 0.5,
    originY: 0.5,
    rotation: 0,
    setTint: vi.fn((_t: number) => go),
    clearTint: vi.fn(() => go),
    setX: vi.fn((v: number) => { go.x = v; return go; }),
    setDepth: vi.fn((d: number) => { go.depth = d; return go; }),
    setInteractive: vi.fn(() => go),
    setName: vi.fn(() => go),
    on: vi.fn(() => go),
  };
  return go;
}

/** Container-shaped market card object (no setTint — like a real Container). */
function createMockContainer(x = 300, y = 150, depth = 5): any {
  const go: any = {
    x,
    y,
    depth,
    setDepth: vi.fn((d: number) => { go.depth = d; return go; }),
    setInteractive: vi.fn(),
    setName: vi.fn(),
    on: vi.fn(),
  };
  return go;
}

/**
 * Minimal Main Street scene mock with a real state + undo manager and the
 * Phaser plumbing required by the turn controller click paths.
 */
function createMockScene(overrides: Record<string, unknown> = {}): any {
  const phaser = createPhaserMock();
  const state = setupMainStreetGame({ seed: 'ms-illegal-afford' });

  const marketContainers: any[] = state.market.cards.map(
    (_c: any, i: number) => createMockContainer(300 + i * 110, 150, 10 + i),
  );
  const handSprites: any[] = [
    createMockSprite(300, 240, 20),
    createMockSprite(410, 240, 21),
    createMockSprite(520, 240, 22),
  ];

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
      handX: 40,
      handY: 400,
      handCardW: 96,
      handCardH: 134,
      handCenterX: 512,
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
    time: { delayedCall: vi.fn().mockReturnValue({ remove: vi.fn() }) },
    animateTransferFromMarket: vi.fn().mockResolvedValue(undefined),
    getStreetSlotCenter: vi.fn((slotIndex: number) => ({ x: 500 + slotIndex, y: 260 })),
    msRenderer: {
      getMarketRowCards: vi.fn(() => marketContainers),
      getMarketSlotCenter: vi.fn(() => ({ x: 300, y: 150 })),
      handView: {
        getSpriteAt: vi.fn((index: number) => handSprites[index] ?? undefined),
        getBasePosition: vi.fn((index: number) =>
          index >= 0 && index < handSprites.length
            ? { x: handSprites[index].x, y: handSprites[index].y }
            : undefined,
        ),
      },
    },
    msAnimator: {
      animateEventPlayed: vi.fn(),
      animateLevelUp: vi.fn(),
      animateNewSynergyPairs: vi.fn(),
    },
    // Phaser plumbing
    input: phaser.input,
    tweens: phaser.tweens,
    sound: phaser.sound,
    add: {
      rectangle: vi.fn(() => {
        const rect: any = {
          setAlpha: vi.fn(() => rect),
          setOrigin: vi.fn(() => rect),
          setRotation: vi.fn(() => rect),
          setDepth: vi.fn(() => rect),
          destroy: vi.fn(),
        };
        return rect;
      }),
    },
    ...overrides,
  };
  return scene;
}

async function flushMicrotasks(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

/** Find (or manufacture) an Investment event card in the market. */
function takeInvestmentEvent(state: any): any {
  let card = (state.market.cards as any[]).find(
    (c: any) => c.family === 'event' && c.trigger === 'Investment',
  );
  if (!card) {
    card = { ...state.market.cards[0], family: 'event', trigger: 'Investment', id: 'evt-test-investment-0', cost: 5 };
    state.market.cards[0] = card;
  }
  return card;
}

// ── Tests ──────────────────────────────────────────────────

describe('Main Street click-path illegal-afford feedback', () => {
  let controller: MainStreetTurnController;
  let scene: any;

  beforeEach(() => {
    vi.clearAllMocks();
    scene = createMockScene();
    controller = new MainStreetTurnController(scene);
  });

  describe('onPlayHeldEvent (insufficient coins to play held event)', () => {
    it('plays sfx-illegal-move and shakes the held card when coins are insufficient', async () => {
      const event = takeInvestmentEvent(scene.state);
      event.cost = 5;
      scene.state.hand = [event];
      scene.state.resourceBank.coins = 0;
      scene.state.phase = 'MarketPhase';
      const sprite = scene.msRenderer.handView.getSpriteAt(0);

      controller.onPlayHeldEvent(0);
      await flushMicrotasks();

      expect(scene.sound.play).toHaveBeenCalledWith(COMMON_SFX_KEYS.ILLEGAL_MOVE);
      expect(scene.tweens.add).toHaveBeenCalled();
      // Shake targeted the held-event sprite.
      const shakeConfig = scene.tweens.add.mock.calls.find((c: any) => c[0]?.targets === sprite);
      expect(shakeConfig).toBeTruthy();
      // Card stays in hand; coins unchanged; instruction text shows the error.
      expect(scene.state.hand).toHaveLength(1);
      expect(scene.state.resourceBank.coins).toBe(0);
      expect(scene.instructionText.setText).toHaveBeenCalledWith(expect.stringContaining('Not enough coins'));
    });

    it('does NOT play feedback when the play failure is non-affordability (e.g. no eligible slot logic)', () => {
      // Incident events cannot be played from hand — a non-coins reason.
      const incident = { ...scene.state.market.cards[0], family: 'event', trigger: 'Incident', id: 'evt-test-incident-0', cost: 1 };
      scene.state.hand = [incident];
      scene.state.resourceBank.coins = 100;
      scene.state.phase = 'MarketPhase';

      controller.onPlayHeldEvent(0);
      expect(scene.sound.play).not.toHaveBeenCalled();
      expect(scene.tweens.add).not.toHaveBeenCalled();
    });
  });

  describe('onSlotClick (insufficient coins to place business from hand)', () => {
    it('plays sfx-illegal-move and shakes the hand card when placement is unaffordable', async () => {
      const biz = scene.state.market.cards.find(
        (c: any) => c.family === 'business' || c.family === 'community-space',
      );
      biz.cost = 5;
      scene.state.hand = [biz];
      scene.state.streetGrid[0] = null;
      scene.pendingHandIndex = 0;
      scene.uiPhase = 'placing-from-hand';
      scene.state.resourceBank.coins = 0;
      scene.state.phase = 'MarketPhase';

      controller.onSlotClick(0);
      await flushMicrotasks();

      expect(scene.sound.play).toHaveBeenCalledWith(COMMON_SFX_KEYS.ILLEGAL_MOVE);
      expect(scene.tweens.add).toHaveBeenCalled();
      const sprite = scene.msRenderer.handView.getSpriteAt(0);
      const shakeConfig = scene.tweens.add.mock.calls.find((c: any) => c[0]?.targets === sprite);
      expect(shakeConfig).toBeTruthy();
      // No state mutation: card still in hand, slot empty, coins unchanged.
      expect(scene.state.hand).toHaveLength(1);
      expect(scene.state.streetGrid[0]).toBeNull();
      expect(scene.state.resourceBank.coins).toBe(0);
      expect(scene.instructionText.setText).toHaveBeenCalledWith(expect.stringContaining('Not enough coins'));
    });

    it('does NOT play feedback when the slot is occupied (non-affordability)', async () => {
      const biz = scene.state.market.cards.find(
        (c: any) => c.family === 'business' || c.family === 'community-space',
      );
      biz.cost = 1;
      scene.state.hand = [biz];
      scene.state.streetGrid[0] = { id: 'other-biz', family: 'business' };
      scene.pendingHandIndex = 0;
      scene.uiPhase = 'placing-from-hand';
      scene.state.resourceBank.coins = 100;
      scene.state.phase = 'MarketPhase';

      controller.onSlotClick(0);
      await flushMicrotasks();

      expect(scene.sound.play).not.toHaveBeenCalled();
      expect(scene.tweens.add).not.toHaveBeenCalled();
      expect(scene.state.hand).toHaveLength(1);
      expect(scene.state.resourceBank.coins).toBe(100);
    });
  });

  describe('onEventCardClick (insufficient coins to buy event)', () => {
    it('plays sfx-illegal-move and shakes the market card container', () => {
      const event = takeInvestmentEvent(scene.state);
      event.cost = 5;
      scene.state.resourceBank.coins = 0;
      scene.state.phase = 'MarketPhase';

      controller.onEventCardClick(event);

      expect(scene.sound.play).toHaveBeenCalledWith(COMMON_SFX_KEYS.ILLEGAL_MOVE);
      expect(scene.tweens.add).toHaveBeenCalled();
      // No state mutation: event still in market, coins unchanged.
      expect(scene.state.market.cards.find((c: any) => c.id === event.id)).toBeTruthy();
      expect(scene.state.resourceBank.coins).toBe(0);
      expect(scene.instructionText.setText).toHaveBeenCalledWith(expect.stringContaining('Cannot buy event'));
    });
  });

  describe('onUpgradeCardClick (insufficient coins to buy upgrade)', () => {
    it('plays sfx-illegal-move and shakes the market card container', () => {
      const upgrade = scene.state.market.cards.find((c: any) => c.family === 'upgrade');
      upgrade.cost = 5;
      // No eligible target business on the street for the upgrade.
      scene.state.streetGrid = scene.state.streetGrid.map(() => null);
      scene.state.resourceBank.coins = 0;
      scene.state.phase = 'MarketPhase';

      controller.onUpgradeCardClick(upgrade);

      expect(scene.sound.play).toHaveBeenCalledWith(COMMON_SFX_KEYS.ILLEGAL_MOVE);
      expect(scene.tweens.add).toHaveBeenCalled();
      expect(scene.state.market.cards.find((c: any) => c.id === upgrade.id)).toBeTruthy();
      expect(scene.state.resourceBank.coins).toBe(0);
      expect(scene.instructionText.setText).toHaveBeenCalledWith(expect.stringContaining('Cannot buy upgrade'));
    });

    it('does NOT play feedback when the upgrade has no eligible target (non-affordability)', () => {
      const upgrade = scene.state.market.cards.find((c: any) => c.family === 'upgrade');
      upgrade.cost = 1;
      scene.state.streetGrid = scene.state.streetGrid.map(() => null);
      scene.state.resourceBank.coins = 100;
      scene.state.phase = 'MarketPhase';

      controller.onUpgradeCardClick(upgrade);

      expect(scene.sound.play).not.toHaveBeenCalled();
      expect(scene.tweens.add).not.toHaveBeenCalled();
      expect(scene.state.resourceBank.coins).toBe(100);
    });
  });

  describe('onBusinessCardClick (hand full)', () => {
    it('plays sfx-illegal-move and shakes the market card container when hand is full', () => {
      // Fill the hand to capacity (default is 5)
      const biz = scene.state.market.cards.find((c: any) => c.family === 'business');
      const existing = scene.state.hand.filter((c: any) => c.family === 'business');
      while (existing.length < 4) {
        const extra = { ...biz, id: `test-biz-${existing.length}` };
        scene.state.hand.push(extra);
        existing.push(extra);
      }
      scene.state.market.cards = [biz];

      controller.onBusinessCardClick(biz);

      expect(scene.sound.play).toHaveBeenCalledWith(COMMON_SFX_KEYS.ILLEGAL_MOVE);
      expect(scene.tweens.add).toHaveBeenCalled();
      // Shake targeted the market card container (first index).
      const containers = scene.msRenderer.getMarketRowCards();
      const shakeConfig = scene.tweens.add.mock.calls.find(
        (c: any) => c[0]?.targets === containers?.[0],
      );
      expect(shakeConfig).toBeTruthy();
      // No state mutation: card still in market, hand unchanged.
      expect(scene.state.market.cards.find((c: any) => c.id === biz.id)).toBeTruthy();
      expect(scene.instructionText.setText).toHaveBeenCalledWith(expect.stringContaining('Hand full'));
    });
  });

  describe('feedback safety', () => {
    it('does not throw when the shake target is unavailable (headless/replay)', async () => {
      // Strip the renderer so getMarketRowCards/getSpriteAt return undefined.
      const bare = createMockScene();
      bare.msRenderer = undefined as any;
      const ev = takeInvestmentEvent(bare.state);
      ev.cost = 5;
      bare.state.resourceBank.coins = 0;
      bare.state.phase = 'MarketPhase';

      const ctrl = new MainStreetTurnController(bare);
      expect(() => ctrl.onEventCardClick(ev)).not.toThrow();
      expect(bare.sound.play).toHaveBeenCalledWith(COMMON_SFX_KEYS.ILLEGAL_MOVE);
      // No tween attempted, but the game loop continues.
      expect(bare.tweens.add).not.toHaveBeenCalled();
    });

    it('does not play feedback on tutorial-gated rejections (text only)', () => {
      scene.msLifecycleManager.isTutorialActionAllowed = vi.fn()
        .mockReturnValue({ allowed: false, reason: 'Complete the highlighted step first.' });
      const event = takeInvestmentEvent(scene.state);

      controller.onEventCardClick(event);

      expect(scene.sound.play).not.toHaveBeenCalled();
      expect(scene.tweens.add).not.toHaveBeenCalled();
      expect(scene.instructionText.setText).toHaveBeenCalledWith(expect.stringContaining('Complete the highlighted step'));
    });
  });
});
