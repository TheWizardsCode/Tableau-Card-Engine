/**
 * FeudalismGame.ts
 *
 * Pure game orchestration for Feudalism — no Phaser dependency.
 * Manages session state, turn actions, validation, patron visits, and end-game.
 */

import {
  type ResourceType,
  type ResourceTokens,
  type ResourceCost,
  type DevelopmentCard,
  type PatronTile,
  type Tier,
  RESOURCE_TYPES,
  ALL_RESOURCE_TYPES,
  tokenCount,
  totalTokens,
  addTokens,
  subtractTokens,
  createTokenSupply,
  selectPatrons,
  createTierDecks,
  MARKET_SIZE,
  WIN_THRESHOLD,
  MAX_RESERVED,
  MAX_TOKENS,
} from './FeudalismCards';

import type { MultiplayerSetupOptions } from '../../src/core-engine/SetupOptions';
import { resolveSetupOptions } from '../../src/core-engine/SetupOptions';
import { getCurrentPlayer } from '../../src/core-engine/TurnSequencer';

// Re-export getCurrentPlayer so consumers can import from FeudalismGame
export { getCurrentPlayer };

// ---------------------------------------------------------------------------
// Session types
// ---------------------------------------------------------------------------

export interface FeudalismPlayerState {
  name: string;
  isAI: boolean;
  tokens: ResourceTokens;
  purchasedCards: DevelopmentCard[];
  reservedCards: DevelopmentCard[];
  patrons: PatronTile[];
}

export type FeudalismPhase =
  | 'playing'
  | 'final-round'
  | 'game-over';

export interface MarketRow {
  visible: (DevelopmentCard | null)[];
  deck: DevelopmentCard[];
}

export interface FeudalismSession {
  players: FeudalismPlayerState[];
  market: Record<Tier, MarketRow>;
  tokenSupply: ResourceTokens;
  patrons: PatronTile[];
  phase: FeudalismPhase;
  currentPlayerIndex: number;
  /** Which player index started the game (for round-completion logic). */
  startingPlayerIndex: number;
  /** Index of the player who first reached WIN_THRESHOLD, or -1. */
  triggerPlayerIndex: number;
  rng: () => number;
}

// ---------------------------------------------------------------------------
// Turn action types
// ---------------------------------------------------------------------------

export interface TakeDifferentTokensAction {
  type: 'take-different';
  colors: ResourceType[];
}

export interface TakeSameTokensAction {
  type: 'take-same';
  color: ResourceType;
}

export interface ReserveCardAction {
  type: 'reserve';
  /** Card ID in market, or null to reserve from top of a tier deck. */
  cardId: number | null;
  /** Required when cardId is null — which tier deck to draw from. */
  tier?: Tier;
}

export interface PurchaseCardAction {
  type: 'purchase';
  cardId: number;
  /** Gold tokens to spend (and which colors they substitute for). */
  goldAllocation?: Partial<Record<ResourceType, number>>;
}

export type TurnAction =
  | TakeDifferentTokensAction
  | TakeSameTokensAction
  | ReserveCardAction
  | PurchaseCardAction;

/** Tokens the player must return when exceeding MAX_TOKENS after a turn. */
export interface TokenDiscard {
  tokens: ResourceTokens;
}

/** Result of executing a turn. */
export interface TurnResult {
  action: TurnAction;
  /** Patron that visited this turn, if any. */
  patronVisit: PatronTile | null;
  /** Whether the game has ended after this turn. */
  gameOver: boolean;
  /** Tokens the player needs to discard (empty if within limit). */
  tokensOverLimit: number;
}

// ---------------------------------------------------------------------------
// Setup options
// ---------------------------------------------------------------------------

export type FeudalismSetupOptions = MultiplayerSetupOptions;

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

