/**
 * Backward-compatibility re-export.
 *
 * The canonical location is now `src/core-engine/transcript/TranscriptRecorder`.
 * New code should import from `@core-engine/transcript` or the barrel.
 *
 * @deprecated Use `import { TranscriptRecorderBase, BaseTranscript } from '@core-engine/transcript'` instead.
 */
export { TranscriptRecorderBase } from './transcript/TranscriptRecorder';
export type { BaseTranscript } from './transcript/TranscriptRecorder';
