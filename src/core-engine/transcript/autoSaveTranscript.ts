/**
 * autoSaveTranscript – fire-and-forget transcript persistence helper.
 *
 * Saves a finalized transcript to the {@link TranscriptStore} and logs
 * the outcome.  All four example games that persist transcripts used an
 * identical copy of this pattern; this shared helper eliminates that
 * duplication.
 *
 * @module core-engine/transcript/autoSaveTranscript
 */

import { TranscriptStore } from './TranscriptStore';

/**
 * Persist a transcript to browser storage via the given
 * {@link TranscriptStore}, logging success or failure.
 *
 * The call is fire-and-forget: the returned promise resolves once
 * the save completes (or fails), but callers typically ignore it.
 *
 * @typeParam T - The concrete transcript type for this game.
 * @param store    - A pre-existing TranscriptStore instance.
 * @param gameType - Game identifier string (e.g. `'golf'`, `'sushi-go'`).
 * @param transcript - The finalized transcript object to save.
 * @param logPrefix - Optional prefix for console messages.
 *                    Defaults to `[<gameType>]`.
 */
export function autoSaveTranscript<T>(
  store: TranscriptStore,
  gameType: string,
  transcript: T,
  logPrefix?: string,
): void {
  const prefix = logPrefix ?? `[${gameType}]`;

  store.save(gameType, transcript).then(
    (stored) => {
      if (stored) {
        console.info(
          `${prefix} Transcript saved (${stored.id}) via ${stored.gameType}`,
        );
      } else {
        console.warn(
          `${prefix} Transcript not saved -- no storage backend available`,
        );
      }
    },
    (err) => {
      console.error(`${prefix} Failed to auto-save transcript:`, err);
    },
  );
}
