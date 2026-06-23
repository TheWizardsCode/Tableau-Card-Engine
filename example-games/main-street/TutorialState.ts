/**
 * Main Street: Tutorial State Domain Model
 *
 * Provides a typed tutorial state schema, persistence adapter, and eligibility
 * logic for Main Street Milestone 5 onboarding flow.
 *
 * This module is deliberately free of Phaser dependencies so it can be unit
 * tested in Node environments.
 *
 * @module
 */

// ── Tutorial Constants ────────────────────────────────────────

/**
 * Fixed seed used when the tutorial is active.
 *
 * This seed ensures the tutorial always presents the same cards in the same
 * order, making the tutorial fully deterministic and playable end-to-end
 * without running out of money or encountering impossible actions.
 *
 * The seed is NOT persisted to any storage — it is purely for tutorial
 * gameplay and is only used when the tutorial controller is active.
 * Normal gameplay uses a random seed.
 */
export const TUTORIAL_SEED = 'tutorial-seed';

// ── Tutorial State Schema ───────────────────────────────────

export const TUTORIAL_STATE_SCHEMA_VERSION = 1;
export const TUTORIAL_STATE_STORAGE_KEY = 'tce-main-street-tutorial-state';

export type TutorialStatus = 'not_seen' | 'skipped' | 'completed';

export interface MainStreetTutorialStateV1 {
  schemaVersion: 1;
  status: TutorialStatus;
  completedAt: string | null;
  lastStepId: string | null;
}

// ── Options ─────────────────────────────────────────────────

/**
 * Options controlling tutorial visibility and behaviour.
 *
 * - `replayMode`: When true, the tutorial offer is suppressed (the replay
 *   harness drives the game directly).
 * - `disableTutorial`: Explicit disable flag for test harnesses or config.
 * - `forceShowOffer`: Override eligibility checks to always show the offer
 *   modal (useful for manual replay or QA).
 */
export interface TutorialVisibilityOptions {
  replayMode?: boolean;
  disableTutorial?: boolean;
  forceShowOffer?: boolean;
}

// ── Storage Adapter ─────────────────────────────────────────

/**
 * Thin injectable storage interface so unit tests can run in Node
 * without a real browser localStorage.
 */
export interface TutorialStorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Default adapter that uses the browser's localStorage. */
export class BrowserLocalStorageAdapter implements TutorialStorageAdapter {
  getItem(key: string): string | null {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage.getItem(key);
  }
  setItem(key: string, value: string): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(key, value);
  }
  removeItem(key: string): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.removeItem(key);
  }
}

// ── Pure Helpers ────────────────────────────────────────────

/** Returns a default tutorial state (first launch, never seen). */
export function createDefaultTutorialState(): MainStreetTutorialStateV1 {
  return {
    schemaVersion: TUTORIAL_STATE_SCHEMA_VERSION,
    status: 'not_seen',
    completedAt: null,
    lastStepId: null,
  };
}

/**
 * Safely parses a raw storage string into a TutorialState.
 *
 * Returns a default state when:
 * - Input is null/undefined
 * - JSON parsing fails
 * - Schema version is missing or unrecognized
 * - Status field is invalid
 */
export function parseTutorialState(
  raw: string | null,
): MainStreetTutorialStateV1 {
  if (!raw) return createDefaultTutorialState();

  try {
    const parsed = JSON.parse(raw) as Partial<MainStreetTutorialStateV1>;

    // Validate schema version
    if (parsed.schemaVersion !== TUTORIAL_STATE_SCHEMA_VERSION) {
      return createDefaultTutorialState();
    }

    // Validate status
    const validStatuses: TutorialStatus[] = ['not_seen', 'skipped', 'completed'];
    if (!validStatuses.includes(parsed.status as TutorialStatus)) {
      return createDefaultTutorialState();
    }

    return {
      schemaVersion: TUTORIAL_STATE_SCHEMA_VERSION,
      status: parsed.status as TutorialStatus,
      completedAt: parsed.completedAt ?? null,
      lastStepId: parsed.lastStepId ?? null,
    };
  } catch {
    return createDefaultTutorialState();
  }
}

/** Serializes a tutorial state to a JSON string for storage. */
export function serializeTutorialState(
  state: MainStreetTutorialStateV1,
): string {
  return JSON.stringify(state);
}

