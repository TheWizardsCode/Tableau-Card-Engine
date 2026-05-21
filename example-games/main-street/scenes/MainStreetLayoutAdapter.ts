import {
  adaptLayoutWithFallback,
  getZoneRect,
  type ScreenLayoutIssue,
} from '../../../src/ui/screen-layout';
import { parseScreenLayoutDocument } from '../../../src/ui/screen-layout-schema';
import type { ScreenLayoutDocument } from '../../../src/ui/screen-layout-schema';
import type { SceneLayout } from './MainStreetConstants';
import mainStreetLayoutJson from '../layouts/main-street.layout.json';

const parsedLayout = parseScreenLayoutDocument(mainStreetLayoutJson);

const MAIN_STREET_SLL_LAYOUT: ScreenLayoutDocument | null =
  parsedLayout.valid ? parsedLayout.layout : null;

function applySllLayout(legacyLayout: SceneLayout): SceneLayout {
  if (!MAIN_STREET_SLL_LAYOUT) {
    return legacyLayout;
  }

  const viewport = {
    width: legacyLayout.gameW,
    height: legacyLayout.gameH,
  };

  const market = getZoneRect(MAIN_STREET_SLL_LAYOUT, 'market', viewport, 1);
  const incidentQueue = getZoneRect(MAIN_STREET_SLL_LAYOUT, 'incidentQueue', viewport, 1);
  const street = getZoneRect(MAIN_STREET_SLL_LAYOUT, 'street', viewport, 1);
  const hand = getZoneRect(MAIN_STREET_SLL_LAYOUT, 'hand', viewport, 1);
  const actions = getZoneRect(MAIN_STREET_SLL_LAYOUT, 'actions', viewport, 1);
  const endTurnButton = getZoneRect(MAIN_STREET_SLL_LAYOUT, 'endTurnButton', viewport, 1);
  const activityLog = getZoneRect(MAIN_STREET_SLL_LAYOUT, 'activityLog', viewport, 1);
  const challengePanel = getZoneRect(MAIN_STREET_SLL_LAYOUT, 'challengePanel', viewport, 1);

  return {
    ...legacyLayout,
    marketTop: Math.round(market.y),
    queueTop: Math.round(incidentQueue.y),
    streetTop: Math.round(street.y),
    streetX: Math.round(street.x),
    handX: Math.round(hand.x),
    handY: Math.round(hand.y),
    instructionY: Math.round(hand.y - 20),
    actionY: Math.round(actions.y),
    actionButtonW: Math.round(endTurnButton.width),
    actionButtonH: Math.round(endTurnButton.height),
    logX: Math.round(activityLog.x),
    logY: Math.round(activityLog.y),
    logW: Math.round(activityLog.width),
    logH: Math.round(activityLog.height),
    challengeX: Math.round(challengePanel.x),
    challengeY: Math.round(challengePanel.y),
    challengeW: Math.round(challengePanel.width),
  };
}

function reportMainStreetLayoutIssue(_issue: ScreenLayoutIssue): void {
  // Hook intentionally kept lightweight. In tests we rely on deterministic output,
  // so this remains a no-op unless future telemetry wiring is required.
}

export function computeMainStreetLayoutWithSll(legacyLayout: SceneLayout): SceneLayout {
  return adaptLayoutWithFallback({
    layoutDocument: MAIN_STREET_SLL_LAYOUT,
    viewport: { width: legacyLayout.gameW, height: legacyLayout.gameH },
    dpr: 1,
    mapResolvedLayout: () => applySllLayout(legacyLayout),
    fallback: () => legacyLayout,
    reportIssue: reportMainStreetLayoutIssue,
  });
}
