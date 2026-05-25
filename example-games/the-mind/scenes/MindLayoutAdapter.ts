/**
 * MindLayoutAdapter -- maps SLL layout zones to The Mind-specific layout shape.
 *
 * Uses the SLL layout JSON as the single source of truth for zone positioning.
 *
 * @module example-games/the-mind/scenes/MindLayoutAdapter
 */

import { anchorPoint } from '../../../src/ui/screen-layout';
import { parseScreenLayoutDocument } from '../../../src/ui/screen-layout-schema';
import mindLayoutJson from '../layouts/the-mind.layout.json';

const parsedLayout = parseScreenLayoutDocument(mindLayoutJson);

if (!parsedLayout.valid) {
  throw new Error(
    `Invalid The Mind SLL layout: ${parsedLayout.errors[0]?.message ?? 'unknown parse error'}`,
  );
}

const MIND_SLL_LAYOUT = parsedLayout.layout;

export interface MindLayout {
  gameW: number;
  gameH: number;
  playPileCenterX: number;
  playPileCenterY: number;
  humanHandCenterY: number;
  aiHandCenterY: number;
}

/**
 * Compute The Mind layout using SLL zones as the single source of truth.
 */
export function computeMindLayout(viewport?: { width: number; height: number }): MindLayout {
  const gameW = viewport?.width ?? 1280;
  const gameH = viewport?.height ?? 720;
  const vp = { width: gameW, height: gameH };

  const playPileCenter = anchorPoint(MIND_SLL_LAYOUT, 'playPile', 'center', vp, 1);
  const humanHandCenterY = anchorPoint(MIND_SLL_LAYOUT, 'humanHand', 'handCenterY', vp, 1);
  const aiHandCenterY = anchorPoint(MIND_SLL_LAYOUT, 'aiHand', 'handCenterY', vp, 1);

  return {
    gameW,
    gameH,
    playPileCenterX: Math.round(playPileCenter.x),
    playPileCenterY: Math.round(playPileCenter.y),
    humanHandCenterY: Math.round(humanHandCenterY.y),
    aiHandCenterY: Math.round(aiHandCenterY.y),
  };
}
