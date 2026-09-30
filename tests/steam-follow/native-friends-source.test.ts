/**
 * Unit tests for the native follow-module fallback in `SteamworksFollowSource`
 * (P2, CG-0MUNBHXMC00192G8).
 *
 * The optional custom native addon (Option A, P1 `CG-0MUNBHWY90051NAU`) is
 * injected as a fake, so these run in pure Node with no Steam client, no
 * native build, and no real Steam account.
 *
 * Frozen contract:
 *  - module shape: `isFollowing(steamId: bigint): boolean | Promise<boolean>`
 *    (the underlying SDK call is asynchronous; the adapter accepts both);
 *  - capability order: `steamworks.js` friends API → native module →
 *    manual self-attest;
 *  - **no logged-in assumption**: when Steam is running with no logged-in
 *    user the fake resolves `false`, and the source must return `false` — it
 *    must never fabricate `true`.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  SteamworksFollowSource,
  type NativeFriendsModuleLike,
  type SteamworksClientLike,
  type SteamworksModuleLike,
} from '../../electron/steam-follow-steamworks';
import {
  MemoryUnlockStore,
  SteamFollowService,
  type BonusCatalog,
} from '../../electron/steam-follow';
import type { SteamConfig } from '../../electron/steam-config';

const APP_ID = 123456;
const DEV_ID = '76561198000000000';

const CONFIG: SteamConfig = {
  appId: String(APP_ID),
  developerSteamId: DEV_ID,
  storeUrl: `steam://store/${APP_ID}`,
};

function makeCatalog(bonusGameId: string): BonusCatalog {
  return {
    bonusGameId,
    games: [
      { id: 'main-street', title: 'Main Street', sceneKey: 'MainStreetScene', description: 'City builder' },
      { id: 'golf', title: 'Golf', sceneKey: 'GolfScene', description: 'Solitaire golf' },
      { id: 'feudalism', title: 'Feudalism', sceneKey: 'FeudalismScene', description: 'Manor builder' },
    ],
  };
}

/**
 * A `steamworks.js` module whose client has **no** friends API — the 0.4.0
 * reality the native fallback exists to fix.
 */
function makeSteamworksModule(clientOverrides: Partial<SteamworksClientLike> = {}): SteamworksModuleLike {
  const client: SteamworksClientLike = {
    overlay: { activateToStore: () => {} },
    ...clientOverrides,
  };
  return { init: () => client, restartAppIfNecessary: () => false };
}

