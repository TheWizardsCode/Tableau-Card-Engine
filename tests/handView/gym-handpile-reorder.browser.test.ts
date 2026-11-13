/**
 * GymHandPileScene drag-to-reorder browser test.
 *
 * Boots the GymHandPileScene and drives a real pointer gesture inside the
 * hand row: with reorder ON (the scene default) dragging a card past the last
 * card's centre appends it, and the scene's own hand model is reordered from
 * the `cardreorder` event. A second test proves the existing drag-to-discard
 * gesture still wins while reorder is enabled.
 *
 * NOTE: Each test boots a fresh Phaser game (WebGL context).
 * Keep the total boots per file <= 3.
 */
import { describe, it, expect, afterEach } from 'vitest';
import Phaser from 'phaser';
import { waitForScene } from '../helpers/waitForScene';

// ── Constants ───────────────────────────────────────────────
const SCENE_KEY = 'GymHandPileScene';
// Discard pile position (see GymHandPileScene.DISCARD_X / PILE_Y)
const DISCARD_X = 1120;
const PILE_Y = 250;

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

function clickButton(button: Phaser.GameObjects.Text): void {
  button.emit('pointerdown');
}

/**
 * Simulate a complete drag gesture: pointerdown on a card sprite,
 * pointermoves to the destination, pointerup.
 */
function simulateDrag(
  sprite: Phaser.GameObjects.Image,
  startX: number,
  startY: number,
  destX: number,
  destY: number,
  scene: Phaser.Scene,
): void {
  sprite.emit('pointerdown', { x: startX, y: startY });

  const midX = (startX + destX) / 2;
  const midY = (startY + destY) / 2;

  // First move just past the 5px drag threshold to start the drag
  scene.input.emit('pointermove', { x: startX + 10, y: startY + 10 });
  scene.input.emit('pointermove', { x: midX, y: midY });
  scene.input.emit('pointermove', { x: destX, y: destY });
  scene.input.emit('pointerup', { x: destX, y: destY });
}

/** Card identity labels (Card has no id field). */
function labels(cards: any[]): string[] {
  return cards.map((c) => `${c.rank}${c.suit}`);
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Tests ───────────────────────────────────────────────────

describe('GymHandPileScene drag-to-reorder', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => {
    destroyGame(game);
    game = null;
  });

  it('reorders the hand by dragging a card past the last card', async () => {
    game = await bootGame();
    const scene = game.scene.getScene(SCENE_KEY) as any;
    expect(scene).toBeDefined();

    await wait(500);

    const handView = getHandView(scene);
    expect(handView).toBeDefined();
    expect(handView.getDragEnabled()).toBe(true);
    expect(handView.getReorderEnabled()).toBe(true);

    const handSize = handView.getCards().length;
    expect(handSize).toBeGreaterThan(1);

    // ── Toggle the reorder mode off and back on ──────────
    const disableBtn = findButtonByText(scene, 'Disable Reorder');
    expect(disableBtn).toBeTruthy();
    clickButton(disableBtn!);
    await wait(50);
    expect(handView.getReorderEnabled()).toBe(false);

    const enableBtn = findButtonByText(scene, 'Enable Reorder');
    expect(enableBtn).toBeTruthy();
    clickButton(enableBtn!);
    await wait(50);
    expect(handView.getReorderEnabled()).toBe(true);

    // ── Drag the first card past the last card's centre ──
    const before = handView.getCards().map((c: any) => ({ ...c }));
    const sprite = handView.getSpriteAt(0) as Phaser.GameObjects.Image;
    expect(sprite).toBeDefined();

    const centres = handView.getCardCenters();
    const lastCentre = centres[centres.length - 1];
    // Same row (y), well past the last card's centre → append.
    simulateDrag(sprite, sprite.x, sprite.y, lastCentre.x + 20, lastCentre.y, scene);

    await wait(400);

    const after = handView.getCards();
    expect(after).toHaveLength(handSize);
    expect(labels(after)).toEqual([
      ...labels(before.slice(1)),
      labels(before.slice(0, 1))[0],
    ]);
    expect(after[after.length - 1]).toEqual(before[0]);

    // The scene's own model was synced from the cardreorder event.
    expect(labels(scene.hand)).toEqual(labels(after));

    // The event log reports the committed move.
    expect(
      (scene.eventLog as string[]).some((line) => line.startsWith('Reordered')),
    ).toBe(true);

    // The row re-lays out into the same fixed capacity slots (base positions
    // are the unraised resting spots, so the selection raise does not skew
    // this comparison).
    const afterBaseX = handView
      .getCards()
      .map((_: any, i: number) => Math.round(handView.getBasePosition(i).x));
    expect(afterBaseX).toEqual(centres.map((p: any) => Math.round(p.x)));
  });

  it('still accepts a drag from hand to the discard pile while reorder is on', async () => {
    game = await bootGame();
    const scene = game.scene.getScene(SCENE_KEY) as any;
    expect(scene).toBeDefined();

    await wait(500);

    const handView = getHandView(scene);
    expect(handView.getReorderEnabled()).toBe(true);

    const initialHandSize = handView.getCards().length;
    const discardPile = scene.discardPile as any;
    const initialDiscardSize = discardPile.size();

    const sprite = handView.getSpriteAt(0) as Phaser.GameObjects.Image;
    expect(sprite).toBeDefined();

    simulateDrag(sprite, sprite.x, sprite.y, DISCARD_X, PILE_Y + 10, scene);

    // Wait for the acceptance animation + delayed card move (50ms).
    await wait(400);

    expect(handView.getCards().length).toBe(initialHandSize - 1);
    expect(discardPile.size()).toBe(initialDiscardSize + 1);
  });
});
