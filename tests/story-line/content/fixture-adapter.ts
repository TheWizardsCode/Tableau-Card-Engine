/**
 * A second, deliberately differently shaped content adapter used by the tests.
 *
 * It proves the content seam is game-agnostic: different column names, no
 * legacy `hasChoices` / accept-reject columns at all, a different game column
 * (`payoff`) and its own impact wording. Nothing here is shipped by the
 * engine — it exists so the tests exercise two adapters, not one.
 *
 * @module
 */

import type { ContentAdapter } from '../../../src/story-line/content/types';

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
