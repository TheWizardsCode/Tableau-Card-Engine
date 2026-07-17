import { describe, it, expect } from 'vitest';
import {
  createCard,
  RANKS,
  SUITS,
} from '../../src/card-system/Card';

describe('Card', () => {
  it('should create a face-down card by default', () => {
    const card = createCard('A', 'spades');
    expect(card.rank).toBe('A');
    expect(card.suit).toBe('spades');
    expect(card.faceUp).toBe(false);
  });

  it('should create a face-up card when specified', () => {
    const card = createCard('K', 'hearts', true);
    expect(card.rank).toBe('K');
    expect(card.suit).toBe('hearts');
    expect(card.faceUp).toBe(true);
  });

  it('should allow toggling faceUp', () => {
    const card = createCard('5', 'diamonds');
    expect(card.faceUp).toBe(false);
    card.faceUp = true;
    expect(card.faceUp).toBe(true);
  });

  it('should export all 13 ranks', () => {
    expect(RANKS).toHaveLength(13);
    expect(RANKS).toContain('A');
    expect(RANKS).toContain('10');
    expect(RANKS).toContain('K');
  });

  it('should export all 4 suits', () => {
    expect(SUITS).toHaveLength(4);
    expect(SUITS).toContain('clubs');
    expect(SUITS).toContain('diamonds');
    expect(SUITS).toContain('hearts');
    expect(SUITS).toContain('spades');
  });
});
