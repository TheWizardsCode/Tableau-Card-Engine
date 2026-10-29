/**
 * Pure, Phaser-free formatting helpers for the Game Events debug overlay.
 *
 * Each buffered event is rendered as a one-line header
 * (`"<timestamp> [<eventName>]"`) followed by the event payload as
 * pretty-printed, 2-space-indented JSON. Nothing is truncated: the full
 * payload is always emitted, and payload lines are never word-wrapped
 * (the overlay scrolls horizontally instead — see `createOverlayDialog`'s
 * `enableHorizontalScroll` option).
 *
 * Non-serialisable payloads never throw:
 * - a circular (or repeated) object reference is replaced with `[Circular]`
 * - a value `JSON.stringify` cannot serialise (`undefined`, functions,
 *   symbols) falls back to `String(value)`
 * - any thrown serialisation error also falls back to `String(value)`
 *
 * @module @ui/debug/formatEventLog
 */

// ── Types ───────────────────────────────────────────────────

/** Shape of one buffered game event, as stored by `GlobalEventBuffer`. */
export interface EventLogEntry {
  /** ISO timestamp captured when the event was emitted. */
  timestamp: string;
  /** Name of the emitted event (its `GameEventMap` key). */
  eventName: string;
  /** Raw payload exactly as emitted. */
  payload: unknown;
}

// ── Constants ───────────────────────────────────────────────

/** Placeholder emitted in place of a circular/repeated object reference. */
export const CIRCULAR_PAYLOAD_PLACEHOLDER = '[Circular]';

// ── Serialisation ───────────────────────────────────────────

/**
 * Build a `JSON.stringify` replacer that replaces already-visited object
 * references (including circular ones) with {@link CIRCULAR_PAYLOAD_PLACEHOLDER}
 * so serialisation can never fail on a cycle.
 */
function createCircularReplacer(): (key: string, value: unknown) => unknown {
  const seen = new WeakSet<object>();
  return (_key: string, value: unknown): unknown => {
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) return CIRCULAR_PAYLOAD_PLACEHOLDER;
      seen.add(value);
    }
    return value;
  };
}

/**
 * Serialise a payload as pretty-printed JSON, never throwing.
 *
 * @param payload - Any emitted event payload.
 * @param indent  - Number of spaces per indent level (default: 2).
 * @returns Indented JSON, or `String(payload)` when the value cannot be
 *          serialised (`undefined`, functions, symbols, or a thrown error).
 *          Circular references inside an object become `[Circular]` rather
 *          than aborting the whole serialisation.
 */
export function stringifyPayloadSafe(payload: unknown, indent = 2): string {
  try {
    const json = JSON.stringify(payload, createCircularReplacer(), indent);
    // JSON.stringify returns undefined for undefined/function/symbol payloads.
    return json === undefined ? String(payload) : json;
  } catch {
    return String(payload);
  }
}

/**
 * Render one buffered event as the overlay's display string: a single-line
 * `"<timestamp> [<eventName>]"` header, a newline, then the fully
 * pretty-printed payload (no truncation, no wrapping).
 *
 * @param entry - The buffered event to render.
 * @returns The multi-line display string.
 */
export function formatEventLogEntry(entry: EventLogEntry): string {
  return `${entry.timestamp} [${entry.eventName}]\n${stringifyPayloadSafe(entry.payload)}`;
}

/**
 * Length (in characters) of the widest line in `text`.
 *
 * Used as a cheap fallback for horizontal-scroll width estimates when a
 * rendered text object's pixel width is not available. Trailing newlines
 * are ignored (they contribute an empty line of length 0).
 *
 * @param text - Multi-line text to measure.
 * @returns The longest line's character length (0 for empty text).
 */
export function widestLineLength(text: string): number {
  let widest = 0;
  for (const line of text.split(/\r?\n/)) {
    if (line.length > widest) widest = line.length;
  }
  return widest;
}
