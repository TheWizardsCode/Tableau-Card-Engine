/**
 * TheRisingLayoutAdapter -- maps the The Rising SLL layout document to
 * game-specific anchor points and band bounds.
 *
 * The SLL document (`src/layouts/rising.layout.json`) is the single source of
 * truth for every UI position in the game: the HUD, the Spirit Row market, the
 * timeline track, the hand and the conversation overlay placeholder. Nothing
 * in the scene/renderer layer hard-codes pixel positions.
 *
 * The document is parsed and validated **at module load**; an invalid layout
 * throws immediately (fail-fast), so a broken layout can never reach a scene.
 * Anchor accessors fall back to sensible viewport-relative defaults when a zone
 * or anchor is missing, so a partially-customised layout still renders.
 *
 * @module src/scenes/TheRisingLayoutAdapter
 */

import { anchorPoint, getZoneRect } from '@ui/screen-layout';
import {
  parseScreenLayoutDocument,
  type PixelPoint,
  type PixelRect,
  type ScreenLayoutDocument,
} from '@ui/screen-layout-schema';
import risingLayoutJson from '../layouts/rising.layout.json';

/** The canonical The Rising viewport used to resolve SLL anchors. */
export const THE_RISING_VIEWPORT = { width: 1280, height: 720 } as const;

/** A viewport size in logical pixels. */
export interface RisingViewport {
  readonly width: number;
  readonly height: number;
}

/**
 * Parse and validate a The Rising SLL document.
 *
 * @throws {Error} When the document fails schema validation.
 */
export function parseTheRisingLayout(document: unknown): ScreenLayoutDocument {
  const parsed = parseScreenLayoutDocument(document);
  if (!parsed.valid) {
    const first = parsed.errors[0];
    throw new Error(
      `Invalid The Rising SLL layout: ${first ? `${first.path} ${first.message}` : 'unknown parse error'}`,
    );
  }
  return parsed.layout;
}

/**
 * The validated The Rising layout document.
 *
 * Parsed at module load so an invalid layout fails fast (AC2).
 */
export const THE_RISING_LAYOUT: ScreenLayoutDocument = parseTheRisingLayout(risingLayoutJson);

/**
 * Normalized fallback anchors, used when a zone or anchor is absent from the
 * supplied layout. These mirror the shipped layout so a degraded document still
 * places UI sensibly.
 */
const FALLBACK_ANCHORS: Readonly<Record<string, Readonly<Record<string, PixelPoint>>>> = {
  hud: {
    left: { x: 0.02, y: 0.055 },
    memory: { x: 0.16, y: 0.055 },
    clock: { x: 0.5, y: 0.055 },
    insight: { x: 0.84, y: 0.055 },
    right: { x: 0.98, y: 0.055 },
  },
  spiritRow: {
    label: { x: 0.06, y: 0.175 },
    left: { x: 0.1, y: 0.28 },
    center: { x: 0.5, y: 0.28 },
    right: { x: 0.9, y: 0.28 },
  },
  timeline: {
    label: { x: 0.06, y: 0.415 },
    left: { x: 0.1, y: 0.52 },
    center: { x: 0.5, y: 0.52 },
    right: { x: 0.9, y: 0.52 },
  },
  hand: {
    label: { x: 0.06, y: 0.675 },
    left: { x: 0.1, y: 0.8 },
    center: { x: 0.5, y: 0.8 },
    right: { x: 0.9, y: 0.8 },
  },
  cloudedPile: {
    center: { x: 0.905, y: 0.8 },
  },
  conversationOverlay: {
    center: { x: 0.5, y: 0.5 },
  },
};

function fallbackAnchor(
  zone: string,
  anchor: string,
  viewport: RisingViewport,
): PixelPoint {
  const normalized = FALLBACK_ANCHORS[zone]?.[anchor] ?? FALLBACK_ANCHORS[zone]?.center;
  if (normalized) {
    return { x: normalized.x * viewport.width, y: normalized.y * viewport.height };
  }
  return { x: viewport.width / 2, y: viewport.height / 2 };
}

/**
 * Resolve an anchor in a named zone to pixel coordinates.
 *
 * Returns a viewport-relative fallback when the zone/anchor is absent or the
 * supplied layout is malformed — never throws.
 */
export function resolveAnchor(
  zone: string,
  anchor: string,
  viewport: RisingViewport = THE_RISING_VIEWPORT,
  layout: ScreenLayoutDocument = THE_RISING_LAYOUT,
): PixelPoint {
  try {
    return anchorPoint(layout, zone, anchor, viewport, 1);
  } catch {
    return fallbackAnchor(zone, anchor, viewport);
  }
}

/**
 * Resolve a named zone's pixel rectangle.
 *
 * Falls back to a full-width band centred on the zone's default anchor when the
 * zone is missing or the layout is malformed.
 */
export function resolveZoneBounds(
  zone: string,
  viewport: RisingViewport = THE_RISING_VIEWPORT,
  layout: ScreenLayoutDocument = THE_RISING_LAYOUT,
): PixelRect {
  try {
    return getZoneRect(layout, zone, viewport, 1);
  } catch {
    const anchor = fallbackAnchor(zone, 'center', viewport);
    return {
      x: 0,
      y: Math.max(0, anchor.y - 65),
      width: viewport.width,
      height: 130,
    };
  }
}

