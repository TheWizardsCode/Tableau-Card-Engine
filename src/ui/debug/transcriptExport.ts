/**
 * transcriptExport — Phaser-free transcript discovery and serialisation for
 * the Session Export debug tool.
 *
 * Discovers the active scene's transcript recorder from the engine's common
 * scene shapes — `recorder`, `transcriptRecorder`, `transcript` — mirroring
 * `StateInspectorOverlay.extractState`'s multi-name probing
 * (CG-0MW3KV4D7004KCF0). Probe order matters: the first supported property
 * that is an object exposing a callable `getTranscript()` wins. A recorder
 * whose `getTranscript()` throws becomes a reasoned failure, never a silent
 * empty export.
 *
 * This module is Phaser-free (no value imports) so the whole discovery and
 * serialisation contract can be unit-tested under the node `unit` project.
 *
 * @module @ui/debug/transcriptExport
 */

/** Scene property names probed for a transcript recorder, in probe order. */
export const SUPPORTED_RECORDER_PROPERTIES = [
  'recorder',
  'transcriptRecorder',
  'transcript',
] as const;

/** Reason reported when the scene exposes no conforming transcript recorder. */
export const NO_TRANSCRIPT_REASON = 'No transcript recorder found on this scene';

/** A scene object that exposes a transcript recorder via `getTranscript()`. */
export interface TranscriptRecorderLike {
  getTranscript: () => unknown;
}

/** Result of discovering the active scene's transcript. */
export type TranscriptExportResult =
  | { ok: true; transcript: unknown }
  | { ok: false; reason: string };

/**
 * Resolve the active scene's transcript.
 *
 * Probes the supported property names in order, accepting only objects with
 * a callable `getTranscript()`. The first conforming recorder's transcript is
 * returned; a throwing `getTranscript()` becomes a reasoned failure so the
 * caller can surface it instead of silently exporting nothing.
 *
 * @param scene The active scene as a plain record (read-only; no accessors).
 * @returns `{ ok: true, transcript }` on success, or `{ ok: false, reason }`
 *   naming why no transcript could be produced.
 */
export function resolveTranscript(scene: Record<string, unknown>): TranscriptExportResult {
  for (const propertyName of SUPPORTED_RECORDER_PROPERTIES) {
    const candidate = scene[propertyName];
    if (
      candidate &&
      typeof candidate === 'object' &&
      typeof (candidate as TranscriptRecorderLike).getTranscript === 'function'
    ) {
      try {
        const transcript = (candidate as TranscriptRecorderLike).getTranscript();
        return { ok: true, transcript };
      } catch (error) {
        return { ok: false, reason: describeTranscriptReadError(error) };
      }
    }
  }
  return { ok: false, reason: NO_TRANSCRIPT_REASON };
}

/**
 * Describe a failed transcript read for the panel's visible status line.
 *
 * Appends the thrown error's message when one exists, so a developer sees
 * why the recorder failed rather than only that it failed.
 */
function describeTranscriptReadError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const detail = message ? ` (${message})` : '';
  return `Failed to read the transcript from the recorder${detail}`;
}

/**
 * Serialise a transcript for download.
 *
 * Pretty-prints with 2-space indentation exactly like the tool's historical
 * output (`JSON.stringify(transcript, null, 2)`); transcripts are plain,
 * JSON-serialisable data, so this is lossless.
 *
 * @param transcript The transcript returned by `getTranscript()`.
 * @returns The pretty-printed JSON payload, or `''` for a
 *   `JSON.stringify`-undefined value (e.g. a recorder returning `undefined`).
 */
export function serializeTranscript(transcript: unknown): string {
  return JSON.stringify(transcript, null, 2) ?? '';
}
