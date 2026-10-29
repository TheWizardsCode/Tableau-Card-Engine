/**
 * Adapter-driven card form field descriptors.
 *
 * The curated editor forms are **not** built from hard-coded column names: a
 * game's {@link ContentAdapter} declares its columns and the story-line field
 * mapping, and this module turns that declaration (plus a card's current
 * values) into an ordered list of field descriptors the forms render. Core
 * edits the generic story-line fields; every adapter-declared column renders
 * as an additional plain text field without core knowing what it means (a
 * Main Street coin delta is just a column).
 *
 * The same derivation is reused for a **new** card: `id` becomes editable
 * (instead of read-only), values start from the adapter's `newCardDefaults`,
 * and the mapped story-line fields start empty. That is what keeps the add
 * form adapter-driven too.
 *
 * Everything here is pure data transformation — no DOM, no Node, no Phaser —
 * so the derivation, the draft → edit-spec mapping and the validator-error
 * attribution are all unit-testable without a browser, and the same code
 * drives the page in a browser.
 *
 * @module
 */

import {
  editableColumnsOf,
  mappedFieldColumns,
  type ContentAdapter,
  type ContentCard,
  type ContentFieldMapping,
} from '../content/types';
import type { AddContentCardSpec, UpdateContentCardSpec } from '../content/mutate';
import type { ContentIssue } from '../content/validate';

/** How a form control renders a field. */
export type CardFieldKind = 'read-only' | 'text' | 'long-text' | 'boolean';

/** Where a field comes from: the story-line mapping or a game column. */
export type CardFieldGroup = 'core' | 'adapter';

/** One field the card forms render, derived from the adapter. */
export interface CardFieldDescriptor {
  /**
   * Stable logical field key: the story-line field name for mapped fields
   * (`id`, `name`, `effect`, `options`, …) or `column:<name>` for an adapter
   * column.
   */
  readonly key: string;
  /** Human-readable label (UK English) shown next to the control. */
  readonly label: string;
  /** Control kind. */
  readonly kind: CardFieldKind;
  /** Whether the field is a mapped story-line field or a game column. */
  readonly group: CardFieldGroup;
  /** The CSV column the value round-trips through. */
  readonly column: string;
  /** The current value as the control's string form (`'true'`/`'false'` flags). */
  readonly value: string;
  /** True when the field may be edited (the card id never is on an edit). */
  readonly editable: boolean;
  /** Optional short hint shown under the control. */
  readonly hint?: string;
  /** Known card ids offered as datalist suggestions (link fields). */
  readonly suggestions?: readonly string[];
}

/** The mapped story-line fields, in form order, with their presentation. */
interface CoreFieldSpec {
  readonly key: Exclude<keyof ContentFieldMapping, never>;
  readonly label: string;
  readonly kind: CardFieldKind;
  readonly hint?: string;
}

/**
 * The core-generic (story-line) fields, in the order the forms render them.
 *
 * `options` sits between the choice flag and the legacy links on purpose: it
 * is the modern successor-link encoding and takes precedence at compile time,
 * while accept/reject are the legacy two-way links. The hint says so, so an
 * author is never surprised that editing the legacy links has no effect on a
 * card that already carries an `options` encoding.
 */
const CORE_FIELDS: readonly CoreFieldSpec[] = [
  { key: 'id', label: 'Card id', kind: 'read-only', hint: 'The card id is the chain link target; it cannot be renamed here.' },
  { key: 'name', label: 'Name', kind: 'text' },
  { key: 'effect', label: 'Effect', kind: 'long-text' },
  {
    key: 'hasChoices',
    label: 'Choice card',
    kind: 'boolean',
    hint: 'A choice card presents the legacy two-way accept/reject links.',
  },
  {
    key: 'options',
    label: 'Options',
    kind: 'long-text',
    hint: 'Options encoding: label|target;label2|target2 — a comma separates random candidates.',
  },
  {
    key: 'acceptNextCardId',
    label: 'Accept link',
    kind: 'text',
    hint: 'Legacy two-way link — ignored when Options is set.',
  },
  {
    key: 'rejectNextCardId',
    label: 'Reject link',
    kind: 'text',
    hint: 'Legacy two-way link — ignored when Options is set.',
  },
  { key: 'storylineId', label: 'Story-line id', kind: 'text' },
  { key: 'storylineTitle', label: 'Story-line title', kind: 'text' },
];

