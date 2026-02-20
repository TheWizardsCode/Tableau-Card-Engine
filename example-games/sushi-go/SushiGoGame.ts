/**
 * Sushi Go! game orchestration -- drafting mechanics, round management,
 * and game flow.
 *
 * Game flow:
 *   1. Setup: Create deck, deal hands (10 cards each for 2 players).
 *   2. Draft phase (per round): Each turn, all players simultaneously
 *      pick one card from their hand. After picking, hands are passed
 *      to the next player. Repeat until all cards are picked.
 *   3. Score: At end of each round, score tableaux + maki bonuses.
 *      Pudding cards carry over and are scored at the very end.
 *   4. Repeat for 3 rounds. After round 3, score pudding bonuses.
 *
 * Chopsticks: If a player has chopsticks in their tableau, they may
 * pick two cards from their hand instead of one, then return the
 * chopsticks to the hand (which will be passed to the next player).
 */

import type { SushiGoCard } from './SushiGoCards';
import {
  createSushiGoDeck,
  shuffleDeck,
  cardsPerPlayer,
  ROUND_COUNT,
} from './SushiGoCards';
import {
  scoreTableau,
  countMakiIcons,
  countPudding,
  scoreMaki,
  scorePudding,
} from './SushiGoScoring';

// ── Player state ────────────────────────────────────────────

export interface SushiGoPlayerState {
  readonly name: string;
  readonly isAI: boolean;
  /** Cards currently in hand (available to pick from). */
  hand: SushiGoCard[];
  /** Cards collected this round (in play order). */
  tableau: SushiGoCard[];
  /** Cumulative pudding count across all rounds. */
  puddingCount: number;
  /** Score per round (index = round number, 0-based). */
  roundScores: number[];
  /** Total score across all rounds (updated after each round). */
  totalScore: number;
}

// ── Game phases ─────────────────────────────────────────────

export type SushiGoPhase =
  | 'setup'
  | 'picking'       // Players are choosing cards
  | 'round-scoring' // Round just ended, scoring in progress
  | 'game-over';    // All 3 rounds complete

// ── Session state ───────────────────────────────────────────

export interface SushiGoSession {
  players: SushiGoPlayerState[];
  phase: SushiGoPhase;
  /** Current round number (0-based, 0-2). */
  currentRound: number;
  /** Current turn within the round (0-based). */
  currentTurn: number;
  /** Cards per player for this game (depends on player count). */
  readonly cardsPerPlayer: number;
  /** Total rounds (always 3). */
  readonly totalRounds: number;
  /** RNG for shuffling. */
  readonly rng: () => number;
}

// ── Setup ───────────────────────────────────────────────────

export interface SushiGoSetupOptions {
  /** Player count (default 2). */
  playerCount?: number;
  /** Player names. */
  playerNames?: string[];
  /** Which players are AI. */
  isAI?: boolean[];
  /** RNG for shuffling (default Math.random). */
  rng?: () => number;
}

/**
 * Create a new Sushi Go! game session and deal the first round.
 */
export function setupSushiGoGame(
  options: SushiGoSetupOptions = {},
): SushiGoSession {
  const {
    playerCount = 2,
    playerNames,
    isAI,
    rng = Math.random,
  } = options;

  const names =
    playerNames ??
    Array.from({ length: playerCount }, (_, i) =>
      i === 0 ? 'You' : `AI ${i}`,
    );
  const aiFlags =
    isAI ?? Array.from({ length: playerCount }, (_, i) => i > 0);

  const players: SushiGoPlayerState[] = names.map((name, i) => ({
    name,
    isAI: aiFlags[i],
    hand: [],
    tableau: [],
    puddingCount: 0,
    roundScores: [],
    totalScore: 0,
  }));

  const cpp = cardsPerPlayer(playerCount);

  const session: SushiGoSession = {
    players,
    phase: 'setup',
    currentRound: 0,
    currentTurn: 0,
    cardsPerPlayer: cpp,
    totalRounds: ROUND_COUNT,
    rng,
  };

  // Deal first round
  dealRound(session);

  return session;
}

// ── Deal ────────────────────────────────────────────────────

