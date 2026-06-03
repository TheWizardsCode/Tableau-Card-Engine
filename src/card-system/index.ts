/**
 * Card System Module
 *
 * Provides a flexible system for defining and managing cards,
 * including their attributes, effects, and interactions.
 * Includes abstractions for Card, Deck, Hand, and Pile.
 */
export const CARD_SYSTEM_VERSION = '0.1.0';

// Card types and factory
export type { Card } from './Card';
export type { Rank, Suit } from './Card';
export { RANKS, SUITS, createCard } from './Card';

// Deck factory and operations
export {
  createStandardDeck,
  createDeckFrom,
  shuffleArray,
  shuffle,
  draw,
  drawOrThrow,
} from './Deck';

// Rank value utility
export { rankValue } from './rankValue';

// Pile abstraction
export { Pile } from './Pile';

// Market Offer Engine
export {
  createMarketOfferEngine,
  type MarketOfferEngine,
  type MarketRow,
  type MarketSlot,
  type MarketRowConfig,
  type PurchaseResult,
} from './MarketOfferEngine';
