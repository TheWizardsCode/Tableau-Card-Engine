/**
 * Debug Tools barrel module.
 *
 * Re-exports all debug tool factories, the registry, and types
 * so consumers can import from a single location.
 *
 * @module @ui/debug
 */

export { isDevMode, resolveDebugToolDescription, type DebugToolsEntry } from './DebugToolsRegistry';
export { createSessionExportTool } from './SessionExportTool';
export {
  SUPPORTED_RECORDER_PROPERTIES,
  NO_TRANSCRIPT_REASON,
  resolveTranscript,
  serializeTranscript,
  type TranscriptExportResult,
  type TranscriptRecorderLike,
} from './transcriptExport';
export { createStateInspectorTool } from './StateInspectorOverlay';
export { createGameEventLogTool } from './GameEventLogOverlay';
export type { GameEventLogToolOptions } from './GameEventLogOverlay';
export {
  CIRCULAR_PAYLOAD_PLACEHOLDER,
  EVENT_LOG_PAYLOAD_COLOUR,
  EVENT_LOG_TAG_COLOUR,
  EVENT_LOG_TIMESTAMP_COLOUR,
  NEUTRAL_EVENT_LOG_PALETTE,
  formatEventLogEntry,
  formatEventLogName,
  formatEventLogPayload,
  formatEventLogTimestamp,
  resolveEventStyle,
  stringifyPayloadSafe,
  widestLineLength,
} from './formatEventLog';
export type { EventLogEntry, EventLogPalette, EventLogStyle } from './formatEventLog';
export { createAiDecisionViewerTool } from './AiDecisionOverlay';
export {
  createToneForgeStatusTool,
  withToneForgeStatusTool,
  resolveEffectiveDebugTools,
  TONEFORGE_DEBUG_TOOL_LABEL,
  TONEFORGE_UNAVAILABLE_DESCRIPTION,
} from './ToneForgeStatusTool';
export type {
  SynthIntegrationLoad,
  SynthIntegrationLoader,
  ToneForgeStatusToolOptions,
} from './ToneForgeStatusTool';
// MarketCardCheatOverlay moved to example-games/main-street/debug (Main Street-owned).
// StaffApplicantCheatOverlay moved to example-games/main-street/debug (Main Street-owned).
export { AiDecisionRecorder } from './AiDecisionRecorder';
export type { AiDecisionRecord } from './AiDecisionRecorder';
