/**
 * MainStreetTutorialHints -- Non-interactive tutorial overlays for Main Street.
 *
 * Displays a sequence of contextual tooltip hints that highlight key UI
 * regions (market, street slots, hand, action controls, scoring).
 *
 * Overlays are purely informational: they do not block gameplay interaction.
 * The player can dismiss individual hints or toggle the whole tutorial off.
 *
 * Usage:
 *   const mgr = new MainStreetTutorialHints(scene);
 *   mgr.showStep(0);        // show first hint
 *   mgr.nextStep();         // advance to next hint
 *   mgr.dismiss();          // hide all hints
 *   mgr.toggle();           // show/hide tutorial
 *
 * @module
 */

import { FONT_FAMILY } from '../../../src/ui';
import { parseScreenLayoutDocument } from '../../../src/ui/screen-layout-schema';
import { composeResolvedLayouts } from '../../../src/ui/screen-layout-compose';
import { type LayoutViewport } from '../../../src/ui/screen-layout';

import {
  getCurrentStep,
  UNIFIED_TUTORIAL_STEP_COUNT,
  UNIFIED_TUTORIAL_STEPS,
  type TutorialControllerState,
  type TutorialHighlightZone,
} from '../TutorialFlow';
import baseLayout from '../layouts/main-street.layout.json';
import tutorialLayout from '../layouts/main-street-tutorial.layout.json';

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

  /** Dismiss (hide) all tutorial objects. */
  public dismiss(): void {
    const wasVisible = this.visible;
    this.clearObjects();
    this.visible = false;
    if (wasVisible && this.onComplete) {
      try { this.onComplete(); } catch (_) { /* ignore errors in callback */ }
    }
  }

  /** Advance to the next tutorial step (or dismiss if at end). */
  public nextStep(): void {
    this.currentStep++;
    if (this.currentStep >= UNIFIED_TUTORIAL_STEP_COUNT) {
      this.dismiss();
    } else {
      this.showStep(this.currentStep);
    }
  }

  /** Go back to the previous step. */
  public prevStep(): void {
    if (this.currentStep > 0) {
      this.currentStep--;
      this.showStep(this.currentStep);
    }
  }

  /** Show a specific tutorial step by index. */
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
      titleEl.textContent = step.title;
      container.appendChild(titleEl);

      const bodyEl = document.createElement('div');
      bodyEl.style.whiteSpace = 'pre-wrap';
      bodyEl.style.color = '#ddccbb';
      bodyEl.textContent = step.body;
      container.appendChild(bodyEl);

      const btnRow = document.createElement('div');
      btnRow.style.display = 'flex';
      btnRow.style.justifyContent = 'space-between';
      btnRow.style.alignItems = 'center';
      btnRow.style.marginTop = '12px';

      const leftGroup = document.createElement('div');
      const dismissBtn = document.createElement('button');
      dismissBtn.textContent = 'Dismiss';
      dismissBtn.style.background = '#2a2a1a';
      dismissBtn.style.color = '#aa8866';
      dismissBtn.style.border = 'none';
      dismissBtn.style.padding = '6px 8px';
      dismissBtn.style.borderRadius = '6px';
      dismissBtn.style.cursor = 'pointer';
      dismissBtn.onclick = () => this.dismiss();
      leftGroup.appendChild(dismissBtn);
      btnRow.appendChild(leftGroup);

      const middleGroup = document.createElement('div');
      if (index > 0) {
        const prevBtn = document.createElement('button');
        prevBtn.textContent = '< Prev';
        prevBtn.style.background = 'transparent';
        prevBtn.style.color = '#88bbff';
        prevBtn.style.border = 'none';
        prevBtn.style.padding = '6px 8px';
        prevBtn.style.cursor = 'pointer';
        prevBtn.onclick = () => this.prevStep();
        middleGroup.appendChild(prevBtn);
      }
      btnRow.appendChild(middleGroup);

      const rightGroup = document.createElement('div');
      const nextBtn = document.createElement('button');
      const isLast = index === UNIFIED_TUTORIAL_STEP_COUNT - 1;
      nextBtn.textContent = isLast ? 'Finish' : 'Next >';
      nextBtn.style.background = isLast ? '#44ff44' : '#88ff88';
      nextBtn.style.color = '#002200';
      nextBtn.style.border = 'none';
      nextBtn.style.padding = '6px 8px';
      nextBtn.style.borderRadius = '6px';
      nextBtn.style.cursor = 'pointer';
      nextBtn.onclick = () => this.nextStep();
      rightGroup.appendChild(nextBtn);
      btnRow.appendChild(rightGroup);

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
      // eslint-disable-next-line no-console
      // DOM tooltip creation failed; fall back to in-canvas rendering

      const tooltipH = TOOLTIP_H_BASE;
      const domX = Math.max(12, Math.floor(gameW / 2 - TOOLTIP_W / 2));
      const tooltipY = Math.max(12, Math.floor(gameH / 2 - tooltipH / 2));

      const bg = s.add.rectangle(domX + TOOLTIP_W / 2, tooltipY + tooltipH / 2, TOOLTIP_W, tooltipH, 0x1a2a1a).setDepth(TOOLTIP_DEPTH + 1000);
      const border = s.add.rectangle(domX + TOOLTIP_W / 2, tooltipY + tooltipH / 2, TOOLTIP_W, tooltipH).setStrokeStyle(2, 0x44aa44).setDepth(TOOLTIP_DEPTH + 1001);
      const titleTxt = s.add.text(domX + 12, tooltipY + 12, step.title, { fontSize: '16px', color: '#aaffaa', fontFamily: FONT_FAMILY }).setDepth(TOOLTIP_DEPTH + 1002).setOrigin(0, 0);
      const bodyTxt = s.add.text(domX + 12, tooltipY + 40, step.body, { fontSize: '13px', color: '#ddccbb', fontFamily: FONT_FAMILY, wordWrap: { width: TOOLTIP_W - 24 } as any }).setDepth(TOOLTIP_DEPTH + 1002).setOrigin(0, 0);

      const dismissBtn = s.add.text(domX + 12, tooltipY + tooltipH - 30, 'Dismiss', { fontSize: '13px', color: '#aa8866', fontFamily: FONT_FAMILY }).setInteractive({ useHandCursor: true }).setDepth(TOOLTIP_DEPTH + 1003);
      dismissBtn.on('pointerdown', () => this.dismiss());

      const isLast = index === UNIFIED_TUTORIAL_STEP_COUNT - 1;
      const nextLabel = isLast ? 'Finish' : 'Next >';
      const nextBtn = s.add.text(domX + TOOLTIP_W - 12, tooltipY + tooltipH - 30, nextLabel, { fontSize: '13px', color: '#002200', backgroundColor: isLast ? '#44ff44' : '#88ff88', padding: { left: 6, right: 6 } as any, fontFamily: FONT_FAMILY }).setInteractive({ useHandCursor: true }).setOrigin(1, 0).setDepth(TOOLTIP_DEPTH + 1003);
      nextBtn.on('pointerdown', () => this.nextStep());

      if (index > 0) {
        const prevBtn = s.add.text(domX + TOOLTIP_W / 2, tooltipY + tooltipH - 30, '< Prev', { fontSize: '13px', color: '#88bbff', fontFamily: FONT_FAMILY }).setInteractive({ useHandCursor: true }).setDepth(TOOLTIP_DEPTH + 1003).setOrigin(0.5, 0);
        prevBtn.on('pointerdown', () => this.prevStep());
        this.objects.push(prevBtn);
      }

      this.objects.push(bg, border, titleTxt, bodyTxt, dismissBtn, nextBtn);
    }
  }

  // ── Action-gated tutorial step overlay (Milestone 5) ─────

  /**
   * Shows an overlay for the current action-gated tutorial step from TutorialFlow.
   * This uses the T1-T10 step definitions and highlights the appropriate UI zone.
   *
   * Called by the scene after the tutorial controller advances to a new step.
   */
  public showActionGatedStep(controller: TutorialControllerState): void {
    this.clearObjects();
    const step = getCurrentStep(controller);
    if (!step) return;

    this.visible = true;
    const s = this.scene;
    if (!s || !s.add) return;

    const layout = s.layout ?? {};
    const gameW: number = layout.gameW ?? 1280;
    const gameH: number = layout.gameH ?? 720;

    // Compute highlight zone bounds
    const anchor = this.zoneToAnchor(step.highlightZone, s);
    if (anchor) {
      const highlight = s.add.graphics();
      highlight.setDepth(TOOLTIP_DEPTH - 1);
      highlight.fillStyle(HIGHLIGHT_COLOR, HIGHLIGHT_ALPHA);
      highlight.fillRect(anchor.x, anchor.y, anchor.w, anchor.h);
      highlight.lineStyle(2, HIGHLIGHT_COLOR, HIGHLIGHT_BORDER_ALPHA);
      highlight.strokeRect(anchor.x, anchor.y, anchor.w, anchor.h);
      this.objects.push(highlight);
    }

    const tooltipW = 340;
    const tooltipX = Math.max(12, Math.floor(gameW / 2 - tooltipW / 2));

    const isLast = step.id === 'T13';
    const isExitable = !isLast;

    // Use Phaser canvas-based tooltip with interactive Text buttons.
    // This avoids the DOM detach/reattach cycle that causes onclick handlers
    // to be lost in Phaser 4 RC's DOM element handling.
    const tooltipH = 160;
    const finalY = Math.max(12, Math.floor(gameH / 2 - tooltipH / 2));

    // Background and border
    const bg = s.add.rectangle(tooltipX + tooltipW / 2, finalY + tooltipH / 2, tooltipW, tooltipH, 0x1a2a1a).setDepth(TOOLTIP_DEPTH + 1000);
    const border = s.add.rectangle(tooltipX + tooltipW / 2, finalY + tooltipH / 2, tooltipW, tooltipH).setStrokeStyle(2, 0x44aa44).setDepth(TOOLTIP_DEPTH + 1001);
    this.objects.push(bg, border);

    // Title
    const titleTxt = s.add.text(tooltipX + 16, finalY + 12, step.title, {
      fontSize: '16px',
      color: '#aaffaa',
      fontFamily: FONT_FAMILY,
      fontStyle: 'bold',
    }).setDepth(TOOLTIP_DEPTH + 1002).setOrigin(0, 0);
    this.objects.push(titleTxt);

    // Body text
    const bodyTxt = s.add.text(tooltipX + 16, finalY + 40, step.body, {
      fontSize: '13px',
      color: '#ddccbb',
      fontFamily: FONT_FAMILY,
      wordWrap: { width: tooltipW - 32 },
      lineSpacing: 4,
    }).setDepth(TOOLTIP_DEPTH + 1002).setOrigin(0, 0);
    this.objects.push(bodyTxt);

    // Button row at bottom of tooltip
    const btnY = finalY + tooltipH - 32;

    // Determine if this step can be advanced via Continue button.
    // Steps with requiredAction 'confirm', 'acknowledge', or 'acknowledge-queue' can be advanced;
    // steps requiring actual game actions (select-business, etc.) cannot.
    const canConfirmViaButton = step.requiredAction === 'confirm' || step.requiredAction === 'acknowledge' || step.requiredAction === 'acknowledge-queue';

    // Exit Tutorial button (left side) - shown for all steps except the last
    if (isExitable) {
      const exitBtn = s.add.text(tooltipX + 16, btnY, 'Exit Tutorial', {
        fontSize: '13px',
        color: '#cc6666',
        fontFamily: FONT_FAMILY,
        padding: { left: 8, right: 8, top: 4, bottom: 4 },
        backgroundColor: '#2a1a1a',
      }).setDepth(TOOLTIP_DEPTH + 1003).setInteractive({ useHandCursor: true });
      exitBtn.on('pointerdown', () => {
        this.clearObjects();
        this.visible = false;
        try { (s as any).exitTutorialFlow?.(); } catch (_) { /* ignore */ }
      });
      exitBtn.on('pointerover', () => exitBtn.setColor('#ff8888'));
      exitBtn.on('pointerout', () => exitBtn.setColor('#cc6666'));
      this.objects.push(exitBtn);
    }

    // Continue / Start Full Game button (right side)
    // Only show for steps that can be advanced via button click
    if (canConfirmViaButton || isLast) {
      const confirmLabel = isLast ? 'Start Full Game' : 'Continue';
      const confirmColor = '#002200';
      const confirmBg = isLast ? '#44ff44' : '#88ff88';
      const confirmBtn = s.add.text(tooltipX + tooltipW - 16, btnY, confirmLabel, {
        fontSize: '13px',
        color: confirmColor,
        fontFamily: FONT_FAMILY,
        fontStyle: 'bold',
        padding: { left: 12, right: 12, top: 6, bottom: 6 },
        backgroundColor: confirmBg,
      }).setDepth(TOOLTIP_DEPTH + 1003).setOrigin(1, 0).setInteractive({ useHandCursor: true });
      confirmBtn.on('pointerdown', () => {
        try { (s as any).confirmTutorialStep?.(); } catch (_) { /* ignore */ }
      });
      confirmBtn.on('pointerover', () => confirmBtn.setAlpha(0.8));
      confirmBtn.on('pointerout', () => confirmBtn.setAlpha(1));
      this.objects.push(confirmBtn);
    }

    // Step badge — use unified step count for the 13-step system
    const stepNum = UNIFIED_TUTORIAL_STEPS.findIndex((d) => d.id === step.id) + 1;
    const stepLabel = s.add.text(
      tooltipX + tooltipW - 12, finalY + 10,
      `${stepNum} / ${UNIFIED_TUTORIAL_STEP_COUNT}`,
      { fontSize: '11px', color: '#669966', fontFamily: FONT_FAMILY }
    ).setOrigin(1, 0).setDepth(TOOLTIP_DEPTH + 1002);
    this.objects.push(stepLabel);
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
        // eslint-disable-next-line no-console
        console.debug('[Tutorial] clearObjects: destroy failed', e);
      }
    }
    this.objects = [];
  }
}
