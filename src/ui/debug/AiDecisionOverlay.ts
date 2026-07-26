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
import {
  createOverlayBackground,
  dismissOverlay,
} from '../Overlay';
import type { DebugToolsEntry } from './DebugToolsRegistry';
import { AiDecisionRecorder } from './AiDecisionRecorder';

// ── Constants ───────────────────────────────────────────────

const DEPTH_BASE = 200;
const DEPTH_BOX = 201;
const DEPTH_CONTENT = 202;

const BOX_WIDTH = Math.min(GAME_W - 80, 680);
const BOX_HEIGHT = Math.min(GAME_H - 80, 520);
const BOX_X = (GAME_W - BOX_WIDTH) / 2;
const BOX_Y = (GAME_H - BOX_HEIGHT) / 2;

const COLOR_BG = 0x1a1a2e;

// ── State ───────────────────────────────────────────────────

interface ViewerState {
  scene: Phaser.Scene;
  objects: Phaser.GameObjects.GameObject[];
  container: Phaser.GameObjects.Container | null;
}

let activeViewer: ViewerState | null = null;

// ── Rendering ───────────────────────────────────────────────

function renderDecisions(scene: Phaser.Scene, state: ViewerState): void {
  if (state.container) {
    state.container.destroy();
  }

  const contentX = BOX_X + 10;
  const contentY = BOX_Y + 100;
  const contentHeight = BOX_HEIGHT - 140;

  const container = scene.add.container(contentX, contentY);
  container.setDepth(DEPTH_CONTENT);
  state.objects.push(container);
  state.container = container;

  try {
    const hud = (scene as any).hudContainer;
    if (hud && typeof hud.add === 'function') {
      hud.add(container);
    }
  } catch { /* ignore */ }

  const recorder = AiDecisionRecorder.getInstance();
  const records = recorder.getRecords();

  if (records.length === 0) {
    const emptyText = scene.add.text(0, 10, '(no AI decisions recorded)', {
      fontSize: '13px',
      color: '#888888',
      fontFamily: 'Arial, sans-serif',
    });
    emptyText.setDepth(DEPTH_CONTENT);
    container.add(emptyText);
    return;
  }

  // Display all records (up to what fits)
  const maxLines = Math.floor(contentHeight / 18);
  const visible = records.slice(-maxLines);

  visible.forEach((record, i) => {
    const y = i * 18;
    const breakdown = record.scoringBreakdown
      ? ` | score: ${JSON.stringify(record.scoringBreakdown)}`
      : '';
    const displayText = `T${record.turnNumber} [${record.strategyName}] ${record.chosenAction}${breakdown}`;

    const textObj = scene.add.text(0, y, displayText, {
      fontSize: '11px',
      color: '#cccccc',
      fontFamily: 'Courier New, monospace',
    });
    textObj.setDepth(DEPTH_CONTENT);
    container.add(textObj);
  });
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
      if (activeViewer) {
        dismissOverlay(activeViewer.objects);
        activeViewer = null;
      }

      const state: ViewerState = {
        scene,
        objects: [],
        container: null,
      };

      // ── Create overlay background and box ──────────────────
      const overlay = createOverlayBackground(
        scene,
        { depth: DEPTH_BASE, alpha: 0.6, width: GAME_W, height: GAME_H },
        { width: BOX_WIDTH, height: BOX_HEIGHT, color: COLOR_BG, alpha: 1.0, depth: DEPTH_BOX },
      );
      state.objects.push(...overlay.objects);

      try {
        const hud = (scene as any).hudContainer;
        if (hud && typeof hud.add === 'function') {
          for (const obj of overlay.objects) {
            hud.add(obj);
          }
        }
      } catch { /* ignore */ }

      // ── Title ──────────────────────────────────────────────
      const title = scene.add.text(BOX_X + 10, BOX_Y + 8, 'AI Decisions', {
        fontSize: '18px',
        color: '#f0c040',
        fontFamily: 'Arial, sans-serif',
        fontStyle: 'bold',
      });
      title.setDepth(DEPTH_CONTENT);
      state.objects.push(title);
      try {
        const hud = (scene as any).hudContainer;
        if (hud && typeof hud.add === 'function') hud.add(title);
      } catch { /* ignore */ }

      // ── Close button ───────────────────────────────────────
      const closeBtn = scene.add.text(BOX_X + BOX_WIDTH - 30, BOX_Y + 6, '✕', {
        fontSize: '22px',
        color: '#aaaaaa',
        fontFamily: 'Arial, sans-serif',
      });
      closeBtn.setDepth(DEPTH_CONTENT);
      closeBtn.setInteractive({ useHandCursor: true });
      closeBtn.on('pointerdown', () => {
        dismissOverlay(state.objects);
        activeViewer = null;
      });
      closeBtn.on('pointerover', () => closeBtn.setColor('#ffffff'));
      closeBtn.on('pointerout', () => closeBtn.setColor('#aaaaaa'));
      state.objects.push(closeBtn);
      try {
        const hud = (scene as any).hudContainer;
        if (hud && typeof hud.add === 'function') hud.add(closeBtn);
      } catch { /* ignore */ }

      // ── Control buttons ────────────────────────────────────
      const btnY = BOX_Y + 65;
      const btnStyle = {
        fontSize: '13px',
        color: '#88ccff',
        fontFamily: 'Arial, sans-serif',
      } as const;

      const recorder = AiDecisionRecorder.getInstance();

      // Clear button
      const clearBtn = scene.add.text(BOX_X + 10, btnY, '[ Clear ]', btnStyle);
      clearBtn.setDepth(DEPTH_CONTENT);
      clearBtn.setInteractive({ useHandCursor: true });
      clearBtn.on('pointerdown', () => {
        recorder.clear();
        renderDecisions(scene, state);
      });
      clearBtn.on('pointerover', () => clearBtn.setColor('#aaddff'));
      clearBtn.on('pointerout', () => clearBtn.setColor('#88ccff'));
      state.objects.push(clearBtn);
      try {
        const hud = (scene as any).hudContainer;
        if (hud && typeof hud.add === 'function') hud.add(clearBtn);
      } catch { /* ignore */ }

      // Pause/Resume button
      const pauseBtn = scene.add.text(BOX_X + 80, btnY, '[ Pause ]', btnStyle);
      pauseBtn.setDepth(DEPTH_CONTENT);
      pauseBtn.setInteractive({ useHandCursor: true });
      pauseBtn.on('pointerdown', () => {
        recorder.paused = !recorder.paused;
        pauseBtn.setText(recorder.paused ? '[ Resume ]' : '[ Pause ]');
      });
      pauseBtn.on('pointerover', () => pauseBtn.setColor('#aaddff'));
      pauseBtn.on('pointerout', () => pauseBtn.setColor('#88ccff'));
      state.objects.push(pauseBtn);
      try {
        const hud = (scene as any).hudContainer;
        if (hud && typeof hud.add === 'function') hud.add(pauseBtn);
      } catch { /* ignore */ }

      // Record count
      const countText = scene.add.text(BOX_X + BOX_WIDTH - 70, btnY, `${recorder.getRecords().length} records`, {
        fontSize: '12px',
        color: '#aaaaaa',
        fontFamily: 'Arial, sans-serif',
      });
      countText.setDepth(DEPTH_CONTENT);
      state.objects.push(countText);
      try {
        const hud = (scene as any).hudContainer;
        if (hud && typeof hud.add === 'function') hud.add(countText);
      } catch { /* ignore */ }

      // ── Render initial content ─────────────────────────────
      renderDecisions(scene, state);

      activeViewer = state;
    },
  };
}
