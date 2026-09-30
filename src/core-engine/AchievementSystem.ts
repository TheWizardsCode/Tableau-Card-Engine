/**
 * Achievement System — Engine-generic achievement layer (F3, CG-0MUNC7D0H00554B8).
 *
 * Provides a Steam-free achievement layer that sits on top of the generic
 * ChallengeSystem model. Games define achievement definitions and map
 * challenge completions to achievements; the engine handles registration,
 * mapping, and idempotent unlock tracking uniformly.
 *
 * The sink is pluggable: in the web build it is a no-op local record; in the
 * Electron launcher it delegates to the renderer client (F6) which forwards
 * over IPC to the main process Steam bridge. The renderer NEVER imports the
 * Steamworks SDK.
 *
 * ## Design Overview
 *
 * ```
 * ChallengeCompletionCallback (ChallengeSystem)
 *       │
 *       ▼
 * AchievementSystem.onChallengeCompleted(challengeId)
 *       │
 *       ├── resolve mapping: challengeId → AchievementDefinition
 *       ├── check idempotence: is already unlocked?
 *       └── call sink.unlock(achievementId)
 * ```
 *
 * @module
 */

// ── Achievement definition ──────────────────────────────────

/**
 * An achievement definition: metadata about a persistent unlock.
 *
 * Achievements are persistent across runs (unlike run-local challenges).
 * The `hidden` flag is backend-only (configured on the Steamworks partner
 * portal); this field mirrors it for documentation and UI purposes.
 */
export interface AchievementDefinition {
  /** Stable identifier used for engine-level tracking. */
  readonly id: string;
  /** Short human-readable title shown in-game and in store UI. */
  readonly title: string;
  /** Longer description of what the player must accomplish. */
  readonly description: string;
  /** Whether the achievement is hidden until unlocked (Steam backend flag). */
  readonly hidden: boolean;
}

// ── Challenge-to-achievement mapping ────────────────────────

/**
 * Maps a challenge id to an achievement definition.
 *
 * A game defines which challenges, when completed, should unlock which
 * achievements. The mapping is static (defined at initialisation time);
 * challenge evaluation remains the ChallengeSystem's responsibility.
 *
 * Returns `null` when the challenge has no mapped achievement.
 */
export type ChallengeToAchievementMapping = (
  challengeId: string,
) => AchievementDefinition | null;

// ── Achievement sink ────────────────────────────────────────

/**
 * Pluggable sink for the engine achievement layer.
 *
 * The engine calls `unlock()` when a challenge maps to an achievement.
 * The sink implementation lives in the launcher (Steam sync) or the web
 * build (no-op local record). The engine tolerates a throwing sink — a
 * dispatch failure never breaks gameplay.
 *
 * ## Implementations
 *
 * - **NoOpAchievementSink** (default): records unlocks in memory for
 *   inspection/testing but never persists or forwards. Suitable for headless
 *   and web builds.
 * - **IPC-backed sink** (launcher): delegates to the renderer client
 *   (F6) which forwards over IPC to the main process Steam bridge.
 * - **FakeAchievementSink** (launcher tests): deterministic in-memory sink
 *   with history tracking and configurable error behaviour.
 */
export interface AchievementSink {
  /**
   * Report that the achievement with the given id was unlocked.
   * Idempotent: repeated calls with the same id are safe.
   */
  unlock(achievementId: string): void;
  /**
   * Return the list of unlocked achievement ids.
   */
  getUnlocked(): string[];
  /**
   * Check whether a specific achievement id is unlocked.
   */
  isUnlocked(achievementId: string): boolean;
}

// ── No-op sink ──────────────────────────────────────────────

/**
 * No-op achievement sink — records unlocks in memory.
 *
 * Suitable for headless and web builds where there is no Steam bridge.
 * Unlocks are tracked locally for testing and inspection.
 */
export class NoOpAchievementSink implements AchievementSink {
  private readonly unlockedIds: string[] = [];

  unlock(achievementId: string): void {
    if (!this.unlockedIds.includes(achievementId)) {
      this.unlockedIds.push(achievementId);
    }
  }

  getUnlocked(): string[] {
    return [...this.unlockedIds];
  }

  isUnlocked(achievementId: string): boolean {
    return this.unlockedIds.includes(achievementId);
  }
}

// ── Achievement system ──────────────────────────────────────

/**
 * Configuration for the achievement system.
 */
export interface AchievementSystemConfig {
  /**
   * The pluggable achievement sink. Defaults to `NoOpAchievementSink`
   * when omitted (headless/web builds).
   */
  sink?: AchievementSink;
  /**
   * Initial list of already-unlocked achievement ids (for rehydration).
   * Used by the launcher to restore state from persistence on boot.
   */
  initialUnlocked?: string[];
}

