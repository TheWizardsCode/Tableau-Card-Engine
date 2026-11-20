/**
 * A second, deliberately differently shaped content adapter used by the tests.
 *
 * It proves the content seam is game-agnostic: different column names, an
 * `options` column under a different name, a different game column
 * (`payoff`) and its own impact wording. Nothing here is shipped by the
 * engine — it exists so the tests exercise two adapters, not one.
 *
 * @module
 */

import type {
  ContentAdapter,
  ContentFieldMapping,
} from '../../../src/story-line/content/types';

/** Column names used by the tavern fixture CSVs. */
export const TAVERN_COLUMNS = [
  'card_key',
  'card_name',
  'flavour',
  'arc',
  'arc_name',
  'choices',
  'payoff',
] as const;

/** The tavern fixture adapter (see `tests/fixtures/story-line/tavern-*.csv`). */
export const TAVERN_CONTENT_ADAPTER: ContentAdapter = {
  gameId: 'tavern-fixture',
  columns: [...TAVERN_COLUMNS],
  fields: {
    id: 'card_key',
    name: 'card_name',
    effect: 'flavour',
    options: 'choices',
    storylineId: 'arc',
    storylineTitle: 'arc_name',
  },
  editableColumns: ['payoff'],
  newCardDefaults: { flavour: '', choices: '', payoff: '0' },
  describeImpact: (card) => {
    const payoff = Number(card.fields.payoff ?? '');
    return Number.isFinite(payoff) && payoff !== 0 ? `payoff ${payoff}` : '';
  },
};

/**
 * Columns used by the prose fixtures (`tests/fixtures/story-line/prose/`).
 *
 * The generic story-line shape plus the two prose columns the contract adds:
 * `context` (per beat) and `epilogue` (per terminal card).
 */
export const PROSE_COLUMNS = [
  'id',
  'name',
  'effect',
  'options',
  'storylineId',
  'storylineTitle',
  'resources',
  'context',
  'epilogue',
] as const;

/**
 * The prose field mapping.
 *
 * Kept as a separate `const` so it is **not a fresh literal** when assigned to
 * {@link ContentFieldMapping}: the prose contract requires `context` /
 * `epilogue` keys here, and until the CSV-columns child
 * (`CG-0MWO7CSH9000JYWH`) lands those keys are extra properties. A variable
 * assignment is structurally accepted both before and after the interface
 * gains them, so these red tests compile against today's types without
 * weakening the assertion.
 */
const PROSE_FIELDS = {
  id: 'id',
  name: 'name',
  effect: 'effect',
  options: 'options',
  storylineId: 'storylineId',
  storylineTitle: 'storylineTitle',
  resources: 'resources',
  context: 'context',
  epilogue: 'epilogue',
};

/**
 * Type-level assertion that the prose mapping is a valid content field
 * mapping. Fails to compile if the prose columns cannot be expressed as field
 * mappings at all (an inline literal would instead trip the excess-property
 * check before the type gains the keys, which is not the property under test).
 */
export const PROSE_FIELD_MAPPING: ContentFieldMapping = PROSE_FIELDS;

/**
 * The prose fixture adapter: the generic shape plus mapped prose columns.
 *
 * This is the "a game opts in by mapping the columns" case, so the contract
 * tests exercise prose that is *mapped* (and therefore lifted onto the card)
 * rather than prose that merely sits in `fields`.
 */
export const PROSE_CONTENT_ADAPTER: ContentAdapter = {
  gameId: 'prose-fixture',
  columns: [...PROSE_COLUMNS],
  fields: PROSE_FIELD_MAPPING,
  editableColumns: [],
};
