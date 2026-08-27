import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  createBusinessDeck,
  createEventDeck,
  createUpgradeDeck,
} from '../../example-games/main-street/MainStreetCards';
import { createSeededRng } from '../../src/core-engine';

interface BaselineCatalog {
  source: string;
  capturedAt: string;
  perTier: {
    tier1: {
      business: number;
      'community-space': number;
      event: number;
      staff: number;
      upgrade: number;
      total: number;
    };
  };
  totals: {
    baselineTotal: number;
    targetAtLeast: number;
  };
}

function loadBaseline(): BaselineCatalog {
  const baselinePath = resolve(process.cwd(), 'docs/main-street/card-catalog-baseline.json');
  return JSON.parse(readFileSync(baselinePath, 'utf-8')) as BaselineCatalog;
}

function currentCatalogTotal(): number {
  const rng = createSeededRng(123);
  const businessCount = createBusinessDeck(1).length;
  const eventCount = createEventDeck(1, undefined, rng, 1).length;
  const upgradeCount = createUpgradeDeck(1).length;
  return businessCount + eventCount + upgradeCount;
}

describe('Main Street card catalog baseline', () => {
  it('contains machine-checkable baseline totals', () => {
    const baseline = loadBaseline();
    expect(baseline.source).toContain('Tier 1');
    expect(baseline.perTier.tier1.total).toBe(
      baseline.perTier.tier1.business +
        baseline.perTier.tier1['community-space'] +
        baseline.perTier.tier1.event +
        baseline.perTier.tier1.staff +
        baseline.perTier.tier1.upgrade,
    );
    expect(baseline.totals.targetAtLeast).toBe(baseline.totals.baselineTotal * 2);
  });

  it('current card pool is at least 2x baseline', () => {
    const baseline = loadBaseline();
    expect(currentCatalogTotal()).toBeGreaterThanOrEqual(baseline.totals.targetAtLeast);
  });
});
