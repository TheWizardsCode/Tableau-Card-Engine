/**
 * GymDeckRngScene -- Demonstrates a full deck displayed face-up in a
 * compact grid, with deterministic seeded randomness via shuffle.
 *
 * Features:
 *   - All 52 cards displayed face-up in a compact grid on scene load
 *   - Shuffle button re-shuffles and re-renders the entire grid
 *   - Seed adjustment controls to reproduce identical shuffle sequences
 *   - Cards rendered using SLL zone anchors for consistent layout
 *
 * @module example-games/gym/scenes/GymDeckRngScene
 */

import { GymSceneBase } from './GymSceneBase';
import { GYM_DECK_RNG_KEY } from '../GymRegistry';
import { createStandardDeck, shuffleArray } from '../../../src/card-system/Deck';
import type { Card } from '../../../src/card-system/Card';
import { createSeededRng } from '../../../src/core-engine/SeededRng';
import { GAME_W, CARD_W, CARD_H } from '../../../src/ui/constants';
import { preloadCardAssets, getCardTexture, ensureCardTextureFallbacks } from '../../../src/ui/CardTextureHelpers';
import { createHudText } from '../../../src/ui/Renderer';

/** Default seed for deterministic demonstrations. */
const DEFAULT_SEED = 42;

/** Grid layout: 8 columns, up to 7 rows (52 cards = 6 full rows + 4 in row 7). */
const GRID_COLUMNS = 8;

/** Horizontal gap between cards in the grid (pixels). */
const GRID_GAP_X = 4;

/** Vertical gap between cards in the grid (pixels). */
const GRID_GAP_Y = 4;

export class GymDeckRngScene extends GymSceneBase {
  private deck: Card[] = [];
  private seed: number = DEFAULT_SEED;
  private rng: ReturnType<typeof createSeededRng> = createSeededRng(DEFAULT_SEED);

  // UI elements
  private seedText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;

  // Grid card sprites — tracked so they can be destroyed on shuffle
  private cardSprites: Phaser.GameObjects.Image[] = [];

  constructor() {
    super({ key: GYM_DECK_RNG_KEY });
  }

  preload(): void {
    // Preload standard SVG card assets (faces + back).
    preloadCardAssets(this);
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#1a2a1a');
    this.initHeader('Deck & Seeded RNG');
    this.addDivider();
    this.initReducedMotion();

    // Ensure runtime fallbacks exist in headless/test environments
    ensureCardTextureFallbacks(this);

    this.initHelp([
      {
        heading: 'Overview',
        body: 'Displays all 52 cards face-up in a compact grid, shuffled with the default seed (42) on load.'
      },
      {
        heading: 'Controls',
        body: '[ -1 ] / [ +1 ]: Adjust seed and re-shuffle the deck.\n[ Reset Seed ]: Restore default seed (42) and re-shuffle.\n[ Shuffle ]: Re-shuffle using a random seed.\n\nTip: Using the same seed always produces the same card order.'
      }
    ]);

    // ── Controls (positioned via SLL controls zone) ────────────
    const controlsAnchor = this.getGymAnchor('controls', 'left');
    const cx = controlsAnchor?.x ?? GAME_W / 2;
    let y = controlsAnchor?.y ?? 60;

    this.addLabel(cx, y, 'Seed:');
    this.seedText = createHudText(this, cx + 50, y, String(this.seed), '#ffffff', { fontSize: '16px' });

    this.addButton(cx + 180, y, '[ -1 ]', () => this.adjustSeed(-1));
    this.addButton(cx + 240, y, '[ +1 ]', () => this.adjustSeed(1));
    this.addButton(cx + 310, y, '[ Reset Seed ]', () => this.resetSeed());
    this.addButton(cx + 450, y, '[ Shuffle ]', () => {
      this.seed = Math.floor(Math.random() * 100000);
      this.seedText.setText(String(this.seed));
      this.shuffleAndRedraw();
    });

    // ── Status ───────────────────────────────────────────
    this.statusText = createHudText(this, cx + 600, y, '52 cards displayed', '#88ff88', { fontSize: '16px' });

    // ── Initialize deck, shuffle with default seed, and render ──
    this.seed = DEFAULT_SEED;
    this.shuffleAndRedraw();
  }

  // ── Actions ──────────────────────────────────────────────

  private adjustSeed(delta: number): void {
    this.seed = Math.max(0, this.seed + delta);
    this.seedText.setText(String(this.seed));
    this.shuffleAndRedraw();
  }

  private resetSeed(): void {
    this.seed = DEFAULT_SEED;
    this.seedText.setText(String(this.seed));
    this.shuffleAndRedraw();
  }

  /**
   * Shuffle the deck with the current seed and re-render the full grid.
   */
  private shuffleAndRedraw(): void {
    this.rng = createSeededRng(this.seed);
    this.deck = createStandardDeck();
    shuffleArray(this.deck, this.rng);
    this.clearGridSprites();
    this.renderFullDeckGrid();
  }

  // ── Grid rendering ───────────────────────────────────────

  /**
   * Render all cards in the deck as a compact face-up grid within the
   * cardDisplay SLL zone. Cards are scaled down to fit the available space.
   */
  private renderFullDeckGrid(): void {
    const cardDisplay = this.getGymAnchor('cardDisplay', 'center');
    const centerX = cardDisplay?.x ?? GAME_W / 2;
    // Shift the grid down within the cardDisplay zone to clear the header/controls
    const centerY = (cardDisplay?.y ?? 270) + 100;

    // Full-scale cards (48×65px), 8 columns = ~412px wide
    const cardScale = 1.0;
    const scaledCardW = CARD_W * cardScale;
    const scaledCardH = CARD_H * cardScale;
    const stepX = scaledCardW + GRID_GAP_X;
    const stepY = scaledCardH + GRID_GAP_Y;

    // Calculate the top-left origin of the grid so it's centered
    const totalWidth = GRID_COLUMNS * stepX - GRID_GAP_X;
    const totalRows = Math.ceil(this.deck.length / GRID_COLUMNS);
    const totalHeight = totalRows * stepY - GRID_GAP_Y;
    const gridStartX = centerX - totalWidth / 2 + scaledCardW / 2;
    const gridStartY = centerY - totalHeight / 2 + scaledCardH / 2;

    for (let i = 0; i < this.deck.length; i++) {
      const card = this.deck[i];
      card.faceUp = true; // Ensure all cards are face-up

      const col = i % GRID_COLUMNS;
      const row = Math.floor(i / GRID_COLUMNS);
      const x = gridStartX + col * stepX;
      const y = gridStartY + row * stepY;

      const texture = getCardTexture(card);
      const sprite = this.add.image(x, y, texture);
      sprite.setScale(cardScale);
      this.cardSprites.push(sprite);

    }

    this.statusText.setText(`${this.deck.length} cards displayed · seed=${this.seed}`);
  }

  /**
   * Destroy all card sprites and labels in the grid.
   */
  private clearGridSprites(): void {
    for (const sprite of this.cardSprites) {
      try { sprite.destroy(); } catch (_) { /* ignore */ }
    }
    this.cardSprites = [];

  }
}
