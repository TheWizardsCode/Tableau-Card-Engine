/**
 * Blackjack HandView browser test.
 *
 * Boots the BlackjackScene via `createBlackjackGame` (Phaser CANVAS) and
 * verifies the core-engine hand management path:
 *  - The player and dealer hands render through `HandView` instances
 *    exposed on the scene, with sprite counts matching the model hands.
 *  - The dealer hole card (index 0) renders with the `card_back` texture
 *    before stand and the face-up card texture after stand.
 *  - Reduced-motion mode applies the hole-card reveal instantly (no flip
 *    tween waiting for FLIP_DURATION to elapse).
 *  - A full deal → hit → stand flow produces no console errors.
 *
 * NOTE: Each test boots a fresh Phaser game (Canvas context).
 * Keep the total boots per file <= 3.
 */
import { describe, it, expect, afterEach } from 'vitest';
import Phaser from 'phaser';
import { waitForScene } from '../helpers/waitForScene';
import {
  createBlackjackGameState,
} from '../../example-games/blackjack/BlackjackGame';
import { cardTextureKey } from '../../src/ui/CardTextureHelpers';
import { setReducedMotion } from '../../src/ui/SettingsStore';

// ── Constants ─────────────────────────────────────────────
const SCENE_KEY = 'BlackjackScene';

/**
 * Deterministic seed whose dealt hands suit the deal → hit → stand flow:
 *  - No natural blackjack (phase stays PLAYER_TURN after deal).
 *  - Player score after deal is 9 — a hit can never bust (max 21).
 *  - After one hit the player still has a playable hand (score 14).
 *  - Dealer hole card (index 0) is face-down after deal.
 */
const SAFE_SEED = 1;

// ── Helpers ───────────────────────────────────────────────

async function bootGame(): Promise<Phaser.Game> {
  let container = document.getElementById('game-container');
  if (container) container.remove();
  container = document.createElement('div');
  container.id = 'game-container';
  document.body.appendChild(container);

  const { createBlackjackGame } = await import(
    '../../example-games/blackjack/createBlackjackGame'
  );
  const game = createBlackjackGame({ type: Phaser.CANVAS });
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

function getScene(game: Phaser.Game): any {
  return game.scene.getScene(SCENE_KEY) as any;
}

function findButtonByText(scene: any, text: string): Phaser.GameObjects.Text | null {
  const children = scene.children?.getAll?.() ?? [];
  for (const obj of children) {
    if (
      obj instanceof Phaser.GameObjects.Text &&
      typeof obj.text === 'string' &&
      obj.text.includes(text)
    ) {
      return obj;
    }
  }
  return null;
}

/** Click a Phaser text button by emitting pointerdown (as the input system would). */
function clickButton(button: Phaser.GameObjects.Text): void {
  button.emit('pointerdown');
}

/** Wait for a given number of milliseconds. */
function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Read a HandView instance exposed on the scene. */
function getHandView(scene: any, name: 'playerHandView' | 'dealerHandView'): any {
  return scene[name];
}

// ── Tests ─────────────────────────────────────────────────

describe('Blackjack HandView rendering', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => {
    destroyGame(game);
    game = null;
    setReducedMotion(false);
  });

  it('renders hands via HandView through deal → hit → stand without console errors', async () => {
    setReducedMotion(false);

    const errors: string[] = [];
    const originalError = console.error;
    console.error = (...args: unknown[]) => {
      errors.push(args.map(String).join(' '));
      originalError.apply(console, args);
    };

    try {
      game = await bootGame();
      const scene = getScene(game);

      // Replace the random state with a deterministic seed so the
      // deal → hit → stand flow is guaranteed to be playable.
      const state = createBlackjackGameState({ seed: SAFE_SEED });
      scene.state = state;

      // Deal
      const dealBtn = findButtonByText(scene, '[ Deal ]');
      expect(dealBtn).toBeTruthy();
      clickButton(dealBtn!);
      // Staggered deal animations settle within ~900ms (last starts at 450ms, 400ms duration)
      await wait(900);

      // Both hands render through HandView instances; sprite counts match the model.
      const playerHandView = getHandView(scene, 'playerHandView');
      const dealerHandView = getHandView(scene, 'dealerHandView');
      expect(playerHandView).toBeDefined();
      expect(dealerHandView).toBeDefined();
      expect(playerHandView.getSprites().length).toBe(state.playerHand.cards.size());
      expect(dealerHandView.getSprites().length).toBe(state.dealerHand.cards.size());

      // Hit — player hand grows by one card
      const hitBtn = findButtonByText(scene, '[ Hit ]');
      expect(hitBtn).toBeTruthy();
      clickButton(hitBtn!);
      await wait(600); // hit slide animation (50ms delay + 400ms duration)
      expect(playerHandView.getSprites().length).toBe(state.playerHand.cards.size());

      // Stand — dealer AI runs after a delay and may draw more cards
      const standBtn = findButtonByText(scene, '[ Stand ]');
      expect(standBtn).toBeTruthy();
      clickButton(standBtn!);
      await wait(1200); // flip (300ms) + dealer delay (500ms) + overlay

      expect(dealerHandView.getSprites().length).toBe(state.dealerHand.cards.size());
      expect(errors).toEqual([]);
    } finally {
      console.error = originalError;
    }
  });

  it('shows the dealer hole card face-down before stand and face-up after stand', async () => {
    setReducedMotion(false);

    game = await bootGame();
    const scene = getScene(game);
    const state = createBlackjackGameState({ seed: SAFE_SEED });
    scene.state = state;

    clickButton(findButtonByText(scene, '[ Deal ]')!);
    await wait(900);

    const dealerHandView = getHandView(scene, 'dealerHandView');
    const holeCard = state.dealerHand.cards.toArray()[0];

    // Before stand: hole card is face-down in the model and renders as card_back.
    expect(holeCard.faceUp).toBe(false);
    const holeSpriteBefore = dealerHandView.getSpriteAt(0) as Phaser.GameObjects.Image;
    expect(holeSpriteBefore).toBeDefined();
    expect(holeSpriteBefore.texture.key).toBe('card_back');

    // Stand → reveal: hole card flips to its face texture.
    clickButton(findButtonByText(scene, '[ Stand ]')!);
    // Flip animation (300ms) + dealer delay (500ms) — wait past both.
    await wait(700);

    expect(holeCard.faceUp).toBe(true);
    const holeSpriteAfter = dealerHandView.getSpriteAt(0) as Phaser.GameObjects.Image;
    expect(holeSpriteAfter).toBeDefined();
    expect(holeSpriteAfter.texture.key).toBe(cardTextureKey(holeCard.rank, holeCard.suit));
  });
});
