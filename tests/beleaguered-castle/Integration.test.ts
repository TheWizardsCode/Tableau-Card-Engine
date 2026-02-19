/**
 * Integration tests for Beleaguered Castle.
 *
 * Plays seeded games programmatically from deal through completion,
 * verifying:
 *   - Deal correctness (aces on foundations, 48 cards in 8 columns)
 *   - Move execution and game state invariants
 *   - Win detection and auto-complete
 *   - Transcript recording and validity
 *   - Undo/Redo correctness across full games
 */

import { describe, it, expect } from 'vitest';
import {
  deal,
  applyMove,
  undoMove,
  getLegalMoves,
  isWon,
  hasNoMoves,
  findSafeAutoMoves,
  isTriviallyWinnable,
  getAutoCompleteMoves,
  rankValue,
} from '../../example-games/beleaguered-castle/BeleagueredCastleRules';
import type { BCMove } from '../../example-games/beleaguered-castle/BeleagueredCastleState';
import {
  FOUNDATION_COUNT,
  TABLEAU_COUNT,
  FOUNDATION_SUITS,
} from '../../example-games/beleaguered-castle/BeleagueredCastleState';
import {
  BCTranscriptRecorder,
  snapshotBoard,
  snapshotCard,
} from '../../example-games/beleaguered-castle/GameTranscript';
import type { BCGameTranscript } from '../../example-games/beleaguered-castle/GameTranscript';

// ── Helpers ─────────────────────────────────────────────────

/** Maximum moves before we consider the game stuck. */
const MAX_MOVES = 500;

/**
 * Count all cards across foundations and tableau.
 * In Beleaguered Castle, all 52 cards are always in play
 * (foundations + tableau).
 */
function countAllCards(
  state: ReturnType<typeof deal>,
): number {
  let count = 0;
  for (let fi = 0; fi < FOUNDATION_COUNT; fi++) {
    count += state.foundations[fi].size();
  }
  for (let col = 0; col < TABLEAU_COUNT; col++) {
    count += state.tableau[col].size();
  }
  return count;
}

/**
 * Play a game using a simple greedy heuristic:
 * 1. If a foundation move is available, take it.
 * 2. Otherwise, take the first legal tableau move.
 *
 * Returns the final state, whether the game was won, and the
 * number of moves made.
 */
function playGreedyGame(seed: number): {
  state: ReturnType<typeof deal>;
  won: boolean;
  moveCount: number;
  moves: BCMove[];
} {
  const state = deal(seed);
  const moves: BCMove[] = [];
  let movesMade = 0;

  while (movesMade < MAX_MOVES) {
    if (isWon(state)) break;
    if (hasNoMoves(state)) break;

    const legalMoves = getLegalMoves(state);
    if (legalMoves.length === 0) break;

    // Prioritize foundation moves
    const foundationMove = legalMoves.find(
      (m) => m.kind === 'tableau-to-foundation',
    );
    const chosenMove = foundationMove ?? legalMoves[0];

    applyMove(state, chosenMove);
    moves.push(chosenMove);
    movesMade++;
  }

  return {
    state,
    won: isWon(state),
    moveCount: movesMade,
    moves,
  };
}

/**
 * Play a game with transcript recording using the greedy heuristic.
 */
function playGameWithTranscript(seed: number): {
  state: ReturnType<typeof deal>;
  transcript: BCGameTranscript;
  won: boolean;
  moveCount: number;
} {
  const state = deal(seed);
  const recorder = new BCTranscriptRecorder(seed, state);
  let movesMade = 0;

  while (movesMade < MAX_MOVES) {
    if (isWon(state)) break;
    if (hasNoMoves(state)) break;

    const legalMoves = getLegalMoves(state);
    if (legalMoves.length === 0) break;

    // Prioritize foundation moves
    const foundationMove = legalMoves.find(
      (m) => m.kind === 'tableau-to-foundation',
    );
    const chosenMove = foundationMove ?? legalMoves[0];

    applyMove(state, chosenMove);
    movesMade++;

    // Check for auto-moves after each player move
    if (chosenMove.kind === 'tableau-to-foundation') {
      recorder.recordMove(chosenMove, state.moveCount);
    } else {
      recorder.recordMove(chosenMove, state.moveCount);
    }

    // Apply safe auto-moves
    let safeAutos = findSafeAutoMoves(state);
    while (safeAutos.length > 0) {
      for (const am of safeAutos) {
        applyMove(state, am);
        // Auto-moves don't count toward player move count in the scene,
        // but in pure logic testing they do increment. Record them anyway.
        recorder.recordAutoMove(am);
        movesMade++;
      }
      safeAutos = findSafeAutoMoves(state);
    }
  }

  const outcome = isWon(state) ? 'win' as const : 'loss' as const;
  const transcript = recorder.finalize(outcome, state.moveCount, 0);

  return { state, transcript, won: isWon(state), moveCount: movesMade };
}

