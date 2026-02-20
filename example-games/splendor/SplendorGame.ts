/**
 * SplendorGame.ts
 *
 * Pure game orchestration for Splendor — no Phaser dependency.
 * Manages session state, turn actions, validation, noble visits, and end-game.
 */

import {
  type GemColor,
  type GemTokens,
  type GemCost,
  type DevelopmentCard,
  type NobleTile,
  type Tier,
  GEM_COLORS,
  ALL_TOKEN_COLORS,
  tokenCount,
  totalTokens,
  addTokens,
  subtractTokens,
  createTokenSupply,
  selectNobles,
  createTierDecks,
  MARKET_SIZE,
  WIN_THRESHOLD,
  MAX_RESERVED,
  MAX_TOKENS,
} from './SplendorCards';

// ---------------------------------------------------------------------------
// Session types
// ---------------------------------------------------------------------------

export interface SplendorPlayerState {
  name: string;
  isAI: boolean;
  tokens: GemTokens;
  purchasedCards: DevelopmentCard[];
  reservedCards: DevelopmentCard[];
  nobles: NobleTile[];
}

export type SplendorPhase =
  | 'playing'
  | 'final-round'
  | 'game-over';

export interface MarketRow {
  visible: (DevelopmentCard | null)[];
  deck: DevelopmentCard[];
}

export interface SplendorSession {
  players: SplendorPlayerState[];
  market: Record<Tier, MarketRow>;
  tokenSupply: GemTokens;
  nobles: NobleTile[];
  phase: SplendorPhase;
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
  colors: GemColor[];
}

export interface TakeSameTokensAction {
  type: 'take-same';
  color: GemColor;
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
  goldAllocation?: Partial<Record<GemColor, number>>;
}

export type TurnAction =
  | TakeDifferentTokensAction
  | TakeSameTokensAction
  | ReserveCardAction
  | PurchaseCardAction;

/** Tokens the player must return when exceeding MAX_TOKENS after a turn. */
export interface TokenDiscard {
  tokens: GemTokens;
}

/** Result of executing a turn. */
export interface TurnResult {
  action: TurnAction;
  /** Noble that visited this turn, if any. */
  nobleVisit: NobleTile | null;
  /** Whether the game has ended after this turn. */
  gameOver: boolean;
  /** Tokens the player needs to discard (empty if within limit). */
  tokensOverLimit: number;
}

// ---------------------------------------------------------------------------
// Setup options
// ---------------------------------------------------------------------------

