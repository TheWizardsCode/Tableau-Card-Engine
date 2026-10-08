/**
 * Steam follow-to-unlock core — pure Node, no Electron, no Steamworks SDK.
 *
 * This module defines the `FollowSource` abstraction (F2, CG-0MSMAJQQT004SDCC)
 * and the game-agnostic unlock logic that sits behind it. Keeping the SDK
 * behind this interface means:
 *
 *  - the renderer never imports the Steamworks SDK (it talks to the main
 *    process over the `steamFollow` context-bridge API — see F3), and
 *  - the unlock/persistence flow is unit-testable with a deterministic fake
 *    (`FakeFollowSource`), with no Steam client present.
 *
 * The real Steamworks-backed source lives in `steam-follow-steamworks.ts`
 * (loaded dynamically so the launcher still builds and runs without the
 * native module — intake AC5).
 */
import fs from 'fs/promises';
import path from 'path';
import type { SteamConfig } from './steam-config.js';
import {
  ActionRewardService,
  type ContentUnlockRecord,
  type ContentUnlockStore,
} from './action-rewards.js';
import { ActionVerifierRegistry, STEAM_FOLLOW_VERIFIER_ID, SteamFollowActionVerifier } from './action-verifiers.js';
import { createUnlockRuleSet, targetKey, type UnlockRuleSet, type UnlockTarget } from './unlock-rules.js';

// ── Follow source contract ─────────────────────────────────

/** Availability of the underlying Steam client/SDK. */
export type SteamAvailability = 'available' | 'unavailable' | 'uninitialised';

/**
 * Minimal Steam interface consumed by the unlock logic.
 *
 * The renderer NEVER imports this directly; the main process owns the only
 * concrete implementation and exposes a narrow API over the context bridge.
 */
export interface FollowSource {
  /**
   * Initialise the underlying Steamworks session.
   * Must never throw — return `'unavailable'` when Steam is absent.
   */
  init(): Promise<SteamAvailability>;
  /** Whether the Steam session is currently usable. */
  isSteamAvailable(): boolean;
  /**
   * Open the Steam page for *url* in the Steam client/overlay.
   * Returns `false` when Steam is unavailable (caller falls back to a browser).
   */
  openStorePage(url: string): Promise<boolean>;
  /**
   * Whether the current user follows the given developer account (SteamID64).
   * Returns `false` when Steam is unavailable.
   */
  isFollowing(developerSteamId: string): Promise<boolean>;
  /**
   * Whether `isFollowing()` is backed by a real SDK detection call.
   *
   * `false` means the loaded Steamworks module does not expose
   * `ISteamFriends::IsFollowing` (the `steamworks.js` 0.4.0 binding does not),
   * so the UI must offer a manual self-attest fallback and the launcher must
   * not claim automatic detection. Omitted/falsy-optional is treated as
   * "supported" by legacy callers; concrete sources should set it explicitly.
   */
  readonly followCheckSupported?: boolean;
  /** Release the Steamworks session (no-op when unavailable). */
  close(): void;
}

// ── Bonus catalog ──────────────────────────────────────────

/** One bundled game that can be unlocked. */
export interface BonusCatalogEntry {
  /** Stable identifier used for persistence (never the display title). */
  id: string;
  /** Display title shown in the launcher. */
  title: string;
  /** Phaser scene key used to start the game. */
  sceneKey: string;
  /** Short description for the unlock UI. */
  description: string;
}

/**
 * Config-driven bonus catalog — game-agnostic (intake AC4).
 *
 * `bonusGameId` designates which bundled game is unlocked by the follow
 * incentive; the rest stay locked (reserved for future milestones). The
 * producer designates the game (CG-0MSMAJQQT004SDCC: Feudalism); nothing in
 * the code hard-codes a title.
 */
export interface BonusCatalog {
  /** `id` of the game unlocked when the follow is confirmed. */
  bonusGameId: string;
  /** Every bundled game, including locked ones. */
  games: BonusCatalogEntry[];
}

