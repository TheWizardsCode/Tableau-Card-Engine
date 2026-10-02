/**
 * Renderer achievement client + engine-sink adapter tests (F6,
 * CG-0MUNC7EXO001LITF).
 *
 * The client wraps the context bridge and must never import the Steamworks
 * SDK. Tests inject a fake bridge (no Electron) and cover the browser path
 * (client absent → engine no-op sink).
 */
import { describe, it, expect, afterEach, vi } from 'vitest';

import {
  createSteamAchievementsClient,
  createSteamAchievementSink,
  steamAchievementsClientFromWindow,
  type SteamAchievementsBridge,
} from '../../src/ui/steam-achievements-client';
import { AchievementSystem, NoOpAchievementSink } from '../../src/core-engine/AchievementSystem';

function makeBridge(overrides: Partial<SteamAchievementsBridge> = {}): SteamAchievementsBridge {
  return {
    unlock: vi.fn(async (achievementId: string) => ({
      achievementId,
      unlocked: true,
      synced: true,
      reason: 'unlocked' as const,
    })),
    getUnlocked: vi.fn(async () => ['foodie-row']),
    isAvailable: vi.fn(async () => true),
    hasManifest: vi.fn(async () => true),
    resync: vi.fn(async () => ({ synced: 1, failed: 0, unknown: [], steamAvailable: true })),
    ...overrides,
  };
}

// ── createSteamAchievementsClient ───────────────────────────

describe('createSteamAchievementsClient()', () => {
  it('delegates every call to the injected bridge', async () => {
    const bridge = makeBridge();
    const client = createSteamAchievementsClient(bridge);

    expect((await client.unlock('foodie-row')).synced).toBe(true);
    expect(await client.getUnlocked()).toEqual(['foodie-row']);
    expect(await client.isAvailable()).toBe(true);
    expect(await client.hasManifest()).toBe(true);
    expect(await client.resync()).toMatchObject({ synced: 1 });
    expect(bridge.unlock).toHaveBeenCalledWith('foodie-row');
  });
});

// ── steamAchievementsClientFromWindow ───────────────────────

describe('steamAchievementsClientFromWindow()', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns null when window.tce.achievements is absent (plain browser)', () => {
    vi.stubGlobal('window', {});
    expect(steamAchievementsClientFromWindow()).toBeNull();
    vi.stubGlobal('window', { tce: {} });
    expect(steamAchievementsClientFromWindow()).toBeNull();
  });

  it('returns null when there is no window at all (headless)', () => {
    vi.stubGlobal('window', undefined);
    expect(steamAchievementsClientFromWindow()).toBeNull();
  });

  it('returns a client bound to the preload bridge when present', async () => {
    const bridge = makeBridge({ isAvailable: vi.fn(async () => true) });
    vi.stubGlobal('window', { tce: { achievements: bridge } });
    const client = steamAchievementsClientFromWindow();
    expect(client).not.toBeNull();
    expect(await client!.isAvailable()).toBe(true);
  });
});

// ── createSteamAchievementSink ──────────────────────────────

describe('createSteamAchievementSink()', () => {
  it('forwards unlocks to the main-process client', async () => {
    const bridge = makeBridge();
    const sink = createSteamAchievementSink(createSteamAchievementsClient(bridge));

    sink.unlock('foodie-row');
    // Forwarding is async/fire-and-forget; flush the microtask queue.
    await Promise.resolve();

    expect(bridge.unlock).toHaveBeenCalledWith('foodie-row');
    expect(sink.isUnlocked('foodie-row')).toBe(true);
  });

  it('is idempotent — a repeat unlock does not re-forward', async () => {
    const bridge = makeBridge();
    const sink = createSteamAchievementSink(createSteamAchievementsClient(bridge));

    sink.unlock('foodie-row');
    sink.unlock('foodie-row');
    await Promise.resolve();

    expect(bridge.unlock).toHaveBeenCalledTimes(1);
  });

  it('seeds initial unlocked ids and does not re-forward them', async () => {
    const bridge = makeBridge();
    const sink = createSteamAchievementSink(createSteamAchievementsClient(bridge), ['foodie-row']);

    expect(sink.isUnlocked('foodie-row')).toBe(true);
    sink.unlock('foodie-row');
    await Promise.resolve();
    expect(bridge.unlock).not.toHaveBeenCalled();
  });

  it('returns a defensive copy from getUnlocked', () => {
    const sink = createSteamAchievementSink(createSteamAchievementsClient(makeBridge()), ['a']);
    const ids = sink.getUnlocked();
    ids.push('fake');
    expect(sink.getUnlocked()).toEqual(['a']);
  });

  it('swallows a transport failure (no unhandled rejection, local record kept)', async () => {
    const bridge = makeBridge({
      unlock: vi.fn(async () => {
        throw new Error('IPC closed');
      }),
    });
    const sink = createSteamAchievementSink(createSteamAchievementsClient(bridge));

    expect(() => sink.unlock('foodie-row')).not.toThrow();
    await Promise.resolve();
    // The unlock stays recorded locally; the main process re-syncs on launch.
    expect(sink.isUnlocked('foodie-row')).toBe(true);
  });
});

// ── Engine integration ──────────────────────────────────────

describe('engine integration with the IPC sink', () => {
  it('drives the AchievementSystem through the IPC-backed sink', async () => {
    const bridge = makeBridge();
    const sink = createSteamAchievementSink(createSteamAchievementsClient(bridge));
    const system = new AchievementSystem({ sink });
    system.registerDefinition({
      id: 'foodie-row',
      title: 'Foodie Row',
      description: 'desc',
      hidden: false,
    });
    system.setMapping((challengeId) => (challengeId === 'ch-foodie-row' ? {
      id: 'foodie-row',
      title: 'Foodie Row',
      description: 'desc',
      hidden: false,
    } : null));

    system.onChallengeCompleted('ch-foodie-row');
    await Promise.resolve();

    expect(bridge.unlock).toHaveBeenCalledWith('foodie-row');
    expect(system.isUnlocked('foodie-row')).toBe(true);
  });

  it('leaves a plain browser on the engine no-op sink', () => {
    const sink = new NoOpAchievementSink();
    const system = new AchievementSystem({ sink });
    expect(system.isUnlocked('anything')).toBe(false);
    sink.unlock('anything');
    expect(system.isUnlocked('anything')).toBe(true);
  });
});
