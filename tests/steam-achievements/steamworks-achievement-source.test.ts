/**
 * Real Steamworks achievement adapter tests (F5, CG-0MUNC7EAM004E6GN).
 *
 * Uses a fake `steamworks.js` module object — no Steam client, native module,
 * Electron, or browser required. Covers the happy path, capability detection,
 * every failure/throw path (methods stay total), and graceful degradation.
 */
import { describe, it, expect, vi } from 'vitest';

// `steamworks.js` is a normal package.json dependency (ships prebuilt binaries,
// no install-time build hook), so ambient module absence can no longer be
// relied on to exercise the loader's graceful-degradation branch. Mock the
// import to reject instead — the same failure mode as a pruned install or a
// load-time error.
vi.mock('steamworks.js', () => {
  throw new Error('steamworks.js unavailable');
});

import {
  SteamworksAchievementSource,
  checkAchievementSupport,
  defaultSteamworksAchievementLoader,
  type SteamworksAchievementClientLike,
  type SteamworksAchievementModuleLike,
} from '../../electron/steam-achievements-steamworks.js';

// ── Fake module builders ────────────────────────────────────

/** A well-behaved fake client that records calls. */
function makeClient(overrides: Partial<SteamworksAchievementClientLike> = {}) {
  const activated = new Set<string>();
  const calls: string[] = [];
  const client: SteamworksAchievementClientLike = {
    achievement: {
      activate: (name: string) => {
        calls.push(`activate:${name}`);
        activated.add(name);
        return true;
      },
      isActivated: (name: string) => activated.has(name),
      names: () => ['TCE_A', 'TCE_B'],
      clear: (name: string) => activated.delete(name),
    },
    stats: {
      store: () => {
        calls.push('store');
        return true;
      },
    },
    ...overrides,
  };
  return { client, calls, activated };
}

/** A fake module whose `init` returns *client*. */
function makeModule(
  client: SteamworksAchievementClientLike,
  opts: { restart?: boolean; overlayCalls?: boolean[] } = {},
): SteamworksAchievementModuleLike {
  return {
    init: () => client,
    restartAppIfNecessary: () => opts.restart ?? false,
    electronEnableSteamOverlay: (disable?: boolean) => {
      opts.overlayCalls?.push(disable ?? false);
    },
  };
}

/** A loader that resolves a module or null. */
function loaderFor(module: SteamworksAchievementModuleLike | null) {
  return async () => module;
}

// ── checkAchievementSupport ─────────────────────────────────

describe('checkAchievementSupport', () => {
  it('is true for a client with the achievement + stats API', () => {
    expect(checkAchievementSupport(makeClient().client)).toBe(true);
  });

  it('is false when the achievement namespace is missing', () => {
    const { client } = makeClient({ achievement: undefined });
    expect(checkAchievementSupport(client)).toBe(false);
  });

  it('is false when activate is missing', () => {
    const { client } = makeClient({ achievement: { isActivated: () => false } });
    expect(checkAchievementSupport(client)).toBe(false);
  });

  it('is false when the stats namespace is missing', () => {
    const { client } = makeClient({ stats: undefined });
    expect(checkAchievementSupport(client)).toBe(false);
  });

  it('is false for null', () => {
    expect(checkAchievementSupport(null)).toBe(false);
  });
});

// ── init ────────────────────────────────────────────────────

