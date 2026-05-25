/**
 * FeudalismLayoutAdapter -- maps SLL layout zones to Feudalism-specific layout shape.
 *
 * Uses the SLL layout JSON as the single source of truth for zone positioning.
 *
 * @module example-games/feudalism/scenes/FeudalismLayoutAdapter
 */

import { anchorPoint } from '../../../src/ui/screen-layout';
import { parseScreenLayoutDocument } from '../../../src/ui/screen-layout-schema';
import feudLayoutJson from '../layouts/feudalism.layout.json';

const parsedLayout = parseScreenLayoutDocument(feudLayoutJson);

if (!parsedLayout.valid) {
  throw new Error(
    `Invalid Feudalism SLL layout: ${parsedLayout.errors[0]?.message ?? 'unknown parse error'}`,
  );
}

const FEUD_SLL_LAYOUT = parsedLayout.layout;

export interface FeudalismLayout {
  gameW: number;
  gameH: number;
  patronAreaCenterX: number;
  patronAreaCenterY: number;
  supplyAreaCenterX: number;
  supplyAreaCenterY: number;
  marketAreaCenterX: number;
  marketAreaCenterY: number;
  playerAreaCenterX: number;
  playerAreaCenterY: number;
  aiAreaCenterX: number;
  aiAreaCenterY: number;
  upperBandTop: number;
  upperBandBottom: number;
  lowerBandTop: number;
}

/**
 * Compute Feudalism layout using SLL zones as the single source of truth.
 */
export function computeFeudalismLayout(): FeudalismLayout {
  const gameW = 1280;
  const gameH = 720;
  const viewport = { width: gameW, height: gameH };

  const patronCenter = anchorPoint(FEUD_SLL_LAYOUT, 'patronArea', 'center', viewport, 1);
  const patronTop = anchorPoint(FEUD_SLL_LAYOUT, 'patronArea', 'topCenter', viewport, 1);
  const patronBottom = anchorPoint(FEUD_SLL_LAYOUT, 'patronArea', 'bottom', viewport, 1);
  const supplyCenter = anchorPoint(FEUD_SLL_LAYOUT, 'supplyArea', 'center', viewport, 1);
  const marketCenter = anchorPoint(FEUD_SLL_LAYOUT, 'marketArea', 'center', viewport, 1);
  const playerCenter = anchorPoint(FEUD_SLL_LAYOUT, 'playerArea', 'center', viewport, 1);
  const aiCenter = anchorPoint(FEUD_SLL_LAYOUT, 'aiArea', 'center', viewport, 1);

  return {
    gameW,
    gameH,
    patronAreaCenterX: Math.round(patronCenter.x),
    patronAreaCenterY: Math.round(patronCenter.y),
    supplyAreaCenterX: Math.round(supplyCenter.x),
    supplyAreaCenterY: Math.round(supplyCenter.y),
    marketAreaCenterX: Math.round(marketCenter.x),
    marketAreaCenterY: Math.round(marketCenter.y),
    playerAreaCenterX: Math.round(playerCenter.x),
    playerAreaCenterY: Math.round(playerCenter.y),
    aiAreaCenterX: Math.round(aiCenter.x),
    aiAreaCenterY: Math.round(aiCenter.y),
    upperBandTop: Math.round(patronTop.y),
    upperBandBottom: Math.round(patronBottom.y),
    lowerBandTop: Math.round(playerCenter.y),
  };
}
