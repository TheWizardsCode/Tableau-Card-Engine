/**
 * MainStreetTutorialHints -- Unified tutorial overlay system for Main Street.
 *
 * Displays contextual tooltip hints that highlight key UI regions (market,
 * street slots, hand, action controls, scoring). Supports two modes:
 *
 * - **Confirm mode**: purely informational; the player clicks "Next" to advance.
 * - **Action-gated mode**: the player must perform an in-game action to advance.
 *
 * The same `showStep()` method handles both modes via the `gate` field on
 * each step definition. Usage:
 *
 *   const mgr = new MainStreetTutorialHints(scene);
 *   mgr.showStep(0);        // show first hint
 *   mgr.nextStep();         // advance to next hint
 *   mgr.dismiss();          // hide all hints
 *   mgr.toggle();           // show/hide tutorial
 *
 * @module
 */

import { FONT_FAMILY } from '../../../src/ui';
import { t, registerLocale } from '../../../src/core-engine/I18n';
import { parseScreenLayoutDocument } from '../../../src/ui/screen-layout-schema';
import { composeResolvedLayouts } from '../../../src/ui/screen-layout-compose';
import { type LayoutViewport } from '../../../src/ui/screen-layout';

import {
  UNIFIED_TUTORIAL_STEP_COUNT,
  UNIFIED_TUTORIAL_STEPS,
  advanceTutorialStep,
  resolveTutorialStepText,
  type TutorialControllerState,
  type TutorialHighlightZone,
} from '../TutorialFlow';
import { TUTORIAL_EN_BUNDLE } from '../i18n/tutorial-en';
import baseLayout from '../layouts/main-street.layout.json';

/*
 * WARNING: Keep main-street-tutorial.layout.json zone coordinates in sync with
 * the base layout (main-street.layout.json) and MainStreetRenderer positions.
 * The tutorial layout uses sceneWins policy, so its zone rects override base
 * zones with the same name. If the base layout or rendering constants change,
 * update the corresponding tutorial zone rects to match.
 */
import tutorialLayout from '../layouts/main-street-tutorial.layout.json';

// ── Register English locale bundle at module load time ───────
registerLocale('en', TUTORIAL_EN_BUNDLE);

// ── Pre-parse layouts at module load ──────────────────────────

const baseParsed = parseScreenLayoutDocument(baseLayout);
if (!baseParsed.valid) {
  throw new Error(
    `Base layout is invalid: ${baseParsed.errors.map((e) => `${e.path}: ${e.message}`).join('; ')}`,
  );
}

const tutorialParsed = parseScreenLayoutDocument(tutorialLayout);
if (!tutorialParsed.valid) {
  throw new Error(
    `Tutorial layout is invalid: ${tutorialLayout ? tutorialLayout.id : '(unknown)'}: ${tutorialParsed.errors.map((e) => `${e.path}: ${e.message}`).join('; ')}`,
  );
}

const BASE_LAYOUT = baseParsed.layout;
const TUTORIAL_LAYOUT = tutorialParsed.layout;

/** Null-zone values that do not need a highlight bounding box. */
const NULL_ZONES: ReadonlySet<TutorialHighlightZone> = new Set([
  'centerModal',
  'completionModal',
]);

/**
 * Resolve a tutorial highlight zone to pixel-space coordinates using SLL.
 *
 * Composes the base Main Street layout with the tutorial-specific layout
 * (using `sceneWins` policy so tutorial zones override base zones where names
 * collide), then looks up the requested zone in the composed result.
 *
 * Returns `{ x, y, w, h }` for known zones, or `null` for centered overlays
 * (centerModal, completionModal) and unrecognized zones.
 */
