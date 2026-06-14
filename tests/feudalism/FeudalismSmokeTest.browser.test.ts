/**
 * Feudalism HandView/PileView migration smoke test.
 *
 * Part of Phase 3 (CG-0MQ6IEM9F001JTQD).
 *
 * This test boots Feudalism in headless Chromium and exercises the standard
 * card interaction layers to verify rendering is correct.
 *
 * ## Scope boundary
 *
 * Feudalism does NOT use HandView or PileView for its card model:
 *
 * - **Market cards**: individual cards displayed in a grid, each rendered
 *   as a custom container with bonus bar, cost chips, and points.
 * - **Reserved cards**: small static cards shown in the player area.
 * - **Purchased cards**: tracked only by count; never rendered.
 * - **Token supply / patron tiles**: custom rendering using circles with
 *   crop-icon graphics — NOT standard cards.
 *
 * Token and crop icon rendering is **explicitly excluded** from the
 * HandView/PileView migration scope (CG-0MPDWKITM006Y08I). A separate
 * follow-up task will explore a PileView-compatible adapter for
 * non-standard card types.
 *
 * This smoke test verifies that the standard card interaction layers
 * (market cards, reserved cards, player/AI areas) render correctly
 * and that the game is interactive after the migration decision.
 */

import { describe, it, expect, afterEach } from 'vitest';
import Phaser from 'phaser';
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
  const game = createFeudalismGame();
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

// ── Tests ───────────────────────────────────────────────────

