/**
 * Unit tests for the renderer-side Steam follow client
 * (src/ui/steam-follow-client.ts).
 *
 * The client wraps the context bridge and must never import the Steamworks
 * SDK. Tests inject a fake bridge (no Electron) and cover the browser
 * fallback path (intake AC5).
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  createSteamFollowClient,
  steamFollowClientFromWindow,
  type SteamFollowBridge,
} from '../../src/ui/steam-follow-client';

function makeBridge(overrides: Partial<SteamFollowBridge> = {}): SteamFollowBridge {
  return {
    getStatus: vi.fn(async () => ({ state: 'locked' as const })),
    isSteamAvailable: vi.fn(async () => true),
    supportsAutomaticFollowCheck: vi.fn(async () => true),
    getBonusCatalog: vi.fn(async () => null),
    openStorePage: vi.fn(async () => true),
    isFollowing: vi.fn(async () => false),
    claim: vi.fn(async () => ({ unlocked: true, chosenGameId: 'feudalism', reason: 'follow-confirmed' as const })),
    claimManually: vi.fn(async () => ({ unlocked: true, chosenGameId: 'feudalism', reason: 'manual-claim' as const })),
    ...overrides,
  };
}

describe('createSteamFollowClient()', () => {
  it('delegates every call to the injected bridge', async () => {
    const bridge = makeBridge();
    const client = createSteamFollowClient(bridge);

    expect(await client.getStatus()).toEqual({ state: 'locked' });
    expect(await client.isSteamAvailable()).toBe(true);
    expect(await client.supportsAutomaticFollowCheck()).toBe(true);
    expect(await client.getBonusCatalog()).toBeNull();
    expect(await client.isFollowing()).toBe(false);
    expect((await client.claim()).reason).toBe('follow-confirmed');
    expect((await client.claimManually()).reason).toBe('manual-claim');
    expect(bridge.getStatus).toHaveBeenCalledTimes(1);
  });

  it('returns true without a fallback when Steam opened the store page', async () => {
    const bridge = makeBridge({ openStorePage: vi.fn(async () => true) });
    const client = createSteamFollowClient(bridge);
    const open = vi.fn();
    vi.stubGlobal('window', { open });

    expect(await client.openStorePage('https://store.steampowered.com/app/1')).toBe(true);
    expect(open).not.toHaveBeenCalled();
  });

  it('falls back to opening the web store page when Steam is unavailable', async () => {
    const bridge = makeBridge({ openStorePage: vi.fn(async () => false) });
    const client = createSteamFollowClient(bridge);
    const open = vi.fn();
    vi.stubGlobal('window', { open });

    expect(await client.openStorePage('https://store.steampowered.com/app/1')).toBe(true);
    expect(open).toHaveBeenCalledWith('https://store.steampowered.com/app/1', '_blank', 'noopener');
  });

  it('returns false when Steam is unavailable and no fallback URL is given', async () => {
    const bridge = makeBridge({ openStorePage: vi.fn(async () => false) });
    const client = createSteamFollowClient(bridge);
    vi.stubGlobal('window', { open: vi.fn() });

    expect(await client.openStorePage()).toBe(false);
  });
});

describe('steamFollowClientFromWindow()', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns null when window.tce.steamFollow is absent (plain browser)', () => {
    vi.stubGlobal('window', {});
    expect(steamFollowClientFromWindow()).toBeNull();
    vi.stubGlobal('window', { tce: {} });
    expect(steamFollowClientFromWindow()).toBeNull();
  });

  it('returns a client bound to the preload bridge when present', async () => {
    const bridge = makeBridge({ isSteamAvailable: vi.fn(async () => true) });
    vi.stubGlobal('window', { tce: { steamFollow: bridge } });
    const client = steamFollowClientFromWindow();
    expect(client).not.toBeNull();
    expect(await client!.isSteamAvailable()).toBe(true);
  });
});
