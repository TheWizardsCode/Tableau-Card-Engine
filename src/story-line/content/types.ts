/**
 * Generic story-line *content* model and the content-adapter seam.
 *
 * The runtime engine ({@link ../types}) knows how to compile and resolve a
 * story-line; it deliberately knows nothing about where the cards come from.
 * This module supplies the authoring-side content model: a flat record that a
 * game's CSV row projects onto, plus a **declarative adapter** that maps a
 * game's own column names onto the generic story-line fields.
 *
 * The adapter is pure data — column names and defaults — so core never
 * imports a game, Phaser, or Main Street. A game declares, for example:
 *
 * ```ts
 * const adapter: ContentAdapter = {
 *   gameId: 'tavern',
 *   columns: ['card_key', 'card_name', 'flavour', 'arc', 'choices'],
 *   fields: {
 *     id: 'card_key',
 *     name: 'card_name',
 *     effect: 'flavour',
 *     options: 'choices',
 *     storylineId: 'arc',
 *     resources: 'resource_keys',
 *   },
 * };
 * ```
 *
 * Every column that is **not** part of the story-line field mapping lands in
 * {@link ContentCard.fields}, so game-specific columns (coin/reputation
 * deltas, renown, payoff, …) are editable and inspectable without core
 * knowing what they mean.
 *
 * Nothing in this module depends on Phaser or on a game repository.
 *
 * @module
 */

/**
 * The legacy per-card `clockCost` column the Long Erasure spike still carries.
 *
 * **Migration-only.** A per-card clock cost is beat-sheet data written in the
 * wrong place (GDD §2.1): pacing belongs to `beat.clockCost` in the episode
 * manifest, and the column retires with that move (`CG-0MWR0BJXI007UINE`, G10).
 * Until then exactly one reader consults it — the manifest validator's
 * `clock-cost-mismatch` rule — and never as a beat's authoritative cost.
 *
 * It is a **game column**, not a {@link ContentFieldMapping} field: an adapter
 * that declares it lists it in {@link ContentAdapter.columns}, and the rule
 * reads the raw cell from {@link ContentCard.fields}. Removing it from that
 * declaration (G10) therefore switches the check off with no code change.
 */
export const LEGACY_CLOCK_COST_COLUMN = 'clockCost' as const;

/**
 * One story-line card as **content**: the generic story-line fields plus the
 * game's own columns, keyed by their CSV column name.
 *
 * Structurally assignable to the runtime {@link StorylineCard} (it carries
 * `id`, `name`, `effect`, `options` and the storyline metadata), so a compiled
 * content card can be fed straight to the runtime system. A choice is
 * represented **only** by the `options` encoding — there is no second,
 * legacy choice/link representation in the content model.
 */
export interface ContentCard {
  /** Stable card template id (the adapter's `id` column). */
  readonly id: string;
  /** Human-readable card name (the adapter's `name` column). */
  readonly name: string;
  /** Human-readable effect text (`''` when the adapter maps no effect column). */
  readonly effect: string;
  /** Raw CSV `options` encoding (`''` when absent). */
  readonly options: string;
  /**
   * The beat's situation paragraph, verbatim from the adapter's `context`
   * column (`null` when the cell is blank). The value is only present when the
   * adapter **maps** the column — an unmapped prose column means "this file
   * has no such column", so the card carries no prose key at all.
   */
  readonly context?: string | null;
  /**
   * The terminal card's closing prose, verbatim from the adapter's `epilogue`
   * column (`null` when the cell is blank). Present only when the adapter maps
   * the column, like {@link ContentCard.context}.
   */
  readonly epilogue?: string | null;
  /** Story-arc identifier (`null` when the card belongs to no arc). */
  readonly storylineId: string | null;
  /** Human-readable story-arc title (`null` when absent). */
  readonly storylineTitle: string | null;
  /**
   * Every column that is not part of the adapter's story-line field mapping,
   * keyed by CSV column name, with the raw cell text (untrimmed).
   */
  readonly fields: Readonly<Record<string, string>>;
  /**
   * The resource keys this card declares for its option attributes: the row's
   * `resources` cell (`"coins, hull, morale"` → `['coins', 'hull', 'morale']`)
   * when it is non-blank, otherwise the file-level `#resources:` declaration
   * (`parseCsv` → `parseResourceDeclaration`). Empty when neither declares
   * any.
   *
   * A per-row cell **overrides** the file declaration rather than extending it,
   * so one file can carry a mixed-resource minority. The effective set is the
   * validation vocabulary for the card's `#cost`, `#extra` and `#when` option
   * attributes; when it is empty the engine's default `coins` / `reputation`
   * projection is checked instead.
   */
  readonly resourceKeys: readonly string[];
}

/**
 * Maps a game's CSV column names onto the generic story-line fields.
 *
 * Only `id` and `name` are required. A game without a choice model simply
 * omits `options`; a game without a storyline omits the storyline mappings.
 * An omitted mapping means "this content file has no such column" — never an
 * error.
 */
