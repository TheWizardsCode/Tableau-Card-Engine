/**
 * Card Texture Helpers
 *
 * Shared functions for mapping Card rank/suit values to Phaser texture keys
 * and SVG file names. These are used by every game scene that renders
 * standard playing cards from the `public/assets/cards/` sprite set.
 *
 * Supports multiple card designs via design-prefixed texture keys.
 * Each design's textures are loaded with unique keys (e.g. `webisso_card_back`,
 * `webisso_ace_of_spades`). The default design uses bare keys for backward
 * compatibility (`card_back`, `ace_of_spades`).
 *
 * When the player switches designs, `getCardTexture()` starts returning the
 * new design's keys immediately — no texture reloading needed because all
 * designs are preloaded together.
 */

import type { Card, Rank, Suit } from '@card-system/Card';
import { RANKS, SUITS } from '@card-system/Card';
import { CARD_W, CARD_H } from './constants';
import {
  getCardDesign,
  getCardDesignAssetPath,
  getAvailableCardDesigns,
  CARD_DESIGN_DEFAULT,
} from './SettingsStore';

/**
 * Map a rank abbreviation to the full name used in SVG file names.
 *
 * - Face cards and ace: `'A'` -> `'ace'`, `'J'` -> `'jack'`, etc.
 * - Number cards: returned as-is (`'2'` -> `'2'`, `'10'` -> `'10'`).
 */
export function rankFileName(rank: Rank): string {
  switch (rank) {
    case 'A': return 'ace';
    case 'J': return 'jack';
    case 'Q': return 'queen';
    case 'K': return 'king';
    default: return rank; // 2-10
  }
}

/**
 * Build a design-qualified Phaser texture key for a given rank and suit.
 *
 * Example:
 *   `cardTextureKey('A', 'spades')`             -> `'ace_of_spades'`
 *   `cardTextureKey('A', 'spades', 'webisso')`  -> `'webisso_ace_of_spades'`
 *
 * When `designKey` is omitted or `'default'`, the bare key (without prefix)
 * is returned for backward compatibility.
 */
export function cardTextureKey(rank: Rank, suit: Suit, designKey?: string): string {
  const short = `${rankFileName(rank)}_of_${suit}`;
  if (!designKey || designKey === CARD_DESIGN_DEFAULT) return short;
  return `${designKey}_${short}`;
}

/**
 * Build the SVG file name (without directory) for a given rank and suit.
 *
 * Example: `cardFileName('A', 'spades')` -> `'ace_of_spades.svg'`
 */
export function cardFileName(rank: Rank, suit: Suit): string {
  return `${rankFileName(rank)}_of_${suit}.svg`;
}

/**
 * Build the prefixed texture key for a card back for a given design.
 *
 * Example:
 *   `cardBackKey('default')` -> `'card_back'`
 *   `cardBackKey('webisso')` -> `'webisso_card_back'`
 */
export function cardBackKey(designKey: string): string {
  if (!designKey || designKey === CARD_DESIGN_DEFAULT) return 'card_back';
  return `${designKey}_card_back`;
}

/**
 * Return the correct Phaser texture key for a card, taking into account
 * both the card's face-up state and the currently selected card design.
 *
 * Face-down cards return the design-qualified card back key.
 * Face-up cards return the design-qualified rank/suit key.
 *
 * @param card - The card to get the texture key for.
 */
export function getCardTexture(card: Card): string {
  const design = getCardDesign();
  if (!card.faceUp) return cardBackKey(design);
  return cardTextureKey(card.rank, card.suit, design);
}

/**
 * Preload card SVG textures for ALL registered designs in a single pass.
 *
 * Call this from your scene's `preload()` method instead of manually
 * iterating over ranks and suits.
 *
 * Each design is loaded under unique texture keys (design-prefixed) so
 * that switching designs never requires removing or reloading textures.
 *
 * Existing textures are NOT removed — if a design was loaded in a previous
 * scene lifecycle, it is skipped to avoid duplicate HTTP requests.
 *
 * @param scene     The Phaser scene whose loader should be used.
 * @param width     Card sprite width in pixels (defaults to `CARD_W`).
 * @param height    Card sprite height in pixels (defaults to `CARD_H`).
 */
export function preloadCardAssets(
  scene: Phaser.Scene,
  width: number = CARD_W,
  height: number = CARD_H,
): void {
  const tex = scene.textures;
  const designs = getAvailableCardDesigns();

  for (const design of designs) {
    const assetBasePath = getCardDesignAssetPath(design.key);
    const backKey = cardBackKey(design.key);

    // Skip if this design's card back is already loaded
    if (!tex.exists(backKey)) {
      scene.load.svg(backKey, `${assetBasePath}card_back.svg`, { width, height });
    }

    // All 52 card faces — skip if already loaded
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        const faceKey = cardTextureKey(rank, suit, design.key);
        if (tex.exists(faceKey)) continue;
        const file = cardFileName(rank, suit);
        scene.load.svg(faceKey, `${assetBasePath}${file}`, { width, height });
      }
    }
  }
}

/**
 * Ensure that card texture keys exist in the scene's TextureManager.
 *
 * This is a runtime fallback used in headless/test environments where
 * SVG assets may not be loaded by the asset pipeline. When a texture
 * key is missing, a lightweight placeholder texture is generated so
 * scenes that expect card texture keys can operate without throwing.
 *
 * The placeholders are intentionally simple (rounded rect + coloured
 * pip) and are only used when the real SVG assets are not present.
 *
 * Creates placeholders for the default design's bare keys AND for each
 * registered alternative design's prefixed keys.
 */
export function ensureCardTextureFallbacks(
  scene: Phaser.Scene,
  width: number = CARD_W,
  height: number = CARD_H,
): void {
  const tex = scene.textures;
  const designs = getAvailableCardDesigns();

  for (const design of designs) {
    const backKey = cardBackKey(design.key);
    if (!tex.exists(backKey)) {
      const g = scene.add.graphics();
      g.fillStyle(0x2244aa, 1);
      g.fillRoundedRect(0, 0, width, height, 6);
      g.lineStyle(1, 0x3366cc, 1);
      g.strokeRoundedRect(2, 2, width - 4, height - 4, 4);
      g.generateTexture(backKey, width, height);
      g.destroy();
    }

    for (const suit of SUITS) {
      for (const rank of RANKS) {
        const key = cardTextureKey(rank, suit, design.key);
        if (tex.exists(key)) continue;
        const g = scene.add.graphics();
        g.fillStyle(0xffffff, 1);
        g.fillRoundedRect(0, 0, width, height, 6);
        g.lineStyle(1, 0x333333, 1);
        g.strokeRoundedRect(1, 1, width - 2, height - 2, 5);
        const pipColor = suit === 'hearts' || suit === 'diamonds' ? 0xff0000 : 0x000000;
        g.fillStyle(pipColor, 1);
        g.fillCircle(width / 2, height / 2, Math.max(4, Math.min(width, height) / 8));
        g.generateTexture(key, width, height);
        g.destroy();
      }
    }
  }
}
