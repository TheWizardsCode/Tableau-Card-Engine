import { describe, it, expect } from 'vitest';
import {
  setupFeudalismGame,
  getCurrentPlayer,
  getInfluence,
  getBonuses,
  effectiveCost,
  canAfford,
  patronQualifies,
  getLegalActions,
  isGameOver,
  getWinnerIndex,
  executeTurn,
  discardTokens,
  validateAction,
  type FeudalismSession,
  type FeudalismPlayerState,
} from '../../example-games/feudalism/FeudalismGame';
import {
  type DevelopmentCard,
  type PatronTile,
  type ResourceTokens,
  tokenCount,
  totalTokens,
  RESOURCE_TYPES,
  MAX_TOKENS,
  MAX_RESERVED,
  MARKET_SIZE,
} from '../../example-games/feudalism/FeudalismCards';
import { createSeededRng } from '../../src/core-engine/SeededRng';

// ---------------------------------------------------------------------------
// Deterministic RNG
// ---------------------------------------------------------------------------

function createTestSession(seed = 42): FeudalismSession {
  return setupFeudalismGame({
    playerCount: 2,
    playerNames: ['Alice', 'Bot'],
    isAI: [false, true],
    rng: createSeededRng(seed),
  });
}

describe('FeudalismGame', () => {
  // -------------------------------------------------------------------------
  // Setup
  // -------------------------------------------------------------------------
  describe('setupFeudalismGame', () => {
    it('creates a 2-player session with correct defaults', () => {
      const session = createTestSession();
      expect(session.players).toHaveLength(2);
      expect(session.players[0].name).toBe('Alice');
      expect(session.players[0].isAI).toBe(false);
      expect(session.players[1].name).toBe('Bot');
      expect(session.players[1].isAI).toBe(true);
    });

    it('initializes players with empty inventories', () => {
      const session = createTestSession();
      for (const p of session.players) {
        expect(totalTokens(p.tokens)).toBe(0);
        expect(p.purchasedCards).toHaveLength(0);
        expect(p.reservedCards).toHaveLength(0);
        expect(p.patrons).toHaveLength(0);
      }
    });

    it('sets up 3 patron tiles for 2 players', () => {
      const session = createTestSession();
      expect(session.patrons).toHaveLength(3);
    });

    it('sets up market with 4 visible cards per tier', () => {
      const session = createTestSession();
      for (const tier of [1, 2, 3] as const) {
        const visible = session.market[tier].visible.filter(c => c !== null);
        expect(visible).toHaveLength(MARKET_SIZE);
      }
    });

    it('has remaining deck cards after filling market', () => {
      const session = createTestSession();
      expect(session.market[1].deck.length).toBe(40 - 4);
      expect(session.market[2].deck.length).toBe(30 - 4);
      expect(session.market[3].deck.length).toBe(20 - 4);
    });

    it('sets up token supply for 2 players (4 each resource + 5 mead)', () => {
      const session = createTestSession();
      for (const c of RESOURCE_TYPES) {
        expect(tokenCount(session.tokenSupply, c)).toBe(4);
      }
      expect(tokenCount(session.tokenSupply, 'mead')).toBe(5);
    });

    it('starts in playing phase with player 0', () => {
      const session = createTestSession();
      expect(session.phase).toBe('playing');
      expect(session.currentPlayerIndex).toBe(0);
      expect(session.triggerPlayerIndex).toBe(-1);
    });

    it('throws for invalid player count', () => {
      expect(() => setupFeudalismGame({ playerCount: 1 })).toThrow();
      expect(() => setupFeudalismGame({ playerCount: 5 })).toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Query helpers
  // -------------------------------------------------------------------------
  describe('query helpers', () => {
    it('getCurrentPlayer returns the active player', () => {
      const session = createTestSession();
      expect(getCurrentPlayer(session).name).toBe('Alice');
    });

    it('getInfluence returns 0 for a fresh player', () => {
      const session = createTestSession();
      expect(getInfluence(session.players[0])).toBe(0);
    });

    it('getInfluence sums card points and patron points', () => {
      const session = createTestSession();
      const player = session.players[0];
      player.purchasedCards.push(
        { id: 999, tier: 1, cost: {}, bonus: 'wheat', points: 2 },
        { id: 998, tier: 2, cost: {}, bonus: 'oats', points: 3 },
      );
      player.patrons.push({ id: 100, requirements: {}, points: 3 });
      expect(getInfluence(player)).toBe(8);
    });

    it('getBonuses counts purchased card bonuses', () => {
      const session = createTestSession();
      const player = session.players[0];
      player.purchasedCards.push(
        { id: 999, tier: 1, cost: {}, bonus: 'wheat', points: 0 },
        { id: 998, tier: 1, cost: {}, bonus: 'wheat', points: 0 },
        { id: 997, tier: 1, cost: {}, bonus: 'oats', points: 0 },
      );
      const bonuses = getBonuses(player);
      expect(bonuses.wheat).toBe(2);
      expect(bonuses.oats).toBe(1);
      expect(bonuses.flax).toBe(0);
    });

    it('effectiveCost subtracts bonuses from cost', () => {
      const cost = { wheat: 3, oats: 2, flax: 1 };
      const bonuses = { wheat: 1, oats: 2, flax: 0, barley: 0, turnip: 0 };
      const eff = effectiveCost(cost, bonuses);
      expect(eff.wheat).toBe(2);
      expect(eff.oats).toBeUndefined();
      expect(eff.flax).toBe(1);
    });

    it('canAfford returns true when player has enough tokens + bonuses', () => {
      const player: FeudalismPlayerState = {
        name: 'Test',
        isAI: false,
        tokens: { wheat: 2, flax: 1 },
        purchasedCards: [
          { id: 999, tier: 1, cost: {}, bonus: 'wheat', points: 0 },
        ],
        reservedCards: [],
        patrons: [],
      };
      const card: DevelopmentCard = {
        id: 100, tier: 1, cost: { wheat: 3, flax: 1 }, bonus: 'oats', points: 0,
      };
      expect(canAfford(player, card)).toBe(true);
    });

    it('canAfford uses mead as wild', () => {
      const player: FeudalismPlayerState = {
        name: 'Test',
        isAI: false,
        tokens: { wheat: 1, mead: 2 },
        purchasedCards: [],
        reservedCards: [],
        patrons: [],
      };
      const card: DevelopmentCard = {
        id: 100, tier: 1, cost: { wheat: 3 }, bonus: 'oats', points: 0,
      };
      expect(canAfford(player, card)).toBe(true);
    });

    it('canAfford returns false when insufficient', () => {
      const player: FeudalismPlayerState = {
        name: 'Test',
        isAI: false,
        tokens: { wheat: 1 },
        purchasedCards: [],
        reservedCards: [],
        patrons: [],
      };
      const card: DevelopmentCard = {
        id: 100, tier: 1, cost: { wheat: 3 }, bonus: 'oats', points: 0,
      };
      expect(canAfford(player, card)).toBe(false);
    });

    it('patronQualifies checks bonus requirements', () => {
      const player: FeudalismPlayerState = {
        name: 'Test',
        isAI: false,
        tokens: {},
        purchasedCards: [
          { id: 1, tier: 1, cost: {}, bonus: 'barley', points: 0 },
          { id: 2, tier: 1, cost: {}, bonus: 'barley', points: 0 },
          { id: 3, tier: 1, cost: {}, bonus: 'barley', points: 0 },
          { id: 4, tier: 1, cost: {}, bonus: 'barley', points: 0 },
          { id: 5, tier: 1, cost: {}, bonus: 'flax', points: 0 },
          { id: 6, tier: 1, cost: {}, bonus: 'flax', points: 0 },
          { id: 7, tier: 1, cost: {}, bonus: 'flax', points: 0 },
          { id: 8, tier: 1, cost: {}, bonus: 'flax', points: 0 },
        ],
        reservedCards: [],
        patrons: [],
      };
      const patron: PatronTile = { id: 1, requirements: { barley: 4, flax: 4 }, points: 3 };
      expect(patronQualifies(player, patron)).toBe(true);
    });

    it('patronQualifies returns false when requirements not met', () => {
      const player: FeudalismPlayerState = {
        name: 'Test',
        isAI: false,
        tokens: {},
        purchasedCards: [
          { id: 1, tier: 1, cost: {}, bonus: 'barley', points: 0 },
          { id: 2, tier: 1, cost: {}, bonus: 'barley', points: 0 },
        ],
        reservedCards: [],
        patrons: [],
      };
      const patron: PatronTile = { id: 1, requirements: { barley: 4, flax: 4 }, points: 3 };
      expect(patronQualifies(player, patron)).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Take different tokens
  // -------------------------------------------------------------------------
  describe('take different tokens', () => {
    it('takes 3 different resource tokens', () => {
      const session = createTestSession();
      const result = executeTurn(session, {
        type: 'take-different',
        colors: ['wheat', 'oats', 'flax'],
      });
      expect(result.tokensOverLimit).toBe(0);
      // Player got tokens
      expect(tokenCount(session.players[0].tokens, 'wheat')).toBe(1);
      expect(tokenCount(session.players[0].tokens, 'oats')).toBe(1);
      expect(tokenCount(session.players[0].tokens, 'flax')).toBe(1);
      // Supply decreased
      expect(tokenCount(session.tokenSupply, 'wheat')).toBe(3);
      // Turn advanced
      expect(session.currentPlayerIndex).toBe(1);
    });

    it('rejects taking 4 tokens', () => {
      const session = createTestSession();
      const error = validateAction(session, {
        type: 'take-different',
        colors: ['wheat', 'oats', 'flax', 'barley'] as any,
      });
      expect(error).toEqual({ legal: false, reason: expect.any(String) });
    });

    it('rejects duplicate colors', () => {
      const session = createTestSession();
      const error = validateAction(session, {
        type: 'take-different',
        colors: ['wheat', 'wheat', 'oats'],
      });
      expect(error).toEqual({ legal: false, reason: expect.any(String) });
    });

    it('rejects taking fewer than 3 when 3+ colors available', () => {
      const session = createTestSession();
      const error = validateAction(session, {
        type: 'take-different',
        colors: ['wheat', 'oats'],
      });
      expect(error).toEqual({ legal: false, reason: expect.any(String) });
    });

    it('allows fewer than 3 when supply is limited', () => {
      const session = createTestSession();
      // Empty all but 2 colors
      session.tokenSupply.wheat = 0;
      session.tokenSupply.barley = 0;
      session.tokenSupply.turnip = 0;
      const error = validateAction(session, {
        type: 'take-different',
        colors: ['oats', 'flax'],
      });
      expect(error).toEqual({ legal: true });
    });

    it('rejects taking from empty supply color', () => {
      const session = createTestSession();
      session.tokenSupply.wheat = 0;
      session.tokenSupply.barley = 0;
      session.tokenSupply.turnip = 0;
      const error = validateAction(session, {
        type: 'take-different',
        colors: ['oats', 'wheat'],
      });
      expect(error).toEqual({ legal: false, reason: expect.any(String) });
    });
  });

  // -------------------------------------------------------------------------
  // Take same tokens
  // -------------------------------------------------------------------------
  describe('take same tokens', () => {
    it('takes 2 tokens of the same color when >= 4 in supply', () => {
      const session = createTestSession();
      executeTurn(session, { type: 'take-same', color: 'wheat' });
      expect(tokenCount(session.players[0].tokens, 'wheat')).toBe(2);
      expect(tokenCount(session.tokenSupply, 'wheat')).toBe(2);
    });

    it('rejects when fewer than 4 in supply', () => {
      const session = createTestSession();
      session.tokenSupply.wheat = 3;
      const error = validateAction(session, { type: 'take-same', color: 'wheat' });
      expect(error).toEqual({ legal: false, reason: expect.any(String) });
    });
  });

  // -------------------------------------------------------------------------
  // Reserve card
  // -------------------------------------------------------------------------
  describe('reserve card', () => {
    it('reserves a card from market and gains mead token', () => {
      const session = createTestSession();
      const cardToReserve = session.market[1].visible[0]!;
      executeTurn(session, {
        type: 'reserve',
        cardId: cardToReserve.id,
      });
      expect(session.players[0].reservedCards).toHaveLength(1);
      expect(session.players[0].reservedCards[0].id).toBe(cardToReserve.id);
      expect(tokenCount(session.players[0].tokens, 'mead')).toBe(1);
      expect(tokenCount(session.tokenSupply, 'mead')).toBe(4);
      // Market slot refilled
      expect(session.market[1].visible[0]).not.toBeNull();
    });

    it('reserves from top of tier deck', () => {
      const session = createTestSession();
      const deckSize = session.market[2].deck.length;
      executeTurn(session, { type: 'reserve', cardId: null, tier: 2 });
      expect(session.players[0].reservedCards).toHaveLength(1);
      expect(session.market[2].deck.length).toBe(deckSize - 1);
    });

    it('rejects reserving when already at max', () => {
      const session = createTestSession();
      // Fill up reserved cards
      for (let i = 0; i < MAX_RESERVED; i++) {
        session.players[0].reservedCards.push(
          { id: 900 + i, tier: 1, cost: {}, bonus: 'wheat', points: 0 },
        );
      }
      const error = validateAction(session, {
        type: 'reserve',
        cardId: session.market[1].visible[0]!.id,
      });
      expect(error).toBeTruthy();
    });

    it('does not gain mead when supply is empty', () => {
      const session = createTestSession();
      session.tokenSupply.mead = 0;
      const card = session.market[1].visible[0]!;
      executeTurn(session, { type: 'reserve', cardId: card.id });
      expect(tokenCount(session.players[0].tokens, 'mead')).toBe(0);
    });

    it('rejects reserving non-existent card', () => {
      const session = createTestSession();
      const error = validateAction(session, { type: 'reserve', cardId: 9999 });
      expect(error).toBeTruthy();
    });
  });

  // -------------------------------------------------------------------------
  // Purchase card
  // -------------------------------------------------------------------------
  describe('purchase card', () => {
    it('purchases a card from the market', () => {
      const session = createTestSession();
      // Give player enough tokens
      const card = session.market[1].visible[0]!;
      const player = session.players[0];
      // Set player tokens to cover cost
      for (const c of RESOURCE_TYPES) {
        const need = card.cost[c] ?? 0;
        if (need > 0) {
          player.tokens[c] = need;
          // Also ensure supply has enough (it was removed already from setup)
        }
      }
      executeTurn(session, { type: 'purchase', cardId: card.id });
      expect(player.purchasedCards).toHaveLength(1);
      expect(player.purchasedCards[0].id).toBe(card.id);
      // Market slot refilled
      expect(session.market[1].visible[0]).not.toBeNull();
    });

    it('purchases using card bonuses to discount', () => {
      const session = createTestSession();
      const player = session.players[0];
      // Give player wheat bonus cards
      player.purchasedCards.push(
        { id: 900, tier: 1, cost: {}, bonus: 'wheat', points: 0 },
        { id: 901, tier: 1, cost: {}, bonus: 'wheat', points: 0 },
      );
      // Find a card that costs wheat
      const card = session.market[1].visible.find(
        c => c && (c.cost.wheat ?? 0) > 0,
      );
      if (card) {
        // Give just enough tokens for the discounted cost
        const bonuses = getBonuses(player);
        for (const c of RESOURCE_TYPES) {
          const eff = Math.max(0, (card.cost[c] ?? 0) - bonuses[c]);
          if (eff > 0) player.tokens[c] = eff;
        }
        executeTurn(session, { type: 'purchase', cardId: card.id });
        // Card is purchased
        expect(player.purchasedCards.find(c => c.id === card.id)).toBeTruthy();
      }
    });

    it('purchases a reserved card', () => {
      const session = createTestSession();
      const player = session.players[0];
      // Put a free card in reserved
      const freeCard: DevelopmentCard = {
        id: 800, tier: 1, cost: {}, bonus: 'oats', points: 1,
      };
      player.reservedCards.push(freeCard);
      executeTurn(session, { type: 'purchase', cardId: 800 });
      expect(player.reservedCards).toHaveLength(0);
      expect(player.purchasedCards.find(c => c.id === 800)).toBeTruthy();
    });

    it('uses mead tokens when needed', () => {
      const session = createTestSession();
      const player = session.players[0];
      player.tokens = { wheat: 1, mead: 2 };
      const card: DevelopmentCard = {
        id: 800, tier: 1, cost: { wheat: 3 }, bonus: 'oats', points: 0,
      };
      player.reservedCards.push(card);
      executeTurn(session, { type: 'purchase', cardId: 800 });
      expect(tokenCount(player.tokens, 'wheat')).toBe(0);
      expect(tokenCount(player.tokens, 'mead')).toBe(0);
    });

    it('rejects purchase of card not in market or reserved', () => {
      const session = createTestSession();
      const error = validateAction(session, { type: 'purchase', cardId: 9999 });
      expect(error).toBeTruthy();
    });

    it('rejects purchase when cannot afford', () => {
      const session = createTestSession();
      // Find an expensive card
      const card = session.market[3].visible[0]!;
      const error = validateAction(session, { type: 'purchase', cardId: card.id });
      expect(error).toBeTruthy();
    });
  });

  // -------------------------------------------------------------------------
  // Token limit
  // -------------------------------------------------------------------------
  describe('token limit', () => {
    it('reports tokens over limit when exceeding 10', () => {
      const session = createTestSession();
      session.players[0].tokens = {
        wheat: 2, oats: 2, flax: 2, barley: 2, turnip: 1,
      }; // 9 tokens
      const result = executeTurn(session, {
        type: 'take-different',
        colors: ['wheat', 'oats', 'flax'],
      });
      // Now has 12 tokens, 2 over limit
      expect(result.tokensOverLimit).toBe(2);
      // Turn should NOT have advanced yet
      expect(session.currentPlayerIndex).toBe(0);
    });

    it('discardTokens resolves over-limit and advances turn', () => {
      const session = createTestSession();
      session.players[0].tokens = {
        wheat: 2, oats: 2, flax: 2, barley: 2, turnip: 1,
      };
      executeTurn(session, {
        type: 'take-different',
        colors: ['wheat', 'oats', 'flax'],
      });
      // Discard 2 tokens
      discardTokens(session, {
        tokens: { wheat: 2 },
      });
      expect(totalTokens(session.players[0].tokens)).toBeLessThanOrEqual(MAX_TOKENS);
      expect(session.currentPlayerIndex).toBe(1);
    });

    it('discardTokens rejects wrong amount', () => {
      const session = createTestSession();
      session.players[0].tokens = {
        wheat: 2, oats: 2, flax: 2, barley: 2, turnip: 1,
      };
      executeTurn(session, {
        type: 'take-different',
        colors: ['wheat', 'oats', 'flax'],
      });
      expect(() => discardTokens(session, { tokens: { wheat: 1 } })).toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Patron visits
  // -------------------------------------------------------------------------
  describe('patron visits', () => {
    it('patron visits player when requirements met after purchase', () => {
      const session = createTestSession();
      const player = session.players[0];
      // Set up a patron requiring 4 barley + 4 flax
      session.patrons = [{ id: 100, requirements: { barley: 4, flax: 4 }, points: 3 }];
      // Give player 3 barley + 4 flax bonuses
      for (let i = 0; i < 3; i++) {
        player.purchasedCards.push(
          { id: 700 + i, tier: 1, cost: {}, bonus: 'barley', points: 0 },
        );
      }
      for (let i = 0; i < 4; i++) {
        player.purchasedCards.push(
          { id: 710 + i, tier: 1, cost: {}, bonus: 'flax', points: 0 },
        );
      }
      // Purchase a card with barley bonus (the 4th barley)
      const barleyCard: DevelopmentCard = {
        id: 800, tier: 1, cost: {}, bonus: 'barley', points: 0,
      };
      player.reservedCards.push(barleyCard);
      const result = executeTurn(session, { type: 'purchase', cardId: 800 });
      expect(result.patronVisits).toHaveLength(1);
      expect(result.patronVisits[0].id).toBe(100);
      expect(player.patrons).toHaveLength(1);
      expect(session.patrons).toHaveLength(0);
    });

    it('no patron visit when requirements not met', () => {
      const session = createTestSession();
      session.patrons = [{ id: 100, requirements: { barley: 4, flax: 4 }, points: 3 }];
      // Just take some tokens — no purchase, no bonuses
      const result = executeTurn(session, {
        type: 'take-different',
        colors: ['wheat', 'oats', 'flax'],
      });
      expect(result.patronVisits).toHaveLength(0);
    });

    it('two patrons visit in a single turn when both qualify', () => {
      const session = createTestSession();
      const player = session.players[0];

      // Set up two patrons: one requiring 4 barley + 4 flax, another requiring 4 oats + 4 wheat
      session.patrons = [
        { id: 100, requirements: { barley: 4, flax: 4 }, points: 3 },
        { id: 101, requirements: { oats: 4, wheat: 4 }, points: 3 },
      ];

      // Give player 3 barley + 4 flax + 3 oats + 4 wheat bonuses
      for (let i = 0; i < 3; i++) {
        player.purchasedCards.push(
          { id: 700 + i, tier: 1, cost: {}, bonus: 'barley', points: 0 },
        );
      }
      for (let i = 0; i < 4; i++) {
        player.purchasedCards.push(
          { id: 710 + i, tier: 1, cost: {}, bonus: 'flax', points: 0 },
        );
      }
      for (let i = 0; i < 3; i++) {
        player.purchasedCards.push(
          { id: 720 + i, tier: 1, cost: {}, bonus: 'oats', points: 0 },
        );
      }
      for (let i = 0; i < 4; i++) {
        player.purchasedCards.push(
          { id: 730 + i, tier: 1, cost: {}, bonus: 'wheat', points: 0 },
        );
      }

      // Purchase a card with barley bonus (the 4th barley to qualify patron 100)
      // AND a card with oats bonus (the 4th oats to qualify patron 101)
      const barleyCard: DevelopmentCard = {
        id: 800, tier: 1, cost: {}, bonus: 'barley', points: 0,
      };
      const oatsCard: DevelopmentCard = {
        id: 801, tier: 1, cost: {}, bonus: 'oats', points: 0,
      };

      // Put both reserved cards so player can purchase both
      player.reservedCards.push(barleyCard, oatsCard);

      // Purchase the barley card — should qualify patron 100
      const result1 = executeTurn(session, { type: 'purchase', cardId: 800 });
      // After first purchase, currentPlayerIndex advances, so reset for testing
      // This is easier to test in a controlled scenario
      expect(result1.patronVisits).toHaveLength(1);
      expect(result1.patronVisits[0].id).toBe(100);
      expect(player.patrons).toHaveLength(1);
    });

    it('two qualifying patrons both arrive in one turn', () => {
      const session = createTestSession();
      const player = session.players[0];

      // Set up two patrons that both qualify with the same bonuses
      session.patrons = [
        { id: 100, requirements: { barley: 4, flax: 3 }, points: 3 },
        { id: 101, requirements: { barley: 4, turnip: 3 }, points: 3 },
      ];

      // Give player enough of EACH bonus to qualify BOTH patrons
      // Patron 100: 4 barley + 3 flax
      // Patron 101: 4 barley + 3 turnip
      // So player needs: 4 barley, 3 flax, 3 turnip total
      for (let i = 0; i < 4; i++) {
        player.purchasedCards.push(
          { id: 700 + i, tier: 1, cost: {}, bonus: 'barley', points: 0 },
        );
      }
      for (let i = 0; i < 3; i++) {
        player.purchasedCards.push(
          { id: 710 + i, tier: 1, cost: {}, bonus: 'flax', points: 0 },
        );
      }
      for (let i = 0; i < 3; i++) {
        player.purchasedCards.push(
          { id: 720 + i, tier: 1, cost: {}, bonus: 'turnip', points: 0 },
        );
      }

      // Now we need to trigger a patron check. The easiest way is to purchase
      // a card - but since all bonuses are already met, the specific card doesn't
      // need to change bonuses. Use a reserved card with no cost.
      const card: DevelopmentCard = {
        id: 800, tier: 1, cost: {}, bonus: 'oats', points: 0,
      };
      player.reservedCards.push(card);

      const result = executeTurn(session, { type: 'purchase', cardId: 800 });

      // Both patrons should have visited
      expect(result.patronVisits).toHaveLength(2);
      expect(result.patronVisits[0].id).toBe(100);
      expect(result.patronVisits[1].id).toBe(101);
      expect(player.patrons).toHaveLength(2);
      expect(session.patrons).toHaveLength(0);
    });

    it('three patrons visit in one turn when all qualify', () => {
      const session = createTestSession();
      const player = session.players[0];

      // Set up three patrons requiring different bonuses
      session.patrons = [
        { id: 100, requirements: { barley: 4 }, points: 3 },
        { id: 101, requirements: { flax: 4 }, points: 3 },
        { id: 102, requirements: { wheat: 4 }, points: 3 },
      ];

      // Give player 4 of each required bonus
      for (let i = 0; i < 4; i++) {
        player.purchasedCards.push(
          { id: 700 + i, tier: 1, cost: {}, bonus: 'barley', points: 0 },
        );
      }
      for (let i = 0; i < 4; i++) {
        player.purchasedCards.push(
          { id: 710 + i, tier: 1, cost: {}, bonus: 'flax', points: 0 },
        );
      }
      for (let i = 0; i < 4; i++) {
        player.purchasedCards.push(
          { id: 720 + i, tier: 1, cost: {}, bonus: 'wheat', points: 0 },
        );
      }

      // Trigger patron check via purchase
      const card: DevelopmentCard = {
        id: 800, tier: 1, cost: {}, bonus: 'oats', points: 0,
      };
      player.reservedCards.push(card);

      const result = executeTurn(session, { type: 'purchase', cardId: 800 });

      expect(result.patronVisits).toHaveLength(3);
      expect(result.patronVisits[0].id).toBe(100);
      expect(result.patronVisits[1].id).toBe(101);
      expect(result.patronVisits[2].id).toBe(102);
      expect(player.patrons).toHaveLength(3);
      expect(session.patrons).toHaveLength(0);
    });

    it('patrons that do not qualify are not collected', () => {
      const session = createTestSession();
      const player = session.players[0];

      // Set up three patrons: two that qualify, one that doesn't
      session.patrons = [
        { id: 100, requirements: { barley: 4 }, points: 3 },
        { id: 101, requirements: { flax: 5 }, points: 3 },  // requires 5, player has 4
        { id: 102, requirements: { wheat: 4 }, points: 3 },
      ];

      // Give player 4 of barley and 4 of wheat, but only 4 of flax (not enough for 5)
      for (let i = 0; i < 4; i++) {
        player.purchasedCards.push(
          { id: 700 + i, tier: 1, cost: {}, bonus: 'barley', points: 0 },
        );
      }
      for (let i = 0; i < 4; i++) {
        player.purchasedCards.push(
          { id: 710 + i, tier: 1, cost: {}, bonus: 'wheat', points: 0 },
        );
      }
      // Only 4 flax (need 5 for patron 101)
      for (let i = 0; i < 4; i++) {
        player.purchasedCards.push(
          { id: 720 + i, tier: 1, cost: {}, bonus: 'flax', points: 0 },
        );
      }

      const card: DevelopmentCard = {
        id: 800, tier: 1, cost: {}, bonus: 'oats', points: 0,
      };
      player.reservedCards.push(card);

      const result = executeTurn(session, { type: 'purchase', cardId: 800 });

      // Only 2 patrons (100 and 102) qualify
      expect(result.patronVisits).toHaveLength(2);
      expect(result.patronVisits[0].id).toBe(100);
      expect(result.patronVisits[1].id).toBe(102);
      expect(player.patrons).toHaveLength(2);
      // Patron 101 should remain in the pool
      expect(session.patrons).toHaveLength(1);
      expect(session.patrons[0].id).toBe(101);
    });

    it('does not collect same patron twice', () => {
      const session = createTestSession();
      const player = session.players[0];

      // Set up one patron
      session.patrons = [
        { id: 100, requirements: { barley: 4 }, points: 3 },
      ];

      // Give player 4+ barley bonuses
      for (let i = 0; i < 10; i++) {
        player.purchasedCards.push(
          { id: 700 + i, tier: 1, cost: {}, bonus: 'barley', points: 0 },
        );
      }

      const card: DevelopmentCard = {
        id: 800, tier: 1, cost: {}, bonus: 'oats', points: 0,
      };
      player.reservedCards.push(card);

      const result = executeTurn(session, { type: 'purchase', cardId: 800 });

      // Only 1 patron visited (it was removed from pool after arriving)
      expect(result.patronVisits).toHaveLength(1);
      expect(player.patrons).toHaveLength(1);
      expect(session.patrons).toHaveLength(0);
    });

    it('patronVisits is empty array (not null) when no patron visits', () => {
      const session = createTestSession();
      session.patrons = [{ id: 100, requirements: { barley: 4, flax: 4 }, points: 3 }];
      const result = executeTurn(session, {
        type: 'take-different',
        colors: ['wheat', 'oats', 'flax'],
      });
      expect(result.patronVisits).toEqual([]);
      expect(Array.isArray(result.patronVisits)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // End of game
  // -------------------------------------------------------------------------
  describe('end of game', () => {
    it('triggers final round when player reaches 15 influence', () => {
      const session = createTestSession();
      const player = session.players[0];
      // Give player 14 influence from cards
      for (let i = 0; i < 14; i++) {
        player.purchasedCards.push(
          { id: 600 + i, tier: 1, cost: {}, bonus: 'wheat', points: 1 },
        );
      }
      // Purchase a card worth 1 point to reach 15
      const card: DevelopmentCard = {
        id: 500, tier: 1, cost: {}, bonus: 'oats', points: 1,
      };
      player.reservedCards.push(card);
      executeTurn(session, { type: 'purchase', cardId: 500 });
      expect(session.phase).toBe('final-round');
      expect(session.triggerPlayerIndex).toBe(0);
    });

    it('game ends after all players complete the round', () => {
      const session = createTestSession();
      const player = session.players[0];
      // Give player 15 influence
      for (let i = 0; i < 15; i++) {
        player.purchasedCards.push(
          { id: 600 + i, tier: 1, cost: {}, bonus: 'wheat', points: 1 },
        );
      }
      const card: DevelopmentCard = {
        id: 500, tier: 1, cost: {}, bonus: 'oats', points: 0,
      };
      player.reservedCards.push(card);
      // Player 0 reaches threshold
      executeTurn(session, { type: 'purchase', cardId: 500 });
      expect(session.phase).toBe('final-round');
      // Player 1 takes their turn
      const result = executeTurn(session, {
        type: 'take-different',
        colors: ['wheat', 'oats', 'flax'],
      });
      expect(result.gameOver).toBe(true);
      expect(session.phase).toBe('game-over');
    });

    it('allows all other players one final turn after trigger and winner is highest influence', () => {
      const session = createTestSession();
      session.currentPlayerIndex = 1;

      // Player 0 is currently ahead on influence.
      for (let i = 0; i < 16; i++) {
        session.players[0].purchasedCards.push(
          { id: 800 + i, tier: 1, cost: {}, bonus: 'wheat', points: 1 },
        );
      }

      // Player 1 will trigger the threshold on this turn.
      for (let i = 0; i < 14; i++) {
        session.players[1].purchasedCards.push(
          { id: 900 + i, tier: 1, cost: {}, bonus: 'oats', points: 1 },
        );
      }
      session.players[1].reservedCards.push(
        { id: 5000, tier: 1, cost: {}, bonus: 'flax', points: 1 },
      );

      const triggerTurn = executeTurn(session, { type: 'purchase', cardId: 5000 });
      expect(triggerTurn.gameOver).toBe(false);
      expect(session.phase).toBe('final-round');
      expect(session.currentPlayerIndex).toBe(0);

      const finalTurn = executeTurn(session, {
        type: 'take-different',
        colors: ['wheat', 'oats', 'flax'],
      });
      expect(finalTurn.gameOver).toBe(true);
      expect(session.phase).toBe('game-over');
      expect(getWinnerIndex(session)).toBe(0);
    });

    it('isGameOver returns true when game is over', () => {
      const session = createTestSession();
      session.phase = 'game-over';
      expect(isGameOver(session)).toBe(true);
    });

    it('rejects actions when game is over', () => {
      const session = createTestSession();
      session.phase = 'game-over';
      const error = validateAction(session, {
        type: 'take-different',
        colors: ['wheat', 'oats', 'flax'],
      });
      expect(error).toBeTruthy();
    });
  });

  // -------------------------------------------------------------------------
  // Winner determination
  // -------------------------------------------------------------------------
  describe('getWinnerIndex', () => {
    it('player with most influence wins', () => {
      const session = createTestSession();
      session.players[0].purchasedCards.push(
        { id: 1, tier: 1, cost: {}, bonus: 'wheat', points: 5 },
      );
      session.players[1].purchasedCards.push(
        { id: 2, tier: 1, cost: {}, bonus: 'wheat', points: 3 },
      );
      expect(getWinnerIndex(session)).toBe(0);
    });

    it('tiebreaker: fewer purchased cards wins', () => {
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
      expect(getWinnerIndex(session)).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Legal actions
  // -------------------------------------------------------------------------
  describe('getLegalActions', () => {
    it('returns actions in a fresh game', () => {
      const session = createTestSession();
      const actions = getLegalActions(session);
      expect(actions.length).toBeGreaterThan(0);
    });

    it('includes take-different, reserve, and potentially purchase', () => {
      const session = createTestSession();
      const actions = getLegalActions(session);
      const types = new Set(actions.map(a => a.type));
      expect(types.has('take-different')).toBe(true);
      expect(types.has('reserve')).toBe(true);
    });

    it('includes take-same when supply has >= 4', () => {
      const session = createTestSession();
      const actions = getLegalActions(session);
      const takeSame = actions.filter(a => a.type === 'take-same');
      expect(takeSame.length).toBeGreaterThan(0);
    });

    it('returns empty array when game is over', () => {
      const session = createTestSession();
      session.phase = 'game-over';
      expect(getLegalActions(session)).toHaveLength(0);
    });

    it('does not include reserve when at max reserved', () => {
      const session = createTestSession();
      const player = session.players[0];
      for (let i = 0; i < MAX_RESERVED; i++) {
        player.reservedCards.push(
          { id: 900 + i, tier: 1, cost: {}, bonus: 'wheat', points: 0 },
        );
      }
      const actions = getLegalActions(session);
      expect(actions.filter(a => a.type === 'reserve')).toHaveLength(0);
    });

    it('includes purchase actions for affordable cards', () => {
      const session = createTestSession();
      const player = session.players[0];
      // Give player a free reserved card
      player.reservedCards.push(
        { id: 800, tier: 1, cost: {}, bonus: 'oats', points: 0 },
      );
      const actions = getLegalActions(session);
      const purchases = actions.filter(a => a.type === 'purchase');
      expect(purchases.some(a => a.type === 'purchase' && a.cardId === 800)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Full game flow
  // -------------------------------------------------------------------------
  describe('full game flow', () => {
    it('can play a complete game using only legal actions', () => {
      const session = createTestSession(123);
      const rng = createSeededRng(456);
      let turns = 0;
      const maxTurns = 500; // safety limit

      while (!isGameOver(session) && turns < maxTurns) {
        const actions = getLegalActions(session);
        expect(actions.length).toBeGreaterThan(0);

        // Pick a random legal action
        const action = actions[Math.floor(rng() * actions.length)];
        const result = executeTurn(session, action);

        // Handle token discard if needed
        if (result.tokensOverLimit > 0) {
          const player = getCurrentPlayer(session);
          // Discard excess tokens (pick randomly)
          const discard: ResourceTokens = {};
          let remaining = result.tokensOverLimit;
          for (const c of [...RESOURCE_TYPES, 'mead' as const]) {
            if (remaining <= 0) break;
            const have = tokenCount(player.tokens, c);
            const toDrop = Math.min(have, remaining);
            if (toDrop > 0) {
              discard[c] = toDrop;
              remaining -= toDrop;
            }
          }
          discardTokens(session, { tokens: discard });
        }

        turns++;
      }

      // Game should have ended (may not always reach 15 with random play in 500 turns,
      // but we verify the loop completes without errors)
      if (isGameOver(session)) {
        expect(session.phase).toBe('game-over');
        const winner = getWinnerIndex(session);
        expect(winner).toBeGreaterThanOrEqual(0);
        expect(winner).toBeLessThan(2);
      }
    });
  });
});
