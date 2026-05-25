/**
 * GolfLayoutAdapter -- maps SLL layout zones to Golf-specific layout shape.
 *
 * Uses the SLL layout JSON as the single source of truth for zone positioning.
 * The adapter derives grid cell positions, pile centres, and UI anchor points
 * from the resolved SLL zones.
 *
 * @module example-games/golf/scenes/GolfLayoutAdapter
 */

import { getZoneRect, type ScreenLayoutIssue } from '../../../src/ui/screen-layout';
import { parseScreenLayoutDocument } from '../../../src/ui/screen-layout-schema';
import type { ScreenLayoutDocument } from '../../../src/ui/screen-layout-schema';
import golfLayoutJson from '../layouts/golf.layout.json';
import {
  GOLF_CARD_W, GOLF_CARD_H, CARD_GAP,
  GRID_COLS, GRID_ROWS,
} from './GolfConstants';

const parsedLayout = parseScreenLayoutDocument(golfLayoutJson);

const GOLF_SLL_LAYOUT: ScreenLayoutDocument | null =
  parsedLayout.valid ? parsedLayout.layout : null;

export interface GolfLayout {
  gameW: number;
  gameH: number;
  humanGridCenterX: number;
  humanGridCenterY: number;
  aiGridCenterX: number;
  aiGridCenterY: number;
  stockPileCenterX: number;
  stockPileCenterY: number;
  discardPileCenterX: number;
  discardPileCenterY: number;
}

function applySllLayout(legacyLayout: GolfLayout): GolfLayout {
  if (!GOLF_SLL_LAYOUT) {
    return legacyLayout;
  }

  const viewport = { width: legacyLayout.gameW, height: legacyLayout.gameH };

  const humanGrid = getZoneRect(GOLF_SLL_LAYOUT, 'humanGrid', viewport, 1);
  const aiGrid = getZoneRect(GOLF_SLL_LAYOUT, 'aiGrid', viewport, 1);
  const stockPile = getZoneRect(GOLF_SLL_LAYOUT, 'stockPile', viewport, 1);
  const discardPile = getZoneRect(GOLF_SLL_LAYOUT, 'discardPile', viewport, 1);

  return {
    ...legacyLayout,
    humanGridCenterX: Math.round(humanGrid.x + humanGrid.width / 2),
    humanGridCenterY: Math.round(humanGrid.y + humanGrid.height / 2),
    aiGridCenterX: Math.round(aiGrid.x + aiGrid.width / 2),
    aiGridCenterY: Math.round(aiGrid.y + aiGrid.height / 2),
    stockPileCenterX: Math.round(stockPile.x + stockPile.width / 2),
    stockPileCenterY: Math.round(stockPile.y + stockPile.height / 2),
    discardPileCenterX: Math.round(discardPile.x + discardPile.width / 2),
    discardPileCenterY: Math.round(discardPile.y + discardPile.height / 2),
  };
}

function reportGolfLayoutIssue(_issue: ScreenLayoutIssue): void {
  // Intentionally lightweight; future telemetry wiring can be added here.
}

/**
 * Legacy layout shape used by the Golf renderer.
 */
function buildLegacyGolfLayout(): GolfLayout {
  return {
    gameW: 1280,
    gameH: 720,
    humanGridCenterX: 230,
    humanGridCenterY: 385,
    aiGridCenterX: 1050,
    aiGridCenterY: 385,
    stockPileCenterX: 640,
    stockPileCenterY: 295,
    discardPileCenterX: 640,
    discardPileCenterY: 490,
  };
}

/**
 * Compute the Golf layout using SLL zones, falling back to hardcoded
 * legacy values if the SLL document is unavailable or fails to resolve.
 */
export function computeGolfLayout(): GolfLayout {
  const legacy = buildLegacyGolfLayout();

  if (!GOLF_SLL_LAYOUT) {
    reportGolfLayoutIssue({
      code: 'LAYOUT_MISSING',
      message: 'No SLL layout document available for Golf; using legacy fallback layout.',
    });
    return legacy;
  }

  try {
    return applySllLayout(legacy);
  } catch (_error) {
    reportGolfLayoutIssue({
      code: 'LAYOUT_ADAPTER_FALLBACK',
      message: 'Failed to adapt SLL layout to Golf shape; using legacy fallback layout.',
    });
    return legacy;
  }
}

/**
 * Compute the grid cell position for a given card index within a player's grid,
 * using the SLL-derived layout.
 */
export function gridCellPosition(
  layout: GolfLayout,
  index: number,
  player: 'human' | 'ai',
): { x: number; y: number } {
  const row = Math.floor(index / GRID_COLS);
  const col = index % GRID_COLS;

  const gridW = GRID_COLS * GOLF_CARD_W + (GRID_COLS - 1) * CARD_GAP;
  const gridH = GRID_ROWS * GOLF_CARD_H + (GRID_ROWS - 1) * CARD_GAP;

  const centerX = player === 'human' ? layout.humanGridCenterX : layout.aiGridCenterX;
  const centerY = player === 'human' ? layout.humanGridCenterY : layout.aiGridCenterY;
  const startX = centerX - gridW / 2 + GOLF_CARD_W / 2;
  const startY = centerY - gridH / 2 + GOLF_CARD_H / 2;

  return {
    x: startX + col * (GOLF_CARD_W + CARD_GAP),
    y: startY + row * (GOLF_CARD_H + CARD_GAP),
  };
}