/**
 * Updates the status of a tutorial state and returns a new state object.
 *
 * - When transitioning to 'completed', sets `completedAt` to the current ISO timestamp.
 * - `lastStepId` is preserved unless explicitly provided.
 */
export function updateTutorialStatus(
  current: MainStreetTutorialStateV1,
  newStatus: TutorialStatus,
  opts?: { lastStepId?: string | null; now?: string },
): MainStreetTutorialStateV1 {
  return {
    schemaVersion: TUTORIAL_STATE_SCHEMA_VERSION,
    status: newStatus,
    completedAt:
      newStatus === 'completed'
        ? opts?.now ?? new Date().toISOString()
        : current.completedAt,
    lastStepId:
      opts?.lastStepId !== undefined
        ? opts.lastStepId
        : current.lastStepId,
  };
}

// ── Eligibility ─────────────────────────────────────────────

/**
 * Determines whether the tutorial offer modal should be shown.
 *
 * Returns `true` when:
 * - `forceShowOffer` is set (overrides everything)
 * - Status is 'not_seen' or 'skipped' AND neither `replayMode` nor
 *   `disableTutorial` is active
 *
 * Returns `false` when:
 * - Status is 'completed' (unless `forceShowOffer` is set)
 * - `replayMode` or `disableTutorial` is true
 */
export function shouldShowTutorialOffer(
  state: MainStreetTutorialStateV1,
  opts: TutorialVisibilityOptions = {},
): boolean {
  if (opts.forceShowOffer) return true;
  if (opts.replayMode || opts.disableTutorial) return false;
  if (state.status === 'completed' || state.status === 'skipped') return false;
  // Only 'not_seen' shows the offer
  return true;
}

// ── Persistence Layer ───────────────────────────────────────

/**
 * Loads the current tutorial state from storage.
 *
 * Falls back to a default state when storage is empty or corrupted.
 */
export function loadTutorialState(
  storage: TutorialStorageAdapter,
  key: string = TUTORIAL_STATE_STORAGE_KEY,
): MainStreetTutorialStateV1 {
  const raw = storage.getItem(key);
  return parseTutorialState(raw);
}

/**
 * Saves a tutorial state to storage.
 */
export async function saveTutorialState(
  storage: TutorialStorageAdapter,
  state: MainStreetTutorialStateV1,
  key: string = TUTORIAL_STATE_STORAGE_KEY,
): Promise<void> {
  storage.setItem(key, serializeTutorialState(state));
}

/**
 * Clears the tutorial state from storage.
 */
export function clearTutorialState(
  storage: TutorialStorageAdapter,
  key: string = TUTORIAL_STATE_STORAGE_KEY,
): void {
  storage.removeItem(key);
}

// ── Legacy Bridge ───────────────────────────────────────────

/**
 * Bridges the legacy `tutorialSeen` boolean from campaign progress
 * into the new tutorial state schema.
 *
 * - If `tutorialSeen` is true and no new-style state exists, returns
 *   a 'completed' state with no timestamp.
 * - If `tutorialSeen` is false and no new-style state exists, returns
 *   a 'not_seen' state.
 * - If new-style state already exists in storage, it takes precedence.
 *
 * This allows a smooth migration without losing existing tutorial progress.
 */
export function bridgeLegacyTutorialSeen(
  storage: TutorialStorageAdapter,
  legacyTutorialSeen: boolean | undefined,
  storageKey: string = TUTORIAL_STATE_STORAGE_KEY,
): MainStreetTutorialStateV1 {
  // Check if new-style state already exists
  const raw = storage.getItem(storageKey);
  if (raw !== null) {
    const parsed = parseTutorialState(raw);
    // Only use the legacy bridge if the new state is still at defaults
    // (i.e., nothing has explicitly set a status yet)
    if (parsed.status !== 'not_seen' || parsed.lastStepId !== null) {
      return parsed;
    }
  }

  // No new-style state found; derive from legacy flag
  if (legacyTutorialSeen) {
    return {
      schemaVersion: TUTORIAL_STATE_SCHEMA_VERSION,
      status: 'completed',
      completedAt: null,
      lastStepId: null,
    };
  }

  return createDefaultTutorialState();
}