describe('SteamworksAchievementSource.init', () => {
  it('returns unavailable when no appId is configured', async () => {
    const source = new SteamworksAchievementSource({ loader: loaderFor(makeModule(makeClient().client)) });
    expect(await source.init()).toBe('unavailable');
    expect(source.isSteamAvailable()).toBe(false);
    expect(source.achievementApiSupported).toBe(false);
  });

  it('returns unavailable when the module is absent', async () => {
    const source = new SteamworksAchievementSource({ appId: 480, loader: loaderFor(null) });
    expect(await source.init()).toBe('unavailable');
    expect(source.isSteamAvailable()).toBe(false);
  });

  it('returns available and detects the achievement API', async () => {
    const { client } = makeClient();
    const source = new SteamworksAchievementSource({ appId: 480, loader: loaderFor(makeModule(client)) });
    expect(await source.init()).toBe('available');
    expect(source.isSteamAvailable()).toBe(true);
    expect(source.achievementApiSupported).toBe(true);
  });

  it('marks restartRequested and stays unavailable when Steam restarts the app', async () => {
    const { client } = makeClient();
    const source = new SteamworksAchievementSource({
      appId: 480,
      loader: loaderFor(makeModule(client, { restart: true })),
    });
    expect(await source.init()).toBe('unavailable');
    expect(source.restartRequested).toBe(true);
    expect(source.isSteamAvailable()).toBe(false);
  });

  it('never throws when the loader throws', async () => {
    const source = new SteamworksAchievementSource({
      appId: 480,
      loader: async () => {
        throw new Error('native load failed');
      },
    });
    await expect(source.init()).resolves.toBe('unavailable');
    expect(source.isSteamAvailable()).toBe(false);
  });

  it('never throws when init() on the module throws', async () => {
    const module: SteamworksAchievementModuleLike = {
      init: () => {
        throw new Error('Steam not running');
      },
    };
    const source = new SteamworksAchievementSource({ appId: 480, loader: loaderFor(module) });
    await expect(source.init()).resolves.toBe('unavailable');
    expect(source.isSteamAvailable()).toBe(false);
  });

  it('enables the overlay hook when requested', async () => {
    const overlayCalls: boolean[] = [];
    const { client } = makeClient();
    const source = new SteamworksAchievementSource({
      appId: 480,
      loader: loaderFor(makeModule(client, { overlayCalls })),
      enableOverlay: true,
    });
    await source.init();
    expect(overlayCalls).toEqual([true]);
  });

  it('reports capability gap when the client lacks the achievement API', async () => {
    const { client } = makeClient({ achievement: undefined, stats: undefined });
    const source = new SteamworksAchievementSource({ appId: 480, loader: loaderFor(makeModule(client)) });
    await source.init();
    expect(source.isSteamAvailable()).toBe(true);
    expect(source.achievementApiSupported).toBe(false);
  });
});

// ── setAchievement ──────────────────────────────────────────

describe('SteamworksAchievementSource.setAchievement', () => {
  it('activates the achievement and returns true', async () => {
    const { client, calls } = makeClient();
    const source = new SteamworksAchievementSource({ appId: 480, loader: loaderFor(makeModule(client)) });
    await source.init();

    expect(await source.setAchievement('TCE_A')).toBe(true);
    expect(calls).toContain('activate:TCE_A');
  });

  it('returns false when Steam is unavailable', async () => {
    const source = new SteamworksAchievementSource({ loader: loaderFor(null) });
    await source.init();
    expect(await source.setAchievement('TCE_A')).toBe(false);
  });

  it('returns false and flags the capability gap when activate is missing', async () => {
    const { client } = makeClient({ achievement: { isActivated: () => false } });
    const source = new SteamworksAchievementSource({ appId: 480, loader: loaderFor(makeModule(client)) });
    await source.init();

    expect(await source.setAchievement('TCE_A')).toBe(false);
    expect(source.achievementApiSupported).toBe(false);
  });

  it('returns false when activate throws', async () => {
    const { client } = makeClient({
      achievement: {
        activate: () => {
          throw new Error('boom');
        },
        isActivated: () => false,
      },
    });
    const source = new SteamworksAchievementSource({ appId: 480, loader: loaderFor(makeModule(client)) });
    await source.init();
    await expect(source.setAchievement('TCE_A')).resolves.toBe(false);
  });

  it('returns false when activate reports failure', async () => {
    const { client } = makeClient({
      achievement: { activate: () => false, isActivated: () => false },
      stats: { store: () => true },
    });
    const source = new SteamworksAchievementSource({ appId: 480, loader: loaderFor(makeModule(client)) });
    await source.init();
    expect(await source.setAchievement('TCE_A')).toBe(false);
  });
});

// ── storeStats ──────────────────────────────────────────────

