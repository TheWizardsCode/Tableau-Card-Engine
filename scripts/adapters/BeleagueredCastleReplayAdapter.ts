/**
 * BeleagueredCastleReplayAdapter -- typed stub for Beleaguered Castle.
 *
 * Beleaguered Castle has a working Phaser scene and transcript
 * recording, but does NOT yet have the replay infrastructure needed
 * for the replay tool:
 *
 * - No `loadBoardState()` method on the scene
 * - No `state-settled` event emission
 * - No `?mode=replay` URL parameter handling
 * - No `showTakeoverOverlay()` method
 *
 * This stub proves the adapter interface compiles with BC's transcript
 * types and provides clear error messages when someone attempts to
 * replay a BC transcript.  It will be replaced with a full
 * implementation once the BC scene gains replay support.
 *
 * @see ReplayAdapter  -- interface definition
 * @see example-games/beleaguered-castle/GameTranscript.ts  -- BC transcript types
 *
 * Related work items:
 * - CG-0MLTFUL061DWDGA2 (this adapter pattern)
 * - CG-0MLSDWFLT1WB6IEB (Beleaguered Castle game)
 */

import type { Page } from 'playwright';
import type {
  ReplayAdapter,
  ValidationResult,
  TakeoverOptions,
} from './ReplayAdapter';

// ── BC transcript types (minimal, for detection/validation) ─

/**
 * Minimal representation of a Beleaguered Castle transcript.
 *
 * Full types are defined in
 * `example-games/beleaguered-castle/GameTranscript.ts`.
 * Only the fields needed for detection and validation are
 * included here to avoid importing game-specific modules.
 */
interface BCTranscriptMinimal {
  version: 1;
  game: 'beleaguered-castle';
  seed: number;
  startedAt: string;
  endedAt: string;
  initialState: unknown;
  moves: unknown[];
  result: unknown;
}

// ── Type guard ─────────────────────────────────────────────

function isBCTranscript(raw: unknown): raw is BCTranscriptMinimal {
  if (typeof raw !== 'object' || raw === null) return false;
  const obj = raw as Record<string, unknown>;
  return obj.game === 'beleaguered-castle';
}

// ── Adapter implementation (stub) ──────────────────────────

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

    return { valid: true };
  }

  getTurnCount(transcript: unknown): number {
    const t = transcript as BCTranscriptMinimal;
    return t.moves.length;
  }

  getVersion(transcript: unknown): number {
    return (transcript as BCTranscriptMinimal).version;
  }

  getSummaryLine(_transcript: unknown): string {
    const t = _transcript as BCTranscriptMinimal;
    return `Seed: ${t.seed}`;
  }

  supportsInteractiveTakeover(_transcript: unknown): boolean {
    // BC does not yet support interactive takeover.
    return false;
  }

  getReplayUrl(baseUrl: string): string {
    return `${baseUrl}?mode=replay&game=beleaguered-castle`;
  }

  async startScene(_page: Page): Promise<void> {
    throw new Error(
      'Beleaguered Castle replay is not yet supported. ' +
        'The scene needs loadBoardState() and state-settled event support. ' +
        'See CG-0MLSDWFLT1WB6IEB.',
    );
  }

  async waitForSceneReady(_page: Page, _timeoutMs: number): Promise<void> {
    throw new Error(
      'Beleaguered Castle replay is not yet supported.',
    );
  }

  async injectInitialState(
    _page: Page,
    _transcript: unknown,
    _timeoutMs: number,
  ): Promise<void> {
    throw new Error(
      'Beleaguered Castle replay is not yet supported. ' +
        'The scene needs a loadBoardState() method.',
    );
  }

  async injectTurnState(
    _page: Page,
    _transcript: unknown,
    _turnIndex: number,
    _timeoutMs: number,
  ): Promise<void> {
    throw new Error(
      'Beleaguered Castle replay is not yet supported.',
    );
  }

  describeTurn(transcript: unknown, turnIndex: number): string {
    const t = transcript as BCTranscriptMinimal;
    const move = t.moves[turnIndex] as Record<string, unknown>;
    return `Move ${turnIndex + 1} (${move.kind ?? 'unknown'})`;
  }

  describeLastAction(_transcript: unknown, turnIndex: number): string {
    if (turnIndex < 0) return 'N/A (initial state)';
    return `Move ${turnIndex + 1}`;
  }

  async showTakeoverOverlay(
    _page: Page,
    _options: TakeoverOptions,
  ): Promise<void> {
    throw new Error(
      'Beleaguered Castle does not support interactive takeover yet.',
    );
  }
}
