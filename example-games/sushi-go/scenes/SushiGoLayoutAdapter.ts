/**
 * SushiGoLayoutAdapter -- maps SLL layout zones to Sushi Go-specific layout shape.
 *
 * Uses the SLL layout JSON as the single source of truth for zone positioning.
 *
 * @module example-games/sushi-go/scenes/SushiGoLayoutAdapter
 */

import { getZoneRect } from '../../../src/ui/screen-layout';
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

  const aiTableau = getZoneRect(SUSHI_SLL_LAYOUT, 'aiTableau', viewport, 1);
  const playerTableau = getZoneRect(SUSHI_SLL_LAYOUT, 'playerTableau', viewport, 1);
  const playerHand = getZoneRect(SUSHI_SLL_LAYOUT, 'playerHand', viewport, 1);
  const scoreArea = getZoneRect(SUSHI_SLL_LAYOUT, 'scoreArea', viewport, 1);

  return {
    gameW,
    gameH,
    aiTableauCenterY: Math.round(aiTableau.y + aiTableau.height / 2),
    playerTableauCenterY: Math.round(playerTableau.y + playerTableau.height / 2),
    playerHandCenterY: Math.round(playerHand.y + playerHand.height * 0.25),
    scoreAreaCenterX: Math.round(scoreArea.x + scoreArea.width / 2),
    playerScoreY: Math.round(playerTableau.y + playerTableau.height + 30),
    aiScoreY: Math.round(aiTableau.y - 20),
  };
}
