/**
 * SushiGoReplayAdapter -- replay adapter for Sushi Go!
 *
 * Handles Sushi Go! transcript validation, state injection (via
 * `SushiGoScene.loadBoardState()`), and scene management for
 * the replay tool.
 *
 * Sushi Go! transcripts store full player-state snapshots after
 * each simultaneous pick, so no state reconstruction is needed.
 * Turns are stored flat in `transcript.turns[]`.
 *
 * @see ReplayAdapter  -- interface definition
 * @see example-games/sushi-go/GameTranscript.ts  -- transcript types
 *
 * Related work items:
 * - CG-0MM0GQSNL0MRSGL0 (Sushi Go replay adapter)
 * - CG-0MLTFUL061DWDGA2 (adapter pattern)
 */

import type { Page } from 'playwright';
import type {
  ReplayAdapter,
  ValidationResult,
  TakeoverOptions,
} from './ReplayAdapter';

// ── Sushi Go transcript types (minimal, for adapter) ───────

/** Serializable snapshot of a Sushi Go card. */
interface SGCardSnapshot {
  id: number;
  type: string;
  icons?: 1 | 2 | 3;
  variant?: string;
}

/** Snapshot of a single player's state. */
interface SGPlayerSnapshot {
  name: string;
  isAI: boolean;
  hand: SGCardSnapshot[];
  tableau: SGCardSnapshot[];
  puddingCount: number;
  roundScores: number[];
  totalScore: number;
}

/** Record of a single simultaneous-pick turn. */
interface SGTurnRecord {
  turnInRound: number;
  round: number;
  globalTurn: number;
  picks: Array<{ cardIndex: number; secondCardIndex?: number }>;
  playerStates: SGPlayerSnapshot[];
}

/** Initial state snapshot. */
interface SGInitialState {
  playerStates: SGPlayerSnapshot[];
  currentRound: number;
  cardsPerPlayer: number;
}

/** Final game results. */
interface SGGameResults {
  finalScores: number[];
  winnerIndex: number;
  winnerName: string;
  roundScores: number[][];
}

/** A complete Sushi Go! game transcript. */
interface SushiGoTranscript {
  version: 1;
  gameType: 'sushi-go';
  startedAt: string;
  endedAt: string;
  initialState: SGInitialState;
  turns: SGTurnRecord[];
  roundResults: unknown[];
  results: SGGameResults | null;
}

// ── Type guard ─────────────────────────────────────────────

function isSushiGoTranscript(raw: unknown): raw is SushiGoTranscript {
  if (typeof raw !== 'object' || raw === null) return false;
  const obj = raw as Record<string, unknown>;
  return obj.gameType === 'sushi-go';
}

// ── Helpers ────────────────────────────────────────────────

/**
 * Describe a turn record in human-readable format.
 */
function describeTurnRecord(turn: SGTurnRecord): string {
  const picks = turn.picks
    .map((p, i) => {
      const name = turn.playerStates[i]?.name ?? `P${i}`;
      const pickDesc = p.secondCardIndex !== undefined
        ? `cards ${p.cardIndex},${p.secondCardIndex} (chopsticks)`
        : `card ${p.cardIndex}`;
      return `${name} picks ${pickDesc}`;
    })
    .join('; ');
  return `R${turn.round + 1} T${turn.turnInRound + 1}: ${picks}`;
}

// ── Adapter implementation ─────────────────────────────────

export class SushiGoReplayAdapter implements ReplayAdapter {
  readonly gameType = 'sushi-go';
  readonly sceneKey = 'SushiGoScene';

  canHandle(raw: unknown): boolean {
    return isSushiGoTranscript(raw);
  }

