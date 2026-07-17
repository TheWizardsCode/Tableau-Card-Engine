/**
 * GolfReplayAdapter -- replay adapter for 9-Card Golf.
 *
 * Extracts all Golf-specific replay logic that was previously
 * hard-coded in `scripts/replay.ts`.  Handles Golf transcript
 * validation, state injection (via `GolfScene.loadBoardState()`),
 * and interactive takeover overlay.
 *
 * Golf transcripts are identified by the presence of `turns[]`,
 * `initialState.boardStates[]`, and `initialState.discardTop` fields
 * (Golf predates the `gameType` convention).
 *
 * @see ReplayAdapter  -- interface definition
 * @see scripts/replay.ts  -- consumer
 *
 * Related work item: CG-0MLTFUL061DWDGA2
 */

import type { Page } from 'playwright';
import type {
  ReplayAdapter,
  ValidationResult,
  TakeoverOptions,
} from './ReplayAdapter';
import type { CardSnapshot } from '../../src/core-engine/TranscriptTypes';

// ── Golf-specific transcript types ─────────────────────────

/** Board state for a single player's 3x3 grid. */
interface GolfBoardSnapshot {
  grid: CardSnapshot[];
  faceUpCount: number;
  visibleScore: number;
  totalScore: number;
}

/** A single turn in a Golf game transcript. */
interface GolfTurnRecord {
  turnNumber: number;
  playerIndex: number;
  playerName: string;
  drawSource: 'stock' | 'discard';
  move: { kind: 'swap' | 'discard-and-flip'; row: number; col: number };
  boardStates: GolfBoardSnapshot[];
  discardTop: CardSnapshot | null;
  stockRemaining: number;
  stockPileCards?: CardSnapshot[];
  roundEnded: boolean;
}

/** Complete Golf game transcript (v1 and v2). */
interface GolfTranscript {
  version: number;
  metadata: {
    startedAt: string;
    endedAt: string;
    players: Array<{ name: string; isAI: boolean; strategy?: string }>;
  };
  initialState: {
    boardStates: GolfBoardSnapshot[];
    discardTop: CardSnapshot | null;
    stockRemaining: number;
    stockPileCards?: CardSnapshot[];
  };
  turns: GolfTurnRecord[];
  results: {
    scores: number[];
    winnerIndex: number;
    winnerName: string;
  } | null;
}

// ── Type guard ─────────────────────────────────────────────

function isGolfTranscript(raw: unknown): raw is GolfTranscript {
  if (typeof raw !== 'object' || raw === null) return false;
  const obj = raw as Record<string, unknown>;

  // Golf transcripts have `turns` (array), `initialState` with
  // `boardStates` and `discardTop`, and a `metadata` object.
  // They do NOT have a `game` or `gameType` field (predates convention).
  if (!Array.isArray(obj.turns)) return false;
  if (typeof obj.initialState !== 'object' || obj.initialState === null) return false;

  const init = obj.initialState as Record<string, unknown>;
  return Array.isArray(init.boardStates) && 'discardTop' in init;
}

// ── Adapter implementation ─────────────────────────────────

export class GolfReplayAdapter implements ReplayAdapter {
  readonly gameType = 'golf';
  readonly sceneKey = 'GolfScene';

  canHandle(raw: unknown): boolean {
    if (typeof raw !== 'object' || raw === null) return false;
    const obj = raw as Record<string, unknown>;

    // Explicit gameType match (future-proofing)
    if (obj.gameType === 'golf') return true;

    // Structural detection: has `turns[]` + Golf-shaped `initialState`
    // but no `game` field (which would indicate BC or another game).
    if ('game' in obj) return false;
    return isGolfTranscript(raw);
  }

  validateTranscript(raw: unknown): ValidationResult {
    if (typeof raw !== 'object' || raw === null) {
      return { valid: false, error: 'Transcript is not a valid object.' };
    }

    const obj = raw as Record<string, unknown>;

    if (!Array.isArray(obj.turns)) {
      return { valid: false, error: 'Transcript has no turns array.' };
    }

    if (!obj.initialState) {
      return { valid: false, error: 'Transcript has no initialState.' };
    }

    if (!isGolfTranscript(raw)) {
      return { valid: false, error: 'Transcript does not match Golf schema.' };
    }

    if (raw.version !== 1 && raw.version !== 2) {
      return {
        valid: false,
        error: `Unsupported transcript version: ${raw.version}. Expected: 1 or 2`,
      };
    }

    return { valid: true };
  }

