/**
 * GameEventLogOverlay — Debug tool that shows a live feed of game events
 * emitted via the GameEventEmitter during gameplay.
 *
 * @module @ui/debug/GameEventLogOverlay
 */

import type Phaser from 'phaser';
import { GAME_W, GAME_H } from '../constants';
import {
  createOverlayDialog,
  type OverlayDialogHandle,
} from '../Overlay';
import type { DebugToolsEntry } from './DebugToolsRegistry';
import { formatEventLogEntry, type EventLogEntry } from './formatEventLog';
import { GlobalEventBuffer } from './GlobalEventBuffer';

// ── Constants ───────────────────────────────────────────────

const BOX_WIDTH = Math.min(GAME_W - 80, 680);
const BOX_HEIGHT = Math.min(GAME_H - 80, 500);
const HEADER_HEIGHT = 90;

/** Vertical gap between two event rows, in px. */
const ROW_GAP = 6;

/** Extra leading between the pretty-printed lines of one payload, in px. */
const LINE_SPACING = 2;

// ── State ───────────────────────────────────────────────────

interface EventLogState {
  entries: EventLogEntry[];
  paused: boolean;
}

let activeOverlay: OverlayDialogHandle | null = null;
let activeState: EventLogState | null = null;
let pollInterval: Phaser.Time.TimerEvent | null = null;

// ── Status text — inform user about buffer state ───────────

function getBufferStatus(): string {
  const buf = GlobalEventBuffer.getInstance();
  if (!buf.subscribed) {
    return 'No GameEventEmitter detected — __GAME_EVENTS__ not found';
  }
  const count = buf.getEntries().length;
  return count === 0
    ? 'Buffer active — no events received yet'
    : `Buffer active — ${count} events recorded`;
}

/** Hint appended to the status line: wide payload lines scroll horizontally. */
const HORIZONTAL_SCROLL_HINT = ' — scroll sideways for wide payloads';

// ── Overlay rendering ───────────────────────────────────────

/**
 * Render every buffered event into the dialog's scroll container.
 *
 * Layout: **one text object per event** (not per JSON line) holding the
 * one-line `timestamp [eventName]` header plus the pretty-printed payload
 * (`JSON.stringify(payload, null, 2)`). Objects are placed at a measured y
 * offset — the previous row's full rendered height plus {@link ROW_GAP} — so
 * the content height grows with each payload's line count while the object
 * count stays proportional to the event count.
 *
 * No `wordWrap` is configured on the rows: payload lines are never
 * soft-wrapped. The dialog is created with `enableHorizontalScroll: true`, so
 * lines wider than the content area stay on one line and are reached by
 * scrolling sideways.
 */
function renderLog(scene: Phaser.Scene, overlay: OverlayDialogHandle, state: EventLogState): void {
  overlay.scrollContainer.removeAll(true);

  const visible = state.entries.slice();

  let y = 0;
  let totalWidth = 0;

  visible.forEach((entry) => {
    const textObj = scene.add.text(0, y, formatEventLogEntry(entry), {
      fontSize: '13px',
      color: '#cccccc',
      fontFamily: overlay.monoFont,
      lineSpacing: LINE_SPACING,
    });
    textObj.setDepth(overlay.depthBase + 2);
    overlay.scrollContainer.add(textObj);

    totalWidth = Math.max(totalWidth, textObj.width);
    y += textObj.height + ROW_GAP;
  });

  if (state.entries.length === 0) {
    const emptyText = scene.add.text(0, 10, '(no events yet — waiting for game to emit events)', {
      fontSize: '13px',
      color: '#888888',
      fontFamily: 'Arial, sans-serif',
    });
    emptyText.setDepth(overlay.depthBase + 2);
    overlay.scrollContainer.add(emptyText);
    totalWidth = Math.max(totalWidth, emptyText.width);
    y = 10 + emptyText.height + ROW_GAP;
  }

  // The dialog clamps vertical scrolling to this height and, because it opts
  // into horizontal scrolling, clamps sideways scrolling to `totalWidth`.
  const totalHeight = Math.max(y, overlay.contentHeight + 1);
  overlay.refresh(totalHeight, totalWidth);
}

// ── Refresh entries from buffer ────────────────────────────

function refreshFromBuffer(scene: Phaser.Scene, overlay: OverlayDialogHandle, state: EventLogState): void {
  const buf = GlobalEventBuffer.getInstance();
  state.entries = buf.getEntries().slice();
  renderLog(scene, overlay, state);
}

// ── Factory ─────────────────────────────────────────────────

/**
 * Create a debug tool entry for the Game Event Log overlay.
 *
 * @returns A DebugToolsEntry that opens the event log when activated.
 */