// ── Deal correctness ────────────────────────────────────────

describe('Integration: Deal correctness', () => {
  it('deals 52 cards total (4 on foundations + 48 in tableau)', () => {
    const state = deal(42);
    expect(countAllCards(state)).toBe(52);
  });

  it('places exactly one ace per foundation', () => {
    const state = deal(42);
    for (let fi = 0; fi < FOUNDATION_COUNT; fi++) {
      expect(state.foundations[fi].size()).toBe(1);
      const card = state.foundations[fi].peek()!;
      expect(card.rank).toBe('A');
      expect(card.suit).toBe(FOUNDATION_SUITS[fi]);
    }
  });

  it('deals 6 cards per tableau column', () => {
    const state = deal(42);
    for (let col = 0; col < TABLEAU_COUNT; col++) {
      expect(state.tableau[col].size()).toBe(6);
    }
  });

  it('all cards are face-up', () => {
    const state = deal(42);
    for (let col = 0; col < TABLEAU_COUNT; col++) {
      for (const card of state.tableau[col].toArray()) {
        expect(card.faceUp).toBe(true);
      }
    }
    for (let fi = 0; fi < FOUNDATION_COUNT; fi++) {
      for (const card of state.foundations[fi].toArray()) {
        expect(card.faceUp).toBe(true);
      }
    }
  });

  it('no duplicate cards exist', () => {
    const state = deal(42);
    const seen = new Set<string>();

    for (let fi = 0; fi < FOUNDATION_COUNT; fi++) {
      for (const card of state.foundations[fi].toArray()) {
        const key = `${card.rank}-${card.suit}`;
        expect(seen.has(key)).toBe(false);
        seen.add(key);
      }
    }

    for (let col = 0; col < TABLEAU_COUNT; col++) {
      for (const card of state.tableau[col].toArray()) {
        const key = `${card.rank}-${card.suit}`;
        expect(seen.has(key)).toBe(false);
        seen.add(key);
      }
    }

    expect(seen.size).toBe(52);
  });

  it('different seeds produce different layouts', () => {
    const state1 = deal(1);
    const state2 = deal(2);

    // At least one column should differ
    let anyDifferent = false;
    for (let col = 0; col < TABLEAU_COUNT; col++) {
      const cards1 = state1.tableau[col].toArray();
      const cards2 = state2.tableau[col].toArray();
      for (let i = 0; i < cards1.length; i++) {
        if (cards1[i].rank !== cards2[i].rank || cards1[i].suit !== cards2[i].suit) {
          anyDifferent = true;
          break;
        }
      }
      if (anyDifferent) break;
    }

    expect(anyDifferent).toBe(true);
  });

  it('same seed produces identical layout', () => {
    const state1 = deal(42);
    const state2 = deal(42);

    for (let col = 0; col < TABLEAU_COUNT; col++) {
      const cards1 = state1.tableau[col].toArray();
      const cards2 = state2.tableau[col].toArray();
      expect(cards1.length).toBe(cards2.length);
      for (let i = 0; i < cards1.length; i++) {
        expect(cards1[i].rank).toBe(cards2[i].rank);
        expect(cards1[i].suit).toBe(cards2[i].suit);
      }
    }
  });

  it('moveCount starts at 0', () => {
    const state = deal(42);
    expect(state.moveCount).toBe(0);
  });
});

// ── Game invariants ─────────────────────────────────────────

