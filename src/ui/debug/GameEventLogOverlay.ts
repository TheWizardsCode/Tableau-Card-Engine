/**
 * GameEventLogOverlay — Debug tool that shows a live feed of game events
 * emitted via the GameEventEmitter during gameplay.
 *
 * @module @ui/debug/GameEventLogOverlay
 */

import type Phaser from 'phaser';
import { GAME_W, GAME_H } from '../constants';
import {
  createOverlayBackground,
  dismissOverlay,
} from '../Overlay';
import type { DebugToolsEntry } from './DebugToolsRegistry';
import type {
  GameEventEmitter,
  GameEventName,
} from '../../core-engine/GameEventEmitter';

// ── Constants ───────────────────────────────────────────────

const DEPTH_BASE = 200;
const DEPTH_BOX = 201;
const DEPTH_CONTENT = 202;

const BOX_WIDTH = Math.min(GAME_W - 80, 680);
const BOX_HEIGHT = Math.min(GAME_H - 80, 500);
const BOX_X = (GAME_W - BOX_WIDTH) / 2;
const BOX_Y = (GAME_H - BOX_HEIGHT) / 2;

const COLOR_BG = 0x1a1a2e;

// Known event names for subscription
const ALL_EVENT_NAMES: GameEventName[] = [
  'turn-started',
  'turn-completed',
  'animation-complete',
  'state-settled',
  'game-ended',
  'card-drawn',
  'card-flipped',
  'card-swapped',
  'card-discarded',
  'card:discarded',
  'card:dealt',
  'card:placed',
  'ui-interaction',
  'income-gained',
  'card-to-foundation',
  'card-to-tableau',
  'card-pickup',
  'card-snap-back',
  'auto-complete-start',
  'auto-complete-card',
  'undo',
  'redo',
  'card-selected',
  'card-deselected',
  'deal-card',
];

// ── Event log entry ─────────────────────────────────────────

interface LogEntry {
  timestamp: string;
  eventName: string;
  payload: unknown;
}

// ── State ───────────────────────────────────────────────────

interface EventLogState {
  scene: Phaser.Scene;
  objects: Phaser.GameObjects.GameObject[];
  entries: LogEntry[];
  paused: boolean;
  emitter: GameEventEmitter | null;
  container: Phaser.GameObjects.Container | null;
  listeners: Array<{ event: string; fn: (payload: unknown) => void }>;
}

let activeLog: EventLogState | null = null;

// ── Window event accessor ───────────────────────────────────

function getEmitter(): GameEventEmitter | null {
  const w = window as unknown as Record<string, unknown>;
  const emitter = w.__GAME_EVENTS__;
  if (emitter && typeof emitter === 'object' && 'on' in (emitter as Record<string, unknown>)) {
    return emitter as GameEventEmitter;
  }
  return null;
}

// ── Formatting helpers ──────────────────────────────────────

function formatTimestamp(): string {
  return new Date().toISOString().slice(11, 23);
}

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

function renderLog(scene: Phaser.Scene, state: EventLogState): void {
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

  // Parent into hudContainer
  try {
    const hud = (scene as any).hudContainer;
    if (hud && typeof hud.add === 'function') {
      hud.add(container);
    }
  } catch { /* ignore */ }

  // Show last N entries that fit
  const maxLines = Math.floor(contentHeight / 18);
  const visible = state.entries.slice(-maxLines);

  visible.forEach((entry, i) => {
    const y = i * 18;
    const displayText = `${entry.timestamp} [${entry.eventName}] ${truncatePayload(entry.payload)}`;

    const textObj = scene.add.text(0, y, displayText, {
      fontSize: '11px',
      color: '#cccccc',
      fontFamily: 'Courier New, monospace',
    });
    textObj.setDepth(DEPTH_CONTENT);
    container.add(textObj);
  });

  if (state.entries.length === 0) {
    const emptyText = scene.add.text(0, 10, '(no events yet — waiting for game to emit events)', {
      fontSize: '13px',
      color: '#888888',
      fontFamily: 'Arial, sans-serif',
    });
    emptyText.setDepth(DEPTH_CONTENT);
    container.add(emptyText);
  }
}

// ── Event subscription management ───────────────────────────

function subscribe(emitter: GameEventEmitter, state: EventLogState): void {
  // Unsubscribe existing
  unsubscribe(state);

  state.listeners = [];
  for (const eventName of ALL_EVENT_NAMES) {
    const fn = (payload: unknown) => {
      if (!state.paused) {
        state.entries.push({
          timestamp: formatTimestamp(),
          eventName,
          payload,
        });
        renderLog(state.scene, state);
      }
    };
    emitter.on(eventName as GameEventName, fn as (payload: unknown) => void);
    state.listeners.push({ event: eventName, fn });
  }
}

