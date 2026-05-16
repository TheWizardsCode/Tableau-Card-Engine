/**
 * MainStreetTutorialOverlayManager -- Non-interactive tutorial overlays for Main Street.
 *
 * Displays a sequence of contextual tooltip hints that highlight key UI
 * regions (market, street slots, hand, action controls, scoring).
 *
 * Overlays are purely informational: they do not block gameplay interaction.
 * The player can dismiss individual hints or toggle the whole tutorial off.
 *
 * Usage:
 *   const mgr = new MainStreetTutorialOverlayManager(scene);
 *   mgr.showStep(0);        // show first hint
 *   mgr.nextStep();         // advance to next hint
 *   mgr.dismiss();          // hide all hints
 *   mgr.toggle();           // show/hide tutorial
 *
 * @module
 */

import { FONT_FAMILY } from '../../../src/ui';
import { MARKET_BUSINESS_SLOTS, INCIDENT_QUEUE_SIZE } from '../MainStreetCards';

// ── Tutorial step definitions ────────────────────────────────

/**
 * A single tutorial step: a title, body text, and an anchor function that
 * returns the screen-space rectangle (x, y, w, h) to highlight.
 *
 * If `anchor` returns null the tooltip is shown centred on screen.
 */
export interface TutorialStep {
  title: string;
  body: string;
  /** Returns {x, y, w, h} bounding box to highlight, or null for centred. */
  anchor: (scene: any) => { x: number; y: number; w: number; h: number } | null;
}

/** The ordered set of tutorial hints shown to new players. */
export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    title: 'Welcome to Main Street!',
    body:
      'Build the most profitable street in town!\n' +
      'Buy businesses, place them on your street, earn\n' +
      'coins & reputation, and reach the score target.\n\n' +
      'This is "Scenario: Tutorial" — Easy difficulty,\n' +
      '25 turns, and a lower score target.\n\n' +
      'Tap [Next] to learn the controls.',
    anchor: () => null,
  },
  {
    title: 'The Market',
    body:
      'The top section shows cards for sale.\n' +
      'Business cards (top row) go on your street.\n' +
      'Investment/Upgrade cards (bottom row) give\n' +
      'one-time effects or improve existing businesses.\n\n' +
      'Click a card to select it, then choose a street slot.',
    anchor: (scene: any) => {
      const l = scene.layout;
      if (!l) return null;
      // Prefer using the rendered marketContainer bounds when available so
      // the highlight precisely matches the visible market region including
      // the left-side title. Fallback to layout-derived bounds otherwise.
      try {
        const mc = (scene as any).marketContainer;
        if (mc && typeof mc.getBounds === 'function') {
          const b = mc.getBounds();
          const pad = 8;
          const x = Math.max(12, b.x - pad);
          const y = Math.max(12, b.y - pad);
          const rightLimit = (typeof l.logX === 'number' && l.logX > 0) ? l.logX - 20 : l.gameW - 40;
          const w = Math.max(80, Math.min(b.width + pad * 2, Math.max(80, rightLimit - x)));
          const h = Math.max(40, Math.min(b.height + pad * 2, l.gameH - 40));
          return { x, y, w, h };
        }
      } catch (_e) {
        // ignore and fallback
      }

      const startX = l.marketLabelW + 50;
      const slots = MARKET_BUSINESS_SLOTS;
      const totalCardsW = slots * l.marketCardW + (slots - 1) * l.marketCardGap;
      const padding = 8; // small padding around the highlight
      // Start at the content label X so the highlight includes the title area
      const labelX = 40;
      const x = Math.max(12, labelX - 8);
      const rightLimit = (typeof l.logX === 'number' && l.logX > 0) ? l.logX - 20 : Math.max(20, l.gameW - 40);
      const desiredW = Math.max(80, (startX - labelX) + totalCardsW + padding * 2);
      const w = Math.max(80, Math.min(desiredW, Math.max(80, rightLimit - x)));
      const y = l.marketTop - 6;
      const h = l.marketRowH * 2 + l.marketRowGap + 16;
      return { x, y, w, h };
    },

  },
  {
    title: 'Upcoming Incidents',
    body:
      'Blue cards show incidents that will hit at the\n' +
      'end of each turn — plan around them!\n' +
      'Negative incidents (Tax Audit, Vandalism) cost\n' +
      'coins or reputation.  Positive ones help you.\n\n' +
      'Queue scrolls left: the leftmost card fires next.',
    anchor: (scene: any) => {
      const l = scene.layout;
      if (!l) return null;
      // Prefer using rendered incident queue container bounds when available
      try {
        const qc = (scene as any).incidentQueueContainer;
        if (qc && typeof qc.getBounds === 'function') {
          const bq = qc.getBounds();
          const padq = 8;
          const x = Math.max(12, bq.x - padq);
          const y = Math.max(12, bq.y - padq);
          const rightLimitQ = (typeof l.logX === 'number' && l.logX > 0) ? l.logX - 20 : l.gameW - 40;
          const w = Math.max(80, Math.min(bq.width + padq * 2, Math.max(80, rightLimitQ - x)));
          const h = Math.max(40, Math.min(bq.height + padq * 2, l.gameH - 40));
          return { x, y, w, h };
        }
      } catch (_e) { /* ignore */ }

      const labelX = 40;
      const x = Math.max(12, labelX - 8);
      const desiredW = Math.max(80, l.queueLabelW + INCIDENT_QUEUE_SIZE * (l.queueCardW + l.queueCardGap) + 32);
      const rightLimitQ = (typeof l.logX === 'number' && l.logX > 0) ? l.logX - 20 : Math.max(20, l.gameW - 40);
      const w = Math.max(80, Math.min(desiredW, Math.max(80, rightLimitQ - x)));
      const y = l.queueTop - 6;
      const h = l.queueCardH + 16;
      return { x, y, w, h };
    },
  {
    title: 'Your Street',
    body:
      'The 2×5 grid is your street.\n' +
      'Place businesses here to earn income each turn.\n' +
      'Adjacent businesses that share a synergy type\n' +
      '(Food, Culture, Commerce, Service, Entertainment)\n' +
      'earn bonus income — cluster them for big returns!',
    anchor: (scene: any) => {
      const l = scene.layout;
      if (!l) return null;
      const streetH = 2 * l.slotH + l.streetRowGap + 12;
      return { x: 0, y: l.streetTop - 6, w: l.gameW, h: streetH };
    },
  },
  {
    title: 'Your Hand',
    body:
      'You can hold one Investment event at a time.\n' +
      'When you buy an event it appears here.\n' +
      'Click the card in your hand to play it\n' +
      'for its one-time effect.',
    anchor: (scene: any) => {
      const l = scene.layout;
      if (!l) return null;
      return { x: l.handX - 16, y: l.handY - 8, w: l.handCardW + 32, h: l.handCardH + 16 };
    },
  },
  {
    title: 'Action Controls',
    body:
      'Use the buttons along the bottom to:\n' +
      '• End Turn — collect income and advance the day\n' +
      '• Undo / Redo — step back a market action\n' +
      '• Hint — get a suggested move\n' +
      '• Refresh — swap the investment row (costs coins)\n\n' +
      'You can also press the keyboard shortcut for\n' +
      'End Turn (configurable in Settings ⚙).',
    anchor: (scene: any) => {
      const l = scene.layout;
      if (!l) return null;
      return { x: 0, y: l.actionY - 8, w: l.gameW, h: l.actionButtonH + 20 };
    },
  },
  {
    title: 'Challenges & Scoring',
    body:
      'Each run gives you challenges to complete for\n' +
      'bonus points (visible in the Challenge Tracker).\n\n' +
      'Final Score = Coins + Reputation × multiplier\n' +
      '            + Challenges × bonus\n\n' +
      'Reach the target score to win — good luck!',
    anchor: (scene: any) => {
      const l = scene.layout;
      if (!l) return null;
      if (!l.challengeX || l.challengeX < 0) return null;
      // Compute challenge panel height from constants and current active challenges if available
      try {
        // Prefer using the rendered challenge container bounds if available
        if (scene.challengeContainer && typeof (scene.challengeContainer as any).getBounds === 'function') {
          const b = (scene.challengeContainer as any).getBounds();
          const pad = 8;
          const x = Math.max(12, b.x - pad);
          const y = Math.max(12, b.y - pad);
          const w = Math.max(120, b.width + pad * 2);
          const h = Math.max(80, Math.min(b.height + pad * 2, 240));
          return { x, y, w, h };
        }

        const activeCount = (scene.state && Array.isArray(scene.state.activeChallenges)) ? scene.state.activeChallenges.length : 0;
        const CH = (require('../MainStreetConstants') as any).CHALLENGE_TITLE_H || 20;
        const CL = (require('../MainStreetConstants') as any).CHALLENGE_LINE_H || 20;
        const CP = (require('../MainStreetConstants') as any).CHALLENGE_PAD || 6;
        const contentH = CH + Math.max(0, activeCount) * CL + CP * 2;
        const h = Math.max(80, Math.min(contentH, 240));
        const x = Math.max(12, l.challengeX - 8);
        const y = Math.max(12, l.challengeY - 8);
        const w = Math.max(120, l.challengeW + 16);
        return { x, y, w, h };
      } catch {
        return { x: l.challengeX - 8, y: l.challengeY - 8, w: l.challengeW + 16, h: 140 };
      }
    },
  },
];

