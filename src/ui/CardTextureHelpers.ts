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
