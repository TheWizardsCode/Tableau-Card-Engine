/**
 * Main Street: Stats View Overlay
 *
 * A slide-in overlay panel accessible from the game HUD that displays
 * player statistics (games played, wins, win rate, best score, last
 * played date) and provides a Reset All Progress button with a
 * two-step confirmation flow.
 *
 * Follows existing UI patterns from HelpPanel and SettingsPanel:
 * slide-in panel, input blocking, close button, and confirmation overlay.
 *
 * @module
 */

import Phaser from 'phaser';
import { FONT_FAMILY } from '../../../src/ui';
import { createOverlayButton } from '../../../src/ui';
import {
  BrowserStatsStorageAdapter,
  loadStats,
  resetAllProgress,
} from '../StatsDomain';

// ── Style Constants ─────────────────────────────────────────

const PANEL_WIDTH = 320;
const PANEL_BG_COLOR = 0x1a1a2e;
const PANEL_BG_ALPHA = 0.95;
const ANIMATION_DURATION = 300;

const HEADING_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontSize: '20px',
  color: '#f0c040',
  fontFamily: FONT_FAMILY,
  fontStyle: 'bold',
};

const STAT_LABEL_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontSize: '14px',
  color: '#998877',
  fontFamily: FONT_FAMILY,
};

const STAT_VALUE_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontSize: '18px',
  color: '#dddddd',
  fontFamily: FONT_FAMILY,
  fontStyle: 'bold',
};

const BODY_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontSize: '14px',
  color: '#dddddd',
  fontFamily: FONT_FAMILY,
  lineSpacing: 4,
};

const CLOSE_BUTTON_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontSize: '20px',
  color: '#aaaaaa',
  fontFamily: FONT_FAMILY,
  fontStyle: 'bold',
};

const CONFIRM_TITLE_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontSize: '18px',
  color: '#ff6644',
  fontFamily: FONT_FAMILY,
  fontStyle: 'bold',
};

const RESET_BUTTON_COLOR = '#ff6644';
const RESET_BUTTON_HOVER_COLOR = '#ff8866';

const PADDING = 20;
const MARGIN = 16;

// Depth layers
const DEPTH_INPUT_BLOCKER = 900;
const DEPTH_PANEL_BG = 901;
const DEPTH_PANEL_CONTENT = 902;
const DEPTH_CLOSE_BUTTON = 903;
const DEPTH_CONFIRM_OVERLAY = 950;
const STATS_BUTTON_DEPTH = 1100;

// ── Stats Button ────────────────────────────────────────────

/**
 * A circular stats button that toggles the StatsOverlay.
 *
 * Displays the ms-icon-stats SVG icon (bar chart) when the texture is
 * available, falling back to the Greek Sigma "Σ" text character if the
 * texture failed to load.
 *
 * Placed in the lower-left corner of the screen to avoid overlap
 * with the Settings button (upper-right). Follows the same visual
 * style as HelpButton and SettingsButton.
 */
export class StatsButton {
  private circle: Phaser.GameObjects.Graphics;
  /** Primary icon (Image) when ms-icon-stats texture is loaded. */
  private icon: Phaser.GameObjects.Image | null = null;
  /** Fallback text label (Σ) when the texture is unavailable. */
  private label: Phaser.GameObjects.Text;
  private hitArea: Phaser.GameObjects.Zone;
  private destroyed = false;