  validateTranscript(raw: unknown): ValidationResult {
    if (!isSushiGoTranscript(raw)) {
      return {
        valid: false,
        error: 'Transcript does not match Sushi Go! schema.',
      };
    }

    if (raw.version !== 1) {
      return {
        valid: false,
        error: `Unsupported Sushi Go! transcript version: ${raw.version}. Expected: 1`,
      };
    }

    if (!Array.isArray(raw.turns)) {
      return { valid: false, error: 'Transcript has no turns array.' };
    }

    if (!raw.initialState) {
      return { valid: false, error: 'Transcript has no initialState.' };
    }

    if (!raw.initialState.playerStates || !Array.isArray(raw.initialState.playerStates)) {
      return {
        valid: false,
        error: 'Transcript initialState is missing playerStates.',
      };
    }

    return { valid: true };
  }

  getTurnCount(transcript: unknown): number {
    const t = transcript as SushiGoTranscript;
    return t.turns.length;
  }

  getVersion(transcript: unknown): number {
    return (transcript as SushiGoTranscript).version;
  }

  getSummaryLine(transcript: unknown): string {
    const t = transcript as SushiGoTranscript;
    const players = t.initialState.playerStates.map((p) => p.name).join(', ');
    const totalTurns = t.turns.length;
    const rounds = t.roundResults.length;
    const outcome = t.results
      ? `Winner: ${t.results.winnerName} (${t.results.finalScores.join('-')})`
      : 'in-progress';
    return `Players: ${players}, Rounds: ${rounds}, Turns: ${totalTurns}, ${outcome}`;
  }

  supportsInteractiveTakeover(_transcript: unknown): boolean {
    // Sushi Go! does not yet support interactive takeover.
    return false;
  }

  getReplayUrl(baseUrl: string): string {
    return `${baseUrl}?mode=replay&game=sushi-go`;
  }

  async startScene(page: Page): Promise<void> {
    await page.evaluate(`
      (() => {
        const game = window.__PHASER_GAME__;
        game.scene.start('SushiGoScene');
      })()
    `);
  }

  async waitForSceneReady(page: Page, timeoutMs: number): Promise<void> {
    await page.waitForFunction(
      `(() => {
        const game = window.__PHASER_GAME__;
        if (!game) return false;
        const scene = game.scene.getScene('SushiGoScene');
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
    const t = transcript as SushiGoTranscript;
    const state = {
      players: t.initialState.playerStates,
      currentRound: t.initialState.currentRound,
      currentTurn: 0,
      cardsPerPlayer: t.initialState.cardsPerPlayer,
      stepIndex: -1,
    };
    await this._injectBoardState(page, state, timeoutMs);
  }

  async injectTurnState(
    page: Page,
    transcript: unknown,
    turnIndex: number,
    timeoutMs: number,
  ): Promise<void> {
    const t = transcript as SushiGoTranscript;
    const turn = t.turns[turnIndex];
    const state = {
      players: turn.playerStates,
      currentRound: turn.round,
      currentTurn: turn.turnInRound + 1,
      cardsPerPlayer: t.initialState.cardsPerPlayer,
      stepIndex: turnIndex,
    };
    await this._injectBoardState(page, state, timeoutMs);
  }

  describeTurn(transcript: unknown, turnIndex: number): string {
    const t = transcript as SushiGoTranscript;
    const turn = t.turns[turnIndex];
    if (!turn) return `Turn ${turnIndex + 1} (unknown)`;
    return `Turn ${turnIndex + 1}: ${describeTurnRecord(turn)}`;
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
      'Sushi Go! does not support interactive takeover yet.',
    );
  }

  // ── Private helpers ──────────────────────────────────────

  /**
   * Inject a Sushi Go! board state via
   * `SushiGoScene.loadBoardState()` and wait for the
   * `state-settled` event.
   */
  private async _injectBoardState(
    page: Page,
    state: {
      players: SGPlayerSnapshot[];
      currentRound: number;
      currentTurn: number;
      cardsPerPlayer: number;
      stepIndex: number;
    },
    timeoutMs: number,
  ): Promise<void> {
    const stateJson = JSON.stringify(state);

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
        const scene = game.scene.getScene('SushiGoScene');
        if (!scene) {
          clearTimeout(timer);
          reject(new Error('SushiGoScene not found'));
          return;
        }
        scene.loadBoardState(${stateJson});
      })
    `);
  }
}
