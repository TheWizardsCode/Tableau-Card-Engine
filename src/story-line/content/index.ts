/**
 * Story-line content and authoring toolkit.
 *
 * The runtime engine (`@story-line`) resolves a story-line; this barrel is the
 * **authoring** side of the same module:
 *
 * | Concern | Module | Members |
 * |---|---|---|
 * | Content model + adapter seam | `types` | `ContentCard`, `ContentAdapter`, `ContentFieldMapping`, `baseIdOf`, … |
 * | CSV + checksum | `csv` | `parseCsv`, `parseResourceDeclaration`, `serialiseCsv`, `computeContentChecksum`, `cardsFromCsv`, `compileContentOptions` |
 * | Manifest + Mermaid | `manifest` | `buildStorylineManifest`, `serialiseManifest`, `renderMermaid`, `filterManifestByStoryline`, label helpers |
 * | Episode manifest shape | `episode-manifest` | `EpisodeManifest`/`Act`/`Scene`/`Beat`/… types, `MANIFEST_VERSION`, `DEFAULT_EPISODE_MANIFEST_SCHEMA_PATH` |
 * | Validation | `validate` | `validateContentCards`, `validateContentCsv`, text/JSON reports, `storylineEntryCards` |
 * | Transactional authoring | `author` | `addContentCard`, `addLinkedContentCard`, `addOptionToContentCard`, `updateContentCard`, `updateContentCards`, `applyContentEditToFile` |
 * | Generated artefacts | `artefacts` | `renderArtefacts`, `checkArtefacts`, `writeArtefacts`, `previewArtefacts`, `DEFAULT_ARTEFACT_PATHS` |
 * | Prohibited-term (IP) scan | `ip-terms` | `parseProhibitedTermList`, `scanProhibitedTerms` |
 * | Shipped adapters | `adapters` | `GYM_CONTENT_ADAPTER`, `DEFAULT_CONTENT_ADAPTER`, `getContentAdapter` |
 *
 * Nothing here imports a game repository or Phaser,
 * `applyContentEditToFile` is the only content writer, and `writeArtefacts` is
 * the only generated-artefact writer.
 *
 * @module
 */

export type {
  ContentAdapter,
  ContentCard,
  ContentFieldMapping,
} from './types';
export {
  baseIdOf,
  editableColumnsOf,
  mappedFieldColumns,
} from './types';

export type { ParsedCsv } from './csv';
export {
  cardsFromCsv,
  compileContentOptions,
  computeContentChecksum,
  contentCardHasChoice,
  escapeCsvField,
  findMissingColumns,
  optionSuccessorIds,
  parseCsv,
  parseResourceDeclaration,
  serialiseCsv,
} from './csv';

export type {
  ContentGuardConsequentialChoice,
  ContentGuardEnding,
  ContentGuardGatedBranch,
  ContentGuardGateKind,
  ContentGuardInvariant,
  ContentGuardOptions,
  ContentGuardReport,
  ContentGuardViolation,
} from './guard';
export {
  CONSEQUENTIAL_COLUMN,
  DEFAULT_GUARD_MAX_DEPTH,
  DEFAULT_GUARD_MAX_STATES,
  DEFAULT_MIN_REJOIN_DISTANCE,
  ENDING_COLUMN,
  contentGuardToJson,
  evaluateContentGuard,
  evaluateContentGuardCsv,
  formatContentGuardReport,
} from './guard';

export type {
  ManifestBuildOptions,
  ManifestEdge,
  ManifestNode,
  ManifestOption,
  StorylineManifest,
} from './manifest';
export {
  DEFAULT_MANIFEST_SCHEMA_PATH,
  briefEventDescription,
  buildStorylineManifest,
  buildStorylineManifestFromCsv,
  describeChoiceRouting,
  describeEventImpact,
  filterManifestByStoryline,
  nodeLabel,
  renderMermaid,
  serialiseManifest,
} from './manifest';

export type {
  ContentFinding,
  ContentFindingKind,
  ContentIssue,
  ContentIssueCode,
  ContentValidationOptions,
  ContentValidationResult,
  ContentWarning,
  ContentWarningCode,
} from './validate';
export {
  contentValidationToJson,
  findCycles,
  formatContentValidationReport,
  storylineEntryCards,
  validateContentCards,
  validateContentCsv,
} from './validate';

export type {
  Act,
  Beat,
  EpisodeManifest,
  LossRule,
  Objective,
  OutcomeRule,
  ResourceBounds,
  ResourceCheck,
  RouteTarget,
  Scene,
  SceneCondition,
  SceneOutcome,
  SceneRoute,
} from './episode-manifest';
export { DEFAULT_EPISODE_MANIFEST_SCHEMA_PATH, MANIFEST_VERSION } from './episode-manifest';

export type { ProseField, ProseFieldSpec } from './prose';
export { PROSE_FIELD_SPECS, mappedProseColumns } from './prose';

export type {
  AddContentCardSpec,
  AddLinkedCardSpec,
  AddOptionContentCardSpec,
  ApplyContentEditOptions,
  ContentEditResult,
  ContentFileEditResult,
  ContentMutation,
  UpdateContentCardSpec,
} from './author';
export {
  addContentCard,
  addLinkedContentCard,
  addOptionToContentCard,
  appendOptionEncoding,
  applyContentEditToFile,
  encodeOptionEntry,
  hasContentCard,
  readContentCards,
  updateContentCard,
  updateContentCards,
} from './author';

export type {
  ArtefactContent,
  ArtefactDrift,
  ArtefactFormat,
  ArtefactPaths,
  ArtefactWriteResult,
} from './artefacts';
export {
  DEFAULT_ARTEFACT_PATHS,
  checkArtefacts,
  previewArtefacts,
  renderArtefacts,
  writeArtefacts,
} from './artefacts';

export type {
  ProhibitedTermAllowance,
  ProhibitedTermList,
  ProhibitedTermListParseResult,
  ProhibitedTermMatch,
} from './ip-terms';
export { parseProhibitedTermList, scanProhibitedTerms } from './ip-terms';

export type { ContentFileSpec } from './adapters';
export {
  CONTENT_ADAPTERS,
  DEFAULT_CONTENT_ADAPTER,
  DEFAULT_CONTENT_FILES,
  DEFAULT_CONTENT_PATH,
  GYM_CONTENT_ADAPTER,
  LONG_ERASURE_CONTENT_ADAPTER,
  LONG_ERASURE_CONTENT_PATH,
  findContentFileSpec,
  getContentAdapter,
  resolveContentAdapter,
} from './adapters';
