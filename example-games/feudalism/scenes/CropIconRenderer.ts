/**
 * CropIconRenderer.ts
 *
 * Generates and renders crop-themed icons for Feudalism resource tokens.
 * Icons are drawn programmatically using Phaser Graphics primitives and
 * cached as textures for reuse at different sizes.
 *
 * Each crop has a simple, recognisable silhouette:
 *   - Oats:   three drooping grain heads on stalks
 *   - Flax:   five-petal flower
 *   - Wheat:  upright wheat ear with chevron kernels
 *   - Barley:  barley ear with long awns (whiskers)
 *   - Turnip: round root with leaf sprout
 *   - Mead:   honeycomb hexagon cluster
 *
 * Icons are drawn in the token's text colour (from RESOURCE_TEXT_COLOR)
 * at reduced opacity so the count numeral remains readable on top.
 *
 * Related work item: CG-0MM5KDA9E0QG6OKY
 */

import type { ResourceOrWild } from '../FeudalismCards';

/** Icon alpha — subtle enough that overlaid count text stays readable. */
const ICON_ALPHA = 0.28;

// ── Helper: draw a filled ellipse ──────────────────────────
// Phaser 3.x Graphics has no fillEllipse(). We draw an ellipse
// using an arc path with scale transforms applied manually.

/**
 * Draw a filled ellipse at (cx, cy) with the given semi-axes.
 * Uses fillPoints with a polygon approximation of an ellipse.
 */
function fillEllipse(
  g: Phaser.GameObjects.Graphics,
  cx: number,
  cy: number,
  width: number,
  height: number,
): void {
  const segments = 24;
  const points: Phaser.Geom.Point[] = [];
  const rx = width / 2;
  const ry = height / 2;
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    points.push(new Phaser.Geom.Point(
      cx + Math.cos(angle) * rx,
      cy + Math.sin(angle) * ry,
    ));
  }
  g.fillPoints(points, true);
}

// ── Individual crop drawing functions ───────────────────────

/**
 * All draw functions receive a Graphics object, the centre of the drawing
 * area (cx, cy), the drawable radius `r`, and the stroke colour (numeric).
 */
type DrawFn = (
  g: Phaser.GameObjects.Graphics,
  cx: number,
  cy: number,
  r: number,
  color: number,
) => void;

/** Oats — three drooping grain heads on thin stalks. */
function drawOats(
  g: Phaser.GameObjects.Graphics,
  cx: number,
  cy: number,
  r: number,
  color: number,
): void {
  const headR = r * 0.18;
  const spread = r * 0.35;

  // Three stalks with slight droop
  for (const dx of [-spread, 0, spread]) {
    const baseY = cy + r * 0.35;
    const topY = cy - r * 0.35 + Math.abs(dx) * 0.3;
    // Stalk
    g.lineStyle(Math.max(1, r * 0.06), color, ICON_ALPHA);
    g.beginPath();
    g.moveTo(cx + dx * 0.5, baseY);
    g.lineTo(cx + dx, topY);
    g.strokePath();
    // Grain head (oval)
    fillEllipse(g, cx + dx, topY - headR, headR * 1.4, headR * 2.2);
  }
}

/** Flax — simple five-petal flower. */
function drawFlax(
  g: Phaser.GameObjects.Graphics,
  cx: number,
  cy: number,
  r: number,
  _color: number,
): void {
  const petalR = r * 0.28;
  const dist = r * 0.32;
  const petals = 5;

  for (let i = 0; i < petals; i++) {
    const angle = (i * Math.PI * 2) / petals - Math.PI / 2;
    const px = cx + Math.cos(angle) * dist;
    const py = cy + Math.sin(angle) * dist;
    g.fillCircle(px, py, petalR);
  }
  // Centre dot
  g.fillCircle(cx, cy, r * 0.15);
}

/** Wheat — upright ear with chevron kernels. */
function drawWheat(
  g: Phaser.GameObjects.Graphics,
  cx: number,
  cy: number,
  r: number,
  color: number,
): void {
  const lineW = Math.max(1, r * 0.07);
  g.lineStyle(lineW, color, ICON_ALPHA);

  // Central stalk
  const top = cy - r * 0.55;
  const bottom = cy + r * 0.45;
  g.beginPath();
  g.moveTo(cx, bottom);
  g.lineTo(cx, top);
  g.strokePath();

  // Chevron kernels (alternating left-right)
  const kernelCount = 4;
  const kernelSpan = r * 0.32;
  const startY = cy - r * 0.4;
  const gap = r * 0.22;

  for (let i = 0; i < kernelCount; i++) {
    const ky = startY + i * gap;
    // Left kernel
    g.beginPath();
    g.moveTo(cx, ky);
    g.lineTo(cx - kernelSpan, ky - gap * 0.4);
    g.strokePath();
    // Right kernel
    g.beginPath();
    g.moveTo(cx, ky);
    g.lineTo(cx + kernelSpan, ky - gap * 0.4);
    g.strokePath();
  }
}

/** Barley — ear with long awns (whisker lines). */
function drawBarley(
  g: Phaser.GameObjects.Graphics,
  cx: number,
  cy: number,
  r: number,
  color: number,
): void {
  const lineW = Math.max(1, r * 0.06);
  g.lineStyle(lineW, color, ICON_ALPHA);

  // Central stalk
  const top = cy - r * 0.55;
  const bottom = cy + r * 0.5;
  g.beginPath();
  g.moveTo(cx, bottom);
  g.lineTo(cx, top);
  g.strokePath();

  // Awns — long diagonal lines
  const awnCount = 5;
  const awnLen = r * 0.4;
  const startY = cy - r * 0.45;
  const gap = r * 0.18;

  for (let i = 0; i < awnCount; i++) {
    const ky = startY + i * gap;
    const side = i % 2 === 0 ? -1 : 1;
    g.beginPath();
    g.moveTo(cx, ky);
    g.lineTo(cx + side * awnLen, ky - gap * 0.7);
    g.strokePath();
  }
}

