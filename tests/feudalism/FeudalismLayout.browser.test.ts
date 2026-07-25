/**
 * FeudalismScene layout regression tests.
 *
 * Guards against layout regressions where UI sections (patrons, market,
 * supply, player/AI areas, action buttons, instruction text) overlap
 * each other or extend beyond the game viewport.
 *
 * Previous issues:
 *   - Action buttons (ACTION_Y=618) and instruction text overlapped the
 *     player/AI status section boxes (bottom edge at ~606)
 *
 * These tests run inside a real Chromium browser via Vitest browser mode
 * and Playwright. They boot the Feudalism scene and verify that all UI
 * sections are correctly positioned without overlaps.
 *
 * NOTE: Each test boots a fresh Phaser game which creates a WebGL context.
 * We keep total boots per file <= 3 to avoid context exhaustion.
 */

import { describe, it, expect, afterEach } from 'vitest';
import Phaser from 'phaser';
import { waitForScene } from '../helpers/waitForScene';

// ── Constants (must match FeudalismScene / ui constants) ────
const GAME_W = 1280;
const GAME_H = 720;

// ── Types ───────────────────────────────────────────────────

interface Rect {
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

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

/**
 * Get scene typed as FeudalismScene so we can call test accessors
 * and access containers.
 */
function getSceneInternals(scene: Phaser.Scene): {
  // Containers for containerBounds() measurement
  patronContainer: Phaser.GameObjects.Container;
  marketContainer: Phaser.GameObjects.Container;
  supplyContainer: Phaser.GameObjects.Container;
  playerContainer: Phaser.GameObjects.Container;
  aiContainer: Phaser.GameObjects.Container;
  actionContainer: Phaser.GameObjects.Container;
  instructionText: Phaser.GameObjects.Text;
  // Test accessor methods
  getSectionBoxRects: () => {
    patrons: { x: number; y: number; w: number; h: number };
    market: { x: number; y: number; w: number; h: number };
    supply: { x: number; y: number; w: number; h: number };
    player: { x: number; y: number; w: number; h: number };
    ai: { x: number; y: number; w: number; h: number };
  };
  getLayoutConstants: () => {
    actionY: number;
    instructionY: number;
    gameW: number;
    gameH: number;
    actionButtonH: number;
  };
} {
   
  return scene as any;
}

/**
 * Compute the bounding box of all children in a Phaser container.
 * Handles Text, Image, Rectangle, Circle, and nested Container objects.
 * Returns null if container has no children with computable bounds.
 */
function containerBounds(
  container: Phaser.GameObjects.Container,
  label: string,
): Rect | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

   
  function processObject(obj: any, offsetX: number, offsetY: number): void {
    if (obj instanceof Phaser.GameObjects.Container) {
      for (const child of obj.list) {
        processObject(child, offsetX + obj.x, offsetY + obj.y);
      }
      return;
    }

    if (typeof obj.x !== 'number' || typeof obj.y !== 'number') return;

    const worldX = offsetX + obj.x;
    const worldY = offsetY + obj.y;

    // Circle objects have a radius property
    if (typeof obj.radius === 'number' && obj.radius > 0) {
      const r = obj.radius;
      minX = Math.min(minX, worldX - r);
      minY = Math.min(minY, worldY - r);
      maxX = Math.max(maxX, worldX + r);
      maxY = Math.max(maxY, worldY + r);
      return;
    }

    // Text, Image, Rectangle, etc.
    const dw = obj.displayWidth ?? 0;
    const dh = obj.displayHeight ?? 0;
    const ox = obj.originX ?? 0;
    const oy = obj.originY ?? 0;

    const left = worldX - dw * ox;
    const top = worldY - dh * oy;
    const right = left + dw;
    const bottom = top + dh;

    minX = Math.min(minX, left);
    minY = Math.min(minY, top);
    maxX = Math.max(maxX, right);
    maxY = Math.max(maxY, bottom);
  }

