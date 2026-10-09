/**
 * Unit tests for the card-pack listing
 * (`src/ui/CardPackListing.ts`, feature F6 / CG-0MUZIS2VF006NY3T).
 *
 * The listing is split into a pure row model and an SLL layout plan so the
 * installed/unlocked/locked states, the toggle gating (a locked pack cannot be
 * enabled) and — crucially — the SLL-only positioning are covered without a
 * browser. The invariants under test:
 *
 *  - entitled packs are enabled and toggleable by default;
 *  - locked and incompatible packs are disabled, non-toggleable, and carry a
 *    reason;
 *  - every row coordinate is derived from the SLL layout (no hard-coded
 *    pixels) and adapts to the viewport.
 */

import { describe, it, expect } from 'vitest';

import {
  CARD_PACK_LISTING_LAYOUT,
  createCardPackListingState,
  enabledCardPackIds,
  isCardPackEnabled,
  toggleCardPack,
} from '../../src/ui/CardPackListing';
import type {
  CardPackLoadResult,
  LoadedCardPack,
  LockedCardPack,
} from '../../src/ui/CardPackLoader';
import { planCardPackListing } from '../../src/ui/CardPackListing';
import { anchorPoint, getZoneRect } from '../../src/ui/screen-layout';
import { validateScreenLayoutDocument } from '../../src/ui/screen-layout-schema';
import { defaultPackEntry } from '../fixtures/card-pack/helpers';

function loadedPack(
  id: string,
  state: 'free' | 'unlocked',
): LoadedCardPack {
  return {
    manifest: defaultPackEntry({ id, title: `Pack ${id}` }),
    csv: '',
    assetUrls: [],
    status: {
      packId: id,
      gameId: 'fixture-game',
      state,
      steamAppId: state === 'unlocked' ? 4242 : null,
      reason: null,
    },
    enabled: true,
  };
}

function lockedPack(id: string, reason: string): LockedCardPack {
  return {
    manifest: defaultPackEntry({ id, title: `Pack ${id}` }),
    status: {
      packId: id,
      gameId: 'fixture-game',
      state: 'locked',
      steamAppId: 4242,
      reason,
    },
    reason,
  };
}

function exampleResult(): CardPackLoadResult {
  return {
    packs: [loadedPack('free-pack', 'free'), loadedPack('unlocked-pack', 'unlocked')],
    incompatible: [
      {
        pack: defaultPackEntry({ id: 'old-pack', title: 'Pack old-pack' }),
        reason: 'requires core v^9.0.0 (launcher is v0.1.0)',
      },
    ],
    locked: [lockedPack('locked-pack', 'Requires Steam DLC 4242.')],
    errors: [],
  };
}

describe('createCardPackListingState', () => {
  it('maps entitled, locked and incompatible packs to rows with defaults', () => {
    const state = createCardPackListingState(exampleResult());

    expect(state.rows.map((row) => row.id)).toEqual([
      'free-pack',
      'unlocked-pack',
      'locked-pack',
      'old-pack',
    ]);

    const [free, unlocked, locked, incompatible] = state.rows;
    expect(free.state).toBe('free');
    expect(free.enabled).toBe(true);
    expect(free.toggleable).toBe(true);
    expect(free.lockReason).toBeNull();

    expect(unlocked.state).toBe('unlocked');
    expect(unlocked.enabled).toBe(true);
    expect(unlocked.toggleable).toBe(true);

    expect(locked.state).toBe('locked');
    expect(locked.enabled).toBe(false);
    expect(locked.toggleable).toBe(false);
    expect(locked.lockReason).toBe('Requires Steam DLC 4242.');

    expect(incompatible.state).toBe('locked');
    expect(incompatible.toggleable).toBe(false);
    expect(incompatible.lockReason).toContain('^9.0.0');
  });
});

describe('createCardPackListingState — purchase affordance', () => {
  it('marks only the declared locked packs as purchasable', () => {
    const state = createCardPackListingState(exampleResult(), ['locked-pack']);
    const byId = Object.fromEntries(state.rows.map((row) => [row.id, row]));

    expect(byId['locked-pack'].purchasable).toBe(true);
    // An already-entitled pack is owned, and an incompatible pack is unusable.
    expect(byId['free-pack'].purchasable).toBe(false);
    expect(byId['unlocked-pack'].purchasable).toBe(false);
    expect(byId['old-pack'].purchasable).toBe(false);
  });

  it('offers no purchase affordance by default', () => {
    const state = createCardPackListingState(exampleResult());
    expect(state.rows.every((row) => !row.purchasable)).toBe(true);
  });
});

