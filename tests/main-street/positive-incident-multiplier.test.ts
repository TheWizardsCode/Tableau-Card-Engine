import { describe, it, expect } from 'vitest';
import { createEventDeck } from '../../example-games/main-street/MainStreetCards';
import { createSeededRng } from '../../src/core-engine';

describe('Positive Incident Multiplier', () => {
  it('applies integer multipliers exactly', () => {
    const base = createEventDeck(1, undefined, createSeededRng(42), 1);
    const posBaseIds = Array.from(new Set(
      base
        .filter(c => c.trigger === 'Incident' && (c.coinDelta + c.reputationDelta) > 0)
        .map(c => c.id.replace(/-\d+$/, '')),
    ));

    const posCountBase = posBaseIds.length;
    // multiplier = 2 should double each positive template's copies
    const deck2 = createEventDeck(1, undefined, createSeededRng(42), 2);
    const posCards2 = deck2.filter(c => c.trigger === 'Incident' && (c.coinDelta + c.reputationDelta) > 0);
    expect(posCards2).toHaveLength(posCountBase * 2);
  });

  it('distributes fractional multiplier deterministically', () => {
    const copies = 1;
    const mult = 1.5;

    const base = createEventDeck(copies, undefined, createSeededRng(42), 1);
    const positiveBaseIds = Array.from(new Set(
      base
        .filter(c => c.trigger === 'Incident' && (c.coinDelta + c.reputationDelta) > 0)
        .map(c => c.id.replace(/-\d+$/, '')),
    ));

    const positiveCount = positiveBaseIds.length;
    const baseDup = Math.floor(mult);
    const fraction = mult - baseDup;
    const extraCount = Math.round(fraction * positiveCount);

    const deck = createEventDeck(copies, undefined, createSeededRng(42), mult);
    // Ensure deterministic: repeating the call with the same numeric seed yields identical ids
    const deck2 = createEventDeck(copies, undefined, createSeededRng(42), mult);
    expect(deck.map(d => d.id)).toEqual(deck2.map(d => d.id));

    // Count occurrences per base id
    const counts = new Map<string, number>();
    for (const c of deck) {
      if (c.trigger !== 'Incident') continue;
      const baseId = c.id.replace(/-\d+$/, '');
      if ((c.coinDelta + c.reputationDelta) <= 0) continue; // only positive incidents
      counts.set(baseId, (counts.get(baseId) ?? 0) + 1);
    }

    // Total positive cards
    const totalPositive = Array.from(counts.values()).reduce((s, v) => s + v, 0);
    const expectedTotal = copies * (baseDup * positiveCount + extraCount);
    expect(totalPositive).toBe(expectedTotal);

    // Each positive template should have either baseDup or baseDup+1 copies
    const plusOnes = Array.from(counts.values()).filter(v => v === baseDup + 1).length;
    const baseDups = Array.from(counts.values()).filter(v => v === baseDup).length;
    expect(plusOnes).toBe(extraCount);
    expect(baseDups + plusOnes).toBe(positiveCount);

    // All produced ids should preserve the template prefix
    const allBasePrefixes = new Set(base.map(b => b.id.replace(/-\d+$/, '')));
    for (const c of deck) {
      const prefix = c.id.replace(/-\d+$/, '');
      expect(allBasePrefixes.has(prefix)).toBe(true);
    }
  });
});
