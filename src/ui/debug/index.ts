/**
 * Debug Tools module
 *
 * Provides dev-mode detection, the debug tool entry type, and
 * (in child work items) individual debug tool overlays such as
 * state inspector, game event log, session export, and AI decision viewer.
 *
 * @module @ui/debug
 */

export { isDevMode } from './DebugToolsRegistry';
export type { DebugToolsEntry } from './DebugToolsRegistry';