export function resolveZoneToAnchor(
  zone: TutorialHighlightZone,
  viewport: LayoutViewport,
  dpr = 1,
): { x: number; y: number; w: number; h: number } | null {
  if (NULL_ZONES.has(zone)) {
    return null;
  }

  const composed = composeResolvedLayouts(
    BASE_LAYOUT,
    TUTORIAL_LAYOUT,
    viewport,
    dpr,
    { policy: 'sceneWins' },
  );

  const resolvedZone = composed.zones[zone];
  if (!resolvedZone) {
    return null;
  }

  const rect = resolvedZone.rect;
  return {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    w: Math.round(rect.width ?? 0),
    h: Math.round(rect.height ?? 0),
  };
}

// ── Visual constants ─────────────────────────────────────────

const TOOLTIP_W = 360;
const TOOLTIP_H_BASE = 170;
const TOOLTIP_DEPTH = 200;
const HIGHLIGHT_COLOR = 0x44ff44;
const HIGHLIGHT_ALPHA = 0.18;
const HIGHLIGHT_BORDER_ALPHA = 0.8;

// ── Manager ──────────────────────────────────────────────────

/** Manages the lifecycle of all tutorial overlay objects. */
export class MainStreetTutorialHints {
  private objects: Phaser.GameObjects.GameObject[] = [];
  private currentStep = 0;
  private visible = false;
  private readonly onComplete: (() => void) | null;

  constructor(private readonly scene: any, onComplete?: () => void) {
    this.onComplete = onComplete ?? null;
  }

  /** True if the tutorial overlay is currently visible. */
  get isVisible(): boolean {
    return this.visible;
  }

  /** Show the tutorial from the beginning. */
  public start(): void {
    this.currentStep = 0;
    this.visible = true;
    this.showStep(this.currentStep);
  }

  /** Toggle the tutorial overlay on/off. */
  public toggle(): void {
    if (this.visible) {
      this.dismiss();
    } else {
      this.start();
    }
  }

  /**
   * Dismiss (hide) all tutorial objects without marking as completed.
   *
   * This is used for early exits ("Exit Tutorial" button). It clears the
   * overlay but does NOT call the onComplete callback, so the tutorial
   * state is not persisted as 'completed'.
   */
  public dismiss(): void {
    this.clearObjects();
    this.visible = false;
  }

  /**
   * Complete the tutorial: dismiss the overlay and call onComplete
   * to persist tutorial completion state.
   *
   * This is only called when the player reaches the final step (T13)
   * and clicks "Start Full Game", or when nextStep() reaches the end.
   */
  public completeDismiss(): void {
    this.clearObjects();
    this.visible = false;
    if (this.onComplete) {
      try { this.onComplete(); } catch (_) { /* ignore errors in callback */ }
    }
  }

  /** Advance to the next tutorial step (or dismiss if at end). */
  public nextStep(): void {
    this.currentStep++;
    if (this.currentStep >= UNIFIED_TUTORIAL_STEP_COUNT) {
      // Deactivate the tutorial controller so game actions are no longer blocked.
      // Without this, isTutorialActionAllowed would keep returning "Complete the
      // highlighted step first." for all game actions.
      const s = this.scene;
      const controller = (s as any)?.tutorialController as TutorialControllerState | undefined;
      if (controller) {
        Object.assign(s, { tutorialController: { ...controller, isActive: false } });
      }
      this.completeDismiss();
    } else {
      // Also advance the scene's tutorial controller so the step index
      // stays in sync with the overlay's currentStep.
      const s = this.scene;
      const controller = (s as any)?.tutorialController as TutorialControllerState | undefined;
      if (controller && controller.isActive) {
        Object.assign(s, { tutorialController: advanceTutorialStep(controller) });
      }
      this.showStep(this.currentStep);
    }
  }

