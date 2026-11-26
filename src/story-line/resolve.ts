/**
 * Story-line resolution semantics: effect policy, cost payment, extra
 * effects, successor precedence and deterministic chain-card naming.
 *
 * Resources are game-declared (see [`./resources.ts`](./resources.ts)): the
 * adapter's declared key set governs which resources a cost or extra effect
 * may name. `coins` / `reputation` remain the default projection.
 *
 * A key the adapter (or the projection it spreads in) declares
 * **irreversible** may be **spent**, never **granted**: a `#cost` on it is paid
 * like any other cost, while a positive `extraEffect` on it is refused — the
 * key is not applied and one activity-log line names it
 * (`Extra effect refused: hull is irreversible.`) — and every other part of the
 * option (cost, the remaining gains, the successor push) still resolves. The
 * projection's `irreversible` subset is derived from the episode manifest's
 * authoritative `resources.irreversible`, so the guard and the manifest cannot
 * disagree.
 *
 * Resolution order for a selected option:
 *
 * 1. `effectPolicy` — `'apply'` runs the event's intrinsic effect, `'skip'`
 *    ignores it. Unchanged from before cost/extra-effect support.
 * 2. Declarative `cost` — a real payment: the specified resource keys are
 *    deducted through the adapter's `applyResourceDelta` seam. Cost is
 *    **independent of `effectPolicy`** (it is paid for a `'skip'` option too).
 *    Draw-time filtering guarantees the player can afford it; resolution
 *    trusts the presented list.
 * 3. Declarative `extraEffect` — a signed resource delta applied through the
 *    same seam, also **independent of `effectPolicy`**.
 *
 * `coinChange` / `repChange` in the result are *projections*: the `coins` and
 * `reputation` keys' change across all three steps, and `0` when those keys
 * are not declared. This keeps every existing consumer source-compatible.
 *
 * Successor precedence at resolution time:
 *
 * 1. `successorResolver` callback (when present) — invoked for the successor
 *    id; a `null`/`undefined` return ends the chain. Consumes no RNG.
 * 2. Declarative `conditionalSuccessors` — evaluated in declaration order
 *    against the post-resolution resources; the first matching rule's
 *    `successorId` is pushed (`null` ends the chain). A matching rule
 *    consumes no RNG draw; when no rule matches, resolution falls through
 *    to the random/single-id steps below.
 * 3. Candidate set (`successorIds`) — exactly **one** seeded `engine.rng()`
 *    draw selects the successor uniformly at random (one draw per selection,
 *    at resolution time; replay with the same seed yields the same
 *    successor). An **empty** candidate list is a terminal option — the
 *    chain ends without consuming a draw.
 * 4. Single `successorId` — pushed directly, no draw. It is the
 *    lowest-precedence successor and the programmatic registry seam.
 *
 * @module
 */

import {
  COIN_PROJECTION_KEY,
  REPUTATION_PROJECTION_KEY,
  normaliseResourceKeys,
  readResource,
  resolveResourceKeys,
  selectDeclaredDelta,
} from './resources';
import type {
  StorylineResourceKey,
  StorylineResources,
  StorylineResourcesDelta,
} from './resources';
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
 * semantics for the ordered operators. A field the resource bag does not
 * carry reads as `0`.
 *
 * @param condition The field/op/value rule to evaluate.
 * @param resources Current resource values, keyed by resource key.
 */
export function evaluateCondition(
  condition: Condition,
  resources: StorylineResources,
): boolean {
  const current = readResource(resources, condition.field);
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
 * components and naming each declared resource key
 * (`-5 coins`, `+1 reputation`, `-2 hull`; joined by `, `).
 */
function formatDelta(delta: StorylineResourcesDelta): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(delta)) {
    if (typeof value !== 'number' || value === 0) continue;
    parts.push(`${value > 0 ? '+' : ''}${value} ${key}`);
  }
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
  delta: StorylineResourcesDelta,
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

/** Prefix of the refusal activity-log line for each authored-delta label. */
const REFUSAL_LABEL: Record<'Cost paid' | 'Extra effect', string> = {
  'Cost paid': 'Cost refused',
  'Extra effect': 'Extra effect refused',
};

