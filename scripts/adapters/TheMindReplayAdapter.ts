/**
 * TheMindReplayAdapter -- replay adapter for The Mind.
 *
 * Handles The Mind transcript validation, state reconstruction, and
 * state injection (via `TheMindScene.loadBoardState()`) for the replay
 * tool.
 *
 * Unlike turn-based games, The Mind records real-time events (card-played,
 * penalty, level-complete, game-over).  Each event is a replay step.
 * Board state is reconstructed by replaying events from `initialState`
 * up to the target step index.
 *
 * Version 2 transcripts include `handsDealt` on `level-complete` events,
 * enabling multi-level replay state reconstruction.
 *
 * @see ReplayAdapter                            -- interface definition
 * @see example-games/the-mind/GameTranscript.ts -- transcript types
 *
 * Related work items:
 * - CG-0MM0GQMDL061Z4UA (The Mind replay pipeline)
 * - CG-0MLTFUL061DWDGA2 (adapter pattern)
 */

import type { Page } from 'playwright';
import type {
  ReplayAdapter,
  ValidationResult,
  TakeoverOptions,
} from './ReplayAdapter';

// ── The Mind transcript types (minimal, for adapter) ──────

type PlayerId = 0 | 1;

interface MindCardPlayedEvent {
  readonly type: 'card-played';
  readonly timestamp: number;
  readonly playerId: PlayerId;
  readonly cardValue: number;
  readonly pileTopAfter: number;
  readonly pileSizeAfter: number;
}

interface MindPenaltyEvent {
  readonly type: 'penalty';
  readonly timestamp: number;
  readonly livesRemaining: number;
  readonly discardedCards: ReadonlyArray<{
    readonly playerId: PlayerId;
    readonly cardValue: number;
  }>;
}

interface MindLevelCompleteEvent {
  readonly type: 'level-complete';
  readonly timestamp: number;
  readonly level: number;
  readonly bonusLifeAwarded: boolean;
  readonly livesAfter: number;
  readonly handsDealt?: [readonly number[], readonly number[]];
}

interface MindGameOverEvent {
  readonly type: 'game-over';
  readonly timestamp: number;
  readonly outcome: 'win' | 'loss';
  readonly finalLevel: number;
  readonly finalLives: number;
}

type MindEvent =
  | MindCardPlayedEvent
  | MindPenaltyEvent
  | MindLevelCompleteEvent
  | MindGameOverEvent;

interface MindInitialState {
  readonly playerNames: [string, string];
  readonly isAI: [boolean, boolean];
  readonly startingLives: number;
  readonly startingLevel: number;
  readonly hands: [readonly number[], readonly number[]];
}

interface MindTranscript {
  readonly version: 1 | 2;
  readonly gameType: 'the-mind';
  readonly startedAt: string;
  readonly endedAt: string;
  readonly initialState: MindInitialState;
  readonly events: MindEvent[];
  readonly results: {
    readonly outcome: 'win' | 'loss';
    readonly finalLevel: number;
    readonly finalLives: number;
    readonly totalCardsPlayed: number;
    readonly totalPenalties: number;
  } | null;
}

// ── Reconstructed board state ─────────────────────────────

/**
 * Snapshot of the visual board state at a given event index.
 * Passed to `TheMindScene.loadBoardState()`.
 */
interface BoardSnapshot {
  humanHand: number[];
  aiHand: number[];
  pileTop: number;
  pileSize: number;
  currentLevel: number;
  lives: number;
  stepIndex: number;
}

// ── Type guard ─────────────────────────────────────────────

function isMindTranscript(raw: unknown): raw is MindTranscript {
  if (typeof raw !== 'object' || raw === null) return false;
  const obj = raw as Record<string, unknown>;
  return obj.gameType === 'the-mind';
}

// ── State reconstruction ──────────────────────────────────

/**
 * Reconstruct the board state at a given event index by replaying
 * events from `initialState` through `events[0..targetIndex]`.
 *
 * Returns the initial state (before any events) when targetIndex is -1.
 */
function reconstructState(
  transcript: MindTranscript,
  targetIndex: number,
): BoardSnapshot {
  const { initialState, events } = transcript;

  // Start with initial state
  const humanHand = [...initialState.hands[0]];
  const aiHand = [...initialState.hands[1]];
  let pileTop = 0;
  let pileSize = 0;
  let lives = initialState.startingLives;
  let level = initialState.startingLevel;

  // Replay events up to and including targetIndex
  for (let i = 0; i <= targetIndex && i < events.length; i++) {
    const event = events[i];

    switch (event.type) {
      case 'card-played': {
        // Remove the card from the player's hand
        const hand = event.playerId === 0 ? humanHand : aiHand;
        const cardIdx = hand.indexOf(event.cardValue);
        if (cardIdx !== -1) hand.splice(cardIdx, 1);
        pileTop = event.pileTopAfter;
        pileSize = event.pileSizeAfter;
        break;
      }

      case 'penalty': {
        // Remove discarded cards from their respective hands
        for (const discard of event.discardedCards) {
          const hand = discard.playerId === 0 ? humanHand : aiHand;
          const idx = hand.indexOf(discard.cardValue);
          if (idx !== -1) hand.splice(idx, 1);
        }
        lives = event.livesRemaining;
        break;
      }

      case 'level-complete': {
        lives = event.livesAfter;
        level = event.level + 1;
        // Reset hands for the next level if handsDealt is available (v2)
        if (event.handsDealt) {
          humanHand.length = 0;
          humanHand.push(...event.handsDealt[0]);
          aiHand.length = 0;
          aiHand.push(...event.handsDealt[1]);
        }
        // Reset pile for new level
        pileTop = 0;
        pileSize = 0;
        break;
      }

      case 'game-over': {
        // No visual state change needed beyond what preceding events set
        break;
      }
    }
  }

  return {
    humanHand: humanHand.sort((a, b) => a - b),
    aiHand: aiHand.sort((a, b) => a - b),
    pileTop,
    pileSize,
    currentLevel: level,
    lives,
    stepIndex: targetIndex,
  };
}

