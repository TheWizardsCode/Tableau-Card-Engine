/**
 * Card-pack entitlement seam (feature F5, CG-0MUZIS2B8005WG4S).
 *
 * This module defines the pure `PackEntitlementSource` contract, the
 * deterministic `FakeEntitlementSource`, and the `CardPackEntitlementService`
 * that turns a pack reference into a status the game can act on
 * (`free` / `unlocked` / `locked`).
 *
 * It mirrors the entitlement precedents in `electron/steam-follow*.ts` and
 * `electron/steam-achievements*.ts`: the Steam SDK sits behind an interface,
 * the interface ships a deterministic fake, and every method is total — a
 * missing Steam client, a missing module, or a thrown native call degrades to
 * "locked" rather than crashing the launcher. The renderer never imports this
 * module or the SDK; it reads status through `window.tce.cardPacks`
 * (see `electron/card-pack-ipc.ts`).
 *
 * The real Steamworks-backed source lives in
 * `electron/card-pack-entitlements-steamworks.ts`, loaded dynamically so the
 * launcher builds and runs without the native module.
 *
 * @see electron/card-pack-catalog.ts — the data-driven pack → DLC app-id map.
 * @see docs/DEVELOPER.md — "Card Packs"
 */

import {
  resolvePackSteamAppId,
  type CardPackDlcCatalog,
  type CatalogPackRef,
} from './card-pack-catalog.js';

// ── Source contract ────────────────────────────────────────

/** Availability of the underlying Steam client/SDK. */
export type SteamAvailability = 'available' | 'unavailable' | 'uninitialised';

/**
 * A pack reference the entitlement source is asked about.
 *
 * Shaped as the manifest-entry subset the renderer already holds, so the
 * client can forward a pack without a translation layer. `steamAppId` is the
 * value declared on the manifest (`entitlement.steamAppId`), used only as a
 * fallback when the operator catalog has no entry for the pack.
 */
export interface EntitlementPackRef {
  /** Pack id (manifest `id`). */
  readonly id: string;
  /** Game the pack extends (manifest `gameId`), when known. */
  readonly gameId?: string;
  /** Steam app id declared on the manifest entry, when present. */
  readonly steamAppId?: number | null;
}

/**
 * Minimal Steam interface consumed by the entitlement logic.
 *
 * The renderer NEVER imports this directly; the main process owns the only
 * concrete implementation and exposes a narrow API over the context bridge.
 */
export interface PackEntitlementSource {
  /**
   * Initialise the underlying Steamworks session.
   * Must never throw — return `'unavailable'` when Steam is absent.
   */
  init(): Promise<SteamAvailability>;
  /** Whether the Steam session is currently usable. */
  isSteamAvailable(): boolean;
  /**
   * Whether the current user is entitled to *pack* (e.g. owns its Steam DLC).
   * Returns `false` (locked) whenever Steam or the app id is unavailable.
   * Must never throw.
   */
  isEntitled(pack: EntitlementPackRef): Promise<boolean>;
  /**
   * Whether `isEntitled()` is backed by a real SDK capability call.
   *
   * `false` means the loaded Steamworks module exposes no
   * `apps.isDlcInstalled` (or no module was loaded at all), so the UI must
   * render the pack as locked and the launcher must not claim ownership.
   * Omitted/falsy-optional is treated as "supported" by legacy callers;
   * concrete sources should set it explicitly.
   */
  readonly dlcCheckSupported?: boolean;
  /** Release the Steamworks session (no-op when unavailable). */
  close(): void;
}

// ── Status ─────────────────────────────────────────────────

/**
 * Entitlement state of one pack.
 *
 * - `free` — the pack declares no entitlement and is playable base content.
 * - `unlocked` — a gated pack whose entitlement is satisfied.
 * - `locked` — a gated pack whose entitlement is not satisfied (not owned,
 *   Steam unavailable, or the capability is missing). `reason` explains why.
 */
export type PackEntitlementState = 'free' | 'unlocked' | 'locked';

/** Status of one pack, as exposed to the renderer. */
export interface PackEntitlementStatus {
  /** Pack id (manifest `id`). */
  readonly packId: string;
  /** Game the pack extends, when known. */
  readonly gameId: string | null;
  /** Entitlement state (see {@link PackEntitlementState}). */
  readonly state: PackEntitlementState;
  /** Steam app id that gates the pack, or `null` when the pack is free. */
  readonly steamAppId: number | null;
  /** Human-readable lock reason; `null` when the pack is playable. */
  readonly reason: string | null;
}

/** Lock reason shown when Steam is unavailable. */
export const PACK_LOCK_REASON_STEAM_UNAVAILABLE = 'Steam is unavailable.';

/** Lock reason shown when the pack's Steam DLC is not owned. */
export function packDlcLockReason(steamAppId: number): string {
  return `Requires Steam DLC ${steamAppId}.`;
}

/** Coerce a possibly-malformed app id to a positive integer, or `null`. */
export function normaliseSteamAppId(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) return null;
  return value;
}

// ── Deterministic fake ─────────────────────────────────────