/** Resolve the designated bonus entry from a catalog, or `null` if invalid. */
export function resolveBonusGame(catalog: BonusCatalog): BonusCatalogEntry | null {
  return catalog.games.find((g) => g.id === catalog.bonusGameId) ?? null;
}

// ── Unlock persistence ─────────────────────────────────────

/** Persisted unlock state. */
export interface UnlockState {
  unlocked: boolean;
  /** `id` of the unlocked game (catalog-driven). */
  chosenGameId: string | null;
  /** ISO timestamp of the unlock. */
  unlockedAt: string | null;
}

/** Persistence for the unlock flag (survives launches — intake AC3). */
export interface UnlockStore {
  load(): Promise<UnlockState | null>;
  save(state: UnlockState): Promise<void>;
}

/** In-memory unlock store for tests and ephemeral runs. */
export class MemoryUnlockStore implements UnlockStore {
  private state: UnlockState | null;

  constructor(initial: UnlockState | null = null) {
    this.state = initial ? { ...initial } : null;
  }

  async load(): Promise<UnlockState | null> {
    return this.state ? { ...this.state } : null;
  }

  async save(state: UnlockState): Promise<void> {
    this.state = { ...state };
  }
}

/**
 * JSON-file unlock store — the production persistence mechanism.
 *
 * A missing/corrupt file is treated as "not unlocked" (never throws), so a
 * first launch or a wiped file degrades gracefully.
 */
export class FileUnlockStore implements UnlockStore {
  constructor(private readonly filePath: string) {}

  async load(): Promise<UnlockState | null> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<UnlockState>;
      if (typeof parsed.unlocked !== 'boolean') return null;
      return {
        unlocked: parsed.unlocked,
        chosenGameId: parsed.chosenGameId ?? null,
        unlockedAt: parsed.unlockedAt ?? null,
      };
    } catch {
      return null;
    }
  }

  async save(state: UnlockState): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, `${JSON.stringify(state, null, 2)}\n`, 'utf-8');
  }
}

// ── Unified-persistence bridge ─────────────────────────────

/**
 * Adapts the legacy single-game `UnlockStore` to the unified, target-keyed
 * `ContentUnlockStore` so `SteamFollowService` can route its unlock through
 * `ActionRewardService` without changing its public surface or its persisted
 * on-disk format (intake AC3 / backward compatibility).
 *
 * Only game targets are representable; the Steam follow reward targets a
 * whole game, so that is sufficient here.
 */
class LegacyUnlockStoreAdapter implements ContentUnlockStore {
  constructor(private readonly store: UnlockStore) {}

  async getAll(): Promise<ContentUnlockRecord[]> {
    const state = await this.store.load();
    if (!state?.unlocked || !state.chosenGameId) return [];
    const target: UnlockTarget = { kind: 'game', gameId: state.chosenGameId };
    return [
      { key: targetKey(target), target, unlockedAt: state.unlockedAt ?? new Date().toISOString() },
    ];
  }

  async isUnlocked(target: UnlockTarget): Promise<boolean> {
    const state = await this.store.load();
    return !!state?.unlocked && state.chosenGameId === target.gameId;
  }

  async unlock(
    target: UnlockTarget,
    unlockedAt: string = new Date().toISOString(),
  ): Promise<ContentUnlockRecord> {
    await this.store.save({ unlocked: true, chosenGameId: target.gameId, unlockedAt });
    return { key: targetKey(target), target, unlockedAt };
  }
}

/** Platform/action identifiers for the Steam follow reward (data, not logic). */
const STEAM_FOLLOW_RULE_ID = 'steam-follow';
const STEAM_PLATFORM = 'steam';
const STEAM_FOLLOW_ACTION = 'follow';

/**
 * Build the generalised reward service that backs the Steam follow reward.
 *
 * The follow rule targets the config-designated bonus game (never a
 * hard-coded title) and resolves the Steam verifier through the pluggable
 * seam, so the legacy Steam flow and the generalised service share one path.
 */