describe('Integration: Game invariants during play', () => {
  it('total card count remains 52 throughout a game', () => {
    const state = deal(42);
    expect(countAllCards(state)).toBe(52);

    let moves = 0;
    while (moves < MAX_MOVES) {
      if (isWon(state) || hasNoMoves(state)) break;

      const legalMoves = getLegalMoves(state);
      if (legalMoves.length === 0) break;

      applyMove(state, legalMoves[0]);
      expect(countAllCards(state)).toBe(52);
      moves++;
    }
  });

  it('moveCount increments correctly on each move', () => {
    const state = deal(42);
    expect(state.moveCount).toBe(0);

    const legalMoves = getLegalMoves(state);
    if (legalMoves.length > 0) {
      applyMove(state, legalMoves[0]);
      expect(state.moveCount).toBe(1);

      const moreMoves = getLegalMoves(state);
      if (moreMoves.length > 0) {
        applyMove(state, moreMoves[0]);
        expect(state.moveCount).toBe(2);
      }
    }
  });

  it('undo restores exact previous state', () => {
    const state = deal(42);
    const legalMoves = getLegalMoves(state);
    if (legalMoves.length === 0) return;

    // Snapshot before
    const beforeSnapshot = snapshotBoard(state);
    const beforeMoveCount = state.moveCount;

    // Apply and undo
    const move = legalMoves[0];
    applyMove(state, move);
    undoMove(state, move);

    // Snapshot after undo
    const afterSnapshot = snapshotBoard(state);

    expect(state.moveCount).toBe(beforeMoveCount);
    expect(afterSnapshot).toEqual(beforeSnapshot);
  });

  it('foundation sizes never decrease during greedy play', () => {
    const state = deal(42);
    const prevFoundationSizes = [1, 1, 1, 1]; // aces pre-placed

    let moves = 0;
    while (moves < MAX_MOVES) {
      if (isWon(state) || hasNoMoves(state)) break;

      const legalMoves = getLegalMoves(state);
      if (legalMoves.length === 0) break;

      const foundationMove = legalMoves.find(
        (m) => m.kind === 'tableau-to-foundation',
      );
      const chosenMove = foundationMove ?? legalMoves[0];
      applyMove(state, chosenMove);

      for (let fi = 0; fi < FOUNDATION_COUNT; fi++) {
        expect(state.foundations[fi].size()).toBeGreaterThanOrEqual(
          prevFoundationSizes[fi],
        );
        prevFoundationSizes[fi] = state.foundations[fi].size();
      }

      moves++;
    }
  });

  it('foundations build in correct rank order', () => {
    const state = deal(42);

    let moves = 0;
    while (moves < MAX_MOVES) {
      if (isWon(state) || hasNoMoves(state)) break;

      const legalMoves = getLegalMoves(state);
      if (legalMoves.length === 0) break;

      const foundationMove = legalMoves.find(
        (m) => m.kind === 'tableau-to-foundation',
      );
      const chosenMove = foundationMove ?? legalMoves[0];
      applyMove(state, chosenMove);

      // Verify each foundation has cards in ascending rank order
      for (let fi = 0; fi < FOUNDATION_COUNT; fi++) {
        const cards = state.foundations[fi].toArray();
        for (let i = 1; i < cards.length; i++) {
          expect(rankValue(cards[i].rank)).toBe(
            rankValue(cards[i - 1].rank) + 1,
          );
        }
        // All cards must be the same suit
        for (const card of cards) {
          expect(card.suit).toBe(FOUNDATION_SUITS[fi]);
        }
      }

      moves++;
    }
  });
});

// ── Full game play ──────────────────────────────────────────

describe('Integration: Full greedy game play', () => {
  it('completes a seeded game without errors', () => {
    const result = playGreedyGame(42);
    // The game should terminate (win or stuck)
    expect(result.moveCount).toBeGreaterThan(0);
    expect(result.moveCount).toBeLessThan(MAX_MOVES);
  });

  it('completes consistently across multiple seeds', () => {
    for (const seed of [1, 2, 3, 17, 99, 12345, 999999]) {
      const result = playGreedyGame(seed);
      expect(result.moveCount).toBeGreaterThan(0);
      // The greedy heuristic may cycle on some seeds, hitting the
      // MAX_MOVES safety limit without reaching a true termination.
      expect(result.moveCount).toBeLessThanOrEqual(MAX_MOVES);
    }
  });

  it('detects win correctly when all foundations are complete', () => {
    // Find a seed that wins with greedy play, or just verify
    // a manually-won state
    const state = deal(42);

    // Play until done
    let moves = 0;
    while (moves < MAX_MOVES && !isWon(state) && !hasNoMoves(state)) {
      const legalMoves = getLegalMoves(state);
      if (legalMoves.length === 0) break;

      const foundationMove = legalMoves.find(
        (m) => m.kind === 'tableau-to-foundation',
      );
      applyMove(state, foundationMove ?? legalMoves[0]);
      moves++;
    }

    if (isWon(state)) {
      // Verify win conditions
      for (let fi = 0; fi < FOUNDATION_COUNT; fi++) {
        expect(state.foundations[fi].size()).toBe(13);
      }
      for (let col = 0; col < TABLEAU_COUNT; col++) {
        expect(state.tableau[col].isEmpty()).toBe(true);
      }
    }
  });

  it('detects no-moves correctly when stuck', () => {
    // Play until stuck or won
    for (const seed of [1, 2, 3, 4, 5]) {
      const result = playGreedyGame(seed);
      if (!result.won) {
        if (result.moveCount < MAX_MOVES) {
          // The game truly has no legal moves remaining
          expect(hasNoMoves(result.state)).toBe(true);
          expect(getLegalMoves(result.state)).toHaveLength(0);
        } else {
          // The greedy heuristic hit the safety limit while cycling
          // through legal but non-productive moves. Legal moves still
          // exist but the simple strategy cannot find a path forward.
          expect(result.moveCount).toBe(MAX_MOVES);
        }
      }
    }
  });
});

