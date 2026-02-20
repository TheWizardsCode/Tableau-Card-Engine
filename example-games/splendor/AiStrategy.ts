/**
 * AiStrategy.ts
 *
 * AI opponent strategies for Splendor.
 * All strategies operate on pure game state — no Phaser dependency.
 */

import {
  type GemColor,
  type GemTokens,
  GEM_COLORS,
  ALL_TOKEN_COLORS,
  tokenCount,
} from './SplendorCards';
import {
  type SplendorSession,
  type SplendorPlayerState,
  type TurnAction,
  type TokenDiscard,
  getLegalActions,
  getBonuses,
  effectiveCost,
  getAvailableCards,
} from './SplendorGame';

// ---------------------------------------------------------------------------
// Strategy interface
// ---------------------------------------------------------------------------

export interface SplendorAiStrategy {
  readonly name: string;
  chooseTurn(session: SplendorSession, playerIndex: number, rng: () => number): TurnAction;
  chooseDiscard(
    session: SplendorSession,
    playerIndex: number,
    excess: number,
    rng: () => number,
  ): TokenDiscard;
}

// ---------------------------------------------------------------------------
// Random strategy — picks any legal action at random
// ---------------------------------------------------------------------------

export const RandomStrategy: SplendorAiStrategy = {
  name: 'Random',

  chooseTurn(session, _playerIndex, rng) {
    const actions = getLegalActions(session);
    if (actions.length === 0) {
      throw new Error('No legal actions available');
    }
    return actions[Math.floor(rng() * actions.length)];
  },

  chooseDiscard(session, playerIndex, excess, rng) {
    const player = session.players[playerIndex];
    return buildRandomDiscard(player, excess, rng);
  },
};

// ---------------------------------------------------------------------------
// Greedy strategy — prioritizes purchasing high-value cards
// ---------------------------------------------------------------------------

export const GreedyStrategy: SplendorAiStrategy = {
  name: 'Greedy',

  chooseTurn(session, playerIndex, rng) {
    const player = session.players[playerIndex];
    const actions = getLegalActions(session);
    if (actions.length === 0) {
      throw new Error('No legal actions available');
    }

    // Priority 1: Purchase the highest-value affordable card
    const purchases = actions.filter(a => a.type === 'purchase');
    if (purchases.length > 0) {
      // Score each purchasable card
      const scored = purchases.map(a => {
        const card = getAvailableCards(session, playerIndex).find(
          c => c.id === (a as { cardId: number }).cardId,
        )!;
        // Prefer high points, then noble-progress bonus
        const nobleBonus = scoreNobleProgress(session, player, card.bonus);
        return { action: a, score: card.points * 10 + nobleBonus + card.tier };
      });
      scored.sort((a, b) => b.score - a.score);
      return scored[0].action;
    }

    // Priority 2: Reserve a high-value card if close to affording it
    const reserves = actions.filter(a => a.type === 'reserve');
    if (reserves.length > 0 && player.reservedCards.length < 2) {
      // Find the best card to reserve (high points, closest to afford)
      const bonuses = getBonuses(player);
      let bestReserve: TurnAction | null = null;
      let bestScore = -1;

      for (const action of reserves) {
        if (action.type !== 'reserve' || action.cardId === null) continue;
        const card = getAvailableCards(session, playerIndex).find(
          c => c.id === action.cardId,
        );
        if (!card || card.points < 2) continue;

        const eff = effectiveCost(card.cost, bonuses);
        let totalNeeded = 0;
        for (const c of GEM_COLORS) {
          totalNeeded += Math.max(0, (eff[c] ?? 0) - tokenCount(player.tokens, c));
        }
        const score = card.points * 10 - totalNeeded;
        if (score > bestScore) {
          bestScore = score;
          bestReserve = action;
        }
      }

      if (bestReserve && bestScore > 5) {
        return bestReserve;
      }
    }

    // Priority 3: Take tokens that help toward the best affordable card
    const tokenActions = actions.filter(
      a => a.type === 'take-different' || a.type === 'take-same',
    );

    if (tokenActions.length > 0) {
      // Find the best card to work toward (highest points among almost-affordable)
      const bonuses = getBonuses(player);
      const allCards = getAvailableCards(session, playerIndex);
      let targetCard = allCards[0];
      let bestValue = -Infinity;

      for (const card of allCards) {
        const eff = effectiveCost(card.cost, bonuses);
        let shortfall = 0;
        for (const c of GEM_COLORS) {
          shortfall += Math.max(0, (eff[c] ?? 0) - tokenCount(player.tokens, c));
        }
        const value = card.points * 10 - shortfall;
        if (value > bestValue) {
          bestValue = value;
          targetCard = card;
        }
      }

      // Score token actions by how much they help toward the target
      const targetEff = effectiveCost(targetCard.cost, bonuses);
      let bestAction = tokenActions[0];
      let bestActionScore = -Infinity;

      for (const action of tokenActions) {
        let score = 0;
        if (action.type === 'take-different') {
          for (const c of action.colors) {
            const need = (targetEff[c] ?? 0) - tokenCount(player.tokens, c);
            if (need > 0) score += 2;
            else score += 0.5; // still some value in diversifying
          }
        } else if (action.type === 'take-same') {
          const need = (targetEff[action.color] ?? 0) - tokenCount(player.tokens, action.color);
          score = need >= 2 ? 4 : need === 1 ? 2 : 1;
        }
        if (score > bestActionScore) {
          bestActionScore = score;
          bestAction = action;
        }
      }

      return bestAction;
    }

    // Fallback: random action
    return actions[Math.floor(rng() * actions.length)];
  },

  chooseDiscard(session, playerIndex, excess, _rng) {
    const player = session.players[playerIndex];
    return buildSmartDiscard(session, player, playerIndex, excess);
  },
};