/**
 * Deal cards for the current round. Creates a fresh shuffled deck
 * and deals `cardsPerPlayer` cards to each player.
 */
export function dealRound(session: SushiGoSession): void {
  const deck = createSushiGoDeck();
  shuffleDeck(deck, session.rng);

  for (const player of session.players) {
    player.hand = deck.splice(0, session.cardsPerPlayer);
    player.tableau = [];
  }

  session.phase = 'picking';
  session.currentTurn = 0;
}

// ── Pick mechanics ──────────────────────────────────────────

/**
 * A player's pick action for a single turn.
 */
export interface PickAction {
  /** Index of the card in the player's hand to pick. */
  cardIndex: number;
  /**
   * Optional second card index for chopsticks usage.
   * If set, the player picks two cards and returns chopsticks to hand.
   */
  secondCardIndex?: number;
}

/**
 * Validate a pick action for a player.
 */
export function validatePick(
  player: SushiGoPlayerState,
  action: PickAction,
): { valid: true } | { valid: false; reason: string } {
  if (action.cardIndex < 0 || action.cardIndex >= player.hand.length) {
    return { valid: false, reason: `Card index ${action.cardIndex} out of bounds` };
  }

  if (action.secondCardIndex !== undefined) {
    // Chopsticks usage: must have chopsticks in tableau
    const hasChopsticks = player.tableau.some((c) => c.type === 'chopsticks');
    if (!hasChopsticks) {
      return {
        valid: false,
        reason: 'Cannot pick two cards without chopsticks in tableau',
      };
    }
    if (
      action.secondCardIndex < 0 ||
      action.secondCardIndex >= player.hand.length
    ) {
      return {
        valid: false,
        reason: `Second card index ${action.secondCardIndex} out of bounds`,
      };
    }
    if (action.cardIndex === action.secondCardIndex) {
      return { valid: false, reason: 'Cannot pick the same card twice' };
    }
  }

  return { valid: true };
}

/**
 * Execute picks for all players simultaneously.
 *
 * Each player picks one card (or two with chopsticks) from their hand
 * and adds it to their tableau.
 *
 * @param session  The game session.
 * @param picks    Array of pick actions, one per player.
 * @throws         If any pick is invalid.
 */
export function executeAllPicks(
  session: SushiGoSession,
  picks: PickAction[],
): void {
  if (session.phase !== 'picking') {
    throw new Error(`Cannot pick in phase: ${session.phase}`);
  }
  if (picks.length !== session.players.length) {
    throw new Error(
      `Expected ${session.players.length} picks, got ${picks.length}`,
    );
  }

  // Validate all picks first
  for (let i = 0; i < picks.length; i++) {
    const result = validatePick(session.players[i], picks[i]);
    if (!result.valid) {
      throw new Error(`Invalid pick for player ${i}: ${result.reason}`);
    }
  }

  // Apply picks
  for (let i = 0; i < picks.length; i++) {
    applyPick(session.players[i], picks[i]);
  }

  session.currentTurn++;

  // Check if round is over (all cards picked)
  if (session.players[0].hand.length === 0) {
    session.phase = 'round-scoring';
  } else {
    // Pass hands
    passHands(session);
  }
}

/**
 * Apply a single player's pick action (mutates player state).
 */
function applyPick(player: SushiGoPlayerState, action: PickAction): void {
  if (action.secondCardIndex !== undefined) {
    // Chopsticks: pick two cards, return chopsticks to hand
    // Remove cards in reverse index order to avoid shifting issues
    const indices = [action.cardIndex, action.secondCardIndex].sort(
      (a, b) => b - a,
    );
    const pickedCards: SushiGoCard[] = [];
    for (const idx of indices) {
      pickedCards.push(player.hand.splice(idx, 1)[0]);
    }
    player.tableau.push(...pickedCards);

    // Return one chopsticks from tableau to hand
    const chopIdx = player.tableau.findIndex((c) => c.type === 'chopsticks');
    if (chopIdx >= 0) {
      const chopsticks = player.tableau.splice(chopIdx, 1)[0];
      player.hand.push(chopsticks);
    }
  } else {
    // Normal: pick one card
    const [card] = player.hand.splice(action.cardIndex, 1);
    player.tableau.push(card);
  }
}