  for (const child of container.list as Phaser.GameObjects.GameObject[]) {
    processObject(child, container.x, container.y);
  }

  if (minX === Infinity) return null;

  return {
    label,
    x: minX,
    y: minY,
    w: maxX - minX,
    h: maxY - minY,
  };
}

/**
 * Convert a raw box (from getSectionBoxRects) to a labelled Rect.
 */
function toRect(
  box: { x: number; y: number; w: number; h: number },
  label: string,
): Rect {
  return { label, ...box };
}

/**
 * Check if two rectangles overlap vertically and horizontally.
 * Returns true if they overlap.
 */
function rectsOverlap(a: Rect, b: Rect): boolean {
  const aRight = a.x + a.w;
  const aBottom = a.y + a.h;
  const bRight = b.x + b.w;
  const bBottom = b.y + b.h;

  // No overlap if one is entirely left, right, above, or below the other
  if (aRight <= b.x || bRight <= a.x) return false;
  if (aBottom <= b.y || bBottom <= a.y) return false;

  return true;
}

// ── Tests ───────────────────────────────────────────────────

describe('FeudalismScene layout regression tests', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => {
    destroyGame(game);
    game = null;
  });

  // ── Test 1: Upper band sections do not overlap each other ──
  it('should have non-overlapping upper band sections (patrons, market, supply)', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('FeudalismScene')!;
    const internals = getSceneInternals(scene);

    // Use section box rects for accurate geometry (includes drawn backgrounds)
    const boxes = internals.getSectionBoxRects();
    const patrons = toRect(boxes.patrons, 'Patrons');
    const market = toRect(boxes.market, 'Market');
    const supply = toRect(boxes.supply, 'Supply');

    // Patrons should be to the left of market
    expect(
      patrons.x + patrons.w,
      `Patrons right edge (${patrons.x + patrons.w}) should be left of Market left edge (${market.x})`,
    ).toBeLessThanOrEqual(market.x);

    // Market should be to the left of supply
    expect(
      market.x + market.w,
      `Market right edge (${market.x + market.w}) should be left of Supply left edge (${supply.x})`,
    ).toBeLessThanOrEqual(supply.x);

    // Verify all upper band section boxes are within viewport
    for (const section of [patrons, market, supply]) {
      expect(
        section.x,
        `${section.label} left edge (${section.x}) should be >= 0`,
      ).toBeGreaterThanOrEqual(0);
      expect(
        section.x + section.w,
        `${section.label} right edge (${section.x + section.w}) should be <= ${GAME_W}`,
      ).toBeLessThanOrEqual(GAME_W);
      expect(
        section.y,
        `${section.label} top edge (${section.y}) should be >= 0`,
      ).toBeGreaterThanOrEqual(0);
      expect(
        section.y + section.h,
        `${section.label} bottom edge (${section.y + section.h}) should be <= ${GAME_H}`,
      ).toBeLessThanOrEqual(GAME_H);
    }
  });

  // ── Test 2: Player/AI section boxes do not overlap action buttons or instruction text ──
  it('should not overlap player/AI section boxes with action buttons or instruction text', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('FeudalismScene')!;
    const internals = getSceneInternals(scene);

    // Section box rects give us the actual drawn background geometry
    const boxes = internals.getSectionBoxRects();
    const playerBox = toRect(boxes.player, 'Player box');
    const aiBox = toRect(boxes.ai, 'AI box');

    // Layout constants for action/instruction positioning
    const lc = internals.getLayoutConstants();

    // Action buttons: centred at actionY, height actionButtonH
    // The button top edge is actionY - actionButtonH/2
    const actionTopEdge = lc.actionY - lc.actionButtonH / 2;

    // Player/AI section box bottom edges must be above action button top edges
    const playerBoxBottom = playerBox.y + playerBox.h;
    const aiBoxBottom = aiBox.y + aiBox.h;

    expect(
      playerBoxBottom,
      `Player section box bottom (${playerBoxBottom}) should be <= action button top (${actionTopEdge})`,
    ).toBeLessThanOrEqual(actionTopEdge);

    expect(
      aiBoxBottom,
      `AI section box bottom (${aiBoxBottom}) should be <= action button top (${actionTopEdge})`,
    ).toBeLessThanOrEqual(actionTopEdge);

    // Also verify via containerBounds that actual content doesn't overlap
    const actions = containerBounds(internals.actionContainer, 'Actions');
    if (actions) {
      expect(
        rectsOverlap(playerBox, actions),
        `Player section box (bottom: ${playerBoxBottom}) should not overlap action buttons (top: ${actions.y})`,
      ).toBe(false);
      expect(
        rectsOverlap(aiBox, actions),
        `AI section box (bottom: ${aiBoxBottom}) should not overlap action buttons (top: ${actions.y})`,
      ).toBe(false);
    }

    // Instruction text should not overlap player/AI section boxes
    const instrText = internals.instructionText;
    if (instrText && instrText.text.length > 0) {
      const instrRect: Rect = {
        label: 'Instruction',
        x: instrText.x - instrText.displayWidth * instrText.originX,
        y: instrText.y - instrText.displayHeight * instrText.originY,
        w: instrText.displayWidth,
        h: instrText.displayHeight,
      };
      expect(
        rectsOverlap(instrRect, playerBox),
        `Instruction text should not overlap Player section box`,
      ).toBe(false);
      expect(
        rectsOverlap(instrRect, aiBox),
        `Instruction text should not overlap AI section box`,
      ).toBe(false);
    }

    // Player and AI boxes should not overlap each other
    expect(
      rectsOverlap(playerBox, aiBox),
      `Player section box should not overlap AI section box`,
    ).toBe(false);

    // All lower band section boxes should be within viewport
    for (const section of [playerBox, aiBox]) {
      expect(
        section.x,
        `${section.label} left edge should be >= 0`,
      ).toBeGreaterThanOrEqual(0);
      expect(
        section.x + section.w,
        `${section.label} right edge (${section.x + section.w}) should be <= ${GAME_W}`,
      ).toBeLessThanOrEqual(GAME_W);
      expect(
        section.y,
        `${section.label} top edge should be >= 0`,
      ).toBeGreaterThanOrEqual(0);
      expect(
        section.y + section.h,
        `${section.label} bottom edge (${section.y + section.h}) should be <= ${GAME_H}`,
      ).toBeLessThanOrEqual(GAME_H);
    }
  });

  // ── Test 3: Action bar and instruction text do not overlap each other ──
  it('should not overlap action buttons with instruction text', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('FeudalismScene')!;
    const internals = getSceneInternals(scene);

    const actions = containerBounds(internals.actionContainer, 'Actions');
    const instrText = internals.instructionText;

    // Both should exist (scene starts in player-turn phase with visible actions and instruction)
    expect(actions, 'Action container should have content').not.toBeNull();
    expect(instrText.text.length, 'Instruction text should not be empty').toBeGreaterThan(0);

    const instrRect: Rect = {
      label: 'Instruction',
      x: instrText.x - instrText.displayWidth * instrText.originX,
      y: instrText.y - instrText.displayHeight * instrText.originY,
      w: instrText.displayWidth,
      h: instrText.displayHeight,
    };

    // Action buttons should be fully above instruction text
    expect(
      rectsOverlap(actions!, instrRect),
      `Action buttons (bottom: ${actions!.y + actions!.h}) should not overlap ` +
      `instruction text (top: ${instrRect.y})`,
    ).toBe(false);

    // Both should be within viewport
    expect(
      actions!.y + actions!.h,
      `Action buttons bottom edge should be <= ${GAME_H}`,
    ).toBeLessThanOrEqual(GAME_H);

    expect(
      instrRect.y + instrRect.h,
      `Instruction text bottom edge (${instrRect.y + instrRect.h}) should be <= ${GAME_H}`,
    ).toBeLessThanOrEqual(GAME_H);
  });
});
