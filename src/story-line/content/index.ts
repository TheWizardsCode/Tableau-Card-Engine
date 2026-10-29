/**
 * Story-line content and authoring toolkit.
 *
 * The runtime engine (`@story-line`) resolves a story-line; this barrel is the
 * **authoring** side of the same module:
 *
 * | Concern | Module | Members |
 * |---|---|---|
 * | Content model + adapter seam | `types` | `ContentCard`, `ContentAdapter`, `ContentFieldMapping`, `baseIdOf`, … |
 * | CSV + checksum | `csv` | `parseCsv`, `serialiseCsv`, `computeContentChecksum`, `cardsFromCsv`, `compileContentOptions` |
 * | Manifest + Mermaid | `manifest` | `buildStorylineManifest`, `serialiseManifest`, `renderMermaid`, `filterManifestByStoryline`, label helpers |
 * | Validation | `validate` | `validateContentCards`, `validateContentCsv`, text/JSON reports |
 * | Transactional authoring | `author` | `addContentCard`, `updateContentCard`, `updateContentCards`, `applyContentEditToFile` |
 * | Generated artefacts | `artefacts` | `renderArtefacts`, `checkArtefacts`, `writeArtefacts`, `previewArtefacts`, `DEFAULT_ARTEFACT_PATHS` |
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
  serialiseCsv,
} from './csv';

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
} from './validate';
export {
  contentValidationToJson,
  findCycles,
  formatContentValidationReport,
  validateContentCards,
  validateContentCsv,
} from './validate';

export type {
  AddContentCardSpec,
  ApplyContentEditOptions,
  ContentEditResult,
  ContentFileEditResult,
  ContentMutation,
  UpdateContentCardSpec,
} from './author';
export {
  addContentCard,
  applyContentEditToFile,
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

export {
  CONTENT_ADAPTERS,
  DEFAULT_CONTENT_ADAPTER,
  DEFAULT_CONTENT_PATH,
  GYM_CONTENT_ADAPTER,
  getContentAdapter,
  resolveContentAdapter,
} from './adapters';
