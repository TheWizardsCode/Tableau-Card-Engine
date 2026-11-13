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

// ── Palette and style ───────────────────────────────────────

/**
 * A game-supplied colour scheme for the Game Events feed.
 *
 * Core stays game-agnostic: it knows only this generic shape, never an event
 * name or a hex value of any particular game. A game declares one or more
 * palettes and passes them to `createGameEventLogTool`; a game that passes
 * none keeps the neutral {@link NEUTRAL_EVENT_LOG_PALETTE}.
 *
 * Category-level defaults with per-event overrides are modelled here as a
 * flat `eventName → hex` record (`colours`) plus a separate `tags` record for
 * the colour-independent ASCII tag. A game builds both however it likes — the
 * overlay only ever looks a name up.
 */
export interface EventLogPalette {
  /** Stable identifier (e.g. `'default'`, `'colour-blind-safe'`). */
  readonly id: string;
  /** Human-readable label shown by the on-overlay palette cycler. */
  readonly label: string;
  /** Colour for any event name the palette does not map explicitly. */
  readonly fallback: string;
  /** Event name → CSS hex colour used for the `[eventName]` token. */
  readonly colours: Readonly<Record<string, string>>;
  /**
   * Event name → short ASCII category tag, rendered beside the coloured name
   * as the colour-independent signal. A palette that omits this (or omits a
   * name) renders no tag; the neutral default supplies none.
   */
  readonly tags?: Readonly<Record<string, string>>;
}

/**
 * The resolved per-row styling for one event entry.
 *
 * `timestampColour` and `payloadColour` are deliberately **palette-independent**:
 * only the event-name token carries category colour (parent AC1), so the
 * timestamp stays dim and the payload stays neutral in every palette.
 */
export interface EventLogStyle {
  /** Dim grey used for the timestamp — identical in every palette. */
  readonly timestampColour: string;
  /** Palette-resolved colour for the `[eventName]` token. */
  readonly nameColour: string;
  /** Short ASCII category tag — `''` when the palette supplies none. */
  readonly tag: string;
  /** Neutral grey used for the pretty-printed payload — palette-independent. */
  readonly payloadColour: string;
}

// ── Constants ───────────────────────────────────────────────

/** Placeholder emitted in place of a circular/repeated object reference. */
export const CIRCULAR_PAYLOAD_PLACEHOLDER = '[Circular]';

/**
 * Colour of the timestamp token.
 *
 * Palette-independent and dimmer than the payload, so the eye skips it while
 * scanning the feed (parent AC1). Chosen at ≥ 4.5:1 contrast on `#1a1a2e`.
 */
export const EVENT_LOG_TIMESTAMP_COLOUR = '#888888';

/**
 * Colour of the pretty-printed payload body.
 *
 * Palette-independent: the payload stays neutral in every palette so its
 * values remain readable and never compete with the coloured event name
 * (parent AC1). Chosen at ≥ 4.5:1 contrast on `#1a1a2e`.
 */
export const EVENT_LOG_PAYLOAD_COLOUR = '#cccccc';

/** Colour of the ASCII category tag — identical in every palette (parent AC4). */
export const EVENT_LOG_TAG_COLOUR = '#999999';

/**
 * The neutral default palette, used when a game supplies none.
 *
 * Every event name resolves to the historical `#cccccc` and no tags are
 * rendered, so the Gym, Main Street and a bare `createGameEventLogTool()`
 * keep the pre-colour feed (parent AC5).
 */
export const NEUTRAL_EVENT_LOG_PALETTE: EventLogPalette = {
  id: 'neutral',
  label: 'Default',
  fallback: EVENT_LOG_PAYLOAD_COLOUR,
  colours: {},
  tags: {},
};

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
 * The timestamp token of an entry, rendered in the dim, palette-independent
 * colour.
 *
 * The overlay renders the header as separate timestamp / name / tag text
 * objects so the name alone can carry the palette colour (parent AC1).
 *
 * @param entry - The buffered event to render.
 * @returns The timestamp text.
 */
export function formatEventLogTimestamp(entry: EventLogEntry): string {
  return entry.timestamp;
}

/**
 * The `[eventName]` token of an entry, rendered in the palette's colour.
 *
 * @param entry - The buffered event to render.
 * @returns The bracketed event-name text.
 */
export function formatEventLogName(entry: EventLogEntry): string {
  return `[${entry.eventName}]`;
}

/**
 * The payload body of an entry, rendered in the neutral, palette-independent
 * colour (fully pretty-printed, never truncated).
 *
 * @param entry - The buffered event to render.
 * @returns The pretty-printed payload text.
 */
export function formatEventLogPayload(entry: EventLogEntry): string {
  return stringifyPayloadSafe(entry.payload);
}

/**
 * Resolve the complete per-row styling for one entry against a palette.
 *
 * The event name is looked up in `palette.colours`, falling back to
 * `palette.fallback` for an unmapped name — so a new event name added without
 * a palette row renders neutrally rather than crashing or disappearing. The
 * tag is looked up in `palette.tags`; an empty/absent tag becomes `''` (the
 * row simply carries no tag). The timestamp and payload colours never depend
 * on the palette.
 *
 * @param entry   - The buffered event to style.
 * @param palette - The active palette (a game's, or the neutral default).
 * @returns The resolved style for the row.
 */
export function resolveEventStyle(entry: EventLogEntry, palette: EventLogPalette): EventLogStyle {
  const nameColour = palette.colours[entry.eventName] ?? palette.fallback;
  const rawTag = palette.tags?.[entry.eventName];
  return {
    timestampColour: EVENT_LOG_TIMESTAMP_COLOUR,
    nameColour,
    tag: rawTag && rawTag.length > 0 ? rawTag : '',
    payloadColour: EVENT_LOG_PAYLOAD_COLOUR,
  };
}

/**
 * Render one buffered event as the overlay's display string: a single-line
 * `"<timestamp> [<eventName>]"` header, a newline, then the fully
 * pretty-printed payload (no truncation, no wrapping).
 *
 * Kept for compatibility with the pre-palette feed and the pure formatter
 * tests; the overlay itself renders the three tokens separately so the name
 * can be coloured (parent AC1).
 *
 * @param entry - The buffered event to render.
 * @returns The multi-line display string.
 */
export function formatEventLogEntry(entry: EventLogEntry): string {
  return `${formatEventLogTimestamp(entry)} ${formatEventLogName(entry)}\n${formatEventLogPayload(entry)}`;
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