export function setupFeudalismGame(options?: FeudalismSetupOptions): FeudalismSession {
  const { players: playerInfos, rng } = resolveSetupOptions(options ?? {});
  const playerCount = playerInfos.length;

  if (playerCount < 2 || playerCount > 4) {
    throw new Error(`Invalid player count: ${playerCount}. Must be 2-4.`);
  }

  const players: FeudalismPlayerState[] = playerInfos.map((info) => ({
    name: info.name,
    isAI: info.isAI,
    tokens: {},
    purchasedCards: [],
    reservedCards: [],
    patrons: [],
  }));

  const decks = createTierDecks(rng);
  const market: Record<Tier, MarketRow> = {
    1: { visible: [], deck: decks.tier1 },
    2: { visible: [], deck: decks.tier2 },
    3: { visible: [], deck: decks.tier3 },
  };

  // Fill initial market
  for (const tier of [1, 2, 3] as Tier[]) {
    for (let i = 0; i < MARKET_SIZE; i++) {
      market[tier].visible.push(market[tier].deck.pop() ?? null);
    }
  }

  return {
    players,
    market,
    tokenSupply: createTokenSupply(playerCount),
    patrons: selectPatrons(playerCount, rng),
    phase: 'playing',
    currentPlayerIndex: 0,
    startingPlayerIndex: 0,
    triggerPlayerIndex: -1,
    rng,
  };
}

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

export function getPrestige(player: FeudalismPlayerState): number {
  let pts = 0;
  for (const card of player.purchasedCards) pts += card.points;
  for (const patron of player.patrons) pts += patron.points;
  return pts;
}

/** Count card bonuses by color. */
export function getBonuses(player: FeudalismPlayerState): Record<ResourceType, number> {
  const bonuses: Record<ResourceType, number> = {
    oats: 0, flax: 0, wheat: 0, barley: 0, turnip: 0,
  };
  for (const card of player.purchasedCards) {
    bonuses[card.bonus]++;
  }
  return bonuses;
}

/** Calculate the effective cost after subtracting bonuses. */
export function effectiveCost(
  cost: ResourceCost,
  bonuses: Record<ResourceType, number>,
): ResourceCost {
  const result: ResourceCost = {};
  for (const c of RESOURCE_TYPES) {
    const needed = (cost[c] ?? 0) - bonuses[c];
    if (needed > 0) result[c] = needed;
  }
  return result;
}

/** Check if a player can afford a card (using tokens + bonuses + mead). */
export function canAfford(player: FeudalismPlayerState, card: DevelopmentCard): boolean {
  const bonuses = getBonuses(player);
  const eff = effectiveCost(card.cost, bonuses);
  let goldNeeded = 0;
  for (const c of RESOURCE_TYPES) {
    const need = eff[c] ?? 0;
    const have = tokenCount(player.tokens, c);
    if (have < need) {
      goldNeeded += need - have;
    }
  }
  return goldNeeded <= tokenCount(player.tokens, 'mead');
}

/** Check if a patron's requirements are met by the player's bonuses. */
export function patronQualifies(player: FeudalismPlayerState, patron: PatronTile): boolean {
  const bonuses = getBonuses(player);
  for (const c of RESOURCE_TYPES) {
    if ((patron.requirements[c] ?? 0) > bonuses[c]) return false;
  }
  return true;
}

/** Find a card in the market by ID. Returns { tier, index } or null. */
export function findCardInMarket(
  session: FeudalismSession,
  cardId: number,
): { tier: Tier; index: number } | null {
  for (const tier of [1, 2, 3] as Tier[]) {
    const idx = session.market[tier].visible.findIndex(
      c => c !== null && c.id === cardId,
    );
    if (idx !== -1) return { tier, index: idx };
  }
  return null;
}

/** Find a card in a player's reserved cards by ID. */
export function findReservedCard(
  player: FeudalismPlayerState,
  cardId: number,
): number {
  return player.reservedCards.findIndex(c => c.id === cardId);
}

/** Get all cards available for purchase (market + reserved). */
export function getAvailableCards(
  session: FeudalismSession,
  playerIndex: number,
): DevelopmentCard[] {
  const cards: DevelopmentCard[] = [];
  for (const tier of [1, 2, 3] as Tier[]) {
    for (const card of session.market[tier].visible) {
      if (card) cards.push(card);
    }
  }
  cards.push(...session.players[playerIndex].reservedCards);
  return cards;
}

/** Get all affordable cards for a player. */
export function getAffordableCards(
  session: FeudalismSession,
  playerIndex: number,
): DevelopmentCard[] {
  const player = session.players[playerIndex];
  return getAvailableCards(session, playerIndex).filter(c => canAfford(player, c));
}

export function isGameOver(session: FeudalismSession): boolean {
  return session.phase === 'game-over';
}

