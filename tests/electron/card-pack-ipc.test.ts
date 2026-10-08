/**
 * Card-pack entitlement IPC handler-table tests
 * (feature F5 / CG-0MUZIS2B8005WG4S).
 *
 * The handlers are pure (no Electron import); these tests exercise the exact
 * surface the preload bridge invokes and prove:
 *  - every handler is total (safe value, never throws) for edge inputs,
 *  - free/gated status is surfaced faithfully,
 *  - the preload channel names stay in parity with the handler module.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect } from 'vitest';

import {
  CARD_PACK_CHANNELS,
  PACK_LOCK_REASON_SERVICE_UNAVAILABLE,
  createCardPackHandlers,
  isEntitlementPackRef,
  normaliseEntitlementPackRef,
} from '../../electron/card-pack-ipc.js';
import {
  CardPackEntitlementService,
  FakeEntitlementSource,
} from '../../electron/card-pack-entitlements.js';
import type { CardPackDlcCatalog } from '../../electron/card-pack-catalog.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PRELOAD_PATH = path.join(HERE, '..', '..', 'electron', 'preload.cjs');

const CATALOG: CardPackDlcCatalog = {
  version: 1,
  packs: [{ gameId: 'game', packId: 'gated', steamAppId: 777 }],
};

function makeHandlers(
  options: { availability?: 'available' | 'unavailable'; ownedAppIds?: number[]; catalog?: CardPackDlcCatalog | null } = {},
) {
  const source = new FakeEntitlementSource({
    availability: options.availability,
    ownedAppIds: options.ownedAppIds,
  });
  const catalog = options.catalog === undefined ? CATALOG : options.catalog;
  const service = new CardPackEntitlementService(source, catalog);
  return { handlers: createCardPackHandlers(service), service, source };
}

// ── Channel names ───────────────────────────────────────────

describe('CARD_PACK_CHANNELS', () => {
  it('namespaces every channel under cardPacks:', () => {
    for (const channel of Object.values(CARD_PACK_CHANNELS)) {
      expect(channel.startsWith('cardPacks:')).toBe(true);
    }
  });

  it('keeps preload.cjs channel names in parity with the handler module', () => {
    const preload = fs.readFileSync(PRELOAD_PATH, 'utf-8');
    const invoked = [...preload.matchAll(/ipcRenderer\.invoke\(\s*'([^']+)'/g)].map((m) => m[1]);
    const cardPackChannels = invoked.filter((channel) => channel.startsWith('cardPacks:'));

    expect(new Set(cardPackChannels)).toEqual(new Set(Object.values(CARD_PACK_CHANNELS)));
  });
});

// ── Handler behaviour ───────────────────────────────────────

describe('createCardPackHandlers()', () => {
  it('isAvailable reflects the source', async () => {
    const available = makeHandlers();
    await available.source.init();
    expect(await available.handlers.isAvailable()).toBe(true);

    const unavailable = makeHandlers({ availability: 'unavailable' });
    await unavailable.source.init();
    expect(await unavailable.handlers.isAvailable()).toBe(false);
  });

  it('hasCatalog / supportsDlcCheck / getCatalog reflect the wiring', async () => {
    const { handlers } = makeHandlers();
    expect(await handlers.hasCatalog()).toBe(true);
    expect(await handlers.supportsDlcCheck()).toBe(true);
    expect(await handlers.getCatalog()).toEqual(CATALOG);

    const noCatalog = makeHandlers({ catalog: null });
    expect(await noCatalog.handlers.hasCatalog()).toBe(false);
    expect(await noCatalog.handlers.getCatalog()).toBeNull();
  });

  it('getStatus reports a free pack', async () => {
    const { handlers, source } = makeHandlers();
    await source.init();

    expect(await handlers.getStatus({ id: 'free' })).toMatchObject({
      packId: 'free',
      state: 'free',
      steamAppId: null,
    });
  });

  it('getStatus reports a gated pack as unlocked when owned and locked otherwise', async () => {
    const unlocked = makeHandlers({ ownedAppIds: [777] });
    await unlocked.source.init();
    expect(await unlocked.handlers.getStatus({ id: 'gated', gameId: 'game' })).toMatchObject({
      packId: 'gated',
      state: 'unlocked',
      steamAppId: 777,
    });

    const locked = makeHandlers();
    await locked.source.init();
    expect(await locked.handlers.getStatus({ id: 'gated', gameId: 'game' })).toMatchObject({
      packId: 'gated',
      state: 'locked',
      steamAppId: 777,
    });
  });

  it('listStatus resolves each pack and preserves order', async () => {
    const { handlers, source } = makeHandlers({ ownedAppIds: [777] });
    await source.init();

    const statuses = await handlers.listStatus([
      { id: 'free' },
      { id: 'gated', gameId: 'game' },
    ]);
    expect(statuses.map((status) => status.packId)).toEqual(['free', 'gated']);
    expect(statuses.map((status) => status.state)).toEqual(['free', 'unlocked']);
  });
});

// ── Totality ────────────────────────────────────────────────

describe('handler totality (never throws)', () => {
  const edgeInputs: unknown[] = [undefined, null, '', 123, {}, [], { id: '' }, { packId: 7 }];

  it('getStatus resolves for every edge input', async () => {
    const { handlers } = makeHandlers();
    for (const input of edgeInputs) {
      await expect(
        handlers.getStatus(input),
        `getStatus(${JSON.stringify(input)}) should not throw`,
      ).resolves.toBeDefined();
    }
  });

  it('getStatus denies a malformed pack', async () => {
    const { handlers } = makeHandlers();
    expect(await handlers.getStatus(null)).toMatchObject({ state: 'locked', packId: '' });
    expect(await handlers.getStatus({})).toMatchObject({ state: 'locked' });
  });

  it('listStatus returns [] for a non-array input', async () => {
    const { handlers } = makeHandlers();
    for (const input of [undefined, null, 'nope', 1, {}]) {
      await expect(handlers.listStatus(input)).resolves.toEqual([]);
    }
  });

  it('listStatus drops malformed entries and keeps valid ones', async () => {
    const { handlers, source } = makeHandlers();
    await source.init();

    const statuses = await handlers.listStatus([null, { id: 'free' }, { bad: true }]);
    expect(statuses).toHaveLength(1);
    expect(statuses[0]).toMatchObject({ packId: 'free', state: 'free' });
  });

  it('is total when no service is wired', async () => {
    const handlers = createCardPackHandlers(null);
    expect(await handlers.isAvailable()).toBe(false);
    expect(await handlers.hasCatalog()).toBe(false);
    expect(await handlers.supportsDlcCheck()).toBe(false);
    expect(await handlers.getCatalog()).toBeNull();

    const status = await handlers.getStatus({ id: 'gated', gameId: 'game' });
    expect(status).toMatchObject({ state: 'locked', reason: PACK_LOCK_REASON_SERVICE_UNAVAILABLE });

    expect(await handlers.listStatus([{ id: 'gated', gameId: 'game' }])).toEqual([
      expect.objectContaining({ packId: 'gated', state: 'locked' }),
    ]);
  });
});

// ── Input normalisation ─────────────────────────────────────

describe('normaliseEntitlementPackRef', () => {
  it('accepts the manifest shape', () => {
    expect(normaliseEntitlementPackRef({ id: 'p', gameId: 'g', steamAppId: 5 })).toEqual({
      id: 'p',
      gameId: 'g',
      steamAppId: 5,
    });
  });

  it('accepts a packId alias', () => {
    expect(normaliseEntitlementPackRef({ packId: 'p' })).toEqual({ id: 'p' });
  });

  it('drops a malformed app id rather than rejecting the reference', () => {
    expect(normaliseEntitlementPackRef({ id: 'p', steamAppId: 'nope' })).toEqual({ id: 'p' });
  });

  it('rejects a reference without a usable id', () => {
    for (const value of [null, undefined, '', 1, {}, { id: '' }, { id: '   ' }, { packId: 3 }]) {
      expect(normaliseEntitlementPackRef(value), JSON.stringify(value)).toBeNull();
      expect(isEntitlementPackRef(value)).toBe(false);
    }
  });
});
