import { describe, expect, it } from 'vitest';

import {
  CARD_TEMPLATE_NAMES,
  createBusinessDeck,
  createEventDeck,
  createUpgradeDeck,
} from '../../example-games/main-street/MainStreetCards';
import { setupMainStreetGame } from '../../example-games/main-street/MainStreetState';
import { createSeededRng } from '../../src/core-engine';

function uniqueTemplateIds(deckIds: string[]): string[] {
  return [...new Set(deckIds.map(id => id.replace(/-\d+$/, '')))].sort();
}

describe('Main Street card schema and registry validation', () => {
  const rng = createSeededRng(7);
  const business = createBusinessDeck(1);
  const events = createEventDeck(1, undefined, rng, 1);
  const upgrades = createUpgradeDeck(1);

  const businessTemplateIds = uniqueTemplateIds(business.map(card => card.id));
  const eventTemplateIds = uniqueTemplateIds(events.map(card => card.id));
  const upgradeTemplateIds = uniqueTemplateIds(upgrades.map(card => card.id));

  it('all template IDs are represented in CARD_TEMPLATE_NAMES', () => {
    const allTemplateIds = [...businessTemplateIds, ...eventTemplateIds, ...upgradeTemplateIds];
    for (const templateId of allTemplateIds) {
      expect(CARD_TEMPLATE_NAMES.has(templateId)).toBe(true);
      expect(CARD_TEMPLATE_NAMES.get(templateId)).toBeTruthy();
    }
  });

  it('all event cards with SpecificSynergy target define targetSynergy', () => {
    for (const event of events) {
      if (event.target === 'SpecificSynergy') {
        expect(event.targetSynergy).toBeDefined();
      }
    }
  });

  it('all upgrade targetBusiness values map to an existing business card name', () => {
    const businessNames = new Set(business.map(card => card.name));
    for (const upgrade of upgrades) {
      expect(businessNames.has(upgrade.targetBusiness)).toBe(true);
    }
  });

  it('runtime market/decks only contain registered template IDs', () => {
    const state = setupMainStreetGame({ seed: 'schema-registry-validation' });
    const registered = new Set(CARD_TEMPLATE_NAMES.keys());

    const runtimeCardIds = [
      ...state.market.business.map(card => card.id),
      ...state.market.investments.map(card => card.id),
      ...state.incidentQueue.map(card => card.id),
      ...state.decks.business.map(card => card.id),
      ...state.decks.event.map(card => card.id),
      ...state.decks.upgrade.map(card => card.id),
    ];

    for (const runtimeId of runtimeCardIds) {
      expect(registered.has(runtimeId.replace(/-\d+$/, ''))).toBe(true);
    }
  });
});
