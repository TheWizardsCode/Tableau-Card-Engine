import { describe, expect, it } from 'vitest';

import { setupMainStreetGame } from '../../example-games/main-street/MainStreetState';
import { TIER_DEFINITIONS } from '../../example-games/main-street/MainStreetTiers';

const tier1Ids = new Set(TIER_DEFINITIONS['tier-1'].newCardIds);

function isExpandedCard(id: string): boolean {
  const templateId = id.replace(/-\d+$/, '');
  return !tier1Ids.has(templateId);
}

describe('Main Street expanded cards are included in runtime market/decks', () => {
  it('includes expanded cards across deterministic seeds without custom wiring', () => {
    const seeds = Array.from({ length: 30 }, (_, i) => `expanded-integration-${i}`);

    let seenExpandedInMarket = false;
    let seenExpandedInDecks = false;

    for (const seed of seeds) {
      const state = setupMainStreetGame({ seed });

      const marketIds = [
        ...state.market.development.map(card => card.id),
        ...state.market.investments.map(card => card.id),
        ...state.incidentQueue.map(card => card.id),
      ];

      const deckIds = [
        ...state.decks.business.map(card => card.id),
        ...state.decks.event.map(card => card.id),
        ...state.decks.upgrade.map(card => card.id),
      ];

      if (marketIds.some(isExpandedCard)) seenExpandedInMarket = true;
      if (deckIds.some(isExpandedCard)) seenExpandedInDecks = true;

      if (seenExpandedInMarket && seenExpandedInDecks) break;
    }

    expect(seenExpandedInMarket).toBe(true);
    expect(seenExpandedInDecks).toBe(true);
  });
});
