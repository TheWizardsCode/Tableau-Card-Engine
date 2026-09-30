/**
 * Steam achievements — core contracts, manifest types, and deterministic fakes.
 *
 * This module defines the seam interfaces that separate the engine (renderer)
 * from the Steam SDK, and the deterministic fakes that make every path
 * unit-testable without a Steam client.
 *
 * The renderer NEVER imports the Steamworks SDK. It talks to the main process
 * over the context-bridge API (`window.tce.achievements` — see F6). The main
 * process owns the only concrete `AchievementSource` implementation and
 * exposes a narrow API over the bridge (intake AC5).
 *
 * The real Steamworks-backed source lives in `steam-achievements-steamworks.ts`
 * (loaded dynamically so the launcher still builds and runs without the native
 * module — intake AC5).
 *
 * @module
 */
import fs from 'fs/promises';
import path from 'path';

// ── Steam availability ─────────────────────────────────────

/** Availability of the underlying Steam client/SDK. */
export type SteamAvailability = 'available' | 'unavailable' | 'uninitialised';

// ── Achievement manifest types ─────────────────────────────

/**
 * One achievement mapping in the launcher manifest.
 *
 * The manifest is the single source of truth: game id ↔ achievement id
 * ↔ Steam API name ↔ hidden flag (intake AC4). It must match the static
 * Steam store configuration (API names are backend-defined).
 *
 * The `hidden` flag is configured on the Steamworks partner backend; the
 * client API cannot set or query it. This flag is mirrored here for
 * documentation and UI purposes only.
 */
export interface AchievementManifestEntry {
  /** Stable identifier used for engine-level tracking. */
  achievementId: string;
  /** Steamworks API name — must match the Steam partner backend exactly. */
  steamApiName: string;
  /** Whether the achievement is hidden on the Steam profile until unlocked. */
  hidden: boolean;
}

/**
 * Achievement manifest for a single game.
 *
 * Maps engine-level challenge IDs (or achievement IDs) to Steam API names.
 * The manifest is loaded from `electron/achievement-manifest.json` at launch.
 *
 * Validation rules (enforced by the loader):
 * - `achievementId` values must be unique within the game.
 * - `steamApiName` values must be unique within the game.
 * - `steamApiName` must match a name returned by `achievement.names()` at
 *   runtime in validation mode (F1 spike F1.7).
 */
export interface AchievementManifest {
  /** Game identifier (e.g. `main-street`). */
  gameId: string;
  /** Achievement definitions — the source of truth. */
  achievements: AchievementManifestEntry[];
}

/**
 * The top-level achievement manifest file.
 *
 * `version` allows a future format migration to be detected. `games` holds
 * one {@link AchievementManifest} per game. Achievement ids and Steam API
 * names are app-global (unique across every game).
 */
export interface AchievementManifestFile {
  /** Manifest format version. */
  readonly version: number;
  /** Per-game achievement manifests. */
  readonly games: AchievementManifest[];
}

// ── Engine-side achievement sink ────────────────────────────

/**
 * Pluggable sink for the engine achievement layer.
 *
 * The engine calls `unlock()` when a challenge maps to an achievement.
 * The sink implementation lives in the launcher (Steam sync) or the web
 * build (no-op local record). Never throws.
 *
 * The renderer NEVER imports this interface directly; it is part of the
 * engine layer (F3).
 */
export interface AchievementSink {
  /**
   * Report that the achievement with the given id was unlocked.
   * Idempotent: repeated calls with the same id are safe (no duplicate effects).
   */
  unlock(achievementId: string): void;
  /**
   * Return the list of unlocked achievement ids (for persistence, display).
   */
  getUnlocked(): string[];
  /**
   * Check whether a specific achievement id is unlocked.
   */
  isUnlocked(achievementId: string): boolean;
}

// ── Launcher-side achievement source ────────────────────────

/**
 * Minimal Steam interface consumed by the achievement sync logic.
 *
 * The renderer NEVER imports this directly; the main process owns the only
 * concrete implementation and exposes a narrow API over the context bridge.
 */
