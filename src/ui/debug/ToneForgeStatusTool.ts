/**
 * ToneForgeStatusTool — Debug tool entry that reports whether ToneForge
 * runtime synthesis is active and toggles it on/off without a scene restart.
 *
 * The entry is diagnostic: it captures the scene's {@link SoundManager}
 * reference at creation time and:
 *
 *   - renders a **live** description (resolved on every panel refresh) showing
 *     `Active` / `Inactive` plus the mapped-factory count and the last module
 *     load error when one was recorded;
 *   - toggles synthesis when activated — detaching the synth player/mapping so
 *     keys fall back to the WAV/Phaser path, or re-attaching the previously
 *     retained integration.
 *
 * Dev-only usage: consumers only create this entry behind `import.meta.env.DEV`
 * (or `isDevMode()`), so its imports are tree-shaken from production bundles.
 *
 * @module @ui/debug/ToneForgeStatusTool
 */

import type Phaser from 'phaser';
import type { SoundManager } from '../../core-engine/SoundManager';
import type { DebugToolsEntry } from './DebugToolsRegistry';

/** Stable label used by the entry (and for de-duplication when injecting). */
export const TONEFORGE_DEBUG_TOOL_LABEL = 'ToneForge';

/** Description returned when there is no SoundManager to inspect. */
export const TONEFORGE_UNAVAILABLE_DESCRIPTION = 'SoundManager unavailable';

/**
 * Build the live status line for a SoundManager.
 *
 * Format: `{Active|Inactive} · {n} factories[ · load error: {message}]`.
 * A load error is surfaced whenever one has been recorded, regardless of the
 * current active state, so a failed async module load is never hidden.
 */
function buildDescription(soundManager: SoundManager): string {
  const status = soundManager.getSynthStatus();
  const parts = [
    status.active ? 'Active' : 'Inactive',
    `· ${status.factoryCount} ${status.factoryCount === 1 ? 'factory' : 'factories'}`,
  ];
  if (status.lastLoadError) {
    parts.push(`· load error: ${status.lastLoadError}`);
  }
  return parts.join(' ');
}

/**
 * Create the ToneForge status debug tool entry.
 *
 * @param soundManager  The scene's SoundManager (captured by reference), or
 *                      `null` when the scene has no audio system.
 * @returns A {@link DebugToolsEntry} whose description tracks live synth state
 *          and whose `activate` handler toggles synth on/off.
 */
export function createToneForgeStatusTool(
  soundManager: SoundManager | null,
): DebugToolsEntry {
  return {
    label: TONEFORGE_DEBUG_TOOL_LABEL,
    description: () =>
      soundManager ? buildDescription(soundManager) : TONEFORGE_UNAVAILABLE_DESCRIPTION,
    activate: (_scene: Phaser.Scene) => {
      if (!soundManager) return;
      // Toggle: detach when active; otherwise restore the retained integration.
      if (soundManager.isSynthActive()) {
        soundManager.detachSynthIntegration();
      } else {
        soundManager.restoreSynthIntegration();
      }
    },
  };
}
