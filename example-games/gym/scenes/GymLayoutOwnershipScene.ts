/**
 * GymLayoutOwnershipScene -- Demonstrates the Layout Ownership runtime.
 *
 * This scene registers Phaser GameObjects to different ownership groups
 * (shell, scene, shared, ungrouped) and toggles visibility based on the
 * active layout mode (shell-only, scene-only, composed). It also shows
 * diagnostic warnings for ungrouped targets and demonstrates dynamic
 * group rule updates.
 *
 * Controls:
 *  - [ Mode: Shell ] / [ Scene ] / [ Composed ] – switch layout modes
 *  - [ Shell Chrome ] / [ Scene Chrome ] / [ Shared Chrome ] – toggle individual group rules
 *  - [ + Ungrouped ] – register an ungrouped target (triggers a diagnostic)
 *  - [ – Ungrouped ] – remove the last ungrouped target
 *  - [ Clear ] – unregister all targets
 *
 * Visual feedback:
 *  - Registered objects change visible/hidden state automatically.
 *  - A live status line shows which groups are currently active.
 *  - Unregistered (hidden) objects show a dim overlay label.
 *
 * @module example-games/gym/scenes/GymLayoutOwnershipScene
 */

import Phaser from 'phaser';
import { GymSceneBase } from './GymSceneBase';
import { GYM_LAYOUT_OWNERSHIP_KEY } from '../GymRegistry';
import {
  VisibilityOwnershipController,
  type VisibilityMode,
  type VisibilityTarget,
  type VisibilityOwnershipIssue,
} from '../../../src/core-engine/VisibilityOwnership';

// ── Layout constants ───────────────────────────────────────

const CARD_W = 260;
const CARD_H = 60;
const CARD_GAP = 12;
const GRID_X = 20;
const GRID_Y = 160;
const CONTROLS_Y = 130;
const STATUS_Y = 640;
const MODE_COLOR_SHELL = '#ff8866';
const MODE_COLOR_SCENE = '#88bbff';
const MODE_COLOR_COMPOSED = '#88dd88';
const BG_COLOR = '#0a1420';
const CARD_STROKE = 0x4488aa;

// ── Scene ───────────────────────────────────────────────────

interface ModeButton {
  text: Phaser.GameObjects.Text;
  mode: VisibilityMode;
}

interface GroupToggle {
  label: Phaser.GameObjects.Text;
  groupName: string;
  active: boolean;
}

export class GymLayoutOwnershipScene extends GymSceneBase {
  private controller!: VisibilityOwnershipController<VisibilityTarget>;
  private registeredTargets: Phaser.GameObjects.Container[] = [];
  private modeButtons: ModeButton[] = [];
  private groupToggles: GroupToggle[] = [];
  private statusText!: Phaser.GameObjects.Text;
  private issues: VisibilityOwnershipIssue[] = [];
  private issueList: Phaser.GameObjects.Text[] = [];

  constructor() {
    super({ key: GYM_LAYOUT_OWNERSHIP_KEY });
  }

