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
      outcome: parsed.outcome,
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
  ui: StorylineUiAdapter<TState, TCard>,
): string {
  return ui.journalTitle(buildJournal(state, adapter));
}
