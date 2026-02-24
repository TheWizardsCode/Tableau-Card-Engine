/**
 * BeleagueredCastleReplayAdapter -- replay adapter for Beleaguered Castle.
 *
 * Handles BC transcript validation, state injection (via
 * `BeleagueredCastleScene.loadBoardState()`), and scene management
 * for the replay tool.
 *
 * BC transcripts store moves (deltas) rather than per-turn board
 * snapshots (unlike Golf).  To inject state at a given turn, the
 * adapter re-deals from the seed and replays all moves up to that
 * turn index, then snapshots the reconstructed state and injects it
 * into the scene via `loadBoardState()`.
 *
 * @see ReplayAdapter  -- interface definition
 * @see example-games/beleaguered-castle/GameTranscript.ts  -- BC transcript types
 *
 * Related work items:
 * - CG-0MLTFUL061DWDGA2 (adapter pattern)
 * - CG-0MM0GQ9JO1MH50R9 (BC transcript pipeline)
 */

import type { Page } from 'playwright';
import type {
  ReplayAdapter,
  ValidationResult,
  TakeoverOptions,
} from './ReplayAdapter';

// ── BC transcript types (minimal, for detection/validation) ─

/**
 * Minimal representations of BC transcript types.
 *
 * Full types are defined in
 * `example-games/beleaguered-castle/GameTranscript.ts`.
 * Only the fields needed for detection, validation, and state
 * reconstruction are included here.
 */

interface CardSnapshot {
  rank: string;
  suit: string;
  faceUp: boolean;
}

interface FoundationSnapshot {
  suit: string;
  size: number;
  topRank: string | null;
}

interface ColumnSnapshot {
  cards: CardSnapshot[];
}

interface BoardSnapshot {
  foundations: FoundationSnapshot[];
  tableau: ColumnSnapshot[];
}

interface BCMove {
  kind: 'tableau-to-foundation' | 'tableau-to-tableau';
  fromCol: number;
  toFoundation?: number;
  toCol?: number;
}

interface PlayerMoveRecord {
  kind: 'player-move';
  move: BCMove;
  moveCount: number;
}

interface AutoMoveRecord {
  kind: 'auto-move';
  move: BCMove;
}

interface UndoRecord {
  kind: 'undo';
  moveCount: number;
}

interface RedoRecord {
  kind: 'redo';
  moveCount: number;
}

type TranscriptEntry =
  | PlayerMoveRecord
  | AutoMoveRecord
  | UndoRecord
  | RedoRecord;

interface GameResult {
  outcome: string;
  moveCount: number;
  elapsedSeconds: number;
}

interface BCTranscript {
  version: 1;
  game: 'beleaguered-castle';
  seed: number;
  startedAt: string;
  endedAt: string;
  initialState: BoardSnapshot;
  moves: TranscriptEntry[];
  result: GameResult | null;
}

// ── Type guard ─────────────────────────────────────────────

function isBCTranscript(raw: unknown): raw is BCTranscript {
  if (typeof raw !== 'object' || raw === null) return false;
  const obj = raw as Record<string, unknown>;
  return obj.game === 'beleaguered-castle';
}

// ── State reconstruction helpers ───────────────────────────

/**
 * Reconstruct the board state at a given move index by replaying
 * moves from the initial state.
 *
 * BC transcripts store the initialState (board after deal) and a
 * sequence of moves.  To get the board at move N, we start from
 * `initialState` and replay moves 0..N, handling undo/redo by
 * maintaining a move stack.
 *
 * For undo entries, we pop the last applied move(s) and reverse them.
 * For redo entries, we re-apply the last undone move(s).
 *
 * This is done entirely within the adapter (Node.js side) using
 * a simplified board representation, then the resulting snapshot
 * is injected into the Phaser scene.
 */
function reconstructBoardAtMove(
  transcript: BCTranscript,
  moveIndex: number,
): BoardSnapshot {
  // Deep-clone the initial state to work with
  const board = JSON.parse(JSON.stringify(transcript.initialState)) as BoardSnapshot;

  // Apply moves 0..moveIndex
  // We need to track applied moves for undo/redo support
  const appliedMoves: TranscriptEntry[] = [];
  const undoneEntries: TranscriptEntry[] = [];

  for (let i = 0; i <= moveIndex && i < transcript.moves.length; i++) {
    const entry = transcript.moves[i];

    switch (entry.kind) {
      case 'player-move':
      case 'auto-move':
        applyMoveToBoard(board, entry.move);
        appliedMoves.push(entry);
        // Clear undo stack when a new move is made
        undoneEntries.length = 0;
        break;

      case 'undo': {
        // Pop the most recent applied move(s) and reverse them.
        // An undo of a compound command (player move + auto-moves)
        // undoes all of them. We look backwards for the player-move
        // and all auto-moves that followed it.
        const undoneGroup = popMoveGroup(appliedMoves);
        for (const undone of undoneGroup) {
          if (undone.kind === 'player-move' || undone.kind === 'auto-move') {
            undoMoveOnBoard(board, undone.move);
          }
        }
        undoneEntries.push(...undoneGroup);
        break;
      }

      case 'redo': {
        // Re-apply the most recently undone move group.
        const redoGroup = popRedoGroup(undoneEntries);
        for (const entry of redoGroup) {
          if (entry.kind === 'player-move' || entry.kind === 'auto-move') {
            applyMoveToBoard(board, entry.move);
          }
        }
        appliedMoves.push(...redoGroup);
        break;
      }
    }
  }

  return board;
}

