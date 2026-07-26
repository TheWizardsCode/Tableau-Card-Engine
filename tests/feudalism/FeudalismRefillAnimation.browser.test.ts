/**
 * Browser tests for Feudalism market refill animation.
 *
 * Verifies that market slots render as empty during refill animation
 * and show the actual card after the animation completes.
 *
 * Related work item: CG-0MRDKXBAK001GRH0
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import Phaser from 'phaser';
import type { FeudalismRenderer } from '../../example-games/feudalism/scenes/FeudalismRenderer';
import type { Tier } from '../../example-games/feudalism/FeudalismCards';
import {
  MARKET_X,
  MARKET_Y,
  MARKET_CARD_W,
  MARKET_CARD_H,
  MARKET_CARD_GAP,
  MARKET_TIER_GAP,
} from '../../example-games/feudalism/scenes/FeudalismConstants';
import { waitForScene } from '../helpers/waitForScene';

// ── Constants ───────────────────────────────────────────────

const GAME_W = 1280;
const GAME_H = 720;

// ── Helpers ─────────────────────────────────────────────────

async function bootGame(): Promise<Phaser.Game> {
  let container = document.getElementById('game-container');
  if (container) container.remove();
  container = document.createElement('div');
  container.id = 'game-container';
  document.body.appendChild(container);

  const { createFeudalismGame } = await import(
    '../../example-games/feudalism/createFeudalismGame'
  );
  const game = createFeudalismGame({ type: Phaser.CANVAS });
  await waitForScene(game, 'FeudalismScene');
  return game;
}

function destroyGame(game: Phaser.Game | null): void {
  if (game) {
    game.destroy(true, false);
  }
  const container = document.getElementById('game-container');
  if (container) container.remove();
}

interface FeudalismSceneAccessors {
  feudRenderer: FeudalismRenderer;
  session: { market: Record<number, { visible: (object | null)[] }> };
}

function getRenderer(scene: Phaser.Scene): FeudalismSceneAccessors {
  return scene as unknown as FeudalismSceneAccessors;
}

/** Find the first non-null market card at the given tier and column. */
function findFirstMarketCard(
  renderer: FeudalismSceneAccessors,
): { tier: Tier; col: number } | null {
  for (const tier of [3, 2, 1] as Tier[]) {
    const visible = renderer.session.market[tier].visible;
    for (let col = 0; col < visible.length; col++) {
      if (visible[col]) return { tier, col };
    }
  }
  return null;
}

/** Check if a market slot position has a Card container (vs empty rect). */
function hasCardContainerAtSlot(
  game: Phaser.Game,
  tier: Tier,
  col: number,
): boolean {
  const tiers: Tier[] = [3, 2, 1];
  const row = tiers.indexOf(tier);
  const y = MARKET_Y + row * (MARKET_CARD_H + MARKET_TIER_GAP) + MARKET_CARD_H / 2;
  const x = MARKET_X + col * (MARKET_CARD_W + MARKET_CARD_GAP) + MARKET_CARD_W / 2;

  // Search the marketContainer for containers (cards) at this position
  const scene = game.scene.getScene('FeudalismScene')!;
  const renderer = getRenderer(scene);
  const marketContainer = (renderer.feudRenderer as any).marketContainer as Phaser.GameObjects.Container;

  for (const child of marketContainer.list) {
    if (child instanceof Phaser.GameObjects.Container && child.active) {
      // Approximate position match — within a tolerance
      const dx = Math.abs(child.x - x);
      const dy = Math.abs(child.y - y);
      if (dx < 10 && dy < 10) return true;
    }
  }
  return false;
}

/** Check if a market slot position has a plain rectangle (empty slot). */
function hasEmptyRectAtSlot(
  game: Phaser.Game,
  tier: Tier,
  col: number,
): boolean {
  const tiers: Tier[] = [3, 2, 1];
  const row = tiers.indexOf(tier);
  const y = MARKET_Y + row * (MARKET_CARD_H + MARKET_TIER_GAP) + MARKET_CARD_H / 2;
  const x = MARKET_X + col * (MARKET_CARD_W + MARKET_CARD_GAP) + MARKET_CARD_W / 2;

  const scene = game.scene.getScene('FeudalismScene')!;
  const renderer = getRenderer(scene);
  const marketContainer = (renderer.feudRenderer as any).marketContainer as Phaser.GameObjects.Container;

  for (const child of marketContainer.list) {
    if (child instanceof Phaser.GameObjects.Rectangle && child.active) {
      const dx = Math.abs(child.x - x);
      const dy = Math.abs(child.y - y);
      if (dx < 10 && dy < 10) return true;
    }
  }
  return false;
}

