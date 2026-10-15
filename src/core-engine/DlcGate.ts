/**
 * DlcGate — pure, framework-free gate for in-game DLC content
 * (CG-0MUZGBTWW00729L4, feature F7 of CG-0MUZF156A007OUIT).
 *
 * A game gates a DLC content item by asking one question — "is this DLC
 * unlocked?" — against the unified, target-keyed unlock state, read through an
 * injected {@link DlcUnlockReader}. In the Electron launcher that reader is the
 * F5 renderer client (`contentUnlockClient.isUnlocked` bound to the
 * `window.tce.contentUnlocks` bridge); a game may equally inject a test fake or
 * omit it entirely.
 *
 * **Totality contract (intake AC2/AC6).** The gate never throws and never
 * fabricates an unlock: an absent reader, a throwing reader, a non-boolean
 * result, or a malformed target all degrade to *not unlocked*. A DLC whose
 * unlock state cannot be read is therefore unreachable rather than fatal, so an
 * engine/plugin failure can never crash the owning game.
 *
 * **No framework coupling.** This module imports nothing — no Phaser, no
 * Electron, no Node. The owning game supplies the reader, so the gate is
 * deterministic, unit-testable in plain Node, and usable from the core engine
 * without pulling in a platform dependency.
 *
 * @module src/core-engine/DlcGate
 */

/**
 * A DLC content target.
 *
 * The shape is structurally identical to the unified `DlcTarget` in
 * `electron/unlock-rules` and the renderer `DlcUnlockTarget` in
 * `src/ui/content-unlock-client`, so a game can pass the same object straight
 * through to the read client with no adaptation.
 */
export interface DlcGateTarget {
  kind: 'dlc';
  gameId: string;
  dlcId: string;
}

/**
 * Reads whether a DLC target is unlocked from the unified state.
 *
 * May be synchronous or asynchronous. In the launcher this is
 * `(target) => contentUnlockClient.isUnlocked(target)`; a game may instead pass
 * a deterministic fake. Anything the reader throws or rejects is caught by the
 * gate and treated as "not unlocked".
 */
export type DlcUnlockReader = (target: DlcGateTarget) => boolean | Promise<boolean>;

/**
 * Why a DLC content item is (or is not) reachable.
 *
 * - `'unlocked'` — the reader confirmed the target is unlocked.
 * - `'locked'` — the reader reported the target is not unlocked, or the target
 *   was malformed.
 * - `'unreadable'` — no reader was supplied, or the reader failed; treated as
 *   locked.
 */
export type DlcGateReason = 'unlocked' | 'locked' | 'unreadable';

/** Result of a gate check for a single DLC content item. */
export interface DlcGateResult {
  /** The owning game's id. */
  gameId: string;
  /** The DLC content item's id. */
  dlcId: string;
  /** `true` only when the reader positively confirmed the unlock. */
  unlocked: boolean;
  /** Why the item is reachable (`unlocked`) or not (`locked`/`unreadable`). */
  reason: DlcGateReason;
}

/**
 * A game-scoped DLC gate.
 *
 * Create one per game with {@link createDlcGate} and reuse it for every gated
 * content item; the game id is captured once.
 */
export interface DlcGate {
  /** The owning game's id (as supplied, or `''` when missing). */
  readonly gameId: string;
  /** Whether `dlcId` is unlocked. Never rejects; unreadable → `false`. */
  isUnlocked(dlcId: string): Promise<boolean>;
  /** Full status for `dlcId`, including the locked/unreadable reason. Never rejects. */
  check(dlcId: string): Promise<DlcGateResult>;
}

/** Options for {@link createDlcGate}. */
export interface DlcGateOptions {
  /** The owning game's id — used to key every DLC target. */
  gameId: string;
  /**
   * Read the unified unlock state. Optional: omitting it (or passing `null`)
   * yields an always-locked gate, so a plain-browser build needs no branching
   * at the call site.
   */
  isUnlocked?: DlcUnlockReader | null;
}

/** Non-empty string guard shared by the game id and DLC id. */
function isValidId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Create a {@link DlcGate} for one game.
 *
 * The returned gate is total: `isUnlocked()`/`check()` always resolve and never
 * reject, reporting `false`/`unreadable` when the state cannot be read.
 *
 * @param options  The owning game id and an optional unlock reader.
 */
export function createDlcGate(options: DlcGateOptions): DlcGate {
  const rawGameId = options?.gameId;
  const gameId = isValidId(rawGameId) ? rawGameId : '';
  const reader: DlcUnlockReader | null =
    typeof options?.isUnlocked === 'function' ? options.isUnlocked : null;

  async function check(dlcId: string): Promise<DlcGateResult> {
    const safeDlcId = isValidId(dlcId) ? dlcId : '';

    // A misconfigured gate (missing game id or DLC id) can never be unlocked
    // and must not call the reader with a malformed target.
    if (gameId === '' || safeDlcId === '') {
      return { gameId, dlcId: safeDlcId, unlocked: false, reason: 'locked' };
    }

    if (reader === null) {
      return { gameId, dlcId: safeDlcId, unlocked: false, reason: 'unreadable' };
    }

    try {
      const result = await reader({ kind: 'dlc', gameId, dlcId: safeDlcId });
      if (result === true) {
        return { gameId, dlcId: safeDlcId, unlocked: true, reason: 'unlocked' };
      }
      return { gameId, dlcId: safeDlcId, unlocked: false, reason: 'locked' };
    } catch {
      return { gameId, dlcId: safeDlcId, unlocked: false, reason: 'unreadable' };
    }
  }

  return {
    get gameId(): string {
      return gameId;
    },
    async isUnlocked(dlcId: string): Promise<boolean> {
      return (await check(dlcId)).unlocked;
    },
    check,
  };
}