// ── Named anchor helpers (AC2) ──────────────────────────────

/** Resolve an anchor in the HUD zone (default: `memory`). */
export function resolveHudAnchor(
  anchor: string = 'memory',
  viewport: RisingViewport = THE_RISING_VIEWPORT,
): PixelPoint {
  return resolveAnchor('hud', anchor, viewport);
}

/** Resolve an anchor in the Spirit Row (market) zone (default: `center`). */
export function resolveSpiritRowAnchor(
  anchor: string = 'center',
  viewport: RisingViewport = THE_RISING_VIEWPORT,
): PixelPoint {
  return resolveAnchor('spiritRow', anchor, viewport);
}

/** Resolve an anchor in the timeline track zone (default: `center`). */
export function resolveTimelineAnchor(
  anchor: string = 'center',
  viewport: RisingViewport = THE_RISING_VIEWPORT,
): PixelPoint {
  return resolveAnchor('timeline', anchor, viewport);
}

/** Resolve an anchor in the hand zone (default: `center`). */
export function resolveHandAnchor(
  anchor: string = 'center',
  viewport: RisingViewport = THE_RISING_VIEWPORT,
): PixelPoint {
  return resolveAnchor('hand', anchor, viewport);
}

/** Resolve an anchor in the Clouded recovery pile zone (default: `center`). */
export function resolveCloudedPileAnchor(
  anchor: string = 'center',
  viewport: RisingViewport = THE_RISING_VIEWPORT,
): PixelPoint {
  return resolveAnchor('cloudedPile', anchor, viewport);
}

/** Resolve an anchor in the conversation overlay placeholder zone (default: `center`). */
export function resolveConversationOverlayAnchor(
  anchor: string = 'center',
  viewport: RisingViewport = THE_RISING_VIEWPORT,
): PixelPoint {
  return resolveAnchor('conversationOverlay', anchor, viewport);
}

// ── Composite layout ────────────────────────────────────────

/** A horizontal band (market row, timeline or hand) with its bounds. */
export interface RisingBandLayout {
  readonly center: PixelPoint;
  readonly left: PixelPoint;
  readonly right: PixelPoint;
  readonly label: PixelPoint;
  readonly bounds: PixelRect;
  /** Usable maximum row width for card compression. */
  readonly maxWidth: number;
}

/** The fully-resolved The Rising layout consumed by the renderer. */
export interface TheRisingLayout {
  readonly viewport: RisingViewport;
  readonly hud: {
    readonly left: PixelPoint;
    readonly memory: PixelPoint;
    readonly clock: PixelPoint;
    readonly insight: PixelPoint;
    readonly right: PixelPoint;
  };
  readonly spiritRow: RisingBandLayout;
  readonly timeline: RisingBandLayout;
  readonly hand: RisingBandLayout;
  readonly cloudedPile: {
    readonly center: PixelPoint;
    readonly bounds: PixelRect;
  };
  readonly conversationOverlay: {
    readonly center: PixelPoint;
  };
}

function bandMaxWidth(bounds: PixelRect, viewport: RisingViewport): number {
  const width = typeof bounds.width === 'number' && bounds.width > 0 ? bounds.width : viewport.width;
  return width * 0.96;
}

function buildBand(
  zone: string,
  viewport: RisingViewport,
  layout: ScreenLayoutDocument,
): RisingBandLayout {
  const bounds = resolveZoneBounds(zone, viewport, layout);
  return {
    center: resolveAnchor(zone, 'center', viewport, layout),
    left: resolveAnchor(zone, 'left', viewport, layout),
    right: resolveAnchor(zone, 'right', viewport, layout),
    label: resolveAnchor(zone, 'label', viewport, layout),
    bounds,
    maxWidth: bandMaxWidth(bounds, viewport),
  };
}

/**
 * Build the fully-resolved The Rising layout from a validated SLL document.
 *
 * Defaults to the shipped layout and the canonical 1280×720 viewport; callers
 * may supply an alternative document (e.g. a game-scoped override) or viewport.
 */
export function createTheRisingLayout(
  layout: ScreenLayoutDocument = THE_RISING_LAYOUT,
  viewport: RisingViewport = THE_RISING_VIEWPORT,
): TheRisingLayout {
  return {
    viewport: { width: viewport.width, height: viewport.height },
    hud: {
      left: resolveAnchor('hud', 'left', viewport, layout),
      memory: resolveAnchor('hud', 'memory', viewport, layout),
      clock: resolveAnchor('hud', 'clock', viewport, layout),
      insight: resolveAnchor('hud', 'insight', viewport, layout),
      right: resolveAnchor('hud', 'right', viewport, layout),
    },
    spiritRow: buildBand('spiritRow', viewport, layout),
    timeline: buildBand('timeline', viewport, layout),
    hand: buildBand('hand', viewport, layout),
    cloudedPile: {
      center: resolveAnchor('cloudedPile', 'center', viewport, layout),
      bounds: resolveZoneBounds('cloudedPile', viewport, layout),
    },
    conversationOverlay: {
      center: resolveAnchor('conversationOverlay', 'center', viewport, layout),
    },
  };
}
