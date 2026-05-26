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
  private cardLabels: Phaser.GameObjects.Text[] = [];

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
        body: 'Displays all 52 cards face-up in a compact grid. Shuffle the deck using a deterministic seed to see how card order changes.'
      },
      {
        heading: 'Controls',
        body: '[ -1 ] / [ +1 ]: Adjust seed.\n[ Reset Seed ]: Restore default seed.\n[ Shuffle ]: Shuffle and re-display all 52 cards using the current seed.\n\nTip: Using the same seed always produces the same shuffle order.'
      }
    ]);

    // ── Controls (positioned via SLL controls zone) ────────────
    const controlsAnchor = this.getGymAnchor('controls', 'left');
    const cx = controlsAnchor?.x ?? GAME_W / 2;
    let y = controlsAnchor?.y ?? 60;

    this.addLabel(cx, y, 'Seed:');
    this.seedText = this.add.text(cx + 50, y, String(this.seed), {
      fontSize: '16px',
      color: '#ffffff',
      fontFamily: 'monospace',
    });

    this.addButton(cx + 180, y, '[ -1 ]', () => this.adjustSeed(-1));
    this.addButton(cx + 240, y, '[ +1 ]', () => this.adjustSeed(1));
    this.addButton(cx + 310, y, '[ Reset Seed ]', () => this.resetSeed());
    this.addButton(cx + 450, y, '[ Shuffle ]', () => this.shuffleAndRedraw());

    // ── Status ───────────────────────────────────────────
    this.statusText = this.addLabel(cx + 600, y, '52 cards displayed', { fontSize: '16px', color: '#88ff88' });

    // ── Initialize deck and render full deck in a grid ─────
    this.deck = createStandardDeck();
    this.renderFullDeckGrid();
  }

  // ── Actions ──────────────────────────────────────────────

  private adjustSeed(delta: number): void {
    this.seed = Math.max(0, this.seed + delta);
    this.seedText.setText(String(this.seed));
  }

  private resetSeed(): void {
    this.seed = DEFAULT_SEED;
    this.seedText.setText(String(this.seed));
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

      // Small label below each card for easy identification
      const label = this.add.text(x, y + scaledCardH / 2 + 10, `${card.rank}${card.suit[0]}`, {
        fontSize: '8px',
        color: '#88aacc',
        fontFamily: 'monospace',
      }).setOrigin(0.5, 0);
      this.cardLabels.push(label);
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

    for (const label of this.cardLabels) {
      try { label.destroy(); } catch (_) { /* ignore */ }
    }
    this.cardLabels = [];
  }
}
