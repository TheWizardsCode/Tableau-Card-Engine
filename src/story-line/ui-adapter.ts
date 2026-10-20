/**
 * Pluggable story-line UI adapter.
 *
 * Core ships a default implementation covering dialog titles, choice-clarity
 * labels, story-update lines and journal formatting. Games override any
 * subset to change wording without touching core logic. No Phaser dependency.
 *
 * The default strings are the ones Main Street has shipped since the
 * mechanic was introduced; keeping them here means a game that supplies no
 * override keeps the same player-visible text.
 *
 * @module
 */

import type {
  ChoiceClarityLabels,
  StorylineCard,
  StorylineJournalEntry,
  StorylineOption,
  StorylineUiAdapter,
} from './types';

/** Human-readable story-line name: explicit title, else the id, else null. */
export function defaultStorylineName(card: StorylineCard): string | null {
  if (!card.storylineId) return null;
  return card.storylineTitle ?? card.storylineId;
}

/**
 * Dialog title for a pending choice. Prefers the story-line name so the
 * player sees which arc they are in; falls back to the card name.
 */
export function defaultChoiceDialogTitle(card: StorylineCard): string {
  return defaultStorylineName(card) ?? card.name;
}

/**
 * Dialog subtitle: the specific incident within the story-line (empty when
 * the card has no storyline, so the dialog stays unchanged for legacy choice
 * cards).
 */
export function defaultChoiceDialogSubtitle(card: StorylineCard): string {
  return card.storylineId ? card.name : '';
}

/** Formats a delta summary for the story-update line. */
function describeDelta(coinChange: number, repChange: number): string {
  const parts: string[] = [];
  if (coinChange !== 0) {
    parts.push(`${coinChange > 0 ? '+' : ''}${Math.round(coinChange)} coins`);
  }
  if (repChange !== 0) {
    parts.push(`${repChange > 0 ? '+' : ''}${Math.round(repChange)} rep`);
  }
  return parts.length > 0 ? ` (${parts.join(', ')})` : '';
}

/**
 * The concise narrative "story update" line emitted when a choice resolves.
 * Returns null for cards without a `storylineId` (no storyline, no update).
 *
 * @param card        The resolved story-line card.
 * @param option      The chosen option label ('accept' | 'reject' | custom).
 * @param coinChange  Applied coin delta (0 for skip options).
 * @param repChange   Applied reputation delta (0 for skip options).
 */
export function defaultStoryUpdateLine(
  card: StorylineCard,
  option: string,
  coinChange: number,
  repChange: number,
): string | null {
  const name = defaultStorylineName(card);
  if (!name) return null;
  const accepted = option.toLowerCase() === 'accept';
  if (accepted) {
    return `Story update — ${name}: you accepted the consequence${describeDelta(coinChange, repChange)}.`;
  }
  if (option.toLowerCase() === 'reject') {
    return `Story update — ${name}: you refused the consequence; the thread continues.`;
  }
  // Generalised multi-way option: name the option.
  return `Story update — ${name}: you chose "${option}"${describeDelta(coinChange, repChange)}.`;
}

/**
 * Builds the choice-clarity labels for a pending choice card.
 *
 * The labels explain what each option *does* (apply vs skip the incident's
 * effect) without revealing which card the chain escalates to. For the legacy
 * two-option model the labels are Accept/Reject; the text is derived from the
 * compiled options' effect policies.
 */
export function defaultChoiceClarityLabels<TState>(
  card: StorylineCard,
  options: readonly StorylineOption<TState>[],
): ChoiceClarityLabels {
  const acceptOption = options[0];
  const rejectOption = options[1];

  const accept =
    acceptOption?.effectPolicy === 'apply'
      ? `Accept: apply “${card.effect ?? ''}”.`
      : 'Accept: continue without applying an effect.';

  // Never name the escalation: only the semantic (skip + a different
  // incident). CSV-authored options always apply the event effect, so an
  // 'apply' Reject still leads to a different incident — say so honestly
  // instead of implying the effect is waived.
  const reject =
    rejectOption?.effectPolicy === 'skip'
      ? 'Reject: refuse this consequence; a different incident will follow.'
      : 'Reject: this consequence is applied; a different incident will follow.';

  return { accept, reject };
}

/** Journal title: names the active story-line(s) when available. */
export function defaultJournalTitle(
  entries: readonly StorylineJournalEntry[],
): string {
  const names = [...new Set(entries.map((e) => e.storyline))];
  if (names.length === 0) return 'Storyline Journal';
  return `Storyline Journal — ${names.join(', ')}`;
}

/** A one-line summary of a story-line card for the journal tooltip/intro. */
export function defaultStorylineSummary(card: StorylineCard): string {
  const name = defaultStorylineName(card) ?? card.name;
  return `Storyline: ${name}`;
}

/**
 * Builds the default UI adapter for a given state/card pair.
 *
 * The default adapter is stateless, so a single shared instance would work;
 * this factory exists so games can pass a concrete `TState`/`TCard` without
 * a cast and override individual methods by spreading the result.
 */
export function createDefaultStorylineUiAdapter<
  TState = unknown,
  TCard extends StorylineCard = StorylineCard,
>(): StorylineUiAdapter<TState, TCard> {
  return {
    storylineName: (card) => defaultStorylineName(card),
    choiceDialogTitle: (card) => defaultChoiceDialogTitle(card),
    choiceDialogSubtitle: (card) => defaultChoiceDialogSubtitle(card),
    storyUpdateLine: (card, option, coinChange, repChange) =>
      defaultStoryUpdateLine(card, option, coinChange, repChange),
    choiceClarityLabels: (card, options) =>
      defaultChoiceClarityLabels<TState>(card, options),
    journalTitle: (entries) => defaultJournalTitle(entries),
    storylineSummary: (card) => defaultStorylineSummary(card),
  };
}

/** The default UI adapter, typed for the generic (unparameterised) case. */
export const defaultStorylineUiAdapter: StorylineUiAdapter<unknown, StorylineCard> =
  createDefaultStorylineUiAdapter<unknown, StorylineCard>();