/** Options for {@link buildCardFieldDescriptors}. */
export interface FieldDescriptorOptions {
  /** Known card ids, offered as suggestions on link fields. */
  readonly knownCardIds?: readonly string[];
}

/** Reads one mapped field's current value from a content card. */
function coreValue(card: ContentCard, key: CoreFieldSpec['key']): string {
  switch (key) {
    case 'id':
      return card.id;
    case 'name':
      return card.name;
    case 'effect':
      return card.effect;
    case 'hasChoices':
      return String(card.hasChoices);
    case 'acceptNextCardId':
      return card.acceptNextCardId ?? '';
    case 'rejectNextCardId':
      return card.rejectNextCardId ?? '';
    case 'options':
      return card.options;
    case 'storylineId':
      return card.storylineId ?? '';
    case 'storylineTitle':
      return card.storylineTitle ?? '';
  }
}

/** True when the adapter maps a given story-line field. */
function isMapped(adapter: ContentAdapter, key: CoreFieldSpec['key']): boolean {
  return adapter.fields[key] !== undefined;
}

/** Whether a core field offers card-id suggestions. */
function suggestsCards(key: CoreFieldSpec['key']): boolean {
  return (
    key === 'acceptNextCardId' || key === 'rejectNextCardId' || key === 'options'
  );
}

/** Appends the adapter-declared (non-mapped) columns as text descriptors. */
function adapterFields(
  adapter: ContentAdapter,
  valueOf: (column: string) => string,
): CardFieldDescriptor[] {
  const mappedColumns = new Set(
    mappedFieldColumns(adapter).map(([, column]) => column),
  );
  return editableColumnsOf(adapter)
    .filter((column) => !mappedColumns.has(column))
    .map((column): CardFieldDescriptor => ({
      key: `column:${column}`,
      label: column,
      kind: 'text',
      group: 'adapter',
      column,
      value: valueOf(column),
      editable: true,
    }));
}

/**
 * Derives the field descriptors for editing an existing card.
 *
 * Only fields the adapter actually maps are included (a game without a legacy
 * choice model simply has no choice/link fields), followed by every
 * adapter-declared column the file carries.
 *
 * @param adapter The game content adapter.
 * @param card    The card being edited.
 * @param options Optional known card ids for link suggestions.
 * @returns The ordered field descriptors.
 */
export function buildCardFieldDescriptors(
  adapter: ContentAdapter,
  card: ContentCard,
  options: FieldDescriptorOptions = {},
): CardFieldDescriptor[] {
  const descriptors: CardFieldDescriptor[] = [];
  for (const spec of CORE_FIELDS) {
    if (!isMapped(adapter, spec.key)) continue;
    descriptors.push({
      key: spec.key,
      label: spec.label,
      kind: spec.kind,
      group: 'core',
      column: adapter.fields[spec.key] as string,
      value: coreValue(card, spec.key),
      editable: spec.key !== 'id',
      ...(spec.hint !== undefined ? { hint: spec.hint } : {}),
      ...(suggestsCards(spec.key) && options.knownCardIds
        ? { suggestions: options.knownCardIds }
        : {}),
    });
  }
  descriptors.push(...adapterFields(adapter, (column) => card.fields[column] ?? ''));
  return descriptors;
}

