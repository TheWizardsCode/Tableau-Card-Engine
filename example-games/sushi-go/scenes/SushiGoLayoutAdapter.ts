/**
 * SushiGoLayoutAdapter -- maps SLL layout zones to Sushi Go-specific layout shape.
 *
 * @module example-games/sushi-go/scenes/SushiGoLayoutAdapter
 */

import { getZoneRect } from '../../../src/ui/screen-layout';
import { parseScreenLayoutDocument } from '../../../src/ui/screen-layout-schema';
import type { ScreenLayoutDocument } from '../../../src/ui/screen-layout-schema';
import sushiLayoutJson from '../layouts/sushi-go.layout.json';

const parsedLayout = parseScreenLayoutDocument(sushiLayoutJson);

const SUSHI_SLL_LAYOUT: ScreenLayoutDocument | null =
  parsedLayout.valid ? parsedLayout.layout : null;

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

function buildLegacyLayout(): SushiGoLayout {
  return {
    gameW: 1280,
    gameH: 720,
    aiTableauCenterY: 200,
    playerTableauCenterY: 395,
    playerHandCenterY: 600,
    scoreAreaCenterX: 1265,
    playerScoreY: 485,
    aiScoreY: 100,
  };
}

function applySllLayout(legacyLayout: SushiGoLayout): SushiGoLayout {
  if (!SUSHI_SLL_LAYOUT) {
    return legacyLayout;
  }

  const viewport = { width: legacyLayout.gameW, height: legacyLayout.gameH };

  const aiTableau = getZoneRect(SUSHI_SLL_LAYOUT, 'aiTableau', viewport, 1);
  const playerTableau = getZoneRect(SUSHI_SLL_LAYOUT, 'playerTableau', viewport, 1);
  const playerHand = getZoneRect(SUSHI_SLL_LAYOUT, 'playerHand', viewport, 1);
  const scoreArea = getZoneRect(SUSHI_SLL_LAYOUT, 'scoreArea', viewport, 1);

  return {
    ...legacyLayout,
    aiTableauCenterY: Math.round(aiTableau.y + aiTableau.height / 2),
    playerTableauCenterY: Math.round(playerTableau.y + playerTableau.height / 2),
    playerHandCenterY: Math.round(playerHand.y + playerHand.height * 0.25),
    scoreAreaCenterX: Math.round(scoreArea.x + scoreArea.width / 2),
    playerScoreY: Math.round(playerTableau.y + playerTableau.height + 30),
    aiScoreY: Math.round(aiTableau.y - 20),
  };
}

/**
 * Compute Sushi Go layout using SLL zones, falling back to legacy values.
 */
export function computeSushiGoLayout(): SushiGoLayout {
  const legacy = buildLegacyLayout();

  if (!SUSHI_SLL_LAYOUT) {
    console.warn('No SLL layout document for Sushi Go; using legacy fallback.');
    return legacy;
  }

  try {
    return applySllLayout(legacy);
  } catch {
    console.warn('Failed to adapt SLL layout for Sushi Go; using legacy fallback.');
    return legacy;
  }
}
