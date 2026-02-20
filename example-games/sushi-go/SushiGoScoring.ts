/**
 * Scoring logic for Sushi Go!
 *
 * Scoring rules per card type:
 *   - Tempura:    Each pair = 5 pts (1 leftover = 0)
 *   - Sashimi:    Each set of 3 = 10 pts (1-2 leftover = 0)
 *   - Dumpling:   1=1, 2=3, 3=6, 4=10, 5+=15
 *   - Nigiri:     Egg=1, Salmon=2, Squid=3
 *   - Wasabi:     Triples the next nigiri played on it (0 pts alone)
 *   - Maki Rolls: Most icons = 6 pts, 2nd most = 3 pts (split on tie)
 *   - Pudding:    End-of-game: most = +6 pts, fewest = -6 pts (split on tie)
 *   - Chopsticks: 0 pts (utility card only)
 *
 * Wasabi + Nigiri pairing:
 *   In the real game, when you play a nigiri onto a wasabi, the wasabi
 *   "consumes" the nigiri for triple value. We model this by tracking
 *   the order cards were played: each wasabi pairs with the first
 *   nigiri played after it (in tableau order).
 */

import type {
  SushiGoCard,
  NigiriCard,
} from './SushiGoCards';

// ── Single-card scoring helpers ─────────────────────────────

/** Base point value of a nigiri card (before wasabi). */
export function nigiriBaseValue(variant: NigiriCard['variant']): number {
  switch (variant) {
    case 'egg':
      return 1;
    case 'salmon':
      return 2;
    case 'squid':
      return 3;
  }
}

/** Dumpling scoring lookup: count -> cumulative points. */
const DUMPLING_SCORES = [0, 1, 3, 6, 10, 15] as const;

/**
 * Score for a given number of dumplings.
 * 5 or more dumplings all score 15 (max).
 */
export function dumplingScore(count: number): number {
  if (count <= 0) return 0;
  if (count >= 5) return 15;
  return DUMPLING_SCORES[count];
}

// ── Tableau scoring ─────────────────────────────────────────

/**
 * Score a player's tableau for the current round.
 *
 * This scores everything EXCEPT maki rolls and pudding,
 * which are scored across all players (see scoreMaki / scorePudding).
 *
 * Wasabi pairing: wasabi cards pair with the first nigiri that
 * appears after them in tableau order. A wasabi without a following
 * nigiri scores 0. A nigiri without a preceding wasabi scores its
 * base value.
 *
 * @param tableau  The player's collected cards for this round (in play order).
 * @returns        The round score excluding maki/pudding bonuses.
 */
export function scoreTableau(tableau: SushiGoCard[]): number {
  let score = 0;

  // Count set-based cards
  let tempuraCount = 0;
  let sashimiCount = 0;
  let dumplingCount = 0;

  // Track wasabi pairing: queue of unpaired wasabi cards
  let unpairedWasabi = 0;

  for (const card of tableau) {
    switch (card.type) {
      case 'tempura':
        tempuraCount++;
        break;

      case 'sashimi':
        sashimiCount++;
        break;

      case 'dumpling':
        dumplingCount++;
        break;

      case 'nigiri': {
        const base = nigiriBaseValue(card.variant);
        if (unpairedWasabi > 0) {
          score += base * 3;
          unpairedWasabi--;
        } else {
          score += base;
        }
        break;
      }

      case 'wasabi':
        unpairedWasabi++;
        break;

      // maki, pudding, chopsticks: scored elsewhere or 0 pts
      case 'maki':
      case 'pudding':
      case 'chopsticks':
        break;
    }
  }

  // Tempura: each pair = 5 pts
  score += Math.floor(tempuraCount / 2) * 5;

  // Sashimi: each set of 3 = 10 pts
  score += Math.floor(sashimiCount / 3) * 10;

  // Dumplings
  score += dumplingScore(dumplingCount);

  return score;
}