export function createGameEventLogTool(): DebugToolsEntry {
  return {
    label: 'Game Events',
    description: 'Live feed of game events with pause/clear',
    activate: (scene: Phaser.Scene) => {
      // Close existing if open
      if (activeOverlay) {
        if (pollInterval) {
          pollInterval.destroy();
          pollInterval = null;
        }
        activeOverlay.close();
        activeOverlay = null;
        activeState = null;
      }

      const state: EventLogState = {
        entries: [],
        paused: false,
      };
      activeState = state;

      // ── Create the scrollable overlay ──────────────────────
      const overlay = createOverlayDialog(scene, {
        title: 'Game Events',
        width: BOX_WIDTH,
        height: BOX_HEIGHT,
        headerHeight: HEADER_HEIGHT,
        boxColor: 0x1a1a2e,
        // Opt-in horizontal scrolling: pretty-printed payload lines are never
        // wrapped, so they must be reachable by scrolling sideways.
        enableHorizontalScroll: true,
        onClose: () => {
          if (pollInterval) {
            pollInterval.destroy();
            pollInterval = null;
          }
          activeOverlay = null;
          activeState = null;
        },
      });
      activeOverlay = overlay;

      // ── Status indicator ───────────────────────────────────
      const statusText = scene.add.text(overlay.boxX + 10, overlay.boxY + 38, 'Status: Waiting for events...', {
        fontSize: '12px',
        color: '#88ccff',
        fontFamily: 'Arial, sans-serif',
      });
      statusText.setDepth(overlay.depthBase + 2);
      overlay.objects.push(statusText);
      try {
        const hud = (scene as any).hudContainer;
        if (hud && typeof hud.add === 'function') hud.add(statusText);
      } catch { /* ignore */ }

      // ── Control buttons ────────────────────────────────────
      const btnY = overlay.boxY + 65;
      const btnStyle = {
        fontSize: '13px',
        color: '#88ccff',
        fontFamily: 'Arial, sans-serif',
      } as const;

      // Clear button
      const clearBtn = scene.add.text(overlay.boxX + 10, btnY, '[ Clear ]', btnStyle);
      clearBtn.setDepth(overlay.depthBase + 2);
      clearBtn.setInteractive({ useHandCursor: true });
      clearBtn.on('pointerdown', () => {
        state.entries = [];
        renderLog(scene, overlay, state);
      });
      clearBtn.on('pointerover', () => clearBtn.setColor('#aaddff'));
      clearBtn.on('pointerout', () => clearBtn.setColor('#88ccff'));
      overlay.objects.push(clearBtn);
      try {
        const hud = (scene as any).hudContainer;
        if (hud && typeof hud.add === 'function') hud.add(clearBtn);
      } catch { /* ignore */ }

      // Pause/Resume button
      const pauseBtn = scene.add.text(overlay.boxX + 80, btnY, '[ Pause ]', btnStyle);
      pauseBtn.setDepth(overlay.depthBase + 2);
      pauseBtn.setInteractive({ useHandCursor: true });
      pauseBtn.on('pointerdown', () => {
        state.paused = !state.paused;
        pauseBtn.setText(state.paused ? '[ Resume ]' : '[ Pause ]');
        statusText.setText(state.paused ? 'Status: PAUSED' : 'Status: Recording...');
      });
      pauseBtn.on('pointerover', () => pauseBtn.setColor('#aaddff'));
      pauseBtn.on('pointerout', () => pauseBtn.setColor('#88ccff'));
      overlay.objects.push(pauseBtn);
      try {
        const hud = (scene as any).hudContainer;
        if (hud && typeof hud.add === 'function') hud.add(pauseBtn);
      } catch { /* ignore */ }

      const buf = GlobalEventBuffer.getInstance();

      // Event count
      const countText = scene.add.text(overlay.boxX + overlay.boxWidth - 60, btnY, `${buf.getEntries().length} events`, {
        fontSize: '12px',
        color: '#aaaaaa',
        fontFamily: 'Arial, sans-serif',
      });
      countText.setDepth(overlay.depthBase + 2);
      overlay.objects.push(countText);
      try {
        const hud = (scene as any).hudContainer;
        if (hud && typeof hud.add === 'function') hud.add(countText);
      } catch { /* ignore */ }

      // ── Load from global buffer ───────────────────────────
      refreshFromBuffer(scene, overlay, state);

      // Poll for new entries every 500ms
      pollInterval = scene.time.addEvent({
        delay: 500,
        loop: true,
        callback: () => {
          if (!activeOverlay || !activeState) {
            if (pollInterval) pollInterval.destroy();
            return;
          }
          const newCount = buf.getEntries().length;
          if (activeState.entries.length !== newCount) {
            refreshFromBuffer(scene, activeOverlay, activeState);
            statusText.setText('Status: ' + getBufferStatus() + HORIZONTAL_SCROLL_HINT);
            countText.setText(newCount + ' events');
          }
        },
      });

      // Update count and status
      statusText.setText('Status: ' + getBufferStatus() + HORIZONTAL_SCROLL_HINT);
      countText.setText(buf.getEntries().length + ' events');
    },
  };
}
