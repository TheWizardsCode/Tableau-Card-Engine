/**
 * AI strategies for Main Street.
 *
 * Provides:
 *   - MainStreetAiStrategy interface: chooseAction(state, rng)
 *   - enumerateLegalActions(state): all valid PlayerAction options
 *   - scoreAction(state, action): score a single action using heuristics
 *   - enumerateAndScoreActions(state): enumerate and score all legal actions
 *   - RandomStrategy: uniformly random legal action
 *   - GreedyStrategy: heuristic priority chain (pure greedy baseline)
 *   - BankingGreedyStrategy: Greedy + deliberate action hoarding
 *   - MainStreetAiPlayer: wrapper binding a strategy and RNG
 *
 * Uses shared AI module (`@ai`) for base types and utility functions.
 *
 * @module
 */

import type { AiStrategyBase } from '@ai';
import { AiPlayer as AiPlayerBase, pickRandom, pickBest } from '@ai';
import { recordMainStreetEvent } from './MainStreetTranscript';
import { hasPeekCapableStaff } from './MainStreetStaffSkills';
import { syncResourceBankToLedger, type MainStreetState, type PlayerRecord } from './MainStreetState';
import {
  executeWeekStart,
  processEndOfTurn,
  executeAction,
  resolvePendingEventChoice,
  type PlayerAction,
  type BuyBusinessAction,
  type BuyUpgradeAction,
  type BuyEventAction,
  type HireStaffAction,
  type MoveToHandAction,
  type PlayBusinessFromHandAction,
  type PlayUpgradeFromHandAction,
  type PlayEventFromHandAction,
  type CommunityFavourAction,
} from './MainStreetEngine';
import {
  canPurchaseBusiness,
  canPurchaseUpgrade,
  canPurchaseEvent,
  canPurchaseStaff,
  canAddToHand,
  getEmptySlots,
} from './MainStreetMarket';
import type { BusinessCard, CommunitySpaceCard, UpgradeCard, EventCard, StaffCard, SynergyType } from './MainStreetCards';
import { isDurationEventCard } from './MainStreetCards';
import { computeProportionalCoinLoss, computeTaxAuditRate } from './MainStreetStaffBuffs';
import type { DifficultyName } from './MainStreetDifficulty';
import { computeSynergyBonus, getSlotOwnerId } from './MainStreetAdjacency';
import { computeScore } from './MainStreetEngine';

// ── Scoring constants ───────────────────────────────────────

// ── AI planning horizon (CG-0MSLXJCHH001DLIO, user Q2b) ───────

/**
 * Floor for the AI planning horizon. Keeps the horizon > 0 even when the
 * score is at or near the win threshold, so future income is never valued
 * at zero/negative. Calibrated during F4 (CG-0MSN1A71G005AF7W): with a
 * floor of 5, a purchase near the threshold is still valued over ~5 turns
 * of income, matching the old early-game valuation magnitude.
 */
const AI_HORIZON_FLOOR = 5;

/**
 * Cap for the AI planning horizon. Bounds how many future turns a single
 * purchase's income is valued over in long unlimited games, preventing an
 * upgrade/business from being overvalued late in a run.
 */
const AI_HORIZON_CAP = 25;

/**
 * Expected score gained per turn (pts/turn). Used to convert the distance
 * to the win threshold into a turn count. Calibrated from the balance
 * baseline: the Medium threshold (150) is reached in ~18 turns on average,
 * i.e. ~8.3 pts/turn; 8 is the rounded constant. Scaled ×100 to 800
 * for the integer economy (CG-0MTIO1M15001E9Y6: winThreshold 120→12000).
 */
const AI_SCORE_PACE = 800;

/**
 * Computes the AI planning horizon — the number of future turns whose
 * income a purchase is expected to yield — derived from the distance to
 * the win threshold (user Q2b decision, CG-0MSLXJCHH001DLIO):
 *
 *   horizon = clamp(ceil((winThreshold - score) / scorePace), floor, cap)
 *
 * Replaces the former `remainingTurns = maxTurns - turn` (PRD Appendix A),
 * which no longer applies now that default presets are unlimited. The floor
 * prevents degenerate (zero/negative) horizons when the score is at or near
 * the threshold.
 *
 * @param state Current game state (read-only by convention).
 * @returns The planning horizon in turns (always in [AI_HORIZON_FLOOR, AI_HORIZON_CAP]).
 */
export function aiPlanningHorizon(state: MainStreetState): number {
  const distance = state.config.winThreshold - computeScore(state);
  const raw = Math.ceil(distance / AI_SCORE_PACE);
  return Math.min(AI_HORIZON_CAP, Math.max(AI_HORIZON_FLOOR, raw));
}

// ── Banking heuristic (CG-0MT3JMGA60091J8W) ──────────────────

/** Maximum banked actions (mirrors the engine cap). */
const BANK_CAP = 2;

/**
 * Difficulty profile for the banking heuristic (CG-0MT3JMGA60091J8W,
 * producer answers Q1c / Q3 / Q6).
 *
 * `lookAheadDepth` is how many upcoming cards per deck the strategy inspects
 * as *anticipated* banking targets (0 = visible targets only). `aggressiveness`
 * scales the final bank score: below 1 the strategy needs a stronger case
 * before hoarding, above 1 it hoards more readily.
 */
interface BankingDifficultyProfile {
  /** Upcoming deck cards per family inspected as look-ahead targets. */
  readonly lookAheadDepth: number;
  /** Multiplier applied to the combined bank score. */
  readonly aggressiveness: number;
}

/**
 * Difficulty-gated banking aggressiveness (AC3).
 *
 * Easy looks only at visible cards and under-banks (it rarely skips a spend);
 * Medium considers the next card in each deck at face value; Hard peeks two
 * cards deep and hoards hardest. This is the tuning table referenced by the
 * documentation (AC7) — changing it changes observable AI behaviour, so keep
 * the two in sync.
 */
export const BANKING_DIFFICULTY_PROFILES: Record<DifficultyName, BankingDifficultyProfile> = {
  Easy: { lookAheadDepth: 0, aggressiveness: 0.5 },
  Medium: { lookAheadDepth: 1, aggressiveness: 1.0 },
  Hard: { lookAheadDepth: 2, aggressiveness: 1.5 },
};

/**
 * Weight applied to anticipated (pipeline) targets relative to visible ones.
 * Look-ahead targets are less certain — another card may be drawn first, the
 * market may reroll — so a pipeline target counts for half a visible one.
 */
const PIPELINE_TARGET_WEIGHT = 0.5;

/** A candidate banking target: a valuable card the AI cannot yet afford. */
interface BankTarget {
  /** Net expected value of owning the card (income * horizon - cost). */
  score: number;
  /** The card's cost (> current coins by construction). */
  cost: number;
  /** Confidence weight (1 for visible cards, decayed for pipeline cards). */
  weight: number;
}

/**
 * Best synergy bonus available to `card` across the empty street slots
 * (0 when the street is full). Shared by visible and pipeline business
 * targets so both are valued with the same placement heuristic as the
 * spending path.
 */
function bestPlacementSynergy(
  state: MainStreetState,
  card: BusinessCard | CommunitySpaceCard,
): number {
  let maxSynergy = 0;
  for (let slot = 0; slot < state.streetGrid.length; slot++) {
    if (state.streetGrid[slot] !== null) continue;
    const sim = [...state.streetGrid];
    sim[slot] = card as unknown as BusinessCard;
    const s = computeSynergyBonus(sim, slot, state.config.synergyBonusPerNeighbor);
    if (s > maxSynergy) maxSynergy = s;
  }
  return maxSynergy;
}

/**
 * Best *unaffordable* high-value target currently visible to the AI — in hand
 * or in the market row (AC3(a)). Returns `null` when every visible card is
 * affordable or has no positive value.
 */
function bestVisibleBankTarget(
  state: MainStreetState,
  coins: number,
  horizon: number,
): BankTarget | null {
  const hand = state.hand ?? [];
  const emptyCount = state.streetGrid.filter(s => s === null).length;
  let best: BankTarget | null = null;

  const consider = (score: number, cost: number): void => {
    if (score > (best?.score ?? -Infinity)) best = { score, cost, weight: 1 };
  };

  // Hand: business / community-space cards whose play-from-hand cost exceeds coins
  for (const card of hand) {
    const c = card as BusinessCard & { cost: number; family: string };
    if (c.family !== 'business' && c.family !== 'community-space') continue;
    if (c.cost <= coins) continue; // already affordable — not a banking target
    const synergy = bestPlacementSynergy(state, c);
    consider((c.baseIncome + synergy) * horizon - c.cost, c.cost);
  }

  // Hand: upgrade cards whose cost exceeds coins
  for (const card of hand) {
    const c = card as UpgradeCard & { cost: number; family: string };
    if (c.family !== 'upgrade') continue;
    if (c.cost <= coins) continue;
    consider(c.incomeBonus * horizon - c.cost, c.cost);
  }

  // Hand: Investment events whose cost exceeds coins
  for (const card of hand) {
    const c = card as EventCard & { cost: number; family: string };
    if (c.family !== 'event') continue;
    if (c.cost <= coins) continue;
    consider(c.coinDelta + c.reputationDelta - c.cost, c.cost);
  }

  // Market: business / community-space cards that are unaffordable and placeable
  for (const card of state.market.cards) {
    if (card.family !== 'business' && card.family !== 'community-space') continue;
    if (card.cost <= coins) continue;
    if (emptyCount === 0) continue;
    const biz = card as BusinessCard;
    const synergy = bestPlacementSynergy(state, biz);
    consider((biz.baseIncome + synergy) * horizon - biz.cost, biz.cost);
  }

  // Market: upgrade cards that are unaffordable. Even without an immediate
  // target the upgrade may become valid later, so it is still scored.
  for (const card of state.market.cards) {
    if (card.family !== 'upgrade') continue;
    if (card.cost <= coins) continue;
    const upg = card as UpgradeCard;
    consider(upg.incomeBonus * horizon - upg.cost, upg.cost);
  }

  // Market: Investment events that are unaffordable
  for (const card of state.market.cards) {
    if (card.family !== 'event') continue;
    if (card.cost <= coins) continue;
    const evt = card as EventCard;
    consider(evt.coinDelta + evt.reputationDelta - evt.cost, evt.cost);
  }

  return best;
}