/** Options for {@link FakeEntitlementSource}. */
export interface FakeEntitlementSourceOptions {
  /** `init()` result. Defaults to `'available'`. */
  availability?: SteamAvailability;
  /** Steam app ids treated as owned. Defaults to none. */
  ownedAppIds?: number[];
  /** Force `init()` to throw, to prove the caller tolerates it. */
  initThrows?: boolean;
}

/**
 * Deterministic in-memory `PackEntitlementSource` for unit tests.
 *
 * No timers, no RNG, no I/O, no Steam client — every call returns the
 * configured value, which is what makes the entitlement flow reproducible.
 */
export class FakeEntitlementSource implements PackEntitlementSource {
  private availability: SteamAvailability;
  private readonly owned: Set<number>;

  /** The fake models a source whose DLC check IS backed by a real API. */
  readonly dlcCheckSupported = true;

  /** App ids passed to `isEntitled`, in call order (for assertions). */
  readonly checkedAppIds: number[] = [];
  /** Whether `close()` has been called. */
  closed = false;
  /** Force `init()` to throw, to prove the caller tolerates it. */
  initThrows = false;

  constructor(options: FakeEntitlementSourceOptions = {}) {
    this.availability = options.availability ?? 'available';
    this.owned = new Set(options.ownedAppIds ?? []);
    this.initThrows = options.initThrows ?? false;
  }

  /** Grant ownership of a DLC app id (simulates a purchase). */
  grant(appId: number): void {
    this.owned.add(appId);
  }

  /** Revoke ownership of a DLC app id. */
  revoke(appId: number): void {
    this.owned.delete(appId);
  }

  /** Change the Steam availability at runtime. */
  setAvailability(availability: SteamAvailability): void {
    this.availability = availability;
  }

  async init(): Promise<SteamAvailability> {
    if (this.initThrows) throw new Error('Steam init failed');
    return this.availability;
  }

  isSteamAvailable(): boolean {
    return this.availability === 'available' && !this.closed;
  }

  async isEntitled(pack: EntitlementPackRef): Promise<boolean> {
    const appId = normaliseSteamAppId(pack.steamAppId);
    if (appId === null) return false;
    this.checkedAppIds.push(appId);
    return this.isSteamAvailable() && this.owned.has(appId);
  }

  close(): void {
    this.closed = true;
    this.availability = 'uninitialised';
  }
}

// ── Service ────────────────────────────────────────────────

/**
 * Resolves pack entitlement status for the launcher.
 *
 * The service is the seam between the renderer and the entitlement source: it
 * resolves the pack's Steam app id through the config-driven catalog
 * (`electron/card-pack-catalog.ts`), then asks the source whether that id is
 * owned. Every method is total — a missing source capability or a thrown
 * check resolves to `locked`, never an exception.
 */
export class CardPackEntitlementService {
  constructor(
    private readonly source: PackEntitlementSource,
    private readonly catalog: CardPackDlcCatalog | null,
  ) {}

  /** Whether Steam is currently usable. */
  isSteamAvailable(): boolean {
    try {
      return this.source.isSteamAvailable() === true;
    } catch {
      return false;
    }
  }

  /** Whether a pack → DLC catalog was loaded. */
  hasCatalog(): boolean {
    return this.catalog !== null;
  }

  /** Whether the source exposes a real DLC-ownership capability call. */
  supportsDlcCheck(): boolean {
    return this.source.dlcCheckSupported !== false;
  }

  /** The loaded catalog (for the renderer listing), or `null`. */
  getCatalog(): CardPackDlcCatalog | null {
    return this.catalog;
  }

  /** Resolve the Steam app id gating *pack*, or `null` when it is free. */
  resolveSteamAppId(pack: CatalogPackRef): number | null {
    return resolvePackSteamAppId(this.catalog, pack);
  }

  /**
   * Resolve the entitlement status of one pack. Never throws: a free pack is
   * `free`, a gated pack with no Steam is `locked`, and an owned gated pack is
   * `unlocked`.
   */
  async getStatus(pack: EntitlementPackRef): Promise<PackEntitlementStatus> {
    const steamAppId = this.resolveSteamAppId(pack);
    const base = { packId: pack.id, gameId: pack.gameId ?? null, steamAppId };

    if (steamAppId === null) {
      return { ...base, state: 'free', reason: null };
    }

    if (!this.isSteamAvailable()) {
      return { ...base, state: 'locked', reason: PACK_LOCK_REASON_STEAM_UNAVAILABLE };
    }

    let entitled = false;
    try {
      entitled = (await this.source.isEntitled({ ...pack, steamAppId })) === true;
    } catch {
      entitled = false;
    }

    return entitled
      ? { ...base, state: 'unlocked', reason: null }
      : { ...base, state: 'locked', reason: packDlcLockReason(steamAppId) };
  }

  /** Resolve the status of many packs, preserving input order. */
  async listStatus(packs: readonly EntitlementPackRef[]): Promise<PackEntitlementStatus[]> {
    return Promise.all(packs.map((pack) => this.getStatus(pack)));
  }

  /** Release the underlying Steam session. */
  close(): void {
    this.source.close();
  }
}
