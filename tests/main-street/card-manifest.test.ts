import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  createBusinessDeck,
  createEventDeck,
  createUpgradeDeck,
} from '../../example-games/main-street/MainStreetCards';
import { createSeededRng } from '../../src/core-engine';

interface ExpandedCardManifest {
  baselineTier1CardIds: string[];
  expandedCardIds: {
    business: string[];
    event: string[];
    upgrade: string[];
  };
}

function loadManifest(): ExpandedCardManifest {
  const p = resolve(process.cwd(), 'docs/main-street/expanded-card-manifest.json');
  return JSON.parse(readFileSync(p, 'utf-8')) as ExpandedCardManifest;
}

function allCurrentTemplateIds(): { business: string[]; event: string[]; upgrade: string[] } {
  const rng = createSeededRng(42);
  const business = createBusinessDeck(1).map(c => c.id.replace(/-\d+$/, ''));
  const event = createEventDeck(1, undefined, rng, 1).map(c => c.id.replace(/-\d+$/, ''));
  const upgrade = createUpgradeDeck(1).map(c => c.id.replace(/-\d+$/, ''));
  return {
    business: [...new Set(business)].sort(),
    event: [...new Set(event)].sort(),
    upgrade: [...new Set(upgrade)].sort(),
  };
}

describe('Main Street expanded card manifest', () => {
  it('tracks all non-baseline card templates by family', () => {
    const manifest = loadManifest();
    const current = allCurrentTemplateIds();

    const baseline = new Set(manifest.baselineTier1CardIds);

    const expectedBusiness = current.business.filter(id => !baseline.has(id)).sort();
    const expectedEvent = current.event.filter(id => !baseline.has(id)).sort();
    const expectedUpgrade = current.upgrade.filter(id => !baseline.has(id)).sort();

    expect(manifest.expandedCardIds.business.slice().sort()).toEqual(expectedBusiness);
    expect(manifest.expandedCardIds.event.slice().sort()).toEqual(expectedEvent);
    expect(manifest.expandedCardIds.upgrade.slice().sort()).toEqual(expectedUpgrade);
  });

  it('expanded template count keeps total pool above 2x baseline', () => {
    const manifest = loadManifest();
    const baselineCount = manifest.baselineTier1CardIds.length;
    const expandedCount =
      manifest.expandedCardIds.business.length +
      manifest.expandedCardIds.event.length +
      manifest.expandedCardIds.upgrade.length;

    expect(baselineCount + expandedCount).toBeGreaterThanOrEqual(baselineCount * 2);
  });
});
