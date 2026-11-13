/**
 * GameEventLogOverlay — Debug tool that shows a live feed of game events
 * emitted via the GameEventEmitter during gameplay.
 *
 * ## Colour coding (RISE-0MW0V2CQ2006JDQV)
 *
 * Core is game-agnostic, so the overlay itself owns no event vocabulary and no
 * game colours. A game may pass a list of {@link EventLogPalette}s through
 * `createGameEventLogTool(options)`; the overlay then renders each row as three
 * measured text objects:
 *
 *   1. the **timestamp**, dim grey and palette-independent;
 *   2. the **`[eventName]`** token, coloured by the active palette, followed by
 *      its short ASCII category tag (also palette-independent);
 *   3. the **payload**, neutral grey and palette-independent.
 *
 * Only the event-name token carries category colour (parent AC1); the tag is a
 * redundant, colour-independent signal for users who cannot tell the hues apart
 * (parent AC4). A `[ Palette: … ]` cycler beside Clear/Pause switches palettes
 * and invokes `onPaletteChange` so the game can persist the choice (parent AC3).
 *
 * With no options the overlay uses the neutral {@link NEUTRAL_EVENT_LOG_PALETTE}
 * (all names `#cccccc`, no tags) and shows **no** cycler, so every pre-existing
 * caller — the Gym, Main Street, `createGameEventLogTool()` — renders the
 * pre-colour feed unchanged (parent AC5).
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
import {
  EVENT_LOG_TAG_COLOUR,
  NEUTRAL_EVENT_LOG_PALETTE,
  formatEventLogName,
  formatEventLogPayload,
  formatEventLogTimestamp,
  resolveEventStyle,
  type EventLogEntry,
  type EventLogPalette,
} from './formatEventLog';
import { GlobalEventBuffer } from './GlobalEventBuffer';

// ── Constants ───────────────────────────────────────────────

const BOX_WIDTH = Math.min(GAME_W - 80, 680);
const BOX_HEIGHT = Math.min(GAME_H - 80, 500);
const HEADER_HEIGHT = 90;

/** Vertical gap between two event rows, in px. */
const ROW_GAP = 6;

/** Extra leading between the pretty-printed lines of one payload, in px. */
const LINE_SPACING = 2;

/** Horizontal gap between the timestamp and the `[eventName]` token, in px. */
const HEADER_GAP = 4;

/** Horizontal gap between the `[eventName]` token and its category tag, in px. */
const NAME_TAG_GAP = 6;

/** Horizontal offset of the palette cycler beside Clear/Pause, in px. */
const PALETTE_BUTTON_X_OFFSET = 160;

// ── Options ─────────────────────────────────────────────────

/**
 * Options accepted by {@link createGameEventLogTool}.
 *
 * Every field is optional; omitting all of them preserves the neutral,
 * game-agnostic feed.
 */
export interface GameEventLogToolOptions {
  /**
   * Palettes offered by the `[ Palette: … ]` cycler. With fewer than two
   * palettes the cycler is not rendered. Defaults to the neutral palette.
   */
  readonly palettes?: readonly EventLogPalette[];
  /** Initially selected palette index (clamped; out-of-range → 0). */
  readonly paletteIndex?: number;
  /**
   * Called with the new index whenever the cycler changes the palette, so the
   * game can persist the choice (parent AC3). A game that supplies no palettes
   * never invokes it.
   */
  readonly onPaletteChange?: (index: number) => void;
}

// ── State ───────────────────────────────────────────────────

