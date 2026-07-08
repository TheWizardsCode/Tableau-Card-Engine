import { describe, it, expect, beforeEach } from 'vitest';
import {
  setupTheMindGame,
  dealLevel,
  playCard,
  getPileTopValue,
  isGameOver,
  isLevelComplete,
  STARTING_LIVES,
  MAX_LEVEL,
  MAX_LIVES,
  BONUS_LIFE_LEVELS,
  type TheMindSession,
  type PlayerId,
} from '../../example-games/the-mind/TheMindGameState';
import { createSeededRng } from '../../src/core-engine/SeededRng';

// ── Helper: create a session with controlled hands ─────────
// Instead of relying on random deals, we manually set hands to
// test specific scenarios deterministically.

function createTestSession(
  humanHand: number[],
  aiHand: number[],
  options?: { lives?: number; level?: number },
): TheMindSession {
  const rng = createSeededRng(42);
  const session = setupTheMindGame({ rng });

  // Override hands with known values for testing
  session.players[0].hand = humanHand.map((v) => ({ value: v, faceUp: false }));
  session.players[1].hand = aiHand.map((v) => ({ value: v, faceUp: false }));

  // Sort ascending (as dealLevel does)
  session.players[0].hand.sort((a, b) => a.value - b.value);
  session.players[1].hand.sort((a, b) => a.value - b.value);

  if (options?.lives !== undefined) {
    session.lives = options.lives;
  }
  if (options?.level !== undefined) {
    session.currentLevel = options.level;
  }

  // Clear the pile so it starts empty for our test
  session.pile.clear();

  return session;
}

// ═══════════════════════════════════════════════════════════
// Setup
// ═══════════════════════════════════════════════════════════

describe('setupTheMindGame', () => {
  it('creates a session with 2 players', () => {
    const session = setupTheMindGame({ rng: createSeededRng(1) });
    expect(session.players).toHaveLength(2);
  });

  it('uses default player names', () => {
    const session = setupTheMindGame({ rng: createSeededRng(1) });
    expect(session.players[0].name).toBe('Player 1');
    expect(session.players[1].name).toBe('Player 2');
  });

  it('uses custom player names', () => {
    const session = setupTheMindGame({
      playerNames: ['Alice', 'Bob'],
      rng: createSeededRng(1),
    });
    expect(session.players[0].name).toBe('Alice');
    expect(session.players[1].name).toBe('Bob');
  });

  it('defaults to human + AI', () => {
    const session = setupTheMindGame({ rng: createSeededRng(1) });
    expect(session.players[0].isAI).toBe(false);
    expect(session.players[1].isAI).toBe(true);
  });

  it('supports custom AI flags', () => {
    const session = setupTheMindGame({
      isAI: [true, true],
      rng: createSeededRng(1),
    });
    expect(session.players[0].isAI).toBe(true);
    expect(session.players[1].isAI).toBe(true);
  });

  it('starts at level 1', () => {
    const session = setupTheMindGame({ rng: createSeededRng(1) });
    expect(session.currentLevel).toBe(1);
  });

  it('starts with STARTING_LIVES lives', () => {
    const session = setupTheMindGame({ rng: createSeededRng(1) });
    expect(session.lives).toBe(STARTING_LIVES);
  });

  it('starts with outcome in-progress', () => {
    const session = setupTheMindGame({ rng: createSeededRng(1) });
    expect(session.outcome).toBe('in-progress');
  });

  it('deals 1 card per player at level 1', () => {
    const session = setupTheMindGame({ rng: createSeededRng(1) });
    expect(session.players[0].hand).toHaveLength(1);
    expect(session.players[1].hand).toHaveLength(1);
  });

  it('starts with an empty pile', () => {
    const session = setupTheMindGame({ rng: createSeededRng(1) });
    expect(session.pile.isEmpty()).toBe(true);
  });

  it('produces deterministic deals with same seed', () => {
    const s1 = setupTheMindGame({ rng: createSeededRng(42) });
    const s2 = setupTheMindGame({ rng: createSeededRng(42) });

    expect(s1.players[0].hand.map((c) => c.value)).toEqual(
      s2.players[0].hand.map((c) => c.value),
    );
    expect(s1.players[1].hand.map((c) => c.value)).toEqual(
      s2.players[1].hand.map((c) => c.value),
    );
  });
});

// ═══════════════════════════════════════════════════════════
// Dealing
// ═══════════════════════════════════════════════════════════