/**
 * Derives the field descriptors for authoring a **new** card.
 *
 * The card id is editable (there is nothing to protect yet) and every value
 * starts from the adapter's `newCardDefaults`; the required id and name start
 * blank.
 *
 * @param adapter The game content adapter.
 * @param options Optional known card ids and initial story-line membership.
 * @returns The ordered field descriptors.
 */
export function buildNewCardFieldDescriptors(
  adapter: ContentAdapter,
  options: FieldDescriptorOptions & {
    readonly storylineId?: string | null;
    readonly storylineTitle?: string | null;
  } = {},
): CardFieldDescriptor[] {
  const defaults = adapter.newCardDefaults ?? {};
  const defaultValue = (key: CoreFieldSpec['key']): string => {
    if (key === 'id' || key === 'name' || key === 'effect') return '';
    if (key === 'storylineId') return options.storylineId ?? '';
    if (key === 'storylineTitle') return options.storylineTitle ?? '';
    if (key === 'hasChoices') return 'false';
    return defaults[adapter.fields[key] ?? ''] ?? '';
  };

  const descriptors: CardFieldDescriptor[] = [];
  for (const spec of CORE_FIELDS) {
    if (!isMapped(adapter, spec.key)) continue;
    descriptors.push({
      key: spec.key,
      label: spec.label,
      kind: spec.kind === 'read-only' ? 'text' : spec.kind,
      group: 'core',
      column: adapter.fields[spec.key] as string,
      value: defaultValue(spec.key),
      editable: true,
      ...(spec.hint !== undefined ? { hint: spec.hint } : {}),
      ...(suggestsCards(spec.key) && options.knownCardIds
        ? { suggestions: options.knownCardIds }
        : {}),
    });
  }
  descriptors.push(...adapterFields(adapter, (column) => defaults[column] ?? ''));
  return descriptors;
}

/**
 * Builds the initial draft (field key → string value) from descriptors.
 *
 * @param descriptors The field descriptors.
 * @returns A mutable-by-copy record of the loaded values.
 */
export function draftFromDescriptors(
  descriptors: readonly CardFieldDescriptor[],
): Record<string, string> {
  const draft: Record<string, string> = {};
  for (const descriptor of descriptors) draft[descriptor.key] = descriptor.value;
  return draft;
}

/**
 * The keys whose draft value differs from the descriptor's loaded value.
 *
 * @param descriptors The field descriptors (the loaded baseline).
 * @param draft       The current draft.
 * @returns Changed, editable field keys in descriptor order.
 */
export function changedFieldKeys(
  descriptors: readonly CardFieldDescriptor[],
  draft: Readonly<Record<string, string>>,
): string[] {
  return descriptors
    .filter((descriptor) => descriptor.editable)
    .filter((descriptor) => (draft[descriptor.key] ?? descriptor.value) !== descriptor.value)
    .map((descriptor) => descriptor.key);
}

/** A mutable view of an update spec, used while building it incrementally. */
type MutableUpdateSpec = {
  -readonly [K in keyof UpdateContentCardSpec]: UpdateContentCardSpec[K];
};

/** Converts one draft value into the update-spec field for a core key. */
function applyCoreValue(
  spec: MutableUpdateSpec,
  key: CoreFieldSpec['key'],
  value: string,
): void {
  const trimmed = value.trim();
  switch (key) {
    case 'name':
      spec.name = value;
      break;
    case 'effect':
      spec.effect = value;
      break;
    case 'hasChoices':
      spec.hasChoices = value === 'true';
      break;
    case 'options':
      spec.options = value;
      break;
    case 'acceptNextCardId':
      spec.acceptNextCardId = trimmed === '' ? null : trimmed;
      break;
    case 'rejectNextCardId':
      spec.rejectNextCardId = trimmed === '' ? null : trimmed;
      break;
    case 'storylineId':
      spec.storylineId = trimmed === '' ? null : trimmed;
      break;
    case 'storylineTitle':
      spec.storylineTitle = trimmed === '' ? null : trimmed;
      break;
    case 'id':
      // The id is the row selector, not an editable field.
      break;
  }
}