interface EventLogState {
  entries: EventLogEntry[];
  paused: boolean;
  /** Selected palette index into the resolved palette list. */
  paletteIndex: number;
  /**
   * Number of `GlobalEventBuffer` entries already reflected in `entries`.
   *
   * The buffer is the source of truth and the 500 ms poll appends only the
   * entries recorded since this watermark, so a **cleared** feed stays
   * cleared (the poll does not repopulate it from the buffer) and a
   * **paused** feed does not advance the watermark.
   */
  consumed: number;
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

// ── Palette resolution ──────────────────────────────────────

/**
 * Resolve the caller's palettes into a non-empty list and clamp the requested
 * index onto it.
 *
 * An empty/absent palette list falls back to the neutral palette (index 0), and
 * an out-of-range index (a stored preference for a palette list that changed
 * shape) falls back to index 0 rather than throwing or rendering unstyled
 * rows.
 */
function resolvePalettes(options: GameEventLogToolOptions): {
  palettes: readonly EventLogPalette[];
  paletteIndex: number;
} {
  const palettes = options.palettes && options.palettes.length > 0
    ? options.palettes
    : [NEUTRAL_EVENT_LOG_PALETTE];
  const requested = options.paletteIndex ?? 0;
  const paletteIndex =
    Number.isInteger(requested) && requested >= 0 && requested < palettes.length
      ? requested
      : 0;
  return { palettes, paletteIndex };
}

/** The cycler's label for a palette. */
function paletteButtonLabel(palette: EventLogPalette): string {
  return `[ Palette: ${palette.label} ]`;
}

// ── Overlay rendering ───────────────────────────────────────

/**
 * Render every buffered event into the dialog's scroll container.
 *
 * Layout: **three measured text objects per event** — a dim timestamp, the
 * coloured `[eventName]` token with its optional ASCII tag, and the neutral
 * pretty-printed payload. The timestamp/name/tag share one header line with
 * measured x offsets; the payload starts below the tallest header piece. Each
 * row's y advances by the header height plus the payload's rendered height plus
 * {@link ROW_GAP}, so the content height still grows with each payload's line
 * count while the object count is proportional to the event count (parent AC6).
 *
 * No `wordWrap` is configured on the rows: payload lines are never
 * soft-wrapped. The dialog is created with `enableHorizontalScroll: true`, so
 * lines wider than the content area stay on one line and are reached by
 * scrolling sideways.
 */
function renderLog(
  scene: Phaser.Scene,
  overlay: OverlayDialogHandle,
  state: EventLogState,
  palettes: readonly EventLogPalette[],
): void {
  overlay.scrollContainer.removeAll(true);

  const visible = state.entries.slice();
  const palette = palettes[Math.min(state.paletteIndex, palettes.length - 1)];

  let y = 0;
  let totalWidth = 0;

  visible.forEach((entry) => {
    const style = resolveEventStyle(entry, palette);

    // Header: timestamp (dim) → [name] (palette colour) → tag (fixed).
    const timestampText = scene.add.text(0, y, formatEventLogTimestamp(entry), {
      fontSize: '13px',
      color: style.timestampColour,
      fontFamily: overlay.monoFont,
      lineSpacing: LINE_SPACING,
    });
    timestampText.setDepth(overlay.depthBase + 2);
    overlay.scrollContainer.add(timestampText);

    const nameText = scene.add.text(
      timestampText.width + HEADER_GAP,
      y,
      formatEventLogName(entry),
      {
        fontSize: '13px',
        color: style.nameColour,
        fontFamily: overlay.monoFont,
        lineSpacing: LINE_SPACING,
      },
    );
    nameText.setDepth(overlay.depthBase + 2);
    overlay.scrollContainer.add(nameText);

    let headerRight = nameText.x + nameText.width;
    let headerHeight = Math.max(timestampText.height, nameText.height);

    if (style.tag !== '') {
      const tagText = scene.add.text(
        nameText.x + nameText.width + NAME_TAG_GAP,
        y,
        style.tag,
        {
          fontSize: '13px',
          color: EVENT_LOG_TAG_COLOUR,
          fontFamily: overlay.monoFont,
          lineSpacing: LINE_SPACING,
        },
      );
      tagText.setDepth(overlay.depthBase + 2);
      overlay.scrollContainer.add(tagText);
      headerRight = Math.max(headerRight, tagText.x + tagText.width);
      headerHeight = Math.max(headerHeight, tagText.height);
    }

    // Payload: neutral, pretty-printed, never wrapped.
    const payloadText = scene.add.text(
      0,
      y + headerHeight + LINE_SPACING,
      formatEventLogPayload(entry),
      {
        fontSize: '13px',
        color: style.payloadColour,
        fontFamily: overlay.monoFont,
        lineSpacing: LINE_SPACING,
      },
    );
    payloadText.setDepth(overlay.depthBase + 2);
    overlay.scrollContainer.add(payloadText);

    totalWidth = Math.max(totalWidth, headerRight, payloadText.width);
    y += headerHeight + LINE_SPACING + payloadText.height + ROW_GAP;
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

/**
 * Re-render the whole feed from the buffer, resetting the consumed watermark.
 *
 * Used once when the overlay opens; the poll appends from the watermark
 * instead (see {@link syncFromBuffer}).
 */
function refreshFromBuffer(
  scene: Phaser.Scene,
  overlay: OverlayDialogHandle,
  state: EventLogState,
  palettes: readonly EventLogPalette[],
): void {
  const buf = GlobalEventBuffer.getInstance();
  const all = buf.getEntries();
  state.entries = all.slice();
  state.consumed = all.length;
  renderLog(scene, overlay, state, palettes);
}

/**
 * Append the entries buffered since the last sync and re-render.
 *
 * Only new events are appended, so the feed honours an earlier **Clear**
 * (a cleared feed is not repopulated) and nothing already on screen is
 * rebuilt. A buffer that shrank underneath the feed (e.g. the whole buffer
 * was cleared by a session reset) is resynced from scratch.
 *
 * @returns `true` when the feed changed and the caller should refresh its
 *          status/count labels.
 */
function syncFromBuffer(
  scene: Phaser.Scene,
  overlay: OverlayDialogHandle,
  state: EventLogState,
  palettes: readonly EventLogPalette[],
): boolean {
  const all = GlobalEventBuffer.getInstance().getEntries();

  if (all.length < state.consumed) {
    refreshFromBuffer(scene, overlay, state, palettes);
    return true;
  }
  if (all.length === state.consumed) return false;

  state.entries = state.entries.concat(all.slice(state.consumed));
  state.consumed = all.length;
  renderLog(scene, overlay, state, palettes);
  return true;
}

// ── Factory ─────────────────────────────────────────────────

/**
 * Create a debug tool entry for the Game Event Log overlay.
 *
 * @param options Optional palette configuration. Omitting every field keeps
 *                the neutral, game-agnostic feed (parent AC5).
 * @returns A DebugToolsEntry that opens the event log when activated.
 */
export function createGameEventLogTool(
  options: GameEventLogToolOptions = {},
): DebugToolsEntry {
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

      const { palettes, paletteIndex } = resolvePalettes(options);
      const state: EventLogState = {
        entries: [],
        paused: false,
        paletteIndex,
        consumed: 0,
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
      const buf = GlobalEventBuffer.getInstance();
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
        // Clear the *feed*, not the buffer: advancing the consumed watermark
        // past everything already recorded is what keeps the next poll tick
        // from repopulating the list (the pre-pretty-print Clear behaviour).
        state.entries = [];
        state.consumed = buf.getEntries().length;
        renderLog(scene, overlay, state, palettes);
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

      // ── Palette cycler (only when the game supplies alternatives) ──
      if (palettes.length > 1) {
        const paletteBtn = scene.add.text(
          overlay.boxX + PALETTE_BUTTON_X_OFFSET,
          btnY,
          paletteButtonLabel(palettes[state.paletteIndex]),
          btnStyle,
        );
        paletteBtn.setDepth(overlay.depthBase + 2);
        paletteBtn.setInteractive({ useHandCursor: true });
        paletteBtn.on('pointerdown', () => {
          state.paletteIndex = (state.paletteIndex + 1) % palettes.length;
          paletteBtn.setText(paletteButtonLabel(palettes[state.paletteIndex]));
          renderLog(scene, overlay, state, palettes);
          options.onPaletteChange?.(state.paletteIndex);
        });
        paletteBtn.on('pointerover', () => paletteBtn.setColor('#aaddff'));
        paletteBtn.on('pointerout', () => paletteBtn.setColor('#88ccff'));
        overlay.objects.push(paletteBtn);
        try {
          const hud = (scene as any).hudContainer;
          if (hud && typeof hud.add === 'function') hud.add(paletteBtn);
        } catch { /* ignore */ }
      }

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
      refreshFromBuffer(scene, overlay, state, palettes);

      // Poll for new entries every 500ms
      pollInterval = scene.time.addEvent({
        delay: 500,
        loop: true,
        callback: () => {
          if (!activeOverlay || !activeState) {
            if (pollInterval) pollInterval.destroy();
            return;
          }
          // Pause freezes the feed: nothing is appended and the status line
          // keeps showing PAUSED. The watermark does not advance either, so
          // resuming appends everything recorded while paused (the buffer is
          // the source of truth — a pause never loses events).
          if (activeState.paused) return;
          if (!syncFromBuffer(scene, activeOverlay, activeState, palettes)) return;
          statusText.setText('Status: ' + getBufferStatus() + HORIZONTAL_SCROLL_HINT);
          countText.setText(buf.getEntries().length + ' events');
        },
      });

      // Update count and status
      statusText.setText('Status: ' + getBufferStatus() + HORIZONTAL_SCROLL_HINT);
      countText.setText(buf.getEntries().length + ' events');
    },
  };
}
