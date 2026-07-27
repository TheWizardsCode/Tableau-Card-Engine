/**
 * AiDecisionOverlay — Debug tool that shows per-turn AI decision records.
 *
 * Reads from the global {@link AiDecisionRecorder} singleton, which is
 * populated by game scenes at AI decision integration points.
 *
 * @module @ui/debug/AiDecisionOverlay
 */

import type Phaser from 'phaser';
import { GAME_W, GAME_H } from '../constants';
import { createDialog } from '../Dialog';
import type { DialogHandle } from '../Dialog';
import type { DebugToolsEntry } from './DebugToolsRegistry';
import { AiDecisionRecorder } from './AiDecisionRecorder';

// ── Constants ───────────────────────────────────────────────

const BOX_WIDTH = Math.min(GAME_W - 80, 680);
const BOX_HEIGHT = Math.min(GAME_H - 80, 520);
const HEADER_HEIGHT = 90;

// ── State ───────────────────────────────────────────────────

let activeDialog: DialogHandle | null = null;

// ── Rendering ───────────────────────────────────────────────

function renderDecisions(scene: Phaser.Scene, dialog: DialogHandle): void {
  dialog.scrollContainer.removeAll(true);

  const recorder = AiDecisionRecorder.getInstance();
  const records = recorder.getRecords();

  if (records.length === 0) {
    const emptyText = scene.add.text(0, 10, '(no AI decisions recorded)', {
      fontSize: '13px',
      color: '#888888',
      fontFamily: 'Arial, sans-serif',
    });
    emptyText.setDepth(dialog.depthBase + 2);
    dialog.scrollContainer.add(emptyText);
    dialog.refresh(dialog.contentHeight + 1);
    return;
  }

  records.forEach((record, i) => {
    const y = i * 22;
    const breakdown = record.scoringBreakdown
      ? ` | score: ${JSON.stringify(record.scoringBreakdown)}`
      : '';
    const displayText = `T${record.turnNumber} [${record.strategyName}] ${record.chosenAction}${breakdown}`;

    const textObj = scene.add.text(0, y, displayText, {
      fontSize: '13px',
      color: '#cccccc',
      fontFamily: dialog.monoFont,
    });
    textObj.setDepth(dialog.depthBase + 2);
    dialog.scrollContainer.add(textObj);
  });

  const totalHeight = records.length * 22 + 20;
  dialog.refresh(totalHeight);
}

// ── Factory ─────────────────────────────────────────────────

/**
 * Create a debug tool entry for the AI Decision Viewer overlay.
 *
 * @returns A DebugToolsEntry that opens the AI decision viewer when activated.
 */
export function createAiDecisionViewerTool(): DebugToolsEntry {
  return {
    label: 'AI Decisions',
    description: 'Per-turn AI decision scoring breakdown',
    activate: (scene: Phaser.Scene) => {
      // Close existing viewer if open
      if (activeDialog) {
        activeDialog.close();
        activeDialog = null;
      }

      // ── Create the shared dialog ───────────────────────────
      const dialog = createDialog(scene, {
        title: 'AI Decisions',
        width: BOX_WIDTH,
        height: BOX_HEIGHT,
        headerHeight: HEADER_HEIGHT,
        boxColor: 0x1a1a2e,
        onClose: () => {
          activeDialog = null;
        },
      });
      activeDialog = dialog;

      // ── Control buttons ────────────────────────────────────
      const btnY = dialog.boxY + 65;
      const btnStyle = {
        fontSize: '13px',
        color: '#88ccff',
        fontFamily: 'Arial, sans-serif',
      } as const;

      const recorder = AiDecisionRecorder.getInstance();

      // Clear button
      const clearBtn = scene.add.text(dialog.boxX + 10, btnY, '[ Clear ]', btnStyle);
      clearBtn.setDepth(dialog.depthBase + 2);
      clearBtn.setInteractive({ useHandCursor: true });
      clearBtn.on('pointerdown', () => {
        recorder.clear();
        renderDecisions(scene, dialog);
      });
      clearBtn.on('pointerover', () => clearBtn.setColor('#aaddff'));
      clearBtn.on('pointerout', () => clearBtn.setColor('#88ccff'));
      dialog.objects.push(clearBtn);
      try {
        const hud = (scene as any).hudContainer;
        if (hud && typeof hud.add === 'function') hud.add(clearBtn);
      } catch { /* ignore */ }

      // Pause/Resume button
      const pauseBtn = scene.add.text(dialog.boxX + 80, btnY, '[ Pause ]', btnStyle);
      pauseBtn.setDepth(dialog.depthBase + 2);
      pauseBtn.setInteractive({ useHandCursor: true });
      pauseBtn.on('pointerdown', () => {
        recorder.paused = !recorder.paused;
        pauseBtn.setText(recorder.paused ? '[ Resume ]' : '[ Pause ]');
      });
      pauseBtn.on('pointerover', () => pauseBtn.setColor('#aaddff'));
      pauseBtn.on('pointerout', () => pauseBtn.setColor('#88ccff'));
      dialog.objects.push(pauseBtn);
      try {
        const hud = (scene as any).hudContainer;
        if (hud && typeof hud.add === 'function') hud.add(pauseBtn);
      } catch { /* ignore */ }

      // Record count
      const countText = scene.add.text(dialog.boxX + dialog.boxWidth - 70, btnY, `${recorder.getRecords().length} records`, {
        fontSize: '12px',
        color: '#aaaaaa',
        fontFamily: 'Arial, sans-serif',
      });
      countText.setDepth(dialog.depthBase + 2);
      dialog.objects.push(countText);
      try {
        const hud = (scene as any).hudContainer;
        if (hud && typeof hud.add === 'function') hud.add(countText);
      } catch { /* ignore */ }

      // ── Render initial content ─────────────────────────────
      renderDecisions(scene, dialog);
    },
  };
}
