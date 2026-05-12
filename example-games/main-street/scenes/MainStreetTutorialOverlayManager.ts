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
      return { x: 0, y: l.marketTop - 6, w: l.gameW, h: l.marketRowH * 2 + l.marketRowGap + 16 };
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
      return { x: 0, y: l.queueTop - 6, w: l.gameW, h: l.queueCardH + 16 };
    },
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
      return { x: l.challengeX - 8, y: l.challengeY - 8, w: l.challengeW + 16, h: 140 };
    },
  },
];

// ── Visual constants ─────────────────────────────────────────

const TOOLTIP_W = 360;
const TOOLTIP_H_BASE = 170;
const TOOLTIP_BG_COLOR = 0x1a2a1a;
const TOOLTIP_BORDER_COLOR = 0x44aa44;
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

    // ── Optional highlight rectangle ──────────────────────
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

    // ── Tooltip box ───────────────────────────────────────
    // Position tooltip below the anchor (or centred if no anchor)
    const tooltipX = gameW / 2 - TOOLTIP_W / 2;
    let tooltipY: number;
    if (anchor) {
      // Try to place below the highlight; clamp to viewport
      const belowY = anchor.y + anchor.h + 12;
      const aboveY = anchor.y - TOOLTIP_H_BASE - 12;
      tooltipY = belowY + TOOLTIP_H_BASE < gameH ? belowY : aboveY;
    } else {
      tooltipY = gameH / 2 - TOOLTIP_H_BASE / 2;
    }

    const bg = s.add.graphics();
    bg.setDepth(TOOLTIP_DEPTH);
    bg.fillStyle(TOOLTIP_BG_COLOR, 0.95);
    bg.fillRoundedRect(tooltipX, tooltipY, TOOLTIP_W, TOOLTIP_H_BASE, 8);
    bg.lineStyle(2, TOOLTIP_BORDER_COLOR, 0.9);
    bg.strokeRoundedRect(tooltipX, tooltipY, TOOLTIP_W, TOOLTIP_H_BASE, 8);
    this.objects.push(bg);

    // Step counter badge (e.g. "1 / 7")
    const stepLabel = s.add.text(
      tooltipX + TOOLTIP_W - 12,
      tooltipY + 10,
      `${index + 1} / ${TUTORIAL_STEPS.length}`,
      { fontSize: '11px', color: '#669966', fontFamily: FONT_FAMILY },
    ).setOrigin(1, 0).setDepth(TOOLTIP_DEPTH + 1);
    this.objects.push(stepLabel);

    // Title
    const titleText = s.add.text(
      tooltipX + 16,
      tooltipY + 12,
      step.title,
      { fontSize: '15px', fontStyle: 'bold', color: '#aaffaa', fontFamily: FONT_FAMILY },
    ).setOrigin(0, 0).setDepth(TOOLTIP_DEPTH + 1);
    this.objects.push(titleText);

    // Body
    const bodyText = s.add.text(
      tooltipX + 16,
      tooltipY + 36,
      step.body,
      {
        fontSize: '13px',
        color: '#ddccbb',
        fontFamily: FONT_FAMILY,
        wordWrap: { width: TOOLTIP_W - 32 },
        lineSpacing: 3,
      },
    ).setOrigin(0, 0).setDepth(TOOLTIP_DEPTH + 1);
    this.objects.push(bodyText);

    // ── Navigation buttons ────────────────────────────────
    const btnY = tooltipY + TOOLTIP_H_BASE - 24;

    // Dismiss button (always shown on the left)
    const dismissBtn = s.add.text(tooltipX + 12, btnY, '[ Dismiss ]', {
      fontSize: '12px', color: '#aa8866', fontFamily: FONT_FAMILY,
    }).setOrigin(0, 0.5).setDepth(TOOLTIP_DEPTH + 1).setInteractive({ useHandCursor: true });
    dismissBtn.on('pointerdown', () => this.dismiss());
    dismissBtn.on('pointerover', () => dismissBtn.setColor('#ddaa88'));
    dismissBtn.on('pointerout', () => dismissBtn.setColor('#aa8866'));
    this.objects.push(dismissBtn);

    // Prev button (disabled on step 0)
    if (index > 0) {
      const prevBtn = s.add.text(tooltipX + TOOLTIP_W / 2 - 50, btnY, '[ < Prev ]', {
        fontSize: '12px', color: '#88bbff', fontFamily: FONT_FAMILY,
      }).setOrigin(0.5, 0.5).setDepth(TOOLTIP_DEPTH + 1).setInteractive({ useHandCursor: true });
      prevBtn.on('pointerdown', () => this.prevStep());
      prevBtn.on('pointerover', () => prevBtn.setColor('#aaddff'));
      prevBtn.on('pointerout', () => prevBtn.setColor('#88bbff'));
      this.objects.push(prevBtn);
    }

    // Next / Finish button
    const isLast = index === TUTORIAL_STEPS.length - 1;
    const nextLabel = isLast ? '[ Finish ]' : '[ Next > ]';
    const nextColor = isLast ? '#44ff44' : '#88ff88';
    const nextBtn = s.add.text(tooltipX + TOOLTIP_W - 12, btnY, nextLabel, {
      fontSize: '12px', color: nextColor, fontFamily: FONT_FAMILY,
    }).setOrigin(1, 0.5).setDepth(TOOLTIP_DEPTH + 1).setInteractive({ useHandCursor: true });
    nextBtn.on('pointerdown', () => this.nextStep());
    nextBtn.on('pointerover', () => nextBtn.setColor('#ffffff'));
    nextBtn.on('pointerout', () => nextBtn.setColor(nextColor));
    this.objects.push(nextBtn);
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
