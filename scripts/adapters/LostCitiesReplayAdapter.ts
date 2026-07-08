/**
 * LostCitiesReplayAdapter -- replay adapter for Lost Cities.
 *
 * Handles Lost Cities transcript validation, state injection (via
 * `LostCitiesScene.loadBoardState()`), and scene management for
 * the replay tool.
 *
 * Lost Cities transcripts store **full board snapshots per action**
 * (not deltas like BC).  Each `TurnActionRecord` contains complete
 * `boardStates` and `tableState` after the action, so no
 * reconstruction is needed.
 *
 * Actions are nested inside rounds: `transcript.rounds[r].actions[a]`.
 * The adapter flattens all rounds' actions into a linear sequence
 * for `getTurnCount()` and `injectTurnState()`.
 *
 * @see ReplayAdapter  -- interface definition
 * @see example-games/lost-cities/GameTranscript.ts  -- LC transcript types
 *
 * Related work items:
 * - CG-0MM0GQFZA1WQKILP (Lost Cities replay adapter)
 * - CG-0MLTFUL061DWDGA2 (adapter pattern)
 */

import type { Page } from 'playwright';
import type {
  ReplayAdapter,
  ValidationResult,
  TakeoverOptions,
} from './ReplayAdapter';

// ── Lost Cities transcript types (minimal, for adapter) ────

/** Serializable snapshot of a Lost Cities card. */
interface LCCardSnapshot {
  id: number;
  color: string;
  type: 'investment' | 'numbered';
  rank: number;
  faceUp: boolean;
}

/** Snapshot of a single player's board state. */
interface PlayerBoardSnapshot {
  hand: LCCardSnapshot[];
  expeditions: Record<string, LCCardSnapshot[]>;
}

/** Snapshot of the shared table state. */
interface TableSnapshot {
  discardTops: Record<string, LCCardSnapshot | null>;
  drawPileSize: number;
}

/** Record of a single action within a turn. */
interface TurnActionRecord {
  actionNumber: number;
  playerIndex: 0 | 1;
  playerName: string;
  phase: 'PlayOrDiscard' | 'Draw';
  action: {
    kind: string;
    card?: LCCardSnapshot;
    color?: string;
  };
  boardStates: [PlayerBoardSnapshot, PlayerBoardSnapshot];
  tableState: TableSnapshot;
  roundEnded: boolean;
  matchEnded: boolean;
}

/** Record of a complete round. */
interface RoundRecord {
  roundNumber: number;
  actions: TurnActionRecord[];
  scores: unknown;
}

/** Match metadata. */
interface MatchMetadata {
  startedAt: string;
  endedAt: string;
  players: Array<{ name: string; isAI: boolean; strategy?: string }>;
}

/** Final match results. */
interface MatchResults {
  roundTotals: [number, number][];
  finalScores: [number, number];
  winnerIndex: 0 | 1 | null;
  winnerName: string;
}

/** A complete Lost Cities match transcript. */
interface LostCitiesTranscript {
  version: 1;
  gameType: 'lost-cities';
  metadata: MatchMetadata;
  initialState: {
    boardStates: [PlayerBoardSnapshot, PlayerBoardSnapshot];
    tableState: TableSnapshot;
  };
  rounds: RoundRecord[];
  results: MatchResults | null;
}

// ── Type guard ─────────────────────────────────────────────

function isLostCitiesTranscript(raw: unknown): raw is LostCitiesTranscript {
  if (typeof raw !== 'object' || raw === null) return false;
  const obj = raw as Record<string, unknown>;
  return obj.gameType === 'lost-cities';
}

// ── Helpers ────────────────────────────────────────────────

/**
 * Flatten all actions from all rounds into a single linear array.
 *
 * The replay tool works with 0-based turn indices over a flat
 * sequence.  This helper concatenates `rounds[0].actions`,
 * `rounds[1].actions`, etc.
 */
function flattenActions(transcript: LostCitiesTranscript): TurnActionRecord[] {
  const actions: TurnActionRecord[] = [];
  for (const round of transcript.rounds) {
    actions.push(...round.actions);
  }
  return actions;
}

/**
 * Describe an action record in a human-readable format.
 */
function describeAction(action: TurnActionRecord): string {
  const { playerName, phase, action: act } = action;
  const phaseLabel = phase === 'PlayOrDiscard' ? 'Play/Discard' : 'Draw';

  switch (act.kind) {
    case 'play-to-expedition': {
      const card = act.card;
      const cardDesc = card
        ? card.type === 'investment'
          ? `${card.color} investment`
          : `${card.color} ${card.rank}`
        : '?';
      return `${playerName} [${phaseLabel}]: play ${cardDesc} to ${act.color} expedition`;
    }
    case 'discard': {
      const card = act.card;
      const cardDesc = card
        ? card.type === 'investment'
          ? `${card.color} investment`
          : `${card.color} ${card.rank}`
        : '?';
      return `${playerName} [${phaseLabel}]: discard ${cardDesc} to ${act.color}`;
    }
    case 'draw-from-pile':
      return `${playerName} [${phaseLabel}]: draw from pile`;
    case 'draw-from-discard':
      return `${playerName} [${phaseLabel}]: draw from ${act.color} discard`;
    default:
      return `${playerName} [${phaseLabel}]: ${act.kind}`;
  }
}

