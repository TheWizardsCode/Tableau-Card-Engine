/**
 * Hand Business Card Click Tests
 *
 * Tests for hand business card interactivity in the market phase.
 * Verifies that clicking a hand card during market phase sets
 * pendingHandIndex and switches uiPhase to 'placing-from-hand'.
 *
 * @module
 */

import { describe, it, expect, vi } from 'vitest';

import { setupMainStreetGame } from '../../example-games/main-street/MainStreetState';
import { MainStreetTurnController } from '../../example-games/main-street/scenes/MainStreetTurnController';
import { executeDayStart } from '../../example-games/main-street/MainStreetEngine';

// ── Helpers ─────────────────────────────────────────────────

/**
 * Creates a minimal mock scene that satisfies the properties
 * accessed by MainStreetTurnController.onHandBusinessCardClick.
 */
function createMockScene(): any {
  const mockScene: any = {
    state: setupMainStreetGame({ seed: 'hand-click-test' }),
    uiPhase: 'market',
    pendingHandIndex: null,
    instructionText: { setText: vi.fn() },
    refreshAll: vi.fn(),
    overlayObjects: [],
    hudContainer: null,
    undoManager: null,
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
    // SVG card loading artifacts
    cardSvgLoadPromise: Promise.resolve(),
    prewarmVisibleCardTextures: vi.fn().mockResolvedValue(undefined),
    updateSvgDebugOverlay: vi.fn(),
    // Animator stubs
    animateTransferFromMarket: vi.fn().mockResolvedValue(undefined),
    // HUD animation state
    previousCoins: null,
    previousReputation: null,
    transferAnimationCount: 0,
    activeTransferTweens: new Set(),
    activeTransferVisuals: new Set(),
    hiddenTransferSourceCardIds: new Set(),
  };

  // Derive a simple layout from the state
  mockScene.layout = {
    gameW: 1280,
    gameH: 720,
    handX: 40,
    handY: 620,
    handCardW: 140,
    handCardH: 80,
    handCenterX: 400,
    hudY: 50,
    marketTop: 120,
    marketRowH: 100,
    marketRowGap: 10,
    marketCardW: 140,
    marketCardH: 80,
    marketCardGap: 12,
    marketLabelW: 90,
    queueTop: 340,
    queueCardW: 120,
    queueCardH: 69,
    queueCardGap: 10,
    eventsHeight: 0,
    streetTop: 220,
    slotW: 140,
    slotH: 80,
    slotGap: 20,
    streetX: 40,
    streetRowGap: 12,
    streetCols: 5,
    instructionY: 680,
    actionY: 620,
    actionButtonH: 28,
    actionButtonW: 100,
    hintButtonW: 60,
    smallButtonW: 96,
    challengeX: 0,
    challengeY: 0,
    challengeW: 0,
    logX: 820,
    logY: 340,
    logW: 200,
    logH: 340,
  };

  // Helper to run day start
  mockScene.startDayPhase = () => {
    executeDayStart(mockScene.state);
    mockScene.uiPhase = 'market';
    mockScene.pendingHandIndex = null;
  };

  return mockScene;
}

// ── Tests ───────────────────────────────────────────────────

