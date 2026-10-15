/**
 * GymDlcUnlockScene -- In-game DLC gate proof (F7, CG-0MUZGBTWW00729L4).
 *
 * Demonstrates the pure {@link DlcGate} helper (`src/core-engine/DlcGate.ts`)
 * gating an in-game DLC content item on the unified action-reward unlock state.
 * The gated content item — a "Bonus Scenery Pack" — is **unreachable until the
 * required action is verified**, then reachable afterwards. This is the
 * end-to-end proof referenced by intake AC3/AC4 of CG-0MUZF156A007OUIT; per-game
 * DLC roll-out is follow-up work.
 *
 * **Locked-state presentation.** While locked, the content card is dimmed grey,
 * a `[ LOCKED ]` banner sits over it explaining that the action must be
 * completed, and the `[ Open Bonus ]` button refuses the action with an event-log
 * entry. When unlocked, the card turns green, the banner reads `[ UNLOCKED ]`,
 * and opening the content is allowed. The presentation is identical whether the
 * state comes from the real bridge or is unreadable (an unreadable state is
 * rendered locked, never an error).
 *
 * **Read path.** The gate's reader consults the F5 renderer client
 * (`contentUnlockClientFromWindow()`, the additive `window.tce.contentUnlocks`
 * bridge). In a plain browser there is no bridge, so the client reports
 * "not unlocked" — the web build stays safe. To make the locked → verified →
 * reachable transition demonstrable without Electron, the `[ Verify action ]`
 * button simulates a completed action locally (the same reader still defers to
 * the real bridge first). In the launcher the verification is performed by the
 * unlock service and the simulated flag is simply absent.
 *
 * @module example-games/gym/scenes/GymDlcUnlockScene
 */

import Phaser from 'phaser';
import { GymSceneBase } from './GymSceneBase';
import { GYM_DLC_UNLOCK_KEY } from '../GymRegistry';
import {
  createDlcGate,
  type DlcGate,
  type DlcGateResult,
} from '../../../src/core-engine/DlcGate';
import {
  contentUnlockClientFromWindow,
  type ContentUnlockClient,
} from '../../../src/ui/content-unlock-client';
import { createHudText } from '../../../src/ui/Renderer';
import { createEventLog, type EventLogResult } from '../../../src/ui/GymSceneUtils';

/** The game id whose DLC is gated in this proof scene. */
export const GYM_DLC_GAME_ID = 'gym';

/** The demo DLC content item id. */
export const GYM_DLC_CONTENT_ID = 'bonus-scenery-pack';

/** Card panel colours for the locked / unlocked presentations. */
const PANEL_FILL_LOCKED = 0x222233;
const PANEL_FILL_UNLOCKED = 0x1f3d24;
const PANEL_STROKE_LOCKED = 0x555566;
const PANEL_STROKE_UNLOCKED = 0x55cc66;

export class GymDlcUnlockScene extends GymSceneBase {
  /** The pure gate under test. */
  private gate!: DlcGate;

  /** The F5 total read client bound to the window bridge (or a no-op). */
  private contentUnlockClient!: ContentUnlockClient;

  /**
   * Local simulation of a completed action so the locked → verified →
   * reachable transition is demonstrable in a plain browser. In Electron the
   * real bridge reports the persisted unlock and this flag stays `false`.
   */
  private verified = false;

  /** Most recent gate result (for rendering and test assertions). */
  private lastResult: DlcGateResult | null = null;

  /** The most recent gate read, awaited by `whenReady()` so tests are deterministic. */
  private pendingGateRead: Promise<void> = Promise.resolve();

  // ── Rendered objects ─────────────────────────────────────
  private contentPanel!: Phaser.GameObjects.Rectangle;
  private lockBanner!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private openButton!: Phaser.GameObjects.Text;
  private verifyButton!: Phaser.GameObjects.Text;
  private resetButton!: Phaser.GameObjects.Text;