/**
 * Pop a complete move group from the applied stack.
 * A group is: 1 player-move followed by 0+ auto-moves.
 * Returns entries in the order they should be undone (reverse application order).
 */
function popMoveGroup(applied: TranscriptEntry[]): TranscriptEntry[] {
  const group: TranscriptEntry[] = [];
  // Pop auto-moves that follow the player move
  while (applied.length > 0) {
    const last = applied[applied.length - 1];
    if (last.kind === 'auto-move') {
      group.push(applied.pop()!);
    } else {
      break;
    }
  }
  // Pop the player-move itself
  if (applied.length > 0 && applied[applied.length - 1].kind === 'player-move') {
    group.push(applied.pop()!);
  }
  // group is in reverse order (auto-moves first, then player-move)
  // which is the correct order for undoing
  return group;
}

/**
 * Pop a complete redo group from the undone stack.
 * A group is: 1 player-move followed by 0+ auto-moves (in the undone stack,
 * they appear in reverse order: auto-moves first, player-move last).
 * Returns entries in application order (player-move first, then auto-moves).
 */
function popRedoGroup(undone: TranscriptEntry[]): TranscriptEntry[] {
  const group: TranscriptEntry[] = [];
  // The undone stack has entries in undo order (auto-moves, then player-move).
  // Pop the player-move (which is at the end of the undone stack)
  if (undone.length > 0 && undone[undone.length - 1].kind === 'player-move') {
    group.push(undone.pop()!);
  }
  // Pop auto-moves
  while (undone.length > 0 && undone[undone.length - 1].kind === 'auto-move') {
    group.push(undone.pop()!);
  }
  // group is in application order (player-move first, then auto-moves)
  return group;
}

/**
 * Apply a single BC move to a board snapshot (in-place mutation).
 */
function applyMoveToBoard(board: BoardSnapshot, move: BCMove): void {
  if (move.kind === 'tableau-to-foundation') {
    const col = board.tableau[move.fromCol];
    const card = col.cards.pop();
    if (!card) return;
    const fi = move.toFoundation!;
    const f = board.foundations[fi];
    f.size++;
    f.topRank = card.rank;
  } else if (move.kind === 'tableau-to-tableau') {
    const fromCol = board.tableau[move.fromCol];
    const card = fromCol.cards.pop();
    if (!card) return;
    board.tableau[move.toCol!].cards.push(card);
  }
}

/**
 * Undo a single BC move on a board snapshot (in-place mutation).
 */
function undoMoveOnBoard(board: BoardSnapshot, move: BCMove): void {
  if (move.kind === 'tableau-to-foundation') {
    const fi = move.toFoundation!;
    const f = board.foundations[fi];
    if (f.size <= 0) return;

    // Reconstruct the card that was on the foundation top
    const card: CardSnapshot = {
      rank: f.topRank!,
      suit: f.suit,
      faceUp: true,
    };

    // Push card back to source column
    board.tableau[move.fromCol].cards.push(card);

    // Update foundation: decrement size, compute new topRank
    f.size--;
    if (f.size > 0) {
      // Previous rank in the sequence
      f.topRank = prevRank(card.rank);
    } else {
      f.topRank = null;
    }
  } else if (move.kind === 'tableau-to-tableau') {
    const toCol = board.tableau[move.toCol!];
    const card = toCol.cards.pop();
    if (!card) return;
    board.tableau[move.fromCol].cards.push(card);
  }
}

/** Standard rank sequence for computing previous rank. */
const RANK_ORDER = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

/** Get the rank before the given rank (e.g. '3' -> '2', 'A' -> null). */
function prevRank(rank: string): string | null {
  const idx = RANK_ORDER.indexOf(rank);
  return idx > 0 ? RANK_ORDER[idx - 1] : null;
}

// ── Adapter implementation ─────────────────────────────────

export class BeleagueredCastleReplayAdapter implements ReplayAdapter {
  readonly gameType = 'beleaguered-castle';
  readonly sceneKey = 'BeleagueredCastleScene';

  canHandle(raw: unknown): boolean {
    return isBCTranscript(raw);
  }

