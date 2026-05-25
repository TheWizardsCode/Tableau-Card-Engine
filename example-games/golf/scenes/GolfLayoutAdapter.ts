/**
 * GolfLayoutAdapter -- maps SLL layout zones to Golf-specific layout shape.
 *
 * Uses the SLL layout JSON as the single source of truth for zone positioning.
 * The adapter derives grid cell positions, pile centres, and UI anchor points
 * from the resolved SLL zones.
 *
 * @module example-games/golf/scenes/GolfLayoutAdapter
 */

import { getZoneRect } from '../../../src/ui/screen-layout';
import { parseScreenLayoutDocument } from '../../../src/ui/screen-layout-schema';
import golfLayoutJson from '../layouts/golf.layout.json';
import {
  GOLF_CARD_W, GOLF_CARD_H, CARD_GAP,
  GRID_COLS, GRID_ROWS,
} from './GolfConstants';

const parsedLayout = parseScreenLayoutDocument(golfLayoutJson);

if (!parsedLayout.valid) {
  throw new Error(
    `Invalid Golf SLL layout: ${parsedLayout.errors[0]?.message ?? 'unknown parse error'}`,
  );
}

const GOLF_SLL_LAYOUT = parsedLayout.layout;

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

/**
 * Compute the Golf layout using SLL zones as the single source of truth.
 */
export function computeGolfLayout(): GolfLayout {
  const gameW = 1280;
  const gameH = 720;
  const viewport = { width: gameW, height: gameH };

  const humanGrid = getZoneRect(GOLF_SLL_LAYOUT, 'humanGrid', viewport, 1);
  const aiGrid = getZoneRect(GOLF_SLL_LAYOUT, 'aiGrid', viewport, 1);
  const stockPile = getZoneRect(GOLF_SLL_LAYOUT, 'stockPile', viewport, 1);
  const discardPile = getZoneRect(GOLF_SLL_LAYOUT, 'discardPile', viewport, 1);

  return {
    gameW,
    gameH,
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
