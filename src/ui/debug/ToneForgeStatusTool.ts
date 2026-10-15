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
 *   - toggles synthesis when activated — disabling detaches the synth
 *     player/mapping so keys fall back to the WAV/Phaser path, and enabling
 *     opts back in. With a `loadIntegration` loader (the Main Street opt-in
 *     path) enabling lazily fetches + attaches the code-split ToneForge
 *     runtime module; without one it re-attaches the integration retained from
 *     the SoundManager constructor.
 *
 * Dev-only usage: consumers only create this entry behind `import.meta.env.DEV`
 * (or `isDevMode()`), so its imports are tree-shaken from production bundles.
 *
 * @module @ui/debug/ToneForgeStatusTool
 */

import type Phaser from 'phaser';
import type {
  SoundManager,
  SoundPlayer,
  SynthIntegrationDiagnostics,
} from '../../core-engine/SoundManager';
import type { DebugToolsEntry } from './DebugToolsRegistry';

/** Stable label used by the entry (and for de-duplication when injecting). */
export const TONEFORGE_DEBUG_TOOL_LABEL = 'ToneForge';

/** Description returned when there is no SoundManager to inspect. */
export const TONEFORGE_UNAVAILABLE_DESCRIPTION = 'SoundManager unavailable';

/**
 * A synth integration produced by a lazy loader: the player to attach, the
 * logical-key mapping, and the module-level diagnostics to surface.
 */
export interface SynthIntegrationLoad {
  /** The ToneForge-backed player to attach. */
  player: SoundPlayer;
  /** Logical-key to synth-factory mapping (defaults to empty). */
  keyMap?: Record<string, string>;
  /** Module-level metadata (factory count, last load error). */
  diagnostics?: SynthIntegrationDiagnostics;
}

/**
 * Lazily loads and builds the synth integration when synthesis is enabled.
 *
 * Return `null` to indicate the integration could not be built (the loader is
 * expected to have recorded diagnostics via
 * {@link SoundManager.setSynthDiagnostics} so the status line stays loud).
 */
export type SynthIntegrationLoader = () => Promise<SynthIntegrationLoad | null>;

/** Options controlling the opt-in enable path of the ToneForge status tool. */
export interface ToneForgeStatusToolOptions {
  /**
   * Lazy loader invoked the first time the user enables synthesis.
   *
   * This is the opt-in entry point (MS-0MV76P7BN00164RF): Main Street uses it
   * to fetch + attach the code-split ToneForge runtime module only when the
   * dev-only toggle is switched on, instead of at scene boot. When omitted the
   * tool enables the integration retained from the SoundManager constructor.
   */
  loadIntegration?: SynthIntegrationLoader;
}

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
 * @param options       Optional lazy-enable configuration. When a
 *                      `loadIntegration` loader is supplied, enabling the tool
 *                      fetches + attaches the integration lazily (opt-in).
 * @returns A {@link DebugToolsEntry} whose description tracks live synth state
 *          and whose `activate` handler toggles synth on/off.
 */
export function createToneForgeStatusTool(
  soundManager: SoundManager | null,
  options: ToneForgeStatusToolOptions = {},
): DebugToolsEntry {
  const { loadIntegration } = options;
  return {
    label: TONEFORGE_DEBUG_TOOL_LABEL,
    description: () =>
      soundManager ? buildDescription(soundManager) : TONEFORGE_UNAVAILABLE_DESCRIPTION,
    activate: (_scene: Phaser.Scene) => {
      if (!soundManager) return;
      // Toggle: detach when active; otherwise opt in (lazily load + attach the
      // integration, or re-attach the one retained at construction).
      if (soundManager.isSynthActive()) {
        soundManager.detachSynthIntegration();
        return;
      }
      if (!loadIntegration) {
        soundManager.enableSynth();
        return;
      }
      void loadIntegration()
        .then((integration) => {
          if (!integration) return; // loader recorded diagnostics
          soundManager.setSynthIntegration(
            integration.player,
            integration.keyMap ?? {},
            integration.diagnostics,
          );
        })
        .catch((error: unknown) => {
          // A throwing loader must never break the tool or the WAV path; record
          // the reason so the status line surfaces it.
          soundManager.setSynthDiagnostics({
            lastLoadError: error instanceof Error ? error.message : String(error),
          });
        });
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
