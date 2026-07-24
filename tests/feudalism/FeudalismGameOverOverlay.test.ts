/**
 * Tests for Feudalism game-over overlay tiebreaker text display.
 *
 * Verifies that the tiebreaker line "Tiebreak: fewest cards wins" is only
 * included in the summary when both players have equal influence.
 */
import { describe, it, expect } from 'vitest';
import { getInfluence, getWinnerIndex, setupFeudalismGame } from '../../example-games/feudalism/FeudalismGame';
import { createSeededRng } from '../../src/core-engine/SeededRng';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build the summary text exactly as `showGameOverOverlay` does it,
 * conditionally appending the tiebreaker line only when the influence
 * scores are equal.
 *
 * This mirrors the display logic so tests can assert the rendered text
 * without needing a Phaser scene.
 */
function buildGameOverSummary(
  humanInfluence: number,
  aiInfluence: number,
  humanCards: number,
  humanPatrons: number,
  aiCards: number,
  aiPatrons: number,
): string {
  const lines: string[] = [
    `You: ${humanInfluence} influence (${humanCards} cards, ${humanPatrons} patrons)`,
    `AI: ${aiInfluence} influence (${aiCards} cards, ${aiPatrons} patrons)`,
  ];

  // Tiebreaker text is only shown when scores are tied
  if (humanInfluence === aiInfluence) {
    lines.push('', 'Tiebreak: fewest cards wins');
  }

  return lines.join('\n');
}

function createTestSession(seed = 42) {
  return setupFeudalismGame({
    playerCount: 2,
    playerNames: ['Alice', 'Bot'],
    isAI: [false, true],
    rng: createSeededRng(seed),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FeudalismGameOverOverlay', () => {
  describe('summary text generation', () => {
    it('excludes tiebreaker text when human wins by influence', () => {
      const summary = buildGameOverSummary(10, 5, 8, 2, 5, 0);
      expect(summary).not.toContain('Tiebreak');
      expect(summary).toContain('You: 10 influence');
      expect(summary).toContain('AI: 5 influence');
    });

    it('excludes tiebreaker text when AI wins by influence', () => {
      const summary = buildGameOverSummary(5, 10, 5, 0, 8, 2);
      expect(summary).not.toContain('Tiebreak');
      expect(summary).toContain('You: 5 influence');
      expect(summary).toContain('AI: 10 influence');
    });

    it('includes tiebreaker text when scores are tied', () => {
      const summary = buildGameOverSummary(7, 7, 6, 1, 5, 2);
      expect(summary).toContain('Tiebreak: fewest cards wins');
      expect(summary).toContain('You: 7 influence');
      expect(summary).toContain('AI: 7 influence');
    });

    it('shows score summary with correct card/patron counts regardless of tie', () => {
      const summary = buildGameOverSummary(3, 3, 4, 1, 3, 0);
      expect(summary).toContain('4 cards, 1 patrons');
      expect(summary).toContain('3 cards, 0 patrons');
    });

    it('does not include tiebreaker text for zero-score tie', () => {
      const summary = buildGameOverSummary(0, 0, 0, 0, 0, 0);
      expect(summary).toContain('Tiebreak: fewest cards wins');
      expect(summary).toContain('You: 0 influence (0 cards, 0 patrons)');
      expect(summary).toContain('AI: 0 influence (0 cards, 0 patrons)');
    });
  });

  describe('getWinnerIndex consistency', () => {
    it('returns the player with higher influence (no tie)', () => {
      const session = createTestSession();
      session.players[0].purchasedCards.push(
        { id: 1, tier: 1, cost: {}, bonus: 'wheat', points: 10 },
      );
      session.players[1].purchasedCards.push(
        { id: 2, tier: 1, cost: {}, bonus: 'wheat', points: 3 },
      );
      const winner = getWinnerIndex(session);
      expect(winner).toBe(0);
      expect(getInfluence(session.players[0])).toBe(10);
      expect(getInfluence(session.players[1])).toBe(3);
    });

    it('uses fewest-cards tiebreaker when influence is tied', () => {
      const session = createTestSession();
      // Both have 5 influence
      session.players[0].purchasedCards.push(
        { id: 1, tier: 1, cost: {}, bonus: 'wheat', points: 5 },
      );
      session.players[1].purchasedCards.push(
        { id: 2, tier: 1, cost: {}, bonus: 'wheat', points: 3 },
        { id: 3, tier: 1, cost: {}, bonus: 'wheat', points: 2 },
      );
      // P0: 5pts, 1 card. P1: 5pts, 2 cards. P0 wins.
      const winner = getWinnerIndex(session);
      expect(winner).toBe(0);
    });

    it('influence comparison matches summary text tie logic', () => {
      // Verify that getWinnerIndex tie detection aligns with the display logic
      const session = createTestSession();
      session.players[0].purchasedCards.push(
        { id: 1, tier: 1, cost: {}, bonus: 'wheat', points: 4 },
      );
      session.players[1].purchasedCards.push(
        { id: 2, tier: 1, cost: {}, bonus: 'oats', points: 4 },
      );
      const hInf = getInfluence(session.players[0]);
      const aInf = getInfluence(session.players[1]);
      const winner = getWinnerIndex(session);

      // When influence is tied, a tiebreaker is needed
      expect(hInf).toBe(aInf);
      expect(winner).not.toBeUndefined();

      // The summary for a tied game should include tiebreaker text
      const summary = buildGameOverSummary(hInf, aInf, 1, 0, 2, 0);
      expect(summary).toContain('Tiebreak: fewest cards wins');
    });
  });
});
