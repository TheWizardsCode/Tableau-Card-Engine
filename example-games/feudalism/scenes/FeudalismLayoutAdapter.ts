/**
 * FeudalismLayoutAdapter -- maps SLL layout zones to Feudalism-specific layout shape.
 *
 * @module example-games/feudalism/scenes/FeudalismLayoutAdapter
 */

import { getZoneRect } from '../../../src/ui/screen-layout';
import { parseScreenLayoutDocument } from '../../../src/ui/screen-layout-schema';
import type { ScreenLayoutDocument } from '../../../src/ui/screen-layout-schema';
import feudLayoutJson from '../layouts/feudalism.layout.json';

const parsedLayout = parseScreenLayoutDocument(feudLayoutJson);

const FEUD_SLL_LAYOUT: ScreenLayoutDocument | null =
  parsedLayout.valid ? parsedLayout.layout : null;

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

function buildLegacyLayout(): FeudalismLayout {
  return {
    gameW: 1280,
    gameH: 720,
    patronAreaCenterX: 60,
    patronAreaCenterY: 246,
    supplyAreaCenterX: 1230,
    supplyAreaCenterY: 246,
    marketAreaCenterX: 506,
    marketAreaCenterY: 246,
    playerAreaCenterX: 252,
    playerAreaCenterY: 545,
    aiAreaCenterX: 1260 + 244,
    aiAreaCenterY: 545,
    upperBandTop: 52,
    upperBandBottom: 440,
    lowerBandTop: 452,
  };
}

function applySllLayout(legacyLayout: FeudalismLayout): FeudalismLayout {
  if (!FEUD_SLL_LAYOUT) {
    return legacyLayout;
  }

  const viewport = { width: legacyLayout.gameW, height: legacyLayout.gameH };

  const patron = getZoneRect(FEUD_SLL_LAYOUT, 'patronArea', viewport, 1);
  const supply = getZoneRect(FEUD_SLL_LAYOUT, 'supplyArea', viewport, 1);
  const market = getZoneRect(FEUD_SLL_LAYOUT, 'marketArea', viewport, 1);
  const player = getZoneRect(FEUD_SLL_LAYOUT, 'playerArea', viewport, 1);
  const ai = getZoneRect(FEUD_SLL_LAYOUT, 'aiArea', viewport, 1);

  return {
    ...legacyLayout,
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

/**
 * Compute Feudalism layout using SLL zones, falling back to legacy values.
 */
export function computeFeudalismLayout(): FeudalismLayout {
  const legacy = buildLegacyLayout();

  if (!FEUD_SLL_LAYOUT) {
    console.warn('No SLL layout document for Feudalism; using legacy fallback.');
    return legacy;
  }

  try {
    return applySllLayout(legacy);
  } catch {
    console.warn('Failed to adapt SLL layout for Feudalism; using legacy fallback.');
    return legacy;
  }
}
