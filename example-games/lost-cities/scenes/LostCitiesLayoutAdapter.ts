/**
 * LostCitiesLayoutAdapter -- maps SLL layout zones to Lost Cities-specific layout shape.
 *
 * @module example-games/lost-cities/scenes/LostCitiesLayoutAdapter
 */

import { getZoneRect } from '../../../src/ui/screen-layout';
import { parseScreenLayoutDocument } from '../../../src/ui/screen-layout-schema';
import type { ScreenLayoutDocument } from '../../../src/ui/screen-layout-schema';
import lcLayoutJson from '../layouts/lost-cities.layout.json';

const parsedLayout = parseScreenLayoutDocument(lcLayoutJson);

const LC_SLL_LAYOUT: ScreenLayoutDocument | null =
  parsedLayout.valid ? parsedLayout.layout : null;

export interface LostCitiesLayout {
  gameW: number;
  gameH: number;
  expeditionsCenterY: number;
  opponentExpTop: number;
  playerExpBottom: number;
  discardAreaCenterY: number;
  midColumnCenterX: number;
  playerHandCenterX: number;
  aiHandCenterX: number;
  handTop: number;
  handBottom: number;
}

function buildLegacyLayout(): LostCitiesLayout {
  return {
    gameW: 1280,
    gameH: 720,
    expeditionsCenterY: 360,
    opponentExpTop: 64,
    playerExpBottom: 704,
    discardAreaCenterY: 360,
    midColumnCenterX: 1173,
    playerHandCenterX: 802,
    aiHandCenterX: 1014,
    handTop: 64,
    handBottom: 690,
  };
}

function applySllLayout(legacyLayout: LostCitiesLayout): LostCitiesLayout {
  if (!LC_SLL_LAYOUT) {
    return legacyLayout;
  }

  const viewport = { width: legacyLayout.gameW, height: legacyLayout.gameH };

  const oppExp = getZoneRect(LC_SLL_LAYOUT, 'opponentExpeditions', viewport, 1);
  const plrExp = getZoneRect(LC_SLL_LAYOUT, 'playerExpeditions', viewport, 1);
  const discard = getZoneRect(LC_SLL_LAYOUT, 'discardArea', viewport, 1);
  const midCol = getZoneRect(LC_SLL_LAYOUT, 'midColumn', viewport, 1);
  const playerHand = getZoneRect(LC_SLL_LAYOUT, 'playerHand', viewport, 1);
  const aiHand = getZoneRect(LC_SLL_LAYOUT, 'aiHand', viewport, 1);

  return {
    ...legacyLayout,
    expeditionsCenterY: Math.round((oppExp.y + oppExp.height + plrExp.y) / 2),
    opponentExpTop: Math.round(oppExp.y),
    playerExpBottom: Math.round(plrExp.y + plrExp.height),
    discardAreaCenterY: Math.round(discard.y + discard.height / 2),
    midColumnCenterX: Math.round(midCol.x + midCol.width / 2),
    playerHandCenterX: Math.round(playerHand.x + playerHand.width / 2),
    aiHandCenterX: Math.round(aiHand.x + aiHand.width / 2),
    handTop: Math.round(playerHand.y),
    handBottom: Math.round(playerHand.y + playerHand.height),
  };
}

/**
 * Compute Lost Cities layout using SLL zones, falling back to legacy values.
 */
export function computeLostCitiesLayout(): LostCitiesLayout {
  const legacy = buildLegacyLayout();

  if (!LC_SLL_LAYOUT) {
    console.warn('No SLL layout document for Lost Cities; using legacy fallback.');
    return legacy;
  }

  try {
    return applySllLayout(legacy);
  } catch {
    console.warn('Failed to adapt SLL layout for Lost Cities; using legacy fallback.');
    return legacy;
  }
}
