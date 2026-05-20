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

function toPixels(
  value: number,
  viewportAxis: number,
  dpr: number,
): number {
  return value * viewportAxis * dpr;
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
): PixelRect {
  const resolved = normalizedToPixels(layout, viewport, dpr);
  const zone = resolved.zones[zoneName];

  if (!zone) {
    throw new Error(`Unknown zone: ${zoneName}`);
  }

  return zone.rect;
}

export function anchorPoint(
  layout: ScreenLayoutDocument,
  zoneName: string,
  anchorName: string,
  viewport: LayoutViewport,
  dpr = 1,
): PixelPoint {
  const resolved = normalizedToPixels(layout, viewport, dpr);
  const zone = resolved.zones[zoneName];

  if (!zone) {
    throw new Error(`Unknown zone: ${zoneName}`);
  }

  const anchor = zone.anchors[anchorName];
  if (!anchor) {
    throw new Error(`Unknown anchor "${anchorName}" in zone "${zoneName}"`);
  }

  return anchor;
}