function buildSteamFollowRewardService(
  source: FollowSource,
  store: UnlockStore,
  catalog: BonusCatalog | null,
  config: SteamConfig | null,
): ActionRewardService {
  const registry = new ActionVerifierRegistry(STEAM_FOLLOW_VERIFIER_ID).register(
    new SteamFollowActionVerifier(source, config?.developerSteamId ?? null),
  );
  const bonus = catalog ? resolveBonusGame(catalog) : null;
  const rules: UnlockRuleSet | null = bonus
    ? createUnlockRuleSet([
        {
          id: STEAM_FOLLOW_RULE_ID,
          trigger: { kind: 'platform-action', platform: STEAM_PLATFORM, action: STEAM_FOLLOW_ACTION },
          target: { kind: 'game', gameId: bonus.id },
        },
      ])
    : null;

  return new ActionRewardService({
    rules,
    store: new LegacyUnlockStoreAdapter(store),
    verifiers: registry,
    verifierConfig: { rules: { [STEAM_FOLLOW_RULE_ID]: STEAM_FOLLOW_VERIFIER_ID } },
  });
}

// ── Deterministic fake follow source ───────────────────────

export interface FakeFollowSourceOptions {
  /** `init()` result. Defaults to `'available'`. */
  availability?: SteamAvailability;
  /** `isFollowing()` result. Defaults to `false`. */
  following?: boolean;
  /** `openStorePage()` result. Defaults to `true`. */
  openResult?: boolean;
}

/**
 * Deterministic in-memory `FollowSource` for unit tests.
 *
 * No timers, no RNG, no I/O — every call returns the configured value, which
 * is what makes the unlock flow tests reproducible.
 */
export class FakeFollowSource implements FollowSource {
  private availability: SteamAvailability;
  private following: boolean;
  private readonly openResult: boolean;

  /** The fake models a source whose follow check IS backed by a real API. */
  readonly followCheckSupported = true;

  /** URLs passed to `openStorePage`, in call order (for assertions). */
  readonly openedUrls: string[] = [];
  /** Number of `isFollowing` calls (for re-verification assertions). */
  followingChecks = 0;
  /** Developer IDs passed to `isFollowing`, in call order. */
  readonly checkedDeveloperIds: string[] = [];
  /** Whether `close()` has been called. */
  closed = false;
  /** Force `init()` to throw, to prove the caller tolerates it. */
  initThrows = false;

  constructor(options: FakeFollowSourceOptions = {}) {
    this.availability = options.availability ?? 'available';
    this.following = options.following ?? false;
    this.openResult = options.openResult ?? true;
  }

  /** Change the follow state at runtime (simulates the player following). */
  setFollowing(value: boolean): void {
    this.following = value;
  }

  async init(): Promise<SteamAvailability> {
    if (this.initThrows) throw new Error('Steam init failed');
    return this.availability;
  }

  isSteamAvailable(): boolean {
    return this.availability === 'available';
  }

  async openStorePage(url: string): Promise<boolean> {
    this.openedUrls.push(url);
    return this.openResult;
  }

  async isFollowing(developerSteamId: string): Promise<boolean> {
    this.followingChecks += 1;
    this.checkedDeveloperIds.push(developerSteamId);
    return this.availability === 'available' && this.following;
  }

  close(): void {
    this.closed = true;
  }
}

// ── Unlock service ─────────────────────────────────────────

export type UnlockReason =
  | 'already-unlocked'
  | 'follow-confirmed'
  | 'not-following'
  | 'steam-unavailable'
  | 'config-missing'
  | 'manual-claim';

export interface UnlockResult {
  unlocked: boolean;
  chosenGameId: string | null;
  reason: UnlockReason;
}

export type FollowStatus =
  | { state: 'steam-unavailable' }
  | { state: 'config-missing' }
  | { state: 'locked' }
  | { state: 'unlocked'; unlock: UnlockState };

/**
 * Orchestrates follow detection, catalog resolution, and unlock persistence.
 *
 * Game-agnostic: the unlocked game comes from `catalog.bonusGameId`, never a
 * hard-coded title. Once unlocked, the state is persisted and **not
 * re-verified** on subsequent launches (intake AC3) — `refresh()` short-
 * circuits to `already-unlocked` without calling the follow source.
 *
 * Backward-compatible shim over the generalised reward flow: detection and
 * persistence run through `ActionRewardService` (the same path as every other
 * platform-action reward), bridged to the legacy single-game `UnlockStore` by
 * `LegacyUnlockStoreAdapter`. The public surface and reasons are unchanged.
 */