// ── Maki scoring (across all players) ───────────────────────

/**
 * Count the total maki roll icons in a tableau.
 */
export function countMakiIcons(tableau: SushiGoCard[]): number {
  let icons = 0;
  for (const card of tableau) {
    if (card.type === 'maki') {
      icons += card.icons;
    }
  }
  return icons;
}

/**
 * Count pudding cards in a tableau.
 */
export function countPudding(tableau: SushiGoCard[]): number {
  let count = 0;
  for (const card of tableau) {
    if (card.type === 'pudding') {
      count++;
    }
  }
  return count;
}

/**
 * Score maki roll bonuses across all players.
 *
 * The player with the most maki icons gets 6 pts.
 * The player with the 2nd most gets 3 pts.
 * Ties split the points evenly (rounded down).
 * If all players tie for most, they all split the 6 pts and no
 * 2nd place is awarded.
 *
 * @param makiCounts  Array of maki icon counts, one per player.
 * @returns           Array of maki bonus points, one per player.
 */
export function scoreMaki(makiCounts: number[]): number[] {
  const bonuses = new Array(makiCounts.length).fill(0);

  if (makiCounts.length === 0) return bonuses;

  // Find max maki count
  const maxMaki = Math.max(...makiCounts);
  if (maxMaki === 0) return bonuses;

  // Find players tied for most
  const mostIndices = makiCounts
    .map((c, i) => (c === maxMaki ? i : -1))
    .filter((i) => i >= 0);

  // Split 6 pts among tied-for-most
  const firstPlaceShare = Math.floor(6 / mostIndices.length);
  for (const i of mostIndices) {
    bonuses[i] = firstPlaceShare;
  }

  // If more than one player tied for most, no 2nd place
  if (mostIndices.length > 1) return bonuses;

  // Find 2nd most
  const remaining = makiCounts.filter((_, i) => !mostIndices.includes(i));
  if (remaining.length === 0) return bonuses;

  const secondMax = Math.max(...remaining);
  if (secondMax === 0) return bonuses;

  const secondIndices = makiCounts
    .map((c, i) => (c === secondMax && !mostIndices.includes(i) ? i : -1))
    .filter((i) => i >= 0);

  const secondPlaceShare = Math.floor(3 / secondIndices.length);
  for (const i of secondIndices) {
    bonuses[i] = secondPlaceShare;
  }

  return bonuses;
}

// ── Pudding scoring (end of game) ───────────────────────────

/**
 * Score pudding bonuses at the end of the game.
 *
 * Most puddings = +6 pts (split on tie).
 * Fewest puddings = -6 pts (split on tie).
 * If all players are tied, no bonus or penalty is applied.
 *
 * @param puddingCounts  Array of pudding counts, one per player.
 * @returns              Array of pudding bonus/penalty points.
 */
export function scorePudding(puddingCounts: number[]): number[] {
  const bonuses = new Array(puddingCounts.length).fill(0);

  if (puddingCounts.length === 0) return bonuses;

  const maxPudding = Math.max(...puddingCounts);
  const minPudding = Math.min(...puddingCounts);

  // If everyone has the same count, no bonuses or penalties
  if (maxPudding === minPudding) return bonuses;

  // Most puddings: +6 split
  const mostIndices = puddingCounts
    .map((c, i) => (c === maxPudding ? i : -1))
    .filter((i) => i >= 0);

  const mostShare = Math.floor(6 / mostIndices.length);
  for (const i of mostIndices) {
    bonuses[i] = mostShare;
  }

  // Fewest puddings: -6 split
  const fewestIndices = puddingCounts
    .map((c, i) => (c === minPudding ? i : -1))
    .filter((i) => i >= 0);

  const fewestShare = Math.floor(6 / fewestIndices.length);
  for (const i of fewestIndices) {
    bonuses[i] = -fewestShare;
  }

  return bonuses;
}