/**
 * Best *anticipated* near-future target (AC3(b)): the top `depth` cards of
 * each drawable deck (business, community-space, upgrade, event), valued with
 * the same heuristic as visible targets but decayed by queue position so the
 * next card to be drawn counts more than the one behind it.
 *
 * Depth is difficulty-gated (`lookAheadDepth`), which is how Easy ends up
 * looking only at visible cards. Deck arrays draw from the end (`deck[len-1]`
 * is next), so iteration walks backwards from the end.
 */
function bestPipelineBankTarget(
  state: MainStreetState,
  coins: number,
  horizon: number,
  depth: number,
): BankTarget | null {
  if (depth <= 0) return null;

  const emptyCount = state.streetGrid.filter(s => s === null).length;
  let best: BankTarget | null = null;

  const consider = (score: number, cost: number, weight: number): void => {
    const weighted = score * weight;
    if (weighted > (best?.score ?? -Infinity)) best = { score, cost, weight };
  };

  /** Walk the top `depth` cards of a deck, nearest-first (end of array). */
  const eachTopCard = <T>(deck: readonly T[] | undefined, fn: (card: T, weight: number) => void): void => {
    if (!deck || deck.length === 0) return;
    for (let pos = 0; pos < depth && pos < deck.length; pos++) {
      const card = deck[deck.length - 1 - pos];
      const weight = (1 / (1 + pos)) * PIPELINE_TARGET_WEIGHT;
      fn(card, weight);
    }
  };

  eachTopCard(state.decks?.business, (card, weight) => {
    if (card.cost <= coins) return;
    if (emptyCount === 0) return;
    const synergy = bestPlacementSynergy(state, card);
    consider((card.baseIncome + synergy) * horizon - card.cost, card.cost, weight);
  });

  eachTopCard(state.decks?.communitySpace, (card, weight) => {
    if (card.cost <= coins) return;
    if (emptyCount === 0) return;
    const synergy = bestPlacementSynergy(state, card);
    consider((card.baseIncome + synergy) * horizon - card.cost, card.cost, weight);
  });

  eachTopCard(state.decks?.upgrade, (card, weight) => {
    if (card.cost <= coins) return;
    consider(card.incomeBonus * horizon - card.cost, card.cost, weight);
  });

  eachTopCard(state.decks?.event, (card, weight) => {
    if (card.cost <= coins) return;
    if (card.trigger !== 'Investment') return; // only purchase events are bankable targets
    consider(card.coinDelta + card.reputationDelta - card.cost, card.cost, weight);
  });

  return best;
}

/**
 * Scores the implicit "bank actions" option — the expected value of ending
 * the turn early with `actionsRemaining > 0` and banking the unused actions
 * for a future high-value play (CG-0MT3JMGA60091J8W).
 *
 * Hybrid heuristic (AC3, producer answer Q1c):
 *   - **Visible targets (a):** the best unaffordable high-value card in hand
 *     or measured in the market row, using the same income/synergy horizon
 *     heuristic as the spending path.
 *   - **Pipeline look-ahead (b):** the best unaffordable card among the next
 *     `lookAheadDepth` cards of each drawable deck, decayed by queue position
 *     and by {@link PIPELINE_TARGET_WEIGHT}.
 *
 * The final score weights each target by:
 *   - **Closeness** — `1 - gap/cost`; targets almost in reach score higher.
 *   - **Planning horizon** — normalised `horizon / cap` (`aiPlanningHorizon`,
 *     CG-0MSN1A71G005AF7W / Q3): banking is worth more early in the game.
 *   - **Bank headroom** — `(cap - banked)/cap`; an emptier bank gains more.
 *   - **Difficulty aggressiveness** (Q6) — scaled after the threshold so Easy
 *     genuinely under-banks and Hard over-banks on identical states.
 *
 * At bank cap or with `actionsRemaining <= 0` the option scores 0, so the
 * cap needs no special case (AC4). Targets with `closeness < 0.05` and any
 * final score below 1 are discarded as noise.
 *
 * @param state      Current game state (read-only by convention).
 * @param difficulty Difficulty whose profile gates depth/aggressiveness.
 *                   Defaults to the state's configured difficulty.
 * @returns Score for the bank option (0 means no reason to bank).
 */
export function scoreBankOption(
  state: MainStreetState,
  difficulty: DifficultyName = state.config.difficultyName,
): number {
  const banked = state.bankedActions ?? 0;
  if (banked >= BANK_CAP) return 0;
  if ((state.actionsRemaining ?? 1) <= 0) return 0;

  const profile = BANKING_DIFFICULTY_PROFILES[difficulty] ?? BANKING_DIFFICULTY_PROFILES.Medium;
  const coins = state.resourceBank.coins;
  const horizon = aiPlanningHorizon(state);
  const horizonFactor = horizon / AI_HORIZON_CAP;
  const bankHeadroom = (BANK_CAP - banked) / BANK_CAP;

  const visible = bestVisibleBankTarget(state, coins, horizon);
  const pipeline = bestPipelineBankTarget(state, coins, horizon, profile.lookAheadDepth);
  if (!visible && !pipeline) return 0;

  const valueOf = (target: BankTarget): number => {
    const gap = target.cost - coins; // > 0 by construction
    const closeness = Math.max(0, 1 - gap / target.cost);
    // Far targets (closeness near 0) must not dominate marginal spends.
    if (closeness < 0.05) return 0;
    return target.score * closeness * horizonFactor * bankHeadroom * target.weight;
  };

  const raw = (visible ? valueOf(visible) : 0) + (pipeline ? valueOf(pipeline) : 0);
  // Threshold: banking must exceed a minimal value to be preferred over a
  // zero-income spend; difficulty then scales how readily the AI hoards.
  const scaled = raw * profile.aggressiveness;
  if (scaled < 1) return 0;
  return scaled;
}

// ── Strategy Interface ──────────────────────────────────────

/**
 * An AI strategy for Main Street.
 *
 * The strategy receives the full game state and an RNG, and returns
 * a single PlayerAction to execute during the MarketPhase.
 *
 * Strategies should call `enumerateLegalActions` to discover valid
 * actions rather than hard-coding game logic.
 */
export interface MainStreetAiStrategy extends AiStrategyBase {
  /**
   * Choose an action for the current market phase.
   *
   * @param state Current game state (read-only by convention).
   * @param rng   Seeded random number generator.
   * @returns The chosen PlayerAction.
   */
  chooseAction(state: MainStreetState, rng: () => number): PlayerAction;
}

// ── Legal Action Enumeration ────────────────────────────────

/**
 * Produces all valid PlayerAction options for the given state.
 *
 * Covers all action types for the single-row market
 * (CG-0MSTOATDT009BRX2):
 *   - `buy-business` / `buy-upgrade`: direct buy-and-place (pays immediately)
 *   - `buy-event`: take an Investment event to hand (1 action — CG-0MTFWBNL30043ZBM;
 *     pays the listed cost at play), one entry per event in the market row
 *   - `move-to-hand`: take a non-event card to hand (1 action; bounded by hand
 *     capacity)
 *   - `play-*-from-hand`: cost-at-play placement/activation from the hand
 *   - `discard-from-hand`: costs the card's coin value in reputation
 *     (CG-0MTQ7KUVF009ELQK); only enumerated when the hand is full, so the AI
 *     never gratuitously discards
 *   - `end-turn`: always included
 *
 * Every action returned here is guaranteed to be accepted by `executeAction`.
 *
 * @param state Current game state.
 * @returns Array of legal PlayerActions.
 */