function makeNativeModule(overrides: Partial<NativeFriendsModuleLike> = {}): NativeFriendsModuleLike {
  return { isFollowing: () => false, ...overrides };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('SteamworksFollowSource — native fallback capability', () => {
  it('uses a synchronous native isFollowing and reports the capability', async () => {
    const calls: bigint[] = [];
    const native = makeNativeModule({
      isFollowing: (steamId) => {
        calls.push(steamId);
        return true;
      },
    });
    const source = new SteamworksFollowSource({
      appId: APP_ID,
      loader: async () => makeSteamworksModule(),
      nativeFriendsLoader: async () => native,
    });

    expect(await source.init()).toBe('available');
    expect(source.followCheckSupported).toBe(true);
    expect(await source.isFollowing(DEV_ID)).toBe(true);
    expect(calls).toEqual([BigInt(DEV_ID)]);
  });

  it('awaits an asynchronous native isFollowing (boolean | Promise<boolean>)', async () => {
    const source = new SteamworksFollowSource({
      appId: APP_ID,
      loader: async () => makeSteamworksModule(),
      nativeFriendsLoader: async () => makeNativeModule({ isFollowing: async () => true }),
    });
    await source.init();

    expect(source.followCheckSupported).toBe(true);
    expect(await source.isFollowing(DEV_ID)).toBe(true);
  });

  it('returns false from a native check that resolves false', async () => {
    const source = new SteamworksFollowSource({
      appId: APP_ID,
      loader: async () => makeSteamworksModule(),
      nativeFriendsLoader: async () => makeNativeModule({ isFollowing: () => false }),
    });
    await source.init();

    expect(await source.isFollowing(DEV_ID)).toBe(false);
  });

  it('does not assume a logged-in user: capability true but no follow → false', async () => {
    // Steam running, no logged-in user → the native addon resolves false.
    const source = new SteamworksFollowSource({
      appId: APP_ID,
      loader: async () => makeSteamworksModule(),
      nativeFriendsLoader: async () =>
        makeNativeModule({ isFollowing: async () => false }),
    });
    await source.init();

    expect(source.followCheckSupported).toBe(true);
    expect(await source.isFollowing(DEV_ID)).toBe(false);
  });
});

describe('SteamworksFollowSource — fallback absent / broken', () => {
  it('stays unsupported when no native loader is configured', async () => {
    const source = new SteamworksFollowSource({
      appId: APP_ID,
      loader: async () => makeSteamworksModule(),
    });
    await source.init();

    expect(source.followCheckSupported).toBe(false);
    expect(await source.isFollowing(DEV_ID)).toBe(false);
  });

  it('stays unsupported when the native loader returns null', async () => {
    const source = new SteamworksFollowSource({
      appId: APP_ID,
      loader: async () => makeSteamworksModule(),
      nativeFriendsLoader: async () => null,
    });
    await source.init();

    expect(source.followCheckSupported).toBe(false);
    expect(await source.isFollowing(DEV_ID)).toBe(false);
  });

  it('never crashes when the native loader throws', async () => {
    const source = new SteamworksFollowSource({
      appId: APP_ID,
      loader: async () => makeSteamworksModule(),
      nativeFriendsLoader: async () => {
        throw new Error('addon exploded');
      },
    });

    expect(await source.init()).toBe('available');
    expect(source.followCheckSupported).toBe(false);
    expect(await source.isFollowing(DEV_ID)).toBe(false);
  });

  it('stays unsupported when native init() throws', async () => {
    const source = new SteamworksFollowSource({
      appId: APP_ID,
      loader: async () => makeSteamworksModule(),
      nativeFriendsLoader: async () =>
        makeNativeModule({
          init: () => {
            throw new Error('no steam');
          },
        }),
    });
    await source.init();

    expect(source.followCheckSupported).toBe(false);
    expect(await source.isFollowing(DEV_ID)).toBe(false);
  });

  it('stays unsupported when native init() reports false', async () => {
    const source = new SteamworksFollowSource({
      appId: APP_ID,
      loader: async () => makeSteamworksModule(),
      nativeFriendsLoader: async () => makeNativeModule({ init: () => false }),
    });
    await source.init();

    expect(source.followCheckSupported).toBe(false);
    expect(await source.isFollowing(DEV_ID)).toBe(false);
  });

  it('stays unsupported when the native module lacks isFollowing', async () => {
    const source = new SteamworksFollowSource({
      appId: APP_ID,
      loader: async () => makeSteamworksModule(),
      nativeFriendsLoader: async () =>
        ({ init: () => true } as unknown as NativeFriendsModuleLike),
    });
    await source.init();

    expect(source.followCheckSupported).toBe(false);
    expect(await source.isFollowing(DEV_ID)).toBe(false);
  });
});

describe('SteamworksFollowSource — native check failures never fabricate true', () => {
  it('returns false when the native check throws synchronously', async () => {
    const source = new SteamworksFollowSource({
      appId: APP_ID,
      loader: async () => makeSteamworksModule(),
      nativeFriendsLoader: async () =>
        makeNativeModule({
          isFollowing: () => {
            throw new Error('bad id');
          },
        }),
    });
    await source.init();

    expect(await source.isFollowing(DEV_ID)).toBe(false);
  });

  it('returns false when the native check rejects', async () => {
    const source = new SteamworksFollowSource({
      appId: APP_ID,
      loader: async () => makeSteamworksModule(),
      nativeFriendsLoader: async () =>
        makeNativeModule({ isFollowing: async () => Promise.reject(new Error('timeout')) }),
    });
    await source.init();

    expect(await source.isFollowing(DEV_ID)).toBe(false);
  });

  it('times out a never-resolving native check and returns false', async () => {
    vi.useFakeTimers();
    const source = new SteamworksFollowSource({
      appId: APP_ID,
      loader: async () => makeSteamworksModule(),
      nativeFriendsLoader: async () =>
        makeNativeModule({ isFollowing: () => new Promise<boolean>(() => {}) }),
      followCheckTimeoutMs: 50,
    });
    await source.init();
    expect(source.followCheckSupported).toBe(true);

    const pending = source.isFollowing(DEV_ID);
    await vi.advanceTimersByTimeAsync(50);

    expect(await pending).toBe(false);
  });
});

describe('SteamworksFollowSource — deterministic capability order', () => {
  it('prefers the steamworks.js binding and never consults the native loader', async () => {
    let nativeLoads = 0;
    const source = new SteamworksFollowSource({
      appId: APP_ID,
      loader: async () =>
        makeSteamworksModule({ friends: { isFollowing: () => true } }),
      nativeFriendsLoader: async () => {
        nativeLoads += 1;
        return makeNativeModule({ isFollowing: () => false });
      },
    });
    await source.init();

    expect(source.followCheckSupported).toBe(true);
    expect(await source.isFollowing(DEV_ID)).toBe(true);
    expect(nativeLoads).toBe(0);
  });
});

describe('SteamworksFollowSource — manual self-attest fallback', () => {
  it('reports no automatic detection and still unlocks via manual claim', async () => {
    const source = new SteamworksFollowSource({
      appId: APP_ID,
      loader: async () => makeSteamworksModule(),
      nativeFriendsLoader: async () => null,
    });
    await source.init();

    const service = new SteamFollowService(
      source,
      new MemoryUnlockStore(),
      makeCatalog('feudalism'),
      CONFIG,
    );

    expect(service.supportsAutomaticFollowCheck()).toBe(false);
    expect(await source.isFollowing(DEV_ID)).toBe(false);

    const result = await service.claimManually();
    expect(result.unlocked).toBe(true);
    expect(result.chosenGameId).toBe('feudalism');
    expect(result.reason).toBe('manual-claim');
  });
});