  // ── Event log ────────────────────────────────────────────
  private eventLog!: EventLogResult;
  private logEntries: string[] = [];

  constructor() {
    super({ key: GYM_DLC_UNLOCK_KEY });
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#1a2a1a');
    this.initHeader('In-game DLC Gate');
    this.addDivider();
    this.initReducedMotion();

    // The read path: the F5 renderer client; a no-op in a plain browser.
    this.contentUnlockClient = contentUnlockClientFromWindow();

    // The pure gate. The reader prefers the real bridge and falls back to the
    // locally simulated verification so the demo works without Electron.
    this.gate = createDlcGate({
      gameId: GYM_DLC_GAME_ID,
      isUnlocked: async (target) => {
        const fromBridge = await this.contentUnlockClient.isUnlocked(target);
        return fromBridge || this.verified;
      },
    });

    // ── SLL layout anchors ─────────────────────────────────
    const contentTop = this.getGymAnchor('content', 'topCenter') ?? { x: 640, y: 108 };
    const contentCenter = this.getGymAnchor('content', 'center') ?? { x: 640, y: 378 };
    const controlsCenter = this.getGymAnchor('content', 'bottomCenter') ?? { x: 640, y: 648 };

    // ── Gated DLC content card ─────────────────────────────
    const cardW = 360;
    const cardH = 220;
    this.contentPanel = this.add
      .rectangle(contentCenter.x, contentCenter.y - 40, cardW, cardH, PANEL_FILL_LOCKED, 1)
      .setStrokeStyle(3, PANEL_STROKE_LOCKED, 1);

    createHudText(
      this,
      contentCenter.x,
      contentCenter.y - 90,
      'Bonus Scenery Pack',
      '#cceecc',
      { fontSize: '22px' },
    ).setOrigin(0.5);

    createHudText(
      this,
      contentCenter.x,
      contentCenter.y - 55,
      'DLC content item — game: "gym", dlc: "bonus-scenery-pack"',
      '#779977',
      { fontSize: '12px' },
    ).setOrigin(0.5);

    this.lockBanner = createHudText(
      this,
      contentCenter.x,
      contentCenter.y - 40,
      '[ LOCKED ]',
      '#ffaa66',
      { fontSize: '18px' },
    ).setOrigin(0.5);

    createHudText(
      this,
      contentCenter.x,
      contentCenter.y + 5,
      'Complete the required action to unlock this content.',
      '#aaccaa',
      { fontSize: '13px' },
    ).setOrigin(0.5);

    // ── Status line ────────────────────────────────────────
    this.statusText = createHudText(
      this,
      contentCenter.x,
      contentCenter.y + 110,
      'Gate status: locked',
      '#ffaa66',
      { fontSize: '14px' },
    ).setOrigin(0.5);

    // ── Controls ───────────────────────────────────────────
    this.initButtonBar(controlsCenter.y - 70);
    this.verifyButton = this.buttonBar!.addButton(
      '[ Verify action ]',
      () => {
        void this.verifyAction();
      },
      { zone: 'center', fontSize: '13px' },
    );
    this.resetButton = this.buttonBar!.addButton(
      '[ Reset ]',
      () => {
        void this.resetVerification();
      },
      { zone: 'center', fontSize: '13px' },
    );
    this.openButton = this.buttonBar!.addButton(
      '[ Open Bonus ]',
      () => {
        this.openBonus();
      },
      { zone: 'center', fontSize: '13px' },
    );

    // ── Event log ──────────────────────────────────────────
    const logY = contentTop.y + 250;
    this.eventLog = createEventLog(this, logY, {
      headerText: '── Unlock Gate Log ──',
      maxLines: 8,
      lineHeight: 16,
      fontSize: '11px',
      lineX: 60,
    });
    this.eventLog.render([]);

    // ── Help panel (documents the locked-state presentation) ──
    this.initHelp([
      {
        heading: 'Features',
        body: 'Demonstrates the core-engine DlcGate (src/core-engine/DlcGate.ts): a pure, framework-free helper that a game uses to gate DLC content on the unified action-reward unlock state. The gate asks one question — is this DLC unlocked? — through an injected reader (here the F5 window.tce.contentUnlocks renderer client).',
      },
      {
        heading: 'Locked-state presentation',
        body: 'While locked the content card is dimmed grey, a [ LOCKED ] banner explains that the required action must be completed, and [ Open Bonus ] refuses the action (logged as locked). When unlocked the card turns green and the banner reads [ UNLOCKED ]. An absent, throwing, or unreadable unlock state renders exactly like "locked" — the gate never throws and never fabricates an unlock, so it can never crash the owning game.',
      },
      {
        heading: 'Controls',
        body: '[ Verify action ] — simulate completing the action and re-read the gate (locked → reachable).\n[ Reset ] — clear the simulated verification and re-read the gate (reachable → locked).\n[ Open Bonus ] — attempt to open the DLC content; refused while locked, allowed once unlocked.\n[ < Prev ] / [ Next > ] — navigate to the previous or next Gym scene.',
      },
      {
        heading: 'Usage Example',
        body: 'In a real game, create the gate once with the game id and the F5 read client: `const gate = createDlcGate({ gameId: "my-game", isUnlocked: (t) => contentUnlockClient.isUnlocked(t) });` then gate a content item with `if (!(await gate.isUnlocked("my-dlc"))) { showLockedMessage(); return; }`. The same reader can be pointed at a deterministic fake in tests.',
      },
      {
        heading: 'Test Plan',
        body: '1. Scene boots with the content locked and [ LOCKED ] visible.\n2. Click [ Verify action ] → gate reports unlocked, card turns green, [ Open Bonus ] allowed.\n3. Click [ Reset ] → gate reports locked again.\n4. With no/unreadable reader the gate still renders locked and never throws (unit-tested in tests/core-engine/DlcGate.test.ts).',
      },
    ]);

    this.events.on('shutdown', this.shutdown, this);

    // Initial gate read (locked by default).
    this.refreshGate('scene ready');
  }