export function enumerateLegalActions(state: MainStreetState): PlayerAction[] {
  const actions: PlayerAction[] = [];
  const hand = state.hand ?? [];
  const emptySlots = getEmptySlots(state);

  // ── Community Favour (CG-0MSTOATDQ005XDET) ────────────────
  // A FREE once-per-turn resource exchange (does not consume
  // actionsRemaining), so it stays available even when the daily action
  // budget is spent — as a fallback when the player cannot afford any market
  // purchase. Legal only during MarketPhase, once per turn, and when the
  // input resource suffices.
  if (
    state.phase === 'MarketPhase' &&
    !state.favourUsedThisTurn
  ) {
    if (state.resourceBank.coins >= state.config.favourCoinsToRepCost) {
      actions.push({ type: 'community-favour', direction: 'coins-to-rep' });
    }
    if (state.resourceBank.reputation >= state.config.favourRepToCoinsRepCost) {
      actions.push({ type: 'community-favour', direction: 'rep-to-coins' });
    }
  }

  // Action economy (CG-0MSTOF1N5005PK2R): when the daily action budget is
  // spent, only end-turn is legal. Free operations (refresh/sell/hint/
  // discard/end-turn) stay available to the player, but the AI simply ends
  // the day rather than cycling through non-actions. The free Community
  // Favour fallback (added above) stays legal too — with end-turn always
  // present so the AI loop still terminates.
  //
  // Same-week composite plays are the exception (CG-0MT40HTYN008TJ6Q,
  // CG-0MTH5CC4H003Q4B3): applying an upgrade or playing an Investment event
  // that was moved to hand this turn costs no action (the move already spent
  // it), so they stay legal (and valuable) even at zero remaining actions.
  // Mirrors the human flow, where the composite remains playable after the
  // move has spent the day's action.
  if ((state.actionsRemaining ?? 1) <= 0) {
    return [
      ...actions,
      ...sameWeekCompositeUpgradeActions(state),
      ...sameWeekCompositeEventActions(state),
      { type: 'end-turn' },
    ];
  }

  // ── buy-business (direct buy-and-place, pays immediately) ──
  for (const card of state.market.cards) {
    if (card.family !== 'business' && card.family !== 'community-space') continue;
    for (const slotIndex of emptySlots) {
      const result = canPurchaseBusiness(state, card.id, slotIndex);
      if (result.legal) {
        actions.push({ type: 'buy-business', cardId: card.id, slotIndex });
      }
    }
  }

  // ── buy-upgrade (direct, pays immediately) ────────────────
  const upgradeCards = state.market.cards.filter(
    c => c.family === 'upgrade',
  ) as UpgradeCard[];
  for (const card of upgradeCards) {
    const canBuy = canPurchaseUpgrade(state, card.id);
    if (!canBuy.legal) continue;

    // Generate one action per valid target slot so the AI can choose
    // which slot to upgrade (important for branching upgrade paths).
    const requiredLevel = card.requiredLevel ?? 0;
    for (let i = 0; i < state.streetGrid.length; i++) {
      const biz = state.streetGrid[i];
      if (
        biz !== null &&
        biz.name === card.targetBusiness &&
        biz.level === requiredLevel &&
        biz.level < biz.maxLevel
      ) {
        actions.push({ type: 'buy-upgrade', cardId: card.id, targetSlot: i });
      }
    }
  }

  // ── buy-event (1 action; pays the listed cost at play) ───
  const eventCards = state.market.cards.filter(
    c => c.family === 'event',
  ) as EventCard[];
  for (const card of eventCards) {
    // `canPurchaseEvent` includes the action-budget gate, so no event is
    // offered once the day's action is spent (CG-0MTFWBNL30043ZBM).
    const result = canPurchaseEvent(state, card.id);
    if (result.legal) {
      actions.push({ type: 'buy-event', cardId: card.id });
    }
  }

  // ── hire-staff (direct hire from the market row, pays immediately) ──
  // Staff cards are hired straight from the general market row
  // (CG-0MT3KZOBZ005IRYE); never moved to the hand. Skip staff already
  // employed (same template) — one employee per role.
  const employedStaffTemplates = new Set(
    state.staffCards.map(s => s.id.replace(/-\d+$/, '')),
  );
  const staffCards = state.market.cards.filter(
    c => c.family === 'staff',
  ) as StaffCard[];
  for (const card of staffCards) {
    if (employedStaffTemplates.has(card.id.replace(/-\d+$/, ''))) continue;
    const result = canPurchaseStaff(state, card.id);
    if (result.legal) {
      actions.push({ type: 'hire-staff', cardId: card.id });
    }
  }

  // ── move-to-hand (1 action; bounded by hand capacity) ────
  // Staff cards are hired directly from the market row, never moved to the
  // hand (CG-0MT3KZNQB0053K55); skip them here. Investment events are also
  // skipped: they have their own `buy-event` action, which spends the same
  // single action and records the same-week composite tracker
  // (`justMovedEventCardId`) — enumerating them here too would let the AI
  // acquire an event without that tracker and double-offer the same action.
  if (canAddToHand(state).legal) {
    for (const card of state.market.cards) {
      if (card.family === 'staff' || card.family === 'event') continue;
      actions.push({ type: 'move-to-hand', cardId: card.id });
    }
  }

  // ── play-*-from-hand (cost-at-play) ───────────────────────
  hand.forEach((card, handIndex) => {
    if (card.family === 'business' || card.family === 'community-space') {
      if (state.resourceBank.coins < card.cost) return;
      for (const slotIndex of emptySlots) {
        actions.push({ type: 'play-business-from-hand', handIndex, slotIndex });
      }
    } else if (card.family === 'upgrade') {
      if (state.resourceBank.coins < card.cost) return;
      const requiredLevel = card.requiredLevel ?? 0;
      for (let i = 0; i < state.streetGrid.length; i++) {
        const biz = state.streetGrid[i];
        if (
          biz !== null &&
          biz.name === card.targetBusiness &&
          biz.level === requiredLevel &&
          biz.level < biz.maxLevel
        ) {
          actions.push({ type: 'play-upgrade-from-hand', handIndex, targetSlot: i });
        }
      }
    } else if (card.family === 'event' && card.trigger === 'Investment') {
      if (String((card as any).id).startsWith('evt-grand-opening') && !(state as any).businessPlacedThisTurn) return;
      if (state.resourceBank.coins >= card.cost) {
        actions.push({ type: 'play-event-from-hand', handIndex });
      }
    }
  });

  // ── discard-from-hand (costs reputation = card.cost; only enumerated
  //    when the hand is full — CG-0MTQ7KUVF009ELQK) ──
  if (hand.length >= (state.maxHandSize ?? 3)) {
    hand.forEach((_, handIndex) => {
      actions.push({ type: 'discard-from-hand', handIndex });
    });
  }

  // ── peek-incident-deck (staff peek skill, CG-0MSXOW6GN008ZSMN) ──
  // Legal only when a peek-capable staff member is employed, the deck
  // has a card to look at, and the once-per-turn peek has not been used
  // this turn (CG-0MT3KZOBZ005IRYE: the AI can now hire staff, so the
  // enumeration must reflect the peek legality gate or RandomStrategy
  // can draw an illegal second peek).
  const hasPeekStaff = hasPeekCapableStaff(state);
  if (hasPeekStaff && state.incidentDeck.length > 0 && !state.peekUsedThisTurn) {
    actions.push({ type: 'peek-incident-deck' });
  }

  // ── end-turn ──────────────────────────────────────────────
  actions.push({ type: 'end-turn' });

  return actions;
}

// ── RandomStrategy ──────────────────────────────────────────

/**
 * Returns the cheapest purchasable MARKET card cost (business/community-
 * space/upgrade/event/staff), or Infinity when the market is empty.
 *
 * Used by the Community Favour heuristic to detect a STALLED turn — a
 * player who cannot afford the cheapest market card cannot advance the
 * economy with normal purchases, so the free rep→coins exchange is the
 * right fallback. Staff cards are part of the general market row
 * (CG-0MT3KZNQB0053K55), so they are included like any other family.
 */
function getCheapestMarketCost(state: MainStreetState): number {
  const marketCards = state.market?.cards ?? [];
  let cheapest = Infinity;
  for (const card of marketCards) {
    if (typeof card !== 'object' || card === null) continue;
    const cost = (card as { cost?: number }).cost;
    if (typeof cost === 'number' && cost >= 0 && cost < cheapest) cheapest = cost;
  }
  return cheapest;
}

// ── RandomStrategy ──────────────────────────────────────────

// ── Same-week composite helpers (CG-0MT40HTYN008TJ6Q) ────────

/**
 * Whether applying the hand card at `handIndex` is a free same-week composite
 * — i.e. it was moved to the hand this turn, so the move already spent the
 * day's action and the apply costs nothing.
 *
 * @param state      Current game state (read-only by convention).
 * @param handIndex  Index into `state.hand`.
 * @returns `true` when the play would consume no action.
 */
export function isFreeSameWeekUpgradePlay(state: MainStreetState, handIndex: number): boolean {
  const card = (state.hand ?? [])[handIndex] as UpgradeCard | undefined;
  if (!card || card.family !== 'upgrade') return false;
  return state.justMovedUpgradeCardId != null && state.justMovedUpgradeCardId === card.id;
}

/**
 * The legal free same-week composite upgrade plays for the current state.
 *
 * These consume no daily action, so they are enumerated even when the budget
 * is spent (unlike every other action-consuming upgrade path). Eligibility
 * mirrors `playUpgradeFromHand`: enough coins, and a business matching the
 * upgrade's target at exactly its required level and below max level.
 *
 * @param state Current game state (read-only by convention).
 * @returns Legal `play-upgrade-from-hand` actions that cost no action.
 */
function sameWeekCompositeUpgradeActions(state: MainStreetState): PlayerAction[] {
  const actions: PlayerAction[] = [];
  const hand = state.hand ?? [];
  hand.forEach((card, handIndex) => {
    if (card.family !== 'upgrade') return;
    if (!isFreeSameWeekUpgradePlay(state, handIndex)) return;
    const upgrade = card as UpgradeCard;
    if (state.resourceBank.coins < upgrade.cost) return;
    const requiredLevel = upgrade.requiredLevel ?? 0;
    for (let i = 0; i < state.streetGrid.length; i++) {
      const biz = state.streetGrid[i];
      if (
        biz !== null &&
        biz.name === upgrade.targetBusiness &&
        biz.level === requiredLevel &&
        biz.level < biz.maxLevel
      ) {
        actions.push({ type: 'play-upgrade-from-hand', handIndex, targetSlot: i });
      }
    }
  });
  return actions;
}

/**
 * Whether playing the hand card at `handIndex` is a free same-week event
 * composite — i.e. the Investment event was taken to hand this turn, so the
 * move already spent the day's action and the play costs nothing
 * (CG-0MTFWBNL30043ZBM).
 *
 * @param state      Current game state (read-only by convention).
 * @param handIndex  Index into `state.hand`.
 * @returns `true` when the play would consume no action.
 */
export function isFreeSameWeekEventPlay(state: MainStreetState, handIndex: number): boolean {
  const card = (state.hand ?? [])[handIndex] as EventCard | undefined;
  if (!card || card.family !== 'event' || card.trigger !== 'Investment') return false;
  return state.justMovedEventCardId != null && state.justMovedEventCardId === card.id;
}

/**
 * The legal free same-week composite event plays for the current state.
 *
 * These consume no daily action, so they are enumerated even when the budget
 * is spent (unlike the action-consuming `buy-event` / held-event play paths).
 * Eligibility mirrors `playEventFromHand`: an affordable Investment event that
 * is not blocked by the Grand Opening placement gate.
 *
 * @param state Current game state (read-only by convention).
 * @returns Legal `play-event-from-hand` actions that cost no action.
 */
function sameWeekCompositeEventActions(state: MainStreetState): PlayerAction[] {
  const actions: PlayerAction[] = [];
  const hand = state.hand ?? [];
  hand.forEach((card, handIndex) => {
    if (!isFreeSameWeekEventPlay(state, handIndex)) return;
    const event = card as EventCard;
    if (state.resourceBank.coins < event.cost) return;
    if (
      String((event as any).id).startsWith('evt-grand-opening') &&
      !(state as any).businessPlacedThisTurn
    ) {
      return;
    }
    actions.push({ type: 'play-event-from-hand', handIndex });
  });
  return actions;
}

/**
 * Value of spending the day's single action on a market acquisition — the
 * one tier shared by `move-to-hand` (non-event cards) and `buy-event`
 * (Investment events), because both cost the same action
 * (CG-0MTFWBNL30043ZBM). Ranking them in one tier (rather than a fixed
 * priority order) is what stops the event take from being starved now that
 * it is no longer a free extra action.
 *
 * - `buy-event`: the event's net play value ({@link scoreEventAction}).
 * - `move-to-hand`: the card's listed cost — a proxy for how valuable it is
 *   to lock in ahead of payment (unchanged heuristic).
 */
function scoreMarketAcquisition(
  state: MainStreetState,
  action: MoveToHandAction | BuyEventAction,
): number {
  if (action.type === 'buy-event') {
    return scoreEventAction(state, action);
  }
  const card = state.market.cards.find(c => c.id === action.cardId);
  return card ? card.cost : 0;
}

