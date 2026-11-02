/**
 * Pluggable story-line UI adapter.
 *
 * Core ships a default implementation covering dialog titles, story-update
 * lines and journal formatting. Games override any subset to change wording
 * without touching core logic. No Phaser dependency.
 *
 * The default strings are the ones Main Street has shipped since the
 * mechanic was introduced; keeping them here means a game that supplies no
 * override keeps the same player-visible text.
 *
 * @module
 */

import type {
  StorylineCard,
  StorylineJournalEntry,
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
 * the card has no storyline, so the dialog stays unchanged for cards outside
 * a story arc).
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
 * Builds the default UI adapter for a given card type.
 *
 * The default adapter is stateless, so a single shared instance would work;
 * this factory exists so games can pass a concrete `TCard` without a cast and
 * override individual methods by spreading the result.
 */
export function createDefaultStorylineUiAdapter<
  TCard extends StorylineCard = StorylineCard,
>(): StorylineUiAdapter<TCard> {
  return {
    storylineName: (card) => defaultStorylineName(card),
    choiceDialogTitle: (card) => defaultChoiceDialogTitle(card),
    choiceDialogSubtitle: (card) => defaultChoiceDialogSubtitle(card),
    storyUpdateLine: (card, option, coinChange, repChange) =>
      defaultStoryUpdateLine(card, option, coinChange, repChange),
    journalTitle: (entries) => defaultJournalTitle(entries),
    storylineSummary: (card) => defaultStorylineSummary(card),
  };
}

/** The default UI adapter, typed for the generic (unparameterised) case. */
export const defaultStorylineUiAdapter: StorylineUiAdapter<StorylineCard> =
  createDefaultStorylineUiAdapter<StorylineCard>();