export interface AchievementSource {
  /**
   * Initialise the underlying Steamworks session.
   * Must never throw — return `'unavailable'` when Steam is absent.
   */
  init(): Promise<SteamAvailability>;
  /** Whether the Steam session is currently usable. */
  isSteamAvailable(): boolean;
  /**
   * Unlock the achievement identified by its Steam API name.
   * Returns `false` when Steam is unavailable (caller persists locally).
   * Never throws — always returns a safe value.
   */
  setAchievement(steamApiName: string): Promise<boolean>;
  /**
   * Persist pending stats/achievements to the Steam server.
   * Returns `false` when Steam is unavailable (caller persists locally).
   * Never throws.
   */
  storeStats(): Promise<boolean>;
  /**
   * Check whether an achievement has been unlocked (local cached state).
   */
  isUnlocked(steamApiName: string): Promise<boolean>;
  /**
   * Return all unlocked achievement API names (local cached state).
   */
  getUnlockedNames(): Promise<string[]>;
  /** Release the Steamworks session (no-op when unavailable). */
  close(): void;
}

// ── Achievement persistence store ───────────────────────────

/**
 * Persistence interface for unlocked achievement ids.
 *
 * Survives launcher restarts so the re-sync protocol can replay unlocks.
 */
export interface AchievementStore {
  load(): Promise<string[]>;
  save(ids: string[]): Promise<void>;
}

/** In-memory achievement store for tests and ephemeral runs. */
export class MemoryAchievementStore implements AchievementStore {
  private ids: string[];

  constructor(initial: string[] = []) {
    this.ids = [...initial];
  }

  async load(): Promise<string[]> {
    return [...this.ids];
  }

  async save(newIds: string[]): Promise<void> {
    this.ids = [...newIds];
  }
}

/**
 * JSON-file achievement store — the production persistence mechanism.
 *
 * A missing/corrupt file returns an empty array (never throws), so a first
 * launch or a wiped file degrades gracefully.
 */
export class FileAchievementStore implements AchievementStore {
  constructor(private readonly filePath: string) {}

  async load(): Promise<string[]> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      // Filter to strings only (reject corrupt entries).
      return parsed.filter((item): item is string => typeof item === 'string');
    } catch {
      return [];
    }
  }

  async save(ids: string[]): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, `${JSON.stringify(ids, null, 2)}\n`, 'utf-8');
  }
}

// ── Deterministic fake achievement sink ─────────────────────

/** Options for `FakeAchievementSink`. */
export interface FakeAchievementSinkOptions {
  /** Whether `unlock()` should throw (to test caller tolerance). */
  throwsOnUnlock?: boolean;
}

/**
 * Deterministic in-memory `AchievementSink` for engine-layer unit tests.
 *
 * No timers, no RNG, no I/O — every call returns the configured value.
 * Tracks unlock history for assertions.
 */
export class FakeAchievementSink implements AchievementSink {
  readonly unlockedIds: string[] = [];
  /** Unlock call history (for assertions). */
  readonly unlockHistory: string[] = [];
  /** Whether `unlock()` throws on the next call (for error-path testing). */
  throwsOnUnlock: boolean;

  constructor(options: FakeAchievementSinkOptions = {}) {
    this.throwsOnUnlock = options.throwsOnUnlock ?? false;
  }

  unlock(achievementId: string): void {
    if (this.throwsOnUnlock) {
      throw new Error('Fake sink unlock failed');
    }
    if (!this.unlockedIds.includes(achievementId)) {
      this.unlockedIds.push(achievementId);
    }
    this.unlockHistory.push(achievementId);
  }

  getUnlocked(): string[] {
    return [...this.unlockedIds];
  }

  isUnlocked(achievementId: string): boolean {
    return this.unlockedIds.includes(achievementId);
  }
}

// ── Deterministic fake achievement source ───────────────────

/** Options for `FakeAchievementSource`. */
export interface FakeAchievementSourceOptions {
  /** `init()` result. Defaults to `'available'`. */
  availability?: SteamAvailability;
  /** Pre-set unlocked achievement names (for isUnlocked queries). */
  unlockedNames?: string[];
  /** Whether `setAchievement` should succeed or fail. Defaults to `true`. */
  setAchievementResult?: boolean;
  /** Whether `storeStats` should succeed or fail. Defaults to `true`. */
  storeStatsResult?: boolean;
}