function unsubscribe(state: EventLogState): void {
  if (!state.emitter) return;
  for (const { event, fn } of state.listeners) {
    try {
      state.emitter.off(event as GameEventName, fn as (payload: unknown) => void);
    } catch {
      // Ignore unsubscribe errors
    }
  }
  state.listeners = [];
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
      // Close existing log if open
      if (activeLog) {
        unsubscribe(activeLog);
        dismissOverlay(activeLog.objects);
        activeLog = null;
      }

      const state: EventLogState = {
        scene,
        objects: [],
        entries: [],
        paused: false,
        emitter: null,
        container: null,
        listeners: [],
      };

      // ── Create overlay background and box ──────────────────
      const overlay = createOverlayBackground(
        scene,
        { depth: DEPTH_BASE, alpha: 0.6, width: GAME_W, height: GAME_H },
        { width: BOX_WIDTH, height: BOX_HEIGHT, color: COLOR_BG, alpha: 1.0, depth: DEPTH_BOX },
      );
      state.objects.push(...overlay.objects);

      // Parent into hudContainer
      try {
        const hud = (scene as any).hudContainer;
        if (hud && typeof hud.add === 'function') {
          for (const obj of overlay.objects) {
            hud.add(obj);
          }
        }
      } catch { /* ignore */ }

      // ── Title ──────────────────────────────────────────────
      const title = scene.add.text(BOX_X + 10, BOX_Y + 8, 'Game Events', {
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
        unsubscribe(state);
        dismissOverlay(state.objects);
        activeLog = null;
      });
      closeBtn.on('pointerover', () => closeBtn.setColor('#ffffff'));
      closeBtn.on('pointerout', () => closeBtn.setColor('#aaaaaa'));
      state.objects.push(closeBtn);
      try {
        const hud = (scene as any).hudContainer;
        if (hud && typeof hud.add === 'function') hud.add(closeBtn);
      } catch { /* ignore */ }

      // ── Status indicator ───────────────────────────────────
      const statusText = scene.add.text(BOX_X + 10, BOX_Y + 38, 'Status: Waiting for events...', {
        fontSize: '12px',
        color: '#88ccff',
        fontFamily: 'Arial, sans-serif',
      });
      statusText.setDepth(DEPTH_CONTENT);
      state.objects.push(statusText);
      try {
        const hud = (scene as any).hudContainer;
        if (hud && typeof hud.add === 'function') hud.add(statusText);
      } catch { /* ignore */ }

      // ── Control buttons ────────────────────────────────────
      const btnY = BOX_Y + 65;
      const btnStyle = {
        fontSize: '13px',
        color: '#88ccff',
        fontFamily: 'Arial, sans-serif',
      } as const;

      // Clear button
      const clearBtn = scene.add.text(BOX_X + 10, btnY, '[ Clear ]', btnStyle);
      clearBtn.setDepth(DEPTH_CONTENT);
      clearBtn.setInteractive({ useHandCursor: true });
      clearBtn.on('pointerdown', () => {
        state.entries = [];
        renderLog(scene, state);
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
        state.paused = !state.paused;
        pauseBtn.setText(state.paused ? '[ Resume ]' : '[ Pause ]');
        statusText.setText(state.paused ? 'Status: PAUSED' : 'Status: Recording...');
      });
      pauseBtn.on('pointerover', () => pauseBtn.setColor('#aaddff'));
      pauseBtn.on('pointerout', () => pauseBtn.setColor('#88ccff'));
      state.objects.push(pauseBtn);
      try {
        const hud = (scene as any).hudContainer;
        if (hud && typeof hud.add === 'function') hud.add(pauseBtn);
      } catch { /* ignore */ }

      // Event count
      const countText = scene.add.text(BOX_X + BOX_WIDTH - 60, btnY, '0 events', {
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

      // ── Subscribe to events ────────────────────────────────
      const emitter = getEmitter();
      if (emitter) {
        state.emitter = emitter;
        subscribe(emitter, state);
        statusText.setText('Status: Recording...');
      } else {
        statusText.setText('Status: No GameEventEmitter found on window.__GAME_EVENTS__');
      }

      // Initial render
      renderLog(scene, state);

      activeLog = state;
    },
  };
}
