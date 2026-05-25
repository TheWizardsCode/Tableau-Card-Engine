/**
 * SushiGoLayoutAdapter -- maps SLL layout zones to Sushi Go-specific layout shape.
 *
 * Uses the SLL layout JSON as the single source of truth for zone positioning.
 *
 * @module example-games/sushi-go/scenes/SushiGoLayoutAdapter
 */

import { anchorPoint } from '../../../src/ui/screen-layout';
import { parseScreenLayoutDocument } from '../../../src/ui/screen-layout-schema';
import sushiLayoutJson from '../layouts/sushi-go.layout.json';

const parsedLayout = parseScreenLayoutDocument(sushiLayoutJson);

if (!parsedLayout.valid) {
  throw new Error(
    `Invalid Sushi Go SLL layout: ${parsedLayout.errors[0]?.message ?? 'unknown parse error'}`,
  );
}

const SUSHI_SLL_LAYOUT = parsedLayout.layout;

export interface SushiGoLayout {
  gameW: number;
  gameH: number;
  aiTableauCenterY: number;
  playerTableauCenterY: number;
  playerHandCenterY: number;
  scoreAreaCenterX: number;
  playerScoreY: number;
  aiScoreY: number;
}

/**
 * Compute Sushi Go layout using SLL zones as the single source of truth.
 */
export function computeSushiGoLayout(): SushiGoLayout {
  const gameW = 1280;
  const gameH = 720;
  const viewport = { width: gameW, height: gameH };

  const aiTableauCenter = anchorPoint(SUSHI_SLL_LAYOUT, 'aiTableau', 'center', viewport, 1);
  const aiTableauBottom = anchorPoint(SUSHI_SLL_LAYOUT, 'aiTableau', 'bottomCenter', viewport, 1);
  const playerTableauCenter = anchorPoint(SUSHI_SLL_LAYOUT, 'playerTableau', 'center', viewport, 1);
  const playerTableauBottom = anchorPoint(SUSHI_SLL_LAYOUT, 'playerTableau', 'bottomCenter', viewport, 1);
  const playerHandCenterYAnchor = anchorPoint(SUSHI_SLL_LAYOUT, 'playerHand', 'handCenterY', viewport, 1);
  const scoreAreaCenter = anchorPoint(SUSHI_SLL_LAYOUT, 'scoreArea', 'center', viewport, 1);

  return {
    gameW,
    gameH,
    aiTableauCenterY: Math.round(aiTableauCenter.y),
    playerTableauCenterY: Math.round(playerTableauCenter.y),
    playerHandCenterY: Math.round(playerHandCenterYAnchor.y),
    scoreAreaCenterX: Math.round(scoreAreaCenter.x),
    playerScoreY: Math.round(playerTableauBottom.y + 30),
    aiScoreY: Math.round(aiTableauBottom.y - 20),
  };
}
