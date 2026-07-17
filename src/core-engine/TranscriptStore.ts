/**
 * Backward-compatibility re-export.
 *
 * The canonical location is now `src/core-engine/transcript/TranscriptStore`.
 * New code should import from `@core-engine/transcript` or the barrel.
 *
 * @deprecated Use `import { TranscriptStore, StoredTranscript, TranscriptStoreOptions } from '@core-engine/transcript'` instead.
 */
export { TranscriptStore } from './transcript/TranscriptStore';
export type { StoredTranscript, TranscriptStoreOptions } from './transcript/TranscriptStore';
