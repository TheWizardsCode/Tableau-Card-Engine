/**
 * Pile abstraction for the Tableau Card Engine.
 *
 * A Pile is a stack of cards (LIFO). It wraps a Card array and
 * exposes push, pop, peek, isEmpty, and size operations.
 *
 * Piles are used for draw piles, discard piles, foundations,
 * and any other ordered collection of cards in a game.
 */

import { Card } from './Card';

export class Pile {
  private readonly cards: Card[];

  /**
   * Create a Pile, optionally pre-populated with cards.
   * The last element of the array is treated as the top of the pile.
   */
  constructor(cards: Card[] = []) {
    this.cards = [...cards];
  }

  /** Push one or more cards onto the top of the pile. */
  push(...newCards: Card[]): void {
    this.cards.push(...newCards);
  }

  /**
   * Remove and return the top card.
   * @returns The top card, or `undefined` if the pile is empty.
   */
  pop(): Card | undefined {
    return this.cards.pop();
  }

  /**
   * Remove and return the top card, throwing if the pile is empty.
   */
  popOrThrow(): Card {
    const card = this.cards.pop();
    if (card === undefined) {
      throw new Error('Cannot pop from an empty pile');
    }
    return card;
  }

  /**
   * Look at the top card without removing it.
   * @returns The top card, or `undefined` if the pile is empty.
   */
  peek(): Card | undefined {
    return this.cards.length > 0
      ? this.cards[this.cards.length - 1]
      : undefined;
  }

  /** Whether the pile contains no cards. */
  isEmpty(): boolean {
    return this.cards.length === 0;
  }

  /** The number of cards in the pile. */
  size(): number {
    return this.cards.length;
  }

  /**
   * Return a shallow copy of all cards in the pile (bottom to top).
   * Useful for inspection and serialization.
   */
  toArray(): Card[] {
    return [...this.cards];
  }

  /** Clear all cards from the pile. */
  clear(): void {
    this.cards.length = 0;
  }
}
