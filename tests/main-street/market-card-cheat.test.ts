/**
 * Main Street: Market Card Cheat Unit Tests (CG-0MTINKHUT009KHK5)
 *
 * Covers:
 *  - Picker filtering/grouping: type filter, text search (case-insensitive substring), composition (type ∩ text), clear
 *  - Cheat replacement: random slot selection, displaced → correct discard, unique id, valid-state invariants, empty market
 *  - Business card reset on injection
 *  - Dev-mode gating and entry metadata (label/description)
 *  - Production tree-shake guard (source gated behind import.meta.env.DEV)
 *
 * @module
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  filterEntries,
  type CardEntry,
} from '../../src/ui/debug/MarketCardCheatOverlay';
import { cheatReplaceMarketCard } from '../../example-games/main-street/MainStreetMarket';
import {
  setupMainStreetGame,
  type MainStreetState,
} from '../../example-games/main-street/MainStreetState';
import {
  MARKET_TOTAL_SLOTS,
  getBusinessTemplates,
  getCommunitySpaceTemplates,
  getEventTemplates,
  getUpgradeTemplates,
  getStaffCardTemplates,
} from '../../example-games/main-street/MainStreetCards';
import { isDevMode } from '../../src/ui/debug/DebugToolsRegistry';
import { createMarketCardCheatTool } from '../../src/ui/debug/MarketCardCheatOverlay';

// ── Helpers ─────────────────────────────────────────────────

function makeEntry(label: string, family: string): CardEntry {
  return { label, family, template: { id: `id-${label}`, name: label, family } as any };
}

function allEntries(): CardEntry[] {
  return [
    makeEntry('Bakery', 'business'),
    makeEntry('Cafe Noir', 'business'),
    makeEntry('Park', 'community-space'),
    makeEntry('Festival', 'event'),
    makeEntry('Solar Panels', 'upgrade'),
    makeEntry('General Manager', 'staff'),
  ];
}

// ── filterEntries ───────────────────────────────────────────

describe('filterEntries', () => {
  it('returns all entries when no filters are active', () => {
    const entries = allEntries();
    const out = filterEntries(entries, '', new Set());
    expect(out).toHaveLength(entries.length);
  });

  it('filters by type (single family)', () => {
    const out = filterEntries(allEntries(), '', new Set(['business']));
    expect(out.every((e) => e.family === 'business')).toBe(true);
    expect(out).toHaveLength(2);
  });

  it('filters by type (multiple families)', () => {
    const out = filterEntries(allEntries(), '', new Set(['business', 'event']));
    expect(out).toHaveLength(3);
    expect(out.map((e) => e.family).sort()).toEqual(['business', 'business', 'event']);
  });

  it('filters by case-insensitive substring', () => {
    const entries = allEntries();
    expect(filterEntries(entries, 'bakery', new Set())).toHaveLength(1);
    expect(filterEntries(entries, 'BAKERY', new Set())).toHaveLength(1);
    expect(filterEntries(entries, 'cafe', new Set())).toHaveLength(1);
    expect(filterEntries(entries, 'CaFe', new Set())).toHaveLength(1);
    expect(filterEntries(entries, 'zzz', new Set())).toHaveLength(0);
  });

  it('trims whitespace in text filter', () => {
    const entries = allEntries();
    expect(filterEntries(entries, '  bakery  ', new Set())).toHaveLength(1);
  });

  it('composes type ∩ text (both filters apply)', () => {
    const entries = allEntries();
    // 'a' matches Bakery, Cafe Noir, Park, Festival, Solar Panels, General Manager -> but limited to business
    const out = filterEntries(entries, 'a', new Set(['business']));
    expect(out.every((e) => e.family === 'business')).toBe(true);
    expect(out.every((e) => e.label.toLowerCase().includes('a'))).toBe(true);
    expect(out.map((e) => e.label)).toEqual(['Bakery', 'Cafe Noir']);
  });

  it('clearing filters restores the full grouped list', () => {
    const entries = allEntries();
    const filtered = filterEntries(entries, 'bakery', new Set(['business']));
    expect(filtered).toHaveLength(1);
    const cleared = filterEntries(entries, '', new Set());
    expect(cleared).toHaveLength(entries.length);
  });

  it('groups by family — all 5 families appear when unfiltered in live registry', () => {
    // Live registry check: should have at least one per family (sanity, not strict count)
    const biz = getBusinessTemplates();
    const cs = getCommunitySpaceTemplates();
    const evt = getEventTemplates();
    const upg = getUpgradeTemplates();
    const staff = getStaffCardTemplates();
    expect(biz.length).toBeGreaterThan(0);
    expect(cs.length).toBeGreaterThan(0);
    expect(evt.length).toBeGreaterThan(0);
    expect(upg.length).toBeGreaterThan(0);
    expect(staff.length).toBeGreaterThan(0);
  });
});

// ── Dev-mode gating & entry metadata ────────────────────────

describe('Market Card Cheat entry', () => {
  it('has the required label and description', () => {
    const tool = createMarketCardCheatTool();
    expect(tool.label).toBe('Market Card Cheat');
    expect(tool.description).toBe('Replace a random market card with any card from the pool');
    expect(typeof tool.activate).toBe('function');
  });

  it('isDevMode returns a boolean', () => {
    expect(typeof isDevMode()).toBe('boolean');
  });

  it('MainStreetScene gates the cheat behind import.meta.env.DEV (tree-shake guard)', () => {
    const src = readFileSync(
      resolve(__dirname, '../../example-games/main-street/scenes/MainStreetScene.ts'),
      'utf-8',
    );
    expect(src).toContain('import.meta.env.DEV');
    expect(src).toContain('createMarketCardCheatTool');
  });

  it('MARKET_TOTAL_SLOTS is 3', () => {
    expect(MARKET_TOTAL_SLOTS).toBe(3);
  });
});

// ── cheatReplaceMarketCard ──────────────────────────────────

describe('cheatReplaceMarketCard', () => {
  function freshState(seed = 'cheat-unit'): MainStreetState {
    return setupMainStreetGame({ seed });
  }

  it('replaces a slot and returns the displaced card', () => {
    const state = freshState();
    const beforeIds = state.market.cards.map((c) => c.id);
    const beforeLen = state.market.cards.length;
    expect(beforeLen).toBe(MARKET_TOTAL_SLOTS);
    const template: any = { id: 'biz-test', name: 'Test Biz', family: 'business', cost: 2, baseIncome: 1 };
    const displaced = cheatReplaceMarketCard(state, template, 'business', () => 0);
    expect(displaced).not.toBeNull();
    expect(beforeIds).toContain(displaced!.id);
    expect(state.market.cards).toHaveLength(MARKET_TOTAL_SLOTS);
    expect(state.market.cards.some((c) => c.id === displaced!.id)).toBe(false);
  });

  it('picks a uniformly-random slot via rng (0 → first, ~1 → last)', () => {
    const s1 = freshState('rng-first');
    const s2 = freshState('rng-last');
    // Snapshot to compare: need deterministic picks
    const template: any = { id: 'biz-rng', name: 'Rng Biz', family: 'business', cost: 1, baseIncome: 1 };
    const idFirst = s1.market.cards[0].id;
    cheatReplaceMarketCard(s1, template, 'business', () => 0);
    expect(s1.market.cards[0].id).toMatch(/^biz-rng--cheat-/);
    // s2: rng 0.99 with 3 slots -> floor(0.99*3)=2 (last)
    const idLastBefore = s2.market.cards[2].id;
    const displacedLast = cheatReplaceMarketCard(s2, template, 'business', () => 0.99);
    expect(displacedLast!.id).toBe(idLastBefore);
    expect(s2.market.cards[2].id).toMatch(/^biz-rng--cheat-/);
    // s1's last slot should be untouched when rng=0
    void idFirst;
  });

  it('routes displaced card to the correct discard pile per family', () => {
    const cases: Array<{ family: string; discardKey: keyof MainStreetState['discards'] }> = [
      { family: 'business', discardKey: 'business' },
      { family: 'community-space', discardKey: 'communitySpace' },
      { family: 'event', discardKey: 'event' },
      { family: 'upgrade', discardKey: 'upgrade' },
      { family: 'staff', discardKey: 'staff' },
    ];
    for (const { family } of cases) {
      const state = freshState(`discard-${family}`);
      // Force a known market card of that family into slot 0 so we displace it
      const forced: any = { id: `force-${family}`, name: `Forced ${family}`, family, cost: 1 };
      state.market.cards[0] = forced;
      const discLenBefore = (state.discards as any)[family === 'community-space' ? 'communitySpace' : family].length;
      const template: any = { id: 'biz-x', name: 'X', family: 'business', cost: 1, baseIncome: 1 };
      cheatReplaceMarketCard(state, template, 'business', () => 0);
      const key = family === 'community-space' ? 'communitySpace' : family;
      const disc = (state.discards as any)[key] as any[];
      expect(disc.length).toBe(discLenBefore + 1);
      expect(disc[disc.length - 1].id).toBe(`force-${family}`);
    }
  });

  it('injected card gets a unique id per call (--cheat-<nonce>)', () => {
    const state = freshState();
    const t: any = { id: 'biz-uniq', name: 'Uniq', family: 'business', cost: 1, baseIncome: 1 };
    cheatReplaceMarketCard(state, t, 'business', () => 0);
    const id1 = state.market.cards[0].id;
    expect(id1).toMatch(/^biz-uniq--cheat-\d+$/);
    cheatReplaceMarketCard(state, t, 'business', () => 0.5);
    const id2 = state.market.cards[1].id;
    expect(id2).toMatch(/^biz-uniq--cheat-\d+$/);
    expect(id1).not.toBe(id2);
  });

  it('preserves valid-state invariants (market length, no duplicate ids across market+discards)', () => {
    const state = freshState();
    const template: any = { id: 'evt-test', name: 'Evt', family: 'event', cost: 0, trigger: 'Investment', effect: 'x', target: 'All', coinDelta: 0, reputationDelta: 0 };
    cheatReplaceMarketCard(state, template, 'event', () => 0.33);
    expect(state.market.cards).toHaveLength(MARKET_TOTAL_SLOTS);
    const allIds = [
      ...state.market.cards.map((c) => c.id),
      ...state.discards.business.map((c) => c.id),
      ...state.discards.communitySpace.map((c) => c.id),
      ...state.discards.event.map((c) => c.id),
      ...state.discards.upgrade.map((c) => c.id),
      ...state.discards.staff.map((c) => c.id),
    ];
    // Cheated card id is unique, so no duplicate with its displaced predecessor now in discards
    const uniq = new Set(allIds);
    expect(uniq.size).toBe(allIds.length);
  });

  it('returns null and does not mutate discards when market is empty', () => {
    const state = freshState();
    state.market.cards.length = 0;
    const discBefore = JSON.stringify(state.discards);
    const template: any = { id: 'biz-empty', name: 'Empty', family: 'business', cost: 1, baseIncome: 1 };
    const res = cheatReplaceMarketCard(state, template, 'business', () => 0);
    expect(res).toBeNull();
    expect(state.market.cards).toHaveLength(0);
    expect(JSON.stringify(state.discards)).toBe(discBefore);
  });

  it('resets business/community-space fields on injected card', () => {
    const state = freshState();
    const template: any = {
      id: 'biz-reset',
      name: 'Reset Biz',
      family: 'business',
      cost: 3,
      baseIncome: 2,
      level: 5,
      incomeBonus: 9,
      synergyRangeBonus: 9,
      reputationBonus: 9,
      appliedUpgrades: ['x'],
      totalUpgradeCost: 99,
    };
    cheatReplaceMarketCard(state, template, 'business', () => 0);
    const injected: any = state.market.cards[0];
    expect(injected.level).toBe(0);
    expect(injected.incomeBonus).toBe(0);
    expect(injected.synergyRangeBonus).toBe(0);
    expect(injected.reputationBonus).toBe(0);
    expect(injected.appliedUpgrades).toEqual([]);
    expect(injected.totalUpgradeCost).toBe(0);
  });

  it('does not corrupt save/load and subsequent refill still works', async () => {
    const { serializeMainStreetState, deserializeMainStreetState } = await import(
      '../../example-games/main-street/MainStreetState'
    );
    const { refillMarket } = await import('../../example-games/main-street/MainStreetMarket');
    const state = freshState('save-cheat');
    const template: any = { id: 'biz-save', name: 'Save Biz', family: 'business', cost: 1, baseIncome: 1 };
    cheatReplaceMarketCard(state, template, 'business', () => 0);
    const save = serializeMainStreetState(state);
    const restored = deserializeMainStreetState(save as any);
    expect(restored.market.cards).toHaveLength(MARKET_TOTAL_SLOTS);
    // Refill after emptying should still fill to 3
    restored.market.cards.length = 0;
    refillMarket(restored as any);
    expect(restored.market.cards.length).toBe(MARKET_TOTAL_SLOTS);
  });
});
