/**
 * StaffApplicantCheatOverlay — Dev-mode debug tool that forces a staff
 * applicant to appear every day start, bypassing the RNG roll.
 *
 * Provides a simple toggle button inside an overlay dialog. When active,
 * `resolveStaffApplicant` triggers deterministically every day start.
 * Displays the current computed chance (e.g. "12%") and the toggle state
 * ([ON] / [OFF]).
 *
 * Respects existing constraints:
 * - Still requires at least one eligible business with a free employment slot.
 * - Suppressed when `state.suppressApplicant` is true (tutorial/headless),
 *   because `executeDayStart()` skips `resolveStaffApplicant()` entirely.
 *
 * @module @ui/debug/StaffApplicantCheatOverlay
 */

import type Phaser from 'phaser';
import type { DebugToolsEntry } from './DebugToolsRegistry';
import { createOverlayDialog, type OverlayDialogHandle } from '../Overlay';
import type { MainStreetState } from '../../../example-games/main-street/MainStreetState';
import { computeApplicantChance } from '../../../example-games/main-street/MainStreetEngine';

// ── State ───────────────────────────────────────────────────

let activeOverlay: OverlayDialogHandle | null = null;
let forcedEnabled = false;
let toggleButton: Phaser.GameObjects.Text | null = null;
let chanceLabel: Phaser.GameObjects.Text | null = null;

// ── Constants ───────────────────────────────────────────────

const BOX_WIDTH = 400;
const BOX_HEIGHT = 200;
const HEADER_HEIGHT = 50;

const COLOR_ON = '#ff6666';
const COLOR_OFF = '#88ccff';
const COLOR_HOVER = '#aaddff';

// ── Helpers ─────────────────────────────────────────────────

/** Reads the forced-applicant flag off the scene's Main Street state. */
function readForced(scene: Phaser.Scene): boolean {
  const mainStreetState: MainStreetState | undefined = (scene as any).state;
  return !!mainStreetState?.forcedStaffApplicant;
}

/** Re-renders the status label and toggle button from current state. */
function renderStatus(scene: Phaser.Scene): void {
  if (!toggleButton || !chanceLabel) return;

  const mainStreetState: MainStreetState | undefined = (scene as any).state;
  const chance = mainStreetState ? computeApplicantChance(mainStreetState) : 0;
  const status = forcedEnabled ? '[ON]' : '[OFF]';

  chanceLabel.setText(`Staff Application ${status} — ${chance}% chance`);
  chanceLabel.setColor(forcedEnabled ? COLOR_ON : '#dddddd');
  toggleButton.setColor(forcedEnabled ? COLOR_ON : COLOR_OFF);
}

// ── Overlay lifecycle ───────────────────────────────────────

function closeActiveOverlay(): void {
  if (activeOverlay) {
    activeOverlay.close();
    activeOverlay = null;
    toggleButton = null;
    chanceLabel = null;
    forcedEnabled = false;
  }
}

// ── Factory ─────────────────────────────────────────────────

/**
 * Create a debug tool entry for the Staff Application cheat toggle.
 * Label/description match AC requirements.
 */
export function createStaffApplicantCheatTool(): DebugToolsEntry {
  return {
    label: 'Staff Application',
    description: 'Force a staff applicant every turn (bypasses RNG)',
    activate: (scene: Phaser.Scene) => {
      closeActiveOverlay();
      forcedEnabled = readForced(scene);

      const overlay = createOverlayDialog(scene, {
        title: 'Staff Application Cheat',
        width: BOX_WIDTH,
        height: BOX_HEIGHT,
        headerHeight: HEADER_HEIGHT,
        boxColor: 0x1a1a2e,
        // Reset module-level refs only — `createOverlayDialog.close()`
        // already dismissed the objects. Calling `closeActiveOverlay()`
        // here would recurse into `overlay.close()` indefinitely.
        onClose: () => {
          activeOverlay = null;
          toggleButton = null;
          chanceLabel = null;
          forcedEnabled = false;
        },
      });
      activeOverlay = overlay;

      // ── Status label ─────────────────────────────────────
      chanceLabel = scene.add.text(
        overlay.boxX + overlay.boxWidth / 2,
        overlay.boxY + 80,
        '',
        {
          fontSize: '16px',
          color: '#dddddd',
          fontFamily: 'Arial, sans-serif',
          align: 'center',
        },
      );
      chanceLabel.setOrigin(0.5, 0);
      chanceLabel.setDepth(overlay.depthBase + 2);
      overlay.objects.push(chanceLabel);

      // ── Toggle button ────────────────────────────────────
      toggleButton = scene.add.text(
        overlay.boxX + overlay.boxWidth / 2,
        overlay.boxY + 120,
        '[  TOGGLE  ]',
        {
          fontSize: '14px',
          color: COLOR_OFF,
          fontFamily: 'Arial, sans-serif',
          backgroundColor: '#2a2a3e',
        },
      );
      toggleButton.setOrigin(0.5, 0.5);
      toggleButton.setDepth(overlay.depthBase + 2);
      toggleButton.setInteractive({ useHandCursor: true });
      toggleButton.on('pointerdown', () => {
        forcedEnabled = !forcedEnabled;
        const mainStreetState: MainStreetState | undefined = (scene as any).state;
        if (mainStreetState) mainStreetState.forcedStaffApplicant = forcedEnabled;
        renderStatus(scene);
      });
      toggleButton.on('pointerover', () => toggleButton!.setColor(COLOR_HOVER));
      toggleButton.on('pointerout', () => {
        toggleButton!.setColor(forcedEnabled ? COLOR_ON : COLOR_OFF);
      });
      overlay.objects.push(toggleButton);

      // Parent content into hudContainer for correct z-ordering.
      try {
        const hud: any = (scene as any).hudContainer;
        if (hud && typeof hud.add === 'function') {
          hud.add(chanceLabel);
          hud.add(toggleButton);
        }
      } catch { /* ignore */ }

      renderStatus(scene);
    },
  };
}