/**
 * Value of the best affordable market acquisition available this turn — the
 * capacity benefit of freeing a hand slot (CG-0MTQ7KUVF009ELQK).
 *
 * Returns 0 when the hand already has a free slot (freeing another has no
 * value) or when nothing in the market is affordable. Otherwise it mirrors
 * {@link scoreMarketAcquisition}'s move-to-hand proxy (a card's listed cost;
 * an event's net play value).
 *
 * Discard scoring subtracts the discarded card's coin cost (the reputation
 * loss) from this benefit, so the AI only discards when freeing a slot is
 * worth the reputation paid, and prefers lower-cost cards.
 */
function bestMarketAcquisitionValue(state: MainStreetState): number {
  const hand = state.hand ?? [];
  if (hand.length < (state.maxHandSize ?? 3)) return 0;
  let best = 0;
  for (const card of state.market.cards) {
    if (card.family === 'staff') continue;
    const cost = (card as { cost?: number }).cost ?? 0;
    if (state.resourceBank.coins < cost) continue;
    best = Math.max(
      best,
      card.family === 'event'
        ? scoreEventAction(state, { type: 'buy-event', cardId: card.id })
        : cost,
    );
  }
  return best;
}

/**
 * Selects a uniformly random legal action each turn.
 *
 * Baseline strategy used for Monte Carlo balance testing and as a
 * fallback when no heuristic improvement is available.
 */
export const RandomStrategy: MainStreetAiStrategy = {
  name: 'Random',

  chooseAction(state: MainStreetState, rng: () => number): PlayerAction {
    const legalActions = enumerateLegalActions(state);
    return pickRandom(legalActions, rng);
  },
};

// ── Greedy spending routine ─────────────────────────────────

/**
 * Selects the best *free* same-week composite play (upgrade apply or event
 * play) — these consume no action, so they must be taken before any spending
 * or banking decision (CG-0MT40HTYN008TJ6Q, CG-0MTH5CC4H003Q4B3).
 *
 * @returns The chosen free play, or `null` when none is available.
 */
function pickFreeCompositePlay(
  state: MainStreetState,
  legalActions: PlayerAction[],
  rng: () => number,
): PlayerAction | null {
  const freeCompositePlays: PlayerAction[] = [
    ...(legalActions.filter(
      a => a.type === 'play-upgrade-from-hand',
    ) as PlayUpgradeFromHandAction[]).filter(a => isFreeSameWeekUpgradePlay(state, a.handIndex)),
    ...(legalActions.filter(
      a => a.type === 'play-event-from-hand',
    ) as PlayEventFromHandAction[]).filter(a => isFreeSameWeekEventPlay(state, a.handIndex)),
  ];
  if (freeCompositePlays.length === 0) return null;
  return pickBest(freeCompositePlays, a => scoreAction(state, a), rng);
}

/**
 * Shared greedy spending routine following the PRD M3 priority chain:
 *
 *   0. Free same-week composite play (no action cost)
 *   1. Play an affordable business from hand (best synergy placement)
 *   2. Play an affordable upgrade from hand
 *   3. Buy an upgrade (highest income gain per coin)
 *   4. Buy a business (best synergy placement)
 *   5. Spend the action on the best market acquisition
 *   6. Play a held Investment event with positive ROI
 *   8. Discard from a full hand
 *   9. Community Favour fallback
 *  10. Hire staff
 *  11. End turn
 *
 * This is the pure greedy baseline: it never banks actions with budget still
 * available. {@link BankingGreedyStrategy} layers the hoarding gate on top
 * and then delegates here.
 *
 * Ties at each priority level are broken randomly via `pickBest`.
 *
 * @param state        Current game state (read-only by convention).
 * @param rng          Seeded random number generator.
 * @param legalActions Pre-computed legal actions (recomputed when omitted).
 */
const chooseGreedyAction = (
  state: MainStreetState,
  rng: () => number,
  legalActions: PlayerAction[] = enumerateLegalActions(state),
): PlayerAction => {
    const handUpgradeActions = legalActions.filter(
      a => a.type === 'play-upgrade-from-hand',
    ) as PlayUpgradeFromHandAction[];
    const handEventActions = legalActions.filter(
      a => a.type === 'play-event-from-hand',
    ) as PlayEventFromHandAction[];

    // Priority 0: a free same-week composite play (upgrade apply or event
    // play) consumes no action, so it is taken before anything that spends
    // the budget — the rest of the day's plays stay available
    // (CG-0MT40HTYN008TJ6Q, CG-0MTH5CC4H003Q4B3).
    const freeComposite = pickFreeCompositePlay(state, legalActions, rng);
    if (freeComposite) {
      return freeComposite;
    }

    // Priority 1: play an affordable business from hand (cost-at-play) with
    // the best synergy placement score.
    const handBusinessActions = legalActions.filter(
      a => a.type === 'play-business-from-hand',
    ) as PlayBusinessFromHandAction[];
    if (handBusinessActions.length > 0) {
      return pickBest(handBusinessActions, a => scorePlayBusinessFromHandAction(state, a), rng);
    }

    // Priority 2: play an affordable upgrade from hand (cost-at-play). Upgrades
    // held from a previous day consume the daily action; the free same-week
    // composite was already handled by Priority 0 above.
    if (handUpgradeActions.length > 0) {
      return pickBest(handUpgradeActions, a => scorePlayUpgradeFromHandAction(state, a), rng);
    }

    // Priority 3: buy upgrades (highest income gain per coin)
    const upgradeActions = legalActions.filter(a => a.type === 'buy-upgrade') as BuyUpgradeAction[];
    if (upgradeActions.length > 0) {
      return pickBest(upgradeActions, a => scoreUpgradeAction(state, a), rng);
    }

    // Priority 4: buy business for best synergy placement (direct, immediate pay)
    const businessActions = legalActions.filter(a => a.type === 'buy-business') as BuyBusinessAction[];
    if (businessActions.length > 0) {
      return pickBest(businessActions, a => scoreBusinessAction(state, a), rng);
    }

    // Priority 5: spend this week's action on the best market acquisition.
    // Moving a non-event card to hand and taking an Investment event to hand
    // cost the same single action (CG-0MTFWBNL30043ZBM), so they compete in
    // one value-ranked tier — a fixed priority order would starve the event
    // path now that it is no longer a free extra action. The event score is
    // its net play value (cost included); the move-to-hand score stays the
    // card's listed cost (lock-in value). Value-negative acquisitions are
    // skipped rather than taken for lack of anything else.
    const acquisitionActions = legalActions.filter(
      a => a.type === 'move-to-hand' || a.type === 'buy-event',
    ) as (MoveToHandAction | BuyEventAction)[];
    if (acquisitionActions.length > 0) {
      const best = pickBest(acquisitionActions, a => scoreMarketAcquisition(state, a), rng);
      if (scoreMarketAcquisition(state, best) > 0) {
        return best;
      }
    }
    // Priority 6: play a held Investment event with positive ROI
    if (handEventActions.length > 0) {
      const bestEvent = pickBest(handEventActions, a => scorePlayEventFromHandAction(state, a), rng);
      if (scorePlayEventFromHandAction(state, bestEvent) > 0) {
        return bestEvent;
      }
    }

    // Priority 8: discard from a full hand (frees capacity for moves).
    // Discarding costs the card's coin value in reputation, so only take it
    // when the capacity benefit outweighs the reputation loss; prefer the
    // lowest-cost card when several are worth discarding (CG-0MTQ7KUVF009ELQK).
    const discardActions = legalActions.filter(a => a.type === 'discard-from-hand');
    if (discardActions.length > 0) {
      const best = pickBest(discardActions, a => scoreAction(state, a), rng);
      if (scoreAction(state, best) > 0) {
        return best;
      }
    }

    // Priority 9: Community Favour fallback (CG-0MSTOATDQ005XDET).
    // A FREE once-per-turn exchange, reached only when nothing more
    // productive is available (no purchases/plays/moves). Only fires when
    // the best favour action is genuinely value-creating (score > 1:
    // e.g. rep-to-coins when cash-strapped). Neutral conversions (score 1)
    // are skipped — blindly burning coins for rep every turn destroys
    // liquidity and collapses the economy (a lossy exchange). This keeps
    // AI turns meaningful on an unaffordable market without dominating
    // normal purchases when affordable.
    const favourActions = legalActions.filter(
      a => a.type === 'community-favour',
    ) as CommunityFavourAction[];
    if (favourActions.length > 0) {
      const best = pickBest(favourActions, a => scoreAction(state, a), rng);
      if (scoreAction(state, best) > 1) {
        return best;
      }
    }

    // Priority 10: hire staff from the market row (CG-0MT3KZOBZ005IRYE).
    // Reached when no more productive purchase/play/move is available.
    // Hiring adds hand capacity and staff perks (GM actions, Accountant
    // refresh discount, ...), which beats ending the day early.
    const hireActions = legalActions.filter(
      a => a.type === 'hire-staff',
    ) as HireStaffAction[];
    if (hireActions.length > 0) {
      return pickBest(hireActions, a => scoreAction(state, a), rng);
    }

    // Priority 11: end turn
    return { type: 'end-turn' };
};

// ── GreedyStrategy ──────────────────────────────────────────

/**
 * The pure greedy baseline strategy (PRD M3 priority chain).
 *
 * Never banks actions: whenever the daily budget still has actions, it
 * spends them via {@link chooseGreedyAction}. Kept unchanged so existing
 * balance baselines remain valid; banking lives in
 * {@link BankingGreedyStrategy} (CG-0MT3JMGA60091J8W, AC1).
 */
export const GreedyStrategy: MainStreetAiStrategy = {
  name: 'Greedy',

  chooseAction(state: MainStreetState, rng: () => number): PlayerAction {
    return chooseGreedyAction(state, rng);
  },
};

// ── BankingGreedyStrategy ───────────────────────────────────

/**
 * Banking-aware greedy strategy (CG-0MT3JMGA60091J8W).
 *
 * Behaves exactly like {@link GreedyStrategy} except for one extra decision
 * evaluated before spending: the expected value of *banking* the remaining
 * action(s) — {@link scoreBankOption}, whose hybrid visible + pipeline
 * look-ahead depth and aggressiveness scale with difficulty. When that value
 * exceeds the best immediate spend, the AI deliberately returns `end-turn`
 * with actions remaining so the engine banks them for a later multi-action
 * play (AC2). Otherwise it delegates to the shared greedy chain.
 *
 * At bank cap (2) or with no actions remaining the bank option scores 0, so
 * the cap needs no special case (AC4).
 */
