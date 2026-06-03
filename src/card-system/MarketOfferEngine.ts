/**
 * Market Offer Engine
 *
 * A generic engine for managing a market of card offers organized in rows.
 * Each row has a configurable number of slots, each slot may hold a card.
 * Supports refill from external decks, slot locking, and card lookup.
 *
 * Designed to be reusable across any tableau card game that uses a row-based
 * market (e.g., Main Street, Feudalism). Game-specific business rules
 * (affordability checks, placement validation) remain in the game layer.
 *
 * @module
 */

// ── Types ───────────────────────────────────────────────────

/**
 * A single slot within a market row.
 * Can be empty (card === null) or occupied.
 */
export interface MarketSlot<TCard> {
  card: TCard | null;
  locked: boolean;
}

/**
 * A named row of market slots.
 * Each row has a unique id and a fixed-size array of slots.
 */
export interface MarketRow<TCard> {
  id: string;
  slots: MarketSlot<TCard>[];
}

/**
 * Configuration for creating a market row.
 */
export interface MarketRowConfig<TCard> {
  id: string;
  slots: number;
  cards?: TCard[];
}

/**
 * Result of a successful purchase.
 */
export interface PurchaseResult<TCard> {
  card: TCard;
  slotIndex: number;
  rowId: string;
}

// ── MarketOfferEngine interface ─────────────────────────────

/**
 * Generic market offer engine for managing rows of card offers.
 *
 * @typeParam TCard - The card type stored in market slots.
 *
 * @example
 * ```ts
 * const market = createMarketOfferEngine<BusinessCard>([
 *   { id: 'business', slots: 4, cards: [card1, card2, card3, card4] },
 *   { id: 'investments', slots: 5 },
 * ]);
 *
 * // Find a card
 * const found = market.findCard('business', someCardId);
 *
 * // Purchase (remove from market)
 * const purchased = market.removeCard('business', 2);
 *
 * // Refill empty slots from deck
 * market.refillRow('business', businessDeck);
 * ```
 */
export interface MarketOfferEngine<TCard> {
  /** Returns all rows in the market. */
  getRows(): readonly MarketRow<TCard>[];

  /** Returns a specific row by id, or undefined if not found. */
  getRow(rowId: string): MarketRow<TCard> | undefined;

  /** Returns the card at a specific slot, or null if empty. */
  getCard(rowId: string, slotIndex: number): TCard | null;

  /** Sets the card at a specific slot (null to clear). */
  setCard(rowId: string, slotIndex: number, card: TCard | null): void;

  /** Finds a card by ID within a specific row. */
  findCard(rowId: string, cardId: string): { slotIndex: number; card: TCard } | undefined;

  /** Finds a card by ID across all rows. */
  findCardAnywhere(cardId: string): { rowId: string; slotIndex: number; card: TCard } | undefined;

  /** Removes and returns the card at a specific slot (throws if empty). */
  removeCard(rowId: string, slotIndex: number): TCard;

  /** Returns indices of all empty (card === null) slots in a row. */
  getEmptySlots(rowId: string): number[];

  /** Locks a slot, preventing it from being refilled. */
  lockSlot(rowId: string, slotIndex: number): void;

  /** Unlocks a slot, allowing it to be refilled. */
  unlockSlot(rowId: string, slotIndex: number): void;

  /** Returns whether a slot is locked. */
  isSlotLocked(rowId: string, slotIndex: number): boolean;

  /** Refills empty (and unlocked) slots in a row from a deck (pops from end). */
  refillRow(rowId: string, deck: TCard[]): number;

  /** Returns whether all slots in a row are empty. */
  isEmpty(rowId: string): boolean;

  /** Returns the number of occupied slots in a row. */
  countCards(rowId: string): number;

  /** Iterates over each card in a row, calling fn(card, slotIndex). */
  forEachCard(rowId: string, fn: (card: TCard, slotIndex: number) => void): void;
}

// ── Implementation ──────────────────────────────────────────

/**
 * Validates that a rowId and slotIndex reference a valid slot.
 * @throws Error if the row or slot does not exist.
 */
function validateSlot<TCard>(
  rows: Map<string, MarketRow<TCard>>,
  rowId: string,
  slotIndex: number,
): MarketSlot<TCard> {
  const row = rows.get(rowId);
  if (!row) {
    throw new Error(`Market row '${rowId}' not found.`);
  }
  if (slotIndex < 0 || slotIndex >= row.slots.length) {
    throw new Error(
      `Slot index ${slotIndex} out of range for row '${rowId}' (0-${row.slots.length - 1}).`,
    );
  }
  return row.slots[slotIndex];
}

