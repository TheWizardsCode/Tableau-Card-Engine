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
import { GlobalEventBuffer } from './GlobalEventBuffer';

// ── Constants ───────────────────────────────────────────────

const BOX_WIDTH = Math.min(GAME_W - 80, 680);
const BOX_HEIGHT = Math.min(GAME_H - 80, 500);
const HEADER_HEIGHT = 90;

// ── State ───────────────────────────────────────────────────

interface EventLogState {
  entries: Array<{ timestamp: string; eventName: string; payload: unknown }>;
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

// ── Formatting helpers ──────────────────────────────────────

function truncatePayload(payload: unknown, maxLen = 80): string {
  try {
    const json = JSON.stringify(payload);
    if (json.length <= maxLen) return json;
    return json.slice(0, maxLen) + '...';
  } catch {
    return String(payload).slice(0, maxLen);
  }
}

// ── Overlay rendering ───────────────────────────────────────

function renderLog(scene: Phaser.Scene, overlay: OverlayDialogHandle, state: EventLogState): void {
  overlay.scrollContainer.removeAll(true);

  const visible = state.entries.slice();

  visible.forEach((entry, i) => {
    const y = i * 22;
    const displayText = `${entry.timestamp} [${entry.eventName}] ${truncatePayload(entry.payload)}`;

    const textObj = scene.add.text(0, y, displayText, {
      fontSize: '13px',
      color: '#cccccc',
      fontFamily: overlay.monoFont,
    });
    textObj.setDepth(overlay.depthBase + 2);
    overlay.scrollContainer.add(textObj);
  });

  if (state.entries.length === 0) {
    const emptyText = scene.add.text(0, 10, '(no events yet — waiting for game to emit events)', {
      fontSize: '13px',
      color: '#888888',
      fontFamily: 'Arial, sans-serif',
    });
    emptyText.setDepth(overlay.depthBase + 2);
    overlay.scrollContainer.add(emptyText);
  }

  const totalHeight = Math.max(visible.length * 22 + 20, overlay.contentHeight + 1);
  overlay.refresh(totalHeight);
}

// ── Refresh entries from buffer ────────────────────────────

function refreshFromBuffer(scene: Phaser.Scene, overlay: OverlayDialogHandle, state: EventLogState): void {
  const buf = GlobalEventBuffer.getInstance();
  state.entries = buf.getEntries().slice() as EventLogState['entries'];
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
            statusText.setText('Status: ' + getBufferStatus());
            countText.setText(newCount + ' events');
          }
        },
      });

      // Update count and status
      statusText.setText('Status: ' + getBufferStatus());
      countText.setText(buf.getEntries().length + ' events');
    },
  };
}