export const BankingGreedyStrategy: MainStreetAiStrategy = {
  name: 'BankingGreedy',

  chooseAction(state: MainStreetState, rng: () => number): PlayerAction {
    const legalActions = enumerateLegalActions(state);

    // Free same-week composite plays consume no action — take them before
    // considering a hoard so a free play is never traded for a bank.
    const freeComposite = pickFreeCompositePlay(state, legalActions, rng);
    if (freeComposite) {
      return freeComposite;
    }

    // Deliberate hoarding: bank only when the expected value of the banked
    // action exceeds the value of the best immediate spend.
    const bankScore = scoreBankOption(state);
    if (bankScore > 0) {
      const bestSpend = Math.max(
        0,
        ...legalActions
          .filter(a => a.type !== 'end-turn')
          .map(a => scoreAction(state, a)),
      );
      if (bankScore > bestSpend) {
        return { type: 'end-turn' };
      }
    }

    return chooseGreedyAction(state, rng, legalActions);
  },
};

// ── AiPlayer ────────────────────────────────────────────────

/**
 * Main Street AI player binding a strategy and RNG.
 *
 * Extends the shared {@link AiPlayerBase} and adds `chooseAction` and
 * `playGame` convenience methods.
 */
export class MainStreetAiPlayer extends AiPlayerBase<MainStreetAiStrategy> {
  constructor(
    strategy: MainStreetAiStrategy = GreedyStrategy,
    rng: () => number = Math.random,
  ) {
    super(strategy, rng);
  }

  /**
   * Choose a single action for the current market phase.
   *
   * Delegates to the strategy, hiding the `rng` parameter from callers.
   */
  chooseAction(state: MainStreetState): PlayerAction {
    return this.strategy.chooseAction(state, this.rng);
  }

  /**
   * Run a complete game from setup to game-end.
   *
   * The caller is responsible for setting up the state (via
   * `setupMainStreetGame`). This method drives the game loop,
   * choosing actions each turn until the game ends.
   *
   * @param state An already-set-up MainStreetState (mutated in-place).
   */
  playGame(state: MainStreetState): void {
    while (state.gameResult === 'playing') {
      executeWeekStart(state);

      // Execute actions until end-turn is chosen or game ends
      let action = this.chooseAction(state);
      while (action.type !== 'end-turn') {
        executeAction(state, action);
        // Record AI action for transcript if recorder is present
        try {
          recordMainStreetEvent({ type: 'ai-action', turn: state.turn, strategy: this.strategy.name, action });
        } catch (_) {}
        if (state.gameResult !== 'playing') break;
        action = this.chooseAction(state);
      }

      processEndOfTurn(state);
      // Dual-choice incident (CG-0MTSHG8RP008E128): processEndOfTurn pauses
      // with choicePending when the drawn incident requires a decision.
      // Resolve it per the difficulty strategy so the sim never stalls.
      if (state.pendingEventChoice && !state.pendingEventChoice.resolved) {
        resolveAiEventChoice(state);
      }
    }
  }
}

// ── Dual-Choice Event Policy (CG-0MTSHG8RP008E128) ──────────────
// The Accept/Reject policy lives in the engine (MainStreetEngine) so headless
// convenience turns (executeFullTurn, playGame, the Monte Carlo harness) can
// resolve a pending choice without importing this strategy module (circular).
// Re-exported here so callers/tests importing the AI module's public API are
// unchanged. resolveAiEventChoice is kept as a thin wrapper (same semantics:
// resolve the pending choice per difficulty and finish the deferred closing).
export {
  AI_EVENT_CHOICE_SIGNIFICANTLY_WORSE_RATIO,
  projectEventCoinDelta,
  eventSeverity,
  decideEventChoice,
  resolvePendingEventChoice,
} from './MainStreetEngine';

/**
 * Resolves a pending dual-choice incident using the difficulty-based policy
 * (Easy/Medium/Hard from `state.config.difficultyName`) and completes the
 * deferred closing, so headless/AI turns never stall on a pending choice
 * (AC21-23). Records the decision via the engine's resolveEventChoice
 * (identical transcript shape to a player choice).
 *
 * @param state Current game state (mutated). No-op when no choice is pending.
 */
export function resolveAiEventChoice(state: MainStreetState): void {
  resolvePendingEventChoice(state);
}

// ── Scoring Helpers ─────────────────────────────────────────

/**
 * Score an upgrade action.
 *
 *   score = incomeBonus * horizon - cost
 *
 * where `horizon` is the AI planning horizon derived from the distance to
 * the win threshold (`aiPlanningHorizon`, CG-0MSLXJCHH001DLIO). Higher
 * income bonus upgrades are preferred; a larger horizon scales the value
 * of future income, so early-game (far-from-threshold) upgrades score higher.
 */
function scoreUpgradeAction(
  state: MainStreetState,
  action: BuyUpgradeAction,
): number {
  const card = state.market.cards.find(
    c => c.id === action.cardId && c.family === 'upgrade',
  ) as UpgradeCard | undefined;
  if (!card) return 0;

  const horizon = aiPlanningHorizon(state);
  return card.incomeBonus * horizon - card.cost;
}

/**
 * Score a business placement.
 *
 *   score = (baseIncome + projectedSynergyBonus) * horizon - cost
 *
 * `projectedSynergyBonus` is evaluated at `candidateSlot` as if the business
 * were already placed there. `horizon` is the AI planning horizon derived
 * from the distance to the win threshold (`aiPlanningHorizon`,
 * CG-0MSLXJCHH001DLIO). Higher scores favour early high-synergy placements.
 */
function scoreBusinessAction(
  state: MainStreetState,
  action: BuyBusinessAction,
): number {
  const card = state.market.cards.find(c => c.id === action.cardId) as BusinessCard | undefined;
  if (!card) return 0;

  // Simulate placement: shallow-clone the grid and insert the new card
  const simulatedGrid = [...state.streetGrid];
  simulatedGrid[action.slotIndex] = card;

  // Projected synergy bonus for the new card at the candidate slot
  const projectedSynergyBonus = computeSynergyBonus(
    simulatedGrid,
    action.slotIndex,
    state.config.synergyBonusPerNeighbor,
  );

  const horizon = aiPlanningHorizon(state);
  return (card.baseIncome + projectedSynergyBonus) * horizon - card.cost;
}

/**
 * Score taking an Investment event from the market to the player's hand.
 *
 * The take costs the day's **one action** (CG-0MTFWBNL30043ZBM), exactly like
 * a business `move-to-hand`, so the AI judges it as a competing use of that
 * action rather than a free extra. The score is therefore the event's **net
 * final-score value once played** — `coinDelta + reputationDelta - cost` —
 * matching {@link scorePlayEventFromHandAction}: an event is only worth
 * spending the action to acquire when playing it later is itself
 * value-positive.
 *
 * No coins are deducted at take time (cost-at-play, CG-0MT5W1V4D007NN8Q): the
 * subtraction is the deferred play cost, not an immediate charge. Reputation
 * is valued at 1 point per unit (plain count), matching the final score
 * function (CG-0MT3J8FXG006RCOA).
 */
function scoreEventAction(
  state: MainStreetState,
  action: BuyEventAction,
): number {
  const card = state.market.cards.find(
    c => c.id === action.cardId && c.family === 'event',
  ) as EventCard | undefined;
  if (!card) return 0;

  return card.coinDelta + card.reputationDelta - card.cost;
}

/**
 * Scores playing a business from hand: same placement heuristic as
 * `scoreBusinessAction` (income + synergy over the horizon), with the card
 * located in the hand instead of the market.
 */
function scorePlayBusinessFromHandAction(
  state: MainStreetState,
  action: PlayBusinessFromHandAction,
): number {
  const card = (state.hand ?? [])[action.handIndex] as BusinessCard | undefined;
  if (!card) return 0;

  const simulatedGrid = [...state.streetGrid];
  simulatedGrid[action.slotIndex] = card;
  const projectedSynergyBonus = computeSynergyBonus(
    simulatedGrid,
    action.slotIndex,
    state.config.synergyBonusPerNeighbor,
  );
  const horizon = aiPlanningHorizon(state);
  return (card.baseIncome + projectedSynergyBonus) * horizon - card.cost;
}

/**
 * Scores playing an upgrade from hand: income bonus over the horizon minus
 * the cost paid at play time.
 */
function scorePlayUpgradeFromHandAction(
  state: MainStreetState,
  action: PlayUpgradeFromHandAction,
): number {
  const card = (state.hand ?? [])[action.handIndex] as UpgradeCard | undefined;
  if (!card) return 0;
  const horizon = aiPlanningHorizon(state);
  return card.incomeBonus * horizon - card.cost;
}

/**
 * Scores playing an Investment event from hand: coin/reputation value minus
 * the cost paid at play time.
 */
function scorePlayEventFromHandAction(
  state: MainStreetState,
  action: PlayEventFromHandAction,
): number {
  const card = (state.hand ?? [])[action.handIndex] as EventCard | undefined;
  if (!card) return 0;
  return card.coinDelta + card.reputationDelta - card.cost;
}

// ── Public Scoring API ──────────────────────────────────────

/**
 * Score a single PlayerAction for the given state using the Greedy heuristics.
 *
 * Scores are in "net coin-equivalent value" units:
 *   - `buy-upgrade`:  `incomeBonus * horizon - cost`
 *   - `buy-business`: `(baseIncome + projectedSynergyBonus) * horizon - cost`
 *   - `buy-event`:    `coinDelta + reputationDelta - cost` (net play value;
 *                     the take itself spends the day's one action)
 *   - `play-event`:   fixed bonus of 5 (prefer playing over end-turn)
 *   - `end-turn`:     0 (baseline / fallback)
 *
 * `horizon` is the AI planning horizon derived from the distance to the
 * win threshold (`aiPlanningHorizon`, CG-0MSLXJCHH001DLIO), replacing the
 * former PRD Appendix A `remainingTurns = maxTurns - turn` factor now that
 * default presets are unlimited.
 *
 * @param state  Current game state (read-only by convention).
 * @param action The action to score.
 * @returns Numeric score (higher is better).
 */