  create(): void {
    this.cameras.main.setBackgroundColor(BG_COLOR);
    this.initHeader('Layout Ownership Runtime');
    this.addDivider();
    this.initReducedMotion();

    this.initHelp([
      {
        heading: 'Features',
        body: 'Demonstrates the VisibilityOwnershipController runtime for managing which UI elements are visible based on the active layout mode. Objects are registered to ownership groups (shell, scene, shared, ungrouped), and their visibility automatically changes when the mode switches between shell-only, scene-only, and composed. Diagnostic warnings are emitted for unregistered or ungrouped targets. In a real card game, this controls whether shell chrome (menu bar, help button), scene content (cards, board), or both are visible depending on the game state.'
      },
      {
        heading: 'Controls',
        body: '[ Mode: Shell ]: Switch to shell-only mode — only objects in the "shell" and "shared" groups are visible. Scene-specific objects hide.\n[ Mode: Scene ]: Switch to scene-only mode — only "scene" and "shared" objects are visible. Shell chrome hides.\n[ Mode: Composed ]: Both shell and scene objects are visible simultaneously.\n[ Shell Chrome ] / [ Scene Chrome ] / [ Shared Chrome ]: Toggle individual group rules ON/OFF, dynamically adding or removing visibility rules for that group.\n[ + Ungrouped ]: Register a new unregistered object (triggers a diagnostic warning for objects without ownership groups).\n[ - Ungrouped ]: Remove the last unregistered object.\n[ Clear All ]: Destroy all demo objects and reset the controller.'
      },
      {
        heading: 'Usage Example',
        body: 'A card game has shell chrome (score bar, menu button, settings icon) that should always be visible during gameplay. When the player opens a modal (e.g., game-over summary), the shell chrome might remain visible while scene-specific cards dim. Using VisibilityOwnershipController, the game switches between "scene-only" mode (showing only cards and board) and "composed" mode (showing both shell chrome and scene), with the controller automatically toggling visibility for all registered objects.'
      },
      {
        heading: 'Test Plan',
        body: '1. Press [ Mode: Scene ] → shell objects (Shell Title, Shell Menu) hide; scene objects remain visible\n2. Press [ Mode: Shell ] → shell objects reappear; scene objects hide\n3. Press [ Mode: Composed ] → both shell and scene objects visible\n4. Press [ Shell Chrome ] → shell group toggles OFF, shell objects hide in current mode\n5. Press [ Shell Chrome ] again → shell group toggles ON, shell objects reappear\n6. Press [ + Ungrouped ] three times → three ungrouped cards appear, diagnostic warnings show\n7. Press [ - Ungrouped ] twice → two ungrouped cards removed\n8. Press [ Clear All ] → all demo objects destroyed, controller reset\n9. Verify that switching modes never leaves orphan objects visible'
      }
    ]);

    this.createController();
    this.createDemoObjects();
    this.createControls();
    this.syncAllVisibility();

    this.events.once('shutdown', () => this.cleanup());
  }

  // ── Controller setup ─────────────────────────────────────

  private createController(): void {
    this.controller = new VisibilityOwnershipController<VisibilityTarget>({
      groupRules: {
        shell: {
          'shell-only': true,
          'composed': true,
        },
        scene: {
          'scene-only': true,
          'composed': true,
        },
        shared: {
          'shell-only': true,
          'scene-only': true,
          'composed': true,
        },
        ungrouped: {
          'shell-only': false,
          'scene-only': false,
          'composed': false,
        },
      },
      defaultGroupName: 'ungrouped',
      reportIssue: (issue: VisibilityOwnershipIssue) => this.issues.push(issue),
    });
  }

  // ── Demo objects ─────────────────────────────────────────

  private createDemoObjects(): void {
    const objects: Array<{
      label: string;
      group: string;
      x: number;
      y: number;
    }> = [
      { label: 'Shell Title', group: 'shell', x: GRID_X, y: GRID_Y },
      { label: 'Shell Menu', group: 'shell', x: GRID_X + CARD_W + CARD_GAP, y: GRID_Y },
      { label: 'Scene Card 1', group: 'scene', x: GRID_X, y: GRID_Y + CARD_H + CARD_GAP },
      { label: 'Scene Card 2', group: 'scene', x: GRID_X + CARD_W + CARD_GAP, y: GRID_Y + CARD_H + CARD_GAP },
      { label: 'Shared Action', group: 'shared', x: GRID_X, y: GRID_Y + 2 * (CARD_H + CARD_GAP) },
      { label: 'Shared Help', group: 'shared', x: GRID_X + CARD_W + CARD_GAP, y: GRID_Y + 2 * (CARD_H + CARD_GAP) },
    ];

    for (const obj of objects) {
      const container = this.createOwnedCard(obj.label, obj.x, obj.y);
      this.controller.register(container, obj.group);
      this.registeredTargets.push(container);
    }
  }

