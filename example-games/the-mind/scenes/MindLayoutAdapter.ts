/**
 * MindLayoutAdapter -- maps SLL layout zones to The Mind-specific layout shape.
 *
 * Uses the SLL layout JSON as the single source of truth for zone positioning.
 *
 * @module example-games/the-mind/scenes/MindLayoutAdapter
 */

import { getZoneRect } from '../../../src/ui/screen-layout';
import { parseScreenLayoutDocument } from '../../../src/ui/screen-layout-schema';
import type { ScreenLayoutDocument } from '../../../src/ui/screen-layout-schema';
import mindLayoutJson from '../layouts/the-mind.layout.json';

const parsedLayout = parseScreenLayoutDocument(mindLayoutJson);

const MIND_SLL_LAYOUT: ScreenLayoutDocument | null =
  parsedLayout.valid ? parsedLayout.layout : null;

export interface MindLayout {
  gameW: number;
  gameH: number;
  playPileCenterX: number;
  playPileCenterY: number;
  humanHandCenterY: number;
  aiHandCenterY: number;
}

function buildLegacyMindLayout(): MindLayout {
  return {
    gameW: 1280,
    gameH: 720,
    playPileCenterX: 640,
    playPileCenterY: 350,
    humanHandCenterY: 610,
    aiHandCenterY: 150,
  };
}

function applySllLayout(legacyLayout: MindLayout): MindLayout {
  if (!MIND_SLL_LAYOUT) {
    return legacyLayout;
  }

  const viewport = { width: legacyLayout.gameW, height: legacyLayout.gameH };

  const playPile = getZoneRect(MIND_SLL_LAYOUT, 'playPile', viewport, 1);
  const humanHand = getZoneRect(MIND_SLL_LAYOUT, 'humanHand', viewport, 1);
  const aiHand = getZoneRect(MIND_SLL_LAYOUT, 'aiHand', viewport, 1);

  return {
    ...legacyLayout,
    playPileCenterX: Math.round(playPile.x + playPile.width / 2),
    playPileCenterY: Math.round(playPile.y + playPile.height / 2),
    humanHandCenterY: Math.round(humanHand.y + humanHand.height * 0.75),
    aiHandCenterY: Math.round(aiHand.y + aiHand.height * 0.25),
  };
}

/**
 * Compute The Mind layout using SLL zones, falling back to hardcoded
 * legacy values if the SLL document is unavailable.
 */
export function computeMindLayout(): MindLayout {
  const legacy = buildLegacyMindLayout();

  if (!MIND_SLL_LAYOUT) {
    console.warn('No SLL layout document available for The Mind; using legacy fallback layout.');
    return legacy;
  }

  try {
    return applySllLayout(legacy);
  } catch {
    console.warn('Failed to adapt SLL layout for The Mind; using legacy fallback layout.');
    return legacy;
  }
}
