/**
 * Card Texture Helpers
 *
 * Shared functions for mapping Card rank/suit values to Phaser texture keys
 * and SVG file names. These are used by every game scene that renders
 * standard playing cards from the `public/assets/cards/` sprite set.
 *
 * Also provides a convenience function to preload all 52 card face SVGs
 * plus the card back into a Phaser scene.
 */

import type { Card, Rank, Suit } from '@card-system/Card';
import { RANKS, SUITS } from '@card-system/Card';
import { CARD_W, CARD_H } from './constants';

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
 * Build the Phaser texture key for a given rank and suit.
 *
 * Example: `cardTextureKey('A', 'spades')` -> `'ace_of_spades'`
 */
export function cardTextureKey(rank: Rank, suit: Suit): string {
  return `${rankFileName(rank)}_of_${suit}`;
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
 * Return the correct Phaser texture key for a card, taking face-up state
 * into account. Face-down cards return `'card_back'`.
 */
export function getCardTexture(card: Card): string {
  if (!card.faceUp) return 'card_back';
  return cardTextureKey(card.rank, card.suit);
}

/**
 * Preload all 52 card face SVGs and the card back SVG into a Phaser scene.
 *
 * Call this from your scene's `preload()` method instead of manually
 * iterating over ranks and suits.
 *
 * @param scene  The Phaser scene whose loader should be used.
 * @param width  Card sprite width in pixels (defaults to `CARD_W`).
 * @param height Card sprite height in pixels (defaults to `CARD_H`).
 */
export function preloadCardAssets(
  scene: Phaser.Scene,
  width: number = CARD_W,
  height: number = CARD_H,
): void {
  const tex = scene.textures;

  // Remove existing card textures so each scene can load at its own size.
  // Textures are global to the Phaser Game, so without this a scene that
  // loads after another would reuse the previous scene's dimensions.
  if (tex.exists('card_back')) tex.remove('card_back');
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      const key = cardTextureKey(rank, suit);
      if (tex.exists(key)) tex.remove(key);
    }
  }

  // Card back
  scene.load.svg('card_back', 'assets/cards/card_back.svg', {
    width,
    height,
  });

  // All 52 card faces
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      const key = cardTextureKey(rank, suit);
      const file = cardFileName(rank, suit);
      scene.load.svg(key, `assets/cards/${file}`, { width, height });
    }
  }
}

/**
 * Ensure that card texture keys exist in the scene's TextureManager.
 *
 * This is a runtime fallback used in headless/test environments where
 * SVG assets may not be loaded by the asset pipeline. When a texture
 * key is missing, a lightweight placeholder texture is generated so
 * scenes that expect `card_back` and face keys like `ace_of_spades` can
 * operate without throwing.
 *
 * The placeholders are intentionally simple (rounded rect + coloured
 * pip) and are only used when the real SVG assets are not present.
 */
export function ensureCardTextureFallbacks(
  scene: Phaser.Scene,
  width: number = CARD_W,
  height: number = CARD_H,
): void {
  const tex = scene.textures;

  // Card back placeholder
  if (!tex.exists('card_back')) {
    const g = scene.add.graphics();
    g.fillStyle(0x2244aa, 1);
    g.fillRoundedRect(0, 0, width, height, 6);
    g.lineStyle(1, 0x3366cc, 1);
    g.strokeRoundedRect(2, 2, width - 4, height - 4, 4);
    g.generateTexture('card_back', width, height);
    g.destroy();
  }

  // Face placeholders
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      const key = cardTextureKey(rank, suit);
      if (tex.exists(key)) continue;
      const g = scene.add.graphics();
      // White face with border
      g.fillStyle(0xffffff, 1);
      g.fillRoundedRect(0, 0, width, height, 6);
      g.lineStyle(1, 0x333333, 1);
      g.strokeRoundedRect(1, 1, width - 2, height - 2, 5);
      // Pip colour: red for hearts/diamonds, black otherwise
      const pipColor = suit === 'hearts' || suit === 'diamonds' ? 0xff0000 : 0x000000;
      g.fillStyle(pipColor, 1);
      // Simple central pip circle as placeholder
      g.fillCircle(width / 2, height / 2, Math.max(4, Math.min(width, height) / 8));
      g.generateTexture(key, width, height);
      g.destroy();
    }
  }
}

