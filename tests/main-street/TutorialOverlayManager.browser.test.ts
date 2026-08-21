/**
 * Browser tests for MainStreetTutorialOverlayManager highlight zones.
 *
 * Validates that the highlight rectangles drawn by showStep
 * cover the correct UI areas for each TutorialHighlightZone in the
 * unified T1–T18 tutorial system.
 *
 * Unified step mapping (18 steps):
 *   0=T1 centerModal(confirm)  1=T2 developmentRow(confirm)
 *   2=T3 laundromatCard(action)  3=T4 hand(confirm)  4=T5 streetGrid(action)
 *   5=T6 incidentQueue(confirm)  6=T7 endTurnButton(action)  7=T8 investmentsRow(confirm)
 *   8=T9 festivalCard(action)  9=T10 developmentRow(action)  10=T11 endTurnButton(action)
 *   11=T12 developmentRow(confirm)  12=T13 actionButtons(action, Community Favour)
 *   13=T14 developmentRow(action)  14=T15 hand(action)  15=T16 hud(confirm)
 *   16=T17 challengePanel(confirm)  17=T18 completionModal(confirm)
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Phaser from 'phaser';
import { waitForScene } from '../helpers/waitForScene';
import {
  UNIFIED_TUTORIAL_STEPS,
  type TutorialHighlightZone,
} from '../../example-games/main-street/TutorialFlow';

/**
 * Bootstrap a Main Street game and return the scene.
 */
async function bootGame(): Promise<{
  game: Phaser.Game;
  scene: Phaser.Scene & Record<string, unknown>;
}> {
  const container = document.createElement('div');
  container.id = 'game-container';
  document.body.appendChild(container);

  const { createMainStreetGame } = await import(
    '../../example-games/main-street/createMainStreetGame'
  );
  const game = createMainStreetGame({ type: Phaser.CANVAS });
  await waitForScene(game, 'MainStreetScene');

  const scene = game.scene.getScene('MainStreetScene') as Phaser.Scene & Record<string, unknown>;
  expect(scene).toBeTruthy();
  expect((scene.sys as any).isActive()).toBe(true);

  return { game, scene };
}

function destroyGame(game: Phaser.Game | null): void {
  if (game) {
    game.destroy(true, false);
  }
  const container = document.getElementById('game-container');
  if (container) container?.remove();
}

/**
 * Find highlight graphics (green semi-transparent rectangles) in the scene.
 * Filter by the expected TOOLTIP_DEPTH - 1 = 199.
 */
function findHighlightGraphics(
  scene: Phaser.Scene,
): Phaser.GameObjects.Graphics[] {
  return (
    scene.children.list.filter(
      (obj): obj is Phaser.GameObjects.Graphics =>
        obj instanceof Phaser.GameObjects.Graphics && (obj as any).depth === 199,
    ) as Phaser.GameObjects.Graphics[]
  );
}