export interface SplendorSetupOptions {
  playerCount?: number; // 2-4, default 2
  playerNames?: string[];
  isAI?: boolean[]; // which players are AI
  rng?: () => number;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

export function setupSplendorGame(options?: SplendorSetupOptions): SplendorSession {
  const playerCount = options?.playerCount ?? 2;
  if (playerCount < 2 || playerCount > 4) {
    throw new Error(`Invalid player count: ${playerCount}. Must be 2-4.`);
  }

  const rng = options?.rng ?? Math.random;
  const names = options?.playerNames ?? Array.from(
    { length: playerCount },
    (_, i) => i === 0 ? 'Player' : `AI ${i}`,
  );
  const isAI = options?.isAI ?? Array.from(
    { length: playerCount },
    (_, i) => i > 0,
  );

  const players: SplendorPlayerState[] = names.map((name, i) => ({
    name,
    isAI: isAI[i] ?? true,
    tokens: {},
    purchasedCards: [],
    reservedCards: [],
    nobles: [],
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
    nobles: selectNobles(playerCount, rng),
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

export function getCurrentPlayer(session: SplendorSession): SplendorPlayerState {
  return session.players[session.currentPlayerIndex];
}

export function getPrestige(player: SplendorPlayerState): number {
  let pts = 0;
  for (const card of player.purchasedCards) pts += card.points;
  for (const noble of player.nobles) pts += noble.points;
  return pts;
}

/** Count card bonuses by color. */
export function getBonuses(player: SplendorPlayerState): Record<GemColor, number> {
  const bonuses: Record<GemColor, number> = {
    emerald: 0, sapphire: 0, ruby: 0, diamond: 0, onyx: 0,
  };
  for (const card of player.purchasedCards) {
    bonuses[card.bonus]++;
  }
  return bonuses;
}

/** Calculate the effective cost after subtracting bonuses. */
export function effectiveCost(
  cost: GemCost,
  bonuses: Record<GemColor, number>,
): GemCost {
  const result: GemCost = {};
  for (const c of GEM_COLORS) {
    const needed = (cost[c] ?? 0) - bonuses[c];
    if (needed > 0) result[c] = needed;
  }
  return result;
}

/** Check if a player can afford a card (using tokens + bonuses + gold). */
export function canAfford(player: SplendorPlayerState, card: DevelopmentCard): boolean {
  const bonuses = getBonuses(player);
  const eff = effectiveCost(card.cost, bonuses);
  let goldNeeded = 0;
  for (const c of GEM_COLORS) {
    const need = eff[c] ?? 0;
    const have = tokenCount(player.tokens, c);
    if (have < need) {
      goldNeeded += need - have;
    }
  }
  return goldNeeded <= tokenCount(player.tokens, 'gold');
}

/** Check if a noble's requirements are met by the player's bonuses. */
export function nobleQualifies(player: SplendorPlayerState, noble: NobleTile): boolean {
  const bonuses = getBonuses(player);
  for (const c of GEM_COLORS) {
    if ((noble.requirements[c] ?? 0) > bonuses[c]) return false;
  }
  return true;
}

/** Find a card in the market by ID. Returns { tier, index } or null. */
export function findCardInMarket(
  session: SplendorSession,
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
  player: SplendorPlayerState,
  cardId: number,
): number {
  return player.reservedCards.findIndex(c => c.id === cardId);
}

/** Get all cards available for purchase (market + reserved). */
export function getAvailableCards(
  session: SplendorSession,
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
  session: SplendorSession,
  playerIndex: number,
): DevelopmentCard[] {
  const player = session.players[playerIndex];
  return getAvailableCards(session, playerIndex).filter(c => canAfford(player, c));
}

export function isGameOver(session: SplendorSession): boolean {
  return session.phase === 'game-over';
}

/** Get the winner index (most prestige, tiebreak: fewest cards). */
export function getWinnerIndex(session: SplendorSession): number {
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
  session: SplendorSession,
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
  session: SplendorSession,
  _player: SplendorPlayerState,
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

  // Check each color is a valid gem (not gold)
  for (const c of colors) {
    if (!GEM_COLORS.includes(c)) {
      return `Invalid gem color: ${c}`;
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
    const availableColors = GEM_COLORS.filter(
      c => tokenCount(session.tokenSupply, c) > 0,
    );
    if (availableColors.length >= 3) {
      return 'Must take 3 different colors when 3+ colors are available';
    }
  }

  return null;
}

function validateTakeSame(
  session: SplendorSession,
  _player: SplendorPlayerState,
  action: TakeSameTokensAction,
): string | null {
  const { color } = action;
  if (!GEM_COLORS.includes(color)) {
    return `Invalid gem color: ${color}`;
  }
  if (tokenCount(session.tokenSupply, color) < 4) {
    return `Need at least 4 ${color} tokens in supply to take 2 (only ${tokenCount(session.tokenSupply, color)} available)`;
  }
  return null;
}

function validateReserve(
  session: SplendorSession,
  player: SplendorPlayerState,
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
  session: SplendorSession,
  player: SplendorPlayerState,
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
  session: SplendorSession,
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

  // Check noble visit
  const nobleVisit = checkNobleVisit(session, player);

  // If player is within token limit, advance turn
  if (overLimit <= 0) {
    return finishTurn(session, action, nobleVisit);
  }

  return {
    action,
    nobleVisit,
    gameOver: false,
    tokensOverLimit: overLimit,
  };
}

/**
 * Discard tokens when over the limit. Must be called after executeTurn
 * if tokensOverLimit > 0.
 */
export function discardTokens(
  session: SplendorSession,
  discard: TokenDiscard,
): TurnResult {
  const player = getCurrentPlayer(session);
  const discardTotal = totalTokens(discard.tokens);
  const overLimit = totalTokens(player.tokens) - MAX_TOKENS;

  if (discardTotal !== overLimit) {
    throw new Error(`Must discard exactly ${overLimit} tokens, got ${discardTotal}`);
  }

  // Validate player has these tokens
  for (const c of ALL_TOKEN_COLORS) {
    const amount = tokenCount(discard.tokens, c);
    if (amount > 0 && amount > tokenCount(player.tokens, c)) {
      throw new Error(`Cannot discard ${amount} ${c} tokens (only have ${tokenCount(player.tokens, c)})`);
    }
  }

  // Return tokens to supply
  player.tokens = subtractTokens(player.tokens, discard.tokens);
  session.tokenSupply = addTokens(session.tokenSupply, discard.tokens);

  // Noble visit already happened in executeTurn, so just advance
  return finishTurn(session, { type: 'take-different', colors: [] }, null);
}

function executeTakeDifferent(
  session: SplendorSession,
  player: SplendorPlayerState,
  action: TakeDifferentTokensAction,
): void {
  for (const c of action.colors) {
    player.tokens = addTokens(player.tokens, { [c]: 1 });
    session.tokenSupply = subtractTokens(session.tokenSupply, { [c]: 1 });
  }
}

function executeTakeSame(
  session: SplendorSession,
  player: SplendorPlayerState,
  action: TakeSameTokensAction,
): void {
  player.tokens = addTokens(player.tokens, { [action.color]: 2 });
  session.tokenSupply = subtractTokens(session.tokenSupply, { [action.color]: 2 });
}

function executeReserve(
  session: SplendorSession,
  player: SplendorPlayerState,
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

  // Gain a gold token if available
  if (tokenCount(session.tokenSupply, 'gold') > 0) {
    player.tokens = addTokens(player.tokens, { gold: 1 });
    session.tokenSupply = subtractTokens(session.tokenSupply, { gold: 1 });
  }
}

function executePurchase(
  session: SplendorSession,
  player: SplendorPlayerState,
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
  const payment: GemTokens = {};
  let goldUsed = 0;

  for (const c of GEM_COLORS) {
    const need = eff[c] ?? 0;
    if (need <= 0) continue;
    const fromTokens = Math.min(need, tokenCount(player.tokens, c));
    if (fromTokens > 0) payment[c] = fromTokens;
    const shortfall = need - fromTokens;
    if (shortfall > 0) goldUsed += shortfall;
  }
  if (goldUsed > 0) payment.gold = goldUsed;

  // Pay tokens
  player.tokens = subtractTokens(player.tokens, payment);
  session.tokenSupply = addTokens(session.tokenSupply, payment);

  // Add card to purchased
  player.purchasedCards.push(card);
}

// ---------------------------------------------------------------------------
// Noble visit
// ---------------------------------------------------------------------------

function checkNobleVisit(
  session: SplendorSession,
  player: SplendorPlayerState,
): NobleTile | null {
  for (let i = 0; i < session.nobles.length; i++) {
    if (nobleQualifies(player, session.nobles[i])) {
      const noble = session.nobles[i];
      player.nobles.push(noble);
      session.nobles.splice(i, 1);
      return noble;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Turn advancement and end-game
// ---------------------------------------------------------------------------

function finishTurn(
  session: SplendorSession,
  action: TurnAction,
  nobleVisit: NobleTile | null,
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
      nobleVisit,
      gameOver: true,
      tokensOverLimit: 0,
    };
  }

  session.currentPlayerIndex = nextPlayer;

  return {
    action,
    nobleVisit,
    gameOver: false,
    tokensOverLimit: 0,
  };
}

// ---------------------------------------------------------------------------
// Utility: list legal actions for a player (used by AI)
// ---------------------------------------------------------------------------

export function getLegalActions(session: SplendorSession): TurnAction[] {
  if (session.phase === 'game-over') return [];

  const player = getCurrentPlayer(session);
  const actions: TurnAction[] = [];

  // 1. Take 3 different tokens
  const availColors = GEM_COLORS.filter(
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
  for (const c of GEM_COLORS) {
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