// ── Hand passing ────────────────────────────────────────────

/**
 * Pass hands between players.
 *
 * In Sushi Go!, hands pass left (clockwise). In odd rounds (0-based:
 * rounds 0 and 2), hands pass left. In even rounds (round 1), hands
 * pass right. For 2 players, left and right are equivalent (swap).
 */
export function passHands(session: SushiGoSession): void {
  const { players, currentRound } = session;
  const n = players.length;

  if (n <= 1) return;

  // For 2 players, direction doesn't matter -- just swap
  if (n === 2) {
    const temp = players[0].hand;
    players[0].hand = players[1].hand;
    players[1].hand = temp;
    return;
  }

  // Determine direction: rounds 0,2 = left, round 1 = right
  const passLeft = currentRound % 2 === 0;

  const hands = players.map((p) => p.hand);
  if (passLeft) {
    // Each player gets the hand from the player to their right
    const last = hands[n - 1];
    for (let i = n - 1; i > 0; i--) {
      players[i].hand = hands[i - 1];
    }
    players[0].hand = last;
  } else {
    // Each player gets the hand from the player to their left
    const first = hands[0];
    for (let i = 0; i < n - 1; i++) {
      players[i].hand = hands[i + 1];
    }
    players[n - 1].hand = first;
  }
}

// ── Round scoring ───────────────────────────────────────────

/**
 * Score the current round for all players.
 *
 * Scores tableau (tempura, sashimi, dumpling, nigiri, wasabi)
 * plus maki bonuses. Pudding is accumulated but scored at game end.
 *
 * After scoring, advances to the next round or ends the game.
 */
export function scoreRound(session: SushiGoSession): RoundResult {
  if (session.phase !== 'round-scoring') {
    throw new Error(`Cannot score in phase: ${session.phase}`);
  }

  const { players, currentRound } = session;

  // Score each player's tableau
  const tableauScores = players.map((p) => scoreTableau(p.tableau));

  // Score maki bonuses
  const makiCounts = players.map((p) => countMakiIcons(p.tableau));
  const makiBonuses = scoreMaki(makiCounts);

  // Record round scores
  const roundScores = players.map(
    (_, i) => tableauScores[i] + makiBonuses[i],
  );

  for (let i = 0; i < players.length; i++) {
    players[i].roundScores.push(roundScores[i]);
    players[i].totalScore += roundScores[i];

    // Accumulate pudding count
    players[i].puddingCount += countPudding(players[i].tableau);
  }

  const result: RoundResult = {
    round: currentRound,
    tableauScores,
    makiCounts,
    makiBonuses,
    roundScores,
  };

  // Advance to next round or end game
  if (currentRound >= session.totalRounds - 1) {
    // Game over -- score pudding
    const puddingCounts = players.map((p) => p.puddingCount);
    const puddingBonuses = scorePudding(puddingCounts);

    for (let i = 0; i < players.length; i++) {
      players[i].totalScore += puddingBonuses[i];
    }

    result.puddingCounts = puddingCounts;
    result.puddingBonuses = puddingBonuses;

    session.phase = 'game-over';
  } else {
    // Next round
    session.currentRound++;
    dealRound(session);
  }

  return result;
}

// ── Result types ────────────────────────────────────────────

export interface RoundResult {
  round: number;
  tableauScores: number[];
  makiCounts: number[];
  makiBonuses: number[];
  roundScores: number[];
  /** Only present after the final round. */
  puddingCounts?: number[];
  puddingBonuses?: number[];
}

// ── Game state queries ──────────────────────────────────────

/** Whether the game is over. */
export function isGameOver(session: SushiGoSession): boolean {
  return session.phase === 'game-over';
}

/** Get the winning player index (highest total score). Ties broken by index. */
export function getWinnerIndex(session: SushiGoSession): number {
  let best = -1;
  let bestScore = -Infinity;
  for (let i = 0; i < session.players.length; i++) {
    if (session.players[i].totalScore > bestScore) {
      bestScore = session.players[i].totalScore;
      best = i;
    }
  }
  return best;
}

/** Check if the current round's picking phase is over. */
export function isRoundPickingDone(session: SushiGoSession): boolean {
  return session.phase === 'round-scoring';
}