describe('TutorialOverlayManager highlight zones', () => {
  let game: Phaser.Game | null = null;
  let scene: Phaser.Scene & Record<string, unknown>;

  beforeEach(async () => {
    ({ game, scene } = await bootGame());
  });

  afterEach(() => {
    destroyGame(game);
    game = null;
  });

  /**
   * Resolve a step ID to its index in UNIFIED_TUTORIAL_STEPS.
   */
  function stepIdToIndex(stepId: string): number {
    const idx = UNIFIED_TUTORIAL_STEPS.findIndex((s) => s.id === stepId);
    expect(idx >= 0, `Step ${stepId} not found in unified steps`).toBe(true);
    return idx;
  }

  /**
   * Show a tutorial step (by step ID) and return the highlight graphics,
   * or null if this step has a null highlight zone.
   */
  function showStepAndGetHighlight(stepId: string): Phaser.GameObjects.Graphics | null {
    const mgr = scene.tutorialOverlay as { showStep?: (index: number) => void; dismiss?: () => void };
    if (!mgr || typeof mgr.showStep !== 'function') {
      return null;
    }

    // Clear existing highlights first
    if (typeof mgr.dismiss === 'function') {
      mgr.dismiss();
    }

    const stepIndex = stepIdToIndex(stepId);
    mgr.showStep(stepIndex);

    // Find highlight graphics at depth 199
    const highlights = findHighlightGraphics(scene);
    if (highlights.length === 0) return null;

    return highlights[0];
  }

  /**
   * Extract the filled rectangle bounds from a Graphics object's commandBuffer.
   * Phaser.Graphics does not implement getBounds(), so we parse the raw commands.
   */
  function getHighlightBounds(
    g: Phaser.GameObjects.Graphics,
  ): { x: number; y: number; w: number; h: number } | null {
    const commandBuffer = (g as any).commandBuffer as unknown[];
    if (!Array.isArray(commandBuffer) || commandBuffer.length === 0) {
      return null;
    }

    // FILL_RECT command is the number 3 (from Phaser Commands enum)
    // Structure: [FILL_RECT, x, y, width, height]
    for (let i = 0; i < commandBuffer.length - 4; i++) {
      const cmd = commandBuffer[i];
      if (cmd === 3) { // FILL_RECT
        const x = commandBuffer[i + 1] as number;
        const y = commandBuffer[i + 2] as number;
        const w = commandBuffer[i + 3] as number;
        const h = commandBuffer[i + 4] as number;
        if (typeof x === 'number' && typeof y === 'number' && typeof w === 'number' && typeof h === 'number' && w > 0 && h > 0) {
          return { x, y, w, h };
        }
      }
    }
    return null;
  }

  // ── AC 1: HUD highlight (T16, Success and Failure) ─────────

  it('HUD highlight (T16) starts at hudY and covers the HUD strip', async () => {
    const layout = scene.layout as { hudY: number; gameW: number } | undefined;
    expect(layout).toBeTruthy();
    expect(layout!.hudY).toBeGreaterThan(0);

    const highlight = showStepAndGetHighlight('T16'); // T16 = confirm, hud zone
    expect(highlight).toBeTruthy();

    const bounds = getHighlightBounds(highlight!);
    expect(bounds).toBeTruthy();

    const hudY = layout!.hudY;
    // The highlight should start at hudY - 14 (top of the 28px HUD strip)
    expect(bounds!.y).toBeLessThanOrEqual(hudY + 2);
    expect(bounds!.y).toBeGreaterThanOrEqual(hudY - 16);

    // HUD strip is now 50% screen width (centered) after the layout refinement
    expect(bounds!.w).toBeLessThan(layout!.gameW * 0.55);
    expect(bounds!.w).toBeGreaterThan(layout!.gameW * 0.45);

    // Height should be reasonable for a single HUD row (28px strip + padding = ~34px)
    expect(bounds!.h).toBeLessThan(60);
    expect(bounds!.h).toBeGreaterThan(20);
  });

  // ── AC 2: Development Row highlight (T2, informative) ──────

  it('Development Row highlight (T2) covers the dev row area', async () => {
    const layout = scene.layout as {
      marketTop: number;
      marketRowH: number;
    } | undefined;
    expect(layout).toBeTruthy();

    const highlight = showStepAndGetHighlight('T2'); // T2 = confirm, developmentRow zone
    expect(highlight).toBeTruthy();

    const bounds = getHighlightBounds(highlight!);
    expect(bounds).toBeTruthy();

    // Dev row height should be a single market row (not both rows)
    expect(bounds!.h).toBeLessThanOrEqual(layout!.marketRowH + 6);
    expect(bounds!.y).toBeGreaterThanOrEqual(layout!.marketTop - 10);
  });

  // ── AC 3: Laundromat card highlight (T3, buy step) ─────────

  it('Laundromat card highlight (T3) draws a card-sized rect in the dev row', async () => {
    const layout = scene.layout as { marketTop: number; marketRowH: number } | undefined;
    expect(layout).toBeTruthy();

    const highlight = showStepAndGetHighlight('T3'); // T3 = action, laundromatCard zone
    expect(highlight).toBeTruthy();

    const bounds = getHighlightBounds(highlight!);
    expect(bounds).toBeTruthy();

    // Card-sized: width ~ marketCardW, height ~ marketCardH
    expect(bounds!.w).toBeGreaterThan(100);
    expect(bounds!.w).toBeLessThan(180);
    expect(bounds!.h).toBeGreaterThan(50);
    expect(bounds!.h).toBeLessThan(110);

    // In the dev row band
    expect(bounds!.y).toBeGreaterThanOrEqual(layout!.marketTop - 10);
  });

  // ── AC 4: Hand highlight (T4, Your Hand) ───────────────────

  it('Hand highlight (T4) covers the hand area near the bottom', async () => {
    const layout = scene.layout as { handY: number; gameH: number } | undefined;
    expect(layout).toBeTruthy();

    const highlight = showStepAndGetHighlight('T4'); // T4 = confirm, hand zone
    expect(highlight).toBeTruthy();

    const bounds = getHighlightBounds(highlight!);
    expect(bounds).toBeTruthy();

    // Hand row is near the bottom of the screen
    expect(bounds!.y).toBeGreaterThanOrEqual(layout!.handY - 10);
    expect(bounds!.y).toBeLessThan(layout!.gameH);
    expect(bounds!.h).toBeGreaterThan(30);
  });

  // ── AC 5: Street grid highlight (T5, place-business) ────────

  it('Street grid highlight (T5) covers the 2x5 grid area', async () => {
    const layout = scene.layout as {
      streetTop: number;
      streetX: number;
      slotW: number;
      slotH: number;
      slotGap: number;
      streetCols: number;
      streetRowGap: number;
    } | undefined;
    expect(layout).toBeTruthy();

    const highlight = showStepAndGetHighlight('T5'); // T5 = action, streetGrid zone
    expect(highlight).toBeTruthy();

    const bounds = getHighlightBounds(highlight!);
    expect(bounds).toBeTruthy();

    // Width should cover the full street grid width
    const expectedW = layout!.streetCols * layout!.slotW + (layout!.streetCols - 1) * layout!.slotGap;
    expect(bounds!.w).toBeGreaterThanOrEqual(expectedW - 10); // small tolerance

    // Height should cover both rows
    const expectedH = 2 * layout!.slotH + layout!.streetRowGap;
    expect(bounds!.h).toBeGreaterThanOrEqual(expectedH - 10);
  });

  // ── AC 6: Incident queue highlight (T6) ─────────────────────

  it('Incident queue highlight (T6) covers the queue area', async () => {
    const layout = scene.layout as {
      queueTop: number;
      queueCardH: number;
    } | undefined;
    expect(layout).toBeTruthy();

    const highlight = showStepAndGetHighlight('T6'); // T6 = confirm, incidentQueue zone
    expect(highlight).toBeTruthy();

    const bounds = getHighlightBounds(highlight!);
    expect(bounds).toBeTruthy();

    // Should start near queueTop
    const tolerance = 10;
    expect(bounds!.y).toBeLessThanOrEqual(layout!.queueTop + tolerance);

    // Height should cover at least one card
    expect(bounds!.h).toBeGreaterThanOrEqual(layout!.queueCardH - 5);
  });

  // ── AC 7: End turn button highlight (T7/T11) ────────────────

  it('End turn button highlight (T7) covers the action button area', async () => {
    const layout = scene.layout as {
      actionY: number;
      actionButtonH: number;
      gameW: number;
    } | undefined;
    expect(layout).toBeTruthy();

    const highlight = showStepAndGetHighlight('T7'); // T7 = action, endTurnButton zone
    expect(highlight).toBeTruthy();

    const bounds = getHighlightBounds(highlight!);
    expect(bounds).toBeTruthy();

    // Should be in the bottom-right area
    expect(bounds!.y).toBeGreaterThanOrEqual(layout!.actionY - 10);
    expect(bounds!.h).toBeGreaterThan(layout!.actionButtonH - 10);
  });

  it('End turn button highlight (T11) covers the action button area', async () => {
    const layout = scene.layout as {
      actionY: number;
      actionButtonH: number;
      gameW: number;
    } | undefined;
    expect(layout).toBeTruthy();

    const highlight = showStepAndGetHighlight('T11'); // T11 = action, endTurnButton zone
    expect(highlight).toBeTruthy();

    const bounds = getHighlightBounds(highlight!);
    expect(bounds).toBeTruthy();

    // Action buttons are in the bottom area
    expect(bounds!.y).toBeGreaterThanOrEqual(layout!.actionY - 10);
  });

  // ── AC 8: Investments row highlight (T8) ────────────────────

  it('Investments row highlight (T8) covers the single market row', async () => {
    const layout = scene.layout as {
      marketTop: number;
      marketRowH: number;
      marketRowGap: number;
    } | undefined;
    expect(layout).toBeTruthy();

    const highlight = showStepAndGetHighlight('T8'); // T8 = confirm, investmentsRow zone
    expect(highlight).toBeTruthy();

    const bounds = getHighlightBounds(highlight!);
    expect(bounds).toBeTruthy();

    // Single-row market (CG-0MSTOATDT009BRX2): the investmentsRow zone aliases
    // the developmentRow zone, so T8 highlights the one market row drawn at
    // marketTop + 6 (see MainStreetRenderer).
    const expectedTopY = layout!.marketTop + 6;
    expect(bounds!.y).toBeLessThanOrEqual(expectedTopY + 4);
    expect(bounds!.y).toBeGreaterThanOrEqual(layout!.marketTop - 10);
  });

  // ── AC 9: Local Festival card highlight (T9, buy step) ──────

  it('Local Festival card highlight (T9) draws a card-sized rect on the single market row', async () => {
    const layout = scene.layout as { marketTop: number; marketRowH: number } | undefined;
    expect(layout).toBeTruthy();

    const highlight = showStepAndGetHighlight('T9'); // T9 = action, festivalCard zone
    expect(highlight).toBeTruthy();

    const bounds = getHighlightBounds(highlight!);
    expect(bounds).toBeTruthy();

    // Card-sized
    expect(bounds!.w).toBeGreaterThan(100);
    expect(bounds!.w).toBeLessThan(180);
    expect(bounds!.h).toBeGreaterThan(50);
    expect(bounds!.h).toBeLessThan(110);

    // Single-row market (CG-0MSTOATDT009BRX2): the festival card sits on the
    // one market row at marketTop + 6 — same band as the dev-row cards.
    expect(bounds!.y).toBeGreaterThanOrEqual(layout!.marketTop - 10);
    expect(bounds!.y).toBeLessThanOrEqual(layout!.marketTop + layout!.marketRowH + 6);
  });

  // ── AC 10: Development Row highlight (T10, buy-and-place) ──

  it('Development Row highlight (T10) covers the dev row (buy-and-place step)', async () => {
    const layout = scene.layout as { marketTop: number; marketRowH: number } | undefined;
    expect(layout).toBeTruthy();

    const highlight = showStepAndGetHighlight('T10'); // T10 = action, developmentRow zone
    expect(highlight).toBeTruthy();

    const bounds = getHighlightBounds(highlight!);
    expect(bounds).toBeTruthy();
    expect(bounds!.h).toBeLessThanOrEqual(layout!.marketRowH + 6);
    expect(bounds!.y).toBeGreaterThanOrEqual(layout!.marketTop - 10);
  });

  // ── AC 11: Costs and Reputation dev row highlight (T12) ────

  it('Development Row highlight (T12) covers the dev row (Costs and Reputation)', async () => {
    const layout = scene.layout as { marketTop: number; marketRowH: number } | undefined;
    expect(layout).toBeTruthy();

    const highlight = showStepAndGetHighlight('T12'); // T12 = confirm, developmentRow zone
    expect(highlight).toBeTruthy();

    const bounds = getHighlightBounds(highlight!);
    expect(bounds).toBeTruthy();
    expect(bounds!.h).toBeLessThanOrEqual(layout!.marketRowH + 6);
    expect(bounds!.y).toBeGreaterThanOrEqual(layout!.marketTop - 10);
  });

  // ── AC 11b: Community Favour action-buttons highlight (T13) ──

  it('actionButtons highlight (T13) covers the action bar (Community Favour)', async () => {
    const layout = scene.layout as { actionY: number; actionButtonH: number; gameW: number } | undefined;
    expect(layout).toBeTruthy();

    const highlight = showStepAndGetHighlight('T13'); // T13 = action, actionButtons zone
    expect(highlight).toBeTruthy();

    const bounds = getHighlightBounds(highlight!);
    expect(bounds).toBeTruthy();
    // The action bar band sits below the street; the highlight should cover it.
    const minY = layout!.actionY;
    expect(bounds!.y).toBeGreaterThanOrEqual(minY - 10);
    expect(bounds!.h).toBeGreaterThanOrEqual(layout!.actionButtonH);
  });

  // ── AC 11c: Build a Library dev row highlight (T14) ────────

  it('Development Row highlight (T14) covers the dev row (Build a Library)', async () => {
    const layout = scene.layout as { marketTop: number; marketRowH: number } | undefined;
    expect(layout).toBeTruthy();

    const highlight = showStepAndGetHighlight('T14'); // T14 = action, developmentRow zone
    expect(highlight).toBeTruthy();

    const bounds = getHighlightBounds(highlight!);
    expect(bounds).toBeTruthy();
    expect(bounds!.h).toBeLessThanOrEqual(layout!.marketRowH + 6);
    expect(bounds!.y).toBeGreaterThanOrEqual(layout!.marketTop - 10);
  });

  // ── AC 12: Hand highlight (T15, Triggering Events) ─────────

  it('Hand highlight (T15) covers the hand area (Triggering Events)', async () => {
    const layout = scene.layout as { handY: number; gameH: number } | undefined;
    expect(layout).toBeTruthy();

    const highlight = showStepAndGetHighlight('T15'); // T15 = action, hand zone
    expect(highlight).toBeTruthy();

    const bounds = getHighlightBounds(highlight!);
    expect(bounds).toBeTruthy();
    expect(bounds!.y).toBeGreaterThanOrEqual(layout!.handY - 10);
    expect(bounds!.y).toBeLessThan(layout!.gameH);
    expect(bounds!.h).toBeGreaterThan(30);
  });

  // ── AC 13: centerModal zone (T1, null anchor) ───────────────

  it('centerModal zone (T1) returns null anchor (no highlight graphics drawn)', async () => {
    const mgr = scene.tutorialOverlay as { showStep?: (index: number) => void; dismiss?: () => void };

    if (mgr && typeof mgr.showStep === 'function') {
      if (typeof mgr.dismiss === 'function') {
        mgr.dismiss();
      }

      mgr.showStep(stepIdToIndex('T1'));

      // centerModal should not draw any highlight graphics at depth 199
      const highlights = findHighlightGraphics(scene);
      expect(highlights.length).toBe(0);
    }
  });

  // ── AC 14: completionModal zone (T18, null anchor) ─────────

  it('completionModal zone (T18) returns null anchor (no highlight graphics drawn)', async () => {
    const mgr = scene.tutorialOverlay as { showStep?: (index: number) => void; dismiss?: () => void };

    if (mgr && typeof mgr.showStep === 'function') {
      if (typeof mgr.dismiss === 'function') {
        mgr.dismiss();
      }

      mgr.showStep(stepIdToIndex('T18'));

      // completionModal should not draw any highlight graphics at depth 199
      const highlights = findHighlightGraphics(scene);
      expect(highlights.length).toBe(0);
    }
  });

  // ── AC 15: Challenge panel highlight (T17) ─────────────────

  it('challengePanel highlight (T17) covers the challenge panel area', async () => {
    const layout = scene.layout as {
      challengeX: number;
      challengeY: number;
      challengeW: number;
    } | undefined;
    expect(layout).toBeTruthy();

    const highlight = showStepAndGetHighlight('T17'); // T17 = confirm, challengePanel zone
    expect(highlight).toBeTruthy();

    const bounds = getHighlightBounds(highlight!);
    expect(bounds).toBeTruthy();

    // Should be in the right sidebar area
    expect(bounds!.x).toBeGreaterThanOrEqual(layout!.challengeX - 5);
    expect(bounds!.y).toBeGreaterThanOrEqual(layout!.challengeY - 5);
    expect(bounds!.w).toBeGreaterThan(0);
    expect(bounds!.h).toBeGreaterThan(0);
  });

  // ── Coverage: all 17 unified steps have valid highlight zones ─

  it.each(UNIFIED_TUTORIAL_STEPS.map((s) => [s.id, s.highlightZone]))(
    'step %s has valid highlightZone: %s',
    (_stepId, zone) => {
      const validZones: TutorialHighlightZone[] = [
        'centerModal',
        'hud',
        'marketBusinessRow',
        'developmentRow',
        'streetGrid',
        'endTurnButton',
        'incidentQueue',
        'investmentsRow',
        'helpButton',
        'challengePanel',
        'completionModal',
        'hand',
        'actionButtons',
        'laundromatCard',
        'festivalCard',
      ];
      expect(validZones).toContain(zone);
    },
  );
});
