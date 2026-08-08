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
 *
 * Joker cards are wild chameleons: at scoring time each joker is
 * declared to a color of the player's choice (one entry per joker in
 * a {@link JokerAssignment}) and counts as 1 card of that color. When
 * no declaration is supplied, scoring falls back to the optimal
 * assignment (see {@link optimalJokerAssignment}).
 *
 * “+2” bonus cards add a flat {@link BONUS_POINTS} each, independent
 * of color scoring.
 */

import type { ChameleonColor, ColorettoCard } from './ColorettoCards';
import { COLORS } from './ColorettoCards';

// ── Point table ─────────────────────────────────────────────

/**
 * Canonical point table indexed by card count (0-5); counts of 6+
 * are capped at 21 (the final entry).
 */
export const COLOR_POINTS: readonly number[] = [0, 1, 3, 6, 10, 15, 21];

/** Flat points awarded by each “+2” bonus card. */
export const BONUS_POINTS = 2;

/** Points for a given number of cards of one color. */
export function pointsForCount(count: number): number {
  if (count <= 0) return 0;
  if (count >= COLOR_POINTS.length) {
    return COLOR_POINTS[COLOR_POINTS.length - 1];
  }
  return COLOR_POINTS[count];
}

// ── Joker declarations ──────────────────────────────────────

/**
 * Per-joker color declaration at scoring time: one color per joker
 * held. Entry i declares that joker i counts as 1 card of that color.
 */
export type JokerAssignment = readonly ChameleonColor[];

/** Number of joker (wild chameleon) cards in a collection. */
export function countJokers(cards: readonly ColorettoCard[]): number {
  return cards.filter((c) => c.type === 'joker').length;
}

/** Number of “+2” bonus cards in a collection. */
export function countBonusCards(cards: readonly ColorettoCard[]): number {
  return cards.filter((c) => c.type === 'bonus').length;
}

// ── Collection analysis ─────────────────────────────────────

/**
 * Count chameleons of a single color (double cards count as 2).
 * Declared jokers count as 1 card of their assigned color each.
 */
export function countChameleonsOfColor(
  cards: readonly ColorettoCard[],
  color: ChameleonColor,
  jokerAssignment?: JokerAssignment,
): number {
  let total = 0;
  for (const card of cards) {
    if (card.type === 'chameleon' && card.color === color) {
      total += card.count;
    }
  }
  if (jokerAssignment) {
    for (const declared of jokerAssignment) {
      if (declared === color) total += 1;
    }
  }
  return total;
}

/**
 * Per-color chameleon counts for a collection, including any declared
 * jokers (each counts as 1 card of its assigned color). Without a
 * joker assignment, jokers contribute to no color (zero-count default).
 */
