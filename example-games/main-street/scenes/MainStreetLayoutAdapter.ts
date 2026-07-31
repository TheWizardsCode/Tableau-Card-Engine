/**
 * MainStreetLayoutAdapter -- maps SLL layout zones to Main Street-specific layout shape.
 *
 * Uses the SLL layout JSON as the single source of truth for zone positioning.
 * Card dimensions, gaps, and other non-positioning values come from shared constants.
 *
 * @module example-games/main-street/scenes/MainStreetLayoutAdapter
 */

import {
  anchorPoint,
} from '../../../src/ui/screen-layout';
import { parseScreenLayoutDocument } from '../../../src/ui/screen-layout-schema';
import type { SceneLayout } from './MainStreetConstants';
import {
  BASE_HUD_Y,
  BASE_MARKET_CARD_W,
  BASE_MARKET_CARD_H,
  BASE_MARKET_ROW_GAP,
  BASE_MARKET_CARD_GAP,
  BASE_MARKET_LABEL_W,
  BASE_QUEUE_CARD_W,
  BASE_QUEUE_CARD_H,
  BASE_QUEUE_CARD_GAP,
  BASE_SLOT_W,
  BASE_SLOT_H,
  BASE_SLOT_GAP,
  BASE_HAND_CARD_W,
  BASE_HAND_CARD_H,
  STREET_COLS,
  STREET_ROW_GAP,
} from './MainStreetConstants';
import mainStreetLayoutJson from '../layouts/main-street.layout.json';

const parsedLayout = parseScreenLayoutDocument(mainStreetLayoutJson);

if (!parsedLayout.valid) {
  throw new Error(
    `Invalid Main Street SLL layout: ${parsedLayout.errors[0]?.message ?? 'unknown parse error'}`,
  );
}

const MAIN_STREET_SLL_LAYOUT = parsedLayout.layout;

/**
 * Compute Main Street layout using SLL zones as the single source of truth for positioning.
 * Card dimensions, gaps, and other non-positioning values come from shared constants.
 */
export function computeMainStreetLayoutWithSll(): SceneLayout {
  const gameW = 1280;
  const gameH = 720;
  const viewport = { width: gameW, height: gameH };

  const marketTopLeft = anchorPoint(MAIN_STREET_SLL_LAYOUT, 'market', 'topLeft', viewport, 1);
  const queueTopLeft = anchorPoint(MAIN_STREET_SLL_LAYOUT, 'incidentQueue', 'topLeft', viewport, 1);
  const queueBottomLeft = anchorPoint(MAIN_STREET_SLL_LAYOUT, 'incidentQueue', 'bottomLeft', viewport, 1);
  const streetTopCenter = anchorPoint(MAIN_STREET_SLL_LAYOUT, 'street', 'topCenter', viewport, 1);

  // Compute streetX using the SLL anchor as the center, so it aligns with the
  // left-area column (x≈20 to x≈800). With 5×140px slots and 4×20px gaps:
  //   rowWidth = 5*140 + 4*20 = 780px
  // Centered at streetTopCenter.x = 0.3203125 (410px): streetX = 410 - 390 = 20
  const rowWidth = STREET_COLS * BASE_SLOT_W + (STREET_COLS - 1) * BASE_SLOT_GAP;
  const streetX = Math.round(streetTopCenter.x - rowWidth / 2);
  const handTopLeft = anchorPoint(MAIN_STREET_SLL_LAYOUT, 'hand', 'topLeft', viewport, 1);
  const challengeTopLeft = anchorPoint(MAIN_STREET_SLL_LAYOUT, 'challengePanel', 'topLeft', viewport, 1);
  const challengeBottomRight = anchorPoint(MAIN_STREET_SLL_LAYOUT, 'challengePanel', 'bottomRight', viewport, 1);
  const logTopLeft = anchorPoint(MAIN_STREET_SLL_LAYOUT, 'activityLog', 'topLeft', viewport, 1);
  const logBottomRight = anchorPoint(MAIN_STREET_SLL_LAYOUT, 'activityLog', 'bottomRight', viewport, 1);

  const marketRowH = BASE_MARKET_CARD_H + 14;

  const actionButtonH = 34;
  const hintButtonW = 104;
  const smallButtonW = 68;
  const actionButtonW = 140; // from per-game constants (matches legacy endTurnButton.width)

  const logVisible = true;
  const logW = Math.round(logBottomRight.x - logTopLeft.x);
  const logH = Math.round(logBottomRight.y - logTopLeft.y);
  const challengeW = Math.round(challengeBottomRight.x - challengeTopLeft.x);
  const eventsHeight = Math.round(queueBottomLeft.y - queueTopLeft.y);

  return {
    gameW,
    gameH,
    hudY: BASE_HUD_Y,
    marketTop: Math.round(marketTopLeft.y),
    marketRowH,
    marketRowGap: BASE_MARKET_ROW_GAP,
    marketCardW: BASE_MARKET_CARD_W,
    marketCardH: BASE_MARKET_CARD_H,
    marketCardGap: BASE_MARKET_CARD_GAP,
    marketLabelW: BASE_MARKET_LABEL_W,
    queueTop: Math.round(queueTopLeft.y),
    queueCardW: BASE_QUEUE_CARD_W,
    queueCardH: BASE_QUEUE_CARD_H,
    queueCardGap: BASE_QUEUE_CARD_GAP,
    queueLabelW: BASE_MARKET_LABEL_W,
    eventsHeight,
    // Shift streetTop down by half the action button height (34 / 2 ≈ 17px) for vertical spacing
    streetTop: Math.round(streetTopCenter.y) + 17,
    slotW: BASE_SLOT_W,
    slotH: BASE_SLOT_H,
    slotGap: BASE_SLOT_GAP,
    streetX,
    streetRowGap: STREET_ROW_GAP,
    streetCols: STREET_COLS,
    handY: Math.round(handTopLeft.y),
    handX: Math.round(handTopLeft.x),
    handCenterX: Math.round(streetTopCenter.x),
    handCardW: BASE_HAND_CARD_W,
    handCardH: BASE_HAND_CARD_H,
    instructionY: Math.round(handTopLeft.y - 20),
    actionY: Math.round(handTopLeft.y + 28),
    actionButtonH,
    actionButtonW,
    hintButtonW,
    smallButtonW,
    challengeX: Math.round(challengeTopLeft.x),
    challengeY: Math.round(challengeTopLeft.y),
    challengeW,
    logX: logVisible ? Math.round(logTopLeft.x) : -1000,
    logY: logVisible ? Math.round(logTopLeft.y) : 0,
    logW: logVisible ? logW : 0,
    logH,
  };
}