export function scoreAction(state: MainStreetState, action: PlayerAction): number {
  switch (action.type) {
    case 'buy-upgrade':
      return scoreUpgradeAction(state, action);
    case 'buy-business':
      return scoreBusinessAction(state, action);
    case 'buy-event':
      return scoreEventAction(state, action);
    case 'play-business-from-hand':
      return scorePlayBusinessFromHandAction(state, action);
    case 'play-upgrade-from-hand':
      return scorePlayUpgradeFromHandAction(state, action);
    case 'play-event-from-hand':
      return scorePlayEventFromHandAction(state, action);
    case 'play-event': {
      const card = (state.hand ?? []).find(c => c.family === 'event') as EventCard | undefined;
      return card
        ? card.coinDelta + card.reputationDelta - card.cost
        : 0;
    }
    case 'move-to-hand':
      return 0;
    case 'discard-from-hand': {
      // Discarding costs the card's coin value in reputation; weigh that
      // against the capacity benefit of freeing a hand slot so the AI only
      // discards when it is worth it, and prefers lower-cost cards
      // (CG-0MTQ7KUVF009ELQK).
      const card = (state.hand ?? [])[action.handIndex];
      if (!card) return 0;
      return bestMarketAcquisitionValue(state) - (card.cost ?? 0);
    }
    case 'end-turn':
      return 0;
    // Action economy actions (CG-0MSTOF1N5005PK2R). Minimal scoring for now;
    // the AI strategy child (CG-0MSX41S7I009MMZN) refines budget-aware scoring.
    case 'buy-and-place':
      return scoreBusinessAction(state, { type: 'buy-business', cardId: action.cardId, slotIndex: action.slotIndex });
    case 'hire-staff':
      // Net value of expanded hand slots vs. cost + ongoing cost (rough estimate).
      return 2;
    case 'peek-incident-deck':
      // Staff peek skill (CG-0MSXOW6GN008ZSMN): foresight is mildly useful,
      // but a greedy heuristic cannot exploit the revealed card, so it scores
      // below most productive actions.
      return 1;
    case 'community-favour':
      // Community Favour (CG-0MSTOATDQ005XDET): a free fallback when the
      // player cannot afford purchases. rep-to-coins is genuinely valuable
      // only when the player is STALLED (cannot afford the cheapest market
      // card) AND the conversion leaves a reputation buffer (reputation
      // after the exchange stays >= 1) — burning the last reputation would
      // trigger reputation-collapse loss. Otherwise the exchange is a
      // low-value (score 1) legal fallback that never outranks purchases.
      if (action.direction === 'rep-to-coins') {
        const cheapestCardCost = getCheapestMarketCost(state);
        // Convert only when genuinely stalled (cannot afford the cheapest
        // market card) AND the conversion leaves a reputation buffer
        // (reputation after the exchange stays >= 1) — burning the last
        // reputation would trigger reputation-collapse loss.
        if (
          Number.isFinite(cheapestCardCost) &&
          state.resourceBank.coins < cheapestCardCost &&
          state.resourceBank.reputation >= state.config.favourRepToCoinsRepCost + 1
        ) {
          return 3; // useful fallback when stalled with rep to spare
        }
        return 1;
      }
      // coins-to-rep: spending scarce coins on reputation is rarely better
      // than buying cards; stays as a legal fallback at the low default.
      return 1;
    case 'buy-and-place-upgrade':
      return scoreUpgradeAction(state, { type: 'buy-upgrade', cardId: action.cardId, targetSlot: action.targetSlot });
    default:
      return 0;
  }
}

/**
 * Enumerate all legal actions for the given state and compute a heuristic
 * score for each one.
 *
 * This is the primary building block for the Greedy strategy and the hint
 * system.  Callers can sort by score descending or pass the results directly
 * to `pickBest` to select the highest-scoring action with tie-breaking.
 *
 * @param state Current game state.
 * @returns Array of `{ action, score }` pairs for every legal action.
 */
export function enumerateAndScoreActions(
  state: MainStreetState,
): Array<{ action: PlayerAction; score: number }> {
  return enumerateLegalActions(state).map(action => ({
    action,
    score: scoreAction(state, action),
  }));
}

// ── Competitive mode: ownership-aware, staff-free AI (CG-0MT5X3N79002S038) ──
//
// The single-player helpers above assume the AI owns the whole street and
// controls the shared wallet / hand / staff. In competitive mode (N >= 2)
// each player has an independent PlayerRecord and every street slot is
// owner-tagged. This section adds a parallel decision layer used by the
// opponent:
//
//   - enumerateCompetitiveLegalActions(state, playerId): legal actions for
//     the ACTING player, with staff actions (hire-staff, peek-incident-deck)
//     EXCLUDED — staff are player-only in competitive mode.
//   - scoreCompetitiveAction(state, action, playerId): value scored against
//     the acting player's OWN resources and owned businesses, with the
//     planning horizon derived from the acting player's own score vs. the
//     win threshold.
//   - CompetitiveGreedyStrategy: the Greedy priority chain wired to the two
//     helpers above.
//
// Single-player paths (enumerateLegalActions / scoreAction / GreedyStrategy)
// are untouched — N=1 keeps using them byte-for-byte (AC4).

/**
 * True when the state carries a competitive roster (N >= 2 players).
 *
 * N=1 is the single-player case and deliberately returns `false` so the
 * legacy helpers keep being used unchanged.
 */
export function isCompetitiveMode(state: MainStreetState): boolean {
  return (state.players?.length ?? 0) > 1;
}

/**
 * Resolves the acting player's record in competitive mode.
 *
 * @param state    Current game state.
 * @param playerId Owner index; defaults to the active player (0 if unset).
 * @returns The `PlayerRecord`, or `undefined` in single-player states.
 */
export function getCompetitivePlayer(
  state: MainStreetState,
  playerId?: number,
): PlayerRecord | undefined {
  if (!state.players || state.players.length === 0) return undefined;
  const id = playerId ?? state.activePlayerId ?? 0;
  return state.players[id];
}

/**
 * Competitive planning horizon: the number of future turns a purchase is
 * expected to yield, derived from the ACTING PLAYER'S OWN score versus the
 * win threshold (not the shared `computeScore`).
 *
 *   horizon = clamp(ceil((winThreshold - player.score) / scorePace), floor, cap)
 *
 * A player far from the threshold values future income more (larger
 * horizon) than a player about to win — the ownership-aware counterpart of
 * `aiPlanningHorizon` (CG-0MSLXJCHH001DLIO).
 *
 * @param state    Current game state (read-only by convention).
 * @param playerId Owner index; defaults to the active player.
 * @returns Horizon in turns, always within [AI_HORIZON_FLOOR, AI_HORIZON_CAP].
 */
export function aiCompetitivePlanningHorizon(
  state: MainStreetState,
  playerId?: number,
): number {
  // N=1 keeps the legacy shared-wallet horizon (per-player records are not
  // maintained in single-player flow).
  if (!isCompetitiveMode(state)) return aiPlanningHorizon(state);
  const player = getCompetitivePlayer(state, playerId);
  if (!player) return aiPlanningHorizon(state);
  const distance = state.config.winThreshold - (player.score ?? 0);
  const raw = Math.ceil(distance / AI_SCORE_PACE);
  return Math.min(AI_HORIZON_CAP, Math.max(AI_HORIZON_FLOOR, raw));
}

/** Empty street slots for the competitive board (owner tag wins). */
function competitiveEmptySlots(state: MainStreetState): number[] {
  const slots: number[] = [];
  for (let i = 0; i < state.streetGrid.length; i++) {
    const tag = state.ownerTaggedGrid?.[i];
    const empty = tag ? tag.ownerId === null : state.streetGrid[i] === null;
    if (empty) slots.push(i);
  }
  return slots;
}

/**
 * Street slots owned by `playerId` that are valid targets for `card`
 * (name match, required level, below max level). Only the acting player's
 * own businesses are upgradeable in competitive mode.
 */
function competitiveUpgradeTargets(
  state: MainStreetState,
  card: UpgradeCard,
  playerId: number,
): number[] {
  const requiredLevel = card.requiredLevel ?? 0;
  const targets: number[] = [];
  for (let i = 0; i < state.streetGrid.length; i++) {
    const biz = state.streetGrid[i];
    if (!biz) continue;
    if (getSlotOwnerId(state, i) !== playerId) continue;
    if (biz.name !== card.targetBusiness) continue;
    if (biz.level !== requiredLevel) continue;
    if (biz.level >= biz.maxLevel) continue;
    targets.push(i);
  }
  return targets;
}

/** Number of the acting player's placed businesses matching `synergy`. */
function countOwnSynergyMatches(
  state: MainStreetState,
  synergy: SynergyType | undefined,
  playerId: number,
): number {
  if (!synergy) return 0;
  let count = 0;
  for (let i = 0; i < state.streetGrid.length; i++) {
    const biz = state.streetGrid[i];
    if (!biz || !biz.synergyTypes) continue;
    if (getSlotOwnerId(state, i) !== playerId) continue;
    if (biz.synergyTypes.includes(synergy)) count += 1;
  }
  return count;
}

/**
 * Estimated value of an event to the acting player in competitive mode.
 *
 * Mirrors `applyCompetitiveEventEffects` routing without mutating state:
 *   - `All` / `RandomBusiness` → the full `coinDelta + reputationDelta`
 *     (Investment credits only the acting player; incidents credit every
 *     owner, but the AI only values what it receives).
 *   - `SpecificSynergy` → `coinDelta × (own matching businesses)` plus
 *     `reputationDelta` once when at least one own business matches.
 *   - Duration cards → 0 (board-wide, host-applied only).
 *
 * @param state     Current game state (read-only by convention).
 * @param event     The event card being valued.
 * @param playerId  Owner index; defaults to the active player.
 * @returns Net value in coin-equivalent units (0 when the player gains nothing).
 */
export function computeCompetitiveEventValue(
  state: MainStreetState,
  event: EventCard,
  playerId?: number,
): number {
  const player = getCompetitivePlayer(state, playerId);
  const pid = player?.playerId ?? playerId ?? 0;
  if (isDurationEventCard(event)) return 0;
  // Proportional events (CG-0MTQ7W0ZX0059R3J) are valued against the
  // acting player's own banked balance and effective rate, mirroring
  // applyCompetitiveEventEffects. Flat events keep the nominal `coinDelta`.
  const baseCoinDelta = event.coinPercentDelta === undefined
    ? event.coinDelta
    : -computeProportionalCoinLoss(
        player?.coins ?? state.resourceBank.coins,
        computeTaxAuditRate(player?.staffCards ?? [], Math.abs(event.coinPercentDelta)),
      );
  switch (event.target) {
    case 'All':
    case 'RandomBusiness':
      return baseCoinDelta + event.reputationDelta;
    case 'SpecificSynergy': {
      const matches = countOwnSynergyMatches(state, event.targetSynergy as SynergyType, pid);
      if (matches === 0) return 0;
      return (event.coinPercentDelta !== undefined ? baseCoinDelta : baseCoinDelta * matches) + event.reputationDelta;
    }
    default:
      return 0;
  }
}

