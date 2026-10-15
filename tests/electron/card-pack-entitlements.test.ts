/**
 * Unit tests for the card-pack entitlement seam
 * (`electron/card-pack-entitlements.ts` + `card-pack-entitlements-steamworks.ts`,
 * feature F5 / CG-0MUZIS2B8005WG4S).
 *
 * Uses the deterministic `FakeEntitlementSource` and a fake `steamworks.js`
 * module object — no Steam client, native module, Electron, or browser
 * required. Covers free/gated resolution, entitlement/catalog lookup,
 * Steam-absent degradation, every failure/throw path (methods stay total), and
 * capability detection.
 */
import { describe, it, expect, vi } from 'vitest';

// `steamworks.js` is an optional native dependency; mock the import to reject
// so the default loader's graceful-degradation branch is exercised (a pruned
// install / load-time error).
vi.mock('steamworks.js', () => {
  throw new Error('steamworks.js unavailable');
});

import {
  CardPackEntitlementService,
  FakeEntitlementSource,
  PACK_LOCK_REASON_STEAM_UNAVAILABLE,
  normaliseSteamAppId,
  packDlcLockReason,
  type EntitlementPackRef,
  type PackEntitlementSource,
} from '../../electron/card-pack-entitlements.js';
import {
  SteamPackEntitlementSource,
  checkEntitlementSupport,
  defaultSteamworksEntitlementLoader,
  type SteamworksEntitlementClientLike,
  type SteamworksEntitlementModuleLike,
} from '../../electron/card-pack-entitlements-steamworks.js';
import type { CardPackDlcCatalog } from '../../electron/card-pack-catalog.js';

const CATALOG: CardPackDlcCatalog = {
  version: 1,
  packs: [{ gameId: 'game', packId: 'gated', steamAppId: 777 }],
};

// ── FakeEntitlementSource ───────────────────────────────────

describe('FakeEntitlementSource', () => {
  it('reflects its configured availability', async () => {
    expect(await new FakeEntitlementSource().init()).toBe('available');
    expect(await new FakeEntitlementSource({ availability: 'unavailable' }).init()).toBe(
      'unavailable',
    );
  });

  it('rejects when initThrows is set (the caller tolerates it)', async () => {
    const source = new FakeEntitlementSource({ initThrows: true });
    await expect(source.init()).rejects.toThrow('Steam init failed');
  });

  it('entitles only owned app ids and records every check', async () => {
    const source = new FakeEntitlementSource({ ownedAppIds: [777] });
    await source.init();

    expect(await source.isEntitled({ id: 'a', steamAppId: 777 })).toBe(true);
    expect(await source.isEntitled({ id: 'b', steamAppId: 888 })).toBe(false);
    expect(source.checkedAppIds).toEqual([777, 888]);
  });

  it('does not check an unknown app id', async () => {
    const source = new FakeEntitlementSource();
    expect(await source.isEntitled({ id: 'a' })).toBe(false);
    expect(await source.isEntitled({ id: 'a', steamAppId: 0 })).toBe(false);
    expect(source.checkedAppIds).toEqual([]);
  });

  it('supports grant/revoke at runtime', async () => {
    const source = new FakeEntitlementSource();
    await source.init();

    source.grant(42);
    expect(await source.isEntitled({ id: 'a', steamAppId: 42 })).toBe(true);
    source.revoke(42);
    expect(await source.isEntitled({ id: 'a', steamAppId: 42 })).toBe(false);
  });

  it('is unavailable after close()', async () => {
    const source = new FakeEntitlementSource({ ownedAppIds: [1] });
    await source.init();
    source.close();

    expect(source.closed).toBe(true);
    expect(source.isSteamAvailable()).toBe(false);
    expect(await source.isEntitled({ id: 'a', steamAppId: 1 })).toBe(false);
  });
});

// ── CardPackEntitlementService ──────────────────────────────

