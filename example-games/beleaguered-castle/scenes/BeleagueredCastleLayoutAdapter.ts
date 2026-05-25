/**
 * BeleagueredCastleLayoutAdapter -- maps SLL layout zones to Beleaguered Castle-specific layout shape.
 *
 * @module example-games/beleaguered-castle/scenes/BeleagueredCastleLayoutAdapter
 */

import { getZoneRect } from '../../../src/ui/screen-layout';
import { parseScreenLayoutDocument } from '../../../src/ui/screen-layout-schema';
import type { ScreenLayoutDocument } from '../../../src/ui/screen-layout-schema';
import bcLayoutJson from '../layouts/beleaguered-castle.layout.json';

const parsedLayout = parseScreenLayoutDocument(bcLayoutJson);

const BC_SLL_LAYOUT: ScreenLayoutDocument | null =
  parsedLayout.valid ? parsedLayout.layout : null;

export interface BeleagueredCastleLayout {
  gameW: number;
  gameH: number;
  headerY: number;
  foundationCenterY: number;
  tableauTopY: number;
  tableauBottomY: number;
}

function buildLegacyLayout(): BeleagueredCastleLayout {
  return {
    gameW: 1280,
    gameH: 720,
    headerY: 20,
    foundationCenterY: 95,
    tableauTopY: 267,
    tableauBottomY: 617,
  };
}

function applySllLayout(legacyLayout: BeleagueredCastleLayout): BeleagueredCastleLayout {
  if (!BC_SLL_LAYOUT) {
    return legacyLayout;
  }

  const viewport = { width: legacyLayout.gameW, height: legacyLayout.gameH };

  const header = getZoneRect(BC_SLL_LAYOUT, 'header', viewport, 1);
  const foundation = getZoneRect(BC_SLL_LAYOUT, 'foundation', viewport, 1);
  const tableau = getZoneRect(BC_SLL_LAYOUT, 'tableau', viewport, 1);

  return {
    ...legacyLayout,
    headerY: Math.round(header.y + header.height * 0.25),
    foundationCenterY: Math.round(foundation.y + foundation.height / 2),
    tableauTopY: Math.round(tableau.y),
    tableauBottomY: Math.round(tableau.y + tableau.height),
  };
}

/**
 * Compute Beleaguered Castle layout using SLL zones, falling back to legacy values.
 */
export function computeBeleagueredCastleLayout(): BeleagueredCastleLayout {
  const legacy = buildLegacyLayout();

  if (!BC_SLL_LAYOUT) {
    console.warn('No SLL layout document for Beleaguered Castle; using legacy fallback.');
    return legacy;
  }

  try {
    return applySllLayout(legacy);
  } catch {
    console.warn('Failed to adapt SLL layout for Beleaguered Castle; using legacy fallback.');
    return legacy;
  }
}