export class SteamFollowService {
  /**
   * The generalised reward service the Steam follow rule runs through. This
   * makes the Steam reward one consumer of the same `ActionRewardService`
   * path as every other platform-action reward.
   */
  private readonly reward: ActionRewardService;

  constructor(
    private readonly source: FollowSource,
    private readonly store: UnlockStore,
    private readonly catalog: BonusCatalog | null,
    private readonly config: SteamConfig | null,
  ) {
    this.reward = buildSteamFollowRewardService(this.source, this.store, this.catalog, this.config);
  }

  /**
   * Current status for the launcher UI. Cheap — reads persisted state only.
   */
  async getStatus(): Promise<FollowStatus> {
    if (!this.config) return { state: 'config-missing' };
    if (!this.source.isSteamAvailable()) return { state: 'steam-unavailable' };
    const unlock = await this.store.load();
    if (unlock?.unlocked) return { state: 'unlocked', unlock };
    return { state: 'locked' };
  }

  /**
   * Re-check the follow state and unlock the bonus when confirmed.
   *
   * Idempotent: an already-unlocked player is never re-verified.
   */
  async refresh(): Promise<UnlockResult> {
    const existing = await this.store.load();
    if (existing?.unlocked) {
      return { unlocked: true, chosenGameId: existing.chosenGameId, reason: 'already-unlocked' };
    }
    if (!this.config) {
      return { unlocked: false, chosenGameId: null, reason: 'config-missing' };
    }
    const bonus = this.catalog ? resolveBonusGame(this.catalog) : null;
    if (!bonus) {
      return { unlocked: false, chosenGameId: null, reason: 'config-missing' };
    }
    if (!this.source.isSteamAvailable()) {
      return { unlocked: false, chosenGameId: null, reason: 'steam-unavailable' };
    }

    const [result] = await this.reward.refresh();
    if (result && (result.outcome === 'unlocked' || result.outcome === 'already-unlocked')) {
      return { unlocked: true, chosenGameId: bonus.id, reason: 'follow-confirmed' };
    }
    return { unlocked: false, chosenGameId: null, reason: 'not-following' };
  }

  /**
   * Open the store/community page in the Steam client. Returns `false` when
   * Steam or the config is unavailable so the caller can fall back to a
   * browser (intake AC5).
   */
  async openFollowPage(): Promise<boolean> {
    if (!this.config || !this.source.isSteamAvailable()) return false;
    return this.source.openStorePage(this.config.storeUrl);
  }

  /**
   * Whether automatic follow detection is available on this source. When
   * `false`, the UI offers `claimManually()` instead (see F1 finding).
   */
  supportsAutomaticFollowCheck(): boolean {
    return this.source.followCheckSupported !== false;
  }

  /**
   * Self-attest fallback used when the Steamworks binding exposes no
   * `ISteamFriends::IsFollowing` call: the player confirms they followed after
   * the store page opened. Persists exactly like an automatic unlock.
   */
  async claimManually(): Promise<UnlockResult> {
    const existing = await this.store.load();
    if (existing?.unlocked) {
      return { unlocked: true, chosenGameId: existing.chosenGameId, reason: 'already-unlocked' };
    }
    if (!this.config) {
      return { unlocked: false, chosenGameId: null, reason: 'config-missing' };
    }
    const bonus = this.catalog ? resolveBonusGame(this.catalog) : null;
    if (!bonus) {
      return { unlocked: false, chosenGameId: null, reason: 'config-missing' };
    }
    const [result] = await this.reward.refresh({ attested: true });
    if (result && (result.outcome === 'unlocked' || result.outcome === 'already-unlocked')) {
      return { unlocked: true, chosenGameId: bonus.id, reason: 'manual-claim' };
    }
    return { unlocked: false, chosenGameId: null, reason: 'not-following' };
  }

  /** Release the underlying Steam session. */
  close(): void {
    this.source.close();
  }
}