// ── Competitive legal-action enumeration ────────────────────

/**
 * Produces all valid PlayerAction options for the ACTING player in
 * competitive mode, using only that player's own resources (coins,
 * reputation, hand, action budget) and their owner-tagged businesses.
 *
 * Differences from the single-player {@link enumerateLegalActions}:
 *   - staff actions are **excluded** (`hire-staff` and the staff-skill
 *     `peek-incident-deck`) — an opponent never manages staff (AC2);
 *   - affordability / hand capacity / action budget read the acting
 *     player's `PlayerRecord`, not the shared single-player fields;
 *   - upgrade targets are restricted to the acting player's own slots
 *     (`ownerTaggedGrid`); empty slots come from the owner-tagged grid.
 *
 * Single-player enumeration is left untouched (AC4).
 *
 * @param state    Current game state.
 * @param playerId Owner index; defaults to the active player.
 * @returns Array of legal PlayerActions for the acting player.
 */
export function enumerateCompetitiveLegalActions(
  state: MainStreetState,
  playerId?: number,
): PlayerAction[] {
  // N=1 (or a state without a roster) is single-player: fall back to the
  // unchanged legacy enumeration.
  if (!isCompetitiveMode(state)) return enumerateLegalActions(state);
  const player = getCompetitivePlayer(state, playerId);
  if (!player) return enumerateLegalActions(state);

  const pid = player.playerId;
  const coins = player.coins ?? 0;
  const reputation = player.reputation ?? 0;
  const hand = player.hand ?? [];
  const budget = player.actionBudget ?? 0;
  const maxHandSize = state.maxHandSize ?? 3;
  const emptySlots = competitiveEmptySlots(state);
  const actions: PlayerAction[] = [];

  // ── Community Favour (FREE once-per-turn fallback) ────────
  if (state.phase === 'MarketPhase' && !state.favourUsedThisTurn) {
    if (coins >= state.config.favourCoinsToRepCost) {
      actions.push({ type: 'community-favour', direction: 'coins-to-rep' });
    }
    if (reputation >= state.config.favourRepToCoinsRepCost) {
      actions.push({ type: 'community-favour', direction: 'rep-to-coins' });
    }
  }

  // Action budget spent: only free same-week composites and end-turn remain.
  if (budget <= 0) {
    return [
      ...actions,
      ...competitiveSameWeekUpgradeActions(state, player),
      ...competitiveSameWeekEventActions(state, player),
      { type: 'end-turn' },
    ];
  }

  // ── buy-business (direct buy-and-place) ───────────────────
  for (const card of state.market.cards) {
    if (card.family !== 'business' && card.family !== 'community-space') continue;
    if (coins < card.cost) continue;
    for (const slotIndex of emptySlots) {
      actions.push({ type: 'buy-business', cardId: card.id, slotIndex });
    }
  }

  // ── buy-upgrade (own businesses only) ─────────────────────
  const marketUpgrades = state.market.cards.filter(
    c => c.family === 'upgrade',
  ) as UpgradeCard[];
  for (const card of marketUpgrades) {
    if (coins < card.cost) continue;
    for (const targetSlot of competitiveUpgradeTargets(state, card, pid)) {
      actions.push({ type: 'buy-upgrade', cardId: card.id, targetSlot });
    }
  }

  // ── buy-event (1 action; cost paid at play) ───────────────
  if (hand.length < maxHandSize) {
    const marketEvents = state.market.cards.filter(
      c => c.family === 'event' && (c as EventCard).trigger === 'Investment',
    ) as EventCard[];
    for (const card of marketEvents) {
      actions.push({ type: 'buy-event', cardId: card.id });
    }
  }

  // Staff actions (hire-staff / peek-incident-deck) are deliberately NOT
  // enumerated — staff are player-only in competitive mode (AC2).

  // ── move-to-hand (staff and events handled by their own actions) ──
  if (hand.length < maxHandSize) {
    for (const card of state.market.cards) {
      if (card.family === 'staff' || card.family === 'event') continue;
      actions.push({ type: 'move-to-hand', cardId: card.id });
    }
  }

  // ── play-*-from-hand (cost-at-play) ───────────────────────
  hand.forEach((card, handIndex) => {
    if (card.family === 'business' || card.family === 'community-space') {
      if (coins < card.cost) return;
      for (const slotIndex of emptySlots) {
        actions.push({ type: 'play-business-from-hand', handIndex, slotIndex });
      }
    } else if (card.family === 'upgrade') {
      if (coins < card.cost) return;
      for (const targetSlot of competitiveUpgradeTargets(state, card as UpgradeCard, pid)) {
        actions.push({ type: 'play-upgrade-from-hand', handIndex, targetSlot });
      }
    } else if (card.family === 'event' && (card as EventCard).trigger === 'Investment') {
      if (
        String(card.id).startsWith('evt-grand-opening') &&
        !state.businessPlacedThisTurn
      ) {
        return;
      }
      if (coins >= card.cost) {
        actions.push({ type: 'play-event-from-hand', handIndex });
      }
    }
  });

  // ── discard-from-hand (costs reputation = card.cost; only when the hand
  //    is full — CG-0MTQ7KUVF009ELQK) ──
  if (hand.length >= maxHandSize) {
    hand.forEach((_, handIndex) => {
      actions.push({ type: 'discard-from-hand', handIndex });
    });
  }

  actions.push({ type: 'end-turn' });
  return actions;
}

/** Free same-week composite upgrade plays for the acting competitive player. */
function competitiveSameWeekUpgradeActions(
  state: MainStreetState,
  player: PlayerRecord,
): PlayerAction[] {
  const actions: PlayerAction[] = [];
  const hand = player.hand ?? [];
  hand.forEach((card, handIndex) => {
    if (card.family !== 'upgrade') return;
    if (state.justMovedUpgradeCardId == null || state.justMovedUpgradeCardId !== card.id) return;
    const upgrade = card as UpgradeCard;
    if ((player.coins ?? 0) < upgrade.cost) return;
    for (const targetSlot of competitiveUpgradeTargets(state, upgrade, player.playerId)) {
      actions.push({ type: 'play-upgrade-from-hand', handIndex, targetSlot });
    }
  });
  return actions;
}

/** Free same-week composite Investment plays for the acting competitive player. */
function competitiveSameWeekEventActions(
  state: MainStreetState,
  player: PlayerRecord,
): PlayerAction[] {
  const actions: PlayerAction[] = [];
  const hand = player.hand ?? [];
  hand.forEach((card, handIndex) => {
    if (card.family !== 'event' || (card as EventCard).trigger !== 'Investment') return;
    if (state.justMovedEventCardId == null || state.justMovedEventCardId !== card.id) return;
    const event = card as EventCard;
    if ((player.coins ?? 0) < event.cost) return;
    if (String(event.id).startsWith('evt-grand-opening') && !state.businessPlacedThisTurn) return;
    actions.push({ type: 'play-event-from-hand', handIndex });
  });
  return actions;
}

// ── Competitive scoring ─────────────────────────────────────

/**
 * Scores a single action against the ACTING player's own resources and
 * owned businesses (AC1). The planning horizon is
 * {@link aiCompetitivePlanningHorizon} (the player's own score vs. the win
 * threshold), and owned-business checks use the owner-tagged grid.
 *
 * Falls back to the single-player {@link scoreAction} when the state is not
 * competitive, so callers can use one entry point.
 *
 * @param state    Current game state (read-only by convention).
 * @param action   The action to score.
 * @param playerId Owner index; defaults to the active player.
 * @returns Numeric score (higher is better).
 */
export function scoreCompetitiveAction(
  state: MainStreetState,
  action: PlayerAction,
  playerId?: number,
): number {
  if (!isCompetitiveMode(state)) return scoreAction(state, action);
  const player = getCompetitivePlayer(state, playerId);
  if (!player) return scoreAction(state, action);
  const pid = player.playerId;
  const horizon = aiCompetitivePlanningHorizon(state, pid);

  switch (action.type) {
    case 'buy-upgrade':
    case 'buy-and-place-upgrade':
      return competitiveUpgradeScore(state, action.cardId, horizon);
    case 'buy-business':
    case 'buy-and-place':
      return competitiveBusinessScore(state, action.cardId, action.slotIndex, horizon);
    case 'buy-event':
      return competitiveMarketEventScore(state, action.cardId, pid);
    case 'play-business-from-hand':
      return competitiveHandBusinessScore(state, player, action.handIndex, action.slotIndex, horizon);
    case 'play-upgrade-from-hand':
      return competitiveHandUpgradeScore(player, action.handIndex, horizon);
    case 'play-event-from-hand':
    case 'play-event':
      return competitiveHandEventScore(state, player, action.handIndex, pid);
    case 'move-to-hand': {
      // Lock-in value: the card's listed cost (mirrors the single-player
      // market-acquisition tier).
      const card = state.market.cards.find(c => c.id === action.cardId);
      return card ? card.cost : 0;
    }
    case 'community-favour':
      return competitiveFavourScore(state, player, action.direction);
    case 'hire-staff':
    case 'peek-incident-deck':
      // Not enumerated for competitive play; score 0 so a stray call can
      // never outrank a real economic play.
      return 0;
    case 'end-turn':
      return 0;
    case 'discard-from-hand': {
      // Discarding costs the card's coin value in reputation; weigh the
      // capacity benefit of a freed slot against it and prefer lower-cost
      // cards (CG-0MTQ7KUVF009ELQK).
      const card = (player.hand ?? [])[action.handIndex];
      if (!card) return 0;
      return competitiveBestMarketAcquisitionValue(state, player) - (card.cost ?? 0);
    }
    default:
      return 0;
  }
}

/**
 * Competitive counterpart of {@link bestMarketAcquisitionValue}: the value of
 * the best affordable market acquisition for the acting player, used as the
 * capacity benefit of freeing one of their hand slots (CG-0MTQ7KUVF009ELQK).
 */
