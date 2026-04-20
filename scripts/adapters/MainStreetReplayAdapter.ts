import type { Page } from 'playwright';
import type { ReplayAdapter, ValidationResult, TakeoverOptions } from './ReplayAdapter';

/**
 * Minimal ReplayAdapter for Main Street.
 *
 * This adapter accepts transcripts produced by scripts/demo-main-street.ts
 * (legacy shape with `game: 'main-street'`) as well as the engine's
 * serialized checkpoint shape (gameType: 'main-street' with initialState).
 *
 * For thumbnail generation we do a lightweight injection: if the scene
 * exposes `loadBoardState()` we call it with either `initialState` (when
 * available) or a small snapshot derived from the transcript. If
 * `loadBoardState()` is not present we perform a no-op and allow the
 * scene's default setup to render a reasonable thumbnail.
 */

interface DemoTranscript {
  game?: string;
  gameType?: string;
  version?: string | number;
  seed?: string;
  startedAt?: string;
  endedAt?: string | null;
  totalTurns?: number;
  turns?: any[];
  initialState?: any;
}

function isMainStreetTranscript(raw: unknown): raw is DemoTranscript {
  if (typeof raw !== 'object' || raw === null) return false;
  const obj = raw as Record<string, unknown>;
  return obj.game === 'main-street' || obj.gameType === 'main-street';
}

export class MainStreetReplayAdapter implements ReplayAdapter {
  readonly gameType = 'main-street';
  readonly sceneKey = 'MainStreetScene';

  canHandle(raw: unknown): boolean {
    return isMainStreetTranscript(raw);
  }

  validateTranscript(raw: unknown): ValidationResult {
    if (!isMainStreetTranscript(raw)) {
      return { valid: false, error: 'Transcript is not a main-street transcript.' };
    }

    // Accept both demo transcript shape and serialized checkpoint that contains initialState
    if ((raw as DemoTranscript).initialState === undefined && (raw as DemoTranscript).turns === undefined) {
      // still allow minimal transcripts (demo may only include summary fields)
      return { valid: true };
    }

    return { valid: true };
  }

  getTurnCount(transcript: unknown): number {
    const t = transcript as DemoTranscript;
    if (Array.isArray(t.turns)) return t.turns.length;
    return 1;
  }

  getVersion(transcript: unknown): number {
    const t = transcript as DemoTranscript;
    if (typeof t.version === 'number') return t.version;
    if (typeof t.version === 'string') return Number(t.version) || 1;
    return 1;
  }

  getSummaryLine(transcript: unknown): string {
    const t = transcript as DemoTranscript;
    const seed = t.seed ?? (t.initialState && (t.initialState.seed ?? 'unknown'));
    const turns = Array.isArray(t.turns) ? t.turns.length : (t.totalTurns ?? 0);
    return `Seed: ${seed ?? 'unknown'}, Turns: ${turns}`;
  }

  supportsInteractiveTakeover(_transcript: unknown): boolean {
    // Main Street scene supports interactive takeover in principle, but
    // for this minimal adapter we do not implement takeover overlays.
    return false;
  }

  getReplayUrl(baseUrl: string): string {
    return `${baseUrl}?mode=replay&game=main-street`;
  }

  async startScene(page: Page): Promise<void> {
    // Start the MainStreet scene if not already active
    await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const g = (window as any).__PHASER_GAME__;
      if (g) {
        try { g.scene.start('MainStreetScene'); } catch (_) { /* ignore */ }
      }
    });
  }

  async waitForSceneReady(page: Page, timeoutMs: number): Promise<void> {
    await page.waitForFunction(
      `(() => {
        const g = window.__PHASER_GAME__;
        if (!g) return false;
        const s = g.scene.getScene('MainStreetScene');
        return !!(s && s.sys && s.sys.isActive());
      })()`,
      { timeout: timeoutMs },
    );
  }

  private async _tryLoadBoardState(page: Page, state: any, timeoutMs: number): Promise<void> {
    // If scene exposes loadBoardState(), call it and wait for state-settled event
    const payload = { state: state || {}, timeoutMs };
    try {
      await page.evaluate(
        (payload: any) => new Promise<void>((resolve, reject) => {
          const t = payload.timeoutMs;
          const p = payload.state;
          const timeout = setTimeout(() => reject(new Error('Timed out waiting for state-settled')), t);
          const emitter = (window as any).__GAME_EVENTS__;
          try {
            const game = (window as any).__PHASER_GAME__;
            if (!game) {
              clearTimeout(timeout);
              resolve();
              return;
            }
            const scene = game.scene.getScene('MainStreetScene');
            if (!scene || typeof scene.loadBoardState !== 'function') {
              clearTimeout(timeout);
              resolve();
              return;
            }

            if (emitter && typeof emitter.once === 'function') {
              emitter.once('state-settled', () => {
                clearTimeout(timeout);
                resolve();
              });
            }

            // Call loadBoardState with parsed payload
            scene.loadBoardState(p);

            // If the scene does not emit state-settled, resolve after a short delay
            setTimeout(() => {
              try { clearTimeout(timeout); resolve(); } catch (_) { resolve(); }
            }, Math.min(500, t));
          } catch (e) {
            clearTimeout(timeout);
            // swallow errors and resolve so replay can continue
            resolve();
          }
        }),
        payload,
      );
    } catch {
      // swallow
    }
  }

  async injectInitialState(page: Page, transcript: unknown, timeoutMs: number): Promise<void> {
    const t = transcript as DemoTranscript;
    // prefer explicit initialState if present
    const init = t.initialState ?? (t as any).initialSnapshot ?? { seed: t.seed ?? 'demo' };
    await this._tryLoadBoardState(page, init, timeoutMs);
  }

  async injectTurnState(page: Page, transcript: unknown, turnIndex: number, timeoutMs: number): Promise<void> {
    const t = transcript as DemoTranscript;
    // If transcript has serialized checkpoints per-turn, prefer those.
    // Otherwise pass a minimal snapshot containing seed and requested turn.
    const turnSnap = (Array.isArray(t.turns) && t.turns[turnIndex])
      ? { seed: t.seed, turn: turnIndex + 1, event: t.turns[turnIndex] }
      : { seed: t.seed, turn: turnIndex + 1 };
    await this._tryLoadBoardState(page, turnSnap, timeoutMs);
  }

  describeTurn(_transcript: unknown, turnIndex: number): string {
    return `Turn ${turnIndex + 1}`;
  }

  describeLastAction(_transcript: unknown, turnIndex: number): string {
    if (turnIndex < 0) return 'N/A (initial state)';
    return `Turn ${turnIndex + 1}`;
  }

  async showTakeoverOverlay(_page: Page, _options: TakeoverOptions): Promise<void> {
    throw new Error('Interactive takeover not implemented for Main Street adapter');
  }
}
