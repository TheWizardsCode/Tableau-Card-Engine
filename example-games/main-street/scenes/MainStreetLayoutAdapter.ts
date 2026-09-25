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
} from '@ui/screen-layout';
import { parseScreenLayoutDocument } from '@ui/screen-layout-schema';
import type { SceneLayout } from './MainStreetConstants';
import {
  BASE_HUD_Y,
  HUD_FAVOUR_BAND_OFFSET_PX,
  HUD_FAVOUR_BUTTON_H_PX,
  MARKET_BOX_MARGIN_PX,
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
  baseRoadBandThickness,
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
  //
  // The whole street block is then shifted RIGHT by one road band so that the
  // entire road ring around the street is on-canvas at the default zoom
  // (CG-0MT5Y1X5T001M4S6): at x=20 the left-hand road (≈57px wide) would be
  // clipped. The left column has room for this, and the right-hand road still
  // stops short of the right-hand panel (x≈960).
  const rowWidth = STREET_COLS * BASE_SLOT_W + (STREET_COLS - 1) * BASE_SLOT_GAP;
  const roadBand = baseRoadBandThickness();
  const streetX = Math.round(streetTopCenter.x - rowWidth / 2 + roadBand);
  // The hand row stays centred on the street block so the left column remains
  // visually aligned after the shift.
  const columnCenterX = streetX + rowWidth / 2;
  const handTopLeft = anchorPoint(MAIN_STREET_SLL_LAYOUT, 'hand', 'topLeft', viewport, 1);
  const challengeTopLeft = anchorPoint(MAIN_STREET_SLL_LAYOUT, 'challengePanel', 'topLeft', viewport, 1);
  const challengeBottomRight = anchorPoint(MAIN_STREET_SLL_LAYOUT, 'challengePanel', 'bottomRight', viewport, 1);
  const logTopLeft = anchorPoint(MAIN_STREET_SLL_LAYOUT, 'activityLog', 'topLeft', viewport, 1);
  const logBottomRight = anchorPoint(MAIN_STREET_SLL_LAYOUT, 'activityLog', 'bottomRight', viewport, 1);

  const marketRowH = BASE_MARKET_CARD_H + 14;

  // ── HUD / market geometry source of truth (CG-0MUFAIS8W0011LGQ) ─────
  // The market background box and the HUD strip share one set of edges:
  //   left  = market zone topLeft.x (SLL)         → 20 at 1280×720
  //   right = activityLog topLeft.x - margin      → logX - 20 = 940
  // Both renderers read these from SceneLayout, so the two bars cannot
  // silently desynchronise (no duplicated `20` / `logX - 20` literals).
  const marketLeft = Math.round(marketTopLeft.x);
  const marketRight = Math.round(logTopLeft.x) - MARKET_BOX_MARGIN_PX;
  const hudLeft = marketLeft;
  const hudRight = marketRight;
  const hudWidth = hudRight - hudLeft;

  const actionButtonH = 34;
  const hintButtonW = 104;
  const smallButtonW = 68;
  const favourButtonW = 110;
  const actionButtonW = 140; // from per-game constants (matches legacy endTurnButton.width)

  const logVisible = true;
  const logW = Math.round(logBottomRight.x - logTopLeft.x);
  const logH = Math.round(logBottomRight.y - logTopLeft.y);
  const challengeW = Math.round(challengeBottomRight.x - challengeTopLeft.x);
  const eventsHeight = Math.round(queueBottomLeft.y - queueTopLeft.y);

  // ── Community Favour buttons (CG-0MSTOATDQ005XDET) ──────────
  // Positioned via SLL zone center anchors; left edge = centerX - width/2.
  const favourCoinsToRepCenter = anchorPoint(MAIN_STREET_SLL_LAYOUT, 'favourCoinsToRepButton', 'center', viewport, 1);
  const favourRepToCoinsCenter = anchorPoint(MAIN_STREET_SLL_LAYOUT, 'favourRepToCoinsButton', 'center', viewport, 1);

  // ── Reserved Community Favour band inside the HUD strip ──────
  // The band sits immediately right of the Coins readout and holds both
  // favour buttons (`[rep→coins][coins→rep]`). Reputation is laid out to the
  // right of this band so the two never overlap (CG-0MUFAISSZ002TE1B).
  const favourBandLeft = hudLeft + HUD_FAVOUR_BAND_OFFSET_PX;
  const favourBandRight = favourBandLeft + 2 * favourButtonW;

  // ── Staff applicant overlay (CG-0MSTOATDU006UGAX) ──────────────
  // The applicant card + buttons render from the applicantOverlay SLL zone
  // center anchor. Falls back to screen centre when the zone is absent
  // (legacy layouts / defensive resolution).
  let applicantCenterX = Math.round(gameW / 2);
  let applicantCenterY = Math.round(gameH * 0.4);
  try {
    const ac = anchorPoint(MAIN_STREET_SLL_LAYOUT, 'applicantOverlay', 'center', viewport, 1);
    applicantCenterX = Math.round(ac.x);
    applicantCenterY = Math.round(ac.y);
  } catch { /* fallback to defaults */ }

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
    handCenterX: Math.round(columnCenterX),
    handCardW: BASE_HAND_CARD_W,
    handCardH: BASE_HAND_CARD_H,
    instructionY: Math.round(handTopLeft.y - 20),
    actionY: Math.round(handTopLeft.y + 28),
    actionButtonH,
    actionButtonW,
    hintButtonW,
    smallButtonW,
    favourButtonW,
    favourCoinsToRepX: Math.round(favourCoinsToRepCenter.x - favourButtonW / 2),
    favourRepToCoinsX: Math.round(favourRepToCoinsCenter.x - favourButtonW / 2),
    favourButtonH: HUD_FAVOUR_BUTTON_H_PX,
    marketLeft,
    marketRight,
    hudLeft,
    hudRight,
    hudWidth,
    favourBandLeft,
    favourBandRight,
    applicantCenterX,
    applicantCenterY,
    challengeX: Math.round(challengeTopLeft.x),
    challengeY: Math.round(challengeTopLeft.y),
    challengeW,
    logX: logVisible ? Math.round(logTopLeft.x) : -1000,
    logY: logVisible ? Math.round(logTopLeft.y) : 0,
    logW: logVisible ? logW : 0,
    logH,
  };
}