describe('toggleCardPack', () => {
  it('disables an entitled pack and re-enables it', () => {
    const initial = createCardPackListingState(exampleResult());

    const disabled = toggleCardPack(initial, 'free-pack');
    expect(isCardPackEnabled(disabled, 'free-pack')).toBe(false);
    expect(enabledCardPackIds(disabled)).toEqual(['unlocked-pack']);

    const reenabled = toggleCardPack(disabled, 'free-pack');
    expect(isCardPackEnabled(reenabled, 'free-pack')).toBe(true);
    expect(enabledCardPackIds(reenabled)).toEqual(['free-pack', 'unlocked-pack']);
  });

  it('refuses to enable a locked pack and returns the same state', () => {
    const initial = createCardPackListingState(exampleResult());
    const next = toggleCardPack(initial, 'locked-pack');
    expect(next).toBe(initial);
    expect(isCardPackEnabled(initial, 'locked-pack')).toBe(false);
  });

  it('ignores an unknown pack id and never mutates the input', () => {
    const initial = createCardPackListingState(exampleResult());
    expect(toggleCardPack(initial, 'does-not-exist')).toBe(initial);

    const next = toggleCardPack(initial, 'free-pack');
    expect(initial.rows[0].enabled).toBe(true);
    expect(next).not.toBe(initial);
  });
});

describe('CardPackListing layout — SLL only', () => {
  it('validates the bundled layout against the SLL schema', () => {
    const validation = validateScreenLayoutDocument(CARD_PACK_LISTING_LAYOUT);
    expect(validation.valid).toBe(true);
  });

  it('declares no pixelOverride anywhere (pure normalized SLL)', () => {
    for (const [zoneName, zone] of Object.entries(CARD_PACK_LISTING_LAYOUT.zones)) {
      expect(zone.rect.pixelOverride, `${zoneName}.rect.pixelOverride`).toBeUndefined();
      for (const [anchorName, anchor] of Object.entries(zone.anchors ?? {})) {
        expect(
          anchor.pixelOverride,
          `${zoneName}.${anchorName}.pixelOverride`,
        ).toBeUndefined();
      }
    }
  });

  it('derives every row coordinate from getZoneRect / anchorPoint', () => {
    const viewport = { width: 1280, height: 720 };
    const plan = planCardPackListing(viewport, 4);

    const listRect = getZoneRect(CARD_PACK_LISTING_LAYOUT, 'list', viewport, 1);
    const rowLeft = anchorPoint(CARD_PACK_LISTING_LAYOUT, 'list', 'rowLeft', viewport, 1);
    const rowRight = anchorPoint(CARD_PACK_LISTING_LAYOUT, 'list', 'rowRight', viewport, 1);

    expect(plan.rows).toHaveLength(4);
    plan.rows.forEach((row, index) => {
      expect(row.leftX).toBeCloseTo(rowLeft.x, 6);
      expect(row.rightX).toBeCloseTo(rowRight.x, 6);
      const expectedY = listRect.y + (listRect.height ?? 0) * ((index + 0.5) / 4);
      expect(row.centerY).toBeCloseTo(expectedY, 6);
      expect(row.height).toBeCloseTo((listRect.height ?? 0) / 4, 6);
    });

    // The panel title/close/hint come from the panel anchors.
    expect(plan.title.x).toBeCloseTo(
      anchorPoint(CARD_PACK_LISTING_LAYOUT, 'panel', 'title', viewport, 1).x,
      6,
    );
  });

  it('adapts the layout to the viewport (responsive, not hard-coded)', () => {
    const wide = planCardPackListing({ width: 1280, height: 720 }, 2);
    const narrow = planCardPackListing({ width: 640, height: 480 }, 2);

    expect(narrow.panel.width).toBeLessThan(wide.panel.width ?? Infinity);
    expect(narrow.rows[0].leftX).not.toBeCloseTo(wide.rows[0].leftX, 3);
    expect(narrow.rows[0].centerY).not.toBeCloseTo(wide.rows[0].centerY, 3);
  });

  it('returns no rows for an empty listing without throwing', () => {
    const plan = planCardPackListing({ width: 1280, height: 720 }, 0);
    expect(plan.rows).toEqual([]);
  });
});