// ---------------------------------------------------------------------------
// AI Player class
// ---------------------------------------------------------------------------

export class SplendorAiPlayer {
  constructor(
    private strategy: SplendorAiStrategy = GreedyStrategy,
    private rng: () => number = Math.random,
  ) {}

  chooseTurn(session: SplendorSession, playerIndex: number): TurnAction {
    return this.strategy.chooseTurn(session, playerIndex, this.rng);
  }

  chooseDiscard(
    session: SplendorSession,
    playerIndex: number,
    excess: number,
  ): TokenDiscard {
    return this.strategy.chooseDiscard(session, playerIndex, excess, this.rng);
  }

  get strategyName(): string {
    return this.strategy.name;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Score how much a bonus color helps toward visiting a noble. */
function scoreNobleProgress(
  session: SplendorSession,
  player: SplendorPlayerState,
  bonusColor: GemColor,
): number {
  const bonuses = getBonuses(player);
  let bestScore = 0;
  for (const noble of session.nobles) {
    const req = noble.requirements[bonusColor] ?? 0;
    const have = bonuses[bonusColor];
    if (req > 0 && have < req) {
      // This bonus brings us closer to this noble
      let totalProgress = 0;
      let totalReq = 0;
      for (const c of GEM_COLORS) {
        const r = noble.requirements[c] ?? 0;
        totalReq += r;
        totalProgress += Math.min(bonuses[c] + (c === bonusColor ? 1 : 0), r);
      }
      const progressRatio = totalReq > 0 ? totalProgress / totalReq : 0;
      bestScore = Math.max(bestScore, progressRatio * 3);
    }
  }
  return bestScore;
}

/** Build a random token discard. */
function buildRandomDiscard(
  player: SplendorPlayerState,
  excess: number,
  rng: () => number,
): TokenDiscard {
  const tokens: GemTokens = {};
  let remaining = excess;
  const colors = [...ALL_TOKEN_COLORS].filter(c => tokenCount(player.tokens, c) > 0);

  while (remaining > 0 && colors.length > 0) {
    const idx = Math.floor(rng() * colors.length);
    const c = colors[idx];
    const available = tokenCount(player.tokens, c) - (tokenCount(tokens, c));
    if (available > 0) {
      tokens[c] = (tokens[c] ?? 0) + 1;
      remaining--;
    }
    if (tokenCount(player.tokens, c) - (tokens[c] ?? 0) <= 0) {
      colors.splice(idx, 1);
    }
  }

  return { tokens };
}

/** Build a smart discard — drop tokens least useful toward target cards. */
function buildSmartDiscard(
  session: SplendorSession,
  player: SplendorPlayerState,
  playerIndex: number,
  excess: number,
): TokenDiscard {
  const bonuses = getBonuses(player);
  const allCards = getAvailableCards(session, playerIndex);

  // Calculate usefulness of each color
  const usefulness: Record<string, number> = {};
  for (const c of ALL_TOKEN_COLORS) {
    usefulness[c] = 0;
  }

  for (const card of allCards) {
    const eff = effectiveCost(card.cost, bonuses);
    for (const c of GEM_COLORS) {
      const need = (eff[c] ?? 0) - tokenCount(player.tokens, c);
      if (need < 0) {
        // We have more than needed — this color is less useful per excess token
        usefulness[c] += card.points;
      } else {
        usefulness[c] += card.points * 2;
      }
    }
  }
  // Gold is always useful
  usefulness.gold = 100;

  // Discard least useful tokens
  const tokens: GemTokens = {};
  let remaining = excess;

  const sortedColors = [...ALL_TOKEN_COLORS]
    .filter(c => tokenCount(player.tokens, c) > 0)
    .sort((a, b) => usefulness[a] - usefulness[b]);

  for (const c of sortedColors) {
    if (remaining <= 0) break;
    const available = tokenCount(player.tokens, c) - (tokens[c] ?? 0);
    const toDiscard = Math.min(available, remaining);
    if (toDiscard > 0) {
      tokens[c] = toDiscard;
      remaining -= toDiscard;
    }
  }

  return { tokens };
}
