/**
 * Test doubles for the shared replay-adapter framework.
 *
 * The framework (`scripts/adapters/AdapterRegistry.ts`, `ReplayAdapter.ts`) is
 * core-owned and must be testable with no game checked out, so these fakes
 * implement the `ReplayAdapter` interface directly rather than importing a
 * real game adapter (those now live with their games).
 */

import type { ReplayAdapter, ValidationResult } from '../../scripts/adapters/ReplayAdapter';

/** Options for {@link createFakeAdapter}. */
export interface FakeAdapterOptions {
  /** Value returned by `canHandle()`. Default: matches `gameType` field. */
  canHandle?: (raw: unknown) => boolean;
  /** Marker written into the transcript to make `canHandle` match. */
  matchesGameType?: string;
}

/**
 * Build a minimal `ReplayAdapter` test double.
 *
 * Only the members the registry actually calls are meaningfully implemented;
 * the rest are inert, since the registry never invokes scene/animation hooks.
 *
 * @param gameType Canonical type id, e.g. `'fake-a'`.
 * @param options  Behaviour overrides.
 * @returns A ReplayAdapter suitable for registry tests.
 */
export function createFakeAdapter(
  gameType: string,
  options: FakeAdapterOptions = {},
): ReplayAdapter {
  const marker = options.matchesGameType ?? gameType;
  const canHandle =
    options.canHandle ??
    ((raw: unknown): boolean => {
      if (typeof raw !== 'object' || raw === null) return false;
      const r = raw as Record<string, unknown>;
      return r.gameType === marker || r.game === marker;
    });

  return {
    gameType,
    sceneKey: `${gameType}-scene`,
    canHandle,
    validateTranscript: (): ValidationResult => ({ valid: true }),
    getInitialState: () => ({}),
    getTurnState: () => ({}),
    getTurnCount: () => 0,
  } as unknown as ReplayAdapter;
}

/**
 * A transcript shaped so {@link createFakeAdapter} matches it.
 *
 * @param gameType Marker the adapter looks for.
 * @returns A minimal transcript object.
 */
export function makeTranscriptFor(gameType: string): Record<string, unknown> {
  return { version: 2, gameType, turns: [] };
}

/** A transcript no fake adapter recognises. */
export function makeUnknownTranscript(): Record<string, unknown> {
  return { version: 2, someOtherGame: true, turns: [] };
}