  constructor(
    scene: Phaser.Scene,
    private readonly overlay: StatsOverlay,
    x: number,
    y: number,
  ) {
    const radius = 16;
    const iconSize = 14;

    this.circle = scene.add.graphics();
    this.circle.setDepth(STATS_BUTTON_DEPTH);

    // Fallback text label (Σ) - always created, hidden when icon is displayed
    this.label = scene.add.text(0, 0, '\u03A3', {
      fontSize: '16px',
      color: '#f0c040',
      fontFamily: FONT_FAMILY,
      fontStyle: 'bold',
    });
    this.label.setOrigin(0.5);
    this.label.setDepth(STATS_BUTTON_DEPTH);

    // Try to display the SVG icon; fall back to text if texture is missing
    if (scene.textures.exists('ms-icon-stats')) {
      this.icon = scene.add.image(x, y, 'ms-icon-stats');
      this.icon.setDisplaySize(iconSize, iconSize);
      this.icon.setDepth(STATS_BUTTON_DEPTH);
      this.icon.setTint(0xf0c040);  // Match the text color
      this.label.setVisible(false);  // Hide fallback text
    } else {
      this.icon = null;
    }

    this.hitArea = scene.add.zone(x, y, radius * 2, radius * 2);
    this.hitArea.setDepth(STATS_BUTTON_DEPTH);
    this.hitArea.setInteractive({ useHandCursor: true });

    this.drawCircle(x, y, radius, 0x333355, 0.9);

    // Parent into HUD container
    try {
      const hudRoot: any = (scene as any).hudContainer ?? null;
      if (hudRoot && typeof hudRoot.add === 'function') {
        try {
          hudRoot.add(this.circle);
          if (this.icon) hudRoot.add(this.icon);
          hudRoot.add(this.label);
          hudRoot.add(this.hitArea);
        } catch (_) { /* ignore */ }
      }
    } catch (_) { /* ignore */ }

    this.hitArea.on('pointerdown', () => {
      if (!this.destroyed) {
        this.overlay.toggle();
      }
    });

    this.hitArea.on('pointerover', () => {
      if (!this.destroyed) {
        this.drawCircle(x, y, radius, 0x4444aa, 1);
        if (this.icon) {
          this.icon.setTint(0xffffff);
        } else {
          this.label.setColor('#ffffff');
        }
      }
    });

    this.hitArea.on('pointerout', () => {
      if (!this.destroyed) {
        this.drawCircle(x, y, radius, 0x333355, 0.9);
        if (this.icon) {
          this.icon.setTint(0xf0c040);
        } else {
          this.label.setColor('#f0c040');
        }
      }
    });
  }

  private drawCircle(x: number, y: number, radius: number, color: number, alpha: number): void {
    this.circle.clear();
    this.circle.lineStyle(2, 0xf0c040, 1);
    this.circle.strokeCircle(x, y, radius);
    this.circle.fillStyle(color, alpha);
    this.circle.fillCircle(x, y, radius);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.circle.destroy();
    if (this.icon) this.icon.destroy();
    this.label.destroy();
    this.hitArea.destroy();
  }
}

// ── Stats Overlay ───────────────────────────────────────────

export class StatsOverlay {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private background: Phaser.GameObjects.Rectangle;
  private contentContainer: Phaser.GameObjects.Container;
  private closeButton: Phaser.GameObjects.Text;
  private inputBlocker: Phaser.GameObjects.Rectangle | null = null;
  private _isOpen = false;
  private _isAnimating = false;
  private currentTween: Phaser.Tweens.Tween | null = null;
  private destroyed = false;
  private enabled = true;
  private statsButton: StatsButton | null = null;

  // Confirmation overlay objects
  private confirmContainer: Phaser.GameObjects.Container | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    const canvasWidth = scene.scale.width;
    const canvasHeight = scene.scale.height;

    // Build the panel (hidden off-screen to the right)
    this.container = scene.add.container(canvasWidth, 0);
    this.container.setDepth(DEPTH_PANEL_BG);

    // Background
    this.background = scene.add.rectangle(
      PANEL_WIDTH / 2,
      canvasHeight / 2,
      PANEL_WIDTH,
      canvasHeight,
      PANEL_BG_COLOR,
      PANEL_BG_ALPHA,
    );
    this.container.add(this.background);

    // Close button ("X") at top-right of panel
    this.closeButton = scene.add.text(
      PANEL_WIDTH - PADDING,
      PADDING,
      'X',
      CLOSE_BUTTON_STYLE,
    );
    this.closeButton.setDepth(DEPTH_CLOSE_BUTTON);
    this.closeButton.setInteractive({ useHandCursor: true });
    this.closeButton.on('pointerdown', () => this.close());
    this.closeButton.on('pointerover', () => this.closeButton.setColor('#ffffff'));
    this.closeButton.on('pointerout', () => this.closeButton.setColor('#aaaaaa'));
    this.container.add(this.closeButton);

    // Content container
    this.contentContainer = scene.add.container(0, PADDING + 40);
    this.contentContainer.setDepth(DEPTH_PANEL_CONTENT);
    this.container.add(this.contentContainer);

    // Build content
    this.buildContent();

