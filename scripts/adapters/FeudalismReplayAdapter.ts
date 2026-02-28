/**
 * FeudalismReplayAdapter -- replay adapter for Feudalism.
 *
 * Handles Feudalism transcript validation, state injection (via
 * `FeudalismScene.loadBoardState()`), and scene management for
 * the replay tool.
 *
 * Feudalism transcripts store full board-state snapshots after
 * each turn, so no state reconstruction is needed.
 *
 * @see ReplayAdapter  -- interface definition
 * @see example-games/feudalism/GameTranscript.ts  -- transcript types
 *
 * Related work items:
 * - CG-0MM0GQZA915EXA9K (Feudalism transcript pipeline)
 * - CG-0MLTFUL061DWDGA2 (adapter pattern)
 */

import type { Page } from 'playwright';
import type {
  ReplayAdapter,
  ValidationResult,
  TakeoverOptions,
} from './ReplayAdapter';

// ── Feudalism transcript types (minimal, for adapter) ───────

/** Snapshot of a single market tier. */
interface SPMarketTierSnapshot {
  tier: number;
  visible: (SPCardSnapshot | null)[];
  deckCount: number;
}

/** Minimal card snapshot. */
interface SPCardSnapshot {
  id: number;
  tier: number;
  cost: Record<string, number>;
  bonus: string;
  points: number;
}

/** Minimal noble snapshot. */
interface SPNobleSnapshot {
  id: number;
  requirements: Record<string, number>;
  points: number;
}

/** Token counts. */
type SPResourceTokens = Record<string, number>;

/** Snapshot of a single player's state. */
interface SPPlayerSnapshot {
  name: string;
  isAI: boolean;
  tokens: SPResourceTokens;
  purchasedCards: SPCardSnapshot[];
  reservedCards: SPCardSnapshot[];
  nobles: SPNobleSnapshot[];
  prestige: number;
  bonuses: Record<string, number>;
}

/** Record of a single turn. */
interface SPTurnRecord {
  turnNumber: number;
  playerIndex: number;
  action: { type: string; [key: string]: unknown };
  nobleVisit: SPNobleSnapshot | null;
  tokenDiscard: { tokens: SPResourceTokens } | null;
  phase: string;
  gameOver: boolean;
  playerStates: SPPlayerSnapshot[];
  market: SPMarketTierSnapshot[];
  tokenSupply: SPResourceTokens;
  nobles: SPNobleSnapshot[];
}

/** Initial state. */
interface SPInitialState {
  playerStates: SPPlayerSnapshot[];
  market: SPMarketTierSnapshot[];
  tokenSupply: SPResourceTokens;
  nobles: SPNobleSnapshot[];
  playerCount: number;
}

/** Final results. */
interface SPGameResults {
  finalPrestige: number[];
  finalCardCounts: number[];
  winnerIndex: number;
  winnerName: string;
}

/** A complete Feudalism transcript. */
interface FeudalismTranscript {
  version: 1;
  gameType: 'feudalism';
  startedAt: string;
  endedAt: string;
  initialState: SPInitialState;
  turns: SPTurnRecord[];
  results: SPGameResults | null;
}

// ── Type guard ─────────────────────────────────────────────

function isFeudalismTranscript(raw: unknown): raw is FeudalismTranscript {
  if (typeof raw !== 'object' || raw === null) return false;
  const obj = raw as Record<string, unknown>;
  return obj.gameType === 'feudalism';
}

// ── Helpers ────────────────────────────────────────────────

/**
 * Describe a turn record in human-readable format.
 */
function describeTurnRecord(turn: SPTurnRecord): string {
  const playerName = turn.playerStates[turn.playerIndex]?.name ?? `P${turn.playerIndex}`;
  const action = turn.action;
  let actionDesc: string;

  switch (action.type) {
    case 'take-different': {
      const colors = (action.colors as string[]) ?? [];
      actionDesc = `takes ${colors.join(', ')}`;
      break;
    }
    case 'take-same': {
      actionDesc = `takes 2 ${action.color as string}`;
      break;
    }
    case 'reserve': {
      const cardId = action.cardId;
      actionDesc = cardId != null
        ? `reserves card #${cardId}`
        : `reserves from T${action.tier as number} deck`;
      break;
    }
    case 'purchase': {
      actionDesc = `purchases card #${action.cardId as number}`;
      break;
    }
    default:
      actionDesc = `${action.type}`;
  }

  const parts = [`${playerName} ${actionDesc}`];
  if (turn.nobleVisit) parts.push(`noble #${turn.nobleVisit.id} visits`);
  if (turn.tokenDiscard) parts.push('discards tokens');
  if (turn.gameOver) parts.push('(game ends)');

  return parts.join(', ');
}