  // ── Public testing helpers ───────────────────────────────

  /** The pure gate under test. @internal Exposed for testing. */
  getDlcGate(): DlcGate {
    return this.gate;
  }

  /** Resolve once the most recent gate read + render has completed. @internal */
  async whenReady(): Promise<void> {
    await this.pendingGateRead;
  }

  /** Latest gate result, or `null` before the first read. @internal */
  getLastGateResult(): DlcGateResult | null {
    return this.lastResult;
  }

  /** Re-read the gate and return the result. @internal Exposed for testing. */
  async getGateResult(): Promise<DlcGateResult> {
    return this.gate.check(GYM_DLC_CONTENT_ID);
  }

  /** Whether the gated content is currently reachable. @internal */
  isContentReachable(): boolean {
    return this.lastResult?.unlocked === true;
  }

  /** Whether the locked-state presentation is currently shown. @internal */
  isLockedPresentationVisible(): boolean {
    return this.lastResult?.unlocked !== true;
  }

  /** The [ Verify action ] button. @internal Exposed for testing. */
  getVerifyButton(): Phaser.GameObjects.Text {
    return this.verifyButton;
  }

  /** The [ Reset ] button. @internal Exposed for testing. */
  getResetButton(): Phaser.GameObjects.Text {
    return this.resetButton;
  }

  /** The [ Open Bonus ] button. @internal Exposed for testing. */
  getOpenButton(): Phaser.GameObjects.Text {
    return this.openButton;
  }

  /** The DLC content panel. @internal Exposed for testing. */
  getContentPanel(): Phaser.GameObjects.Rectangle {
    return this.contentPanel;
  }

  /** Recorded gate log entries. @internal Exposed for testing. */
  getEventLogEntries(): string[] {
    return [...this.logEntries];
  }

