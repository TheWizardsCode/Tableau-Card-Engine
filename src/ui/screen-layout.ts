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

function resolveRect(
  rect: NormalizedRect,
  viewport: LayoutViewport,
  baseViewport: ScreenLayoutDocument['baseViewport'],
  dpr: number,
): PixelRect {
  if (rect.pixelOverride) {
    const scaleX = (viewport.width * dpr) / baseViewport.width;
    const scaleY = (viewport.height * dpr) / baseViewport.height;
    return {
      x: rect.pixelOverride.x * scaleX,
      y: rect.pixelOverride.y * scaleY,
      width: rect.pixelOverride.width * scaleX,
      height: rect.pixelOverride.height * scaleY,
    };
  }

  return {
    x: toPixels(rect.x, viewport.width, dpr),
    y: toPixels(rect.y, viewport.height, dpr),
    width: toPixels(rect.width, viewport.width, dpr),
    height: toPixels(rect.height, viewport.height, dpr),
  };
}

function resolveAnchor(
  anchor: NormalizedPoint,
  zoneRect: PixelRect,
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
    x: zoneRect.x + zoneRect.width * anchor.x,
    y: zoneRect.y + zoneRect.height * anchor.y,
  };
}

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

export function pixelToNormalized(
  rect: PixelRect,
  viewport: LayoutViewport,
  dpr = 1,
): NormalizedRect {
  return {
    x: rect.x / (viewport.width * dpr),
    y: rect.y / (viewport.height * dpr),
    width: rect.width / (viewport.width * dpr),
    height: rect.height / (viewport.height * dpr),
  };
}

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
