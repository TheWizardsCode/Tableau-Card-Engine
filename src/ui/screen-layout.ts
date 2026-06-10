import type {
  NormalizedPoint,
  NormalizedRect,
  PixelPoint,
  PixelRect,
  ScreenLayoutDocument,
} from './screen-layout-schema';

export interface LayoutViewport {
  width: number;
  height: number;
}

export interface ResolvedZone {
  rect: PixelRect;
  anchors: Record<string, PixelPoint>;
}

export interface ResolvedScreenLayout {
  viewport: {
    width: number;
    height: number;
    dpr: number;
    pixelWidth: number;
    pixelHeight: number;
  };
  zones: Record<string, ResolvedZone>;
}

export type ScreenLayoutIssueCode =
  | 'UNKNOWN_ZONE'
  | 'UNKNOWN_ANCHOR'
  | 'LAYOUT_MISSING'
  | 'LAYOUT_ADAPTER_FALLBACK';

export interface ScreenLayoutIssue {
  code: ScreenLayoutIssueCode;
  message: string;
  zoneName?: string;
  anchorName?: string;
  cause?: unknown;
}

export type ScreenLayoutIssueReporter = (issue: ScreenLayoutIssue) => void;

export class ScreenLayoutMappingError extends Error {
  constructor(
    readonly code: ScreenLayoutIssueCode,
    message: string,
    readonly zoneName?: string,
    readonly anchorName?: string,
  ) {
    super(message);
    this.name = 'ScreenLayoutMappingError';
  }
}

export interface LegacyLayoutAdapterOptions<TLegacyLayout> {
  layoutDocument: ScreenLayoutDocument | null | undefined;
  viewport: LayoutViewport;
  dpr?: number;
  mapResolvedLayout: (resolved: ResolvedScreenLayout) => TLegacyLayout;
  fallback: () => TLegacyLayout;
  reportIssue?: ScreenLayoutIssueReporter;
}

function toPixels(value: number, viewportAxis: number, dpr: number): number {
  return value * viewportAxis * dpr;
}

function reportIssue(
  reportIssueHook: ScreenLayoutIssueReporter | undefined,
  issue: ScreenLayoutIssue,
): void {
  if (reportIssueHook) {
    reportIssueHook(issue);
  }
}

/**
 * Resolve a NormalizedRect to pixel coordinates.
 *
 * If `w` and `h` are present on the normalized rect, the result includes
 * corresponding `width` and `height` pixel values. If absent, `width` and
 * `height` are `undefined`, matching the traditional position-only zone
 * behaviour.
 */
function resolveRect(
  rect: NormalizedRect,
  viewport: LayoutViewport,
  baseViewport: ScreenLayoutDocument['baseViewport'],
  dpr: number,
): PixelRect {
  if (rect.pixelOverride) {
    const scaleX = (viewport.width * dpr) / baseViewport.width;
    const scaleY = (viewport.height * dpr) / baseViewport.height;
    const result: PixelRect = {
      x: rect.pixelOverride.x * scaleX,
      y: rect.pixelOverride.y * scaleY,
    };
    if (rect.w !== undefined) {
      result.width = toPixels(rect.w, viewport.width, dpr);
    }
    if (rect.h !== undefined) {
      result.height = toPixels(rect.h, viewport.height, dpr);
    }
    return result;
  }

  const result: PixelRect = {
    x: toPixels(rect.x, viewport.width, dpr),
    y: toPixels(rect.y, viewport.height, dpr),
  };
  if (rect.w !== undefined) {
    result.width = toPixels(rect.w, viewport.width, dpr);
  }
  if (rect.h !== undefined) {
    result.height = toPixels(rect.h, viewport.height, dpr);
  }
  return result;
}

/**
 * Resolve an anchor point to pixel coordinates.
 *
 * Since zones are position-only, anchors are always resolved in absolute
 * viewport coordinates (not relative to a zone rectangle).
 */
function resolveAnchor(
  anchor: NormalizedPoint,
  _zoneRect: PixelPoint,
  viewport: LayoutViewport,
  baseViewport: ScreenLayoutDocument['baseViewport'],
  dpr: number,
): PixelPoint {
  if (anchor.pixelOverride) {
    const scaleX = (viewport.width * dpr) / baseViewport.width;
    const scaleY = (viewport.height * dpr) / baseViewport.height;
    return {
      x: anchor.pixelOverride.x * scaleX,
      y: anchor.pixelOverride.y * scaleY,
    };
  }

  return {
    x: toPixels(anchor.x, viewport.width, dpr),
    y: toPixels(anchor.y, viewport.height, dpr),
  };
}

/**
 * Resolve a full SLL layout document into pixel-space coordinates.
 *
 * Converts all zone rectangles and anchor points from normalized (0-1)
 * coordinates to absolute pixel values based on the provided viewport
 * and device pixel ratio.
 *
 * ### Dimension support
 *
 * Zone rectangles may include optional `w` (width) and `h` (height)
 * fields. When present, the resulting {@link ResolvedZone.rect} will
 * contain corresponding `width` and `height` values in pixels. When
 * absent, `width` and `height` are `undefined`, preserving the
 * traditional position-only zone behaviour for backward-compatible
 * consumers.
 *
 * @param layout - The validated SLL layout document to resolve.
 * @param viewport - The current viewport dimensions (logical pixels).
 * @param dpr - Device pixel ratio, defaults to `1`.
 * @returns A fully resolved layout with pixel-space zones and anchors.
 */
