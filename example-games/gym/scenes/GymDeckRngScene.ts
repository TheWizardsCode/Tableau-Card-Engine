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
import { preloadCardAssets, ensureCardTextureFallbacks, reloadCardTexturesForDesign } from '../../../src/ui/CardTextureHelpers';
import { createHudText } from '../../../src/ui/Renderer';
import { createDeckGrid } from '../../../src/ui/GymSceneUtils';
import type { DeckGridResult } from '../../../src/ui/GymSceneUtils';
import { anchorPoint } from '../../../src/ui/screen-layout';
import { parseScreenLayoutDocument } from '../../../src/ui/screen-layout-schema';
import gymDeckRngLayoutJson from '../layouts/gym-deck-rng.layout.json';
import {
  getAvailableCardDesigns,
  getCardDesignDisplayName,
  getCardDesign,
  setCardDesign,
} from '../../../src/ui/SettingsStore';

// Parse the shared Deck RNG scene layout once at module load.
const DECK_RNG_LAYOUT: import('../../../src/ui/screen-layout-schema').ScreenLayoutDocument | null = (() => {
  const parsed = parseScreenLayoutDocument(gymDeckRngLayoutJson);
  return parsed.valid ? parsed.layout : null;
})();

const DEFAULT_VIEWPORT = { width: 1280, height: 720 };

/**
 * Resolve an anchor from the Deck RNG SLL layout.
 * Falls back to the default viewport if no layout is available.
 */
function resolveDeckRngAnchor(
  zone: string,
  anchor: string,
  viewport = DEFAULT_VIEWPORT,
): import('../../../src/ui/screen-layout-schema').PixelPoint {
  if (!DECK_RNG_LAYOUT) {
    return { x: GAME_W / 2, y: 60 };
  }
  return anchorPoint(DECK_RNG_LAYOUT, zone, anchor, viewport, 1);
}

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
        heading: 'Features',
        body: 'Demonstrates deterministic seeded RNG for card shuffling using createSeededRng() and shuffleArray(). The same seed always produces the same card order, which is essential for reproducible testing, replay systems, and multiplayer consistency. In a game like Golf or Beleaguered Castle, seeded RNG ensures that a player can replay a specific deal for debugging or fair competition.'
      },
      {
        heading: 'Controls',
        body: '[ -1 ] / [ +1 ]: Decrease or increase the seed value and immediately re-shuffle. Use to explore how different seeds produce different card orders while maintaining determinism.\n[ Reset Seed ]: Restore the default seed (42) and re-shuffle. Useful to return to a known state after experimenting.\n[ Shuffle ]: Generate a random seed and re-shuffle. Demonstrates that any seed works with the deterministic system.\n[ Classic ] / [ Modern ]: Switch the card face design. Textures are hot-swapped in-place and the deck is re-shuffled so the new design is visible immediately.\n[ < Prev ] / [ Next > ]: Navigate to the previous or next Gym scene.'
      },
      {
        heading: 'Usage Example',
        body: 'In a debugging scenario, a developer notices that the 5th card dealt in a Golf game always comes from a specific position in the deck. By setting the seed to the same value used during the game session, the developer can reproduce the exact same deck order and inspect the deal sequence to verify correctness.'
      },
      {
        heading: 'Test Plan',
        body: '1. Press [ -1 ] twice → seed decreases by 2, grid re-shuffles\n2. Press [ +1 ] → seed increases by 1, grid re-shuffles differently\n3. Press [ Reset Seed ] → seed returns to 42, grid returns to initial order\n4. Press [ Shuffle ] → random seed, grid re-shuffles\n5. Click [ Modern ] → card faces switch to webisso design, deck re-shuffles\n6. Click [ Classic ] → card faces switch back to saulspatz design, deck re-shuffles\n7. Verify all 52 cards are displayed face-up in the compact grid\n8. Verify each re-shuffle produces a visibly different card order'
      }
    ]);

    // ── Controls (positioned via SLL controls zone) ────────────
    const controlsAnchor = resolveDeckRngAnchor('controls', 'center');
    const cx = controlsAnchor.x;
    const y = controlsAnchor.y;

    this.addLabel(cx, y, 'Seed:');
    this.seedText = createHudText(this, cx + 50, y, String(this.seed), '#ffffff', { fontSize: '16px' });

    this.initButtonBar(y);
    this.buttonBar!.addButton('[ -1 ]', () => this.adjustSeed(-1), { zone: 'center' });
    this.buttonBar!.addButton('[ +1 ]', () => this.adjustSeed(1), { zone: 'center' });
    this.buttonBar!.addButton('[ Reset Seed ]', () => this.resetSeed(), { zone: 'center' });
    this.buttonBar!.addButton('[ Shuffle ]', () => {
      this.seed = Math.floor(Math.random() * 100000);
      this.seedText.setText(String(this.seed));
      this.shuffleAndRedraw();
    }, { zone: 'center' });

    // ── Status ───────────────────────────────────────────
    this.statusText = createHudText(this, cx + 600, y, '52 cards displayed', '#88ff88', { fontSize: '16px' });

    // ── Card Design Selector (second row) ────────────────
    const designRowY = y + 30;
    const designs = getAvailableCardDesigns();
    const currentDesignKey = getCardDesign();

    this.addLabel(cx - 20, designRowY, 'Design:');

    const designButtons: Phaser.GameObjects.Text[] = [];
    let btnX = cx + 60;

    for (const d of designs) {
      const displayName = getCardDesignDisplayName(d.key);
      const isActive = d.key === currentDesignKey;
      const btn = createHudText(
        this,
        btnX,
        designRowY,
        displayName,
        isActive ? '#ffffff' : '#88ff88',
        { fontSize: '14px' },
      ).setInteractive({ useHandCursor: true });

      btn.on('pointerover', () => {
        if (btn.getData('active') !== true) btn.setColor('#bbffbb');
      });
      btn.on('pointerout', () => {
        if (btn.getData('active') !== true) btn.setColor('#88ff88');
      });

      btn.on('pointerdown', async () => {
        if (btn.getData('active') === true) return; // already active
        setCardDesign(d.key);
        await reloadCardTexturesForDesign(this, d.key);

        // Update active state for all design buttons
        for (const b of designButtons) {
          b.setColor('#88ff88');
          b.setData('active', false);
          b.setStyle({ color: '#88ff88' });
        }
        btn.setColor('#ffffff');
        btn.setData('active', true);
        btn.setStyle({ color: '#ffffff' });

        // Re-shuffle to re-render the grid with the new textures
        this.shuffleAndRedraw();
      });

      btn.setData('active', isActive);
      designButtons.push(btn);

      btnX += 100;
    }

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

    const cardDisplayAnchor = resolveDeckRngAnchor('cardDisplay', 'center');
    const centerX = cardDisplayAnchor.x;
    const centerY = cardDisplayAnchor.y + 100;

    this.deckGridResult = createDeckGrid(this, this.deck, {
      cols: GRID_COLUMNS,
      gapX: GRID_GAP_X,
      gapY: GRID_GAP_Y,
      centerX,
      centerY,
    });

    this.statusText.setText(`${this.deck.length} cards displayed · seed=${this.seed} · design: ${getCardDesignDisplayName(getCardDesign())}`);
  }
}