    // Parent into HUD container
    try {
      const hudRoot: any = (scene as any).hudContainer ?? null;
      if (hudRoot && typeof hudRoot.add === 'function') {
        try { hudRoot.add(this.container); } catch (_) { /* ignore */ }
      }
    } catch (_) { /* ignore */ }

    // Set invisible initially
    this.container.setVisible(false);

    // Create stats button (placed next to help/settings buttons in header)
    // Position: right side of header, before the help button
    this.createStatsButton();
  }

  /** Whether the overlay is currently open. */
  get isOpen(): boolean {
    return this._isOpen;
  }

  /** Whether the overlay is currently animating. */
  get isAnimating(): boolean {
    return this._isAnimating;
  }

  /** Toggle the overlay open/closed. */
  toggle(): void {
    if (this.destroyed || !this.enabled) return;
    if (this._isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  /** Open the overlay with slide-in animation. */
  open(): void {
    if (this.destroyed || !this.enabled) return;
    if (this._isOpen && !this._isAnimating) return;

    // Refresh content each time the panel opens
    this.buildContent();

    this._isOpen = true;
    this.container.setVisible(true);
    this.createInputBlocker();

    // Ensure panel is on top
    try {
      const hudRoot: any = (this.scene as any).hudContainer;
      if (hudRoot && typeof hudRoot.bringToTop === 'function') {
        try { hudRoot.bringToTop(this.container); } catch (_) { /* ignore */ }
      }
      try { this.scene.children?.depthSort?.(); } catch (_) { /* ignore */ }
    } catch (_) { /* ignore */ }

    if (this.currentTween) {
      this.currentTween.stop();
      this.currentTween = null;
    }

    const canvasWidth = this.scene.scale.width;
    this._isAnimating = true;
    this.currentTween = this.scene.tweens.add({
      targets: this.container,
      x: canvasWidth - PANEL_WIDTH,
      duration: ANIMATION_DURATION,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        this._isAnimating = false;
        this.currentTween = null;
      },
    });
  }

  /** Close the overlay with slide-out animation. */
  close(): void {
    if (this.destroyed || !this.enabled) return;
    if (!this._isOpen && !this._isAnimating) return;

    // Dismiss any confirmation overlay
    this.dismissConfirmOverlay();

    this._isOpen = false;

    if (this.currentTween) {
      this.currentTween.stop();
      this.currentTween = null;
    }

    const canvasWidth = this.scene.scale.width;
    this.removeInputBlocker();

    this._isAnimating = true;
    this.currentTween = this.scene.tweens.add({
      targets: this.container,
      x: canvasWidth,
      duration: ANIMATION_DURATION,
      ease: 'Cubic.easeIn',
      onComplete: () => {
        this._isAnimating = false;
        this.currentTween = null;
        this.container.setVisible(false);
      },
    });
  }

  /** Clean up all game objects. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.statsButton?.destroy();
    this.statsButton = null;

    if (this.currentTween) {
      this.currentTween.stop();
      this.currentTween = null;
    }
    this.removeInputBlocker();
    this.dismissConfirmOverlay();
    this.container.destroy();
  }

  // ── Content Building ──────────────────────────────────────

  private buildContent(): void {
    // Clear existing content
    this.contentContainer.removeAll(true);

    // Load current stats
    const adapter = new BrowserStatsStorageAdapter();
    const stats = loadStats(adapter);

    let cursorY = 0;

    // ── Title ──
    const title = this.scene.add.text(PADDING, cursorY, 'Player Statistics', HEADING_STYLE);
    this.contentContainer.add(title);
    cursorY += 40;

    // ── Stats Display ──
    const winRate = stats.gamesPlayed > 0
      ? Math.round((stats.wins / stats.gamesPlayed) * 100)
      : 0;
    const lastPlayedDisplay = stats.lastPlayedAt
      ? new Date(stats.lastPlayedAt).toLocaleDateString(undefined, {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        })
      : 'Never';

    const statRows: Array<{ label: string; value: string }> = [
      { label: 'Games Played', value: String(stats.gamesPlayed) },
      { label: 'Wins', value: String(stats.wins) },
      { label: 'Win Rate', value: `${winRate}%` },
      { label: 'Best Score', value: String(stats.bestScore) },
      { label: 'Last Played', value: lastPlayedDisplay },
    ];

    for (const row of statRows) {
      const label = this.scene.add.text(PADDING, cursorY, row.label, STAT_LABEL_STYLE);
      this.contentContainer.add(label);

      const value = this.scene.add.text(PANEL_WIDTH - PADDING, cursorY, row.value, STAT_VALUE_STYLE);
      value.setOrigin(1, 0);
      this.contentContainer.add(value);

      cursorY += 28;
    }

    // ── Separator ──
    cursorY += 8;
    const separator = this.scene.add.graphics();
    separator.lineStyle(1, 0x444466, 0.6);
    separator.lineBetween(PADDING, cursorY, PANEL_WIDTH - PADDING, cursorY);
    this.contentContainer.add(separator);
    cursorY += 20;

    // ── Reset All Progress ──
    const resetLabel = this.scene.add.text(
      PADDING, cursorY,
      'Reset All Progress',
      { fontSize: '14px', color: RESET_BUTTON_COLOR, fontFamily: FONT_FAMILY, fontStyle: 'bold' },
    ).setInteractive({ useHandCursor: true });
    this.contentContainer.add(resetLabel);

    resetLabel.on('pointerover', () => resetLabel.setColor(RESET_BUTTON_HOVER_COLOR));
    resetLabel.on('pointerout', () => resetLabel.setColor(RESET_BUTTON_COLOR));
    resetLabel.on('pointerdown', () => this.showResetConfirm());

    const resetHint = this.scene.add.text(
      PADDING, cursorY + 22,
      'Erases stats, tier unlocks, and campaign progress.',
      { fontSize: '12px', color: '#776655', fontFamily: FONT_FAMILY },
    );
    this.contentContainer.add(resetHint);

    cursorY += 50;

    // ── Campaign Stats Preview ──
    if ((this.scene as any).campaign) {
      const campaign = (this.scene as any).campaign;
      cursorY += 8;
      const campaignTitle = this.scene.add.text(
        PADDING, cursorY,
        'Campaign Progress',
        { fontSize: '14px', color: '#ddbb88', fontFamily: FONT_FAMILY, fontStyle: 'bold' },
      );
      this.contentContainer.add(campaignTitle);
      cursorY += 24;

      const campaignRows: Array<{ label: string; value: string }> = [
        { label: 'Tier Progress', value: `${campaign.unlockedTiers?.length ?? 0} unlocked` },
        { label: 'Max Score', value: String(campaign.highestScore ?? 0) },
        { label: 'Best Reputation', value: String(campaign.persistentReputation ?? 0) },
        { label: 'Total Runs', value: String(campaign.totalRuns ?? 0) },
      ];

      for (const row of campaignRows) {
        const label = this.scene.add.text(PADDING, cursorY, row.label, STAT_LABEL_STYLE);
        this.contentContainer.add(label);

        const value = this.scene.add.text(PANEL_WIDTH - PADDING, cursorY, row.value, STAT_VALUE_STYLE);
        value.setOrigin(1, 0);
        this.contentContainer.add(value);

        cursorY += 26;
      }
    }
  }

  // ── Input Blocker ─────────────────────────────────────────

  private createInputBlocker(): void {
    if (this.inputBlocker) return;
    const canvasWidth = this.scene.scale.width;
    const canvasHeight = this.scene.scale.height;

    this.inputBlocker = this.scene.add.rectangle(
      canvasWidth / 2,
      canvasHeight / 2,
      canvasWidth,
      canvasHeight,
      0x000000,
      0,
    );
    this.inputBlocker.setDepth(DEPTH_INPUT_BLOCKER);
    this.inputBlocker.setInteractive();

    // When the input blocker is clicked outside the panel, close the overlay
    this.inputBlocker.on('pointerdown', () => {
      this.close();
    });

    // Parent input blocker into HUD container after the panel
    try {
      const hudRoot: any = (this.scene as any).hudContainer ?? null;
      if (hudRoot && typeof hudRoot.add === 'function') {
        try { hudRoot.add(this.inputBlocker); } catch (_) { /* ignore */ }
      }
    } catch (_) { /* ignore */ }
  }

  private removeInputBlocker(): void {
    if (!this.inputBlocker) return;
    this.inputBlocker.destroy();
    this.inputBlocker = null;
  }

  // ── Reset Confirmation ────────────────────────────────────

  private showResetConfirm(): void {
    if (this.confirmContainer) return;

    const canvasWidth = this.scene.scale.width;
    const canvasHeight = this.scene.scale.height;

    this.confirmContainer = this.scene.add.container(0, 0);
    this.confirmContainer.setDepth(DEPTH_CONFIRM_OVERLAY);

    // Full-screen background blocker
    const blocker = this.scene.add.rectangle(
      canvasWidth / 2,
      canvasHeight / 2,
      canvasWidth,
      canvasHeight,
      0x000000,
      0.6,
    );
    blocker.setInteractive();
    this.confirmContainer.add(blocker);

    // Confirmation box
    const boxW = 360;
    const boxH = 200;
    const boxY = canvasHeight / 2 - boxH / 2;

    const box = this.scene.add.rectangle(
      canvasWidth / 2,
      canvasHeight / 2,
      boxW,
      boxH,
      0x222244,
      0.95,
    );
    this.confirmContainer.add(box);

    // Warning title
    const warningTitle = this.scene.add.text(
      canvasWidth / 2,
      boxY + 30,
      'Reset All Progress?',
      CONFIRM_TITLE_STYLE,
    ).setOrigin(0.5, 0);
    this.confirmContainer.add(warningTitle);

    // Warning body
    const warningBody = this.scene.add.text(
      canvasWidth / 2,
      boxY + 65,
      'This will erase all progress including\nstatistics, campaign tier unlocks,\nmilestone history, and persistent reputation.\n\nThis action cannot be undone.',
      BODY_STYLE,
    ).setOrigin(0.5, 0).setAlign('center');
    this.confirmContainer.add(warningBody);

    // Cancel button
    const cancelBtn = createOverlayButton(
      this.scene,
      canvasWidth / 2 - 90,
      boxY + boxH - 40,
      '[ Cancel ]',
      DEPTH_CONFIRM_OVERLAY + 1,
      { color: '#aaaacc', hoverColor: '#ffffff' },
    );
    this.confirmContainer.add(cancelBtn);

    cancelBtn.on('pointerdown', () => this.dismissConfirmOverlay());

    // Confirm button (dangerous action)
    const confirmBtn = createOverlayButton(
      this.scene,
      canvasWidth / 2 + 90,
      boxY + boxH - 40,
      '[ Reset All ]',
      DEPTH_CONFIRM_OVERLAY + 1,
      { color: RESET_BUTTON_COLOR, hoverColor: RESET_BUTTON_HOVER_COLOR },
    );
    this.confirmContainer.add(confirmBtn);

    confirmBtn.on('pointerdown', async () => {
      try {
        const adapter = new BrowserStatsStorageAdapter();
        const saveStore = (this.scene as any).saveStore;
        await resetAllProgress(adapter, saveStore);
        // Reload campaign and refresh
        if (saveStore && (this.scene as any).loadCampaignAndSetup) {
          (this.scene as any).loadCampaignAndSetup();
        }
        // Refresh this panel's content
        this.dismissConfirmOverlay();
        this.buildContent();
      } catch {
        // Silently ignore reset failures
      }
    });

    // Parent into HUD container
    try {
      const hudRoot: any = (this.scene as any).hudContainer ?? null;
      if (hudRoot && typeof hudRoot.add === 'function') {
        try { hudRoot.add(this.confirmContainer); } catch (_) { /* ignore */ }
      }
    } catch (_) { /* ignore */ }
  }

  private dismissConfirmOverlay(): void {
    if (!this.confirmContainer) return;
    this.confirmContainer.destroy();
    this.confirmContainer = null;
  }

  // ── Stats Button Creation ─────────────────────────────────

  private createStatsButton(): void {
    const s = this.scene;
    // Position: lower-left corner to avoid overlap with the Settings button
    // (which is in the upper-right). Uses the same margin + radius formula as
    // the HelpButton/SettingsButton default positioning.
    const radius = 16;
    const x = MARGIN + radius;
    const y = s.scale.height - MARGIN - radius;
    this.statsButton = new StatsButton(s, this, x, y);
  }

  /** Set whether the overlay is enabled (responds to button toggles). */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled && this._isOpen) {
      this.close();
    }
  }
}
