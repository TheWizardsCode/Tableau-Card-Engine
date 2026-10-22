/**
 * Generic, game-agnostic story-line system.
 *
 * A drawn card presents an ordered set of options; the player's choice
 * selects the next card until the chain ends. This module owns the generic
 * compilation, resolution, pending-choice lifecycle and journal helpers.
 * Games supply state and presentation through the {@link StorylineEngineAdapter}
 * and {@link StorylineUiAdapter} seams — core never imports game types and
 * has no Phaser dependency.
 *
 * ```ts
 * import { createStorylineSystem } from '@story-line';
 *
 * const storyline = createStorylineSystem({
 *   engine: myEngineAdapter,   // rng / effect / log / deck sink
 *   ui: myUiAdapter,           // optional presentation overrides
 * });
 * const compiled = storyline.compileStorylineFromEvent(card, state);
 * ```
 *
 * @module
 */

import {
  compileStorylineFromEvent,
  createStorylineOptionRegistry,
  eventHasStoryline,
  parseStorylineOptionsEncoding,
} from './compile';
import {
  buildJournal,
  journalIsEmpty,
  journalTitle,
  parseStoryUpdate,
} from './journal';
import { pushChainCard, resolveStorylineOption } from './resolve';
import { createDefaultStorylineUiAdapter } from './ui-adapter';
import type {
  CompiledStoryline,
  PendingStorylineChoice,
  StorylineCard,
  StorylineEngineAdapter,
  StorylineJournalEntry,
  StorylineOption,
  StorylineResolution,
  StorylineSystem,
  StorylineUiAdapter,
} from './types';

// ── Public types ────────────────────────────────────────────
export type {
  ChoiceClarityLabels,
  CompiledStoryline,
  Condition,
  ConditionalSuccessorRule,
  OptionCost,
  OptionExtraEffect,
  PendingStorylineChoice,
  StorylineCard,
  StorylineEngineAdapter,
  StorylineJournalEntry,
  StorylineLogEntry,
  StorylineOption,
  StorylineResolution,
  StorylineSystem,
  StorylineUiAdapter,
} from './types';

// ── Public runtime helpers ───────────────────────────────────
export { STORY_UPDATE_PREFIX, parseStoryUpdate } from './journal';
export { parseStorylineOptionsEncoding } from './compile';
export {
  createDefaultStorylineUiAdapter,
  defaultStorylineUiAdapter,
  defaultStorylineName,
  defaultChoiceDialogTitle,
  defaultChoiceDialogSubtitle,
  defaultStoryUpdateLine,
  defaultChoiceClarityLabels,
  defaultJournalTitle,
  defaultStorylineSummary,
} from './ui-adapter';
export { pushChainCard, resolveStorylineOption } from './resolve';
export {
  buildJournal,
  journalIsEmpty,
  journalTitle,
} from './journal';
export {
  compileStorylineFromEvent,
  createStorylineOptionRegistry,
  eventHasStoryline,
} from './compile';
export type { StorylineOptionRegistry } from './compile';

/** Configuration for {@link createStorylineSystem}. */
export interface StorylineSystemConfig<
  TState,
  TCard extends StorylineCard = StorylineCard,
> {
  /** Required state-access adapter for the target game. */
  engine: StorylineEngineAdapter<TState, TCard>;
  /**
   * Optional presentation adapter. Defaults to core's default UI adapter
   * (dialog titles, choice-clarity labels, story-update lines, journal).
   */
  ui?: StorylineUiAdapter<TState, TCard>;
}

/**
 * Creates a story-line system bound to a game's engine/UI adapters.
 *
 * The registered-option registry is scoped to the returned system instance,
 * so games and tests never share registry state. Call
 * {@link StorylineSystem.resetStorylineRegistry} in test teardown.
 */
export function createStorylineSystem<
  TState,
  TCard extends StorylineCard = StorylineCard,
>(
  config: StorylineSystemConfig<TState, TCard>,
): StorylineSystem<TState, TCard> {
  const engine = config.engine;
  const ui =
    config.ui ?? createDefaultStorylineUiAdapter<TState, TCard>();
  const registry = createStorylineOptionRegistry<TState>((id) =>
    engine.getBaseTypeId(id),
  );

  const compile = (
    card: TCard,
    state?: TState,
  ): CompiledStoryline<TState> =>
    compileStorylineFromEvent(card, registry, state);

  const getStorylineOptions = (
    card: TCard,
    state?: TState,
  ): StorylineOption<TState>[] => compile(card, state).compiledOptions;

  return {
    engine,
    ui,

    // ── Compilation ───────────────────────────────────────────
    compileStorylineFromEvent: compile,
    eventHasStoryline: (card) => eventHasStoryline(card, registry),
    getStorylineOptions,
    storylineOptionCount: (card, state) =>
      getStorylineOptions(card, state).length,
    parseStorylineOptionsEncoding: (encoding) =>
      parseStorylineOptionsEncoding<TState>(encoding),
    registerStorylineOptions: (eventId, options) =>
      registry.register(eventId, options),
    resetStorylineRegistry: () => registry.reset(),
    hasRegisteredStorylineOptions: (eventId) => registry.has(eventId),

    // ── Resolution ────────────────────────────────────────────
    resolveStorylineOption: (state, card, option): StorylineResolution<TCard> =>
      resolveStorylineOption(state, engine, card, option),
    pushChainCard: (state, templateId) =>
      pushChainCard(state, engine, templateId),

    // ── Pending-choice lifecycle ──────────────────────────────
    createPendingStorylineChoice: (card, state) => {
      if (!eventHasStoryline(card, registry)) return null;
      const pending: PendingStorylineChoice<TState, TCard> = {
        event: card,
        chosenOption: null,
        resolved: false,
      };
      if (state) {
        // Freeze the presented option list at draw time: condition callbacks
        // are evaluated here and never again during resolution.
        pending.options = getStorylineOptions(card, state);
      }
      return pending;
    },
    getPendingStorylineOptions: (pending, state) => {
      if (pending.options) return [...pending.options];
      return getStorylineOptions(pending.event, state);
    },
    markChoiceResolved: (pending, option) => {
      pending.chosenOption = option;
      pending.resolved = true;
    },

    // ── Journal ───────────────────────────────────────────────
    parseStoryUpdate,
    buildJournal: (state): StorylineJournalEntry[] => buildJournal(state, engine),
    journalIsEmpty: (state) => journalIsEmpty(state, engine),
    journalTitle: (state) => journalTitle(state, engine, ui),
  };
}
