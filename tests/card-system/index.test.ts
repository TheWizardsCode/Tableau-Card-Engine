import { describe, it, expect } from 'vitest';
import {
  CARD_SYSTEM_VERSION,
  RANKS,
  SUITS,
  createCard,
  createStandardDeck,
  createDeckFrom,
  shuffle,
  draw,
  drawOrThrow,
  Pile,
} from '../../src/card-system/index';

describe('card-system barrel exports', () => {
  it('should export the module version', () => {
    expect(CARD_SYSTEM_VERSION).toBe('0.1.0');
  });

  it('should export Card factory', () => {
    const card = createCard('A', 'spades');
    expect(card.rank).toBe('A');
    expect(card.suit).toBe('spades');
  });

  it('should export rank and suit constants', () => {
    expect(RANKS).toHaveLength(13);
    expect(SUITS).toHaveLength(4);
  });

  it('should export Deck functions', () => {
    expect(typeof createStandardDeck).toBe('function');
    expect(typeof createDeckFrom).toBe('function');
    expect(typeof shuffle).toBe('function');
    expect(typeof draw).toBe('function');
    expect(typeof drawOrThrow).toBe('function');
  });

  it('should export Pile class', () => {
    const pile = new Pile();
    expect(pile.isEmpty()).toBe(true);
  });
});
