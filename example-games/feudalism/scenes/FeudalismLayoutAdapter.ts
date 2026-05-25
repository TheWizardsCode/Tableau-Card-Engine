/**
 * FeudalismLayoutAdapter -- maps SLL layout zones to Feudalism-specific layout shape.
 *
 * Uses the SLL layout JSON as the single source of truth for zone positioning.
 *
 * @module example-games/feudalism/scenes/FeudalismLayoutAdapter
 */

import { getZoneRect } from '../../../src/ui/screen-layout';
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

  const patron = getZoneRect(FEUD_SLL_LAYOUT, 'patronArea', viewport, 1);
  const supply = getZoneRect(FEUD_SLL_LAYOUT, 'supplyArea', viewport, 1);
  const market = getZoneRect(FEUD_SLL_LAYOUT, 'marketArea', viewport, 1);
  const player = getZoneRect(FEUD_SLL_LAYOUT, 'playerArea', viewport, 1);
  const ai = getZoneRect(FEUD_SLL_LAYOUT, 'aiArea', viewport, 1);

  return {
    gameW,
    gameH,
    patronAreaCenterX: Math.round(patron.x + patron.width / 2),
    patronAreaCenterY: Math.round(patron.y + patron.height / 2),
    supplyAreaCenterX: Math.round(supply.x + supply.width / 2),
    supplyAreaCenterY: Math.round(supply.y + supply.height / 2),
    marketAreaCenterX: Math.round(market.x + market.width / 2),
    marketAreaCenterY: Math.round(market.y + market.height / 2),
    playerAreaCenterX: Math.round(player.x + player.width / 2),
    playerAreaCenterY: Math.round(player.y + player.height / 2),
    aiAreaCenterX: Math.round(ai.x + ai.width / 2),
    aiAreaCenterY: Math.round(ai.y + ai.height / 2),
    upperBandTop: Math.round(patron.y),
    upperBandBottom: Math.round(patron.y + patron.height),
    lowerBandTop: Math.round(player.y),
  };
}
