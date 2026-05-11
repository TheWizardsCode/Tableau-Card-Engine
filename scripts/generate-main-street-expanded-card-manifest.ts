import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  createBusinessDeck,
  createEventDeck,
  createUpgradeDeck,
} from '../example-games/main-street/MainStreetCards';
import { TIER_DEFINITIONS } from '../example-games/main-street/MainStreetTiers';
import { createSeededRng } from '../src/core-engine';

function uniqueTemplateIds(ids: string[]): string[] {
  return [...new Set(ids.map(id => id.replace(/-\d+$/, '')))].sort();
}

const baselineTier1CardIds = [...TIER_DEFINITIONS['tier-1'].newCardIds].sort();
const baselineSet = new Set(baselineTier1CardIds);

const rng = createSeededRng(42);
const business = uniqueTemplateIds(createBusinessDeck(1).map(c => c.id));
const event = uniqueTemplateIds(createEventDeck(1, undefined, rng, 1).map(c => c.id));
const upgrade = uniqueTemplateIds(createUpgradeDeck(1).map(c => c.id));

const manifest = {
  source: 'Generated from MainStreetCards.ts and Tier 1 IDs from MainStreetTiers.ts',
  generatedAt: new Date().toISOString(),
  baselineTier1CardIds,
  expandedCardIds: {
    business: business.filter(id => !baselineSet.has(id)),
    event: event.filter(id => !baselineSet.has(id)),
    upgrade: upgrade.filter(id => !baselineSet.has(id)),
  },
};

const output = resolve(process.cwd(), 'docs/main-street/expanded-card-manifest.json');
writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8');
console.log(`Wrote ${output}`);