/**
 * Builds an `update-card` spec from a draft, including only changed fields.
 *
 * @param descriptors The field descriptors (the loaded baseline).
 * @param draft       The current draft.
 * @returns The update spec, or `null` when nothing changed (or no id).
 */
export function buildUpdateSpec(
  descriptors: readonly CardFieldDescriptor[],
  draft: Readonly<Record<string, string>>,
): UpdateContentCardSpec | null {
  const idDescriptor = descriptors.find((descriptor) => descriptor.key === 'id');
  if (!idDescriptor) return null;
  const changed = changedFieldKeys(descriptors, draft);
  if (changed.length === 0) return null;

  const spec: MutableUpdateSpec = { id: idDescriptor.value };
  const fields: Record<string, string> = {};
  for (const key of changed) {
    const descriptor = descriptors.find((candidate) => candidate.key === key);
    if (!descriptor) continue;
    const value = draft[key] ?? descriptor.value;
    if (descriptor.group === 'adapter') {
      fields[descriptor.column] = value;
      continue;
    }
    applyCoreValue(spec, key as CoreFieldSpec['key'], value);
  }
  if (Object.keys(fields).length > 0) spec.fields = fields;
  return spec;
}

/**
 * Builds an `add-card` spec from a new-card draft.
 *
 * Required values (id and name) are trimmed; nullable story-line fields are
 * `null` when blank so the adapter defaults apply. Adapter-declared columns
 * are always carried (they start from `newCardDefaults`).
 *
 * @param descriptors The new-card field descriptors.
 * @param draft       The current draft.
 * @returns The add spec.
 */
export function buildAddSpec(
  descriptors: readonly CardFieldDescriptor[],
  draft: Readonly<Record<string, string>>,
): AddContentCardSpec {
  const value = (key: string): string => {
    const descriptor = descriptors.find((candidate) => candidate.key === key);
    return draft[key] ?? descriptor?.value ?? '';
  };
  const optional = (key: string): string | null => {
    const trimmed = value(key).trim();
    return trimmed === '' ? null : trimmed;
  };
  const has = (key: string): boolean =>
    descriptors.some((descriptor) => descriptor.key === key);

  const fields: Record<string, string> = {};
  for (const descriptor of descriptors) {
    if (descriptor.group !== 'adapter') continue;
    fields[descriptor.column] = value(descriptor.key);
  }

  return {
    id: value('id').trim(),
    name: value('name').trim(),
    ...(has('effect') ? { effect: value('effect') } : {}),
    ...(has('hasChoices') ? { hasChoices: value('hasChoices') === 'true' } : {}),
    ...(has('options') ? { options: value('options') } : {}),
    ...(has('acceptNextCardId')
      ? { acceptNextCardId: optional('acceptNextCardId') }
      : {}),
    ...(has('rejectNextCardId')
      ? { rejectNextCardId: optional('rejectNextCardId') }
      : {}),
    ...(has('storylineId') ? { storylineId: optional('storylineId') } : {}),
    ...(has('storylineTitle') ? { storylineTitle: optional('storylineTitle') } : {}),
    ...(Object.keys(fields).length > 0 ? { fields } : {}),
  };
}

/** One validator/author error, attributed to a form field where possible. */
export interface CardFormError {
  /** Descriptor key the error belongs under, or `null` for a form-level error. */
  readonly field: string | null;
  /** Stable machine code (the validator issue code, or `author`/`preview`). */
  readonly code: string;
  /** Human-readable message. */
  readonly message: string;
}

/** Input for {@link attributeEditErrors}. */
export interface EditErrorAttribution {
  /** The form's field descriptors. */
  readonly descriptors: readonly CardFieldDescriptor[];
  /** The current draft. */
  readonly draft: Readonly<Record<string, string>>;
  /** The edited card's id (`null` when the form authors a new card). */
  readonly cardId: string | null;
  /** Plain error strings returned by the author/preview seam. */
  readonly errors: readonly string[];
  /** Structured validator issues for the candidate, when available. */
  readonly issues?: readonly ContentIssue[];
}

