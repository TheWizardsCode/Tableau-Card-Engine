/**
 * Dev mode detection and debug tool entry interface.
 *
 * Provides shared infrastructure for the Settings panel Debug Tools section:
 * - `isDevMode()` — detects Vite development mode via `import.meta.env.DEV`
 * - `DebugToolsEntry` — type interface for registering debug tool entries
 *
 * Because `import.meta.env.DEV` is a Vite build-time define, all code gated
 * behind `if (import.meta.env.DEV)` is tree-shaken from production bundles.
 * See {@link https://vite.dev/guide/env-and-mode}.
 *
 * @module @ui/debug/DebugToolsRegistry
 */

/** A single debug tool entry for the Settings panel Debug section. */
export interface DebugToolsEntry {
  /** Display label shown in the panel (e.g., 'State Inspector'). */
  label: string;
  /** Short description shown underneath the label. */
  description: string;
  /** Called when the user activates this tool (click/tap). */
  activate: (scene: Phaser.Scene) => void;
}

/**
 * Returns `true` when running in Vite development mode (`npm run dev`).
 *
 * This is a build-time constant – Vite replaces `import.meta.env.DEV`
 * with `true` or `false` during bundling. Code gated behind this call
 * is tree-shaken from production builds.
 */
export function isDevMode(): boolean {
  return import.meta.env.DEV;
}
