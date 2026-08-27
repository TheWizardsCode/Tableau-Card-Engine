import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { TIER_DEFINITIONS } from '../example-games/main-street/MainStreetTiers';

type CardFamily = 'business' | 'community-space' | 'event' | 'staff' | 'upgrade';

function familyFromCardId(cardId: string): CardFamily {
  if (cardId.startsWith('biz-')) return 'business';
  if (cardId.startsWith('cs-')) return 'community-space';
  if (cardId.startsWith('evt-')) return 'event';
  if (cardId.startsWith('staff-')) return 'staff';
  return 'upgrade';
}

const tier1Ids = TIER_DEFINITIONS['tier-1'].newCardIds;
const counts: Record<CardFamily, number> = {
  business: 0,
  'community-space': 0,
  event: 0,
  staff: 0,
  upgrade: 0,
};

for (const cardId of tier1Ids) {
  counts[familyFromCardId(cardId)] += 1;
}

const baselineTotal = Object.values(counts).reduce((a, b) => a + b, 0);

const baseline = {
  source: 'Tier 1 baseline from example-games/main-street/MainStreetTiers.ts',
  capturedAt: new Date().toISOString(),
  perTier: {
    tier1: {
      ...counts,
      total: baselineTotal,
    },
  },
  totals: {
    baselineTotal,
    targetAtLeast: baselineTotal * 2,
  },
};

const outputPath = resolve(process.cwd(), 'docs/main-street/card-catalog-baseline.json');
writeFileSync(outputPath, `${JSON.stringify(baseline, null, 2)}\n`, 'utf-8');
console.log(`Wrote ${outputPath}`);
