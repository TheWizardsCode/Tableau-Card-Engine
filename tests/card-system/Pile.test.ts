import { describe, it, expect } from 'vitest';
import { Pile } from '../../src/card-system/Pile';
import { createCard } from '../../src/card-system/Card';
import type { Card } from '../../src/card-system/Card';

describe('Pile', () => {
  const aceSpades = (): Card => createCard('A', 'spades');
  const kingHearts = (): Card => createCard('K', 'hearts');
  const fiveDiamonds = (): Card => createCard('5', 'diamonds');

  describe('constructor', () => {
    it('should create an empty pile by default', () => {
      const pile = new Pile();
      expect(pile.isEmpty()).toBe(true);
      expect(pile.size()).toBe(0);
    });

    it('should create a pile from an array of cards', () => {
      const pile = new Pile([aceSpades(), kingHearts()]);
      expect(pile.size()).toBe(2);
      expect(pile.isEmpty()).toBe(false);
    });

    it('should not mutate the source array', () => {
      const source = [aceSpades(), kingHearts()];
      const pile = new Pile(source);
      pile.push(fiveDiamonds());
      expect(source).toHaveLength(2);
      expect(pile.size()).toBe(3);
    });
  });

  describe('push', () => {
    it('should add a card to the top', () => {
      const pile = new Pile();
      pile.push(aceSpades());
      expect(pile.size()).toBe(1);
      expect(pile.peek()!.rank).toBe('A');
    });

    it('should add multiple cards at once', () => {
      const pile = new Pile();
      pile.push(aceSpades(), kingHearts(), fiveDiamonds());
      expect(pile.size()).toBe(3);
      // Last pushed card is on top
      expect(pile.peek()!.rank).toBe('5');
    });
  });

  describe('pop', () => {
    it('should remove and return the top card', () => {
      const pile = new Pile([aceSpades(), kingHearts()]);
      const card = pile.pop();
      expect(card).toBeDefined();
      expect(card!.rank).toBe('K');
      expect(pile.size()).toBe(1);
    });

    it('should return undefined from an empty pile', () => {
      const pile = new Pile();
      expect(pile.pop()).toBeUndefined();
    });
  });

  describe('popOrThrow', () => {
    it('should remove and return the top card', () => {
      const pile = new Pile([aceSpades()]);
      const card = pile.popOrThrow();
      expect(card.rank).toBe('A');
      expect(pile.isEmpty()).toBe(true);
    });

    it('should throw when pile is empty', () => {
      const pile = new Pile();
      expect(() => pile.popOrThrow()).toThrow(
        'Cannot pop from an empty pile',
      );
    });
  });

  describe('peek', () => {
    it('should return the top card without removing it', () => {
      const pile = new Pile([aceSpades(), kingHearts()]);
      const card = pile.peek();
      expect(card).toBeDefined();
      expect(card!.rank).toBe('K');
      expect(pile.size()).toBe(2);
    });

    it('should return undefined for an empty pile', () => {
      const pile = new Pile();
      expect(pile.peek()).toBeUndefined();
    });
  });

  describe('isEmpty', () => {
    it('should return true for an empty pile', () => {
      expect(new Pile().isEmpty()).toBe(true);
    });

    it('should return false for a non-empty pile', () => {
      expect(new Pile([aceSpades()]).isEmpty()).toBe(false);
    });

    it('should return true after all cards are popped', () => {
      const pile = new Pile([aceSpades()]);
      pile.pop();
      expect(pile.isEmpty()).toBe(true);
    });
  });

  describe('size', () => {
    it('should return 0 for an empty pile', () => {
      expect(new Pile().size()).toBe(0);
    });

    it('should track push and pop operations', () => {
      const pile = new Pile();
      pile.push(aceSpades());
      expect(pile.size()).toBe(1);
      pile.push(kingHearts());
      expect(pile.size()).toBe(2);
      pile.pop();
      expect(pile.size()).toBe(1);
    });
  });

  describe('toArray', () => {
    it('should return a copy of all cards bottom to top', () => {
      const pile = new Pile([aceSpades(), kingHearts()]);
      const arr = pile.toArray();
      expect(arr).toHaveLength(2);
      expect(arr[0].rank).toBe('A');
      expect(arr[1].rank).toBe('K');
    });

    it('should return a copy, not the internal array', () => {
      const pile = new Pile([aceSpades()]);
      const arr = pile.toArray();
      arr.push(kingHearts());
      expect(pile.size()).toBe(1); // internal not affected
    });
  });

  describe('clear', () => {
    it('should remove all cards', () => {
      const pile = new Pile([aceSpades(), kingHearts(), fiveDiamonds()]);
      pile.clear();
      expect(pile.isEmpty()).toBe(true);
      expect(pile.size()).toBe(0);
    });
  });
});
