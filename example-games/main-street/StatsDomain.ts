/**
 * Main Street: Standalone Player Statistics Domain Model
 *
 * Provides a typed player statistics schema, persistence adapter, and
 * reset-all-progress helper for lightweight local tracking deferred from
 * Main Street Milestone 5.
 *
 * This module is deliberately free of Phaser dependencies so it can be unit
 * tested in Node environments.
 *
 * @module
 */

// ── Stats Constants ─────────────────────────────────────────

export const MAIN_STREET_STATS_SCHEMA_VERSION = 1;
export const MAIN_STREET_STATS_STORAGE_KEY = 'tce-main-street-stats';

// ── Stats Schema ────────────────────────────────────────────

/**
 * Schema for per-player Main Street statistics.
 *
 * Tracks lightweight aggregate stats across all runs. Designed as a
 * standalone schema (Option A from PRD Section 7.3) so it can be
 * independently loaded, reset, or migrated without affecting campaign
 * progress data.
 */
export interface MainStreetStatsV1 {
  /** Schema version for forward-compatible deserialization. */
  schemaVersion: 1;
  /** Total number of completed runs (win or loss). */
  gamesPlayed: number;
  /** Total number of winning runs. */
  wins: number;
  /** Highest single-run final score achieved. */
  bestScore: number;
  /** ISO 8601 timestamp of the most recent run completion. */
  lastPlayedAt: string | null;
}

// ── Storage Adapter ─────────────────────────────────────────

/**
 * Thin injectable storage interface so unit tests can run in Node
 * without a real browser localStorage.
 */
export interface StatsStorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Default adapter that uses the browser's localStorage. */
export class BrowserStatsStorageAdapter implements StatsStorageAdapter {
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

/** Returns a default stats state (fresh player, no runs completed). */
export function createDefaultStats(): MainStreetStatsV1 {
  return {
    schemaVersion: MAIN_STREET_STATS_SCHEMA_VERSION,
    gamesPlayed: 0,
    wins: 0,
    bestScore: 0,
    lastPlayedAt: null,
  };
}

/**
 * Safely parses a raw storage string into a MainStreetStatsV1.
 *
 * Returns a default state when:
 * - Input is null/undefined
 * - JSON parsing fails
 * - Schema version is missing or unrecognized
 * - Required fields are missing or have invalid types
 */
export function parseStats(raw: string | null): MainStreetStatsV1 {
  if (!raw) return createDefaultStats();

  try {
    const parsed = JSON.parse(raw) as Partial<MainStreetStatsV1>;

    // Validate schema version
    if (parsed.schemaVersion !== MAIN_STREET_STATS_SCHEMA_VERSION) {
      return createDefaultStats();
    }

    // Validate and coerce required numeric fields
    const gamesPlayed = typeof parsed.gamesPlayed === 'number' && !Number.isNaN(parsed.gamesPlayed) ? parsed.gamesPlayed : 0;
    const wins = typeof parsed.wins === 'number' && !Number.isNaN(parsed.wins) ? parsed.wins : 0;
    const bestScore = typeof parsed.bestScore === 'number' && !Number.isNaN(parsed.bestScore) ? parsed.bestScore : 0;
    const lastPlayedAt = typeof parsed.lastPlayedAt === 'string' ? parsed.lastPlayedAt : null;

    return {
      schemaVersion: MAIN_STREET_STATS_SCHEMA_VERSION,
      gamesPlayed,
      wins,
      bestScore,
      lastPlayedAt,
    };
  } catch {
    return createDefaultStats();
  }
}

/** Serializes a stats state to a JSON string for storage. */
export function serializeStats(stats: MainStreetStatsV1): string {
  return JSON.stringify(stats);
}

/**
 * Updates statistics after a completed run.
 *
 * Returns a new stats object (does not mutate the input).
 *
 * @param current   Current stats state.
 * @param wasWin    Whether the completed run was a win.
 * @param score     The final score of the completed run.
 * @param now       Optional ISO 8601 timestamp (defaults to current time).
 * @returns A new stats object with updated fields.
 */
export function updateStatsAfterRun(
  current: MainStreetStatsV1,
  wasWin: boolean,
  score: number,
  now?: string,
): MainStreetStatsV1 {
  return {
    schemaVersion: MAIN_STREET_STATS_SCHEMA_VERSION,
    gamesPlayed: current.gamesPlayed + 1,
    wins: wasWin ? current.wins + 1 : current.wins,
    bestScore: score > current.bestScore ? score : current.bestScore,
    lastPlayedAt: now ?? new Date().toISOString(),
  };
}

// ── Persistence Layer ───────────────────────────────────────

/**
 * Loads the current stats from storage.
 *
 * Falls back to a default state when storage is empty or corrupted.
 */
export function loadStats(
  storage: StatsStorageAdapter,
  key: string = MAIN_STREET_STATS_STORAGE_KEY,
): MainStreetStatsV1 {
  const raw = storage.getItem(key);
  return parseStats(raw);
}

/**
 * Saves a stats state to storage.
 */
export async function saveStats(
  storage: StatsStorageAdapter,
  stats: MainStreetStatsV1,
  key: string = MAIN_STREET_STATS_STORAGE_KEY,
): Promise<void> {
  storage.setItem(key, serializeStats(stats));
}

/**
 * Clears the stats entry from storage.
 */
export function clearStats(
  storage: StatsStorageAdapter,
  key: string = MAIN_STREET_STATS_STORAGE_KEY,
): void {
  storage.removeItem(key);
}

// ── Campaign Progress Keys ──────────────────────────────────

/**
 * Campaign storage constants reused from MainStreetSaveLoad for
 * resetAllProgress. These are duplicated here to avoid a circular
 * dependency and to keep StatsDomain self-contained.
 */
export const MAIN_STREET_GAME_TYPE = 'main-street';
export const MAIN_STREET_CAMPAIGN_SLOT = 'campaign-default';

// ── Reset All Progress ──────────────────────────────────────

/**
 * Resets ALL player progress: standalone stats + campaign progress.
 *
 * Clears:
 * 1. The `tce-main-street-stats` localStorage entry (standalone stats).
 * 2. The campaign progress stored via SaveLoadStore (tier unlocks,
 *    milestone history, persistent reputation, and run statistics).
 *
 * @param statsStorage  The storage adapter for standalone stats.
 * @param saveStore     The SaveLoadStore instance for campaign progress.
 * @param statsKey      Optional custom stats storage key.
 */
export async function resetAllProgress(
  statsStorage: StatsStorageAdapter,
  saveStore: { clear: (domain?: string, gameType?: string) => Promise<void> },
  statsKey: string = MAIN_STREET_STATS_STORAGE_KEY,
): Promise<void> {
  // Clear standalone stats
  clearStats(statsStorage, statsKey);

  // Clear campaign progress from SaveLoadStore
  await saveStore.clear('campaign', MAIN_STREET_GAME_TYPE);
}