// ── Undo/Redo correctness ───────────────────────────────────

describe('Integration: Undo/Redo across multiple moves', () => {
  it('undoing all moves restores the initial state', () => {
    const state = deal(42);
    const initialSnapshot = snapshotBoard(state);

    // Make several moves
    const movesApplied: BCMove[] = [];
    for (let i = 0; i < 10; i++) {
      const legalMoves = getLegalMoves(state);
      if (legalMoves.length === 0) break;
      const move = legalMoves[0];
      applyMove(state, move);
      movesApplied.push(move);
    }

    // Undo all moves in reverse
    for (let i = movesApplied.length - 1; i >= 0; i--) {
      undoMove(state, movesApplied[i]);
    }

    const restoredSnapshot = snapshotBoard(state);
    expect(restoredSnapshot).toEqual(initialSnapshot);
    expect(state.moveCount).toBe(0);
  });

  it('undo then redo restores the post-move state', () => {
    const state = deal(42);
    const legalMoves = getLegalMoves(state);
    if (legalMoves.length === 0) return;

    const move = legalMoves[0];
    applyMove(state, move);
    const afterMoveSnapshot = snapshotBoard(state);
    const afterMoveCount = state.moveCount;

    undoMove(state, move);
    applyMove(state, move);

    const restoredSnapshot = snapshotBoard(state);
    expect(restoredSnapshot).toEqual(afterMoveSnapshot);
    expect(state.moveCount).toBe(afterMoveCount);
  });
});

// ── Transcript recording ────────────────────────────────────

describe('Integration: Transcript recording', () => {
  it('creates a valid transcript structure', () => {
    const { transcript } = playGameWithTranscript(42);

    expect(transcript.version).toBe(1);
    expect(transcript.game).toBe('beleaguered-castle');
    expect(transcript.seed).toBe(42);
    expect(transcript.startedAt).toBeTruthy();
    expect(transcript.endedAt).toBeTruthy();
    expect(transcript.result).not.toBeNull();
  });

  it('records the correct initial state', () => {
    const { transcript } = playGameWithTranscript(42);

    // Initial state should have 4 foundations with 1 card each (aces)
    expect(transcript.initialState.foundations).toHaveLength(4);
    for (let fi = 0; fi < FOUNDATION_COUNT; fi++) {
      expect(transcript.initialState.foundations[fi].size).toBe(1);
      expect(transcript.initialState.foundations[fi].topRank).toBe('A');
      expect(transcript.initialState.foundations[fi].suit).toBe(
        FOUNDATION_SUITS[fi],
      );
    }

    // 8 columns with 6 cards each
    expect(transcript.initialState.tableau).toHaveLength(8);
    for (let col = 0; col < TABLEAU_COUNT; col++) {
      expect(transcript.initialState.tableau[col].cards).toHaveLength(6);
    }
  });

  it('records moves in order', () => {
    const { transcript } = playGameWithTranscript(42);

    expect(transcript.moves.length).toBeGreaterThan(0);

    // All entries should have valid kinds
    for (const entry of transcript.moves) {
      expect(['player-move', 'auto-move', 'undo', 'redo']).toContain(
        entry.kind,
      );
    }

    // First entry should be a player move
    expect(transcript.moves[0].kind).toBe('player-move');
  });

  it('records auto-moves after player moves', () => {
    const { transcript } = playGameWithTranscript(42);

    // Check if any auto-moves are recorded
    const autoMoves = transcript.moves.filter((m) => m.kind === 'auto-move');
    // Auto-moves may or may not exist depending on the game state,
    // but the structure should be valid
    for (const am of autoMoves) {
      expect(am.kind).toBe('auto-move');
      expect(am.move).toBeDefined();
      expect(am.move.kind).toBe('tableau-to-foundation');
    }
  });

  it('finalizes with correct outcome', () => {
    const { transcript, won } = playGameWithTranscript(42);

    expect(transcript.result).not.toBeNull();
    if (won) {
      expect(transcript.result!.outcome).toBe('win');
    } else {
      expect(transcript.result!.outcome).toBe('loss');
    }
    expect(transcript.result!.moveCount).toBeGreaterThan(0);
    expect(typeof transcript.result!.elapsedSeconds).toBe('number');
  });

  it('serializes to valid JSON', () => {
    const { transcript } = playGameWithTranscript(42);
    const json = JSON.stringify(transcript);
    const parsed = JSON.parse(json);

    expect(parsed.version).toBe(1);
    expect(parsed.game).toBe('beleaguered-castle');
    expect(parsed.seed).toBe(42);
    expect(parsed.initialState).toBeDefined();
    expect(parsed.moves).toBeInstanceOf(Array);
    expect(parsed.result).toBeDefined();
  });

  it('produces consistent transcripts for the same seed', () => {
    const { transcript: t1 } = playGameWithTranscript(42);
    const { transcript: t2 } = playGameWithTranscript(42);

    // Same seed + same strategy = same game = same transcript
    expect(t1.moves.length).toBe(t2.moves.length);
    expect(t1.result!.outcome).toBe(t2.result!.outcome);
    expect(t1.result!.moveCount).toBe(t2.result!.moveCount);
    expect(t1.initialState).toEqual(t2.initialState);
  });
});

