/**
 * GymHandPileScene drag-and-drop browser test.
 *
 * Boots the GymHandPileScene directly, enables drag mode, and
 * simulates dragging a card from the hand to the discard pile zone.
 * Verifies that the card is accepted and moved to the discard pile.
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
  const game = createGymHandPileGame();
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

function findButtonByText(scene: Phaser.Scene, text: string): Phaser.GameObjects.Text | null {
  const children = (scene as any).children?.getAll?.() ?? [];
  for (const obj of children) {
    if (obj instanceof Phaser.GameObjects.Text && typeof obj.text === 'string' && obj.text.includes(text)) {
      return obj;
    }
  }
  return null;
}

function getHandView(scene: Phaser.Scene): any {
  return (scene as any).handView;
}

/**
 * Click a Phaser text button by finding its game object and
 * dispatching pointer events as the Phaser input system expects.
 */
function clickButton(button: Phaser.GameObjects.Text): void {
  // Phaser text objects with setInteractive listen on their own input zone.
  // We emit 'pointerdown' directly on the game object.
  button.emit('pointerdown');
}

/**
 * Simulate a complete drag gesture: pointerdown on a card sprite,
 * pointermove to destination, pointerup.
 *
 * @param sprite     The card sprite to start dragging
 * @param startX     Pointer X when clicking the card
 * @param startY     Pointer Y when clicking the card
 * @param destX      Pointer X at drop position
 * @param destY      Pointer Y at drop position
 * @param scene      The Phaser scene (to emit scene-level events)
 */
function simulateDrag(
  sprite: Phaser.GameObjects.Image,
  startX: number,
  startY: number,
  destX: number,
  destY: number,
  scene: Phaser.Scene,
): void {
  // 1. Pointer down on the card sprite — triggers HandView's pointerdown handler
  //    which sets drag state and registers scene-level listeners.
  sprite.emit('pointerdown', { x: startX, y: startY });

  // 2. Pointer moves — triggers HandView's _boundPointerMove via scene.input
  //    We emit multiple moves, the last one at the drop position.
  const midX = (startX + destX) / 2;
  const midY = (startY + destY) / 2;

  // First move just past threshold (5px) to start the drag
  scene.input.emit('pointermove', { x: startX + 10, y: startY + 10 });
  // Intermediate move
  scene.input.emit('pointermove', { x: midX, y: midY });
  // Final move at drop position
  scene.input.emit('pointermove', { x: destX, y: destY });

  // 3. Pointer up — triggers HandView's _boundPointerUp, which evaluates
  //    the validator using the last setDragTargetPileIndex() value.
  scene.input.emit('pointerup', { x: destX, y: destY });
}

/** Wait for the hand display to update after a drag operation. */
function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Tests ───────────────────────────────────────────────────

describe('GymHandPileScene drag-and-drop', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => {
    destroyGame(game);
    game = null;
  });

  it('drags a card from hand to discard pile on accepting zone', async () => {
    game = await bootGame();
    const scene = game.scene.getScene(SCENE_KEY) as any;
    expect(scene).toBeDefined();

    // Wait for card textures and initial deal to settle
    await wait(500);

    // Get the HandView
    const handView = getHandView(scene);
    expect(handView).toBeDefined();

    // Verify we have cards in the hand initially
    const initialHandSize = handView.getCards().length;
    expect(initialHandSize).toBeGreaterThan(0);

    // Get initial discard pile size
    const discardPile = scene.discardPile as any;
    const initialDiscardSize = discardPile.size();

    // ── Enable drag mode ──────────────────────────────────
    const enableBtn = findButtonByText(scene, 'Enable Drag');
    expect(enableBtn).toBeTruthy();
    clickButton(enableBtn!);

    // Wait a frame for the drag validator to be registered
    await wait(100);

    // Verify drag is enabled
    expect(handView.getDragEnabled()).toBe(true);

    // ── Drag a card to the discard pile zone ──────────────
    const firstCardSprite = handView.getSpriteAt(0);
    expect(firstCardSprite).toBeDefined();

    // Discard pile is at (DISCARD_X=1120, PILE_Y=250)
    const DISCARD_X = 1120;
    const PILE_Y = 250;

    // Start drag from card's current position
    simulateDrag(
      firstCardSprite,
      firstCardSprite.x,
      firstCardSprite.y,
      DISCARD_X,
      PILE_Y + 10, // slightly below center, still within generous zone
      scene,
    );

    // Wait for the acceptance animation + delayed card move (50ms)
    await wait(400);

    // ── Verify the card was moved ─────────────────────────
    // Hand should have one fewer card
    expect(handView.getCards().length).toBe(initialHandSize - 1);

    // Discard pile should have one more card
    expect(discardPile.size()).toBe(initialDiscardSize + 1);
  });

  it('does not move card when dropped outside pile zones', async () => {
    game = await bootGame();
    const scene = game.scene.getScene(SCENE_KEY) as any;
    expect(scene).toBeDefined();
    await wait(500);

    const handView = getHandView(scene);
    const initialHandSize = handView.getCards().length;

    // Enable drag
    const enableBtn = findButtonByText(scene, 'Enable Drag');
    expect(enableBtn).toBeTruthy();
    clickButton(enableBtn!);
    await wait(100);

    // Drag a card to a position far from any pile zone (top-left corner)
    const firstCardSprite = handView.getSpriteAt(0);
    expect(firstCardSprite).toBeDefined();

    simulateDrag(
      firstCardSprite,
      firstCardSprite.x,
      firstCardSprite.y,
      50,  // far left
      50,  // far top
      scene,
    );

    // Wait for the snap-back animation (200ms) + scene's delayed rebuild (200ms)
    await wait(500);

    // Hand should still have the same number of cards
    expect(handView.getCards().length).toBe(initialHandSize);
  });
});
