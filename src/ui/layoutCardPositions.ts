/**
 * layoutCardPositions — compute evenly-spaced (or compressed) X positions
 * for a horizontal row of cards, centered around a given X coordinate.
 *
 * Handles the common pattern found across multiple games:
 *  1. Compute ideal width = count * cardWidth + (count - 1) * gap.
 *  2. If a maxWidth is specified and idealWidth exceeds it, compress the
 *     step so the row fits within maxWidth.
 *  3. Center the resulting positions around centerX.
 *
 * The returned positions are **center-X** values (suitable for
 * `Phaser.GameObjects.Image` with default 0.5 origin).
 *
 * @example
 * ```ts
 * const { positions, step } = layoutCardPositions({
 *   count: 5,
 *   cardWidth: 120,
 *   gap: 8,
 *   centerX: 640,
 * });
 * // positions = [384, 512, 640, 768, 896], step = 128
 *
 * // With compression:
 * const { positions, step } = layoutCardPositions({
 *   count: 12,
 *   cardWidth: 120,
 *   gap: 8,
 *   centerX: 640,
 *   maxWidth: 1200,
 * });
 * // step compressed so all 12 cards fit within 1200px
 * ```
 */

// ── Types ───────────────────────────────────────────────────

export interface LayoutCardPositionsOptions {
  /** Number of cards to lay out. */
  count: number;

  /** Width of each card (px). */
  cardWidth: number;

  /**
   * Gap between adjacent cards (px) when there is room.
   * @default 0
   */
  gap?: number;

  /** X coordinate to center the row around. */
  centerX: number;

  /**
   * Maximum allowed width for the row (px).
   *
   * When the ideal width exceeds this value the step is compressed so
   * that the row fits.  The compressed step is computed as
   * `(maxWidth - cardWidth) / (count - 1)` — i.e. cards overlap but
   * the first and last card edges stay within the bounds.
   *
   * If omitted, cards are never compressed.
   */
  maxWidth?: number;
}

export interface LayoutCardPositionsResult {
  /** Center-X positions for each card, left to right. */
  positions: number[];

  /** The horizontal step between adjacent card centers. */
  step: number;
}

// ── Implementation ──────────────────────────────────────────

export function layoutCardPositions(
  options: LayoutCardPositionsOptions,
): LayoutCardPositionsResult {
  const { count, cardWidth, gap = 0, centerX, maxWidth } = options;

  if (count <= 0) {
    return { positions: [], step: 0 };
  }

  if (count === 1) {
    return { positions: [centerX], step: 0 };
  }

  // Ideal (uncompressed) step between card centers
  const idealStep = cardWidth + gap;
  const idealWidth = cardWidth + (count - 1) * idealStep;

  let step: number;

  if (maxWidth !== undefined && idealWidth > maxWidth) {
    // Compress: distribute (count - 1) gaps across (maxWidth - cardWidth)
    step = (maxWidth - cardWidth) / (count - 1);
  } else {
    step = idealStep;
  }

  // Actual occupied width (edge-to-edge of first and last card)
  const actualWidth = cardWidth + (count - 1) * step;

  // Starting center-X so the row is centered around centerX
  const startX = centerX - actualWidth / 2 + cardWidth / 2;

  const positions: number[] = [];
  for (let i = 0; i < count; i++) {
    positions.push(startX + i * step);
  }

  return { positions, step };
}
