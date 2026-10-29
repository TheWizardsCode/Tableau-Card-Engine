/**
 * Story-line resolution semantics: effect policy, cost payment, extra
 * effects, successor precedence and deterministic chain-card naming.
 *
 * Resolution order for a selected option:
 *
 * 1. `effectPolicy` — `'apply'` runs the event's intrinsic effect, `'skip'`
 *    ignores it. Unchanged from before cost/extra-effect support.
 * 2. Declarative `cost` — a real payment: the specified coins/reputation are
 *    deducted through the adapter's `applyResourceDelta` seam. Cost is
 *    **independent of `effectPolicy`** (it is paid for a `'skip'` option too).
 *    Draw-time filtering guarantees the player can afford it; resolution
 *    trusts the presented list.
 * 3. Declarative `extraEffect` — a signed resource delta applied through the
 *    same seam, also **independent of `effectPolicy`**.
 *
 * `coinChange` / `repChange` in the result account for all three steps.
 *
 * Successor precedence at resolution time:
 *
 * 1. `successorResolver` callback (when present) — invoked for the successor
 *    id; a `null`/`undefined` return ends the chain. Consumes no RNG.
 * 2. Declarative `conditionalSuccessors` — evaluated in declaration order
 *    against the post-resolution resources; the first matching rule's
 *    `successorId` is pushed (`null` ends the chain). A matching rule
 *    consumes no RNG draw; when no rule matches, resolution falls through
 *    to the random/legacy steps below.
 * 3. Candidate set (`successorIds`) — exactly **one** seeded `engine.rng()`
 *    draw selects the successor uniformly at random (one draw per selection,
 *    at resolution time; replay with the same seed yields the same
 *    successor). An **empty** candidate list is a terminal option — the
 *    chain ends without consuming a draw.
 * 4. Legacy single `successorId` — pushed directly, no draw.
 *
 * @module
 */

import type {
  Condition,
  StorylineCard,
  StorylineEngineAdapter,
  StorylineOption,
  StorylineResolution,
} from './types';

/**
 * True when a declarative condition matches the current resources.
 *
 * Pure: no RNG, no state mutation, no logging. The `==` operator compares
 * numerically (`5 == 5.0`); equality boundaries follow the usual numeric
 * semantics for the ordered operators.
 *
 * @param condition The field/op/value rule to evaluate.
 * @param resources Current spendable resources.
 */
export function evaluateCondition(
  condition: Condition,
  resources: { coins: number; reputation: number },
): boolean {
  const current = resources[condition.field];
  switch (condition.op) {
    case '>=':
      return current >= condition.value;
    case '<=':
      return current <= condition.value;
    case '>':
      return current > condition.value;
    case '<':
      return current < condition.value;
    case '==':
      return current === condition.value;
    default: {
      const exhaustive: never = condition.op;
      return exhaustive;
    }
  }
}

/**
 * Formats a signed resource delta for the activity log, omitting zero
 * components (`-5 coins`, `+1 reputation`, both joined by `, `).
 */
function formatDelta(coins: number, reputation: number): string {
  const parts: string[] = [];
  if (coins !== 0) parts.push(`${coins > 0 ? '+' : ''}${coins} coins`);
  if (reputation !== 0) parts.push(`${reputation > 0 ? '+' : ''}${reputation} reputation`);
  return parts.join(', ');
}

/**
 * Applies a signed resource delta through the adapter seam.
 *
 * A legacy adapter without `applyResourceDelta` is left untouched and a
 * single warning is appended to the activity log, so the missing capability
 * is visible rather than silent.
 */
function applyDelta<TState, TCard extends StorylineCard>(
  state: TState,
  adapter: StorylineEngineAdapter<TState, TCard>,
  delta: { coins?: number; reputation?: number },
): void {
  if (adapter.applyResourceDelta) {
    adapter.applyResourceDelta(state, delta);
    return;
  }
  adapter.appendLog(
    state,
    'Story-line cost/extra-effect not applied: the engine adapter does not implement applyResourceDelta.',
    'neutral',
  );
}

/**
 * Pushes a chain successor card onto the active deck with deterministic
 * serial naming.
 *
 * Deterministic serial: highest existing suffix for the base template across
 * every chain-scan card location, +1. Replay-safe (no RNG / wall clock).
 *
 * @param state      Current game state (mutated — the deck may grow).
 * @param adapter    The engine adapter (template lookup, base-type id, scan,
 *                   push sink, log).
 * @param templateId The card template ID to add (successorId), or
 *                   null/undefined to end the chain.
 * @returns The pushed card instance, or null when no chain card was requested
 *          or the template does not exist.
 */