/** True when the descriptors contain the given key. */
function hasField(descriptors: readonly CardFieldDescriptor[], key: string): boolean {
  return descriptors.some((descriptor) => descriptor.key === key);
}

/** Finds the first field whose draft value mentions the offending target. */
function fieldForTarget(
  descriptors: readonly CardFieldDescriptor[],
  draft: Readonly<Record<string, string>>,
  target: string,
): string | null {
  const preference = ['options', 'acceptNextCardId', 'rejectNextCardId'];
  for (const key of preference) {
    const descriptor = descriptors.find((candidate) => candidate.key === key);
    if (!descriptor) continue;
    const value = draft[key] ?? descriptor.value;
    if (value.includes(target)) return key;
  }
  for (const descriptor of descriptors) {
    if (!descriptor.editable) continue;
    const value = draft[descriptor.key] ?? descriptor.value;
    if (value.includes(target)) return descriptor.key;
  }
  return null;
}

/** Attributes one validator issue to a form field (or `null`). */
function attributeIssue(
  issue: ContentIssue,
  input: EditErrorAttribution,
): string | null {
  const { descriptors, draft, cardId } = input;
  if (cardId !== null && issue.cardId !== cardId) return null;

  switch (issue.code) {
    case 'duplicate-id':
      return hasField(descriptors, 'id') ? 'id' : null;
    case 'missing-required-field': {
      if ((draft.name ?? '').trim() === '' && hasField(descriptors, 'name')) return 'name';
      if ((draft.id ?? '').trim() === '' && hasField(descriptors, 'id')) return 'id';
      return null;
    }
    case 'missing-storyline-id':
      return hasField(descriptors, 'storylineId') ? 'storylineId' : null;
    case 'orphan-link':
      return hasField(descriptors, 'hasChoices') ? 'hasChoices' : null;
    case 'invalid-option':
      return hasField(descriptors, 'options') ? 'options' : null;
    case 'unknown-successor':
    case 'dangling-link':
      return issue.target ? fieldForTarget(descriptors, draft, issue.target) : null;
    case 'unreachable-card':
    case 'cycle-error':
      return null;
  }
}

/**
 * Attributes author/validator errors to form fields so the forms can render
 * them **inline**, next to the control the author must fix.
 *
 * Structured validator issues are preferred (they carry the card, code and —
 * for link errors — the offending target); plain author error strings are
 * mapped by their documented phrasing so a missing required value or a
 * duplicate id lands on the right control too. Automated validation errors are
 * additionally rendered in the preview panel's full report, so nothing is
 * hidden when it cannot be attributed to one field.
 *
 * @param input The descriptors, draft, edited card id and errors to attribute.
 * @returns One entry per distinct error, in input order.
 */
export function attributeEditErrors(input: EditErrorAttribution): CardFormError[] {
  const attributed: CardFormError[] = [];
  const seen = new Set<string>();
  const push = (error: CardFormError): void => {
    const key = `${error.field ?? ''}|${error.message}`;
    if (seen.has(key)) return;
    seen.add(key);
    attributed.push(error);
  };

  for (const issue of input.issues ?? []) {
    push({
      field: attributeIssue(issue, input),
      code: issue.code,
      message: issue.message,
    });
  }

  for (const message of input.errors) {
    if (input.issues?.some((issue) => issue.message === message)) continue;
    let field: string | null = null;
    if (message.includes('--id is required')) field = 'id';
    else if (message.includes('--name is required')) field = 'name';
    else if (message.includes('duplicate id') || message.includes('already exists')) field = 'id';
    else if (message.includes('--options')) field = 'options';
    push({ field, code: 'author', message });
  }

  return attributed;
}
