/**
 * Unit tests for the card-pack entitlement read client
 * (`src/ui/card-pack-client.ts`, feature F6 / CG-0MUZIS2VF006NY3T).
 *
 * The client wraps the launcher's `window.tce.cardPacks` context bridge. The
 * invariant under test is totality: with no bridge (plain browser) it reports
 * base content / no packs, and a throwing or malformed bridge degrades to a
 * safe locked/false/empty result — never an exception.
 */

import { describe, it, expect, vi } from 'vitest';

import {
  createCardPackClient,
  PACK_LOCK_REASON_BRIDGE_UNAVAILABLE,
  PACK_LOCK_REASON_STEAM_UNAVAILABLE,
  type CardPackBridge,
  type PackEntitlementStatusLike,
} from '../../src/ui/card-pack-client';

const UNGATED = { id: 'free-pack', gameId: 'fixture-game' };
const GATED = { id: 'gated-pack', gameId: 'fixture-game', steamAppId: 4242 };

function unlockedStatus(packId: string): PackEntitlementStatusLike {
  return {
    packId,
    gameId: 'fixture-game',
    state: 'unlocked',
    steamAppId: 4242,
    reason: null,
  };
}

describe('createCardPackClient — no bridge (browser)', () => {
  const client = createCardPackClient(null);

  it('reports no Steam availability and no catalog', async () => {
    expect(await client.isAvailable()).toBe(false);
    expect(await client.hasCatalog()).toBe(false);
    expect(await client.supportsDlcCheck()).toBe(false);
    expect(await client.getCatalog()).toBeNull();
  });

  it('treats an ungated pack as free base content', async () => {
    const status = await client.getStatus(UNGATED);
    expect(status.state).toBe('free');
    expect(status.reason).toBeNull();
    expect(status.steamAppId).toBeNull();
  });

  it('locks a gated pack with a Steam-unavailable reason', async () => {
    const status = await client.getStatus(GATED);
    expect(status.state).toBe('locked');
    expect(status.steamAppId).toBe(4242);
    expect(status.reason).toBe(PACK_LOCK_REASON_STEAM_UNAVAILABLE);
  });

  it('resolves a batch in input order', async () => {
    const statuses = await client.listStatus([UNGATED, GATED]);
    expect(statuses.map((status) => status.packId)).toEqual(['free-pack', 'gated-pack']);
    expect(statuses.map((status) => status.state)).toEqual(['free', 'locked']);
  });

  it('returns an empty batch for an empty input', async () => {
    expect(await client.listStatus([])).toEqual([]);
  });
});

describe('createCardPackClient — live bridge', () => {
  it('forwards the status returned by the bridge', async () => {
    const bridge: CardPackBridge = {
      isAvailable: async () => true,
      hasCatalog: async () => true,
      supportsDlcCheck: async () => true,
      getCatalog: async () => ({ version: 1, packs: [] }),
      getStatus: async (pack) => unlockedStatus(pack.id),
      listStatus: async (packs) => packs.map((pack) => unlockedStatus(pack.id)),
    };
    const client = createCardPackClient(bridge);

    expect(await client.isAvailable()).toBe(true);
    expect(await client.hasCatalog()).toBe(true);
    expect(await client.supportsDlcCheck()).toBe(true);
    expect(await client.getCatalog()).toEqual({ version: 1, packs: [] });

    const status = await client.getStatus(GATED);
    expect(status.state).toBe('unlocked');

    const statuses = await client.listStatus([UNGATED, GATED]);
    expect(statuses.map((status) => status.packId)).toEqual(['free-pack', 'gated-pack']);
  });
});

describe('createCardPackClient — degradation', () => {
  it('degrades a throwing bridge to false / null / locked', async () => {
    const throwing = {
      isAvailable: async () => {
        throw new Error('boom');
      },
      hasCatalog: async () => {
        throw new Error('boom');
      },
      supportsDlcCheck: async () => {
        throw new Error('boom');
      },
      getCatalog: async () => {
        throw new Error('boom');
      },
      getStatus: async (): Promise<PackEntitlementStatusLike> => {
        throw new Error('boom');
      },
      listStatus: async (): Promise<PackEntitlementStatusLike[]> => {
        throw new Error('boom');
      },
    } as unknown as CardPackBridge;
    const client = createCardPackClient(throwing);

    expect(await client.isAvailable()).toBe(false);
    expect(await client.hasCatalog()).toBe(false);
    expect(await client.supportsDlcCheck()).toBe(false);
    expect(await client.getCatalog()).toBeNull();

    const status = await client.getStatus(GATED);
    expect(status.state).toBe('locked');
    expect(status.reason).toBe(PACK_LOCK_REASON_STEAM_UNAVAILABLE);

    const statuses = await client.listStatus([UNGATED]);
    expect(statuses[0].state).toBe('locked');
  });

  it('falls back per-pack when the bridge returns a malformed batch', async () => {
    const bridge = {
      getStatus: async (pack: { id: string }) => unlockedStatus(pack.id),
      listStatus: async () => 'not-an-array',
    } as unknown as CardPackBridge;
    const client = createCardPackClient(bridge);

    const statuses = await client.listStatus([UNGATED, GATED]);
    expect(statuses[0].state).toBe('free');
    expect(statuses[1].state).toBe('locked');
  });

  it('degrades a malformed single status to a bridge-unavailable lock', async () => {
    const bridge = {
      getStatus: vi.fn(async () => ({ nonsense: true })),
    } as unknown as CardPackBridge;
    const client = createCardPackClient(bridge);

    const status = await client.getStatus(GATED);
    expect(status.state).toBe('locked');
    expect(status.reason).toBe(PACK_LOCK_REASON_BRIDGE_UNAVAILABLE);
  });
});
