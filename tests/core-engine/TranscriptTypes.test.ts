/**
 * Tests for TranscriptTypes -- CardSnapshot interface and snapshotCard helper.
 */

import { describe, it, expect } from 'vitest';
import { snapshotCard } from '../../src/core-engine/TranscriptTypes';
import type { CardSnapshot } from '../../src/core-engine/TranscriptTypes';
import { createCard } from '../../src/card-system/Card';
import type { Rank, Suit } from '../../src/card-system/Card';

describe('snapshotCard', () => {
  it('creates a snapshot with rank, suit, and faceUp from a face-up card', () => {
    const card = createCard('A', 'spades', true);
    const snap = snapshotCard(card);

    expect(snap).toEqual({ rank: 'A', suit: 'spades', faceUp: true });
  });

  it('captures face-down state', () => {
    const card = createCard('K', 'hearts', false);
    const snap = snapshotCard(card);

    expect(snap).toEqual({ rank: 'K', suit: 'hearts', faceUp: false });
  });

  it('returns a plain object (no Card methods)', () => {
    const card = createCard('5', 'diamonds', true);
    const snap = snapshotCard(card);

    // Snapshot should be a plain object with exactly three keys
    expect(Object.keys(snap).sort()).toEqual(['faceUp', 'rank', 'suit']);
  });

  it('preserves typed Rank and Suit values', () => {
    const card = createCard('10', 'clubs', false);
    const snap = snapshotCard(card);

    // Verify at runtime that values match the card-system types
    const rank: Rank = snap.rank;
    const suit: Suit = snap.suit;
    expect(rank).toBe('10');
    expect(suit).toBe('clubs');
  });

  it('is JSON-serializable and round-trips correctly', () => {
    const card = createCard('Q', 'hearts', true);
    const snap = snapshotCard(card);

    const json = JSON.stringify(snap);
    const parsed: CardSnapshot = JSON.parse(json);

    expect(parsed).toEqual(snap);
    expect(parsed.rank).toBe('Q');
    expect(parsed.suit).toBe('hearts');
    expect(parsed.faceUp).toBe(true);
  });

  it('produces independent snapshots (not references to original card)', () => {
    const card = createCard('7', 'spades', false);
    const snap1 = snapshotCard(card);

    // Mutate the card
    card.faceUp = true;
    const snap2 = snapshotCard(card);

    // First snapshot should still reflect original state
    expect(snap1.faceUp).toBe(false);
    expect(snap2.faceUp).toBe(true);
  });

  it('handles every rank correctly', () => {
    const ranks: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    for (const rank of ranks) {
      const card = createCard(rank, 'clubs', true);
      const snap = snapshotCard(card);
      expect(snap.rank).toBe(rank);
    }
  });

  it('handles every suit correctly', () => {
    const suits: Suit[] = ['clubs', 'diamonds', 'hearts', 'spades'];
    for (const suit of suits) {
      const card = createCard('A', suit, true);
      const snap = snapshotCard(card);
      expect(snap.suit).toBe(suit);
    }
  });
});

describe('CardSnapshot type conformance', () => {
  it('satisfies the CardSnapshot interface shape', () => {
    // Compile-time check: manually constructing a CardSnapshot
    const snap: CardSnapshot = {
      rank: 'J',
      suit: 'diamonds',
      faceUp: false,
    };

    expect(snap.rank).toBe('J');
    expect(snap.suit).toBe('diamonds');
    expect(snap.faceUp).toBe(false);
  });
});
