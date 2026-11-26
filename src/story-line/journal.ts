/**
 * Story-line journal helpers.
 *
 * Pure, Phaser-free helpers backing the story-line journal overlay. They
 * derive journal rows from the activity log's "story update" lines
 * (written when a choice resolves), most recent first.
 *
 * @module
 */

import type {
  StorylineEngineAdapter,
  StorylineJournalEntry,
  StorylineUiAdapter,
} from './types';

/** Prefix of the narrative lines written when a story-line choice resolves. */
export const STORY_UPDATE_PREFIX = 'Story update — ';

/** Default display budget for a journal outcome line, in characters. */
export const DEFAULT_OUTCOME_MAX_LENGTH = 80;

/**
 * Cuts an outcome summary to one display-safe line of at most `maxLength`
 * characters.
 *
 * The journal overlay has room for a single line, so a long authored outcome
 * prose must be shortened for **display only** — the untruncated text stays
 * on the journal entry (`outcomeFull` / `text`) for the transcript artefact.
 *
 * Rules:
 *
 * - text within the budget is returned unchanged;
 * - over-budget text is cut on a word boundary (never mid-word), without a
 *   trailing space, and ends with a single `…`;
 * - a space-less over-budget string is hard-cut to `maxLength - 1` characters
 *   plus `…` (the budget is exactly `maxLength`);
 * - embedded newlines are collapsed to spaces, so the result is one line.
 *
 * @param text      The outcome summary (usually the authored prose).
 * @param maxLength Maximum displayed length, including the ellipsis.
 */
export function truncateOutcome(
  text: string,
  maxLength: number = DEFAULT_OUTCOME_MAX_LENGTH,
): string {
  if (maxLength <= 0) return '';
  const singleLine = text.replace(/\s*\r?\n+\s*/g, ' ');
  if (singleLine.length <= maxLength) return singleLine;
  if (maxLength === 1) return '…';

  const budget = maxLength - 1; // one character is reserved for the ellipsis
  let cut = singleLine.slice(0, budget);
  const lastSpace = cut.lastIndexOf(' ');
  if (lastSpace > 0) cut = cut.slice(0, lastSpace);
  return `${cut.trimEnd()}…`;
}

/**
 * Parses a story-update log line into `{ storyline, outcome }`, or null when
 * the text is not a story update.
 */
export function parseStoryUpdate(
  text: string,
): { storyline: string; outcome: string } | null {
  if (!text.startsWith(STORY_UPDATE_PREFIX)) return null;
  const rest = text.slice(STORY_UPDATE_PREFIX.length);
  const sep = rest.indexOf(': ');
  if (sep < 0) return null;
  return {
    storyline: rest.slice(0, sep),
    outcome: rest.slice(sep + 2),
  };
}

/**
 * Builds the journal from the activity log's story-update lines, most recent
 * first. Only entries produced by story-line choices are included.
 */
export function buildJournal<TState, TCard extends import('./types').StorylineCard>(
  state: TState,
  adapter: StorylineEngineAdapter<TState, TCard>,
): StorylineJournalEntry[] {
  const entries: StorylineJournalEntry[] = [];
  for (const log of adapter.getActivityLog(state)) {
    const parsed = parseStoryUpdate(log.text);
    if (!parsed) continue;
    entries.push({
      turn: log.turn,
      storyline: parsed.storyline,
      // Display copy: one line, ellipsis, never mid-word.
      outcome: truncateOutcome(parsed.outcome),
      // Untruncated copy for the transcript artefact.
      outcomeFull: parsed.outcome,
      text: log.text,
    });
  }
  // Most recent first (a stable reverse — the log is append-only).
  return entries.reverse();
}

/** True when the journal has no entries yet (empty state). */
export function journalIsEmpty<TState, TCard extends import('./types').StorylineCard>(
  state: TState,
  adapter: StorylineEngineAdapter<TState, TCard>,
): boolean {
  return buildJournal(state, adapter).length === 0;
}

/** Journal title: names the active story-line(s) when available. */
export function journalTitle<TState, TCard extends import('./types').StorylineCard>(
  state: TState,
  adapter: StorylineEngineAdapter<TState, TCard>,
  ui: StorylineUiAdapter<TCard>,
): string {
  return ui.journalTitle(buildJournal(state, adapter));
}
