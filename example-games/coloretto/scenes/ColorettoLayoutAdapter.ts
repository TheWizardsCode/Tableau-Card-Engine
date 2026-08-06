/**
 * ColorettoLayoutAdapter -- maps SLL layout zones to Coloretto-specific
 * layout positions.
 *
 * Uses the SLL layout JSON as the single source of truth for zone
 * positioning, following the Sushi Go! pattern.
 *
 * @module example-games/coloretto/scenes/ColorettoLayoutAdapter
 */

import { anchorPoint } from '../../../src/ui/screen-layout';
import { parseScreenLayoutDocument } from '../../../src/ui/screen-layout-schema';
import colorettoLayoutJson from '../layouts/coloretto.layout.json';

const parsedLayout = parseScreenLayoutDocument(colorettoLayoutJson);

if (!parsedLayout.valid) {
  throw new Error(
    `Invalid Coloretto SLL layout: ${parsedLayout.errors[0]?.message ?? 'unknown parse error'}`,
  );
}

const COLORETTO_SLL_LAYOUT = parsedLayout.layout;

export interface ColorettoLayout {
  gameW: number;
  gameH: number;
  headerY: number;
  roundY: number;
  turnY: number;
  rowsCenterX: number;
  rowsCenterY: number;
  deckCenterX: number;
  deckCenterY: number;
  deckLabelY: number;
  /** Centre of the Last Round card resting position (between tableau and deck). */
  lastRoundCenterX: number;
  lastRoundCenterY: number;
  collectionsTopX: number;
  collectionsTopY: number;
  instructionY: number;
}

/**
 * Compute the Coloretto layout using SLL zones as the source of truth.
 */
export function computeColorettoLayout(): ColorettoLayout {
  const gameW = 1280;
  const gameH = 720;
  const viewport = { width: gameW, height: gameH };

  const header = anchorPoint(COLORETTO_SLL_LAYOUT, 'header', 'center', viewport, 1);
  const round = anchorPoint(COLORETTO_SLL_LAYOUT, 'header', 'roundCenter', viewport, 1);
  const turn = anchorPoint(COLORETTO_SLL_LAYOUT, 'header', 'turnCenter', viewport, 1);
  const rowsCenter = anchorPoint(COLORETTO_SLL_LAYOUT, 'rowsArea', 'center', viewport, 1);
  const deckCenter = anchorPoint(COLORETTO_SLL_LAYOUT, 'deckArea', 'center', viewport, 1);
  const deckLabel = anchorPoint(COLORETTO_SLL_LAYOUT, 'deckArea', 'labelCenter', viewport, 1);
  const lastRoundCenter = anchorPoint(COLORETTO_SLL_LAYOUT, 'lastRoundArea', 'center', viewport, 1);
  const collectionsTop = anchorPoint(COLORETTO_SLL_LAYOUT, 'collectionsArea', 'topLeft', viewport, 1);
  const instruction = anchorPoint(COLORETTO_SLL_LAYOUT, 'instructionArea', 'center', viewport, 1);

  return {
    gameW,
    gameH,
    headerY: Math.round(header.y),
    roundY: Math.round(round.y),
    turnY: Math.round(turn.y),
    rowsCenterX: Math.round(rowsCenter.x),
    rowsCenterY: Math.round(rowsCenter.y),
    deckCenterX: Math.round(deckCenter.x),
    deckCenterY: Math.round(deckCenter.y),
    deckLabelY: Math.round(deckLabel.y),
    lastRoundCenterX: Math.round(lastRoundCenter.x),
    lastRoundCenterY: Math.round(lastRoundCenter.y),
    collectionsTopX: Math.round(collectionsTop.x),
    collectionsTopY: Math.round(collectionsTop.y),
    instructionY: Math.round(instruction.y),
  };
}
