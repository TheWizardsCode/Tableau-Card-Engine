/**
 * Coloretto scoring logic.
 *
 * Canonical point table per chameleon color:
 *   1 card = 1pt, 2 = 3, 3 = 6, 4 = 10, 5 = 15, 6+ = 21
 *
 * At the end of each round every player selects 3 colors to score
 * POSITIVELY; all other colors they hold score NEGATIVELY using the
 * same table. A player with cards in fewer than 3 colors scores all
 * of their colors positively.
 *
 * Double chameleon cards count as 2 cards of their color. The Last
 * Round card has no color and never scores.
 */

import type { ChameleonColor, ColorettoCard } from './ColorettoCards';
import { COLORS } from './ColorettoCards';

// ── Point table ─────────────────────────────────────────────

/**
 * Canonical point table indexed by card count (0-5); counts of 6+
 * are capped at 21 (the final entry).
 */
export const COLOR_POINTS: readonly number[] = [0, 1, 3, 6, 10, 15, 21];

/** Points for a given number of cards of one color. */
export function pointsForCount(count: number): number {
  if (count <= 0) return 0;
  if (count >= COLOR_POINTS.length) {
    return COLOR_POINTS[COLOR_POINTS.length - 1];
  }
  return COLOR_POINTS[count];
}

// ── Collection analysis ─────────────────────────────────────

/** Count chameleons of a single color (double cards count as 2). */
export function countChameleonsOfColor(
  cards: readonly ColorettoCard[],
  color: ChameleonColor,
): number {
  let total = 0;
  for (const card of cards) {
    if (card.type === 'chameleon' && card.color === color) {
      total += card.count;
    }
  }
  return total;
}

/** Per-color chameleon counts for a collection. */
export function colorCounts(
  cards: readonly ColorettoCard[],
): Record<ChameleonColor, number> {
  const counts: Record<ChameleonColor, number> = {
    red: 0,
    yellow: 0,
    green: 0,
    blue: 0,
    purple: 0,
    orange: 0,
    brown: 0,
  };
  for (const card of cards) {
    if (card.type === 'chameleon') {
      counts[card.color] += card.count;
    }
  }
  return counts;
}

/** Colors present in a collection (with at least one chameleon). */
export function presentColors(
  counts: Record<ChameleonColor, number>,
): ChameleonColor[] {
  return COLORS.filter((color) => counts[color] > 0);
}

// ── Scoring ─────────────────────────────────────────────────

/**
 * Total round score for a collection given the set of positive colors.
 *
 * Positive colors add their points; every other present color
 * subtracts its points.
 */
export function scoreColors(
  collection: readonly ColorettoCard[],
  positiveColors: ReadonlySet<ChameleonColor>,
): number {
  const counts = colorCounts(collection);
  let total = 0;
  for (const color of COLORS) {
    const count = counts[color];
    if (count === 0) continue;
    total += positiveColors.has(color) ? pointsForCount(count) : -pointsForCount(count);
  }
  return total;
}

/** Per-color scoring detail for a collection. */
export interface ColorScoreDetail {
  readonly color: ChameleonColor;
  readonly count: number;
  readonly points: number;
  readonly positive: boolean;
}

/** Full per-player round score with a color-by-color breakdown. */
export interface PlayerRoundScore {
  readonly total: number;
  readonly details: readonly ColorScoreDetail[];
  readonly positiveColors: readonly ChameleonColor[];
}

/**
 * Score a player's round collection with explicit positive colors.
 */
export function scorePlayerRound(
  collection: readonly ColorettoCard[],
  positiveColors: Iterable<ChameleonColor>,
): PlayerRoundScore {
  const counts = colorCounts(collection);
  const positive = new Set(positiveColors);
  const details: ColorScoreDetail[] = [];
  let total = 0;

  for (const color of COLORS) {
    const count = counts[color];
    if (count === 0) continue;
    const isPositive = positive.has(color);
    const points = isPositive ? pointsForCount(count) : -pointsForCount(count);
    total += points;
    details.push({ color, count, points, positive: isPositive });
  }

  return { total, details, positiveColors: [...positive] };
}

// ── Positive color selection ────────────────────────────────

/**
 * Select the 3 colors that maximize a player's round score.
 *
 * With fewer than 3 colors present, all present colors are selected
 * (the canonical "all colors positive" rule). With 3+ colors, every
 * combination of 3 is evaluated; ties resolve to the first in color
 * order for determinism.
 */
export function selectBestPositiveColors(
  collection: readonly ColorettoCard[],
): ChameleonColor[] {
  const counts = colorCounts(collection);
  const present = presentColors(counts);
  if (present.length < 3) return present;

  let bestScore = -Infinity;
  let best: ChameleonColor[] = present.slice(0, 3);
  const n = present.length;

  for (let i = 0; i < n - 2; i++) {
    for (let j = i + 1; j < n - 1; j++) {
      for (let k = j + 1; k < n; k++) {
        const combo = [present[i], present[j], present[k]];
        const score = scoreColors(collection, new Set(combo));
        if (score > bestScore) {
          bestScore = score;
          best = combo;
        }
      }
    }
  }
  return best;
}

/**
 * Resolve the positive colors for a player.
 *
 * Uses the provided selection when non-empty; otherwise falls back to
 * the optimal selection ({@link selectBestPositiveColors}).
 */
export function positiveColorsForPlayer(
  collection: readonly ColorettoCard[],
  provided?: readonly ChameleonColor[],
): ChameleonColor[] {
  if (provided && provided.length > 0) return [...provided];
  return selectBestPositiveColors(collection);
}
