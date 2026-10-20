/**
 * Story-line resolution semantics: effect policy, successor precedence and
 * deterministic chain-card naming.
 *
 * Successor precedence at resolution time:
 *
 * 1. `successorResolver` callback (when present) — invoked for the successor
 *    id; a `null`/`undefined` return ends the chain. Consumes no RNG.
 * 2. Candidate set (`successorIds`) — exactly **one** seeded `engine.rng()`
 *    draw selects the successor uniformly at random (one draw per selection,
 *    at resolution time; replay with the same seed yields the same
 *    successor). An **empty** candidate list is a terminal option — the
 *    chain ends without consuming a draw.
 * 3. Legacy single `successorId` — pushed directly, no draw.
 *
 * The `effectPolicy` is honoured regardless of how the successor is resolved:
 * `'apply'` runs the event's effect, `'skip'` ignores it.
 *
 * @module
 */

import type {
  StorylineCard,
  StorylineEngineAdapter,
  StorylineOption,
  StorylineResolution,
} from './types';

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
 * Resolves a story-line option by applying its effect policy and pushing the
 * successor card.
 *
 * See the module doc comment for the successor-precedence contract. The
 * uniform candidate draw consumes exactly one `engine.rng()` call per
 * selection (replay-safe with a seeded rng); terminal options (empty
 * candidate list) consume no draw.
 *
 * @param state  Current game state (mutated by effect application/push).
 * @param adapter The engine adapter (rng draw, effect application, resources,
 *                chain-card sink).
 * @param card   The story-line card.
 * @param option The chosen story-line option.
 * @returns The resolution result (pushed card, deltas).
 */
export function resolveStorylineOption<TState, TCard extends StorylineCard>(
  state: TState,
  adapter: StorylineEngineAdapter<TState, TCard>,
  card: TCard,
  option: StorylineOption<TState>,
): StorylineResolution<TCard> {
  const before = adapter.getResources(state);

  // Apply effect if the option's policy says so.
  if (option.effectPolicy === 'apply') {
    adapter.applyEffect(state, card);
  }

  const after = adapter.getResources(state);
  const coinChange = after.coins - before.coins;
  const repChange = after.reputation - before.reputation;

  // Determine the successor id (precedence per the module doc): the uniform
  // draw consumes exactly one rng() call per selection.
  let resolvedSuccessor: string | null | undefined;
  if (option.successorResolver != null) {
    resolvedSuccessor = option.successorResolver(state);
  } else if (option.successorIds != null) {
    resolvedSuccessor =
      option.successorIds.length > 0
        ? option.successorIds[Math.floor(adapter.rng(state) * option.successorIds.length)]
        : null; // terminal option — the chain ends, no draw.
  } else {
    resolvedSuccessor = option.successorId;
  }

  // Push successor card if one exists.
  const pushedCard = pushChainCard(state, adapter, resolvedSuccessor);

  return { pushedCard, coinChange, repChange };
}