function competitiveBestMarketAcquisitionValue(
  state: MainStreetState,
  player: PlayerRecord,
): number {
  const hand = player.hand ?? [];
  if (hand.length < (state.maxHandSize ?? 3)) return 0;
  let best = 0;
  for (const card of state.market.cards) {
    if (card.family === 'staff' || card.family === 'event') continue;
    const cost = (card as { cost?: number }).cost ?? 0;
    if ((player.coins ?? 0) < cost) continue;
    best = Math.max(best, cost);
  }
  return best;
}

function competitiveUpgradeScore(
  state: MainStreetState,
  cardId: string,
  horizon: number,
): number {
  const card = state.market.cards.find(
    c => c.id === cardId && c.family === 'upgrade',
  ) as UpgradeCard | undefined;
  if (!card) return 0;
  return card.incomeBonus * horizon - card.cost;
}

function competitiveBusinessScore(
  state: MainStreetState,
  cardId: string,
  slotIndex: number,
  horizon: number,
): number {
  const card = state.market.cards.find(c => c.id === cardId) as BusinessCard | undefined;
  if (!card) return 0;
  const simulatedGrid = [...state.streetGrid];
  simulatedGrid[slotIndex] = card;
  const projectedSynergy = computeSynergyBonus(
    simulatedGrid,
    slotIndex,
    state.config.synergyBonusPerNeighbor,
  );
  return (card.baseIncome + projectedSynergy) * horizon - card.cost;
}

function competitiveMarketEventScore(
  state: MainStreetState,
  cardId: string,
  playerId: number,
): number {
  const card = state.market.cards.find(
    c => c.id === cardId && c.family === 'event',
  ) as EventCard | undefined;
  if (!card) return 0;
  return computeCompetitiveEventValue(state, card, playerId) - card.cost;
}

function competitiveHandBusinessScore(
  state: MainStreetState,
  player: PlayerRecord,
  handIndex: number,
  slotIndex: number,
  horizon: number,
): number {
  const card = (player.hand ?? [])[handIndex] as BusinessCard | undefined;
  if (!card) return 0;
  const simulatedGrid = [...state.streetGrid];
  simulatedGrid[slotIndex] = card;
  const projectedSynergy = computeSynergyBonus(
    simulatedGrid,
    slotIndex,
    state.config.synergyBonusPerNeighbor,
  );
  return (card.baseIncome + projectedSynergy) * horizon - card.cost;
}

function competitiveHandUpgradeScore(
  player: PlayerRecord,
  handIndex: number,
  horizon: number,
): number {
  const card = (player.hand ?? [])[handIndex] as UpgradeCard | undefined;
  if (!card) return 0;
  return card.incomeBonus * horizon - card.cost;
}

function competitiveHandEventScore(
  state: MainStreetState,
  player: PlayerRecord,
  handIndex: number | undefined,
  playerId: number,
): number {
  const hand = player.hand ?? [];
  const resolvedIndex = handIndex ?? hand.findIndex(c => c.family === 'event');
  const card = hand[resolvedIndex] as EventCard | undefined;
  if (!card || card.family !== 'event') return 0;
  return computeCompetitiveEventValue(state, card, playerId) - card.cost;
}

function competitiveFavourScore(
  state: MainStreetState,
  player: PlayerRecord,
  direction: 'coins-to-rep' | 'rep-to-coins',
): number {
  if (direction === 'coins-to-rep') return 1;
  const cheapest = getCheapestMarketCost(state);
  if (
    Number.isFinite(cheapest) &&
    (player.coins ?? 0) < cheapest &&
    (player.reputation ?? 0) >= state.config.favourRepToCoinsRepCost + 1
  ) {
    return 3;
  }
  return 1;
}

// ── Competitive seat binding (headless / harness driving) ─────

/**
 * Binds the acting competitive player's record onto the shared single-player
 * fields so the existing engine actions ({@link executeAction}) operate on
 * the right wallet / hand / staff / action budget.
 *
 * In competitive mode the engine's action primitives (`purchaseBusiness`,
 * `moveToHand`, `playBusinessFromHand`, ...) read the shared
 * `state.resourceBank` / `state.hand` / `state.actionsRemaining` fields.
 * `bindCompetitiveSeat` copies the acting player's `PlayerRecord` into those
 * fields before the MarketPhase so the AI's per-player actions execute
 * against the correct owner; `restoreCompetitiveSeat` writes the shared
 * wallet back into the record afterwards. No-op in single-player states.
 *
 * @param state    Current game state (mutated in-place).
 * @param playerId Owner index; defaults to the active player.
 */
export function bindCompetitiveSeat(state: MainStreetState, playerId?: number): void {
  const player = getCompetitivePlayer(state, playerId);
  if (!player) return;
  state.resourceBank.coins = player.coins;
  state.resourceBank.reputation = player.reputation;
  state.hand = player.hand;
  state.staffCards = player.staffCards;
  state.actionsRemaining = player.actionBudget;
  syncResourceBankToLedger(state);
}

/**
 * Writes the shared wallet / hand / staff / budget back into the acting
 * competitive player's record (the inverse of {@link bindCompetitiveSeat}).
 * No-op in single-player states.
 *
 * @param state    Current game state (mutated in-place).
 * @param playerId Owner index; defaults to the active player.
 */
export function restoreCompetitiveSeat(state: MainStreetState, playerId?: number): void {
  const player = getCompetitivePlayer(state, playerId);
  if (!player) return;
  player.coins = state.resourceBank.coins;
  player.reputation = state.resourceBank.reputation;
  player.hand = state.hand;
  player.staffCards = state.staffCards;
  player.actionBudget = state.actionsRemaining;
}

// ── CompetitiveGreedyStrategy ───────────────────────────────

/**
 * Ownership-aware, staff-free greedy strategy for competitive play.
 *
 * Mirrors the single-player {@link GreedyStrategy} priority chain but
 * enumerates and scores through the competitive helpers: the acting
 * player's own resources decide affordability, only their own businesses
 * are upgrade targets, staff actions are never offered, and the planning
 * horizon comes from their own score.
 */
export const CompetitiveGreedyStrategy: MainStreetAiStrategy = {
  name: 'CompetitiveGreedy',

  chooseAction(state: MainStreetState, rng: () => number): PlayerAction {
    const playerId = state.activePlayerId ?? 0;
    const legalActions = enumerateCompetitiveLegalActions(state, playerId);
    const score = (a: PlayerAction): number => scoreCompetitiveAction(state, a, playerId);

    const handBusinessActions = legalActions.filter(
      a => a.type === 'play-business-from-hand',
    ) as PlayBusinessFromHandAction[];
    const handUpgradeActions = legalActions.filter(
      a => a.type === 'play-upgrade-from-hand',
    ) as PlayUpgradeFromHandAction[];
    const handEventActions = legalActions.filter(
      a => a.type === 'play-event-from-hand',
    ) as PlayEventFromHandAction[];

    // Priority 0: free same-week composite plays cost no action.
    const player = getCompetitivePlayer(state, playerId);
    const freeCompositePlays: PlayerAction[] = [
      ...handUpgradeActions.filter(
        a => player != null &&
          state.justMovedUpgradeCardId != null &&
          state.justMovedUpgradeCardId === (player.hand ?? [])[a.handIndex]?.id,
      ),
      ...handEventActions.filter(
        a => player != null &&
          state.justMovedEventCardId != null &&
          state.justMovedEventCardId === (player.hand ?? [])[a.handIndex]?.id,
      ),
    ];
    if (freeCompositePlays.length > 0) {
      return pickBest(freeCompositePlays, score, rng);
    }

    // Priority 1: play an affordable business from hand (best synergy slot).
    if (handBusinessActions.length > 0) {
      return pickBest(handBusinessActions, score, rng);
    }

    // Priority 2: play an affordable upgrade from hand.
    if (handUpgradeActions.length > 0) {
      return pickBest(handUpgradeActions, score, rng);
    }

    // Priority 3: buy upgrades (own businesses only).
    const upgradeActions = legalActions.filter(a => a.type === 'buy-upgrade') as BuyUpgradeAction[];
    if (upgradeActions.length > 0) {
      return pickBest(upgradeActions, score, rng);
    }

    // Priority 4: buy business for best synergy placement.
    const businessActions = legalActions.filter(a => a.type === 'buy-business') as BuyBusinessAction[];
    if (businessActions.length > 0) {
      return pickBest(businessActions, score, rng);
    }

    // Priority 5: spend this week's action on the best market acquisition
    // (event take vs. non-event move-to-hand), ranked by value.
    const acquisitionActions = legalActions.filter(
      a => a.type === 'move-to-hand' || a.type === 'buy-event',
    ) as (MoveToHandAction | BuyEventAction)[];
    if (acquisitionActions.length > 0) {
      const best = pickBest(acquisitionActions, score, rng);
      if (score(best) > 0) return best;
    }

    // Priority 6: play a held Investment event with positive value.
    if (handEventActions.length > 0) {
      const bestEvent = pickBest(handEventActions, score, rng);
      if (score(bestEvent) > 0) return bestEvent;
    }

    // Priority 7: discard from a full hand — only when the capacity benefit
    // outweighs the reputation cost; prefer the lowest-cost card
    // (CG-0MTQ7KUVF009ELQK).
    const discardActions = legalActions.filter(a => a.type === 'discard-from-hand');
    if (discardActions.length > 0) {
      const best = pickBest(discardActions, score, rng);
      if (score(best) > 0) return best;
    }

    // Priority 8: Community Favour fallback when genuinely value-creating.
    const favourActions = legalActions.filter(
      a => a.type === 'community-favour',
    ) as CommunityFavourAction[];
    if (favourActions.length > 0) {
      const best = pickBest(favourActions, score, rng);
      if (score(best) > 1) return best;
    }

    // No staff priority: staff actions are excluded in competitive mode.
    // Priority 9: end turn.
    return { type: 'end-turn' };
  },
};

/**
 * Enumerate and score every legal competitive action for the acting player.
 * The competitive counterpart of {@link enumerateAndScoreActions}.
 */
export function enumerateAndScoreCompetitiveActions(
  state: MainStreetState,
  playerId?: number,
): Array<{ action: PlayerAction; score: number }> {
  const pid = playerId ?? state.activePlayerId ?? 0;
  return enumerateCompetitiveLegalActions(state, pid).map(action => ({
    action,
    score: scoreCompetitiveAction(state, action, pid),
  }));
}