/** Turnip — round root bulb with a small leaf sprout on top. */
function drawTurnip(
  g: Phaser.GameObjects.Graphics,
  cx: number,
  cy: number,
  r: number,
  color: number,
): void {
  // Root bulb (slightly flattened ellipse, lower half)
  const bulbR = r * 0.4;
  fillEllipse(g, cx, cy + r * 0.08, bulbR * 2, bulbR * 1.8);

  // Tapered root tip
  const lineW = Math.max(1, r * 0.07);
  g.lineStyle(lineW, color, ICON_ALPHA);
  g.beginPath();
  g.moveTo(cx, cy + r * 0.08 + bulbR * 0.7);
  g.lineTo(cx, cy + r * 0.5);
  g.strokePath();

  // Two small leaf shapes sprouting upward
  const leafH = r * 0.35;
  const leafW = r * 0.18;
  for (const side of [-1, 1]) {
    fillEllipse(g, cx + side * leafW * 0.8, cy - r * 0.25 - leafH * 0.3, leafW, leafH);
  }
}

/** Mead — honeycomb: cluster of hexagons. */
function drawMead(
  g: Phaser.GameObjects.Graphics,
  cx: number,
  cy: number,
  r: number,
  color: number,
): void {
  const hexR = r * 0.22;
  const lineW = Math.max(1, r * 0.06);
  g.lineStyle(lineW, color, ICON_ALPHA);

  // Draw a single hexagon outline
  const drawHex = (hcx: number, hcy: number, hr: number): void => {
    g.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i - Math.PI / 6;
      const hx = hcx + Math.cos(angle) * hr;
      const hy = hcy + Math.sin(angle) * hr;
      if (i === 0) g.moveTo(hx, hy);
      else g.lineTo(hx, hy);
    }
    g.closePath();
    g.strokePath();
  };

  // Centre hex
  drawHex(cx, cy, hexR);

  // Ring of 6 surrounding hexagons
  const ringDist = hexR * 1.76;
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i;
    drawHex(
      cx + Math.cos(angle) * ringDist,
      cy + Math.sin(angle) * ringDist,
      hexR,
    );
  }
}

/** Map from resource type to its drawing function. */
const CROP_DRAW_FN: Record<ResourceOrWild, DrawFn> = {
  oats: drawOats,
  flax: drawFlax,
  wheat: drawWheat,
  barley: drawBarley,
  turnip: drawTurnip,
  mead: drawMead,
};

// ── Public API ──────────────────────────────────────────────

/**
 * Generate and cache a crop-icon texture for the given resource at the
 * given token radius. Call this once per (resource, radius) pair during
 * scene setup or first use.
 *
 * The texture key follows the pattern `crop-icon-{resource}-{radius}`.
 *
 * @param scene  Phaser scene used for graphics/texture generation
 * @param resource  The crop / mead resource type
 * @param tokenRadius  The radius of the token the icon will be placed on
 * @param strokeColor  The icon stroke/fill colour (numeric, e.g. 0x000000)
 */
export function generateCropIconTexture(
  scene: Phaser.Scene,
  resource: ResourceOrWild,
  tokenRadius: number,
  strokeColor: number,
): string {
  const key = `crop-icon-${resource}-${tokenRadius}`;

  // Return cached texture if it already exists
  if (scene.textures.exists(key)) return key;

  const diameter = tokenRadius * 2;
  const g = scene.add.graphics();

  // Set fill colour at icon alpha for shape fills
  g.fillStyle(strokeColor, ICON_ALPHA);

  // Draw the icon centred in the texture area
  const cx = tokenRadius;
  const cy = tokenRadius;
  const drawR = tokenRadius * 0.7; // inset from edge

  CROP_DRAW_FN[resource](g, cx, cy, drawR, strokeColor);

  // Generate texture from graphics
  g.generateTexture(key, diameter, diameter);
  g.destroy();

  return key;
}

/**
 * Add a crop icon sprite onto a token at the specified position.
 * Generates the texture if needed.
 *
 * @param scene  Phaser scene
 * @param x  Centre X of the token
 * @param y  Centre Y of the token
 * @param resource  The crop / mead resource type
 * @param tokenRadius  The radius of the token
 * @param strokeColor  The icon colour (number, e.g. 0x000000)
 * @returns The created Image (for adding to containers)
 */
export function addCropIcon(
  scene: Phaser.Scene,
  x: number,
  y: number,
  resource: ResourceOrWild,
  tokenRadius: number,
  strokeColor: number,
): Phaser.GameObjects.Image {
  const key = generateCropIconTexture(scene, resource, tokenRadius, strokeColor);
  const icon = scene.add.image(x, y, key);
  icon.setOrigin(0.5);
  return icon;
}

/**
 * Convert a CSS hex colour string (e.g. '#000000') to a numeric colour
 * value (e.g. 0x000000) suitable for Phaser Graphics calls.
 */
export function cssColorToNumber(cssColor: string): number {
  return parseInt(cssColor.replace('#', ''), 16);
}