// ── Event description helpers ─────────────────────────────

function describeEvent(
  event: MindEvent,
  playerNames: [string, string],
): string {
  switch (event.type) {
    case 'card-played':
      return `${playerNames[event.playerId]} plays ${event.cardValue} (pile: ${event.pileTopAfter})`;
    case 'penalty': {
      const discards = event.discardedCards
        .map((d) => `${playerNames[d.playerId]}:${d.cardValue}`)
        .join(', ');
      return `Penalty! Discarded [${discards}], lives: ${event.livesRemaining}`;
    }
    case 'level-complete':
      return `Level ${event.level} complete${event.bonusLifeAwarded ? ' (+1 life)' : ''}, lives: ${event.livesAfter}`;
    case 'game-over':
      return `Game over: ${event.outcome} at level ${event.finalLevel}, lives: ${event.finalLives}`;
  }
}

// ── Adapter implementation ────────────────────────────────

export class TheMindReplayAdapter implements ReplayAdapter {
  readonly gameType = 'the-mind';
  readonly sceneKey = 'TheMindScene';

  canHandle(raw: unknown): boolean {
    return isMindTranscript(raw);
  }

  validateTranscript(raw: unknown): ValidationResult {
    if (!isMindTranscript(raw)) {
      return {
        valid: false,
        error: 'Transcript does not match The Mind schema.',
      };
    }

    if (raw.version !== 1 && raw.version !== 2) {
      return {
        valid: false,
        error: `Unsupported The Mind transcript version: ${raw.version}. Expected: 1 or 2`,
      };
    }

    if (!raw.initialState) {
      return { valid: false, error: 'Transcript has no initialState.' };
    }

    if (!Array.isArray(raw.initialState.hands) || raw.initialState.hands.length !== 2) {
      return {
        valid: false,
        error: 'Transcript initialState.hands must be an array of 2 hand arrays.',
      };
    }

    if (!Array.isArray(raw.events)) {
      return { valid: false, error: 'Transcript has no events array.' };
    }

    return { valid: true };
  }

  getTurnCount(transcript: unknown): number {
    const t = transcript as MindTranscript;
    return t.events.length;
  }

  getVersion(transcript: unknown): number {
    return (transcript as MindTranscript).version;
  }

  getSummaryLine(transcript: unknown): string {
    const t = transcript as MindTranscript;
    const players = t.initialState.playerNames.join(', ');
    const events = t.events.length;
    const outcome = t.results
      ? `${t.results.outcome} at level ${t.results.finalLevel}`
      : 'in-progress';
    return `Players: ${players}, Events: ${events}, Outcome: ${outcome}`;
  }

  supportsInteractiveTakeover(_transcript: unknown): boolean {
    // The Mind does not support interactive takeover.
    return false;
  }

  getReplayUrl(baseUrl: string): string {
    return `${baseUrl}?mode=replay&game=the-mind`;
  }

  async startScene(page: Page): Promise<void> {
    await page.evaluate(`
      (() => {
        const game = window.__PHASER_GAME__;
        game.scene.start('TheMindScene');
      })()
    `);
  }

  async waitForSceneReady(page: Page, timeoutMs: number): Promise<void> {
    await page.waitForFunction(
      `(() => {
        const game = window.__PHASER_GAME__;
        if (!game) return false;
        const scene = game.scene.getScene('TheMindScene');
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
    const t = transcript as MindTranscript;
    const snapshot = reconstructState(t, -1);
    await this._injectBoardState(page, snapshot, timeoutMs);
  }

  async injectTurnState(
    page: Page,
    transcript: unknown,
    turnIndex: number,
    timeoutMs: number,
  ): Promise<void> {
    const t = transcript as MindTranscript;
    const snapshot = reconstructState(t, turnIndex);
    await this._injectBoardState(page, snapshot, timeoutMs);
  }

  describeTurn(transcript: unknown, turnIndex: number): string {
    const t = transcript as MindTranscript;
    const event = t.events[turnIndex];
    if (!event) return `Event ${turnIndex + 1} (unknown)`;
    return `Event ${turnIndex + 1}: ${describeEvent(event, t.initialState.playerNames)}`;
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
      'The Mind does not support interactive takeover yet.',
    );
  }

  // ── Private helpers ──────────────────────────────────────

  /**
   * Inject a board state snapshot via
   * `TheMindScene.loadBoardState()` and wait for the
   * `state-settled` event.
   */
  private async _injectBoardState(
    page: Page,
    snapshot: BoardSnapshot,
    timeoutMs: number,
  ): Promise<void> {
    const stateJson = JSON.stringify(snapshot);

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
        const scene = game.scene.getScene('TheMindScene');
        if (!scene) {
          clearTimeout(timer);
          reject(new Error('TheMindScene not found'));
          return;
        }
        scene.loadBoardState(${stateJson});
      })
    `);
  }
}