describe('CardPackEntitlementService', () => {
  function makeService(
    options: { catalog?: CardPackDlcCatalog | null; availability?: 'available' | 'unavailable'; ownedAppIds?: number[] } = {},
  ) {
    const source = new FakeEntitlementSource({
      availability: options.availability,
      ownedAppIds: options.ownedAppIds,
    });
    const catalog = options.catalog === undefined ? CATALOG : options.catalog;
    return { service: new CardPackEntitlementService(source, catalog), source };
  }

  it('reports a pack with no gate as free and never checks Steam', async () => {
    const { service, source } = makeService();
    await source.init();

    expect(await service.getStatus({ id: 'free-pack' })).toEqual({
      packId: 'free-pack',
      gameId: null,
      state: 'free',
      steamAppId: null,
      reason: null,
    });
    expect(source.checkedAppIds).toEqual([]);
  });

  it('resolves a catalog-gated pack as unlocked when owned', async () => {
    const { service, source } = makeService({ ownedAppIds: [777] });
    await source.init();

    expect(await service.getStatus({ id: 'gated', gameId: 'game' })).toEqual({
      packId: 'gated',
      gameId: 'game',
      state: 'unlocked',
      steamAppId: 777,
      reason: null,
    });
    expect(source.checkedAppIds).toEqual([777]);
  });

  it('resolves a catalog-gated pack as locked when not owned', async () => {
    const { service, source } = makeService();
    await source.init();

    const status = await service.getStatus({ id: 'gated', gameId: 'game' });
    expect(status.state).toBe('locked');
    expect(status.steamAppId).toBe(777);
    expect(status.reason).toBe(packDlcLockReason(777));
  });

  it('locks a gated pack when Steam is unavailable and does not check it', async () => {
    const { service, source } = makeService({ availability: 'unavailable', ownedAppIds: [777] });
    await source.init();

    const status = await service.getStatus({ id: 'gated', gameId: 'game' });
    expect(status).toEqual({
      packId: 'gated',
      gameId: 'game',
      state: 'locked',
      steamAppId: 777,
      reason: PACK_LOCK_REASON_STEAM_UNAVAILABLE,
    });
    expect(source.checkedAppIds).toEqual([]);
  });

  it('falls back to the manifest declaration when the catalog is absent', async () => {
    const { service, source } = makeService({ catalog: null, ownedAppIds: [42] });
    await source.init();

    expect(service.resolveSteamAppId({ id: 'p', steamAppId: 42 })).toBe(42);
    expect((await service.getStatus({ id: 'p', steamAppId: 42 })).state).toBe('unlocked');
  });

  it('exposes catalog/capability accessors', async () => {
    const { service, source } = makeService();
    await source.init();

    expect(service.hasCatalog()).toBe(true);
    expect(service.getCatalog()).toBe(CATALOG);
    expect(service.supportsDlcCheck()).toBe(true);
    expect(service.isSteamAvailable()).toBe(true);

    const { service: noCatalog } = makeService({ catalog: null });
    expect(noCatalog.hasCatalog()).toBe(false);
    expect(noCatalog.getCatalog()).toBeNull();
  });

  it('listStatus preserves order and resolves each pack', async () => {
    const { service, source } = makeService({ ownedAppIds: [777] });
    await source.init();

    const packs: EntitlementPackRef[] = [
      { id: 'free' },
      { id: 'gated', gameId: 'game' },
    ];
    const statuses = await service.listStatus(packs);
    expect(statuses.map((s) => s.packId)).toEqual(['free', 'gated']);
    expect(statuses.map((s) => s.state)).toEqual(['free', 'unlocked']);
  });

  it('locks a gated pack when the source throws (never surfaces the error)', async () => {
    const throwingSource: PackEntitlementSource = {
      init: async () => 'available',
      isSteamAvailable: () => true,
      isEntitled: async () => {
        throw new Error('native boom');
      },
      close: () => undefined,
    };
    const service = new CardPackEntitlementService(throwingSource, CATALOG);

    await expect(service.getStatus({ id: 'gated', gameId: 'game' })).resolves.toMatchObject({
      state: 'locked',
      steamAppId: 777,
    });
  });

  it('close() releases the underlying source', async () => {
    const { service, source } = makeService();
    service.close();
    expect(source.closed).toBe(true);
  });
});

