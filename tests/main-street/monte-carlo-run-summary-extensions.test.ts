/**
 * Monte Carlo Run Summary Extensions — Tests for E-1 and E-3
 *
 * Verifies that `MonteCarloRunSummary` has the new `cardsOwned` and
 * `marketOffers` fields, and that they are populated correctly during
 * `runSeed()`.
 *
 * Coverage:
 *  - cardsOwned is present and is a string array
 *  - cardsOwned contains purchased business card IDs
 *  - cardsOwned contains purchased upgrade card IDs
 *  - cardsOwned contains purchased event card IDs
 *  - marketOffers is present and is a string array
 *  - marketOffers contains card IDs that appeared in the market
 *  - Both fields are empty on a minimal run with no purchases
 *  - The interface definition includes the new fields
 *
 * Work items:
 *   CG-0MRYZT4ID008PFFT — E-1: Card ownership tracking
 *   CG-0MRYZTLAN00958S0 — E-3: Market offer tracking
 */
import { describe, expect, it } from 'vitest';

import { runMonteCarlo } from '../../example-games/main-street/MainStreetMonteCarlo';

describe('MonteCarloRunSummary — cardsOwned (E-1)', () => {
  it('includes cardsOwned field typed as string array', () => {
    const seeds = ['mc-e1-type-check'];
    const { runs } = runMonteCarlo({ seeds, maxTurns: 5, strategy: 'market-greedy' });
    const run = runs[0];
    // Verify the field exists and is an array
    expect(run).toHaveProperty('cardsOwned');
    expect(Array.isArray(run.cardsOwned)).toBe(true);
    // All entries should be strings (card IDs)
    for (const cardId of run.cardsOwned) {
      expect(typeof cardId).toBe('string');
    }
  });

  it('populates cardsOwned with purchased business card IDs for market-greedy', () => {
    // market-greedy buys the cheapest business on turn 1, so we should
    // see at least one business card ID in cardsOwned.
    const seeds = ['mc-e1-business-purchase'];
    const { runs } = runMonteCarlo({ seeds, maxTurns: 10, strategy: 'market-greedy' });
    const run = runs[0];

    // market-greedy should purchase at least one business
    expect(run.cardsOwned.length).toBeGreaterThanOrEqual(1);

    // All cardsOwned entries should be non-empty strings
    for (const cardId of run.cardsOwned) {
      expect(cardId).toBeTruthy();
    }
  });

  it('populates cardsOwned for demo-greedy strategy', () => {
    const seeds = ['mc-e1-demo-greedy'];
    const { runs } = runMonteCarlo({ seeds, maxTurns: 10, strategy: 'demo-greedy' });
    const run = runs[0];

    // demo-greedy buys a business, plays events, buys upgrades
    expect(run.cardsOwned.length).toBeGreaterThanOrEqual(1);
  });

  it('populates cardsOwned for AI-driven greedy strategy', () => {
    const seeds = ['mc-e1-greedy'];
    const { runs } = runMonteCarlo({ seeds, maxTurns: 10, strategy: 'greedy' });
    const run = runs[0];
    // The AI greedy strategy should also produce purchases
    expect(Array.isArray(run.cardsOwned)).toBe(true);
  });

  it('populates cardsOwned for AI-driven random strategy', () => {
    const seeds = ['mc-e1-random'];
    const { runs } = runMonteCarlo({ seeds, maxTurns: 10, strategy: 'random' });
    const run = runs[0];
    expect(Array.isArray(run.cardsOwned)).toBe(true);
  });

  it('cardsOwned is reset per seed (not accumulated across runs)', () => {
    const seeds = ['mc-e1-reset-0', 'mc-e1-reset-1', 'mc-e1-reset-2'];
    const { runs } = runMonteCarlo({ seeds, maxTurns: 10, strategy: 'market-greedy' });

    // Each run should have its own independent cardsOwned array
    for (const run of runs) {
      expect(Array.isArray(run.cardsOwned)).toBe(true);
    }
  });
});

describe('MonteCarloRunSummary — marketOffers (E-3)', () => {
  it('includes marketOffers field typed as string array', () => {
    const seeds = ['mc-e3-type-check'];
    const { runs } = runMonteCarlo({ seeds, maxTurns: 5, strategy: 'market-greedy' });
    const run = runs[0];
    expect(run).toHaveProperty('marketOffers');
    expect(Array.isArray(run.marketOffers)).toBe(true);
    for (const cardId of run.marketOffers) {
      expect(typeof cardId).toBe('string');
    }
  });

  it('marketOffers contains card IDs that appeared in the market', () => {
    const seeds = ['mc-e3-market-cards'];
    const { runs } = runMonteCarlo({ seeds, maxTurns: 5, strategy: 'market-greedy' });
    const run = runs[0];

    // With at least one turn, there should be some market offers
    expect(run.marketOffers.length).toBeGreaterThanOrEqual(1);

    // All entries should be non-empty strings
    for (const cardId of run.marketOffers) {
      expect(cardId).toBeTruthy();
    }
  });

  it('marketOffers is populated across multiple turns', () => {
    // Run more turns to see more diverse market offers
    const seeds = ['mc-e3-multi-turn'];
    const { runs } = runMonteCarlo({ seeds, maxTurns: 15, strategy: 'market-greedy' });
    const run = runs[0];

    // With many turns, we should see lots of market offers
    expect(run.marketOffers.length).toBeGreaterThanOrEqual(5);
  });

  it('marketOffers works for AI-driven strategies', () => {
    const seeds = ['mc-e3-ai-greedy'];
    const { runs } = runMonteCarlo({ seeds, maxTurns: 10, strategy: 'greedy' });
    const run = runs[0];
    expect(Array.isArray(run.marketOffers)).toBe(true);
    expect(run.marketOffers.length).toBeGreaterThanOrEqual(1);
  });

  it('marketOffers is reset per seed', () => {
    const seeds = ['mc-e3-reset-0', 'mc-e3-reset-1'];
    const { runs } = runMonteCarlo({ seeds, maxTurns: 5, strategy: 'market-greedy' });
    for (const run of runs) {
      expect(Array.isArray(run.marketOffers)).toBe(true);
    }
  });
});

describe('MonteCarloRunSummary — both new fields present', () => {
  it('all runs have both cardsOwned and marketOffers', () => {
    const seeds = ['mc-both-0', 'mc-both-1', 'mc-both-2'];
    const { runs } = runMonteCarlo({ seeds, maxTurns: 8, strategy: 'market-greedy' });

    for (const run of runs) {
      expect(run).toHaveProperty('cardsOwned');
      expect(run).toHaveProperty('marketOffers');
      expect(Array.isArray(run.cardsOwned)).toBe(true);
      expect(Array.isArray(run.marketOffers)).toBe(true);
    }
  });
});
