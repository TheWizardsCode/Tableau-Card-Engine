/**
 * SessionExportTool — Debug tool entry for exporting game session data.
 *
 * Provides an "Export Session" entry in the Debug Tools section that
 * triggers a browser download of the current game transcript as a JSON file.
 * Reuses the same pattern as the game-specific `triggerTranscriptDownload`
 * helpers found in example games, but operates generically by looking for
 * a `recorder` property on the active scene.
 *
 * @module @ui/debug/SessionExportTool
 */

import type Phaser from 'phaser';
import type { DebugToolsEntry } from './DebugToolsRegistry';

/**
 * Create a debug tool entry that exports the current game transcript.
 *
 * The tool looks for a `recorder` property on the active scene. If the
 * recorder exposes a `getTranscript()` method, its output is serialized
 * to JSON and downloaded. Otherwise, an empty transcript is produced so
 * the button always provides useful feedback even in scenes without
 * a transcript recorder.
 *
 * @returns A `DebugToolsEntry` configured for session export.
 */
export function createSessionExportTool(): DebugToolsEntry {
  return {
    label: 'Export Session',
    description: 'Download current game transcript as JSON',
    activate: (scene: Phaser.Scene) => {
      const anyScene = scene as unknown as Record<string, unknown>;
      const recorder = anyScene.recorder;

      let transcriptJson: string;
      if (
        recorder &&
        typeof recorder === 'object' &&
        typeof (recorder as Record<string, unknown>).getTranscript === 'function'
      ) {
        const transcript = (recorder as Record<string, unknown>).getTranscript as () => unknown;
        transcriptJson = JSON.stringify(transcript(), null, 2);
      } else {
        // Fallback: produce an empty transcript
        transcriptJson = JSON.stringify({ turns: [], events: [], metadata: { exportedAt: new Date().toISOString() } }, null, 2);
      }

      // Trigger browser file download
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
    },
  };
}