// ── Adapter implementation ─────────────────────────────────

export class LostCitiesReplayAdapter implements ReplayAdapter {
  readonly gameType = 'lost-cities';
  readonly sceneKey = 'LostCitiesScene';

  canHandle(raw: unknown): boolean {
    return isLostCitiesTranscript(raw);
  }

  validateTranscript(raw: unknown): ValidationResult {
    if (!isLostCitiesTranscript(raw)) {
      return {
        valid: false,
        error: 'Transcript does not match Lost Cities schema.',
      };
    }

    if (raw.version !== 1) {
      return {
        valid: false,
        error: `Unsupported Lost Cities transcript version: ${raw.version}. Expected: 1`,
      };
    }

    if (!Array.isArray(raw.rounds)) {
      return { valid: false, error: 'Transcript has no rounds array.' };
    }

    if (!raw.initialState) {
      return { valid: false, error: 'Transcript has no initialState.' };
    }

    if (!raw.initialState.boardStates || !raw.initialState.tableState) {
      return {
        valid: false,
        error: 'Transcript initialState is missing boardStates or tableState.',
      };
    }

    return { valid: true };
  }

  getTurnCount(transcript: unknown): number {
    const t = transcript as LostCitiesTranscript;
    return flattenActions(t).length;
  }

  getVersion(transcript: unknown): number {
    return (transcript as LostCitiesTranscript).version;
  }

  getSummaryLine(transcript: unknown): string {
    const t = transcript as LostCitiesTranscript;
    const players = t.metadata.players.map((p) => p.name).join(', ');
    const totalActions = flattenActions(t).length;
    const rounds = t.rounds.length;
    const outcome = t.results
      ? `Winner: ${t.results.winnerName} (${t.results.finalScores.join('-')})`
      : 'in-progress';
    return `Players: ${players}, Rounds: ${rounds}, Actions: ${totalActions}, ${outcome}`;
  }

  supportsInteractiveTakeover(_transcript: unknown): boolean {
    // Lost Cities does not yet support interactive takeover.
    return false;
  }

  getReplayUrl(baseUrl: string): string {
    return `${baseUrl}?mode=replay&game=lost-cities`;
  }

  async startScene(page: Page): Promise<void> {
    await page.evaluate(`
      (() => {
        const game = window.__PHASER_GAME__;
        game.scene.start('LostCitiesScene');
      })()
    `);
  }

  async waitForSceneReady(page: Page, timeoutMs: number): Promise<void> {
    await page.waitForFunction(
      `(() => {
        const game = window.__PHASER_GAME__;
        if (!game) return false;
        const scene = game.scene.getScene('LostCitiesScene');
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
    const t = transcript as LostCitiesTranscript;
    await this._injectBoardState(
      page,
      t.initialState.boardStates,
      t.initialState.tableState,
      timeoutMs,
    );
  }

  async injectTurnState(
    page: Page,
    transcript: unknown,
    turnIndex: number,
    timeoutMs: number,
  ): Promise<void> {
    const t = transcript as LostCitiesTranscript;
    const actions = flattenActions(t);
    const action = actions[turnIndex];
    await this._injectBoardState(
      page,
      action.boardStates,
      action.tableState,
      timeoutMs,
    );
  }

  describeTurn(transcript: unknown, turnIndex: number): string {
    const t = transcript as LostCitiesTranscript;
    const actions = flattenActions(t);
    const action = actions[turnIndex];
    if (!action) return `Action ${turnIndex + 1} (unknown)`;
    return `Action ${turnIndex + 1}: ${describeAction(action)}`;
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
      'Lost Cities does not support interactive takeover yet.',
    );
  }

  // ── Private helpers ──────────────────────────────────────

  /**
   * Inject a Lost Cities board state via
   * `LostCitiesScene.loadBoardState()` and wait for the
   * `state-settled` event.
   */
  private async _injectBoardState(
    page: Page,
    boardStates: [PlayerBoardSnapshot, PlayerBoardSnapshot],
    tableState: TableSnapshot,
    timeoutMs: number,
  ): Promise<void> {
    const bsJson = JSON.stringify(boardStates);
    const tsJson = JSON.stringify(tableState);

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
        const scene = game.scene.getScene('LostCitiesScene');
        if (!scene) {
          clearTimeout(timer);
          reject(new Error('LostCitiesScene not found'));
          return;
        }
        scene.loadBoardState(${bsJson}, ${tsJson});
      })
    `);
  }
}