/**
 * Applies one authored delta (cost or extra effect) over the declared keys.
 *
 * Only declared, non-zero keys are forwarded — the engine never invents a
 * resource. An undeclared key that carries a non-zero value is reported in
 * the activity log instead of being applied, naming the offending key(s) so a
 * content author can act on it (validation reports the same fault ahead of
 * time with a card id and path).
 *
 * A **grant** on a key declared irreversible is refused the same way: the key
 * is not applied and one activity-log line names it
 * (`Extra effect refused: hull is irreversible.`), while every other part of
 * the delta still resolves. A cost on the same key is never refused — an
 * irreversible key may be spent, just never restored.
 */
function applyDeclaredDelta<TState, TCard extends StorylineCard>(
  state: TState,
  adapter: StorylineEngineAdapter<TState, TCard>,
  source: StorylineResourcesDelta,
  sign: 1 | -1,
  declared: readonly StorylineResourceKey[],
  irreversible: readonly StorylineResourceKey[],
  logLabel: 'Cost paid' | 'Extra effect',
): void {
  const { delta, ignored, refused } = selectDeclaredDelta(source, sign, declared, {
    irreversible,
  });
  if (Object.keys(delta).length > 0) {
    applyDelta(state, adapter, delta);
    adapter.appendLog(state, `${logLabel}: ${formatDelta(delta)}.`, 'neutral');
  }
  if (ignored.length > 0) {
    adapter.appendLog(
      state,
      `${logLabel} ignored undeclared resource(s): ${ignored.join(', ')}.`,
      'neutral',
    );
  }
  for (const key of refused) {
    adapter.appendLog(
      state,
      `${REFUSAL_LABEL[logLabel]}: ${key} is irreversible.`,
      'neutral',
    );
  }
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
 * @returns The resolution result (pushed card, deltas across all three steps,
 *          and the option's authored outcome prose when it has any).
 */
export function resolveStorylineOption<TState, TCard extends StorylineCard>(
  state: TState,
  adapter: StorylineEngineAdapter<TState, TCard>,
  card: TCard,
  option: StorylineOption<TState>,
): StorylineResolution<TCard> {
  const declared = resolveResourceKeys(adapter.resources);
  // The projection's declaration is the guard's input; a game that declares
  // none keeps the pre-guard behaviour exactly.
  const irreversible = normaliseResourceKeys(adapter.irreversible ?? []);
  const before = adapter.getResources(state);

  // 1. Apply effect if the option's policy says so.
  if (option.effectPolicy === 'apply') {
    adapter.applyEffect(state, card);
  }

  // 2. Pay the declarative cost — a real payment, independent of policy.
  if (option.cost) {
    applyDeclaredDelta(
      state,
      adapter,
      option.cost,
      -1,
      declared,
      irreversible,
      'Cost paid',
    );
  }

  // 3. Apply the declarative extra effect — independent of policy and of the
  //    cost payment.
  if (option.extraEffect) {
    applyDeclaredDelta(
      state,
      adapter,
      option.extraEffect,
      1,
      declared,
      irreversible,
      'Extra effect',
    );
  }

  const after = adapter.getResources(state);
  // Projections: the `coins` / `reputation` keys' change across all three
  // steps, and 0 for a key the game does not declare.
  const coinChange = declared.includes(COIN_PROJECTION_KEY)
    ? readResource(after, COIN_PROJECTION_KEY) - readResource(before, COIN_PROJECTION_KEY)
    : 0;
  const repChange = declared.includes(REPUTATION_PROJECTION_KEY)
    ? readResource(after, REPUTATION_PROJECTION_KEY) -
      readResource(before, REPUTATION_PROJECTION_KEY)
    : 0;

  // Determine the successor id (precedence per the module doc): a matching
  // declarative rule consumes no rng(); the uniform candidate draw consumes
  // exactly one rng() call per selection.
  let resolvedSuccessor: string | null | undefined;
  if (option.successorResolver != null) {
    resolvedSuccessor = option.successorResolver(state);
  } else if (option.conditionalSuccessors != null && option.conditionalSuccessors.length > 0) {
    // First matching rule wins (declaration order, post-resolution resources);
    // when no rule matches, fall through to the random/single-id resolution.
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

  // Carry the chosen option's authored consequence prose verbatim; absent
  // prose stays `null` so every pre-prose consumer keeps today's wording.
  return { pushedCard, coinChange, repChange, outcomeProse: option.says ?? null };
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
