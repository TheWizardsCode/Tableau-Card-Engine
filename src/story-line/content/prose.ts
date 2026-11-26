/**
 * The authored **prose** fields and their length budgets.
 *
 * A story-line beat may carry a `context` paragraph (the situation before the
 * choice) and a terminal card may carry an `epilogue` (the closing prose).
 * Both are ordinary, **optional** CSV columns: an adapter that does not map
 * them means "this file has no such column", never an error. Both are prose,
 * so the only structural rule is an adopted length budget, which is reported
 * as a **non-fatal** diagnostic (an author can deliberately exceed it).
 *
 * The budget table lives here — not in the validator — so the editor, the
 * validator and the docs all quote one source of truth.
 *
 * @module
 */

import type { ContentAdapter, ContentFieldMapping } from './types';

/** The two authored prose fields. */
export type ProseField = 'context' | 'epilogue';

/** One prose field's adopted length budget. */
export interface ProseFieldSpec {
  /** The story-line field (and, by default, the CSV column) name. */
  readonly field: ProseField;
  /** Maximum authored length, in characters, before a warning is reported. */
  readonly budget: number;
}

/**
 * The adopted prose budgets, in reporting order.
 *
 * `context` is a beat's situation (a short paragraph); `epilogue` is a
 * terminal card's closing prose (a longer paragraph). Over-budget prose is a
 * **warning**, never a hard error.
 */
export const PROSE_FIELD_SPECS: readonly ProseFieldSpec[] = [
  { field: 'context', budget: 400 },
  { field: 'epilogue', budget: 600 },
];

/**
 * The CSV columns an adapter maps for the prose fields, in budget order.
 *
 * Returns only the fields the adapter actually maps, so an adapter that opts
 * out of prose contributes nothing here.
 *
 * @param adapter The game content adapter.
 * @returns The mapped prose columns (`field` plus its `column` name).
 */
export function mappedProseColumns(
  adapter: ContentAdapter,
): readonly { readonly field: ProseField; readonly column: string }[] {
  const fields: ContentFieldMapping = adapter.fields;
  const mapped: { readonly field: ProseField; readonly column: string }[] = [];
  for (const spec of PROSE_FIELD_SPECS) {
    const column = fields[spec.field];
    if (column !== undefined) mapped.push({ field: spec.field, column });
  }
  return mapped;
}
