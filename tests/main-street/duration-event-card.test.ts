/**
 * DurationEventCard: Type & Type Guard Tests
 *
 * Tests the DurationEventCard interface extension and isDurationEventCard type guard.
 *
 * @module
 */

import { describe, it, expect } from 'vitest';
import {
  type DurationEventCard,
  isDurationEventCard,
  type EventCard,
} from '../../example-games/main-street/MainStreetCards';

describe('DurationEventCard', () => {
  describe('isDurationEventCard type guard', () => {
    it('returns true for a DurationEventCard', () => {
      const card: DurationEventCard = {
        family: 'event',
        id: 'evt-flu-outbreak',
        name: 'Flu Outbreak',
        trigger: 'Incident',
        cost: 0,
        effect: 'Income reduced to 80% for 5 turns.',
        target: 'All',
        coinDelta: 0,
        reputationDelta: 0,
        duration: 5,
        effectType: 'income-multiplier',
        multiplier: 0.8,
      };

      expect(isDurationEventCard(card)).toBe(true);
    });

    it('returns false for a regular EventCard', () => {
      const card: EventCard = {
        family: 'event',
        id: 'evt-festival',
        name: 'Local Festival',
        trigger: 'Investment',
        cost: 3,
        effect: '+2 coins to all Culture businesses and +1 reputation.',
        target: 'SpecificSynergy',
        targetSynergy: 'Culture',
        coinDelta: 2,
        reputationDelta: 1,
      };

      expect(isDurationEventCard(card)).toBe(false);
    });

    it('returns false for an object that is not an event at all', () => {
      const notAnEvent = { family: 'business', id: 'biz-bakery' };
      expect(isDurationEventCard(notAnEvent)).toBe(false);
    });

    it('returns false for a null value', () => {
      expect(isDurationEventCard(null)).toBe(false);
    });

    it('returns false for an undefined value', () => {
      expect(isDurationEventCard(undefined)).toBe(false);
    });
  });

  describe('DurationEventCard structure', () => {
    it('has all EventCard fields plus duration, effectType, and multiplier', () => {
      const card: DurationEventCard = {
        family: 'event',
        id: 'evt-flu-outbreak',
        name: 'Flu Outbreak',
        trigger: 'Incident',
        cost: 0,
        effect: 'Income reduced to 80% for 5 turns.',
        target: 'All',
        coinDelta: 0,
        reputationDelta: 0,
        duration: 5,
        effectType: 'income-multiplier',
        multiplier: 0.8,
      };

      // EventCard fields
      expect(card.family).toBe('event');
      expect(card.id).toBe('evt-flu-outbreak');
      expect(card.name).toBe('Flu Outbreak');
      expect(card.trigger).toBe('Incident');
      expect(card.cost).toBe(0);
      expect(card.target).toBe('All');
      expect(card.coinDelta).toBe(0);
      expect(card.reputationDelta).toBe(0);

      // Duration fields
      expect(card.duration).toBe(5);
      expect(card.effectType).toBe('income-multiplier');
      expect(card.multiplier).toBe(0.8);
    });
  });

  describe('type compatibility', () => {
    it('DurationEventCard is assignable to EventCard (extends it)', () => {
      const dCard: DurationEventCard = {
        family: 'event',
        id: 'evt-flu-outbreak',
        name: 'Flu Outbreak',
        trigger: 'Incident',
        cost: 0,
        effect: 'Income reduced to 80% for 5 turns.',
        target: 'All',
        coinDelta: 0,
        reputationDelta: 0,
        duration: 5,
        effectType: 'income-multiplier',
        multiplier: 0.8,
      };

      // Should be assignable to EventCard
      const eCard: EventCard = dCard;
      expect(eCard.id).toBe('evt-flu-outbreak');
    });
  });
});