/** Get the winner index (most prestige, tiebreak: fewest cards). */
export function getWinnerIndex(session: FeudalismSession): number {
  let bestIdx = 0;
  let bestPrestige = -1;
  let bestCards = Infinity;

  for (let i = 0; i < session.players.length; i++) {
    const p = getPrestige(session.players[i]);
    const c = session.players[i].purchasedCards.length;
    if (p > bestPrestige || (p === bestPrestige && c < bestCards)) {
      bestIdx = i;
      bestPrestige = p;
      bestCards = c;
    }
  }
  return bestIdx;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export function validateAction(
  session: FeudalismSession,
  action: TurnAction,
): string | null {
  if (session.phase === 'game-over') return 'Game is over';

  const player = getCurrentPlayer(session);

  switch (action.type) {
    case 'take-different':
      return validateTakeDifferent(session, player, action);
    case 'take-same':
      return validateTakeSame(session, player, action);
    case 'reserve':
      return validateReserve(session, player, action);
    case 'purchase':
      return validatePurchase(session, player, action);
  }
}

function validateTakeDifferent(
  session: FeudalismSession,
  _player: FeudalismPlayerState,
  action: TakeDifferentTokensAction,
): string | null {
  const { colors } = action;
  if (colors.length === 0 || colors.length > 3) {
    return 'Must take 1-3 tokens of different colors';
  }

  // Check for duplicates
  if (new Set(colors).size !== colors.length) {
    return 'Colors must be unique when taking different tokens';
  }

  // Check each color is a valid resource type (not mead)
  for (const c of colors) {
    if (!RESOURCE_TYPES.includes(c)) {
      return `Invalid resource type: ${c}`;
    }
  }

  // Check supply availability
  for (const c of colors) {
    if (tokenCount(session.tokenSupply, c) <= 0) {
      return `No ${c} tokens available in supply`;
    }
  }

  // Special rule: can only take fewer than 3 if there are fewer than 3 colors available
  if (colors.length < 3) {
    const availableColors = RESOURCE_TYPES.filter(
      c => tokenCount(session.tokenSupply, c) > 0,
    );
    if (availableColors.length >= 3) {
      return 'Must take 3 different colors when 3+ colors are available';
    }
  }

  return null;
}

function validateTakeSame(
  session: FeudalismSession,
  _player: FeudalismPlayerState,
  action: TakeSameTokensAction,
): string | null {
  const { color } = action;
  if (!RESOURCE_TYPES.includes(color)) {
    return `Invalid resource type: ${color}`;
  }
  if (tokenCount(session.tokenSupply, color) < 4) {
    return `Need at least 4 ${color} tokens in supply to take 2 (only ${tokenCount(session.tokenSupply, color)} available)`;
  }
  return null;
}

function validateReserve(
  session: FeudalismSession,
  player: FeudalismPlayerState,
  action: ReserveCardAction,
): string | null {
  if (player.reservedCards.length >= MAX_RESERVED) {
    return `Cannot reserve more than ${MAX_RESERVED} cards`;
  }

  if (action.cardId !== null) {
    // Reserve from market
    const found = findCardInMarket(session, action.cardId);
    if (!found) return `Card ${action.cardId} not found in market`;
  } else {
    // Reserve from top of deck
    if (!action.tier) return 'Must specify tier when reserving from deck';
    if (![1, 2, 3].includes(action.tier)) return `Invalid tier: ${action.tier}`;
    if (session.market[action.tier].deck.length === 0) {
      return `Tier ${action.tier} deck is empty`;
    }
  }

  return null;
}

function validatePurchase(
  session: FeudalismSession,
  player: FeudalismPlayerState,
  action: PurchaseCardAction,
): string | null {
  const { cardId } = action;

  // Find the card (market or reserved)
  const inMarket = findCardInMarket(session, cardId);
  const reservedIdx = findReservedCard(player, cardId);
  if (!inMarket && reservedIdx === -1) {
    return `Card ${cardId} not found in market or reserved cards`;
  }

  const card = inMarket
    ? session.market[inMarket.tier].visible[inMarket.index]!
    : player.reservedCards[reservedIdx];

  if (!canAfford(player, card)) {
    return 'Cannot afford this card';
  }

  return null;
}

// ---------------------------------------------------------------------------
// Action execution
// ---------------------------------------------------------------------------

/**
 * Execute a turn action. Returns a TurnResult.
 * Throws if the action is invalid.
 * Note: if tokensOverLimit > 0, the caller must follow up with discardTokens().
 */
export function executeTurn(
  session: FeudalismSession,
  action: TurnAction,
): TurnResult {
  const error = validateAction(session, action);
  if (error) throw new Error(error);

  const player = getCurrentPlayer(session);

  switch (action.type) {
    case 'take-different':
      executeTakeDifferent(session, player, action);
      break;
    case 'take-same':
      executeTakeSame(session, player, action);
      break;
    case 'reserve':
      executeReserve(session, player, action);
      break;
    case 'purchase':
      executePurchase(session, player, action);
      break;
  }

  // Check token limit
  const overLimit = totalTokens(player.tokens) - MAX_TOKENS;

  // Check patron visit
  const patronVisit = checkPatronVisit(session, player);

  // If player is within token limit, advance turn
  if (overLimit <= 0) {
    return finishTurn(session, action, patronVisit);
  }

  return {
    action,
    patronVisit,
    gameOver: false,
    tokensOverLimit: overLimit,
  };
}

/**
 * Discard tokens when over the limit. Must be called after executeTurn
 * if tokensOverLimit > 0.
 */
export function discardTokens(
  session: FeudalismSession,
  discard: TokenDiscard,
): TurnResult {
  const player = getCurrentPlayer(session);
  const discardTotal = totalTokens(discard.tokens);
  const overLimit = totalTokens(player.tokens) - MAX_TOKENS;

  if (discardTotal !== overLimit) {
    throw new Error(`Must discard exactly ${overLimit} tokens, got ${discardTotal}`);
  }

  // Validate player has these tokens
  for (const c of ALL_RESOURCE_TYPES) {
    const amount = tokenCount(discard.tokens, c);
    if (amount > 0 && amount > tokenCount(player.tokens, c)) {
      throw new Error(`Cannot discard ${amount} ${c} tokens (only have ${tokenCount(player.tokens, c)})`);
    }
  }

  // Return tokens to supply
  player.tokens = subtractTokens(player.tokens, discard.tokens);
  session.tokenSupply = addTokens(session.tokenSupply, discard.tokens);

  // Patron visit already happened in executeTurn, so just advance
  return finishTurn(session, { type: 'take-different', colors: [] }, null);
}

function executeTakeDifferent(
  session: FeudalismSession,
  player: FeudalismPlayerState,
  action: TakeDifferentTokensAction,
): void {
  for (const c of action.colors) {
    player.tokens = addTokens(player.tokens, { [c]: 1 });
    session.tokenSupply = subtractTokens(session.tokenSupply, { [c]: 1 });
  }
}

function executeTakeSame(
  session: FeudalismSession,
  player: FeudalismPlayerState,
  action: TakeSameTokensAction,
): void {
  player.tokens = addTokens(player.tokens, { [action.color]: 2 });
  session.tokenSupply = subtractTokens(session.tokenSupply, { [action.color]: 2 });
}

function executeReserve(
  session: FeudalismSession,
  player: FeudalismPlayerState,
  action: ReserveCardAction,
): void {
  let card: DevelopmentCard;

  if (action.cardId !== null) {
    // Remove from market
    const found = findCardInMarket(session, action.cardId)!;
    card = session.market[found.tier].visible[found.index]!;
    // Refill the slot
    session.market[found.tier].visible[found.index] =
      session.market[found.tier].deck.pop() ?? null;
  } else {
    // Draw from top of tier deck
    card = session.market[action.tier!].deck.pop()!;
  }

  player.reservedCards.push(card);

  // Gain a mead token if available
  if (tokenCount(session.tokenSupply, 'mead') > 0) {
    player.tokens = addTokens(player.tokens, { mead: 1 });
    session.tokenSupply = subtractTokens(session.tokenSupply, { mead: 1 });
  }
}

function executePurchase(
  session: FeudalismSession,
  player: FeudalismPlayerState,
  action: PurchaseCardAction,
): void {
  const { cardId } = action;

  // Find and remove the card
  let card: DevelopmentCard;
  const inMarket = findCardInMarket(session, cardId);
  if (inMarket) {
    card = session.market[inMarket.tier].visible[inMarket.index]!;
    session.market[inMarket.tier].visible[inMarket.index] =
      session.market[inMarket.tier].deck.pop() ?? null;
  } else {
    const idx = findReservedCard(player, cardId);
    card = player.reservedCards[idx];
    player.reservedCards.splice(idx, 1);
  }

  // Calculate payment
  const bonuses = getBonuses(player);
  const eff = effectiveCost(card.cost, bonuses);
  const payment: ResourceTokens = {};
  let goldUsed = 0;

  for (const c of RESOURCE_TYPES) {
    const need = eff[c] ?? 0;
    if (need <= 0) continue;
    const fromTokens = Math.min(need, tokenCount(player.tokens, c));
    if (fromTokens > 0) payment[c] = fromTokens;
    const shortfall = need - fromTokens;
    if (shortfall > 0) goldUsed += shortfall;
  }
  if (goldUsed > 0) payment.mead = goldUsed;

  // Pay tokens
  player.tokens = subtractTokens(player.tokens, payment);
  session.tokenSupply = addTokens(session.tokenSupply, payment);

  // Add card to purchased
  player.purchasedCards.push(card);
}

// ---------------------------------------------------------------------------
// Patron visit
// ---------------------------------------------------------------------------

function checkPatronVisit(
  session: FeudalismSession,
  player: FeudalismPlayerState,
): PatronTile | null {
  for (let i = 0; i < session.patrons.length; i++) {
    if (patronQualifies(player, session.patrons[i])) {
      const patron = session.patrons[i];
      player.patrons.push(patron);
      session.patrons.splice(i, 1);
      return patron;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Turn advancement and end-game
// ---------------------------------------------------------------------------

function finishTurn(
  session: FeudalismSession,
  action: TurnAction,
  patronVisit: PatronTile | null,
): TurnResult {
  const player = getCurrentPlayer(session);
  const prestige = getPrestige(player);

  // Check if this player triggered the end
  if (session.triggerPlayerIndex === -1 && prestige >= WIN_THRESHOLD) {
    session.triggerPlayerIndex = session.currentPlayerIndex;
    session.phase = 'final-round';
  }

  // Advance to next player
  const nextPlayer = (session.currentPlayerIndex + 1) % session.players.length;

  // Check if the round is complete (all players have had equal turns after trigger)
  if (
    session.phase === 'final-round' &&
    nextPlayer === session.startingPlayerIndex
  ) {
    session.phase = 'game-over';
    return {
      action,
      patronVisit,
      gameOver: true,
      tokensOverLimit: 0,
    };
  }

  session.currentPlayerIndex = nextPlayer;

  return {
    action,
    patronVisit,
    gameOver: false,
    tokensOverLimit: 0,
  };
}

// ---------------------------------------------------------------------------
// Utility: list legal actions for a player (used by AI)
// ---------------------------------------------------------------------------

export function getLegalActions(session: FeudalismSession): TurnAction[] {
  if (session.phase === 'game-over') return [];

  const player = getCurrentPlayer(session);
  const actions: TurnAction[] = [];

  // 1. Take 3 different tokens
  const availColors = RESOURCE_TYPES.filter(
    c => tokenCount(session.tokenSupply, c) > 0,
  );

  if (availColors.length >= 3) {
    // Generate all combinations of 3
    for (let i = 0; i < availColors.length; i++) {
      for (let j = i + 1; j < availColors.length; j++) {
        for (let k = j + 1; k < availColors.length; k++) {
          actions.push({
            type: 'take-different',
            colors: [availColors[i], availColors[j], availColors[k]],
          });
        }
      }
    }
  } else if (availColors.length > 0) {
    // Take whatever is available (1 or 2 different)
    if (availColors.length === 2) {
      actions.push({ type: 'take-different', colors: [availColors[0], availColors[1]] });
    } else {
      actions.push({ type: 'take-different', colors: [availColors[0]] });
    }
  }

  // 2. Take 2 same tokens
  for (const c of RESOURCE_TYPES) {
    if (tokenCount(session.tokenSupply, c) >= 4) {
      actions.push({ type: 'take-same', color: c });
    }
  }

  // 3. Reserve cards
  if (player.reservedCards.length < MAX_RESERVED) {
    // From market
    for (const tier of [1, 2, 3] as Tier[]) {
      for (const card of session.market[tier].visible) {
        if (card) {
          actions.push({ type: 'reserve', cardId: card.id });
        }
      }
      // From deck
      if (session.market[tier].deck.length > 0) {
        actions.push({ type: 'reserve', cardId: null, tier });
      }
    }
  }

  // 4. Purchase cards
  const affordable = getAffordableCards(session, session.currentPlayerIndex);
  for (const card of affordable) {
    actions.push({ type: 'purchase', cardId: card.id });
  }

  return actions;
}