describe('SteamworksAchievementSource.storeStats', () => {
  it('calls stats.store and returns true', async () => {
    const { client, calls } = makeClient();
    const source = new SteamworksAchievementSource({ appId: 480, loader: loaderFor(makeModule(client)) });
    await source.init();

    expect(await source.storeStats()).toBe(true);
    expect(calls).toContain('store');
  });

  it('returns false when the stats namespace is missing', async () => {
    const { client } = makeClient({ stats: undefined });
    const source = new SteamworksAchievementSource({ appId: 480, loader: loaderFor(makeModule(client)) });
    await source.init();
    expect(await source.storeStats()).toBe(false);
  });

  it('returns false when stats.store throws', async () => {
    const { client } = makeClient({
      stats: {
        store: () => {
          throw new Error('offline');
        },
      },
    });
    const source = new SteamworksAchievementSource({ appId: 480, loader: loaderFor(makeModule(client)) });
    await source.init();
    await expect(source.storeStats()).resolves.toBe(false);
  });
});

// ── isUnlocked / getUnlockedNames ───────────────────────────

describe('SteamworksAchievementSource unlock queries', () => {
  it('reports isUnlocked from isActivated', async () => {
    const { client, activated } = makeClient();
    const source = new SteamworksAchievementSource({ appId: 480, loader: loaderFor(makeModule(client)) });
    await source.init();

    expect(await source.isUnlocked('TCE_A')).toBe(false);
    activated.add('TCE_A');
    expect(await source.isUnlocked('TCE_A')).toBe(true);
  });

  it('filters names() to only activated achievements', async () => {
    const { client, activated } = makeClient();
    const source = new SteamworksAchievementSource({ appId: 480, loader: loaderFor(makeModule(client)) });
    await source.init();

    activated.add('TCE_A');
    expect(await source.getUnlockedNames()).toEqual(['TCE_A']);
  });

  it('returns false/[] when Steam is unavailable', async () => {
    const source = new SteamworksAchievementSource({ appId: 480, loader: loaderFor(null) });
    await source.init();
    expect(await source.isUnlocked('TCE_A')).toBe(false);
    expect(await source.getUnlockedNames()).toEqual([]);
  });

  it('returns [] when names() is missing', async () => {
    const { client } = makeClient({ achievement: { activate: () => true, isActivated: () => true } });
    const source = new SteamworksAchievementSource({ appId: 480, loader: loaderFor(makeModule(client)) });
    await source.init();
    expect(await source.getUnlockedNames()).toEqual([]);
  });

  it('tolerates a per-name isActivated throw in getUnlockedNames', async () => {
    const { client } = makeClient({
      achievement: {
        activate: () => true,
        isActivated: () => {
          throw new Error('boom');
        },
        names: () => ['TCE_A', 'TCE_B'],
      },
    });
    const source = new SteamworksAchievementSource({ appId: 480, loader: loaderFor(makeModule(client)) });
    await source.init();
    expect(await source.getUnlockedNames()).toEqual([]);
  });

  it('tolerates a throwing names() in getUnlockedNames', async () => {
    const { client } = makeClient({
      achievement: {
        activate: () => true,
        isActivated: () => true,
        names: () => {
          throw new Error('boom');
        },
      },
    });
    const source = new SteamworksAchievementSource({ appId: 480, loader: loaderFor(makeModule(client)) });
    await source.init();
    expect(await source.getUnlockedNames()).toEqual([]);
  });
});

// ── close ───────────────────────────────────────────────────

describe('SteamworksAchievementSource.close', () => {
  it('makes the source unavailable and clears capability', async () => {
    const { client } = makeClient();
    const source = new SteamworksAchievementSource({ appId: 480, loader: loaderFor(makeModule(client)) });
    await source.init();
    source.close();

    expect(source.isSteamAvailable()).toBe(false);
    expect(source.achievementApiSupported).toBe(false);
    expect(await source.setAchievement('TCE_A')).toBe(false);
    expect(await source.storeStats()).toBe(false);
  });
});

// ── Default loader (graceful degradation) ───────────────────

describe('defaultSteamworksAchievementLoader', () => {
  it('resolves null when the steamworks.js import fails', async () => {
    await expect(defaultSteamworksAchievementLoader()).resolves.toBeNull();
  });

  it('drives a full source lifecycle without the native module', async () => {
    const source = new SteamworksAchievementSource({ appId: 480 });
    await source.init();
    expect(source.isSteamAvailable()).toBe(false);
    // Every method stays total.
    expect(await source.setAchievement('TCE_X')).toBe(false);
    expect(await source.storeStats()).toBe(false);
    expect(await source.isUnlocked('TCE_X')).toBe(false);
    expect(await source.getUnlockedNames()).toEqual([]);
    source.close();
  });
});
