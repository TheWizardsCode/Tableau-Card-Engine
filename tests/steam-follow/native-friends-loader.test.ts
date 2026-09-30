/**
 * Unit tests for the native friends-addon loader (P3, CG-0MUNBHYAB0011XXW).
 *
 * The real addon is a Windows-only `.node` binary, so these tests use an
 * injected importer. They freeze the loader/validation contract and prove the
 * absent-addon degradation path without a native build.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  createNativeFriendsLoader,
  defaultNativeFriendsLoader,
  normaliseNativeFriendsModule,
} from '../../electron/steam-follow-native';
import {
  SteamworksFollowSource,
  type SteamworksModuleLike,
} from '../../electron/steam-follow-steamworks';

const APP_ID = 123456;
const DEV_ID = '76561198000000000';

function makeSteamworksModule(): SteamworksModuleLike {
  // A steamworks.js client with no friends API (the 0.4.0 reality).
  return { init: () => ({ overlay: { activateToStore: () => {} } }) };
}

describe('normaliseNativeFriendsModule', () => {
  it('accepts a module that exposes isFollowing and binds its methods', async () => {
    const raw = {
      state: 'kept',
      isFollowing(this: { state: string }) {
        return this.state === 'kept';
      },
      init(this: { state: string }) {
        return this.state === 'kept';
      },
    };

    const module = normaliseNativeFriendsModule(raw);
    expect(module).not.toBeNull();
    expect(module!.isFollowing(1n)).toBe(true);
    expect(module!.init!()).toBe(true);
  });

  it('accepts a module without init', () => {
    const module = normaliseNativeFriendsModule({ isFollowing: () => false });
    expect(module).not.toBeNull();
    expect(module!.init).toBeUndefined();
  });

  it('rejects values that are not usable modules', () => {
    expect(normaliseNativeFriendsModule(null)).toBeNull();
    expect(normaliseNativeFriendsModule(undefined)).toBeNull();
    expect(normaliseNativeFriendsModule(42)).toBeNull();
    expect(normaliseNativeFriendsModule('module')).toBeNull();
    expect(normaliseNativeFriendsModule({})).toBeNull();
    expect(normaliseNativeFriendsModule({ isFollowing: 'nope' })).toBeNull();
  });
});

describe('createNativeFriendsLoader', () => {
  it('returns the first specifier that yields a valid module', async () => {
    const importer = vi.fn(async (specifier: string) => {
      if (specifier === 'broken') throw new Error('cannot load');
      if (specifier === 'empty') return { notAFriendsModule: true };
      return { isFollowing: () => true };
    });
    const loader = createNativeFriendsLoader(['broken', 'empty', 'good'], importer);

    const module = await loader();
    expect(module).not.toBeNull();
    expect(module!.isFollowing(1n)).toBe(true);
    expect(importer).toHaveBeenCalledTimes(3);
    expect(importer.mock.calls.map((c) => c[0])).toEqual(['broken', 'empty', 'good']);
  });

  it('returns null (never throws) when every specifier fails', async () => {
    const importer = vi.fn(async () => {
      throw new Error('absent');
    });
    const loader = createNativeFriendsLoader(['a', 'b'], importer);

    await expect(loader()).resolves.toBeNull();
    expect(importer).toHaveBeenCalledTimes(2);
  });

  it('returns null for an empty specifier list', async () => {
    const importer = vi.fn(async () => ({ isFollowing: () => true }));
    const loader = createNativeFriendsLoader([], importer);

    await expect(loader()).resolves.toBeNull();
    expect(importer).not.toHaveBeenCalled();
  });
});

describe('defaultNativeFriendsLoader (addon absent)', () => {
  it('resolves null without crashing when the addon is not installed', async () => {
    await expect(defaultNativeFriendsLoader()).resolves.toBeNull();
  });
});

describe('SteamworksFollowSource — default native loader', () => {
  it('stays unsupported (no crash) when the addon is absent', async () => {
    const source = new SteamworksFollowSource({
      appId: APP_ID,
      loader: async () => makeSteamworksModule(),
    });

    expect(await source.init()).toBe('available');
    expect(source.followCheckSupported).toBe(false);
    expect(await source.isFollowing(DEV_ID)).toBe(false);
  });
});
