/**
 * LostCitiesLayoutAdapter -- maps SLL layout zones to Lost Cities-specific layout shape.
 *
 * Uses the SLL layout JSON as the single source of truth for zone positioning.
 *
 * @module example-games/lost-cities/scenes/LostCitiesLayoutAdapter
 */

import { anchorPoint } from '../../../src/ui/screen-layout';
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

  const oppExpTop = anchorPoint(LC_SLL_LAYOUT, 'opponentExpeditions', 'top', viewport, 1);
  const oppExpCenter = anchorPoint(LC_SLL_LAYOUT, 'opponentExpeditions', 'center', viewport, 1);
  const plrExpCenter = anchorPoint(LC_SLL_LAYOUT, 'playerExpeditions', 'center', viewport, 1);
  const plrExpBottom = anchorPoint(LC_SLL_LAYOUT, 'playerExpeditions', 'bottom', viewport, 1);
  const discardCenter = anchorPoint(LC_SLL_LAYOUT, 'discardArea', 'center', viewport, 1);
  const midColCenter = anchorPoint(LC_SLL_LAYOUT, 'midColumn', 'center', viewport, 1);
  const playerHandCenter = anchorPoint(LC_SLL_LAYOUT, 'playerHand', 'center', viewport, 1);
  const playerHandTop = anchorPoint(LC_SLL_LAYOUT, 'playerHand', 'top', viewport, 1);
  const playerHandBottom = anchorPoint(LC_SLL_LAYOUT, 'playerHand', 'bottom', viewport, 1);
  const aiHandCenter = anchorPoint(LC_SLL_LAYOUT, 'aiHand', 'center', viewport, 1);

  return {
    gameW,
    gameH,
    expeditionsCenterY: Math.round((oppExpCenter.y + plrExpCenter.y) / 2),
    opponentExpTop: Math.round(oppExpTop.y),
    playerExpBottom: Math.round(plrExpBottom.y),
    discardAreaCenterY: Math.round(discardCenter.y),
    midColumnCenterX: Math.round(midColCenter.x),
    playerHandCenterX: Math.round(playerHandCenter.x),
    aiHandCenterX: Math.round(aiHandCenter.x),
    handTop: Math.round(playerHandTop.y),
    handBottom: Math.round(playerHandBottom.y),
  };
}