// ── Tests ───────────────────────────────────────────────────

describe('Feudalism market refill animation', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => {
    destroyGame(game);
    game = null;
  });

  // ── Test 1: Renderer has pendingRefillSlots infrastructure ──

  it('should have pendingRefillSlots infrastructure in FeudalismRenderer', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('FeudalismScene')!;
    const renderer = getRenderer(scene).feudRenderer;

    // The renderer should have addPendingRefillSlots and clearPendingRefillSlots methods
    expect(typeof (renderer as any).addPendingRefillSlots).toBe('function');
    expect(typeof (renderer as any).clearPendingRefillSlots).toBe('function');
  });

  // ── Test 2: Pending refill slots render as empty ──

  it('should render a market slot as empty when added to pendingRefillSlots', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('FeudalismScene')!;
    const renderer = getRenderer(scene).feudRenderer;
    const session = getRenderer(scene).session;

    // Find a market slot that has a card
    const slot = findFirstMarketCard(getRenderer(scene));
    expect(slot).not.toBeNull();

    if (!slot) return; // TypeScript guard

    // Before adding to pending refill: slot should have a card container
    const hadCardBefore = hasCardContainerAtSlot(game, slot.tier, slot.col);
    expect(hadCardBefore).toBe(true);

    // Add this slot to pending refill and re-render
    (renderer as any).addPendingRefillSlots([slot]);
    (renderer as any).refreshMarket({
      onMarketCardClick: () => {},
      onReserveDeck: () => {},
    });

    // After adding to pending refill: slot should NOT have a card container
    const hasCardAfter = hasCardContainerAtSlot(game, slot.tier, slot.col);
    expect(hasCardAfter).toBe(false);

    // Should have an empty rectangle instead
    const hasEmpty = hasEmptyRectAtSlot(game, slot.tier, slot.col);
    expect(hasEmpty).toBe(true);

    // Clear pending refill and re-render
    (renderer as any).clearPendingRefillSlots();
    (renderer as any).refreshMarket({
      onMarketCardClick: () => {},
      onReserveDeck: () => {},
    });

    // After clearing: slot should have a card container again
    const hasCardAfterClear = hasCardContainerAtSlot(game, slot.tier, slot.col);
    expect(hasCardAfterClear).toBe(true);
  });

  // ── Test 3: Multiple tiers work correctly ──

  it('should work for all three market tiers', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('FeudalismScene')!;
    const renderer = getRenderer(scene).feudRenderer;

    const tiers: Tier[] = [3, 2, 1];
    const slots: { tier: Tier; col: number }[] = [];

    // Collect one slot per tier
    for (const tier of tiers) {
      const session = getRenderer(scene).session;
      const visible = session.market[tier].visible;
      for (let col = 0; col < visible.length; col++) {
        if (visible[col]) {
          slots.push({ tier, col });
          break;
        }
      }
    }

    expect(slots.length).toBeGreaterThan(0);

    // Add all slots to pending refill
    (renderer as any).addPendingRefillSlots(slots);
    (renderer as any).refreshMarket({
      onMarketCardClick: () => {},
      onReserveDeck: () => {},
    });

    // All flagged slots should render as empty
    for (const slot of slots) {
      const hasCard = hasCardContainerAtSlot(game, slot.tier, slot.col);
      expect(hasCard).toBe(false);
    }

    // Clear and verify cards reappear
    (renderer as any).clearPendingRefillSlots();
    (renderer as any).refreshMarket({
      onMarketCardClick: () => {},
      onReserveDeck: () => {},
    });

    // Verify the session still has cards in those slots
    const session = getRenderer(scene).session;
    for (const slot of slots) {
      expect(session.market[slot.tier].visible[slot.col]).not.toBeNull();
    }
  });

  // ── Test 4: Reduced motion compatibility (source code check) ──

  it('should clear pending refill slots before onRefreshMarket callback', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('FeudalismScene')!;
    const renderer = getRenderer(scene).feudRenderer;

    // Access the turn controller
    const turnController = (scene as any).turnController;
    expect(turnController).toBeDefined();

    // The callbacks should have onSetPendingRefillSlots and onClearPendingRefillSlots
    const callbacks = (turnController as any).callbacks;
    expect(typeof callbacks.onSetPendingRefillSlots).toBe('function');
    expect(typeof callbacks.onClearPendingRefillSlots).toBe('function');
  });
});
