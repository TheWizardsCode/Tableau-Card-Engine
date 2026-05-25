/**
 * LostCitiesLayoutAdapter -- maps SLL layout zones to Lost Cities-specific layout shape.
 *
 * Uses the SLL layout JSON as the single source of truth for zone positioning.
 *
 * @module example-games/lost-cities/scenes/LostCitiesLayoutAdapter
 */

import { getZoneRect } from '../../../src/ui/screen-layout';
import { parseScreenLayoutDocument } from '../../../src/ui/screen-layout-schema';
import lcLayoutJson from '../layouts/lost-cities.layout.json';

const parsedLayout = parseScreenLayoutDocument(lcLayoutJson);

if (!parsedLayout.valid) {
  throw new Error(
    `Invalid Lost Cities SLL layout: ${parsedLayout.errors[0]?.message ?? 'unknown parse error'}`,
  );
}

const LC_SLL_LAYOUT = parsedLayout.layout;

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

/**
 * Compute Lost Cities layout using SLL zones as the single source of truth.
 */
export function computeLostCitiesLayout(): LostCitiesLayout {
  const gameW = 1280;
  const gameH = 720;
  const viewport = { width: gameW, height: gameH };

  const oppExp = getZoneRect(LC_SLL_LAYOUT, 'opponentExpeditions', viewport, 1);
  const plrExp = getZoneRect(LC_SLL_LAYOUT, 'playerExpeditions', viewport, 1);
  const discard = getZoneRect(LC_SLL_LAYOUT, 'discardArea', viewport, 1);
  const midCol = getZoneRect(LC_SLL_LAYOUT, 'midColumn', viewport, 1);
  const playerHand = getZoneRect(LC_SLL_LAYOUT, 'playerHand', viewport, 1);
  const aiHand = getZoneRect(LC_SLL_LAYOUT, 'aiHand', viewport, 1);

  return {
    gameW,
    gameH,
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
