/**
 * SessionExportTool — Debug tool entry for exporting game session data.
 *
 * Provides an "Export Session" entry in the Debug Tools section that
 * triggers a browser download of the current game transcript as a JSON file.
 * Operates generically: transcript discovery is delegated to the Phaser-free
 * `transcriptExport` resolver, which probes the engine's common scene shapes
 * (`recorder`, `transcriptRecorder`, `transcript`) instead of a single hard
 * coded property name (CG-0MW3KV4D7004KCF0). When no conforming recorder is
 * found — or `getTranscript()` throws — no download is triggered and the
 * reason is surfaced through the tool's live description in the Settings
 * panel instead of silently exporting an empty file.
 *
 * @module @ui/debug/SessionExportTool
 */

import type Phaser from 'phaser';
import type { DebugToolsEntry } from './DebugToolsRegistry';
import { resolveTranscript, serializeTranscript } from './transcriptExport';

/** Default description shown when no recent export attempt failed. */
const DEFAULT_DESCRIPTION = 'Download current game transcript as JSON';

/**
 * Reason for the most recent failed export, surfaced via the tool's
 * function-valued `description` (re-resolved by the Settings panel's
 * 500 ms poll). `null` once a later attempt succeeded — the status always
 * reflects only the most recent attempt.
 */
let lastExportFailureReason: string | null = null;

/** Resolve the entry's live description, reflecting any recent failure. */
function statusDescription(): string {
  return lastExportFailureReason ?? DEFAULT_DESCRIPTION;
}

/**
 * Trigger a browser file download of the transcript JSON.
 *
 * Reuses the `Blob` + `URL.createObjectURL` + synthetic anchor-click pattern
 * shared with the game-specific transcript download helpers.
 */
function triggerDownload(transcriptJson: string): void {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `session-export-${timestamp}.json`;
  const blob = new Blob([transcriptJson], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

/**
 * Create a debug tool entry that exports the current game transcript.
 *
 * The tool resolves the active scene's transcript recorder via
 * {@link resolveTranscript}. On success it downloads the full transcript as
 * `session-export-<timestamp>.json` (lossless, 2-space-pretty JSON). On
 * failure — no conforming recorder on the scene, a throwing `getTranscript()`
 * or an unserialisable transcript — it downloads nothing and shows the reason
 * in the entry's live description.
 *
 * @returns A `DebugToolsEntry` configured for session export.
 */
export function createSessionExportTool(): DebugToolsEntry {
  return {
    label: 'Export Session',
    description: statusDescription,
    activate: (scene: Phaser.Scene) => {
      const result = resolveTranscript(scene as unknown as Record<string, unknown>);
      if (!result.ok) {
        lastExportFailureReason = result.reason;
        return;
      }
      try {
        triggerDownload(serializeTranscript(result.transcript));
        lastExportFailureReason = null;
      } catch {
        lastExportFailureReason = 'Failed to serialise the transcript';
      }
    },
  };
}