// ── Visual constants ─────────────────────────────────────────

const TOOLTIP_W = 360;
const TOOLTIP_H_BASE = 170;
const TOOLTIP_DEPTH = 200;
const HIGHLIGHT_COLOR = 0x44ff44;
const HIGHLIGHT_ALPHA = 0.18;
const HIGHLIGHT_BORDER_ALPHA = 0.8;

// ── Manager ──────────────────────────────────────────────────

/** Manages the lifecycle of all tutorial overlay objects. */
export class MainStreetTutorialOverlayManager {
  private objects: Phaser.GameObjects.GameObject[] = [];
  private currentStep = 0;
  private visible = false;

  constructor(private readonly scene: any) {}

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
    this.clearObjects();
    this.visible = false;
  }

  /** Advance to the next tutorial step (or dismiss if at end). */
  public nextStep(): void {
    this.currentStep++;
    if (this.currentStep >= TUTORIAL_STEPS.length) {
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
    if (index < 0 || index >= TUTORIAL_STEPS.length) return;
    this.clearObjects();
    this.currentStep = index;
    this.visible = true;

    const step = TUTORIAL_STEPS[index];
    const s = this.scene;
    const layout = s.layout ?? {};
    const gameW: number = layout.gameW ?? 1280;
    const gameH: number = layout.gameH ?? 720;

    // ── Optional highlight rectangle (canvas) ──────────────
    const anchor = step.anchor(s);
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
    const isLast = index === TUTORIAL_STEPS.length - 1;
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
    const stepLabel = s.add.text(domX + TOOLTIP_W - 12, tooltipY + 10, `${index + 1} / ${TUTORIAL_STEPS.length}`, { fontSize: '11px', color: '#669966', fontFamily: FONT_FAMILY }).setOrigin(1, 0).setDepth(TOOLTIP_DEPTH + 1);
    this.objects.push(stepLabel);
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
