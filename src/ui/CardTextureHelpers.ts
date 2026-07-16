/**
 * Card Texture Helpers
 *
 * Shared functions for mapping Card rank/suit values to Phaser texture keys
 * and SVG file names. These are used by every game scene that renders
 * standard playing cards from the `public/assets/cards/` sprite set.
 *
 * Also provides a convenience function to preload all 52 card face SVGs
 * plus the card back into a Phaser scene.
 *
 * Card design switching is handled by {@link reloadCardTexturesForDesign},
 * which updates the underlying texture data in-place — existing sprites
 * automatically reflect the change because they reference the same keys.
 */

import type { Card, Rank, Suit } from '@card-system/Card';
import { RANKS, SUITS } from '@card-system/Card';
import { CARD_W, CARD_H } from './constants';
import {
  getCardDesign,
  getCardDesignAssetPath,
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
 *
 * Note: The return value is consistent across all card designs because
 * texture keys are design-independent. Design switching is handled by
 * replacing the underlying texture data, not by changing the key.
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
 * Loads SVGs for the player's currently selected card design (read from
 * localStorage via {@link getCardDesign}) so that the initial game start
 * renders the correct design.
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
  const effectiveDesignKey = getCardDesign();
  const assetBasePath = getCardDesignAssetPath(effectiveDesignKey);

  // Card back
  scene.load.svg('card_back', `${assetBasePath}card_back.svg`, {
    width,
    height,
  });

  // All 52 card faces
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      const key = cardTextureKey(rank, suit);
      const file = cardFileName(rank, suit);
      scene.load.svg(key, `${assetBasePath}${file}`, { width, height });
    }
  }
}

/**
 * Reload card textures for a new design at runtime.
 *
 * This is the key function for design switching. It:
 * 1. Fetches SVG text for every card in the new design
 * 2. Rasterises each SVG into an off-screen canvas
 * 3. Replaces each existing texture's source image in-place
 *    with the new canvas
 *
 * Because the Texture object is never destroyed or replaced,
 * existing sprites that reference these textures automatically
 * show the new design — no scene restart or sprite recreation
 * is needed.
 *
 * @param scene     The active Phaser scene (used for texture manager access).
 * @param designKey The design key to switch to (e.g. 'default', 'webisso').
 * @param width     Card sprite width in pixels (defaults to `CARD_W`).
 * @param height    Card sprite height in pixels (defaults to `CARD_H`).
 * @returns A promise that resolves when all textures have been reloaded.
 */
export async function reloadCardTexturesForDesign(
  scene: Phaser.Scene,
  designKey: string,
  width: number = CARD_W,
  height: number = CARD_H,
): Promise<void> {
  const tex = scene.textures;
  const assetBasePath = getCardDesignAssetPath(designKey);

  // Build the list of texture entries: { key, fileName }
  const entries: { key: string; fileName: string }[] = [];
  entries.push({ key: 'card_back', fileName: 'card_back.svg' });
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      entries.push({
        key: cardTextureKey(rank, suit),
        fileName: cardFileName(rank, suit),
      });
    }
  }

  // ── Phase 1 (async): fetch SVGs and rasterise to off-screen canvases ──

  /** Fetch SVG text. Returns null on failure. */
  async function fetchSvg(url: string): Promise<string | null> {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.text();
    } catch {
      return null;
    }
  }

  /** Rasterise SVG text to an HTMLCanvasElement. */
  function svgToCanvas(svgText: string): Promise<HTMLCanvasElement | null> {
    return new Promise((resolve) => {
      const blob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
      const dataUrl = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(dataUrl);
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas);
      };
      img.onerror = () => {
        URL.revokeObjectURL(dataUrl);
        resolve(null);
      };
      img.src = dataUrl;
    });
  }

  // Fetch all SVGs in parallel
  const svgTexts = await Promise.all(
    entries.map(e => fetchSvg(`${assetBasePath}${e.fileName}`)),
  );

  // Rasterise all successfully-fetched SVGs to canvases (in parallel)
  const replacementCanvases: { key: string; canvas: HTMLCanvasElement }[] = [];
  await Promise.all(
    svgTexts.map(async (svgText, i) => {
      if (svgText === null) return; // fetch failed, leave existing in place
      const canvas = await svgToCanvas(svgText);
      if (canvas !== null) {
        replacementCanvases.push({ key: entries[i].key, canvas });
      }
    }),
  );

  // ── Phase 2 (sync): replace each texture's source in-place ──
  for (const { key, canvas } of replacementCanvases) {
    const existing = tex.get(key);
    if (!existing) continue;
    const source = existing.source[0];
    if (!source) continue;

    // Replace the image data
    source.image = canvas;
    source.width = canvas.width;
    source.height = canvas.height;
    source.isCanvas = true;

    // Re-upload to WebGL if applicable
    source.update();
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
