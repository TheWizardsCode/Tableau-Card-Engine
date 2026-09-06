/**
 * GymHandPileScene outline visibility browser test.
 *
 * Boots the GymHandPileScene and verifies that ghost card-position outlines
 * are rendered correctly: created when enabled, repositioned on layout change,
 * and destroyed when toggled off.
 *
 * NOTE: Each test boots a fresh Phaser game (WebGL context).
 * Keep the total boots per file <= 3.
 */
import { describe, it, expect, afterEach } from 'vitest';
import Phaser from 'phaser';
import { waitForScene } from '../helpers/waitForScene';

// ── Constants ───────────────────────────────────────────────
const SCENE_KEY = 'GymHandPileScene';

// ── Helpers ─────────────────────────────────────────────────

async function bootGame(): Promise<Phaser.Game> {
  let container = document.getElementById('game-container');
  if (container) container.remove();
  container = document.createElement('div');
  container.id = 'game-container';
  document.body.appendChild(container);

  const { createGymHandPileGame } = await import(
    '../../example-games/gym/createGymHandPileGame'
  );
  const game = createGymHandPileGame({ type: Phaser.CANVAS });
  await waitForScene(game, SCENE_KEY);
  return game;
}

function destroyGame(game: Phaser.Game | null): void {
  if (game) {
    game.destroy(true, false);
  }
  const container = document.getElementById('game-container');
  if (container) container.remove();
}

function getHandView(scene: Phaser.Scene): any {
  return (scene as any).handView;
}

/** Wait for display updates to settle. */
function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Tests ───────────────────────────────────────────────────

describe('GymHandPileScene outlines', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => {
    destroyGame(game);
    game = null;
  });

  it('creates outline rects when outlines are ON', async () => {
    game = await bootGame();
    const scene = game.scene.getScene(SCENE_KEY) as any;
    expect(scene).toBeDefined();

    // Wait for card textures and initial deal to settle
    await wait(800);

    const handView = getHandView(scene);
    expect(handView).toBeDefined();

    // Outlines should be ON by default in GymHandPileScene
    expect(handView.getShowPositionOutlines()).toBe(true);

    // Get outline rectangles from the hand view
    const outlineRects = (handView as any).outlineRects;
    expect(outlineRects).toBeDefined();
    expect(Array.isArray(outlineRects)).toBe(true);

    // Hand size is 5, maxSlots is 7 (HAND_SIZE + 2)
    // So there should be 7 outline rectangles
    const cardCount = handView.getCards().length;
    const maxSlots = handView.getMaxSlots();
    expect(cardCount).toBeGreaterThan(0);
    expect(maxSlots).toBeGreaterThan(cardCount);
    expect(outlineRects.length).toBe(maxSlots);

    // Verify outline rectangles are active Phaser objects
    for (const rect of outlineRects) {
      expect(rect.active).toBe(true);
      expect(typeof rect.setDepth).toBe('function');
      expect(typeof rect.setPosition).toBe('function');
    }

    // Verify outlines are behind card sprites (depth index - 0.5)
    for (let i = 0; i < outlineRects.length; i++) {
      expect(outlineRects[i].depth).toBe(i - 0.5);
    }

    // Verify outline dimensions match CARD_W x CARD_H
    for (const rect of outlineRects) {
      expect(rect.width).toBe(96);
      expect(rect.height).toBe(130);
    }
  });

  it('outlines toggle OFF and back ON via API', async () => {
    game = await bootGame();
    const scene = game.scene.getScene(SCENE_KEY) as any;
    expect(scene).toBeDefined();
    await wait(800);

    const handView = getHandView(scene);
    expect(handView).toBeDefined();
    expect(handView.getShowPositionOutlines()).toBe(true);

    const initialCount = (handView as any).outlineRects.length;
    expect(initialCount).toBeGreaterThan(0);

    // Toggle outlines OFF via HandView API (same as what the button does)
    handView.setShowPositionOutlines(false);
    await wait(100);

    const afterOff = (handView as any).outlineRects;
    for (const rect of afterOff) {
      expect(rect.active).toBe(false);
    }
    expect(handView.getShowPositionOutlines()).toBe(false);

    // Toggle outlines ON again
    handView.setShowPositionOutlines(true);
    await wait(100);

    // New outlines should be active
    const afterOn = (handView as any).outlineRects;
    expect(afterOn.length).toBeGreaterThan(0);
    for (const rect of afterOn) {
      expect(rect.active).toBe(true);
    }
    expect(handView.getShowPositionOutlines()).toBe(true);
  });

  it('toggling via button shows and hides outlines', async () => {
    game = await bootGame();
    const scene = game.scene.getScene(SCENE_KEY) as any;
    expect(scene).toBeDefined();
    await wait(800);

    const handView = getHandView(scene);
    expect(handView).toBeDefined();

    // Initial state: ON
    expect(handView.getShowPositionOutlines()).toBe(true);

    // Toggle via button
    const outlinesButton = (scene as any).outlinesButton;
    expect(outlinesButton).toBeDefined();

    outlinesButton.emit('pointerdown');
    await wait(200);
    expect(handView.getShowPositionOutlines()).toBe(false);
    expect(outlinesButton.text).toContain('Outlines OFF');

    outlinesButton.emit('pointerdown');
    await wait(200);
    expect(handView.getShowPositionOutlines()).toBe(true);
    expect(outlinesButton.text).toContain('Outlines ON');
  });

  it('outlines reposition when layout direction changes', async () => {
    game = await bootGame();
    const scene = game.scene.getScene(SCENE_KEY) as any;
    expect(scene).toBeDefined();
    await wait(800);

    const handView = getHandView(scene);
    expect(handView).toBeDefined();
    expect(handView.getShowPositionOutlines()).toBe(true);

    // Record horizontal layout positions
    const outlineRects = (handView as any).outlineRects;
    expect(outlineRects.length).toBeGreaterThan(1);

    const horizontalYs = outlineRects.map((r: any) => r.y);
    expect(horizontalYs.length).toBeGreaterThan(0);

    // Switch to vertical layout via HandView API
    handView.setLayoutDirection('vertical');
    await wait(300);

    const newOutlines = (handView as any).outlineRects;
    expect(newOutlines.length).toBeGreaterThan(0);

    // In vertical cascade, each card has a different Y
    const verticalYs = newOutlines.map((r: any) => r.y);
    const uniqueYs = new Set(verticalYs);
    expect(uniqueYs.size).toBeGreaterThan(1);

    // Restore horizontal — outlines should have the same Y again
    handView.setLayoutDirection('horizontal');
    await wait(300);

    expect(handView.getLayoutDirection()).toBe('horizontal');
    const restoredYs = (handView as any).outlineRects.map((r: any) => r.y);
    // Horizontal layout with arc: center card is slightly above baseY,
    // but the span should be small compared to vertical cascade.
    // Just verify we have outlines and they are all close together.
    expect(restoredYs.length).toBeGreaterThan(1);
    const maxYSpread = Math.max(...restoredYs) - Math.min(...restoredYs);
    // Vertical cascade spread is ~100px, horizontal arc spread is ~20px max
    expect(maxYSpread).toBeLessThan(40);
  });
});