  private createOwnedCard(
    label: string,
    x: number,
    y: number,
  ): Phaser.GameObjects.Container {
    const container = this.add.container(x, y);

    // Card background
    const bg = this.add
      .rectangle(0, 0, CARD_W, CARD_H, 0x1a3a4a, 0.8)
      .setStrokeStyle(2, CARD_STROKE, 1);
    container.add(bg);

    // Label
    const text = this.add
      .text(CARD_W / 2, CARD_H / 2, label, {
        fontSize: '14px',
        color: '#ffffff',
        fontFamily: 'monospace',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    container.add(text);

    container.setVisible(true);

    return container;
  }

  // ── Controls ─────────────────────────────────────────────

  private createControls(): void {
    // Mode buttons row
    const modes: Array<{ mode: VisibilityMode; label: string }> = [
      { mode: 'shell-only', label: '[ Mode: Shell ]' },
      { mode: 'scene-only', label: '[ Mode: Scene ]' },
      { mode: 'composed', label: '[ Mode: Composed ]' },
    ];

    const modeStartX = 20;
    for (let i = 0; i < modes.length; i++) {
      const btn = this.createModeButton(
        modeStartX + i * (CARD_W + CARD_GAP),
        CONTROLS_Y,
        modes[i].mode,
        modes[i].label,
      );
      this.modeButtons.push(btn);
    }

    // Group toggle buttons
    const groups: Array<{ group: string; label: string }> = [
      { group: 'shell', label: '[ Shell Chrome ]' },
      { group: 'scene', label: '[ Scene Chrome ]' },
      { group: 'shared', label: '[ Shared Chrome ]' },
    ];

    const groupStartX = 20;
    for (let i = 0; i < groups.length; i++) {
      const toggle = this.createGroupToggle(
        groupStartX + i * (CARD_W + CARD_GAP),
        CONTROLS_Y + 30,
        groups[i].group,
        groups[i].label,
      );
      this.groupToggles.push(toggle);
    }

    // Ungrouped controls
    const ungroupedBtns = [
      { label: '[ + Ungrouped ]', action: () => this.addUngrouped() },
      { label: '[ – Ungrouped ]', action: () => this.removeUngrouped() },
    ];

    for (const { label, action } of ungroupedBtns) {
      this.createClickableButton(
        groupStartX + ungroupedBtns.indexOf({ label, action }) * (130 + 8),
        CONTROLS_Y + 60,
        label,
        action,
      );
    }

    // Clear button
    this.createClickableButton(
      300,
      CONTROLS_Y + 60,
      '[ Clear All ]',
      () => {
        this.registeredTargets.forEach((c) => {
          try { c.destroy(); } catch (_) { /* ignore */ }
        });
        this.registeredTargets = [];
        this.issues = [];
        this.issueList.forEach((t) => t.destroy());
        this.issueList = [];
        this.controller.clear();
      },
    );

    // Status line
    this.statusText = this.add
      .text(20, STATUS_Y, 'Mode: composed | Active groups: shell, scene, shared', {
        fontSize: '12px',
        color: '#aaccdd',
        fontFamily: 'monospace',
      })
      .setDepth(50);

    // Issue area (below status)
    for (let i = 0; i < 3; i++) {
      const issueText = this.add
        .text(20, STATUS_Y + 18 + i * 14, '', {
          fontSize: '11px',
          color: '#ffaa44',
          fontFamily: 'monospace',
        })
        .setDepth(50);
      this.issueList.push(issueText);
    }
  }

  private createModeButton(
    x: number,
    y: number,
    mode: VisibilityMode,
    label: string,
  ): ModeButton {
    const color =
      mode === 'shell-only'
        ? MODE_COLOR_SHELL
        : mode === 'scene-only'
          ? MODE_COLOR_SCENE
          : MODE_COLOR_COMPOSED;

    const text = this.createClickableButton(x, y, label, () => {
      this.controller.setMode(mode);
      this.updateModeButtons();
      this.updateStatus();
      this.updateIssues();
    }, { color });

    return { text, mode };
  }

  private createGroupToggle(
    x: number,
    y: number,
    groupName: string,
    label: string,
  ): GroupToggle {
    // Start active
    const text = this.createClickableButton(
      x,
      y,
      `[ ${label.slice(1, label.length - 1)}: ON ]`,
      () => {
        this.toggleGroup(groupName);
      },
      { color: '#88dd88' },
    );

    return { label: text, groupName, active: true };
  }

  private createClickableButton(
    x: number,
    y: number,
    text: string,
    callback: () => void,
    opts: { color?: string; hoverColor?: string } = {},
  ): Phaser.GameObjects.Text {
    const color = opts.color ?? '#88ff88';
    const hoverColor = opts.hoverColor ?? '#bbffbb';

    const btn = this.add
      .text(x, y, text, {
        fontSize: '12px',
        color,
        fontFamily: 'monospace',
      })
      .setInteractive({ useHandCursor: true })
      .setDepth(55);

    btn.on('pointerdown', callback);
    btn.on('pointerover', () => btn.setColor(hoverColor));
    btn.on('pointerout', () => btn.setColor(color));

    return btn;
  }

  // ── Interaction logic ────────────────────────────────────

  private toggleGroup(groupName: string): void {
    const toggle = this.groupToggles.find((t) => t.groupName === groupName);
    if (!toggle) return;

    toggle.active = !toggle.active;
    toggle.label.setText(
      `[ ${groupName}: ${toggle.active ? 'ON' : 'OFF'} ]`,
    );
    toggle.label.setColor(toggle.active ? '#88dd88' : '#ff6644');

    const newRules: Record<string, boolean> = {};

    if (toggle.active) {
      // Restore default rules for this group
      newRules['shell-only'] = groupName !== 'scene';
      newRules['scene-only'] = groupName !== 'shell';
      newRules['composed'] = true;
    }

    this.controller.setGroupRules(groupName, newRules);
    this.syncAllVisibility();
    this.updateStatus();
  }

  private addUngrouped(): void {
    const idx = this.registeredTargets.length + 1;
    const container = this.createOwnedCard(`Ungrouped #${idx}`, 20 + idx * (CARD_W + 8), 500);
    this.controller.register(container); // no group → ungrouped
    this.registeredTargets.push(container);
    this.syncAllVisibility();
    this.updateIssues();
  }

  private removeUngrouped(): void {
    if (this.registeredTargets.length === 0) return;

    // Remove the last ungrouped target
    const removed = this.registeredTargets.pop();
    if (removed) {
      try { removed.destroy(); } catch (_) { /* ignore */ }
      this.syncAllVisibility();
      this.updateIssues();
    }
  }

  private cleanup(): void {
    this.issues = [];
    this.issueList.forEach((t) => t.destroy());
    this.issueList = [];
    this.controller.clear();
  }

  // ── Visibility sync ──────────────────────────────────────

  private syncAllVisibility(): void {
    for (const container of this.registeredTargets) {
      const isVisible = container.visible;
      container.setVisible(isVisible);
    }
  }

  // ── UI updates ───────────────────────────────────────────

  private updateModeButtons(): void {
    const currentMode = this.controller.getMode();
    for (const mb of this.modeButtons) {
      const isActive = mb.mode === currentMode;
      const color =
        mb.mode === 'shell-only'
          ? isActive ? MODE_COLOR_SHELL : '#665544'
          : mb.mode === 'scene-only'
            ? isActive ? MODE_COLOR_SCENE : '#445566'
            : isActive ? MODE_COLOR_COMPOSED : '#446644';
      mb.text.setColor(color);
      mb.text.setText(
        `${isActive ? '▶ ' : ''}${mb.mode === 'shell-only' ? 'Shell' : mb.mode === 'scene-only' ? 'Scene' : 'Composed'}`,
      );
    }
  }

  private updateStatus(): void {
    const currentMode = this.controller.getMode();
    const activeGroups = this.groupToggles
      .filter((t) => t.active)
      .map((t) => t.groupName)
      .join(', ');
    this.statusText.setText(
      `Mode: ${currentMode} | Active groups: ${activeGroups || '(none)'}`,
    );

    // Update mode button colors
    this.updateModeButtons();
  }

  private updateIssues(): void {
    // Only show the last few issues to avoid clutter
    const recentIssues = this.issues.slice(-this.issueList.length);
    for (let i = 0; i < this.issueList.length; i++) {
      const issue = recentIssues[i];
      if (issue) {
        this.issueList[i].setText(`⚠ ${issue.message}`);
        this.issueList[i].setColor('#ffaa44');
      } else {
        this.issueList[i].setText('');
      }
    }
  }
}