  /** Simulate completing the required action, then re-read the gate. @internal */
  async verifyAction(): Promise<void> {
    this.verified = true;
    await this.refreshGate('action verified');
  }

  /** Clear the simulated verification, then re-read the gate. @internal */
  async resetVerification(): Promise<void> {
    this.verified = false;
    await this.refreshGate('verification reset');
  }

  /** Attempt to open the gated content (allowed only when unlocked). @internal */
  openBonus(): void {
    if (this.isContentReachable()) {
      this.logEvent('Opened the Bonus Scenery Pack — content reachable');
      this.popFeedback('Bonus opened!');
    } else {
      this.logEvent('Refused: Bonus Scenery Pack is locked');
    }
  }

  // ── Gate + rendering ─────────────────────────────────────

  /** Re-read the gate and repaint the view. Never throws. */
  private refreshGate(reason: string): Promise<void> {
    const read = (async () => {
      const result = await this.gate.check(GYM_DLC_CONTENT_ID);
      this.lastResult = result;
      this.renderGateState(result);

      const label = result.reason === 'unreadable' ? 'unreadable' : result.reason;
      this.logEvent(`Gate read (${reason}): ${label}`);
    })();
    this.pendingGateRead = read;
    return read;
  }

  /** Apply a gate result to the card, banner, status and buttons. */
  private renderGateState(result: DlcGateResult): void {
    const unlocked = result.unlocked;

    this.contentPanel
      .setFillStyle(unlocked ? PANEL_FILL_UNLOCKED : PANEL_FILL_LOCKED, 1)
      .setStrokeStyle(3, unlocked ? PANEL_STROKE_UNLOCKED : PANEL_STROKE_LOCKED, 1);

    this.lockBanner
      .setText(unlocked ? '[ UNLOCKED ]' : '[ LOCKED ]')
      .setColor(unlocked ? '#88ff88' : '#ffaa66');

    const reasonLabel =
      result.reason === 'unreadable' ? 'unreadable — treated as locked' : result.reason;
    this.statusText
      .setText(`Gate status: ${reasonLabel}`)
      .setColor(unlocked ? '#88ff88' : '#ffaa66');

    this.contentPanel.setAlpha(unlocked ? 1 : 0.75);

    if (this.openButton) {
      this.openButton.setColor(unlocked ? '#88ff88' : '#667766');
    }

    if (this.reducedMotion) return;
    this.tweens.add({
      targets: this.contentPanel,
      scaleX: unlocked ? 1.02 : 1,
      scaleY: unlocked ? 1.02 : 1,
      duration: 150,
      yoyo: true,
    });
  }

  /** Lightweight toast using the shared text helper (no particle dependency). */
  private popFeedback(message: string): void {
    const contentCenter = this.getGymAnchor('content', 'center') ?? { x: 640, y: 378 };
    const toast = createHudText(
      this,
      contentCenter.x,
      contentCenter.y + 150,
      message,
      '#ffff88',
      { fontSize: '14px' },
    ).setOrigin(0.5);

    if (this.reducedMotion) {
      this.time.delayedCall(600, () => toast.destroy());
      return;
    }
    this.tweens.add({
      targets: toast,
      alpha: 0,
      y: toast.y - 24,
      duration: 600,
      onComplete: () => toast.destroy(),
    });
  }

  // ── Event logging ────────────────────────────────────────

  private logEvent(message: string): void {
    this.logEntries.push(message);
    if (this.logEntries.length > 40) {
      this.logEntries.splice(0, this.logEntries.length - 40);
    }
    this.eventLog.render(this.logEntries);
  }

  // ── Shutdown ─────────────────────────────────────────────

  private shutdown(): void {
    try { this.eventLog?.destroy(); } catch (_) { /* ignore */ }
    this.logEntries = [];
    this.events.off('shutdown', this.shutdown, this);
  }
}