export interface ContentFieldMapping {
  /** Column carrying the card id. **Required.** */
  readonly id: string;
  /** Column carrying the card name. **Required.** */
  readonly name: string;
  /** Column carrying the human-readable effect text. */
  readonly effect?: string;
  /**
   * Column carrying the beat's situation paragraph. Optional: omitting it
   * means the content file has no prose column, which is always valid.
   */
  readonly context?: string;
  /**
   * Column carrying a terminal card's closing prose. Optional for the same
   * reason as {@link ContentFieldMapping.context}.
   */
  readonly epilogue?: string;
  /** Column carrying the CSV `options` encoding. */
  readonly options?: string;
  /** Column carrying the storyline id. */
  readonly storylineId?: string;
  /** Column carrying the storyline title. */
  readonly storylineTitle?: string;
  /**
   * Column declaring the resource keys the card's option attributes may use
   * (e.g. `resources` → `"hull,morale,stores,goodwill"`). Optional: when the
   * adapter declares no such column (or a cell is blank), validation falls
   * back to the engine's default `coins` / `reputation` projection.
   */
  readonly resources?: string;
}

/**
 * A game's content adapter: its CSV columns, the story-line field mapping and
 * the authoring defaults/hooks the generic tooling needs.
 *
 * The adapter is declarative data plus two optional pure hooks
 * ({@link ContentAdapter.baseId}, {@link ContentAdapter.describeImpact}), so
 * the same seam works for any game shape and stays trivially testable.
 */
export interface ContentAdapter {
  /** Stable game identifier (used in manifest provenance). */
  readonly gameId: string;
  /**
   * The content CSV's columns in file order. The parser trusts the file's own
   * header for round-tripping; this list is what the authoring tooling treats
   * as the expected schema (and what a new row is padded with).
   */
  readonly columns: readonly string[];
  /** Column → story-line field mapping. */
  readonly fields: ContentFieldMapping;
  /**
   * Extra (game-specific) columns the editor/authoring tooling may edit, over
   * and above the mapped story-line fields. Defaults to every non-mapped
   * column declared in {@link ContentAdapter.columns}.
   */
  readonly editableColumns?: readonly string[];
  /**
   * Column defaults for a newly authored card row (e.g. `{ trigger:
   * 'Incident', cost: '0' }`). The mapped fields are always initialised from
   * the authored spec, never from these defaults.
   */
  readonly newCardDefaults?: Readonly<Record<string, string>>;
  /**
   * Optional rule stripping a chain-instance serial from a card id
   * (`evt-x-3` → `evt-x`). Core content files hold templates, so the default
   * is the identity function.
   */
  readonly baseId?: (id: string) => string;
  /**
   * Optional human-readable description of a card's game-specific impact
   * (e.g. `−50 coins`), shown in manifest labels and diagrams. Pure and
   * deterministic; `''`/undefined when the game has nothing to add.
   */
  readonly describeImpact?: (card: ContentCard) => string;
}

/**
 * Resolves a card id to its base template id using the adapter's optional
 * `baseId` rule (identity when the adapter declares none).
 *
 * @param adapter The game content adapter.
 * @param id      A card id (possibly carrying an instance serial).
 * @returns The base template id.
 */
export function baseIdOf(adapter: ContentAdapter, id: string): string {
  return adapter.baseId ? adapter.baseId(id) : id;
}

/**
 * The mapped story-line fields as `[field, column]` pairs, omitting any
 * mapping the adapter does not declare. Used by the authoring layer to
 * initialise and read rows without repeating the mapping table.
 *
 * @param adapter The game content adapter.
 * @returns Deterministic list of mapped field/column pairs.
 */
export function mappedFieldColumns(
  adapter: ContentAdapter,
): readonly (readonly [keyof ContentFieldMapping, string])[] {
  const fields = adapter.fields;
  const pairs: (readonly [keyof ContentFieldMapping, string])[] = [
    ['id', fields.id],
    ['name', fields.name],
  ];
  if (fields.effect !== undefined) pairs.push(['effect', fields.effect]);
  if (fields.options !== undefined) pairs.push(['options', fields.options]);
  if (fields.context !== undefined) pairs.push(['context', fields.context]);
  if (fields.epilogue !== undefined) pairs.push(['epilogue', fields.epilogue]);
  if (fields.storylineId !== undefined) pairs.push(['storylineId', fields.storylineId]);
  if (fields.storylineTitle !== undefined) {
    pairs.push(['storylineTitle', fields.storylineTitle]);
  }
  if (fields.resources !== undefined) pairs.push(['resources', fields.resources]);
  return pairs;
}

/**
 * The columns the authoring tooling may edit: the mapped story-line columns
 * plus the adapter's declared game columns.
 *
 * @param adapter The game content adapter.
 * @returns Deterministic, de-duplicated column list in declaration order.
 */
export function editableColumnsOf(adapter: ContentAdapter): readonly string[] {
  const mapped = mappedFieldColumns(adapter).map(([, column]) => column);
  const extras =
    adapter.editableColumns ??
    adapter.columns.filter((column) => !mapped.includes(column));
  const seen = new Set<string>();
  const result: string[] = [];
  for (const column of [...mapped, ...extras]) {
    if (seen.has(column)) continue;
    seen.add(column);
    result.push(column);
  }
  return result;
}