  validateTranscript(raw: unknown): ValidationResult {
    if (!isBCTranscript(raw)) {
      return {
        valid: false,
        error: 'Transcript does not match Beleaguered Castle schema.',
      };
    }

    if (raw.version !== 1) {
      return {
        valid: false,
        error: `Unsupported BC transcript version: ${raw.version}. Expected: 1`,
      };
    }

    if (!Array.isArray(raw.moves)) {
      return { valid: false, error: 'Transcript has no moves array.' };
    }

    if (!raw.initialState) {
      return { valid: false, error: 'Transcript has no initialState.' };
    }

    return { valid: true };
  }

  getTurnCount(transcript: unknown): number {
    const t = transcript as BCTranscript;
    return t.moves.length;
  }

  getVersion(transcript: unknown): number {
    return (transcript as BCTranscript).version;
  }

  getSummaryLine(transcript: unknown): string {
    const t = transcript as BCTranscript;
    const outcome = t.result?.outcome ?? 'in-progress';
    return `Seed: ${t.seed}, Moves: ${t.moves.length}, Outcome: ${outcome}`;
  }

  supportsInteractiveTakeover(_transcript: unknown): boolean {
    // BC does not yet support interactive takeover.
    return false;
  }

  getReplayUrl(baseUrl: string): string {
    return `${baseUrl}?mode=replay&game=beleaguered-castle`;
  }

  async startScene(page: Page): Promise<void> {
    await page.evaluate(`
      (() => {
        const game = window.__PHASER_GAME__;
        game.scene.start('BeleagueredCastleScene');
      })()
    `);
  }

  async waitForSceneReady(page: Page, timeoutMs: number): Promise<void> {
    await page.waitForFunction(
      `(() => {
        const game = window.__PHASER_GAME__;
        if (!game) return false;
        const scene = game.scene.getScene('BeleagueredCastleScene');
        return scene && scene.sys.isActive();
      })()`,
      { timeout: timeoutMs },
    );
  }

  async injectInitialState(
    page: Page,
    transcript: unknown,
    timeoutMs: number,
  ): Promise<void> {
    const t = transcript as BCTranscript;
    await this._injectBoardState(page, t.initialState, timeoutMs);
  }

  async injectTurnState(
    page: Page,
    transcript: unknown,
    turnIndex: number,
    timeoutMs: number,
  ): Promise<void> {
    const t = transcript as BCTranscript;
    const snapshot = reconstructBoardAtMove(t, turnIndex);
    await this._injectBoardState(page, snapshot, timeoutMs);
  }

  describeTurn(transcript: unknown, turnIndex: number): string {
    const t = transcript as BCTranscript;
    const entry = t.moves[turnIndex];
    if (!entry) return `Move ${turnIndex + 1} (unknown)`;

    switch (entry.kind) {
      case 'player-move': {
        const m = entry.move;
        if (m.kind === 'tableau-to-foundation') {
          return `Move ${turnIndex + 1}: col ${m.fromCol} -> foundation ${m.toFoundation}`;
        }
        return `Move ${turnIndex + 1}: col ${m.fromCol} -> col ${m.toCol}`;
      }
      case 'auto-move': {
        const m = entry.move;
        if (m.kind === 'tableau-to-foundation') {
          return `Move ${turnIndex + 1}: auto col ${m.fromCol} -> foundation ${m.toFoundation}`;
        }
        return `Move ${turnIndex + 1}: auto col ${m.fromCol} -> col ${m.toCol}`;
      }
      case 'undo':
        return `Move ${turnIndex + 1}: undo`;
      case 'redo':
        return `Move ${turnIndex + 1}: redo`;
    }
  }

  describeLastAction(transcript: unknown, turnIndex: number): string {
    if (turnIndex < 0) return 'N/A (initial state)';
    return this.describeTurn(transcript, turnIndex);
  }

  async showTakeoverOverlay(
    _page: Page,
    _options: TakeoverOptions,
  ): Promise<void> {
    throw new Error(
      'Beleaguered Castle does not support interactive takeover yet.',
    );
  }

  // ── Private helpers ──────────────────────────────────────

  /**
   * Inject a BC board state via `BeleagueredCastleScene.loadBoardState()`
   * and wait for the `state-settled` event.
   */
  private async _injectBoardState(
    page: Page,
    snapshot: BoardSnapshot,
    timeoutMs: number,
  ): Promise<void> {
    const snapshotJson = JSON.stringify(snapshot);

    await page.evaluate(`
      new Promise((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error('Timed out waiting for state-settled after loadBoardState')),
          ${timeoutMs},
        );
        const emitter = window.__GAME_EVENTS__;
        if (!emitter) {
          clearTimeout(timer);
          reject(new Error('__GAME_EVENTS__ not found on window'));
          return;
        }
        emitter.once('state-settled', () => {
          clearTimeout(timer);
          resolve();
        });
        const game = window.__PHASER_GAME__;
        const scene = game.scene.getScene('BeleagueredCastleScene');
        if (!scene) {
          clearTimeout(timer);
          reject(new Error('BeleagueredCastleScene not found'));
          return;
        }
        scene.loadBoardState(${snapshotJson});
      })
    `);
  }
}