  /**
   * Show a specific tutorial step by index.
   *
   * This is the unified rendering method that handles both confirm-style and
   * action-gated tutorial steps.
   *
   * For **confirm** steps the button row shows: Dismiss | Next/Finish
   * For **action** steps the button row shows: Exit Tutorial (no Continue button; auto-advance on action)
   *   (Continue is disabled until the action-complete predicate reports true).
   *   The final step shows "Start Full Game" instead of Exit Tutorial.
   *
   * @param index - Zero-based index into `UNIFIED_TUTORIAL_STEPS`.
   */
  public showStep(index: number): void {
    if (index < 0 || index >= UNIFIED_TUTORIAL_STEP_COUNT) return;
    this.clearObjects();
    this.currentStep = index;
    this.visible = true;

    const step = UNIFIED_TUTORIAL_STEPS[index];
    const s = this.scene;
    // If the scene is not fully ready (no add/sys), retry shortly.
    if (!s || !s.add) {
      setTimeout(() => {
        try { this.showStep(index); } catch (_) { /* ignore */ }
      }, 60);
      return;
    }
    const layout = s.layout ?? {};
    const gameW: number = layout.gameW ?? 1280;
    const gameH: number = layout.gameH ?? 720;

    // ── Optional highlight rectangle (canvas) ──────────────
    const anchor = this.zoneToAnchor(step.highlightZone, s);
    if (anchor) {
      const highlight = s.add.graphics();
      highlight.setDepth(TOOLTIP_DEPTH - 1);
      // Semi-transparent fill
      highlight.fillStyle(HIGHLIGHT_COLOR, HIGHLIGHT_ALPHA);
      highlight.fillRect(anchor.x, anchor.y, anchor.w, anchor.h);
      // Bright border
      highlight.lineStyle(2, HIGHLIGHT_COLOR, HIGHLIGHT_BORDER_ALPHA);
      highlight.strokeRect(anchor.x, anchor.y, anchor.w, anchor.h);
      this.objects.push(highlight);
    }

    // Build a DOM tooltip so it can render above DOM-based card elements.
    const tooltipX = gameW / 2 - TOOLTIP_W / 2;

    // Buttons and padding
    const padTop = 12;
    const padSides = 16;
    const padBetweenTitleAndBody = 8;
    const padBottom = 12;

    try {
      const container = document.createElement('div');
      container.className = 'ms-tutorial-tooltip';
      container.style.width = TOOLTIP_W + 'px';
      container.style.boxSizing = 'border-box';
      container.style.padding = `${padTop}px ${padSides}px ${padBottom}px ${padSides}px`;
      container.style.background = '#1a2a1a';
      container.style.border = '2px solid #44aa44';
      container.style.borderRadius = '8px';
      container.style.color = '#ddccbb';
      container.style.fontFamily = FONT_FAMILY;
      container.style.fontSize = '13px';
      container.style.lineHeight = '1.25';
      container.style.overflow = 'auto';
      container.style.pointerEvents = 'auto';

      const titleEl = document.createElement('div');
      titleEl.style.fontWeight = '700';
      titleEl.style.color = '#aaffaa';
      titleEl.style.marginBottom = `${padBetweenTitleAndBody}px`;
      // Card-data placeholders ({cardName}/{cost}/{bonus}) are resolved at
      // render time via resolveTutorialStepText — never hardcode card facts.
      titleEl.textContent = resolveTutorialStepText(step).title;
      container.appendChild(titleEl);

      const bodyEl = document.createElement('div');
      bodyEl.style.whiteSpace = 'pre-wrap';
      bodyEl.style.color = '#ddccbb';
      bodyEl.textContent = resolveTutorialStepText(step).body;
      container.appendChild(bodyEl);

      const btnRow = document.createElement('div');
      btnRow.style.display = 'flex';
      btnRow.style.justifyContent = 'space-between';
      btnRow.style.alignItems = 'center';
      btnRow.style.marginTop = '12px';

      const isLast = index === UNIFIED_TUTORIAL_STEP_COUNT - 1;
      const isActionStep = step.gate === 'action';

      if (isActionStep) {
        // ── Action-gated row: Exit Tutorial (left) ────────────
        // No Continue button: the player performs the in-game action and
        // the tutorial auto-advances via onTutorialActionComplete.
        const leftGroup = document.createElement('div');
        if (!isLast) {
          const exitBtn = document.createElement('button');
          exitBtn.textContent = t('tutorial.overlay.exit');
          exitBtn.style.background = '#2a1a1a';
          exitBtn.style.color = '#cc6666';
          exitBtn.style.border = 'none';
          exitBtn.style.padding = '6px 8px';
          exitBtn.style.borderRadius = '6px';
          exitBtn.style.cursor = 'pointer';
          exitBtn.onclick = () => {
            // Call the lifecycle manager's exit method so the tutorial
            // controller is also updated (not just the overlay).
            try { (this.scene as any).exitTutorialFlow?.(); } catch (_) { /* ignore */ }
          };
          leftGroup.appendChild(exitBtn);
        } else {
          // Last step: "Start Full Game" replaces "Exit Tutorial"
          const startBtn = document.createElement('button');
          startBtn.textContent = t('tutorial.overlay.startFullGame');
          startBtn.style.background = '#44ff44';
          startBtn.style.color = '#002200';
          startBtn.style.border = 'none';
          startBtn.style.padding = '6px 8px';
          startBtn.style.borderRadius = '6px';
          startBtn.style.cursor = 'pointer';
          startBtn.onclick = () => (s as any).confirmTutorialStep?.();
          leftGroup.appendChild(startBtn);
        }
        leftGroup.style.display = 'flex';
        leftGroup.style.gap = '8px';
        btnRow.appendChild(leftGroup);

        // Spacer to push left button to the left side
        const spacer = document.createElement('div');
        spacer.style.flex = '1';
        btnRow.appendChild(spacer);
      } else {
        // ── Confirm row: Dismiss | Next/Finish ────────────────
        // No Prev button: action-gated steps cannot be retried if
        // the player navigates backward (e.g. market cards are consumed).
        const leftGroup = document.createElement('div');
        const dismissBtn = document.createElement('button');
        dismissBtn.textContent = t('tutorial.overlay.dismiss');
        dismissBtn.style.background = '#2a2a1a';
        dismissBtn.style.color = '#aa8866';
        dismissBtn.style.border = 'none';
        dismissBtn.style.padding = '6px 8px';
        dismissBtn.style.borderRadius = '6px';
        dismissBtn.style.cursor = 'pointer';
        dismissBtn.onclick = () => {
          try { (this.scene as any).exitTutorialFlow?.(); } catch (_) { /* ignore */ }
        };
        leftGroup.appendChild(dismissBtn);
        btnRow.appendChild(leftGroup);

        const rightGroup = document.createElement('div');
        const nextBtn = document.createElement('button');
        nextBtn.textContent = isLast ? t('tutorial.overlay.startFullGame') : t('tutorial.overlay.next');
        nextBtn.style.background = isLast ? '#44ff44' : '#88ff88';
        nextBtn.style.color = '#002200';
        nextBtn.style.border = 'none';
        nextBtn.style.padding = '6px 8px';
        nextBtn.style.borderRadius = '6px';
        nextBtn.style.cursor = 'pointer';
        nextBtn.onclick = () => this.nextStep();
        rightGroup.appendChild(nextBtn);
        btnRow.appendChild(rightGroup);
      }

      container.appendChild(btnRow);

      // Measure tooltip height by temporarily attaching to the document so we can
      // position it accurately relative to the anchor. Clamp to viewport height.
      document.body.appendChild(container);
      const measuredH = Math.min(container.offsetHeight || TOOLTIP_H_BASE, Math.max(80, gameH - 40));
      document.body.removeChild(container);

      const tooltipH = measuredH;

      // Decide tooltip position relative to anchor. Prefer placing to the right
      // of the anchor to avoid obscuring the highlighted region (useful for
      // the Challenges panel which sits near the left of the sidebar).
      let tooltipY: number;
      let domX = tooltipX;
      if (anchor) {
        const rightX = anchor.x + anchor.w + 12;
        const leftX = anchor.x - TOOLTIP_W - 12;
        const centerYBased = anchor.y + Math.floor((anchor.h - tooltipH) / 2);

        if (rightX + TOOLTIP_W < gameW - 12) {
          domX = Math.max(12, rightX);
          tooltipY = Math.max(12, Math.min(centerYBased, gameH - tooltipH - 12));
        } else if (leftX > 12) {
          domX = Math.max(12, leftX);
          tooltipY = Math.max(12, Math.min(centerYBased, gameH - tooltipH - 12));
        } else {
          const belowY = anchor.y + anchor.h + 12;
          const aboveY = anchor.y - tooltipH - 12;
          tooltipY = belowY + tooltipH < gameH ? belowY : Math.max(12, aboveY);
        }
      } else {
        domX = Math.max(12, Math.floor(gameW / 2 - TOOLTIP_W / 2));
        tooltipY = Math.max(12, Math.floor(gameH / 2 - tooltipH / 2));
      }

      // Add as a Phaser DOMElement at computed position (top-left)
      const dom = s.add.dom(domX, tooltipY, container) as Phaser.GameObjects.DOMElement;
      dom.setOrigin(0, 0);
      try { dom.setDepth(TOOLTIP_DEPTH + 1000); } catch { /* ignore */ }
      this.objects.push(dom);

      // Step counter badge as a small canvas text anchored to the tooltip
      const stepLabel = s.add.text(domX + TOOLTIP_W - 12, tooltipY + 10, `${index + 1} / ${UNIFIED_TUTORIAL_STEP_COUNT}`, { fontSize: '11px', color: '#669966', fontFamily: FONT_FAMILY }).setOrigin(1, 0).setDepth(TOOLTIP_DEPTH + 1);
      this.objects.push(stepLabel);
    } catch (e) {
      // Fallback to in-canvas tooltip if DOM is not available or fails
      // DOM tooltip creation failed; fall back to in-canvas rendering

      const tooltipH = TOOLTIP_H_BASE;
      const domX = Math.max(12, Math.floor(gameW / 2 - TOOLTIP_W / 2));
      const tooltipY = Math.max(12, Math.floor(gameH / 2 - tooltipH / 2));

      const bg = s.add.rectangle(domX + TOOLTIP_W / 2, tooltipY + tooltipH / 2, TOOLTIP_W, tooltipH, 0x1a2a1a).setDepth(TOOLTIP_DEPTH + 1000);
      const border = s.add.rectangle(domX + TOOLTIP_W / 2, tooltipY + tooltipH / 2, TOOLTIP_W, tooltipH).setStrokeStyle(2, 0x44aa44).setDepth(TOOLTIP_DEPTH + 1001);
      const stepText = resolveTutorialStepText(step);
      const titleTxt = s.add.text(domX + 12, tooltipY + 12, stepText.title, { fontSize: '16px', color: '#aaffaa', fontFamily: FONT_FAMILY }).setDepth(TOOLTIP_DEPTH + 1002).setOrigin(0, 0);
      const bodyTxt = s.add.text(domX + 12, tooltipY + 40, stepText.body, { fontSize: '13px', color: '#ddccbb', fontFamily: FONT_FAMILY, wordWrap: { width: TOOLTIP_W - 24 } as any }).setDepth(TOOLTIP_DEPTH + 1002).setOrigin(0, 0);

      const isLast = index === UNIFIED_TUTORIAL_STEP_COUNT - 1;
      const isActionStep = step.gate === 'action';

      if (isActionStep) {
        // ── Action-gated canvas row: Exit Tutorial (left only) ─
        // No Continue button: the player performs the in-game action and
        // the tutorial auto-advances via onTutorialActionComplete.
        if (!isLast) {
          const exitBtn = s.add.text(domX + 16, tooltipY + tooltipH - 30, t('tutorial.overlay.exit'), { fontSize: '13px', color: '#cc6666', fontFamily: FONT_FAMILY, padding: { left: 8, right: 8, top: 4, bottom: 4 } as any, backgroundColor: '#2a1a1a' }).setInteractive({ useHandCursor: true }).setDepth(TOOLTIP_DEPTH + 1003);
          exitBtn.on('pointerdown', () => {
            try { (this.scene as any).exitTutorialFlow?.(); } catch (_) { /* ignore */ }
          });
          this.objects.push(exitBtn);
        } else {
          // Last step: "Start Full Game" replaces "Exit Tutorial"
          const startBtn = s.add.text(domX + 16, tooltipY + tooltipH - 30, t('tutorial.overlay.startFullGame'), { fontSize: '13px', color: '#002200', fontFamily: FONT_FAMILY, fontStyle: 'bold', padding: { left: 12, right: 12, top: 6, bottom: 6 } as any, backgroundColor: '#44ff44' }).setInteractive({ useHandCursor: true }).setDepth(TOOLTIP_DEPTH + 1003);
          startBtn.on('pointerdown', () => (s as any).confirmTutorialStep?.());
          this.objects.push(startBtn);
        }
        this.objects.push(bg, border, titleTxt, bodyTxt);
      } else {
        // ── Confirm canvas row: Dismiss | Next/Finish ────────
        // No Prev button: action-gated steps cannot be retried if
        // the player navigates backward (e.g. market cards are consumed).
        const dismissBtn = s.add.text(domX + 12, tooltipY + tooltipH - 30, t('tutorial.overlay.dismiss'), { fontSize: '13px', color: '#aa8866', fontFamily: FONT_FAMILY }).setInteractive({ useHandCursor: true }).setDepth(TOOLTIP_DEPTH + 1003);
        dismissBtn.on('pointerdown', () => {
          try { (this.scene as any).exitTutorialFlow?.(); } catch (_) { /* ignore */ }
        });

        const nextLabel = isLast ? t('tutorial.overlay.startFullGame') : t('tutorial.overlay.next');
        const nextBtn = s.add.text(domX + TOOLTIP_W - 12, tooltipY + tooltipH - 30, nextLabel, { fontSize: '13px', color: '#002200', backgroundColor: isLast ? '#44ff44' : '#88ff88', padding: { left: 6, right: 6 } as any, fontFamily: FONT_FAMILY }).setInteractive({ useHandCursor: true }).setOrigin(1, 0).setDepth(TOOLTIP_DEPTH + 1003);
        nextBtn.on('pointerdown', () => this.nextStep());

        this.objects.push(bg, border, titleTxt, bodyTxt, dismissBtn, nextBtn);
      }
    }
  }