/**
 * Deterministic in-memory `AchievementSource` for launcher unit tests.
 *
 * No timers, no RNG, no I/O, no Steam client — every call returns the
 * configured value, which is what makes the sync flow tests reproducible.
 */
export class FakeAchievementSource implements AchievementSource {
  private availability: SteamAvailability;
  private unlockedNames: Set<string>;
  private readonly setAchievementResult: boolean;
  private readonly storeStatsResult: boolean;
  private closed = false;

  constructor(options: FakeAchievementSourceOptions = {}) {
    this.availability = options.availability ?? 'available';
    this.unlockedNames = new Set(options.unlockedNames ?? []);
    this.setAchievementResult = options.setAchievementResult ?? true;
    this.storeStatsResult = options.storeStatsResult ?? true;
  }

  async init(): Promise<SteamAvailability> {
    return this.availability;
  }

  isSteamAvailable(): boolean {
    return this.availability === 'available' && !this.closed;
  }

  async setAchievement(steamApiName: string): Promise<boolean> {
    if (this.closed) return false;
    this.unlockedNames.add(steamApiName);
    return this.setAchievementResult;
  }

  async storeStats(): Promise<boolean> {
    if (this.closed) return false;
    return this.storeStatsResult;
  }

  async isUnlocked(steamApiName: string): Promise<boolean> {
    if (this.closed) return false;
    return this.unlockedNames.has(steamApiName);
  }

  async getUnlockedNames(): Promise<string[]> {
    if (this.closed) return [];
    return [...this.unlockedNames];
  }

  close(): void {
    this.closed = true;
  }
}

// ── Achievement sync service ────────────────────────────────

/**
 * Outcome of a single achievement unlock attempt.
 *
 * `unlocked` means the id is now tracked locally (survives a restart).
 * `synced` means Steam accepted and stored it this call. An offline unlock
 * is `unlocked: true, synced: false` and is replayed by `resync()` later.
 */
export type AchievementUnlockReason =
  | 'unlocked'
  | 'already-unlocked'
  | 'unknown-achievement'
  | 'manifest-missing'
  | 'steam-unavailable'
  | 'store-failed';

export interface AchievementUnlockResult {
  achievementId: string;
  /** Whether the achievement is tracked locally after this call. */
  unlocked: boolean;
  /** Whether Steam accepted the unlock this call. */
  synced: boolean;
  /** Why the result is what it is (for logging/UI). */
  reason: AchievementUnlockReason;
}

/** Summary of a re-sync pass over all locally-unlocked ids. */
export interface AchievementResyncResult {
  /** Number of ids successfully re-sent to Steam this pass. */
  synced: number;
  /** Number of ids that could not be synced (Steam unavailable or failed). */
  failed: number;
  /** Ids in the store that are absent from the manifest (drift). */
  unknown: string[];
  /** Whether Steam was usable for this pass. */
  steamAvailable: boolean;
}

/**
 * Pure-Node achievement sync service (F4, CG-0MUNC7DNE0088ERH).
 *
 * Owns the unlock protocol: resolve the manifest entry, persist the id
 * locally first (offline-safe), then sync to Steam when available. Never
 * throws — every failure degrades to a safe result so the launcher keeps
 * running (intake AC3).
 *
 * ## Idempotence
 *
 * - Locally: an id already in the store is never added twice.
 * - On Steam: `setAchievement` is a no-op for an already-active achievement,
 *   and `resync()` re-sends every local id, so a retry is always safe.
 *
 * ## Offline-safe re-sync
 *
 * `resync()` is called once at launch (F6) and re-sends every persisted id.
 * A launch where Steam is absent simply leaves the ids persisted for the next
 * available launch. There is no separate "pending" flag: re-sending an
 * already-synced achievement is harmless and keeps the store as the single
 * source of truth.
 */
export class SteamAchievementService {
  constructor(
    private readonly source: AchievementSource,
    private readonly store: AchievementStore,
    private readonly manifest: AchievementManifestFile | null,
  ) {}

  /** Whether Steam is currently usable. */
  isSteamAvailable(): boolean {
    return this.source.isSteamAvailable();
  }

  /** Whether a manifest is loaded (achievements are configured). */
  hasManifest(): boolean {
    return this.manifest !== null;
  }

