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
import { GAME_W } from '../../../src/ui/constants';
import { preloadCardAssets, ensureCardTextureFallbacks } from '../../../src/ui/CardTextureHelpers';
import { createHudText } from '../../../src/ui/Renderer';
import { createDeckGrid } from '../../../src/ui/GymSceneUtils';
import type { DeckGridResult } from '../../../src/ui/GymSceneUtils';

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

  // Deck grid result — tracked so it can be destroyed on shuffle
  private deckGridResult: DeckGridResult | null = null;

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

    // Destroy previous grid and render new one
    if (this.deckGridResult) {
      this.deckGridResult.destroy();
      this.deckGridResult = null;
    }

    const cardDisplay = this.getGymAnchor('cardDisplay', 'center');
    const centerX = cardDisplay?.x ?? GAME_W / 2;
    const centerY = (cardDisplay?.y ?? 270) + 100;

    this.deckGridResult = createDeckGrid(this, this.deck, {
      cols: GRID_COLUMNS,
      gapX: GRID_GAP_X,
      gapY: GRID_GAP_Y,
      centerX,
      centerY,
    });

    this.statusText.setText(`${this.deck.length} cards displayed · seed=${this.seed}`);
  }
}