  /**
   * Maps a TutorialHighlightZone to screen-space coordinates.
   *
   * Resolves the highlight zone's bounding box from the composed SLL layout
   * (base + tutorial layout merged via `composeResolvedLayouts`), replacing the
   * previous hardcoded pixel-math.
   *
   * @param zone - The tutorial highlight zone identifier (camelCase SLL zone IDs).
   * @param scene - The Phaser scene with layout properties.
   * @returns Pixel-space bounding box `{ x, y, w, h }`, or `null` for centered
   *   overlays (centerModal, completionModal) and unrecognized zones.
   */
  private zoneToAnchor(
    zone: TutorialHighlightZone,
    scene: any,
  ): { x: number; y: number; w: number; h: number } | null {
    const layout = scene.layout ?? {};
    const gameW: number = layout.gameW ?? 1280;
    const gameH: number = layout.gameH ?? 720;
    return resolveZoneToAnchor(zone, { width: gameW, height: gameH }, 1);
  }

  // ── Private helpers ───────────────────────────────────────

  private clearObjects(): void {
    for (const obj of this.objects) {
      try { obj.destroy(); } catch (e) {
        // Non-fatal: Phaser may throw when destroying already-destroyed objects in tests.
        console.debug('[Tutorial] clearObjects: destroy failed', e);
      }
    }
    this.objects = [];
  }
}