export function normalizedToPixels(
  layout: ScreenLayoutDocument,
  viewport: LayoutViewport,
  dpr = 1,
): ResolvedScreenLayout {
  const zones: Record<string, ResolvedZone> = {};

  for (const [zoneName, zone] of Object.entries(layout.zones)) {
    const rect = resolveRect(zone.rect, viewport, layout.baseViewport, dpr);
    const anchors: Record<string, PixelPoint> = {};

    if (zone.anchors) {
      for (const [anchorName, anchor] of Object.entries(zone.anchors)) {
        anchors[anchorName] = resolveAnchor(
          anchor,
          rect,
          viewport,
          layout.baseViewport,
          dpr,
        );
      }
    }

    zones[zoneName] = {
      rect,
      anchors,
    };
  }

  return {
    viewport: {
      width: viewport.width,
      height: viewport.height,
      dpr,
      pixelWidth: viewport.width * dpr,
      pixelHeight: viewport.height * dpr,
    },
    zones,
  };
}

/**
 * Convert a pixel point back to normalized (0-1) coordinates.
 *
 * Returns a position-only NormalizedRect. Layout zones may carry
 * optional dimensions (w, h), but this function focuses on position
 * conversion only.
 */
export function pixelToNormalized(
  point: PixelPoint,
  viewport: LayoutViewport,
  dpr = 1,
): NormalizedRect {
  return {
    x: point.x / (viewport.width * dpr),
    y: point.y / (viewport.height * dpr),
  };
}

/**
 * Get the resolved pixel rectangle for a layout zone.
 *
 * Returns a PixelRect with `x`/`y` always set. `width`/`height` are set
 * when the zone defines `w`/`h` (optional dimension support); otherwise
 * they are `undefined`, matching the traditional position-only zone
 * behaviour.
 */
export function getZoneRect(
  layout: ScreenLayoutDocument,
  zoneName: string,
  viewport: LayoutViewport,
  dpr = 1,
  reportIssueHook?: ScreenLayoutIssueReporter,
): PixelRect {
  const resolved = normalizedToPixels(layout, viewport, dpr);
  const zone = resolved.zones[zoneName];

  if (!zone) {
    const error = new ScreenLayoutMappingError(
      'UNKNOWN_ZONE',
      `Unknown zone: ${zoneName}`,
      zoneName,
    );
    reportIssue(reportIssueHook, {
      code: 'UNKNOWN_ZONE',
      message: error.message,
      zoneName,
      cause: error,
    });
    throw error;
  }

  return zone.rect;
}

export function anchorPoint(
  layout: ScreenLayoutDocument,
  zoneName: string,
  anchorName: string,
  viewport: LayoutViewport,
  dpr = 1,
  reportIssueHook?: ScreenLayoutIssueReporter,
): PixelPoint {
  const resolved = normalizedToPixels(layout, viewport, dpr);
  const zone = resolved.zones[zoneName];

  if (!zone) {
    const error = new ScreenLayoutMappingError(
      'UNKNOWN_ZONE',
      `Unknown zone: ${zoneName}`,
      zoneName,
    );
    reportIssue(reportIssueHook, {
      code: 'UNKNOWN_ZONE',
      message: error.message,
      zoneName,
      cause: error,
    });
    throw error;
  }

  const anchor = zone.anchors[anchorName];
  if (!anchor) {
    const error = new ScreenLayoutMappingError(
      'UNKNOWN_ANCHOR',
      `Unknown anchor "${anchorName}" in zone "${zoneName}"`,
      zoneName,
      anchorName,
    );
    reportIssue(reportIssueHook, {
      code: 'UNKNOWN_ANCHOR',
      message: error.message,
      zoneName,
      anchorName,
      cause: error,
    });
    throw error;
  }

  return anchor;
}

/**
 * Adapter helper for incremental migration from legacy computeLayout-based scenes.
 *
 * - If layoutDocument is present and mapping succeeds, the mapped SLL result is returned.
 * - If layoutDocument is missing or mapping fails, it reports a structured issue and
 *   returns the legacy fallback result.
 */
export function adaptLayoutWithFallback<TLegacyLayout>(
  options: LegacyLayoutAdapterOptions<TLegacyLayout>,
): TLegacyLayout {
  const {
    layoutDocument,
    viewport,
    dpr = 1,
    mapResolvedLayout,
    fallback,
    reportIssue: reportIssueHook,
  } = options;

  if (!layoutDocument) {
    reportIssue(reportIssueHook, {
      code: 'LAYOUT_MISSING',
      message: 'No SLL layout document available; using legacy fallback layout.',
    });
    return fallback();
  }

  try {
    const resolved = normalizedToPixels(layoutDocument, viewport, dpr);
    return mapResolvedLayout(resolved);
  } catch (error) {
    reportIssue(reportIssueHook, {
      code: 'LAYOUT_ADAPTER_FALLBACK',
      message:
        'Failed to adapt SLL layout to legacy shape; using legacy fallback layout.',
      cause: error,
    });
    return fallback();
  }
}
