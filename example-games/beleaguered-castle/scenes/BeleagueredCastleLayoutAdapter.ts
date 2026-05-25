/**
 * BeleagueredCastleLayoutAdapter -- maps SLL layout zones to Beleaguered Castle-specific layout shape.
 *
 * Uses the SLL layout JSON as the single source of truth for zone positioning.
 *
 * @module example-games/beleaguered-castle/scenes/BeleagueredCastleLayoutAdapter
 */

import { getZoneRect } from '../../../src/ui/screen-layout';
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

  const header = getZoneRect(BC_SLL_LAYOUT, 'header', viewport, 1);
  const foundation = getZoneRect(BC_SLL_LAYOUT, 'foundation', viewport, 1);
  const tableau = getZoneRect(BC_SLL_LAYOUT, 'tableau', viewport, 1);

  return {
    gameW,
    gameH,
    headerY: Math.round(header.y + header.height * 0.25),
    foundationCenterY: Math.round(foundation.y + foundation.height / 2),
    tableauTopY: Math.round(tableau.y),
    tableauBottomY: Math.round(tableau.y + tableau.height),
  };
}