export function colorCounts(
  cards: readonly ColorettoCard[],
  jokerAssignment?: JokerAssignment,
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
  if (jokerAssignment) {
    for (const declared of jokerAssignment) {
      counts[declared] += 1;
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
 * subtracts its points. Declared jokers count toward their assigned
 * colors; bonus cards are NOT included here (see
 * {@link scorePlayerRound} for the flat bonus term).
 */
export function scoreColors(
  collection: readonly ColorettoCard[],
  positiveColors: ReadonlySet<ChameleonColor>,
  jokerAssignment?: JokerAssignment,
): number {
  return scoreCounts(colorCounts(collection, jokerAssignment), positiveColors);
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
  /** Flat points from “+2” bonus cards (added to {@link total}). */
  readonly bonusPoints: number;
  /** Per-joker color declarations used for this round's scoring. */
  readonly jokerAssignment: JokerAssignment;
}

/**
 * Score a player's round collection with explicit positive colors and
 * an optional per-joker color declaration.
 *
 * Jokers not covered by the assignment contribute to no color; the
 * caller is responsible for providing a complete declaration (see
 * {@link resolvePlayerScoring} for the recommended entry point).
 */
export function scorePlayerRound(
  collection: readonly ColorettoCard[],
  positiveColors: Iterable<ChameleonColor>,
  jokerAssignment?: JokerAssignment,
): PlayerRoundScore {
  const resolved = jokerAssignment ?? [];
  const counts = colorCounts(collection, resolved);
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

  const bonusPoints = countBonusCards(collection) * BONUS_POINTS;
  total += bonusPoints;

  return {
    total,
    details,
    positiveColors: [...positive],
    bonusPoints,
    jokerAssignment: [...resolved],
  };
}

// ── Internal joint-scoring helpers ──────────────────────────

/** Signed point total over per-color counts for a positive set. */
function scoreCounts(
  counts: Record<ChameleonColor, number>,
  positive: ReadonlySet<ChameleonColor>,
): number {
  let total = 0;
  for (const color of COLORS) {
    const count = counts[color];
    if (count === 0) continue;
    total += positive.has(color) ? pointsForCount(count) : -pointsForCount(count);
  }
  return total;
}

/**
 * All ways to distribute `count` identical jokers among the 7 colors,
 * in canonical COLORS order (red-heavy distributions first, so the
 * first-found tie-break prefers earlier colors). Returns one row per
 * distribution, each row the per-color joker counts.
 */
function distributeJokers(count: number): number[][] {
  const bins = COLORS.length;
  const results: number[][] = [];
  const current = new Array<number>(bins).fill(0);

  const rec = (bin: number, remaining: number): void => {
    if (bin === bins - 1) {
      current[bin] = remaining;
      results.push([...current]);
      return;
    }
    for (let assign = remaining; assign >= 0; assign--) {
      current[bin] = assign;
      rec(bin + 1, remaining - assign);
    }
  };

  rec(0, count);
  return results;
}

/** Expand a per-color joker distribution into a per-joker color list. */
function expandAssignment(distribution: readonly number[]): JokerAssignment {
  const assignment: ChameleonColor[] = [];
  distribution.forEach((count, i) => {
    for (let k = 0; k < count; k++) assignment.push(COLORS[i]);
  });
  return assignment;
}

/** Best positive colors (≤3) for fixed per-color counts. */
function bestPositivesForCounts(
  counts: Record<ChameleonColor, number>,
): ChameleonColor[] {
  const present = presentColors(counts);
  if (present.length <= 3) return present;

  let bestScore = -Infinity;
  let best: ChameleonColor[] = present.slice(0, 3);
  const n = present.length;

  for (let i = 0; i < n - 2; i++) {
    for (let j = i + 1; j < n - 1; j++) {
      for (let k = j + 1; k < n; k++) {
        const combo = [present[i], present[j], present[k]];
        const score = scoreCounts(counts, new Set(combo));
        if (score > bestScore) {
          bestScore = score;
          best = combo;
        }
      }
    }
  }
  return best;
}

/** Result of jointly optimizing joker declarations and positive colors. */
interface JointScoring {
  readonly positiveColors: ChameleonColor[];
  readonly jokerAssignment: JokerAssignment;
  readonly total: number;
}

/**
 * Jointly optimize the joker declaration and the positive-color set.
 *
 * Enumerates every way to distribute the held jokers among the 7
 * colors and, for each, the best positive-color set. Ties resolve to
 * the first combination in enumeration order for determinism. With no
 * jokers this reduces exactly to the classic single-color-set optimum.
 */
function bestJointScoring(collection: readonly ColorettoCard[]): JointScoring {
  const baseCounts = colorCounts(collection);
  const jokerCount = countJokers(collection);
  const bonusPoints = countBonusCards(collection) * BONUS_POINTS;
  let best: JointScoring | null = null;

  for (const dist of distributeJokers(jokerCount)) {
    const counts: Record<ChameleonColor, number> = { ...baseCounts };
    dist.forEach((count, i) => {
      counts[COLORS[i]] += count;
    });
    const present = presentColors(counts);
    const positiveSets =
      present.length <= 3 ? [present] : triplesOf(present);
    for (const positive of positiveSets) {
      const total = scoreCounts(counts, new Set(positive)) + bonusPoints;
      if (!best || total > best.total) {
        best = {
          positiveColors: positive,
          jokerAssignment: expandAssignment(dist),
          total,
        };
      }
    }
  }

  return best ?? { positiveColors: [], jokerAssignment: [], total: 0 };
}

/** All C(n,3) triples of an array in index order. */
function triplesOf<T>(items: readonly T[]): T[][] {
  const result: T[][] = [];
  const n = items.length;
  for (let i = 0; i < n - 2; i++) {
    for (let j = i + 1; j < n - 1; j++) {
      for (let k = j + 1; k < n; k++) {
        result.push([items[i], items[j], items[k]]);
      }
    }
  }
  return result;
}

/** Best joker declaration given a fixed positive-color set. */
function bestAssignmentForPositives(
  collection: readonly ColorettoCard[],
  positive: ReadonlySet<ChameleonColor>,
): JokerAssignment {
  const baseCounts = colorCounts(collection);
  const jokerCount = countJokers(collection);
  const bonusPoints = countBonusCards(collection) * BONUS_POINTS;
  let bestAssignment: JokerAssignment = [];
  let bestTotal = -Infinity;

  for (const dist of distributeJokers(jokerCount)) {
    const counts: Record<ChameleonColor, number> = { ...baseCounts };
    dist.forEach((count, i) => {
      counts[COLORS[i]] += count;
    });
    const total = scoreCounts(counts, positive) + bonusPoints;
    if (total > bestTotal) {
      bestTotal = total;
      bestAssignment = expandAssignment(dist);
    }
  }
  return bestAssignment;
}

// ── Positive color selection ────────────────────────────────

/**
 * Select the 3 colors that maximize a player's round score, jointly
 * optimizing the joker declaration when the player holds jokers.
 *
 * With fewer than 3 colors present, all present colors are selected
 * (the canonical "all colors positive" rule). With 3+ colors, every
 * combination of 3 is evaluated; ties resolve to the first in color
 * order for determinism.
 */
export function selectBestPositiveColors(
  collection: readonly ColorettoCard[],
  jokerAssignment?: JokerAssignment,
): ChameleonColor[] {
  if (jokerAssignment && jokerAssignment.length > 0) {
    return bestPositivesForCounts(colorCounts(collection, jokerAssignment));
  }
  return bestJointScoring(collection).positiveColors;
}

/**
 * Optimal per-joker color declaration for a collection.
 *
 * With no positive set given, the declaration is part of the joint
 * optimum (jokers + positives). With a positive set, the declaration
 * maximizes the score for exactly those positives.
 */
export function optimalJokerAssignment(
  collection: readonly ColorettoCard[],
  positiveColors?: Iterable<ChameleonColor>,
): JokerAssignment {
  if (positiveColors) {
    return bestAssignmentForPositives(collection, new Set(positiveColors));
  }
  return bestJointScoring(collection).jokerAssignment;
}

/**
 * Resolve the full scoring inputs for a player: positive colors and a
 * joker declaration.
 *
 * - Explicit positives win when provided; otherwise the joint optimum
 *   decides them.
 * - An explicit joker declaration wins when provided; otherwise the
 *   declaration is optimized for the resolved positive colors (or
 *   jointly when neither is provided).
 */
export function resolvePlayerScoring(
  collection: readonly ColorettoCard[],
  providedPositiveColors?: readonly ChameleonColor[],
  providedJokerAssignment?: JokerAssignment,
): { positiveColors: ChameleonColor[]; jokerAssignment: JokerAssignment } {
  const positiveColors =
    providedPositiveColors && providedPositiveColors.length > 0
      ? [...providedPositiveColors]
      : selectBestPositiveColors(collection, providedJokerAssignment);
  const jokerAssignment =
    providedJokerAssignment && providedJokerAssignment.length > 0
      ? [...providedJokerAssignment]
      : optimalJokerAssignment(collection, positiveColors);
  return { positiveColors, jokerAssignment };
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
  return resolvePlayerScoring(collection, provided).positiveColors;
}
