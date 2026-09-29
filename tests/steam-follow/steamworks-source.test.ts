/**
 * Unit tests for the Steamworks-backed FollowSource
 * (electron/steam-follow-steamworks.ts).
 *
 * The optional native `steamworks.js` module is injected as a fake, so these
 * run in pure Node with no Steam client and no native build (intake AC5).
 *
 * Key behaviours:
 *  - absent module  → 'unavailable', no crash
 *  - init failure   → 'unavailable', no crash
 *  - restartAppIfNecessary → restartRequested, unavailable
 *  - store page opens via overlay.activateToStore (real SDK call)
 *  - follow detection is capability-detected: present API works; absent API
 *    reports `followCheckSupported = false` and never fabricates `true`
 */
import { describe, it, expect } from 'vitest';
import {
  SteamworksFollowSource,
  STORE_FLAG_NONE,
  type SteamworksClientLike,
  type SteamworksModuleLike,
} from '../../electron/steam-follow-steamworks';

const APP_ID = 123456;
const DEV_ID = '76561198000000000';

/** Build a fake `steamworks.js` module with a recording client. */
function makeModule(options: {
  withFriends?: boolean;
  following?: boolean;
  restart?: boolean;
  initThrows?: boolean;
} = {}) {
  const calls = {
    activateToStore: [] as Array<[number, number | undefined]>,
    activateToWebPage: [] as string[],
    isFollowing: [] as bigint[],
    overlayEnabled: 0,
  };
  const client: SteamworksClientLike = {
    overlay: {
      activateToStore: (appId: number, flag?: number) => calls.activateToStore.push([appId, flag]),
      activateToWebPage: (url: string) => calls.activateToWebPage.push(url),
    },
    friends: options.withFriends
      ? { isFollowing: (steamId: bigint) => (calls.isFollowing.push(steamId), options.following ?? false) }
      : undefined,
  };
  // Memoise the client so `init()` always returns the same object; tests can
  // mutate it (e.g. remove a capability) before the source initialises.
  let initialised = false;
  const mod: SteamworksModuleLike = {
    init: () => {
      if (options.initThrows) throw new Error('native init failed');
      if (initialised) throw new Error('init called twice');
      initialised = true;
      return client;
    },
    restartAppIfNecessary: () => options.restart ?? false,
    electronEnableSteamOverlay: () => {
      calls.overlayEnabled += 1;
    },
  };
  return { mod, calls, client };
}

describe('SteamworksFollowSource — graceful degradation', () => {
  it('is unavailable when no app id is configured', async () => {
    const source = new SteamworksFollowSource({});
    expect(await source.init()).toBe('unavailable');
    expect(source.isSteamAvailable()).toBe(false);
  });

  it('is unavailable when the native module is missing', async () => {
    const source = new SteamworksFollowSource({ appId: APP_ID, loader: async () => null });
    expect(await source.init()).toBe('unavailable');
    expect(source.isSteamAvailable()).toBe(false);
    expect(await source.openStorePage('steam://store/1')).toBe(false);
    expect(await source.isFollowing(DEV_ID)).toBe(false);
  });

  it('is unavailable (never throws) when the native module rejects', async () => {
    const source = new SteamworksFollowSource({
      appId: APP_ID,
      loader: async () => {
        throw new Error('module exploded');
      },
    });
    expect(await source.init()).toBe('unavailable');
    expect(source.isSteamAvailable()).toBe(false);
  });

  it('is unavailable when init throws inside the module', async () => {
    const { mod } = makeModule({ initThrows: true });
    const source = new SteamworksFollowSource({ appId: APP_ID, loader: async () => mod });
    expect(await source.init()).toBe('unavailable');
    expect(source.isSteamAvailable()).toBe(false);
  });
});

describe('SteamworksFollowSource — restart bootstrap', () => {
  it('requests a restart (and reports unavailable) when Steam requires it', async () => {
    const { mod } = makeModule({ restart: true });
    const source = new SteamworksFollowSource({ appId: APP_ID, loader: async () => mod });
    expect(await source.init()).toBe('unavailable');
    expect(source.restartRequested).toBe(true);
    expect(source.isSteamAvailable()).toBe(false);
  });

  it('does not request a restart on a normal init', async () => {
    const { mod } = makeModule();
    const source = new SteamworksFollowSource({ appId: APP_ID, loader: async () => mod });
    expect(await source.init()).toBe('available');
    expect(source.restartRequested).toBe(false);
  });
});

describe('SteamworksFollowSource — store page', () => {
  it('opens the store via overlay.activateToStore with StoreFlag.None', async () => {
    const { mod, calls } = makeModule();
    const source = new SteamworksFollowSource({ appId: APP_ID, loader: async () => mod });
    await source.init();

    expect(await source.openStorePage('steam://store/123456')).toBe(true);
    expect(calls.activateToStore).toEqual([[APP_ID, STORE_FLAG_NONE]]);
  });

  it('falls back to activateToWebPage when the store call is absent', async () => {
    const { mod, calls, client } = makeModule();
    // Remove activateToStore to exercise the web-page fallback.
    delete client.overlay!.activateToStore;
    const source = new SteamworksFollowSource({ appId: APP_ID, loader: async () => mod });
    await source.init();

    expect(await source.openStorePage('steam://store/123456')).toBe(true);
    expect(calls.activateToWebPage).toEqual(['steam://store/123456']);
  });
});

describe('SteamworksFollowSource — follow detection capability', () => {
  it('uses friends.isFollowing when the binding exposes it', async () => {
    const { mod, calls } = makeModule({ withFriends: true, following: true });
    const source = new SteamworksFollowSource({ appId: APP_ID, loader: async () => mod });
    await source.init();

    expect(source.followCheckSupported).toBe(true);
    expect(await source.isFollowing(DEV_ID)).toBe(true);
    expect(calls.isFollowing).toEqual([BigInt(DEV_ID)]);
  });

  it('reports followCheckSupported=false and never fabricates true when the API is absent', async () => {
    const { mod } = makeModule({ withFriends: false });
    const source = new SteamworksFollowSource({ appId: APP_ID, loader: async () => mod });
    await source.init();

    expect(source.followCheckSupported).toBe(false);
    expect(await source.isFollowing(DEV_ID)).toBe(false);
  });

  it('returns false when friends.isFollowing throws', async () => {
    const { mod, client } = makeModule();
    client.friends = {
      isFollowing: () => {
        throw new Error('bad steam id');
      },
    };
    const source = new SteamworksFollowSource({ appId: APP_ID, loader: async () => mod });
    await source.init();

    expect(source.followCheckSupported).toBe(true);
    expect(await source.isFollowing('not-a-number')).toBe(false);
  });
});

describe('SteamworksFollowSource — overlay + close', () => {
  it('enables the Electron Steam overlay on init when requested', async () => {
    const { mod, calls } = makeModule();
    const source = new SteamworksFollowSource({ appId: APP_ID, loader: async () => mod, enableOverlay: true });
    await source.init();
    expect(calls.overlayEnabled).toBe(1);
  });

  it('close() returns the source to the uninitialised state', async () => {
    const { mod } = makeModule();
    const source = new SteamworksFollowSource({ appId: APP_ID, loader: async () => mod });
    await source.init();
    source.close();
    expect(source.isSteamAvailable()).toBe(false);
  });
});