describe('Hand business card click', () => {
  describe('onHandBusinessCardClick (turn controller)', () => {
    it('sets pendingHandIndex and switches to placing-from-hand during market phase', () => {
      const scene = createMockScene();
      scene.startDayPhase();

      // Add cards to hand
      const bizCard = scene.state.market.development[0];
      if (!bizCard) return; // skip if no market card available
      scene.state.hand = [bizCard];
      scene.pendingHandIndex = null;
      scene.uiPhase = 'market';

      const controller = new MainStreetTurnController(scene);

      // Simulate clicking the first hand card
      controller.onHandBusinessCardClick(0);

      expect(scene.pendingHandIndex).toBe(0);
      expect(scene.uiPhase).toBe('placing-from-hand');
      expect(scene.instructionText.setText).toHaveBeenCalled();
      expect(scene.refreshAll).toHaveBeenCalled();
    });

    it('does nothing during non-market phases', () => {
      const scene = createMockScene();
      scene.startDayPhase();

      const bizCard = scene.state.market.development[0];
      if (!bizCard) return;
      scene.state.hand = [bizCard];
      scene.pendingHandIndex = null;
      scene.uiPhase = 'placing-from-hand'; // not market

      const controller = new MainStreetTurnController(scene);

      controller.onHandBusinessCardClick(0);

      // Should not change since we're not in market phase
      expect(scene.pendingHandIndex).toBeNull();
      // instructionText should not have been called by this handler
      // (only refreshAll might be called if phase check passes)
    });

    it('does nothing during animating phase', () => {
      const scene = createMockScene();
      scene.startDayPhase();

      const bizCard = scene.state.market.development[0];
      if (!bizCard) return;
      scene.state.hand = [bizCard];
      scene.pendingHandIndex = null;
      scene.uiPhase = 'animating'; // not market

      const controller = new MainStreetTurnController(scene);

      controller.onHandBusinessCardClick(0);

      expect(scene.pendingHandIndex).toBeNull();
    });

    it('does nothing during game-over phase', () => {
      const scene = createMockScene();
      scene.startDayPhase();

      const bizCard = scene.state.market.development[0];
      if (!bizCard) return;
      scene.state.hand = [bizCard];
      scene.pendingHandIndex = null;
      scene.uiPhase = 'game-over'; // not market

      const controller = new MainStreetTurnController(scene);

      controller.onHandBusinessCardClick(0);

      expect(scene.pendingHandIndex).toBeNull();
    });

    it('allows switching to a different hand card during placing-from-hand', () => {
      const scene = createMockScene();
      scene.startDayPhase();

      // Add two cards to hand
      const bizCard1 = scene.state.market.development[0];
      const bizCard2 = scene.state.market.development[1];
      if (!bizCard1 || !bizCard2) return;
      scene.state.hand = [bizCard1, bizCard2];
      scene.pendingHandIndex = 0;
      scene.uiPhase = 'placing-from-hand';

      const controller = new MainStreetTurnController(scene);

      // Clicking a different card should switch selection
      controller.onHandBusinessCardClick(1);

      expect(scene.pendingHandIndex).toBe(1);
      expect(scene.uiPhase).toBe('placing-from-hand');
    });
  });

  describe('Scene delegation', () => {
    it('MainStreetScene.onHandBusinessCardClick delegates to turn controller', () => {
      const scene = createMockScene();
      scene.startDayPhase();

      const bizCard = scene.state.market.development[0];
      if (!bizCard) return;
      scene.state.hand = [bizCard];
      scene.pendingHandIndex = null;
      scene.uiPhase = 'market';

      const controller = new MainStreetTurnController(scene);
      // Wire up the scene to delegate to the controller
      scene.onHandBusinessCardClick = (index: number) => {
        controller.onHandBusinessCardClick(index);
      };

      scene.onHandBusinessCardClick(0);

      expect(scene.pendingHandIndex).toBe(0);
      expect(scene.uiPhase).toBe('placing-from-hand');
    });
  });

  describe('Edge cases', () => {
    it('handles out-of-bounds index gracefully', () => {
      const scene = createMockScene();
      scene.startDayPhase();

      const bizCard = scene.state.market.development[0];
      if (!bizCard) return;
      scene.state.hand = [bizCard];
      scene.pendingHandIndex = null;
      scene.uiPhase = 'market';

      const controller = new MainStreetTurnController(scene);

      // Should not throw
      expect(() => controller.onHandBusinessCardClick(99)).not.toThrow();
    });

    it('handles empty hand gracefully', () => {
      const scene = createMockScene();
      scene.startDayPhase();

      scene.state.hand = [];
      scene.pendingHandIndex = null;
      scene.uiPhase = 'market';

      const controller = new MainStreetTurnController(scene);

      // Should not throw
      expect(() => controller.onHandBusinessCardClick(0)).not.toThrow();
    });

    it('tutorial gating prevents action when tutorial disallows it', () => {
      const scene = createMockScene();
      scene.startDayPhase();

      const bizCard = scene.state.market.development[0];
      if (!bizCard) return;
      scene.state.hand = [bizCard];
      scene.pendingHandIndex = null;
      scene.uiPhase = 'market';

      // Tutorial blocks the action
      scene.msLifecycleManager.isTutorialActionAllowed = vi.fn().mockReturnValue({
        allowed: false,
        reason: 'Complete the highlighted step first.',
      });

      const controller = new MainStreetTurnController(scene);

      controller.onHandBusinessCardClick(0);

      // Should have been blocked by tutorial
      expect(scene.pendingHandIndex).toBeNull();
      expect(scene.uiPhase).toBe('market');
      expect(scene.instructionText.setText).toHaveBeenCalledWith(
        'Complete the highlighted step first.',
      );
    });
  });
});
