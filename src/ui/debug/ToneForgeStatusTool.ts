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

/**
 * Append the ToneForge status entry to a debug-tools list, unless an entry with
 * the same label is already present (de-duplication by label).
 *
 * Called by the engine on the **effective** debug-tools list, so the entry also
 * appears when a game supplies its own `debugTools` (which bypasses the engine
 * default list). The caller must invoke this only in dev mode so the module is
 * tree-shaken from production bundles.
 *
 * @param tools        Existing debug tools (may already contain a ToneForge entry).
 * @param soundManager The scene's SoundManager, captured by reference.
 * @returns A new array; the input array is never mutated.
 */
export function withToneForgeStatusTool(
  tools: DebugToolsEntry[],
  soundManager: SoundManager | null,
): DebugToolsEntry[] {
  if (tools.some((tool) => tool.label === TONEFORGE_DEBUG_TOOL_LABEL)) {
    return tools;
  }
  return [...tools, createToneForgeStatusTool(soundManager)];
}

/**
 * Resolve the effective debug-tools list for a scene.
 *
 * Always injects the ToneForge status entry when `devMode` is true,
 * de-duplicated by label; in production (`devMode` false) no entry is added so
 * the status tool tree-shakes out of the bundle. Extracted as a pure function
 * so the dev/prod gate and de-duplication are unit-testable without a scene.
 *
 * @param gameTools    Tools supplied by the game, if any.
 * @param soundManager The scene's SoundManager, captured by reference.
 * @param devMode      Whether dev-mode debug tools are active.
 * @returns The effective debug-tools list (never the same array mutated).
 */
export function resolveEffectiveDebugTools(
  gameTools: DebugToolsEntry[] | undefined,
  soundManager: SoundManager | null,
  devMode: boolean,
): DebugToolsEntry[] {
  if (!devMode) {
    return gameTools ?? [];
  }
  return withToneForgeStatusTool(gameTools ?? [], soundManager);
}