// ── normaliseSteamAppId ─────────────────────────────────────

describe('normaliseSteamAppId', () => {
  it('accepts positive integers only', () => {
    expect(normaliseSteamAppId(1)).toBe(1);
    expect(normaliseSteamAppId(480)).toBe(480);
    for (const value of [0, -1, 1.5, NaN, Infinity, '1', null, undefined, {}]) {
      expect(normaliseSteamAppId(value), JSON.stringify(value)).toBeNull();
    }
  });
});

// ── Steamworks adapter ──────────────────────────────────────

/** A well-behaved fake client that records DLC checks. */
function makeClient(overrides: Partial<SteamworksEntitlementClientLike> = {}) {
  const calls: number[] = [];
  const owned = new Set<number>();
  const client: SteamworksEntitlementClientLike = {
    apps: {
      isDlcInstalled: (appId: number) => {
        calls.push(appId);
        return owned.has(appId);
      },
    },
    ...overrides,
  };
  return { client, calls, owned };
}

/** A fake module whose `init` returns *client*. */
function makeModule(
  client: SteamworksEntitlementClientLike,
  opts: { restart?: boolean; overlayCalls?: boolean[] } = {},
): SteamworksEntitlementModuleLike {
  return {
    init: () => client,
    restartAppIfNecessary: () => opts.restart ?? false,
    electronEnableSteamOverlay: (disable?: boolean) => {
      opts.overlayCalls?.push(disable ?? false);
    },
  };
}

const loaderFor = (module: SteamworksEntitlementModuleLike | null) => async () => module;

describe('checkEntitlementSupport', () => {
  it('is true for a client with apps.isDlcInstalled', () => {
    expect(checkEntitlementSupport(makeClient().client)).toBe(true);
  });

  it('is false without the apps namespace or the method', () => {
    expect(checkEntitlementSupport(makeClient({ apps: undefined }).client)).toBe(false);
    expect(checkEntitlementSupport(makeClient({ apps: {} }).client)).toBe(false);
    expect(checkEntitlementSupport(null)).toBe(false);
  });
});

describe('SteamPackEntitlementSource.init', () => {
  it('returns unavailable when no appId is configured', async () => {
    const source = new SteamPackEntitlementSource({ loader: loaderFor(makeModule(makeClient().client)) });
    expect(await source.init()).toBe('unavailable');
    expect(source.isSteamAvailable()).toBe(false);
    expect(source.dlcCheckSupported).toBe(false);
  });

  it('returns unavailable when the module is absent', async () => {
    const source = new SteamPackEntitlementSource({ appId: 480, loader: loaderFor(null) });
    expect(await source.init()).toBe('unavailable');
    expect(source.isSteamAvailable()).toBe(false);
  });

  it('returns available and detects the DLC API', async () => {
    const source = new SteamPackEntitlementSource({
      appId: 480,
      loader: loaderFor(makeModule(makeClient().client)),
    });
    expect(await source.init()).toBe('available');
    expect(source.isSteamAvailable()).toBe(true);
    expect(source.dlcCheckSupported).toBe(true);
  });

  it('marks restartRequested and stays unavailable when Steam restarts the app', async () => {
    const source = new SteamPackEntitlementSource({
      appId: 480,
      loader: loaderFor(makeModule(makeClient().client, { restart: true })),
    });
    expect(await source.init()).toBe('unavailable');
    expect(source.restartRequested).toBe(true);
    expect(source.isSteamAvailable()).toBe(false);
  });

  it('never throws when the loader or module init throws', async () => {
    const loaderThrows = new SteamPackEntitlementSource({
      appId: 480,
      loader: async () => {
        throw new Error('native load failed');
      },
    });
    await expect(loaderThrows.init()).resolves.toBe('unavailable');

    const initThrows: SteamworksEntitlementModuleLike = {
      init: () => {
        throw new Error('Steam not running');
      },
    };
    const source = new SteamPackEntitlementSource({ appId: 480, loader: loaderFor(initThrows) });
    await expect(source.init()).resolves.toBe('unavailable');
  });

  it('reports a capability gap when the client lacks the DLC API', async () => {
    const source = new SteamPackEntitlementSource({
      appId: 480,
      loader: loaderFor(makeModule(makeClient({ apps: {} }).client)),
    });
    await source.init();
    expect(source.isSteamAvailable()).toBe(true);
    expect(source.dlcCheckSupported).toBe(false);
  });

  it('enables the overlay hook when requested', async () => {
    const overlayCalls: boolean[] = [];
    const source = new SteamPackEntitlementSource({
      appId: 480,
      loader: loaderFor(makeModule(makeClient().client, { overlayCalls })),
      enableOverlay: true,
    });
    await source.init();
    expect(overlayCalls).toEqual([true]);
  });
});

