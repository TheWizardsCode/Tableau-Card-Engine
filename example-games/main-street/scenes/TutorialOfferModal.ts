/**
 * Main Street: Tutorial Offer Modal
 *
 * Displays a first-launch modal prompt with "Start Tutorial" and "Skip for Now"
 * options before free turn interactions begin. Blocks normal gameplay until
 * the player makes a choice.
 *
 * @module
 */

import {
  createOverlayBackground,
  dismissOverlay,
  createOverlayButton,
  FONT_FAMILY,
} from '../../../src/ui';
import type { TutorialStorageAdapter } from '../TutorialState';
import {
  loadTutorialState,
  saveTutorialState,
  updateTutorialStatus,
  shouldShowTutorialOffer,
  bridgeLegacyTutorialSeen,
  type TutorialVisibilityOptions,
} from '../TutorialState';

// ── Callback Types ──────────────────────────────────────────

export interface TutorialOfferCallbacks {
  /** Called when the player clicks "Start Tutorial". */
  onStartTutorial: () => void;
  /** Called when the player clicks "Skip for Now". */
  onSkip: () => void;
}

// ── Visual Constants ────────────────────────────────────────

const MODAL_WIDTH = 420;
const MODAL_HEIGHT = 260;
// Depth must exceed the Main Street hudContainer depth (1000) so that
// overlay text/buttons render above the container that hosts the
// overlay background & box (created by createOverlayBackground).
const MODAL_DEPTH = 1001;
const MODAL_BOX_COLOR = 0x16213e;
const TITLE_COLOR = '#aaffaa';
const BODY_COLOR = '#ddccbb';
const SKIP_COLOR = '#aa8866';
const SKIP_HOVER_COLOR = '#ccaa88';

// ── Modal Manager ───────────────────────────────────────────

/**
 * Manages the tutorial offer modal lifecycle.
 *
 * Usage:
 *   const modal = new TutorialOfferModal(scene, storage, callbacks);
 *   modal.show();  // displays the modal and blocks input
 *   // Player clicks Start or Skip → callbacks fire → modal auto-dismisses
 */
export class TutorialOfferModal {
  private overlayObjects: Phaser.GameObjects.GameObject[] = [];
  private visible = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly storage: TutorialStorageAdapter,
    private readonly callbacks: TutorialOfferCallbacks,
  ) {}

  /** True if the modal is currently visible. */
  get isVisible(): boolean {
    return this.visible;
  }

  /**
   * Shows the tutorial offer modal if eligibility checks pass.
   *
   * @param opts visibility options (replayMode, disableTutorial, forceShowOffer).
   * @param legacyTutorialSeen optional legacy flag from campaign progress.
   * @returns true if the modal was shown, false if eligibility checks prevented it.
   */
  public showIfEligible(
    opts: TutorialVisibilityOptions = {},
    legacyTutorialSeen?: boolean,
  ): boolean {
    // Resolve tutorial state (bridging from legacy if needed)
    let state = loadTutorialState(this.storage);
    if (legacyTutorialSeen !== undefined) {
      state = bridgeLegacyTutorialSeen(this.storage, legacyTutorialSeen);
    }

    if (!shouldShowTutorialOffer(state, opts)) {
      return false;
    }

    this.show();
    return true;
  }

  /** Displays the modal, blocking normal gameplay interactions. */
  public show(): void {
    if (this.visible) return;
    this.visible = true;

    const s = this.scene;
    const gameW = s.scale.width;
    const gameH = s.scale.height;

    // ── Overlay background (blocks input) ────────────────
    const overlay = createOverlayBackground(
      s,
      { depth: MODAL_DEPTH, alpha: 0.7 },
      {
        width: MODAL_WIDTH,
        height: MODAL_HEIGHT,
        color: MODAL_BOX_COLOR,
        alpha: 0.95,
        depth: MODAL_DEPTH + 1,
      },
    );
    this.overlayObjects = [...overlay.objects];

    // ── Compute panel position ───────────────────────────
    const panelTop = gameH / 2 - MODAL_HEIGHT / 2;
    const centerX = gameW / 2;

    // ── Content depth: above the container (depth 1000)   ─
    // The overlay background and box are parented into the
    // hudContainer (depth 1000).  All interactive content
    // (text, buttons) must sit at a higher depth so Phaser
    // renders them after the container and its children.
    const CONTENT_DEPTH = MODAL_DEPTH + 2; // 1003

    // ── Title ────────────────────────────────────────────
    const title = s.add.text(
      centerX,
      panelTop + 32,
      'Welcome to Main Street!',
      {
        fontSize: '24px',
        fontStyle: 'bold',
        color: TITLE_COLOR,
        fontFamily: FONT_FAMILY,
      },
    )
      .setOrigin(0.5)
      .setDepth(CONTENT_DEPTH);
    this.overlayObjects.push(title);

    // ── Body text ────────────────────────────────────────
    const body = s.add.text(
      centerX,
      panelTop + 74,
      'Would you like a guided tutorial to learn\n' +
        'the basics of Main Street?',
      {
        fontSize: '15px',
        color: BODY_COLOR,
        fontFamily: FONT_FAMILY,
        align: 'center',
        lineSpacing: 4,
      },
    )
      .setOrigin(0.5, 0)
      .setDepth(CONTENT_DEPTH);
    this.overlayObjects.push(body);

    // ── Buttons ──────────────────────────────────────────
    const buttonY = panelTop + MODAL_HEIGHT - 48;
    // Two buttons centered within the modal panel. A 240px gap between
    // button centres keeps them well inside the 420px panel width with
    // comfortable padding on the outer edges.
    // Convention: left = dismiss/exit action, right = proceed/continue action.
    const buttonGap = 240;
    const leftX = centerX - buttonGap / 2;
    const rightX = centerX + buttonGap / 2;

    // Skip for Now button (left — consistent with other tutorial overlays
    // where the dismiss/exit action appears on the left)
    const skipBtn = createOverlayButton(
      s,
      leftX,
      buttonY,
      '[ Skip for Now ]',
      CONTENT_DEPTH,
      { fontSize: '15px', color: SKIP_COLOR, hoverColor: SKIP_HOVER_COLOR },
    );
    skipBtn.on('pointerdown', () => {
      this.dismiss();
      this.persistStatus('skipped');
      this.callbacks.onSkip();
    });
    this.overlayObjects.push(skipBtn);

    // Start Tutorial button (right — consistent with other tutorial overlays
    // where the proceed/continue action appears on the right)
    const startBtn = createOverlayButton(
      s,
      rightX,
      buttonY,
      '[ Start Tutorial ]',
      CONTENT_DEPTH,
      { fontSize: '15px', color: '#88ff88', hoverColor: '#aaffaa' },
    );
    startBtn.on('pointerdown', () => {
      this.dismiss();
      this.persistStatus('not_seen');
      this.callbacks.onStartTutorial();
    });
    this.overlayObjects.push(startBtn);
  }

  /** Dismisses the modal and restores interactivity. */
  public dismiss(): void {
    if (!this.visible) return;
    this.visible = false;
    dismissOverlay(this.overlayObjects);
    this.overlayObjects = [];
  }

  // ── Private helpers ─────────────────────────────────────

  private persistStatus(status: 'not_seen' | 'skipped'): void {
    const current = loadTutorialState(this.storage);
    const updated = updateTutorialStatus(current, status);
    // Use a synchronous save path; the storage adapter is localStorage
    // so setItem is synchronous. We call saveTutorialState which returns
    // a Promise<void> but completes synchronously for localStorage.
    void saveTutorialState(this.storage, updated);
  }
}
