/**
 * BeleagueredCastleLayoutAdapter -- maps SLL layout zones to Beleaguered Castle-specific layout shape.
 *
 * Uses the SLL layout JSON as the single source of truth for zone positioning.
 *
 * @module example-games/beleaguered-castle/scenes/BeleagueredCastleLayoutAdapter
 */

import { anchorPoint } from '../../../src/ui/screen-layout';
import { parseScreenLayoutDocument } from '../../../src/ui/screen-layout-schema';
import bcLayoutJson from '../layouts/beleaguered-castle.layout.json';

const parsedLayout = parseScreenLayoutDocument(bcLayoutJson);

if (!parsedLayout.valid) {
  throw new Error(
    `Invalid Beleaguered Castle SLL layout: ${parsedLayout.errors[0]?.message ?? 'unknown parse error'}`,
  );
}

const BC_SLL_LAYOUT = parsedLayout.layout;

export interface BeleagueredCastleLayout {
  gameW: number;
  gameH: number;
  headerY: number;
  foundationCenterY: number;
  tableauTopY: number;
  tableauBottomY: number;
}

/**
 * Compute Beleaguered Castle layout using SLL zones as the single source of truth.
 */
export function computeBeleagueredCastleLayout(): BeleagueredCastleLayout {
  const gameW = 1280;
  const gameH = 720;
  const viewport = { width: gameW, height: gameH };

  const headerYAnchor = anchorPoint(BC_SLL_LAYOUT, 'header', 'headerY', viewport, 1);
  const foundationCenter = anchorPoint(BC_SLL_LAYOUT, 'foundation', 'center', viewport, 1);
  const tableauTop = anchorPoint(BC_SLL_LAYOUT, 'tableau', 'topCenter', viewport, 1);
  const tableauBottom = anchorPoint(BC_SLL_LAYOUT, 'tableau', 'bottomCenter', viewport, 1);

  return {
    gameW,
    gameH,
    headerY: Math.round(headerYAnchor.y),
    foundationCenterY: Math.round(foundationCenter.y),
    tableauTopY: Math.round(tableauTop.y),
    tableauBottomY: Math.round(tableauBottom.y),
  };
}