function createRow<TCard>(config: MarketRowConfig<TCard>): MarketRow<TCard> {
  const slots: MarketSlot<TCard>[] = [];
  const cardCount = config.cards?.length ?? 0;
  for (let i = 0; i < config.slots; i++) {
    slots.push({
      card: i < cardCount ? (config.cards![i] ?? null) : null,
      locked: false,
    });
  }
  return { id: config.id, slots };
}

/**
 * Creates a MarketOfferEngine with the given row configurations.
 *
 * @param rowsConfig  Configuration for each market row.
 * @returns A new MarketOfferEngine instance.
 */
export function createMarketOfferEngine<TCard>(
  rowsConfig: MarketRowConfig<TCard>[],
): MarketOfferEngine<TCard> {
  const rows = new Map<string, MarketRow<TCard>>();

  for (const config of rowsConfig) {
    rows.set(config.id, createRow(config));
  }

  return {
    getRows(): readonly MarketRow<TCard>[] {
      return Array.from(rows.values());
    },

    getRow(rowId: string): MarketRow<TCard> | undefined {
      return rows.get(rowId);
    },

    getCard(rowId: string, slotIndex: number): TCard | null {
      return validateSlot(rows, rowId, slotIndex).card;
    },

    setCard(rowId: string, slotIndex: number, card: TCard | null): void {
      validateSlot(rows, rowId, slotIndex).card = card;
    },

    findCard(rowId: string, cardId: string): { slotIndex: number; card: TCard } | undefined {
      const row = rows.get(rowId);
      if (!row) return undefined;
      for (let i = 0; i < row.slots.length; i++) {
        const slot = row.slots[i];
        if (slot.card !== null && (slot.card as any).id === cardId) {
          return { slotIndex: i, card: slot.card };
        }
      }
      return undefined;
    },

    findCardAnywhere(
      cardId: string,
    ): { rowId: string; slotIndex: number; card: TCard } | undefined {
      for (const [rowId, row] of rows) {
        for (let i = 0; i < row.slots.length; i++) {
          const slot = row.slots[i];
          if (slot.card !== null && (slot.card as any).id === cardId) {
            return { rowId, slotIndex: i, card: slot.card };
          }
        }
      }
      return undefined;
    },

    removeCard(rowId: string, slotIndex: number): TCard {
      const slot = validateSlot(rows, rowId, slotIndex);
      if (slot.card === null) {
        throw new Error(`Slot ${slotIndex} in row '${rowId}' is already empty.`);
      }
      const card = slot.card;
      slot.card = null;
      return card;
    },

    getEmptySlots(rowId: string): number[] {
      const row = rows.get(rowId);
      if (!row) return [];
      const empty: number[] = [];
      for (let i = 0; i < row.slots.length; i++) {
        if (row.slots[i].card === null) {
          empty.push(i);
        }
      }
      return empty;
    },

    lockSlot(rowId: string, slotIndex: number): void {
      validateSlot(rows, rowId, slotIndex).locked = true;
    },

    unlockSlot(rowId: string, slotIndex: number): void {
      validateSlot(rows, rowId, slotIndex).locked = false;
    },

    isSlotLocked(rowId: string, slotIndex: number): boolean {
      return validateSlot(rows, rowId, slotIndex).locked;
    },

    refillRow(rowId: string, deck: TCard[]): number {
      const row = rows.get(rowId);
      if (!row) return 0;
      let refilled = 0;
      for (const slot of row.slots) {
        if (slot.card === null && !slot.locked && deck.length > 0) {
          slot.card = deck.pop()!;
          refilled++;
        }
      }
      return refilled;
    },

    isEmpty(rowId: string): boolean {
      const row = rows.get(rowId);
      if (!row) return true;
      return row.slots.every(s => s.card === null);
    },

    countCards(rowId: string): number {
      const row = rows.get(rowId);
      if (!row) return 0;
      return row.slots.filter(s => s.card !== null).length;
    },

    forEachCard(rowId: string, fn: (card: TCard, slotIndex: number) => void): void {
      const row = rows.get(rowId);
      if (!row) return;
      for (let i = 0; i < row.slots.length; i++) {
        const card = row.slots[i].card;
        if (card !== null) {
          fn(card, i);
        }
      }
    },
  };
}
