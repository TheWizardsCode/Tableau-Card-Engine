/**
 * Pile abstraction for the Tableau Card Engine.
 *
 * A Pile is a stack of cards (LIFO). It wraps a Card array and
 * exposes push, pop, peek, isEmpty, and size operations.
 *
 * Piles are used for draw piles, discard piles, foundations,
 * and any other ordered collection of cards in a game.
 */

import type { Card } from './Card';

/**
 * Generic Pile abstraction (LIFO) that can contain any T.
 * Defaults and examples use Card but games may use custom card types.
 */
export class Pile<T = Card> {
  private readonly cards: T[];

  /**
   * Create a Pile, optionally pre-populated with items.
   * The last element of the array is treated as the top of the pile.
   */
  constructor(cards: T[] = []) {
    this.cards = [...cards];
  }

  /** Push one or more items onto the top of the pile. */
  push(...newCards: T[]): void {
    this.cards.push(...newCards);
  }

  /** Remove and return the top item, or `undefined` if empty. */
  pop(): T | undefined {
    return this.cards.pop();
  }

  /** Remove and return the top item, throwing if empty. */
  popOrThrow(): T {
    const card = this.cards.pop();
    if (card === undefined) {
      throw new Error('Cannot pop from an empty pile');
    }
    return card;
  }

  /** Look at the top item without removing it. */
  peek(): T | undefined {
    return this.cards.length > 0 ? this.cards[this.cards.length - 1] : undefined;
  }

  /** Whether the pile contains no items. */
  isEmpty(): boolean {
    return this.cards.length === 0;
  }

  /** The number of items in the pile. */
  size(): number {
    return this.cards.length;
  }

  /** Return a shallow copy of all items (bottom to top). */
  toArray(): T[] {
    return [...this.cards];
  }

  /** Clear all items from the pile. */
  clear(): void {
    this.cards.length = 0;
  }
}
