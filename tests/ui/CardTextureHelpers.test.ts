import { describe, it, expect } from 'vitest';
import { createCard } from '../../src/card-system/Card';
import type { Rank } from '../../src/card-system/Card';
import {
  rankFileName,
  cardTextureKey,
  cardFileName,
  getCardTexture,
} from '../../src/ui/CardTextureHelpers';
import {
  CARD_W,
  CARD_H,
  GAME_W,
  GAME_H,
  FONT_FAMILY,
} from '../../src/ui/constants';

// ── rankFileName ─────────────────────────────────────────────

describe('rankFileName', () => {
  it('should map ace abbreviation to full name', () => {
    expect(rankFileName('A')).toBe('ace');
  });

  it('should map jack abbreviation to full name', () => {
    expect(rankFileName('J')).toBe('jack');
  });

  it('should map queen abbreviation to full name', () => {
    expect(rankFileName('Q')).toBe('queen');
  });

  it('should map king abbreviation to full name', () => {
    expect(rankFileName('K')).toBe('king');
  });

  it.each([
    ['2'], ['3'], ['4'], ['5'], ['6'], ['7'], ['8'], ['9'], ['10'],
  ] as [Rank][])('should return number rank "%s" as-is', (rank) => {
    expect(rankFileName(rank)).toBe(rank);
  });
});

// ── cardTextureKey ───────────────────────────────────────────

describe('cardTextureKey', () => {
  it('should produce the correct key for ace of spades', () => {
    expect(cardTextureKey('A', 'spades')).toBe('ace_of_spades');
  });

  it('should produce the correct key for 10 of hearts', () => {
    expect(cardTextureKey('10', 'hearts')).toBe('10_of_hearts');
  });

  it('should produce the correct key for queen of diamonds', () => {
    expect(cardTextureKey('Q', 'diamonds')).toBe('queen_of_diamonds');
  });

  it('should produce the correct key for 5 of clubs', () => {
    expect(cardTextureKey('5', 'clubs')).toBe('5_of_clubs');
  });
});

// ── cardFileName ─────────────────────────────────────────────

describe('cardFileName', () => {
  it('should produce the correct SVG filename for ace of spades', () => {
    expect(cardFileName('A', 'spades')).toBe('ace_of_spades.svg');
  });

  it('should produce the correct SVG filename for king of hearts', () => {
    expect(cardFileName('K', 'hearts')).toBe('king_of_hearts.svg');
  });

  it('should produce the correct SVG filename for 7 of clubs', () => {
    expect(cardFileName('7', 'clubs')).toBe('7_of_clubs.svg');
  });
});

// ── getCardTexture ───────────────────────────────────────────

describe('getCardTexture', () => {
  it('should return card_back for a face-down card', () => {
    const card = createCard('A', 'spades', false);
    expect(getCardTexture(card)).toBe('card_back');
  });

  it('should return the texture key for a face-up card', () => {
    const card = createCard('A', 'spades', true);
    expect(getCardTexture(card)).toBe('ace_of_spades');
  });

  it('should return the texture key for a face-up number card', () => {
    const card = createCard('7', 'diamonds', true);
    expect(getCardTexture(card)).toBe('7_of_diamonds');
  });

  it('should return card_back when faceUp is toggled to false', () => {
    const card = createCard('Q', 'hearts', true);
    expect(getCardTexture(card)).toBe('queen_of_hearts');
    card.faceUp = false;
    expect(getCardTexture(card)).toBe('card_back');
  });
});

// ── Shared constants ─────────────────────────────────────────

describe('shared UI constants', () => {
  it('should export CARD_W as 48', () => {
    expect(CARD_W).toBe(48);
  });

  it('should export CARD_H as 65', () => {
    expect(CARD_H).toBe(65);
  });

  it('should export GAME_W as 1280', () => {
    expect(GAME_W).toBe(1280);
  });

  it('should export GAME_H as 720', () => {
    expect(GAME_H).toBe(720);
  });

  it('should export FONT_FAMILY as a non-empty string', () => {
    expect(FONT_FAMILY).toBe('Arial, sans-serif');
  });
});