export function pushChainCard<TState, TCard extends StorylineCard>(
  state: TState,
  adapter: StorylineEngineAdapter<TState, TCard>,
  templateId: string | null | undefined,
): TCard | null {
  if (!templateId) return null; // chain ends — nothing added.
  const template = adapter.getTemplate(templateId);
  if (!template) {
    adapter.appendLog(state, `Chain card ${templateId} not found in card data.`, 'neutral');
    return null;
  }
  const base = adapter.getBaseTypeId(template.id);
  let maxSerial = -1;
  for (const card of adapter.getChainScanCards(state)) {
    if (adapter.getBaseTypeId(card.id) !== base) continue;
    const m = card.id.match(/-(\d+)$/);
    const n = m ? Number(m[1]) : -1;
    if (n > maxSerial) maxSerial = n;
  }
  const card: TCard = { ...template, id: `${base}-${maxSerial + 1}` };
  adapter.pushChainCard(state, card);
  return card;
}

/**
 * Resolves a story-line option by applying its effect policy, paying its
 * cost, applying its extra effect and pushing the successor card.
 *
 * See the module doc comment for the resolution-order and successor-
 * precedence contracts. The uniform candidate draw consumes exactly one
 * `engine.rng()` call per selection (replay-safe with a seeded rng); a
 * callback resolver and terminal options consume no draw.
 *
 * @param state  Current game state (mutated by effect/cost/extra-effect
 *               application and the chain push).
 * @param adapter The engine adapter (rng draw, effect application, optional
 *                resource-delta seam, resources, chain-card sink).
 * @param card   The story-line card.
 * @param option The chosen story-line option.
 * @returns The resolution result (pushed card, deltas across all three steps).
 */
export function resolveStorylineOption<TState, TCard extends StorylineCard>(
  state: TState,
  adapter: StorylineEngineAdapter<TState, TCard>,
  card: TCard,
  option: StorylineOption<TState>,
): StorylineResolution<TCard> {
  const before = adapter.getResources(state);

  // 1. Apply effect if the option's policy says so (unchanged legacy step).
  if (option.effectPolicy === 'apply') {
    adapter.applyEffect(state, card);
  }

  // 2. Pay the declarative cost — a real payment, independent of policy.
  if (option.cost) {
    const coins = option.cost.coins ?? 0;
    const reputation = option.cost.reputation ?? 0;
    if (coins !== 0 || reputation !== 0) {
      applyDelta(state, adapter, { coins: -coins, reputation: -reputation });
      adapter.appendLog(
        state,
        `Cost paid: ${formatDelta(-coins, -reputation)}.`,
        'neutral',
      );
    }
  }

  // 3. Apply the declarative extra effect — independent of policy and of the
  //    cost payment.
  if (option.extraEffect) {
    const coins = option.extraEffect.coins ?? 0;
    const reputation = option.extraEffect.reputation ?? 0;
    if (coins !== 0 || reputation !== 0) {
      applyDelta(state, adapter, { coins, reputation });
      adapter.appendLog(
        state,
        `Extra effect: ${formatDelta(coins, reputation)}.`,
        'neutral',
      );
    }
  }

  const after = adapter.getResources(state);
  const coinChange = after.coins - before.coins;
  const repChange = after.reputation - before.reputation;

  // Determine the successor id (precedence per the module doc): a matching
  // declarative rule consumes no rng(); the uniform candidate draw consumes
  // exactly one rng() call per selection.
  let resolvedSuccessor: string | null | undefined;
  if (option.successorResolver != null) {
    resolvedSuccessor = option.successorResolver(state);
  } else if (option.conditionalSuccessors != null && option.conditionalSuccessors.length > 0) {
    // First matching rule wins (declaration order, post-resolution resources);
    // when no rule matches, fall through to the random/legacy resolution.
    const match = option.conditionalSuccessors.find((rule) =>
      evaluateCondition(rule.when, after),
    );
    resolvedSuccessor = match
      ? match.successorId
      : resolveRawSuccessor(state, adapter, option);
  } else {
    resolvedSuccessor = resolveRawSuccessor(state, adapter, option);
  }

  // Push successor card if one exists.
  const pushedCard = pushChainCard(state, adapter, resolvedSuccessor);

  return { pushedCard, coinChange, repChange };
}

/**
 * Legacy successor resolution: the candidate-set random draw when
 * `successorIds` is declared, otherwise the single `successorId`.
 */
function resolveRawSuccessor<TState, TCard extends StorylineCard>(
  state: TState,
  adapter: StorylineEngineAdapter<TState, TCard>,
  option: StorylineOption<TState>,
): string | null | undefined {
  if (option.successorIds != null) {
    return option.successorIds.length > 0
      ? option.successorIds[Math.floor(adapter.rng(state) * option.successorIds.length)]
      : null; // terminal option — the chain ends, no draw.
  }
  return option.successorId;
}
