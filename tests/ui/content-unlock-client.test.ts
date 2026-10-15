/**
 * Unit tests for the renderer-side content-unlock client
 * (src/ui/content-unlock-client.ts, CG-0MUZGBSSQ009ISHG — feature F5).
 *
 * The client wraps the additive `window.tce.contentUnlocks` context bridge and
 * must never import the Steamworks SDK or Node APIs. Tests inject a fake
 * bridge (no Electron) and pin the **totality** contract: with no bridge (a
 * plain browser) `isUnlocked()` is `false` and `getUnlocks()` is `[]`, and
 * every call catches a throwing/malformed bridge instead of propagating — a
 * DLC/game gate must never crash the owning game when state cannot be read.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  contentUnlockClientFromWindow,
  createContentUnlockClient,
  type ContentUnlockBridge,
  type DlcUnlockTarget,
  type GameUnlockTarget,
} from '../../src/ui/content-unlock-client';

const GAME: GameUnlockTarget = { kind: 'game', gameId: 'golf' };
const DLC: DlcUnlockTarget = { kind: 'dlc', gameId: 'main-street', dlcId: 'riverfront-pack' };

function makeBridge(overrides: Partial<ContentUnlockBridge> = {}): ContentUnlockBridge {
  return {
    isUnlocked: vi.fn(async () => false),
    getUnlocks: vi.fn(async () => []),
    ...overrides,
  };
}

describe('createContentUnlockClient()', () => {
  it('delegates isUnlocked to the injected bridge', async () => {
    const isUnlocked = vi.fn(async (target: GameUnlockTarget | DlcUnlockTarget) => target.kind === 'game');
    const client = createContentUnlockClient(makeBridge({ isUnlocked }));

    expect(await client.isUnlocked(GAME)).toBe(true);
    expect(await client.isUnlocked(DLC)).toBe(false);
    expect(isUnlocked).toHaveBeenCalledWith(GAME);
    expect(isUnlocked).toHaveBeenCalledWith(DLC);
  });

  it('delegates getUnlocks to the injected bridge', async () => {
    const records = [{ key: 'game:golf', target: GAME, unlockedAt: '2026-10-08T00:00:00.000Z' }];
    const client = createContentUnlockClient(makeBridge({ getUnlocks: vi.fn(async () => records) }));

    expect(await client.getUnlocks()).toEqual(records);
  });

  it('returns a no-op client (not unlocked) when no bridge is supplied', async () => {
    for (const bridge of [null, undefined]) {
      const client = createContentUnlockClient(bridge);
      expect(await client.isUnlocked(GAME)).toBe(false);
      expect(await client.isUnlocked(DLC)).toBe(false);
      expect(await client.getUnlocks()).toEqual([]);
    }
  });

  it('never throws when the bridge throws', async () => {
    const client = createContentUnlockClient({
      isUnlocked: async () => {
        throw new Error('bridge unavailable');
      },
      getUnlocks: async () => {
        throw new Error('bridge unavailable');
      },
    });

    await expect(client.isUnlocked(GAME)).resolves.toBe(false);
    await expect(client.getUnlocks()).resolves.toEqual([]);
  });

  it('coerces a non-boolean unlock result and a non-array record list to safe values', async () => {
    const client = createContentUnlockClient({
      isUnlocked: (async () => 'yes') as unknown as ContentUnlockBridge['isUnlocked'],
      getUnlocks: (async () => null) as unknown as ContentUnlockBridge['getUnlocks'],
    });

    expect(await client.isUnlocked(GAME)).toBe(false);
    expect(await client.getUnlocks()).toEqual([]);
  });

  it('does not call the bridge for a malformed target and returns false', async () => {
    const isUnlocked = vi.fn(async () => true);
    const client = createContentUnlockClient(makeBridge({ isUnlocked }));

    for (const malformed of [
      undefined,
      null,
      {},
      { kind: 'game' },
      { kind: 'dlc', gameId: 'main-street' },
      { kind: 'other', gameId: 'x' },
    ]) {
      expect(await client.isUnlocked(malformed as never)).toBe(false);
    }
    expect(isUnlocked).not.toHaveBeenCalled();
  });
});

describe('contentUnlockClientFromWindow()', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns a total client in a plain browser (no window / no bridge)', async () => {
    vi.stubGlobal('window', undefined);
    expect(await contentUnlockClientFromWindow().isUnlocked(GAME)).toBe(false);
    expect(await contentUnlockClientFromWindow().getUnlocks()).toEqual([]);

    vi.stubGlobal('window', {});
    expect(await contentUnlockClientFromWindow().isUnlocked(GAME)).toBe(false);

    vi.stubGlobal('window', { tce: {} });
    expect(await contentUnlockClientFromWindow().isUnlocked(GAME)).toBe(false);
  });

  it('binds to the preload bridge when present', async () => {
    const bridge = makeBridge({ isUnlocked: vi.fn(async () => true) });
    vi.stubGlobal('window', { tce: { contentUnlocks: bridge } });

    expect(await contentUnlockClientFromWindow().isUnlocked(GAME)).toBe(true);
    expect(bridge.isUnlocked).toHaveBeenCalledWith(GAME);
  });
});
