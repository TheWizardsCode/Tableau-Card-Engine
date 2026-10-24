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
 * | Transactional authoring | `author` | `addContentCard`, `updateContentCard`, `applyContentEditToFile` |
 * | Shipped adapters | `adapters` | `GYM_CONTENT_ADAPTER`, `DEFAULT_CONTENT_ADAPTER`, `getContentAdapter` |
 *
 * Nothing here imports a game repository or Phaser, and
 * `applyContentEditToFile` is the only content writer.
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
} from './author';

export {
  CONTENT_ADAPTERS,
  DEFAULT_CONTENT_ADAPTER,
  DEFAULT_CONTENT_PATH,
  GYM_CONTENT_ADAPTER,
  getContentAdapter,
  resolveContentAdapter,
} from './adapters';