/**
 * Engine-generic achievement system.
 *
 * Manages achievement definitions, the challenge-to-achievement mapping,
 * and the idempotent unlock registry. Games wire challenge completion
 * callbacks to the system's `onChallengeCompleted` method.
 *
 * ## Usage (game authoring)
 *
 * ```ts
 * const achievements = new AchievementSystem({ sink: mySink });
 * achievements.registerDefinitions(ACHIEVEMENT_DEFINITIONS);
 * achievements.setMapping((challengeId) =>
 *   ACHIEVEMENT_BY_CHALLENGE.get(challengeId) ?? null,
 * );
 *
 * // In the challenge completion callback:
 * achievements.onChallengeCompleted(challenge.id);
 * ```
 *
 * The system is idempotent: repeated completion of the same challenge
 * triggers at most one unlock per achievement.
 */
export class AchievementSystem {
  private readonly definitions = new Map<string, AchievementDefinition>();
  private mapping: ChallengeToAchievementMapping | null = null;
  private sink: AchievementSink;

  /**
   * Create a new achievement system.
   *
   * @param config — Optional configuration (sink, initial unlocked ids).
   */
  constructor(config: AchievementSystemConfig = {}) {
    this.sink = config.sink ?? new NoOpAchievementSink();

    // Rehydrate initial unlocked ids (e.g. from launcher persistence).
    if (config.initialUnlocked) {
      for (const id of config.initialUnlocked) {
        this.sink.unlock(id);
      }
    }
  }

  /**
   * Register an achievement definition.
   *
   * Idempotent: re-registering the same id silently updates the definition
   * (never triggers an unlock).
   */
  registerDefinition(def: AchievementDefinition): void {
    this.definitions.set(def.id, def);
  }

  /**
   * Register multiple achievement definitions at once.
   */
  registerDefinitions(defs: readonly AchievementDefinition[]): void {
    for (const def of defs) {
      this.registerDefinition(def);
    }
  }

  /**
   * Look up an achievement definition by id, or `null` if not registered.
   */
  getDefinition(id: string): AchievementDefinition | null {
    return this.definitions.get(id) ?? null;
  }

  /**
   * Register the challenge-to-achievement mapping.
   *
   * The mapping function receives a challenge id and returns the
   * corresponding achievement definition, or `null` if unmapped.
   */
  setMapping(mapping: ChallengeToAchievementMapping): void {
    this.mapping = mapping;
  }

  /**
   * Replace the sink (used by the launcher to attach the renderer client
   * after boot). Unlocked ids already tracked by the previous sink are
   * re-applied to the new sink.
   */
  setSink(sink: AchievementSink): void {
    // Preserve previously-tracked unlocks on the new sink.
    for (const id of this.sink.getUnlocked()) {
      sink.unlock(id);
    }
    this.sink = sink;
  }

  /**
   * Process a challenge completion event.
   *
   * Resolves the challenge id to an achievement definition, checks
   * idempotence (skip if already unlocked), and dispatches to the sink.
   * Never throws — sink dispatch failures are silently tolerated.
   *
   * @param challengeId — The id of the newly completed challenge.
   * @returns The achievement id that was unlocked, or `null` if unmapped /
   *          already unlocked / no mapping defined / sink dispatch failed.
   */
  onChallengeCompleted(challengeId: string): string | null {
    if (!this.mapping) return null;

    const achievement = this.mapping(challengeId);
    if (!achievement) return null;

    // Idempotence: skip if already unlocked.
    if (this.sink.isUnlocked(achievement.id)) return achievement.id;

    // Dispatch to sink (never throws).
    try {
      this.sink.unlock(achievement.id);
      return achievement.id;
    } catch {
      // Sink dispatch failure is silently tolerated — the unlock is
      // idempotent so a retry on next evaluation remains safe.
      return null;
    }
  }

  /**
   * Return the list of unlocked achievement ids.
   * Delegates to the sink.
   */
  getUnlockedIds(): string[] {
    return this.sink.getUnlocked();
  }

  /**
   * Check whether a specific achievement is unlocked.
   * Delegates to the sink.
   */
  isUnlocked(achievementId: string): boolean {
    return this.sink.isUnlocked(achievementId);
  }

  /**
   * Return all registered achievement definitions.
   */
  getAllDefinitions(): AchievementDefinition[] {
    return [...this.definitions.values()];
  }

  /**
   * Return the number of registered achievement definitions.
   */
  getDefinitionCount(): number {
    return this.definitions.size;
  }
}