  getTurnCount(transcript: unknown): number {
    return (transcript as GolfTranscript).turns.length;
  }

  getVersion(transcript: unknown): number {
    return (transcript as GolfTranscript).version;
  }

  getSummaryLine(transcript: unknown): string {
    const t = transcript as GolfTranscript;
    const players = t.metadata.players.map((p) => p.name).join(', ');
    return `Players: ${players}`;
  }

  supportsInteractiveTakeover(transcript: unknown): boolean {
    // Golf v1 transcripts lack stockPileCards, which are needed
    // for interactive play after takeover.
    return (transcript as GolfTranscript).version >= 2;
  }

  getReplayUrl(baseUrl: string): string {
    return `${baseUrl}?mode=replay`;
  }

  async startScene(page: Page): Promise<void> {
    await page.evaluate(`
      (() => {
        const game = window.__PHASER_GAME__;
        game.scene.start('GolfScene');
      })()
    `);
  }

  async waitForSceneReady(page: Page, timeoutMs: number): Promise<void> {
    await page.waitForFunction(
      `(() => {
        const game = window.__PHASER_GAME__;
        if (!game) return false;
        const scene = game.scene.getScene('GolfScene');
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
    const t = transcript as GolfTranscript;
    await this._injectBoardState(
      page,
      t.initialState.boardStates,
      t.initialState.discardTop,
      t.initialState.stockRemaining,
      timeoutMs,
      t.initialState.stockPileCards,
    );
  }

  async injectTurnState(
    page: Page,
    transcript: unknown,
    turnIndex: number,
    timeoutMs: number,
  ): Promise<void> {
    const t = transcript as GolfTranscript;
    const turn = t.turns[turnIndex];
    await this._injectBoardState(
      page,
      turn.boardStates,
      turn.discardTop,
      turn.stockRemaining,
      timeoutMs,
      turn.stockPileCards,
    );
  }

  describeTurn(transcript: unknown, turnIndex: number): string {
    const t = transcript as GolfTranscript;
    const turn = t.turns[turnIndex];
    return `${turn.playerName} (P${turn.playerIndex})`;
  }

  describeLastAction(transcript: unknown, turnIndex: number): string {
    if (turnIndex < 0) return 'N/A (initial state)';

    const t = transcript as GolfTranscript;
    const turn = t.turns[turnIndex];
    const move = turn.move;

    if (move.kind === 'swap') {
      return `${turn.playerName} drew from ${turn.drawSource}, swapped at row ${move.row} col ${move.col}`;
    }
    return `${turn.playerName} drew from ${turn.drawSource}, discarded & flipped at row ${move.row} col ${move.col}`;
  }

  async showTakeoverOverlay(
    page: Page,
    options: TakeoverOptions,
  ): Promise<void> {
    await page.evaluate(`
      (() => {
        const game = window.__PHASER_GAME__;
        const scene = game.scene.getScene('GolfScene');
        if (scene && scene.showTakeoverOverlay) {
          scene.showTakeoverOverlay({
            turnNumber: ${options.turnNumber},
            lastAction: ${JSON.stringify(options.lastAction)},
          });
        }
      })()
    `);
  }

  // ── Private helpers ──────────────────────────────────────

  /**
   * Inject a Golf board state via `GolfScene.loadBoardState()` and
   * wait for the `state-settled` event.
   */
  private async _injectBoardState(
    page: Page,
    boardStates: GolfBoardSnapshot[],
    discardTop: CardSnapshot | null,
    stockRemaining: number,
    timeoutMs: number,
    stockPileCards?: CardSnapshot[],
  ): Promise<void> {
    const bsJson = JSON.stringify(boardStates);
    const dtJson = JSON.stringify(discardTop);
    const spcJson = stockPileCards ? JSON.stringify(stockPileCards) : 'undefined';

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
        const scene = game.scene.getScene('GolfScene');
        if (!scene) {
          clearTimeout(timer);
          reject(new Error('GolfScene not found'));
          return;
        }
        scene.loadBoardState(${bsJson}, ${dtJson}, ${stockRemaining}, ${spcJson});
      })
    `);
  }
}
