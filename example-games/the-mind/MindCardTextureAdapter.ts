/**
 * MindCardTextureAdapter
 *
 * Provides a stable, DPR-aware API for resolving Mind card texture keys.
 * This adapter bridges the gap between legacy template IDs (e.g. 'mind-42')
 * and the DPR-aware texture keys produced by SvgHelpers.getOrCreateTexture
 * (e.g. 'ms_card_mind-42_48x65@2').
 *
 * Migration notes (CG-0MP12H40Q003Y7OU):
 *   - Callers should use this adapter instead of directly using legacy
 *     template IDs (mindCardTextureKey, getMindCardTexture) when setting
 *     sprite textures. The adapter computes the correct DPR-aware key.
 *   - getMindCardTexture() and mindCardTextureKey() in MindCardRenderer
 *     remain available but return template IDs, NOT DPR-aware keys.
 *     Prefer resolveTemplateId() + getCanonicalTextureKey() for sprite
 *     texture lookups.
 *   - For card-back textures, use resolveBackTemplateId() instead of
 *     CARD_BACK_KEY directly when computing DPR-aware keys.
 */

import { makeTextureKey } from '../../src/core-engine/SvgHelpers';
import { MIN_VALUE, MAX_VALUE, CARD_BACK_KEY } from './MindCard';
import type { MindCard } from './MindCard';
import {
  ensureMindCardTexture,
  ensureMindCardBackTexture,
  MIND_CARD_W,
  MIND_CARD_H,
} from './MindCardRenderer';

// ── Template ID resolution ─────────────────────────────────

/**
 * Resolve a Mind card value to its canonical template ID.
 *
 * Template IDs follow the pattern "mind-{value}" and serve as the
 * stable identifier for a card regardless of DPR or dimensions.
 *
 * @param value  Card value (1-100).
 * @returns      Template ID string (e.g. 'mind-42').
 * @throws       Error if value is outside the valid range (1-100).
 */
export function resolveTemplateId(value: number): string {
  if (value < MIN_VALUE || value > MAX_VALUE || !Number.isInteger(value)) {
    throw new Error(
      `Invalid Mind card value: ${value}. Must be an integer between ${MIN_VALUE} and ${MAX_VALUE}.`,
    );
  }
  return `mind-${value}`;
}

/**
 * Resolve the card-back template ID.
 *
 * @returns The card-back template ID ('mind-back').
 */
export function resolveBackTemplateId(): string {
  return CARD_BACK_KEY;
}

// ── DPR-aware key computation ──────────────────────────────

/**
 * Compute the DPR-aware texture key for a Mind card template ID.
 *
 * This is a convenience wrapper around SvgHelpers.makeTextureKey
 * that uses Mind card default dimensions when none are provided.
 *
 * @param templateId  The template ID (e.g. 'mind-42' or 'mind-back').
 * @param width       Card width in logical pixels (defaults to MIND_CARD_W).
 * @param height      Card height in logical pixels (defaults to MIND_CARD_H).
 * @param dpr         Device pixel ratio (defaults to window.devicePixelRatio or 1).
 * @returns           DPR-aware texture key (e.g. 'ms_card_mind-42_48x65@2').
 */
export function getCanonicalTextureKey(
  templateId: string,
  width: number = MIND_CARD_W,
  height: number = MIND_CARD_H,
  dpr?: number,
): string {
  const resolvedDpr = dpr ?? (typeof window !== 'undefined' && window.devicePixelRatio ? window.devicePixelRatio : 1);
  return makeTextureKey(templateId, width, height, resolvedDpr);
}

// ── Convenience ensure wrappers ─────────────────────────────

/**
 * Ensure a Mind card texture exists and return the DPR-aware key.
 *
 * This wraps MindCardRenderer.ensureMindCardTexture, providing a
 * stable API that always returns DPR-aware texture keys.
 *
 * @param scene   The Phaser scene whose texture manager will hold the texture.
 * @param value   Card value (1-100).
 * @param width   Card width in logical pixels.
 * @param height  Card height in logical pixels.
 * @returns       Object with DPR-aware texture key, ready state, and optional promise.
 */
export async function ensureTexture(
  scene: Phaser.Scene,
  value: number,
  width: number = MIND_CARD_W,
  height: number = MIND_CARD_H,
): Promise<{ key: string; ready: boolean; promise?: Promise<void> }> {
  return ensureMindCardTexture(scene, value, width, height);
}

/**
 * Ensure the card-back texture exists and return the DPR-aware key.
 *
 * @param scene   The Phaser scene whose texture manager will hold the texture.
 * @param width   Card width in logical pixels.
 * @param height  Card height in logical pixels.
 * @returns       Object with DPR-aware texture key, ready state, and optional promise.
 */
export async function ensureBackTexture(
  scene: Phaser.Scene,
  width: number = MIND_CARD_W,
  height: number = MIND_CARD_H,
): Promise<{ key: string; ready: boolean; promise?: Promise<void> }> {
  return ensureMindCardBackTexture(scene, width, height);
}

/**
 * Get the DPR-aware texture key for a face-up or face-down MindCard.
 *
 * This combines template ID resolution with DPR-aware key computation.
 * For face-down cards, it returns the card-back DPR-aware key.
 *
 * Note: This does NOT ensure the texture exists. Call ensureTexture()
 * or ensureBackTexture() first, or use ensureMindCardTexture directly.
 *
 * @param card    The MindCard to get a texture key for.
 * @param width   Card width in logical pixels (defaults to MIND_CARD_W).
 * @param height  Card height in logical pixels (defaults to MIND_CARD_H).
 * @param dpr     Device pixel ratio (defaults to window.devicePixelRatio or 1).
 * @returns       DPR-aware texture key.
 */
export function getTextureKey(
  card: MindCard,
  width: number = MIND_CARD_W,
  height: number = MIND_CARD_H,
  dpr?: number,
): string {
  const templateId = card.faceUp ? resolveTemplateId(card.value) : resolveBackTemplateId();
  return getCanonicalTextureKey(templateId, width, height, dpr);
}