describe('SteamPackEntitlementSource.isEntitled', () => {
  it('returns true only for an installed DLC app id', async () => {
    const { client, calls, owned } = makeClient();
    owned.add(777);
    const source = new SteamPackEntitlementSource({ appId: 480, loader: loaderFor(makeModule(client)) });
    await source.init();

    expect(await source.isEntitled({ id: 'p', steamAppId: 777 })).toBe(true);
    expect(await source.isEntitled({ id: 'p', steamAppId: 888 })).toBe(false);
    expect(calls).toEqual([777, 888]);
  });

  it('returns false without an app id, without Steam, or when the API is missing', async () => {
    const { client } = makeClient();
    const source = new SteamPackEntitlementSource({ appId: 480, loader: loaderFor(makeModule(client)) });
    await source.init();

    expect(await source.isEntitled({ id: 'p' })).toBe(false);
    expect(await source.isEntitled({ id: 'p', steamAppId: 0 })).toBe(false);

    const unavailable = new SteamPackEntitlementSource({ appId: 480, loader: loaderFor(null) });
    await unavailable.init();
    expect(await unavailable.isEntitled({ id: 'p', steamAppId: 1 })).toBe(false);

    const gap = new SteamPackEntitlementSource({
      appId: 480,
      loader: loaderFor(makeModule(makeClient({ apps: {} }).client)),
    });
    await gap.init();
    expect(await gap.isEntitled({ id: 'p', steamAppId: 1 })).toBe(false);
    expect(gap.dlcCheckSupported).toBe(false);
  });

  it('returns false when the native check throws', async () => {
    const { client } = makeClient({
      apps: {
        isDlcInstalled: () => {
          throw new Error('native boom');
        },
      },
    });
    const source = new SteamPackEntitlementSource({ appId: 480, loader: loaderFor(makeModule(client)) });
    await source.init();
    await expect(source.isEntitled({ id: 'p', steamAppId: 1 })).resolves.toBe(false);
  });

  it('close() clears the client and capability', async () => {
    const source = new SteamPackEntitlementSource({
      appId: 480,
      loader: loaderFor(makeModule(makeClient().client)),
    });
    await source.init();
    source.close();

    expect(source.isSteamAvailable()).toBe(false);
    expect(source.dlcCheckSupported).toBe(false);
    expect(await source.isEntitled({ id: 'p', steamAppId: 1 })).toBe(false);
  });
});

describe('defaultSteamworksEntitlementLoader', () => {
  it('resolves null when the steamworks.js import fails', async () => {
    await expect(defaultSteamworksEntitlementLoader()).resolves.toBeNull();
  });

  it('drives a source lifecycle that degrades to locked without the native module', async () => {
    const source = new SteamPackEntitlementSource({ appId: 480 });
    await source.init();

    expect(source.isSteamAvailable()).toBe(false);
    expect(await source.isEntitled({ id: 'p', steamAppId: 1 })).toBe(false);
    source.close();
  });
});