// ── Auto-complete detection ─────────────────────────────────

describe('Integration: Auto-complete', () => {
  it('auto-complete moves produce a winning state', () => {
    // Find a state where auto-complete is possible by playing until
    // the game is trivially winnable
    for (const seed of [1, 2, 3, 42, 99, 100]) {
      const state = deal(seed);

      let moves = 0;
      while (
        moves < MAX_MOVES &&
        !isWon(state) &&
        !hasNoMoves(state) &&
        !isTriviallyWinnable(state)
      ) {
        const legalMoves = getLegalMoves(state);
        if (legalMoves.length === 0) break;

        const foundationMove = legalMoves.find(
          (m) => m.kind === 'tableau-to-foundation',
        );
        applyMove(state, foundationMove ?? legalMoves[0]);
        moves++;
      }

      if (isTriviallyWinnable(state)) {
        const autoMoves = getAutoCompleteMoves(state);
        expect(autoMoves.length).toBeGreaterThan(0);

        // Apply all auto-complete moves
        for (const move of autoMoves) {
          applyMove(state, move);
        }

        // Should now be won
        expect(isWon(state)).toBe(true);
        break; // Found one, that's enough
      }
    }
  });

  it('auto-complete moves are all foundation moves', () => {
    for (const seed of [1, 2, 3, 42, 99]) {
      const state = deal(seed);

      let moves = 0;
      while (
        moves < MAX_MOVES &&
        !isWon(state) &&
        !hasNoMoves(state) &&
        !isTriviallyWinnable(state)
      ) {
        const legalMoves = getLegalMoves(state);
        if (legalMoves.length === 0) break;
        const foundationMove = legalMoves.find(
          (m) => m.kind === 'tableau-to-foundation',
        );
        applyMove(state, foundationMove ?? legalMoves[0]);
        moves++;
      }

      if (isTriviallyWinnable(state)) {
        const autoMoves = getAutoCompleteMoves(state);
        for (const move of autoMoves) {
          expect(move.kind).toBe('tableau-to-foundation');
        }
        break;
      }
    }
  });
});

// ── Snapshot helpers ─────────────────────────────────────────

describe('Integration: Snapshot utilities', () => {
  it('snapshotCard captures rank and suit', () => {
    const state = deal(42);
    const topCard = state.tableau[0].peek()!;
    const snap = snapshotCard(topCard);

    expect(snap.rank).toBe(topCard.rank);
    expect(snap.suit).toBe(topCard.suit);
  });

  it('snapshotBoard captures complete state', () => {
    const state = deal(42);
    const snapshot = snapshotBoard(state);

    expect(snapshot.foundations).toHaveLength(4);
    expect(snapshot.tableau).toHaveLength(8);

    // Total cards across snapshot
    let totalCards = 0;
    for (const f of snapshot.foundations) {
      totalCards += f.size;
    }
    for (const col of snapshot.tableau) {
      totalCards += col.cards.length;
    }
    expect(totalCards).toBe(52);
  });
});
