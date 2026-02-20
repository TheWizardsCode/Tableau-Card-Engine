import { describe, it, expect } from 'vitest';
import {
  setupSplendorGame,
  getCurrentPlayer,
  getPrestige,
  getBonuses,
  effectiveCost,
  canAfford,
  nobleQualifies,
  getLegalActions,
  isGameOver,
  getWinnerIndex,
  executeTurn,
  discardTokens,
  validateAction,
  type SplendorSession,
  type SplendorPlayerState,
} from '../../example-games/splendor/SplendorGame';
import {
  type DevelopmentCard,
  type NobleTile,
  type GemTokens,
  tokenCount,
  totalTokens,
  GEM_COLORS,
  MAX_TOKENS,
  MAX_RESERVED,
  MARKET_SIZE,
} from '../../example-games/splendor/SplendorCards';

// ---------------------------------------------------------------------------
// Deterministic RNG
// ---------------------------------------------------------------------------
function makeRng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

function createTestSession(seed = 42): SplendorSession {
  return setupSplendorGame({
    playerCount: 2,
    playerNames: ['Alice', 'Bot'],
    isAI: [false, true],
    rng: makeRng(seed),
  });
}

describe('SplendorGame', () => {
  // -------------------------------------------------------------------------
  // Setup
  // -------------------------------------------------------------------------
  describe('setupSplendorGame', () => {
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
        expect(p.nobles).toHaveLength(0);
      }
    });

    it('sets up 3 noble tiles for 2 players', () => {
      const session = createTestSession();
      expect(session.nobles).toHaveLength(3);
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

    it('sets up token supply for 2 players (4 each gem + 5 gold)', () => {
      const session = createTestSession();
      for (const c of GEM_COLORS) {
        expect(tokenCount(session.tokenSupply, c)).toBe(4);
      }
      expect(tokenCount(session.tokenSupply, 'gold')).toBe(5);
    });

    it('starts in playing phase with player 0', () => {
      const session = createTestSession();
      expect(session.phase).toBe('playing');
      expect(session.currentPlayerIndex).toBe(0);
      expect(session.triggerPlayerIndex).toBe(-1);
    });

    it('throws for invalid player count', () => {
      expect(() => setupSplendorGame({ playerCount: 1 })).toThrow();
      expect(() => setupSplendorGame({ playerCount: 5 })).toThrow();
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

    it('getPrestige returns 0 for a fresh player', () => {
      const session = createTestSession();
      expect(getPrestige(session.players[0])).toBe(0);
    });

    it('getPrestige sums card points and noble points', () => {
      const session = createTestSession();
      const player = session.players[0];
      player.purchasedCards.push(
        { id: 999, tier: 1, cost: {}, bonus: 'ruby', points: 2 },
        { id: 998, tier: 2, cost: {}, bonus: 'emerald', points: 3 },
      );
      player.nobles.push({ id: 100, requirements: {}, points: 3 });
      expect(getPrestige(player)).toBe(8);
    });

    it('getBonuses counts purchased card bonuses', () => {
      const session = createTestSession();
      const player = session.players[0];
      player.purchasedCards.push(
        { id: 999, tier: 1, cost: {}, bonus: 'ruby', points: 0 },
        { id: 998, tier: 1, cost: {}, bonus: 'ruby', points: 0 },
        { id: 997, tier: 1, cost: {}, bonus: 'emerald', points: 0 },
      );
      const bonuses = getBonuses(player);
      expect(bonuses.ruby).toBe(2);
      expect(bonuses.emerald).toBe(1);
      expect(bonuses.sapphire).toBe(0);
    });

    it('effectiveCost subtracts bonuses from cost', () => {
      const cost = { ruby: 3, emerald: 2, sapphire: 1 };
      const bonuses = { ruby: 1, emerald: 2, sapphire: 0, diamond: 0, onyx: 0 };
      const eff = effectiveCost(cost, bonuses);
      expect(eff.ruby).toBe(2);
      expect(eff.emerald).toBeUndefined();
      expect(eff.sapphire).toBe(1);
    });

    it('canAfford returns true when player has enough tokens + bonuses', () => {
      const player: SplendorPlayerState = {
        name: 'Test',
        isAI: false,
        tokens: { ruby: 2, sapphire: 1 },
        purchasedCards: [
          { id: 999, tier: 1, cost: {}, bonus: 'ruby', points: 0 },
        ],
        reservedCards: [],
        nobles: [],
      };
      const card: DevelopmentCard = {
        id: 100, tier: 1, cost: { ruby: 3, sapphire: 1 }, bonus: 'emerald', points: 0,
      };
      expect(canAfford(player, card)).toBe(true);
    });

    it('canAfford uses gold as wild', () => {
      const player: SplendorPlayerState = {
        name: 'Test',
        isAI: false,
        tokens: { ruby: 1, gold: 2 },
        purchasedCards: [],
        reservedCards: [],
        nobles: [],
      };
      const card: DevelopmentCard = {
        id: 100, tier: 1, cost: { ruby: 3 }, bonus: 'emerald', points: 0,
      };
      expect(canAfford(player, card)).toBe(true);
    });

    it('canAfford returns false when insufficient', () => {
      const player: SplendorPlayerState = {
        name: 'Test',
        isAI: false,
        tokens: { ruby: 1 },
        purchasedCards: [],
        reservedCards: [],
        nobles: [],
      };
      const card: DevelopmentCard = {
        id: 100, tier: 1, cost: { ruby: 3 }, bonus: 'emerald', points: 0,
      };
      expect(canAfford(player, card)).toBe(false);
    });

    it('nobleQualifies checks bonus requirements', () => {
      const player: SplendorPlayerState = {
        name: 'Test',
        isAI: false,
        tokens: {},
        purchasedCards: [
          { id: 1, tier: 1, cost: {}, bonus: 'diamond', points: 0 },
          { id: 2, tier: 1, cost: {}, bonus: 'diamond', points: 0 },
          { id: 3, tier: 1, cost: {}, bonus: 'diamond', points: 0 },
          { id: 4, tier: 1, cost: {}, bonus: 'diamond', points: 0 },
          { id: 5, tier: 1, cost: {}, bonus: 'sapphire', points: 0 },
          { id: 6, tier: 1, cost: {}, bonus: 'sapphire', points: 0 },
          { id: 7, tier: 1, cost: {}, bonus: 'sapphire', points: 0 },
          { id: 8, tier: 1, cost: {}, bonus: 'sapphire', points: 0 },
        ],
        reservedCards: [],
        nobles: [],
      };
      const noble: NobleTile = { id: 1, requirements: { diamond: 4, sapphire: 4 }, points: 3 };
      expect(nobleQualifies(player, noble)).toBe(true);
    });

    it('nobleQualifies returns false when requirements not met', () => {
      const player: SplendorPlayerState = {
        name: 'Test',
        isAI: false,
        tokens: {},
        purchasedCards: [
          { id: 1, tier: 1, cost: {}, bonus: 'diamond', points: 0 },
          { id: 2, tier: 1, cost: {}, bonus: 'diamond', points: 0 },
        ],
        reservedCards: [],
        nobles: [],
      };
      const noble: NobleTile = { id: 1, requirements: { diamond: 4, sapphire: 4 }, points: 3 };
      expect(nobleQualifies(player, noble)).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Take different tokens
  // -------------------------------------------------------------------------
  describe('take different tokens', () => {
    it('takes 3 different gem tokens', () => {
      const session = createTestSession();
      const result = executeTurn(session, {
        type: 'take-different',
        colors: ['ruby', 'emerald', 'sapphire'],
      });
      expect(result.tokensOverLimit).toBe(0);
      // Player got tokens
      expect(tokenCount(session.players[0].tokens, 'ruby')).toBe(1);
      expect(tokenCount(session.players[0].tokens, 'emerald')).toBe(1);
      expect(tokenCount(session.players[0].tokens, 'sapphire')).toBe(1);
      // Supply decreased
      expect(tokenCount(session.tokenSupply, 'ruby')).toBe(3);
      // Turn advanced
      expect(session.currentPlayerIndex).toBe(1);
    });

    it('rejects taking 4 tokens', () => {
      const session = createTestSession();
      const error = validateAction(session, {
        type: 'take-different',
        colors: ['ruby', 'emerald', 'sapphire', 'diamond'] as any,
      });
      expect(error).toBeTruthy();
    });

    it('rejects duplicate colors', () => {
      const session = createTestSession();
      const error = validateAction(session, {
        type: 'take-different',
        colors: ['ruby', 'ruby', 'emerald'],
      });
      expect(error).toBeTruthy();
    });

    it('rejects taking fewer than 3 when 3+ colors available', () => {
      const session = createTestSession();
      const error = validateAction(session, {
        type: 'take-different',
        colors: ['ruby', 'emerald'],
      });
      expect(error).toBeTruthy();
    });

    it('allows fewer than 3 when supply is limited', () => {
      const session = createTestSession();
      // Empty all but 2 colors
      session.tokenSupply.ruby = 0;
      session.tokenSupply.diamond = 0;
      session.tokenSupply.onyx = 0;
      const error = validateAction(session, {
        type: 'take-different',
        colors: ['emerald', 'sapphire'],
      });
      expect(error).toBeNull();
    });

    it('rejects taking from empty supply color', () => {
      const session = createTestSession();
      session.tokenSupply.ruby = 0;
      session.tokenSupply.diamond = 0;
      session.tokenSupply.onyx = 0;
      const error = validateAction(session, {
        type: 'take-different',
        colors: ['emerald', 'ruby'],
      });
      expect(error).toBeTruthy();
    });
  });

  // -------------------------------------------------------------------------
  // Take same tokens
  // -------------------------------------------------------------------------
  describe('take same tokens', () => {
    it('takes 2 tokens of the same color when >= 4 in supply', () => {
      const session = createTestSession();
      executeTurn(session, { type: 'take-same', color: 'ruby' });
      expect(tokenCount(session.players[0].tokens, 'ruby')).toBe(2);
      expect(tokenCount(session.tokenSupply, 'ruby')).toBe(2);
    });

    it('rejects when fewer than 4 in supply', () => {
      const session = createTestSession();
      session.tokenSupply.ruby = 3;
      const error = validateAction(session, { type: 'take-same', color: 'ruby' });
      expect(error).toBeTruthy();
    });
  });

  // -------------------------------------------------------------------------
  // Reserve card
  // -------------------------------------------------------------------------
  describe('reserve card', () => {
    it('reserves a card from market and gains gold token', () => {
      const session = createTestSession();
      const cardToReserve = session.market[1].visible[0]!;
      executeTurn(session, {
        type: 'reserve',
        cardId: cardToReserve.id,
      });
      expect(session.players[0].reservedCards).toHaveLength(1);
      expect(session.players[0].reservedCards[0].id).toBe(cardToReserve.id);
      expect(tokenCount(session.players[0].tokens, 'gold')).toBe(1);
      expect(tokenCount(session.tokenSupply, 'gold')).toBe(4);
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
          { id: 900 + i, tier: 1, cost: {}, bonus: 'ruby', points: 0 },
        );
      }
      const error = validateAction(session, {
        type: 'reserve',
        cardId: session.market[1].visible[0]!.id,
      });
      expect(error).toBeTruthy();
    });

    it('does not gain gold when supply is empty', () => {
      const session = createTestSession();
      session.tokenSupply.gold = 0;
      const card = session.market[1].visible[0]!;
      executeTurn(session, { type: 'reserve', cardId: card.id });
      expect(tokenCount(session.players[0].tokens, 'gold')).toBe(0);
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
      for (const c of GEM_COLORS) {
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
      // Give player ruby bonus cards
      player.purchasedCards.push(
        { id: 900, tier: 1, cost: {}, bonus: 'ruby', points: 0 },
        { id: 901, tier: 1, cost: {}, bonus: 'ruby', points: 0 },
      );
      // Find a card that costs ruby
      const card = session.market[1].visible.find(
        c => c && (c.cost.ruby ?? 0) > 0,
      );
      if (card) {
        // Give just enough tokens for the discounted cost
        const bonuses = getBonuses(player);
        for (const c of GEM_COLORS) {
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
        id: 800, tier: 1, cost: {}, bonus: 'emerald', points: 1,
      };
      player.reservedCards.push(freeCard);
      executeTurn(session, { type: 'purchase', cardId: 800 });
      expect(player.reservedCards).toHaveLength(0);
      expect(player.purchasedCards.find(c => c.id === 800)).toBeTruthy();
    });

    it('uses gold tokens when needed', () => {
      const session = createTestSession();
      const player = session.players[0];
      player.tokens = { ruby: 1, gold: 2 };
      const card: DevelopmentCard = {
        id: 800, tier: 1, cost: { ruby: 3 }, bonus: 'emerald', points: 0,
      };
      player.reservedCards.push(card);
      executeTurn(session, { type: 'purchase', cardId: 800 });
      expect(tokenCount(player.tokens, 'ruby')).toBe(0);
      expect(tokenCount(player.tokens, 'gold')).toBe(0);
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
        ruby: 2, emerald: 2, sapphire: 2, diamond: 2, onyx: 1,
      }; // 9 tokens
      const result = executeTurn(session, {
        type: 'take-different',
        colors: ['ruby', 'emerald', 'sapphire'],
      });
      // Now has 12 tokens, 2 over limit
      expect(result.tokensOverLimit).toBe(2);
      // Turn should NOT have advanced yet
      expect(session.currentPlayerIndex).toBe(0);
    });

    it('discardTokens resolves over-limit and advances turn', () => {
      const session = createTestSession();
      session.players[0].tokens = {
        ruby: 2, emerald: 2, sapphire: 2, diamond: 2, onyx: 1,
      };
      executeTurn(session, {
        type: 'take-different',
        colors: ['ruby', 'emerald', 'sapphire'],
      });
      // Discard 2 tokens
      discardTokens(session, {
        tokens: { ruby: 2 },
      });
      expect(totalTokens(session.players[0].tokens)).toBeLessThanOrEqual(MAX_TOKENS);
      expect(session.currentPlayerIndex).toBe(1);
    });

    it('discardTokens rejects wrong amount', () => {
      const session = createTestSession();
      session.players[0].tokens = {
        ruby: 2, emerald: 2, sapphire: 2, diamond: 2, onyx: 1,
      };
      executeTurn(session, {
        type: 'take-different',
        colors: ['ruby', 'emerald', 'sapphire'],
      });
      expect(() => discardTokens(session, { tokens: { ruby: 1 } })).toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Noble visits
  // -------------------------------------------------------------------------
  describe('noble visits', () => {
    it('noble visits player when requirements met after purchase', () => {
      const session = createTestSession();
      const player = session.players[0];
      // Set up a noble requiring 4 diamond + 4 sapphire
      session.nobles = [{ id: 100, requirements: { diamond: 4, sapphire: 4 }, points: 3 }];
      // Give player 3 diamond + 4 sapphire bonuses
      for (let i = 0; i < 3; i++) {
        player.purchasedCards.push(
          { id: 700 + i, tier: 1, cost: {}, bonus: 'diamond', points: 0 },
        );
      }
      for (let i = 0; i < 4; i++) {
        player.purchasedCards.push(
          { id: 710 + i, tier: 1, cost: {}, bonus: 'sapphire', points: 0 },
        );
      }
      // Purchase a card with diamond bonus (the 4th diamond)
      const diamondCard: DevelopmentCard = {
        id: 800, tier: 1, cost: {}, bonus: 'diamond', points: 0,
      };
      player.reservedCards.push(diamondCard);
      const result = executeTurn(session, { type: 'purchase', cardId: 800 });
      expect(result.nobleVisit).not.toBeNull();
      expect(result.nobleVisit!.id).toBe(100);
      expect(player.nobles).toHaveLength(1);
      expect(session.nobles).toHaveLength(0);
    });

    it('no noble visit when requirements not met', () => {
      const session = createTestSession();
      session.nobles = [{ id: 100, requirements: { diamond: 4, sapphire: 4 }, points: 3 }];
      // Just take some tokens — no purchase, no bonuses
      const result = executeTurn(session, {
        type: 'take-different',
        colors: ['ruby', 'emerald', 'sapphire'],
      });
      expect(result.nobleVisit).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // End of game
  // -------------------------------------------------------------------------
  describe('end of game', () => {
    it('triggers final round when player reaches 15 prestige', () => {
      const session = createTestSession();
      const player = session.players[0];
      // Give player 14 prestige from cards
      for (let i = 0; i < 14; i++) {
        player.purchasedCards.push(
          { id: 600 + i, tier: 1, cost: {}, bonus: 'ruby', points: 1 },
        );
      }
      // Purchase a card worth 1 point to reach 15
      const card: DevelopmentCard = {
        id: 500, tier: 1, cost: {}, bonus: 'emerald', points: 1,
      };
      player.reservedCards.push(card);
      executeTurn(session, { type: 'purchase', cardId: 500 });
      expect(session.phase).toBe('final-round');
      expect(session.triggerPlayerIndex).toBe(0);
    });

    it('game ends after all players complete the round', () => {
      const session = createTestSession();
      const player = session.players[0];
      // Give player 15 prestige
      for (let i = 0; i < 15; i++) {
        player.purchasedCards.push(
          { id: 600 + i, tier: 1, cost: {}, bonus: 'ruby', points: 1 },
        );
      }
      const card: DevelopmentCard = {
        id: 500, tier: 1, cost: {}, bonus: 'emerald', points: 0,
      };
      player.reservedCards.push(card);
      // Player 0 reaches threshold
      executeTurn(session, { type: 'purchase', cardId: 500 });
      expect(session.phase).toBe('final-round');
      // Player 1 takes their turn
      const result = executeTurn(session, {
        type: 'take-different',
        colors: ['ruby', 'emerald', 'sapphire'],
      });
      expect(result.gameOver).toBe(true);
      expect(session.phase).toBe('game-over');
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
        colors: ['ruby', 'emerald', 'sapphire'],
      });
      expect(error).toBeTruthy();
    });
  });

  // -------------------------------------------------------------------------
  // Winner determination
  // -------------------------------------------------------------------------
  describe('getWinnerIndex', () => {
    it('player with most prestige wins', () => {
      const session = createTestSession();
      session.players[0].purchasedCards.push(
        { id: 1, tier: 1, cost: {}, bonus: 'ruby', points: 5 },
      );
      session.players[1].purchasedCards.push(
        { id: 2, tier: 1, cost: {}, bonus: 'ruby', points: 3 },
      );
      expect(getWinnerIndex(session)).toBe(0);
    });

    it('tiebreaker: fewer purchased cards wins', () => {
      const session = createTestSession();
      // Both have 5 prestige
      session.players[0].purchasedCards.push(
        { id: 1, tier: 1, cost: {}, bonus: 'ruby', points: 5 },
      );
      session.players[1].purchasedCards.push(
        { id: 2, tier: 1, cost: {}, bonus: 'ruby', points: 3 },
        { id: 3, tier: 1, cost: {}, bonus: 'ruby', points: 2 },
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
          { id: 900 + i, tier: 1, cost: {}, bonus: 'ruby', points: 0 },
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
        { id: 800, tier: 1, cost: {}, bonus: 'emerald', points: 0 },
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
      const rng = makeRng(456);
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
          const discard: GemTokens = {};
          let remaining = result.tokensOverLimit;
          for (const c of [...GEM_COLORS, 'gold' as const]) {
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
