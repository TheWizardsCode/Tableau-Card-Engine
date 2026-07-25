/**
 * Backward-compatibility re-export.
 *
 * The canonical location is now `src/core-engine/transcript/TranscriptTypes`.
 * New code should import from `@core-engine/transcript` or the barrel.
 *
 * @deprecated Use `import { CardSnapshot, snapshotCard } from '@core-engine/transcript'` instead.
 */
export { snapshotCard } from './transcript/TranscriptTypes';
export type { CardSnapshot } from './transcript/TranscriptTypes';