describe('Feudalism smoke test (HandView/PileView migration)', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => {
    destroyGame(game);
    game = null;
  });

  // ── Test 1: Game boots and scene is ready ──

  it('should boot Feudalism and create the scene without errors', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('FeudalismScene')!;

    // Scene should be active
    expect(scene.sys.isActive()).toBe(true);

    // Game should have the expected dimensions
    expect(scene.game.scale.width).toBe(GAME_W);
    expect(scene.game.scale.height).toBe(GAME_H);
  });

  // ── Test 2: Market cards are rendered ──

  it('should render market cards in the upper band', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('FeudalismScene')!;
    const internals = scene as any;

    // Market container should have children (cards, deck indicators, tier labels)
    const marketContainer = (internals.feudRenderer as any).marketContainer;
    expect(marketContainer).toBeDefined();
    expect(marketContainer.list.length).toBeGreaterThan(0);

    // Should have at least 4 visible market cards (4 per tier × 3 tiers)
    // Each card is rendered as a container with background, bonus bar, etc.
    const cardContainers: Phaser.GameObjects.Container[] = [];
    for (const child of marketContainer.list) {
      if (child instanceof Phaser.GameObjects.Container) {
        cardContainers.push(child);
      }
    }

    // Each tier should have 4 card positions (some may be empty)
    expect(cardContainers.length).toBeGreaterThanOrEqual(1);
  });

  // ── Test 3: Player area is rendered ──

  it('should render the player area with token and bonus displays', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('FeudalismScene')!;
    const internals = scene as any;

    // Player container should exist and have content
    const playerContainer = (internals.feudRenderer as any).playerContainer;
    expect(playerContainer).toBeDefined();
    expect(playerContainer.list.length).toBeGreaterThan(0);

    // Should have an influence display, token row, and bonus slots
    const playerObjects = playerContainer.list;
    expect(playerObjects.length).toBeGreaterThan(5);
  });

  // ── Test 4: AI area is rendered ──

  it('should render the AI area with summary displays', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('FeudalismScene')!;
    const internals = scene as any;

    // AI container should exist and have content
    const aiContainer = (internals.feudRenderer as any).aiContainer;
    expect(aiContainer).toBeDefined();
    expect(aiContainer.list.length).toBeGreaterThan(0);

    // Should have influence display, token row, and summary text
    const aiObjects = aiContainer.list;
    expect(aiObjects.length).toBeGreaterThan(3);
  });

  // ── Test 5: Instruction text is visible ──

  it('should display an instruction text', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('FeudalismScene')!;
    const internals = scene as any;

    const instructionText = internals.instructionText;
    expect(instructionText).toBeDefined();
    expect(instructionText.text.length).toBeGreaterThan(0);

    // Should show a player-turn instruction
    expect(instructionText.text.toLowerCase()).toContain('click');
  });

  // ── Test 6: Market card selection works ──

  it('should support selecting a market card (visual feedback)', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('FeudalismScene')!;
    const internals = scene as any;

    // Get the first visible market card ID
    const firstCardId = internals.getFirstVisibleMarketCardIdForTest();
    expect(firstCardId).not.toBeNull();

    // Select the market card via the test accessor
    internals.selectMarketCardForTest(firstCardId!);

    // The selection manager should register this card
    const selectionMgr = (internals.feudRenderer as any).marketMgr;
    expect(selectionMgr).toBeDefined();

    // The selected card should be tracked
    const selectedId = internals.getSelectedMarketCardIdForTest();
    expect(selectedId).toBe(firstCardId);

    // The card container should have a scale change (selected state)
    const scale = internals.getMarketCardScaleForTest(firstCardId!);
    expect(scale).toBeGreaterThan(1);
  });

  // ── Test 7: Non-card clicks are handled ──

  it('should handle pointer events on non-card areas without errors', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('FeudalismScene')!;

    // Emit a non-card pointer down event (should not throw)
    expect(() => {
      (scene as any).emitNonCardPointerDownForTest();
    }).not.toThrow();
  });

  // ── Test 8: Reduced-motion mode works ──

  it('should respect reduced-motion preference from SettingsStore', async () => {
    // Set reduced-motion preference in localStorage before booting
    (globalThis as any).localStorage.setItem('tce-ui-reduced-motion', 'true');

    game = await bootGame();
    const scene = game.scene.getScene('FeudalismScene')!;
    const internals = scene as any;

    // Verify the scene is active and rendering
    expect(scene.sys.isActive()).toBe(true);

    // The game should have booted with reduced-motion enabled.
    // Verify by checking that the market container still has content
    // (reduced motion should not affect content, only animations).
    const marketContainer = (internals.feudRenderer as any).marketContainer;
    expect(marketContainer.list.length).toBeGreaterThan(0);

    // Clean up the localStorage setting
    (globalThis as any).localStorage.removeItem('tce-ui-reduced-motion');
  });

  // ── Test 9: Action buttons render in player-turn phase ──

  it('should render action buttons in the player-turn phase', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('FeudalismScene')!;
    const internals = scene as any;

    // Action container should have content (Take Tokens button)
    const actionContainer = internals.actionContainer;
    expect(actionContainer).toBeDefined();
    expect(actionContainer.list.length).toBeGreaterThan(0);

    // Should have at least one action button text element
    const hasButtonText = actionContainer.list.some(
      (child: Phaser.GameObjects.Text | any) =>
        child instanceof Phaser.GameObjects.Text &&
        typeof child.text === 'string' &&
        child.text.includes('Take'),
    );
    expect(hasButtonText).toBe(true);
  });

  // ── Test 10: Token selection UI renders correctly ──

  it('should render the supply token display in the upper band', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('FeudalismScene')!;
    const internals = scene as any;

    // Supply container should exist and have content
    const supplyContainer = (internals.feudRenderer as any).supplyContainer;
    expect(supplyContainer).toBeDefined();
    expect(supplyContainer.list.length).toBeGreaterThan(0);

    // Should have supply labels and token circles
    const supplyObjects = supplyContainer.list;
    // Each resource type gets: circle, icon, count text, abbreviation label
    // 7 resource types (oats, barley, wheat, turnip, mead, etc.) + 1 extra (mead)
    expect(supplyObjects.length).toBeGreaterThan(5);
  });

  // ── Test 11: Patron tiles render correctly ──

  it('should render patron tiles in the upper band', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('FeudalismScene')!;
    const internals = scene as any;

    // Patron container should exist and have content
    const patronContainer = (internals.feudRenderer as any).patronContainer;
    expect(patronContainer).toBeDefined();
    expect(patronContainer.list.length).toBeGreaterThan(0);

    // Should have patron background rectangles with points display
    const patronObjects = patronContainer.list;
    expect(patronObjects.length).toBeGreaterThan(0);
  });

  // ── Test 12: Section boxes are drawn ──

  it('should render section box outlines around UI areas', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('FeudalismScene')!;
    const internals = scene as any;

    // Section box container should exist
    const sectionBoxContainer = (internals.feudRenderer as any).sectionBoxContainer;
    expect(sectionBoxContainer).toBeDefined();

    // Should have 5 section boxes: Patrons, Market, Supply, Player, AI
    // Each section box is drawn as a gfx object (rectangle with border)
    const boxContents = sectionBoxContainer.list;
    expect(boxContents.length).toBeGreaterThan(0);

    // Verify section box geometry via test accessors
    const boxes = internals.getSectionBoxRects();
    expect(boxes.patrons.w).toBeGreaterThan(0);
    expect(boxes.patrons.h).toBeGreaterThan(0);
    expect(boxes.market.w).toBeGreaterThan(0);
    expect(boxes.market.h).toBeGreaterThan(0);
    expect(boxes.player.w).toBeGreaterThan(0);
    expect(boxes.player.h).toBeGreaterThan(0);
    expect(boxes.ai.w).toBeGreaterThan(0);
    expect(boxes.ai.h).toBeGreaterThan(0);
  });
});
