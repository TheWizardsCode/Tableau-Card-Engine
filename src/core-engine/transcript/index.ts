/**
 * Transcript module – consolidated transcript recording, storage, and
 * autosave for the Tableau Card Engine.
 *
 * This module groups all transcript-related functionality in a single
 * sub-package:
 *
 * - `TranscriptRecorderBase<T>` / `BaseTranscript` – abstract base class
 *   and recommended transcript shape for game-specific recorders.
 * - `TranscriptStore` – browser-based persistence (IndexedDB with
 *   localStorage fallback) with rolling window eviction.
 * - `autoSaveTranscript()` – fire-and-forget helper to persist a
 *   finalized transcript.
 * - `CardSnapshot` / `snapshotCard()` – serialisable card snapshot type
 *   and helper used by game transcript modules.
 *
 * ## Migration Guide (CG-0MP12WI75001L9P4)
 *
 * ### Before (old import paths)
 *
 * ```ts
 * import { TranscriptRecorderBase, type BaseTranscript } from '../../src/core-engine/TranscriptRecorder';
 * import { TranscriptStore, type StoredTranscript } from '../../src/core-engine/TranscriptStore';
 * import { autoSaveTranscript } from '../../src/core-engine/autoSaveTranscript';
 * import { CardSnapshot, snapshotCard } from '../../src/core-engine/TranscriptTypes';
 * ```
 *
 * ### After (new consolidated import)
 *
 * ```ts
 * import {
 *   TranscriptRecorderBase,
 *   BaseTranscript,
 *   TranscriptStore,
 *   StoredTranscript,
 *   TranscriptStoreOptions,
 *   autoSaveTranscript,
 *   CardSnapshot,
 *   snapshotCard,
 * } from '../../src/core-engine/transcript';
 * ```
 *
 * ### Backward compatibility
 *
 * The legacy top-level files (`src/core-engine/TranscriptRecorder.ts`,
 * `src/core-engine/TranscriptStore.ts`, `src/core-engine/autoSaveTranscript.ts`,
 * `src/core-engine/TranscriptTypes.ts`) continue to re-export everything
 * from `src/core-engine/transcript/`.  Existing imports will continue to
 * work without changes.
 *
 * New code should import from `src/core-engine/transcript` (or
 * `@core-engine/transcript` via the path alias).
 *
 * @packageDocumentation
 */

// Transcript recorder base
export type { BaseTranscript } from './TranscriptRecorder';
export { TranscriptRecorderBase } from './TranscriptRecorder';

// Transcript storage
export type { StoredTranscript, TranscriptStoreOptions } from './TranscriptStore';
export { TranscriptStore } from './TranscriptStore';

// Auto-save helper
export { autoSaveTranscript } from './autoSaveTranscript';

// Card snapshot types
export type { CardSnapshot } from './TranscriptTypes';
export { snapshotCard } from './TranscriptTypes';