// ── Adapter implementation ─────────────────────────────────

export class FeudalismReplayAdapter implements ReplayAdapter {
  readonly gameType = 'feudalism';
  readonly sceneKey = 'FeudalismScene';

  canHandle(raw: unknown): boolean {
    return isFeudalismTranscript(raw);
  }

  validateTranscript(raw: unknown): ValidationResult {
    if (!isFeudalismTranscript(raw)) {
      return {
        valid: false,
        error: 'Transcript does not match Feudalism schema.',
      };
    }

    if (raw.version !== 1) {
      return {
        valid: false,
        error: `Unsupported Feudalism transcript version: ${raw.version}. Expected: 1`,
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

    if (!raw.initialState.market || !Array.isArray(raw.initialState.market)) {
      return {
        valid: false,
        error: 'Transcript initialState is missing market.',
      };
    }

    return { valid: true };
  }

  getTurnCount(transcript: unknown): number {
    const t = transcript as FeudalismTranscript;
    return t.turns.length;
  }

  getVersion(transcript: unknown): number {
    return (transcript as FeudalismTranscript).version;
  }

  getSummaryLine(transcript: unknown): string {
    const t = transcript as FeudalismTranscript;
    const players = t.initialState.playerStates.map((p) => p.name).join(', ');
    const totalTurns = t.turns.length;
    const outcome = t.results
      ? `Winner: ${t.results.winnerName} (prestige: ${t.results.finalPrestige.join('-')})`
      : 'in-progress';
    return `Players: ${players}, Turns: ${totalTurns}, ${outcome}`;
  }

  supportsInteractiveTakeover(_transcript: unknown): boolean {
    // Feudalism does not yet support interactive takeover.
    return false;
  }

  getReplayUrl(baseUrl: string): string {
    return `${baseUrl}?mode=replay&game=feudalism`;
  }

  async startScene(page: Page): Promise<void> {
    await page.evaluate(`
      (() => {
        const game = window.__PHASER_GAME__;
        game.scene.start('FeudalismScene');
      })()
    `);
  }

  async waitForSceneReady(page: Page, timeoutMs: number): Promise<void> {
    await page.waitForFunction(
      `(() => {
        const game = window.__PHASER_GAME__;
        if (!game) return false;
        const scene = game.scene.getScene('FeudalismScene');
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
    const t = transcript as FeudalismTranscript;
    const state = {
      playerStates: t.initialState.playerStates,
      market: t.initialState.market,
      tokenSupply: t.initialState.tokenSupply,
      nobles: t.initialState.nobles,
      phase: 'playing',
      currentPlayerIndex: 0,
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
    const t = transcript as FeudalismTranscript;
    const turn = t.turns[turnIndex];
    const state = {
      playerStates: turn.playerStates,
      market: turn.market,
      tokenSupply: turn.tokenSupply,
      nobles: turn.nobles,
      phase: turn.phase,
      currentPlayerIndex: turn.playerIndex,
      stepIndex: turnIndex,
    };
    await this._injectBoardState(page, state, timeoutMs);
  }

  describeTurn(transcript: unknown, turnIndex: number): string {
    const t = transcript as FeudalismTranscript;
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
      'Feudalism does not support interactive takeover yet.',
    );
  }

  // ── Private helpers ──────────────────────────────────────

  /**
   * Inject a Feudalism board state via
   * `FeudalismScene.loadBoardState()` and wait for the
   * `state-settled` event.
   */
  private async _injectBoardState(
    page: Page,
    state: {
      playerStates: SPPlayerSnapshot[];
      market: SPMarketTierSnapshot[];
      tokenSupply: SPResourceTokens;
      nobles: SPNobleSnapshot[];
      phase: string;
      currentPlayerIndex: number;
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
        const scene = game.scene.getScene('FeudalismScene');
        if (!scene) {
          clearTimeout(timer);
          reject(new Error('FeudalismScene not found'));
          return;
        }
        scene.loadBoardState(${stateJson});
      })
    `);
  }
}
