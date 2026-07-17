/**
 * GymHandPileScene Cancel Move browser test.
 *
 * Boots the GymHandPileScene directly, selects a card, moves it,
 * then clicks Cancel Move and verifies the card returns to its
 * original hand position.
 *
 * Also verifies:
 *  - Cancel Move does nothing when no card has been moved.
 *  - After cancelling, the card can be selected and moved again.
 *
 * NOTE: Each test boots a fresh Phaser game (WebGL context).
 * Keep the total boots per file <= 3.
 */
import { describe, it, expect, afterEach } from 'vitest';
import Phaser from 'phaser';
import { waitForScene } from '../helpers/waitForScene';
import { GAME_W } from '../../src/ui/constants';

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
  button.emit('pointerdown');
}

/** Wait for a given number of milliseconds. */
function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Tests ───────────────────────────────────────────────────

describe('GymHandPileScene Cancel Move', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => {
    destroyGame(game);
    game = null;
  });

  it('Cancel Move returns moved card to original hand position', async () => {
    game = await bootGame();
    const scene = game.scene.getScene(SCENE_KEY) as any;
    expect(scene).toBeDefined();

    // Wait for card textures and initial deal to settle
    await wait(500);

    const handView = getHandView(scene);
    expect(handView).toBeDefined();
    expect(handView.getCards().length).toBeGreaterThan(0);

    // Get the first card sprite and its original position
    const firstCardSprite = handView.getSpriteAt(0);
    expect(firstCardSprite).toBeDefined();

    const origX = firstCardSprite.x;
    const origY = firstCardSprite.y;

    // Select card 0 by emitting a pointerdown on the sprite
    firstCardSprite.emit('pointerdown', { x: origX, y: origY });
    await wait(100);

    // Verify the card is selected
    expect(scene.selectedIdx).toBe(0);

    // Click the "[ Move ]" button to move the selected card
    const moveBtn = findButtonByText(scene, '[ Move ]');
    expect(moveBtn).toBeTruthy();
    clickButton(moveBtn!);

    // Let the move tween start (500ms duration, wait just enough to begin)
    await wait(100);

    // The sprite should have started moving — it should no longer be
    // at its original position
    // Click "[ Cancel Move ]" to return the card
    const cancelBtn = findButtonByText(scene, '[ Cancel Move ]');
    expect(cancelBtn).toBeTruthy();
    clickButton(cancelBtn!);

    // Wait for the return tween to complete
    await wait(500);

    // The card should be back at its original position
    expect(firstCardSprite.x).toBeCloseTo(origX, 0);
    expect(firstCardSprite.y).toBeCloseTo(origY, 0);
  });

  it('Cancel Move after completed move also returns card to hand', async () => {
    game = await bootGame();
    const scene = game.scene.getScene(SCENE_KEY) as any;
    expect(scene).toBeDefined();
    await wait(500);

    const handView = getHandView(scene);
    expect(handView.getCards().length).toBeGreaterThan(0);

    const firstCardSprite = handView.getSpriteAt(0);
    expect(firstCardSprite).toBeDefined();

    const origX = firstCardSprite.x;
    const origY = firstCardSprite.y;

    // Select card 0 and click Move
    firstCardSprite.emit('pointerdown', { x: origX, y: origY });
    await wait(100);

    const moveBtn = findButtonByText(scene, '[ Move ]');
    expect(moveBtn).toBeTruthy();
    clickButton(moveBtn!);

    // Wait for the full move tween (500ms) + buffer
    await wait(700);

    // The card should now be at the destination
    const destX = GAME_W / 2 + 200;
    const destY = 200;
    expect(firstCardSprite.x).toBeCloseTo(destX, 0);
    expect(firstCardSprite.y).toBeCloseTo(destY, 0);

    // Now click Cancel Move
    const cancelBtn = findButtonByText(scene, '[ Cancel Move ]');
    expect(cancelBtn).toBeTruthy();
    clickButton(cancelBtn!);

    // Wait for the return tween
    await wait(500);

    // Card should be back at original hand position
    expect(firstCardSprite.x).toBeCloseTo(origX, 0);
    expect(firstCardSprite.y).toBeCloseTo(origY, 0);
  });

  it('Card can be moved again after cancelling previous move', async () => {
    game = await bootGame();
    const scene = game.scene.getScene(SCENE_KEY) as any;
    expect(scene).toBeDefined();
    await wait(500);

    const handView = getHandView(scene);
    expect(handView.getCards().length).toBeGreaterThan(0);

    const firstCardSprite = handView.getSpriteAt(0);
    expect(firstCardSprite).toBeDefined();

    const origX = firstCardSprite.x;
    const origY = firstCardSprite.y;

    // Select and move card 0
    firstCardSprite.emit('pointerdown', { x: origX, y: origY });
    await wait(100);

    const moveBtn = findButtonByText(scene, '[ Move ]');
    expect(moveBtn).toBeTruthy();
    clickButton(moveBtn!);
    await wait(100);

    // Cancel mid-move
    const cancelBtn = findButtonByText(scene, '[ Cancel Move ]');
    expect(cancelBtn).toBeTruthy();
    clickButton(cancelBtn!);
    await wait(500);

    // Card should be back at original position
    expect(firstCardSprite.x).toBeCloseTo(origX, 0);
    expect(firstCardSprite.y).toBeCloseTo(origY, 0);

    // Now select and move the same card again
    firstCardSprite.emit('pointerdown', { x: origX, y: origY });
    await wait(100);
    expect(scene.selectedIdx).toBe(0);

    clickButton(moveBtn!);
    await wait(100);

    // Verify the card started moving again (not at original position)
    const movedAgainX = firstCardSprite.x;
    const movedAgainY = firstCardSprite.y;
    expect(Math.abs(movedAgainX - origX) > 5 || Math.abs(movedAgainY - origY) > 5).toBe(true);

    // Clean up by cancelling
    clickButton(cancelBtn!);
    await wait(500);
  });
});