  /**
   * Unlock an achievement by its engine-level id.
   *
   * Persists locally first, then syncs to Steam when available. Idempotent:
   * a repeat call for an already-tracked id short-circuits.
   */
  async unlock(achievementId: string): Promise<AchievementUnlockResult> {
    if (!this.manifest) {
      return { achievementId, unlocked: false, synced: false, reason: 'manifest-missing' };
    }

    const resolved = findEntryByAchievementId(this.manifest, achievementId);
    if (!resolved) {
      return { achievementId, unlocked: false, synced: false, reason: 'unknown-achievement' };
    }

    const unlockedIds = await this.store.load();
    const wasTracked = unlockedIds.includes(achievementId);
    if (!wasTracked) {
      // Persist locally first — the unlock survives even if Steam is absent.
      await this.store.save([...unlockedIds, achievementId]);
    }

    if (!this.source.isSteamAvailable()) {
      return {
        achievementId,
        unlocked: true,
        synced: false,
        reason: wasTracked ? 'already-unlocked' : 'steam-unavailable',
      };
    }

    // (Re-)sync when Steam is available. `setAchievement` is idempotent on
    // the Steam side, so a repeat unlock that failed earlier is retried here.
    const synced = await this.syncEntry(resolved.entry);
    return {
      achievementId,
      unlocked: true,
      synced,
      reason: wasTracked ? 'already-unlocked' : synced ? 'unlocked' : 'store-failed',
    };
  }

  /**
   * Re-send every persisted unlock to Steam.
   *
   * Called once at launch (F6). No-op when Steam is unavailable; never
   * throws. Ids absent from the manifest are reported as `unknown` (drift)
   * and skipped rather than failing the whole pass.
   */
  async resync(): Promise<AchievementResyncResult> {
    const unlockedIds = await this.store.load();
    const unknown: string[] = [];

    if (!this.manifest || !this.source.isSteamAvailable()) {
      return {
        synced: 0,
        failed: this.manifest ? unlockedIds.length : 0,
        unknown,
        steamAvailable: this.source.isSteamAvailable(),
      };
    }

    let synced = 0;
    let failed = 0;
    for (const id of unlockedIds) {
      const resolved = findEntryByAchievementId(this.manifest, id);
      if (!resolved) {
        unknown.push(id);
        continue;
      }
      if (await this.syncEntry(resolved.entry)) {
        synced += 1;
      } else {
        failed += 1;
      }
    }

    return { synced, failed, unknown, steamAvailable: true };
  }

  /** Locally-tracked unlocked achievement ids. */
  async getUnlocked(): Promise<string[]> {
    return this.store.load();
  }

  /** Check whether a specific achievement id is tracked locally. */
  async isUnlocked(achievementId: string): Promise<boolean> {
    return (await this.store.load()).includes(achievementId);
  }

  /**
   * Look up an achievement's Steam API name, or `null` when unknown.
   * Used by the IPC layer for diagnostics. Never throws.
   */
  resolveSteamApiName(achievementId: string): string | null {
    if (!this.manifest) return null;
    return findEntryByAchievementId(this.manifest, achievementId)?.entry.steamApiName ?? null;
  }

  /** Release the underlying Steam session. */
  close(): void {
    this.source.close();
  }

  /** Activate + store one manifest entry. Returns whether Steam accepted. */
  private async syncEntry(entry: AchievementManifestEntry): Promise<boolean> {
    try {
      const activated = await this.source.setAchievement(entry.steamApiName);
      if (!activated) return false;
      return await this.source.storeStats();
    } catch {
      return false;
    }
  }
}

// ── Manifest lookup (avoids a runtime import cycle) ─────────

/**
 * Resolve an achievement entry by achievement id across all games.
 *
 * Kept here (rather than importing from `achievement-manifest.ts`) to avoid
 * a runtime circular import; `achievement-manifest.ts` re-exports the richer
 * loader/validator helpers for callers that need them.
 */
export function findEntryByAchievementId(
  manifest: AchievementManifestFile,
  achievementId: string,
): { gameId: string; entry: AchievementManifestEntry } | null {
  for (const game of manifest.games) {
    const entry = game.achievements.find((a) => a.achievementId === achievementId);
    if (entry) return { gameId: game.gameId, entry };
  }
  return null;
}