describe('dealLevel', () => {
  let session: TheMindSession;

  beforeEach(() => {
    session = setupTheMindGame({ rng: createSeededRng(42) });
  });

  it('deals correct number of cards per player for each level', () => {
    for (let level = 1; level <= MAX_LEVEL; level++) {
      dealLevel(session, level);
      expect(session.players[0].hand).toHaveLength(level);
      expect(session.players[1].hand).toHaveLength(level);
    }
  });

  it('clears the pile when dealing a new level', () => {
    // Play a card to put something on the pile
    const s = createTestSession([10], [20]);
    playCard(s, 0, 10);
    expect(s.pile.isEmpty()).toBe(false);

    // Deal new level
    dealLevel(s, 2);
    expect(s.pile.isEmpty()).toBe(true);
  });

  it('updates currentLevel to the dealt level', () => {
    dealLevel(session, 5);
    expect(session.currentLevel).toBe(5);
  });

  it('hands are sorted ascending by value', () => {
    for (let level = 1; level <= MAX_LEVEL; level++) {
      dealLevel(session, level);
      for (const player of session.players) {
        for (let i = 1; i < player.hand.length; i++) {
          expect(player.hand[i].value).toBeGreaterThan(
            player.hand[i - 1].value,
          );
        }
      }
    }
  });

  it('all dealt cards have unique values', () => {
    dealLevel(session, MAX_LEVEL);
    const allValues = [
      ...session.players[0].hand.map((c) => c.value),
      ...session.players[1].hand.map((c) => c.value),
    ];
    const valueSet = new Set(allValues);
    expect(valueSet.size).toBe(allValues.length);
  });

  it('all dealt card values are in [1, 100]', () => {
    dealLevel(session, MAX_LEVEL);
    for (const player of session.players) {
      for (const card of player.hand) {
        expect(card.value).toBeGreaterThanOrEqual(1);
        expect(card.value).toBeLessThanOrEqual(100);
      }
    }
  });

  it('throws for level 0', () => {
    expect(() => dealLevel(session, 0)).toThrow('Invalid level 0');
  });

  it('throws for level 9', () => {
    expect(() => dealLevel(session, 9)).toThrow('Invalid level 9');
  });

  it('throws for negative levels', () => {
    expect(() => dealLevel(session, -1)).toThrow('Invalid level -1');
  });

  it('all dealt cards start face-down', () => {
    dealLevel(session, 5);
    for (const player of session.players) {
      for (const card of player.hand) {
        expect(card.faceUp).toBe(false);
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════
// Query helpers
// ═══════════════════════════════════════════════════════════

describe('getPileTopValue', () => {
  it('returns 0 for empty pile', () => {
    const session = createTestSession([10], [20]);
    expect(getPileTopValue(session)).toBe(0);
  });

  it('returns value of the last played card', () => {
    const session = createTestSession([10, 30], [20, 40]);
    playCard(session, 0, 10);
    expect(getPileTopValue(session)).toBe(10);
    playCard(session, 1, 20);
    expect(getPileTopValue(session)).toBe(20);
  });
});

describe('isGameOver', () => {
  it('returns false for in-progress game', () => {
    const session = createTestSession([10], [20]);
    expect(isGameOver(session)).toBe(false);
  });

  it('returns true after a loss', () => {
    const session = createTestSession([10], [20], { lives: 1 });
    // Play 20 first -- penalty for holding 10
    playCard(session, 1, 20);
    expect(isGameOver(session)).toBe(true);
  });
});

describe('isLevelComplete', () => {
  it('returns false when players have cards', () => {
    const session = createTestSession([10], [20]);
    expect(isLevelComplete(session)).toBe(false);
  });

  it('returns true when both hands are empty', () => {
    const session = createTestSession([], []);
    expect(isLevelComplete(session)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// Legal play
// ═══════════════════════════════════════════════════════════

describe('playCard - legal plays', () => {
  it('plays a card onto an empty pile', () => {
    const session = createTestSession([10], [20]);
    const result = playCard(session, 0, 10);

    expect(result.success).toBe(true);
    expect(result.lifeLost).toBe(false);
    expect(result.penaltyCards).toHaveLength(0);
    expect(getPileTopValue(session)).toBe(10);
    expect(session.players[0].hand).toHaveLength(0);
  });

  it('plays a card higher than pile top', () => {
    const session = createTestSession([10, 30], [20, 40]);
    playCard(session, 0, 10);
    const result = playCard(session, 1, 20);

    expect(result.success).toBe(true);
    expect(result.lifeLost).toBe(false);
    expect(getPileTopValue(session)).toBe(20);
  });

  it('either player can play (no turn order)', () => {
    const session = createTestSession([30], [10, 20]);

    // AI plays first
    const r1 = playCard(session, 1, 10);
    expect(r1.success).toBe(true);

    // AI plays again
    const r2 = playCard(session, 1, 20);
    expect(r2.success).toBe(true);
  });

  it('played card is turned face-up', () => {
    const session = createTestSession([10], [20]);
    playCard(session, 0, 10);
    const top = session.pile.peek()!;
    expect(top.faceUp).toBe(true);
  });

  it('played card is removed from hand', () => {
    const session = createTestSession([10, 30], [20]);
    playCard(session, 0, 10);
    expect(session.players[0].hand.map((c) => c.value)).toEqual([30]);
  });
});

// ═══════════════════════════════════════════════════════════
// Illegal plays
// ═══════════════════════════════════════════════════════════

describe('playCard - illegal plays', () => {
  it('rejects card lower than pile top', () => {
    // Use cards where 10 is the lowest, so no penalty when playing 20
    const session = createTestSession([10, 20], [30]);
    playCard(session, 0, 20); // pile top = 20 (penalty: discards 10)
    // Now try to play a card lower than pile top
    // We need to add a card manually since 10 was discarded
    session.players[0].hand = [{ value: 15, faceUp: false }];
    const result = playCard(session, 0, 15);

    expect(result.success).toBe(false);
    expect(result.error).toContain('not higher than pile top');
  });

  it('rejects card equal to pile top', () => {
    // This shouldn't normally happen (unique values), but guard anyway
    const session = createTestSession([10], [20]);
    playCard(session, 0, 10); // pile top = 10

    // Manually add a card with same value to test the guard
    session.players[1].hand = [{ value: 10, faceUp: false }];
    const result = playCard(session, 1, 10);
    expect(result.success).toBe(false);
    expect(result.error).toContain('not higher than pile top');
  });

  it('rejects card not in hand', () => {
    const session = createTestSession([10], [20]);
    const result = playCard(session, 0, 99);

    expect(result.success).toBe(false);
    expect(result.error).toContain('not in player');
  });

  it('rejects play when game is over (loss)', () => {
    const session = createTestSession([10], [20], { lives: 1 });
    playCard(session, 1, 20); // penalty kills last life

    const result = playCard(session, 0, 10);
    expect(result.success).toBe(false);
    expect(result.error).toContain('already over');
  });

  it('rejects play when game is over (win)', () => {
    const session = createTestSession([10], [20], { level: MAX_LEVEL });
    playCard(session, 0, 10);
    playCard(session, 1, 20);
    // Game is won

    // Try to play after win
    session.players[0].hand = [{ value: 30, faceUp: false }];
    const result = playCard(session, 0, 30);
    expect(result.success).toBe(false);
    expect(result.error).toContain('already over');
  });

  it('does not modify state on rejected play', () => {
    const session = createTestSession([10], [20]);
    playCard(session, 0, 10); // pile top = 10

    const livesBefore = session.lives;
    const pileSizeBefore = session.pile.size();
    const handBefore = [...session.players[1].hand.map((c) => c.value)];

    // Try illegal play
    playCard(session, 1, 5); // card not in hand

    expect(session.lives).toBe(livesBefore);
    expect(session.pile.size()).toBe(pileSizeBefore);
    expect(session.players[1].hand.map((c) => c.value)).toEqual(handBefore);
  });
});

// ═══════════════════════════════════════════════════════════
// Penalty logic
// ═══════════════════════════════════════════════════════════

describe('playCard - penalty (single lower card)', () => {
  it('loses a life when opponent holds a lower card', () => {
    const session = createTestSession([5], [20], { lives: 2 });
    // AI plays 20 while human holds 5
    const result = playCard(session, 1, 20);

    expect(result.success).toBe(true);
    expect(result.lifeLost).toBe(true);
    expect(session.lives).toBe(1);
  });

  it('discards the lower card from opponent', () => {
    const session = createTestSession([5], [20], { lives: 2 });
    const result = playCard(session, 1, 20);

    expect(result.penaltyCards).toHaveLength(1);
    expect(result.penaltyCards[0].playerId).toBe(0);
    expect(result.penaltyCards[0].card.value).toBe(5);
    // Level also completed (both hands empty after penalty + play),
    // so new cards were dealt for the next level.
    expect(result.levelComplete).toBe(true);
  });
});

describe('playCard - penalty (multiple lower cards across both hands)', () => {
  it('discards all lower cards from both players', () => {
    // Human holds [3, 8], AI holds [5, 50]
    // AI plays 50 -- human's 3 and 8, and AI's 5 are all lower
    const session = createTestSession([3, 8], [5, 50], { lives: 2 });
    const result = playCard(session, 1, 50);

    expect(result.success).toBe(true);
    expect(result.lifeLost).toBe(true);
    expect(result.penaltyCards).toHaveLength(3);

    // Verify all lower cards were discarded
    const penaltyValues = result.penaltyCards.map((p) => p.card.value).sort((a, b) => a - b);
    expect(penaltyValues).toEqual([3, 5, 8]);

    // After penalty + playing 50, all original cards are gone.
    // Level completes (both hands empty) and auto-advances with new deal.
    expect(result.levelComplete).toBe(true);
  });

  it('only loses one life per play regardless of how many cards are discarded', () => {
    const session = createTestSession([1, 2, 3], [4, 50], { lives: 2 });
    const result = playCard(session, 1, 50);

    expect(result.lifeLost).toBe(true);
    expect(session.lives).toBe(1);
    expect(result.penaltyCards).toHaveLength(4); // 1, 2, 3, 4
  });

  it('discards lower cards from the playing player too', () => {
    // Human holds [5, 30], human plays 30 while also holding 5
    // Wait, 5 < 30, so human's own 5 gets discarded as penalty?
    // Actually re-reading the rules: "when a card is played while EITHER
    // player holds a lower-valued card" -- but the played card itself is
    // already being played, not "held". The player's own lower cards
    // should also trigger a penalty.
    const session = createTestSession([5, 30], [40], { lives: 2 });
    const result = playCard(session, 0, 30);

    // Human held 5 which is lower than 30 they just played
    expect(result.lifeLost).toBe(true);
    expect(result.penaltyCards).toHaveLength(1);
    expect(result.penaltyCards[0].playerId).toBe(0);
    expect(result.penaltyCards[0].card.value).toBe(5);
  });
});

// ═══════════════════════════════════════════════════════════
// Life loss
// ═══════════════════════════════════════════════════════════

describe('playCard - life loss and game over', () => {
  it('game ends in loss when lives reach 0', () => {
    const session = createTestSession([5], [20], { lives: 1 });
    const result = playCard(session, 1, 20);

    expect(result.success).toBe(true);
    expect(result.lifeLost).toBe(true);
    expect(session.lives).toBe(0);
    expect(session.outcome).toBe('loss');
    expect(isGameOver(session)).toBe(true);
  });

  it('game continues if lives remain after penalty', () => {
    const session = createTestSession([5], [20], { lives: 2 });
    playCard(session, 1, 20);

    expect(session.lives).toBe(1);
    expect(session.outcome).toBe('in-progress');
    expect(isGameOver(session)).toBe(false);
  });

  it('starts with the correct number of lives', () => {
    const session = setupTheMindGame({ rng: createSeededRng(1) });
    expect(session.lives).toBe(STARTING_LIVES);
    expect(STARTING_LIVES).toBe(2);
  });
});

// ═══════════════════════════════════════════════════════════
// Bonus life
// ═══════════════════════════════════════════════════════════

describe('playCard - bonus life award', () => {
  it('awards bonus life after clearing level 3', () => {
    const session = createTestSession([10], [20], { level: 3, lives: 2 });
    playCard(session, 0, 10);
    const result = playCard(session, 1, 20);

    expect(result.levelComplete).toBe(true);
    expect(result.bonusLifeAwarded).toBe(true);
    expect(session.lives).toBe(3);
  });

  it('awards bonus life after clearing level 6', () => {
    const session = createTestSession([10], [20], { level: 6, lives: 2 });
    playCard(session, 0, 10);
    const result = playCard(session, 1, 20);

    expect(result.levelComplete).toBe(true);
    expect(result.bonusLifeAwarded).toBe(true);
    expect(session.lives).toBe(3);
  });

  it('does not award bonus life at non-bonus levels', () => {
    const session = createTestSession([10], [20], { level: 2, lives: 2 });
    playCard(session, 0, 10);
    const result = playCard(session, 1, 20);

    expect(result.levelComplete).toBe(true);
    expect(result.bonusLifeAwarded).toBe(false);
    expect(session.lives).toBe(2);
  });

  it('does not exceed MAX_LIVES', () => {
    const session = createTestSession([10], [20], { level: 3, lives: MAX_LIVES });
    playCard(session, 0, 10);
    const result = playCard(session, 1, 20);

    expect(result.levelComplete).toBe(true);
    expect(result.bonusLifeAwarded).toBe(false);
    expect(session.lives).toBe(MAX_LIVES);
  });

  it('BONUS_LIFE_LEVELS contains levels 3 and 6', () => {
    expect(BONUS_LIFE_LEVELS).toContain(3);
    expect(BONUS_LIFE_LEVELS).toContain(6);
    expect(BONUS_LIFE_LEVELS).toHaveLength(2);
  });
});

// ═══════════════════════════════════════════════════════════
// Level completion
// ═══════════════════════════════════════════════════════════

describe('playCard - level completion', () => {
  it('completes a level when both hands are empty', () => {
    const session = createTestSession([10], [20], { level: 1 });
    playCard(session, 0, 10);
    const result = playCard(session, 1, 20);

    expect(result.levelComplete).toBe(true);
  });

  it('does not complete level while cards remain', () => {
    const session = createTestSession([10, 30], [20, 40], { level: 2 });
    const result = playCard(session, 0, 10);

    expect(result.levelComplete).toBe(false);
  });

  it('auto-advances to next level after completion', () => {
    const session = createTestSession([10], [20], { level: 1 });
    playCard(session, 0, 10);
    playCard(session, 1, 20);

    // Should have advanced to level 2 and dealt 2 cards each
    expect(session.currentLevel).toBe(2);
    expect(session.players[0].hand).toHaveLength(2);
    expect(session.players[1].hand).toHaveLength(2);
  });

  it('clears the pile when advancing to next level', () => {
    const session = createTestSession([10], [20], { level: 1 });
    playCard(session, 0, 10);
    playCard(session, 1, 20);

    // Pile should be clear for the new level
    expect(session.pile.isEmpty()).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// Win condition
// ═══════════════════════════════════════════════════════════

describe('playCard - win condition', () => {
  it('game ends in win after clearing level 8', () => {
    const session = createTestSession([10], [20], { level: MAX_LEVEL });
    playCard(session, 0, 10);
    const result = playCard(session, 1, 20);

    expect(result.levelComplete).toBe(true);
    expect(session.outcome).toBe('win');
    expect(isGameOver(session)).toBe(true);
  });

  it('does not deal a new level after winning', () => {
    const session = createTestSession([10], [20], { level: MAX_LEVEL });
    playCard(session, 0, 10);
    playCard(session, 1, 20);

    // Level should remain at MAX_LEVEL (no level 9)
    expect(session.currentLevel).toBe(MAX_LEVEL);
  });
});

// ═══════════════════════════════════════════════════════════
// Loss condition
// ═══════════════════════════════════════════════════════════

describe('playCard - loss condition', () => {
  it('game ends in loss when last life is lost', () => {
    const session = createTestSession([5], [20], { lives: 1 });
    const result = playCard(session, 1, 20);

    expect(result.lifeLost).toBe(true);
    expect(session.lives).toBe(0);
    expect(session.outcome).toBe('loss');
  });

  it('levelComplete is false on a losing play', () => {
    const session = createTestSession([5], [20], { lives: 1 });
    const result = playCard(session, 1, 20);

    expect(result.levelComplete).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════
// Edge cases
// ═══════════════════════════════════════════════════════════

describe('edge cases', () => {
  it('play from empty hand is rejected', () => {
    const session = createTestSession([], [20]);
    const result = playCard(session, 0, 10);

    expect(result.success).toBe(false);
    expect(result.error).toContain('not in player');
  });

  it('no penalty when playing the lowest card', () => {
    // If the played card is the lowest of all held cards, no penalty
    const session = createTestSession([5, 30], [20, 40]);
    const result = playCard(session, 0, 5);

    expect(result.success).toBe(true);
    expect(result.lifeLost).toBe(false);
    expect(result.penaltyCards).toHaveLength(0);
  });

  it('perfect play through a level with no penalties', () => {
    // Cards played in perfect ascending order
    const session = createTestSession([10, 30], [20, 40], { level: 2 });

    playCard(session, 0, 10);
    playCard(session, 1, 20);
    playCard(session, 0, 30);
    const result = playCard(session, 1, 40);

    expect(result.levelComplete).toBe(true);
    expect(session.lives).toBe(STARTING_LIVES); // No lives lost
  });

  it('penalty discards are reflected in penaltyCards result', () => {
    const session = createTestSession([1, 2, 3], [10, 50], { lives: 2 });
    const result = playCard(session, 1, 10);

    // 1, 2, 3 are all lower than 10 and held by human
    expect(result.penaltyCards).toHaveLength(3);
    const discardedValues = result.penaltyCards
      .map((p) => p.card.value)
      .sort((a, b) => a - b);
    expect(discardedValues).toEqual([1, 2, 3]);
  });

  it('consecutive penalties reduce lives correctly', () => {
    // Set up for two penalties
    const session = createTestSession([5, 25], [15, 35], { lives: 3 });

    // AI plays 15 while human holds 5 -- penalty (lives: 3 -> 2)
    playCard(session, 1, 15);
    expect(session.lives).toBe(2);

    // AI plays 35 while human holds 25 -- penalty (lives: 2 -> 1)
    playCard(session, 1, 35);
    expect(session.lives).toBe(1);
  });

  it('level completion after penalty with lives remaining', () => {
    // Human holds [5], AI holds [20]. AI plays 20 -- penalty (5 discarded).
    // After penalty, both hands are empty, so level completes.
    const session = createTestSession([5], [20], { lives: 2, level: 1 });
    const result = playCard(session, 1, 20);

    expect(result.lifeLost).toBe(true);
    expect(result.levelComplete).toBe(true);
    expect(session.lives).toBe(1);
    // Should have advanced to level 2
    expect(session.currentLevel).toBe(2);
  });

  it('multiple plays from same player in sequence', () => {
    const session = createTestSession([10, 20, 30], [40, 50, 60], { level: 3 });

    playCard(session, 0, 10);
    playCard(session, 0, 20);
    const result = playCard(session, 0, 30);

    expect(result.success).toBe(true);
    expect(result.lifeLost).toBe(false);
    expect(session.players[0].hand).toHaveLength(0);
  });

  it('interleaved plays from both players', () => {
    const session = createTestSession([10, 30, 50], [20, 40, 60], { level: 3 });

    playCard(session, 0, 10);
    playCard(session, 1, 20);
    playCard(session, 0, 30);
    playCard(session, 1, 40);
    playCard(session, 0, 50);
    const result = playCard(session, 1, 60);

    expect(result.levelComplete).toBe(true);
    expect(result.lifeLost).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════
// Full game simulation
// ═══════════════════════════════════════════════════════════

describe('full game simulation', () => {
  it('can complete a perfect game through all 8 levels', () => {
    const rng = createSeededRng(7);
    const session = setupTheMindGame({ rng, isAI: [true, true] });

    for (let level = 1; level <= MAX_LEVEL; level++) {
      // Collect all cards from both hands and sort ascending
      const allCards = [
        ...session.players[0].hand.map((c) => ({ ...c, pid: 0 as PlayerId })),
        ...session.players[1].hand.map((c) => ({ ...c, pid: 1 as PlayerId })),
      ].sort((a, b) => a.value - b.value);

      // Play cards in perfect ascending order
      for (const { value, pid } of allCards) {
        const result = playCard(session, pid, value);
        expect(result.success).toBe(true);
        expect(result.lifeLost).toBe(false);
      }

      if (level < MAX_LEVEL) {
        // Should have advanced to next level
        expect(session.currentLevel).toBe(level + 1);
      }
    }

    expect(session.outcome).toBe('win');
    // Bonus life earned at level 3 (2 -> 3), but level 6 bonus is
    // blocked because lives already at MAX_LIVES (3).
    expect(session.lives).toBe(MAX_LIVES);
  });

  it('can lose the game from penalties', () => {
    const session = createTestSession([1], [50], { lives: 1, level: 1 });

    // AI plays 50 while human holds 1 -- penalty, lose last life
    const result = playCard(session, 1, 50);
    expect(result.lifeLost).toBe(true);
    expect(session.outcome).toBe('loss');
  });
});

// ═══════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════

describe('game constants', () => {
  it('MAX_LEVEL is 8', () => {
    expect(MAX_LEVEL).toBe(8);
  });

  it('STARTING_LIVES is 2', () => {
    expect(STARTING_LIVES).toBe(2);
  });

  it('MAX_LIVES is 3', () => {
    expect(MAX_LIVES).toBe(3);
  });
});
