/**
 * Story-line option compilation and the registered-option registry.
 *
 * Compilation turns a card's CSV `options` encoding or a programmatically
 * registered option list into the generalised {@link StorylineOption} model
 * used by resolution.
 *
 * Precedence: registered options > CSV `options` encoding.
 *
 * @module
 */

import {
  DEFAULT_RESOURCE_KEYS,
  readResource,
  resolveResourceKeys,
} from './resources';
import type { StorylineResourceKey, StorylineResources } from './resources';
import type {
  CompiledStoryline,
  ConditionalSuccessorRule,
  Condition,
  OptionCost,
  OptionExtraEffect,
  StorylineCard,
  StorylineOption,
} from './types';

/**
 * Registry of explicitly registered option lists, keyed by base event id
 * (without the instance serial). Module-scoped per system instance so a game
 * or test never sees another system's registrations; games are responsible
 * for resetting it in test teardown.
 */
export interface StorylineOptionRegistry<TState> {
  register(eventId: string, options: readonly StorylineOption<TState>[]): void;
  reset(): void;
  has(eventId: string): boolean;
  get(eventId: string): StorylineOption<TState>[] | undefined;
}

/** Creates an empty option registry keyed by base type id. */
export function createStorylineOptionRegistry<TState>(
  baseTypeId: (id: string) => string,
): StorylineOptionRegistry<TState> {
  const map = new Map<string, StorylineOption<TState>[]>();
  return {
    register(eventId: string, options: readonly StorylineOption<TState>[]): void {
      map.set(
        baseTypeId(eventId),
        options.map((o) => ({ ...o })),
      );
    },
    reset(): void {
      map.clear();
    },
    has(eventId: string): boolean {
      return map.has(baseTypeId(eventId));
    },
    get(eventId: string): StorylineOption<TState>[] | undefined {
      return map.get(baseTypeId(eventId));
    },
  };
}

/** Alias for the registry type, re-exported for callers. */
export type { StorylineOptionRegistry as StorylineOptionRegistryType };

/**
 * Machine-readable reason for a malformed `options` encoding.
 *
 * Content validation surfaces this verbatim on a `ContentIssue`, so an author
 * gets a stable reason next to the offending row and column.
 */
export type StorylineOptionsEncodingErrorReason =
  | 'missing-separator'
  | 'empty-label'
  | 'malformed-attribute'
  | 'unknown-attribute'
  | 'malformed-cost-pair'
  | 'malformed-extra-pair'
  | 'unparseable-condition'
  | 'no-valid-option';

/**
 * Error raised by {@link parseStorylineOptionsEncoding} for a malformed
 * `options` cell.
 *
 * Carries a stable {@link StorylineOptionsEncodingErrorReason | reason} and the
 * offending attribute name (when the fault is scoped to one), so content-level
 * tooling can report a row + column + reason diagnostic instead of only a
 * free-form message.
 */
export class StorylineOptionsEncodingError extends Error {
  /** Stable machine-readable failure reason. */
  readonly reason: StorylineOptionsEncodingErrorReason;
  /** The `#attribute` the fault belongs to, when applicable. */
  readonly attribute?: string;

  constructor(
    message: string,
    reason: StorylineOptionsEncodingErrorReason,
    attribute?: string,
  ) {
    super(message);
    this.name = 'StorylineOptionsEncodingError';
    this.reason = reason;
    if (attribute !== undefined) this.attribute = attribute;
  }
}

/** Splits an option segment into its `label|successors` head and attributes. */
function splitOptionSegment(
  segment: string,
): { head: string; attributes: readonly string[] } {
  const parts = segment.split('#');
  return { head: (parts[0] ?? '').trim(), attributes: parts.slice(1) };
}

/** Parses a finite number, rejecting blank/non-numeric text. */
function parseAttributeNumber(
  raw: string,
  encoding: string,
  message: string,
  reason: StorylineOptionsEncodingErrorReason,
  attribute: string,
): number {
  const trimmed = raw.trim();
  const value = Number(trimmed);
  if (trimmed === '' || !Number.isFinite(value)) {
    throw new StorylineOptionsEncodingError(
      `Invalid storyline options encoding "${encoding}": ${message}.`,
      reason,
      attribute,
    );
  }
  return value;
}

/** Parses a `key:value,key:value` resource delta (cost or extra effect). */
function parseResourceDelta(
  raw: string,
  encoding: string,
  attribute: 'cost' | 'extra',
): Record<string, number> {
  const reason =
    attribute === 'cost' ? 'malformed-cost-pair' : 'malformed-extra-pair';
  const delta: Record<string, number> = {};
  for (const rawPair of raw.split(',')) {
    const pair = rawPair.trim();
    if (pair === '') continue;
    const colon = pair.indexOf(':');
    if (colon < 0) {
      throw new StorylineOptionsEncodingError(
        `Invalid storyline options encoding "${encoding}": #${attribute} pair "${pair}" must be written key:value.`,
        reason,
        attribute,
      );
    }
    const key = pair.slice(0, colon).trim();
    const valueText = pair.slice(colon + 1).trim();
    if (key === '') {
      throw new StorylineOptionsEncodingError(
        `Invalid storyline options encoding "${encoding}": #${attribute} pair "${pair}" has an empty resource key.`,
        reason,
        attribute,
      );
    }
    delta[key] = parseAttributeNumber(
      valueText,
      encoding,
      `#${attribute} value for "${key}" must be a finite number`,
      reason,
      attribute,
    );
  }
  return delta;
}

/** The condition grammar's operator alternatives, longest first. */
const CONDITION_OPERATOR_PATTERN = '(>=|<=|==|>|<)';

/** Parses one `field<op><value>><successor>` conditional-successor rule. */
function parseConditionalSuccessor(
  raw: string,
  encoding: string,
): ConditionalSuccessorRule {
  const match = new RegExp(
    `^(.+?)\\s*${CONDITION_OPERATOR_PATTERN}\\s*([+-]?\\d+(?:\\.\\d+)?)\\s*>(.*)$`,
  ).exec(raw.trim());
  if (!match) {
    throw new StorylineOptionsEncodingError(
      `Invalid storyline options encoding "${encoding}": #when value "${raw.trim()}" must be written field<op>number>successor (op is one of >=, <=, >, <, ==).`,
      'unparseable-condition',
      'when',
    );
  }
  const field = (match[1] ?? '').trim();
  const op = (match[2] ?? '') as Condition['op'];
  const value = Number(match[3]);
  const successorText = (match[4] ?? '').trim();
  if (field === '' || !Number.isFinite(value)) {
    throw new StorylineOptionsEncodingError(
      `Invalid storyline options encoding "${encoding}": #when value "${raw.trim()}" must name a resource, an operator and a finite threshold.`,
      'unparseable-condition',
      'when',
    );
  }
  return {
    when: { field, op, value },
    successorId: successorText === '' ? null : successorText,
  };
}

/**
 * Parses a CSV `options` encoding into the generalised option model.
 *
 * ## Encoding
 *
 * ```text
 * encoding  := option (";" option)*
 * option    := label "|" candidates attribute*
 * attribute := "#" (cost | extra | when) "=" value
 * candidates:= candidate ("," candidate)*          // empty = terminal
 * cost      := key ":" number ("," key ":" number)*
 * extra     := key ":" number ("," key ":" number)*
 * when      := field op number ">" successor      // empty successor = chain end
 * op        := ">=" | "<=" | "==" | ">" | "<"
 * ```
 *
 * The **shorthand** `label|cardA,cardB;label2|cardC` is unchanged: every
 * attribute is optional and additive, and a shorthand-only cell compiles to
 * exactly the same `{ label, successorIds, effectPolicy: 'apply' }` object it
 * always did.
 *
 * Extended per-option attributes, in authored order:
 *
 * - `#cost=coins:5,goodwill:1` — a declarative affordability cost
 *   ({@link StorylineOption.cost}).
 * - `#extra=morale:+2` — a declarative resource delta applied on resolution
 *   ({@link StorylineOption.extraEffect}).
 * - `#when=hull>=3>cardX` — a conditional successor rule. Repeat it to declare
 *   an ordered rule list; rules are evaluated first-match-wins at resolution
 *   time ({@link StorylineOption.conditionalSuccessors}). An empty successor
 *   (`#when=coins>0>`) ends the chain.
 *
 * `;`, `|` and `#` are reserved delimiters and may not appear in a label or a
 * candidate card id. Whitespace around every component is trimmed.
 *
 * ## Failure behaviour
 *
 * Parsing is deterministic. A non-empty encoding that does not decode to at
 * least one valid option, or that carries a malformed segment/attribute, is
 * rejected with a {@link StorylineOptionsEncodingError} carrying a stable
 * reason (`unknown-attribute`, `malformed-cost-pair`, `unparseable-condition`,
 * …) rather than silently ignored. Semantic checks — whether a cost/condition
 * names a declared resource, whether a cost is positive, whether a
 * conditional successor exists — are the validator's job
 * ({@link validateStorylineOptions} over the card's declared resource set).
 *
 * @param encoding Raw `options` cell.
 * @returns Ordered option list (empty for a blank encoding).
 * @throws StorylineOptionsEncodingError when the encoding is non-empty but
 *         malformed / yields no option.
 */
export function parseStorylineOptionsEncoding<TState>(
  encoding: string,
): StorylineOption<TState>[] {
  const trimmed = encoding.trim();
  if (trimmed === '') return [];

  const options: StorylineOption<TState>[] = [];
  for (const rawSegment of trimmed.split(';')) {
    const segment = rawSegment.trim();
    if (segment === '') continue;

    const { head, attributes } = splitOptionSegment(segment);
    const separator = head.indexOf('|');
    if (separator < 0) {
      throw new StorylineOptionsEncodingError(
        `Invalid storyline options encoding "${encoding}": option "${head}" is missing the "|" separator.`,
        'missing-separator',
      );
    }

    const label = head.slice(0, separator).trim();
    if (label === '') {
      throw new StorylineOptionsEncodingError(
        `Invalid storyline options encoding "${encoding}": option "${head}" has an empty label.`,
        'empty-label',
      );
    }

    const successorIds = head
      .slice(separator + 1)
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id !== '');

    const extra: {
      cost?: OptionCost;
      extraEffect?: OptionExtraEffect;
      conditionalSuccessors?: ConditionalSuccessorRule[];
    } = {};
    const rules: ConditionalSuccessorRule[] = [];

    for (const rawAttribute of attributes) {
      const attribute = rawAttribute.trim();
      if (attribute === '') {
        throw new StorylineOptionsEncodingError(
          `Invalid storyline options encoding "${encoding}": option "${label}" has an empty attribute after "#".`,
          'malformed-attribute',
        );
      }
      const equals = attribute.indexOf('=');
      if (equals < 0) {
        throw new StorylineOptionsEncodingError(
          `Invalid storyline options encoding "${encoding}": attribute "#${attribute}" must be written name=value.`,
          'malformed-attribute',
        );
      }
      const name = attribute.slice(0, equals).trim();
      const value = attribute.slice(equals + 1).trim();
      switch (name) {
        case 'cost':
          extra.cost = parseResourceDelta(value, encoding, 'cost');
          break;
        case 'extra':
          extra.extraEffect = parseResourceDelta(value, encoding, 'extra');
          break;
        case 'when':
          rules.push(parseConditionalSuccessor(value, encoding));
          break;
        default:
          throw new StorylineOptionsEncodingError(
            `Invalid storyline options encoding "${encoding}": unknown option attribute "${name}" (expected cost, extra or when).`,
            'unknown-attribute',
            name,
          );
      }
    }

    if (rules.length > 0) extra.conditionalSuccessors = rules;

    options.push({ label, successorIds, effectPolicy: 'apply', ...extra });
  }

  if (options.length === 0) {
    throw new StorylineOptionsEncodingError(
      `Invalid storyline options encoding "${encoding}": no valid option decoded.`,
      'no-valid-option',
    );
  }
  return options;
}

/**
 * True when the player's current resources cover the option's declarative
 * `cost`.
 *
 * An option with no `cost` is always affordable. Every specified cost key is
 * a required gate: the option is affordable only when the player has at least
 * that much of *each* named resource. An unspecified key is unconstrained
 * (never defaulted to zero). A cost exactly equal to the current balance is
 * affordable.
 *
 * A cost key outside the declared set reads as `0` (an absent key reads as
 * zero), so a resource the game never declared can never be paid — the option
 * is then unaffordable whenever that cost is positive. Declaring the key (or
 * fixing the typo) is the authoring-time remedy reported by
 * `validateStorylineOptions`.
 *
 * @param option           The option to check (its `cost` may be absent).
 * @param resources        Current resource values, keyed by resource key.
 * @param declaredResources Declared resource keys (defaults to `coins` /
 *                          `reputation`).
 */
export function isOptionAffordable(
  option: { cost?: OptionCost },
  resources: StorylineResources,
  declaredResources: readonly StorylineResourceKey[] = DEFAULT_RESOURCE_KEYS,
): boolean {
  if (!option.cost) return true;
  const declared = new Set(resolveResourceKeys(declaredResources));
  for (const [key, required] of Object.entries(option.cost)) {
    if (required === undefined) continue; // unconstrained
    const available = declared.has(key) ? readResource(resources, key) : 0;
    if (available < required) return false;
  }
  return true;
}

/**
 * Compiles a card's story-line into the generalised option model.
 *
 * Precedence: explicit registry options > CSV `options` encoding.
 *
 * - A card with a non-empty `options` encoding compiles to the ordered option
 *   list it declares (candidate successor sets, always `effectPolicy: 'apply'`).
 * - Registered options take precedence over CSV compilation.
 * - Non-choice cards (no `options`, no registered list) → empty option list.
 *
 * When `state` **and** a resources oracle are provided, registry options are
 * filtered at draw time: an option is omitted when its `condition` callback
 * returns `false` **or** its declarative `cost` exceeds the current
 * resources ({@link isOptionAffordable}). Without a resources oracle (or
 * without state) no cost filtering happens.
 *
 * @param event             The story-line card.
 * @param registry          The option registry to consult (base-type-id keyed).
 * @param state             Optional game state for draw-time condition
 *                          filtering.
 * @param getResources      Optional resources oracle for draw-time cost
 *                          affordability filtering. Reads the current
 *                          resources from `state`; when absent, cost-gated
 *                          options are never filtered.
 * @param declaredResources Declared resource keys the affordability gate
 *                          operates over (defaults to `coins` /
 *                          `reputation`).
 */
export function compileStorylineFromEvent<TState, TCard extends StorylineCard>(
  event: TCard,
  registry: StorylineOptionRegistry<TState>,
  state?: TState,
  getResources?: (state: TState) => StorylineResources,
  declaredResources: readonly StorylineResourceKey[] = DEFAULT_RESOURCE_KEYS,
): CompiledStoryline<TState> {
  const storylineId = event.storylineId ?? null;
  const registered = registry.get(event.id);
  if (registered) {
    const options = registered.map((o) => ({ ...o }));
    if (state) {
      // Filter at draw time: omit options whose condition callback returns
      // false or whose declarative cost exceeds the current resources.
      // Options without a condition (or whose condition returns true) and
      // without an unaffordable cost are included unchanged.
      const resources = getResources ? getResources(state) : null;
      return {
        storylineId,
        compiledOptions: options.filter(
          (o) =>
            (o.condition == null || o.condition(state)) &&
            (resources == null ||
              isOptionAffordable(o, resources, declaredResources)),
        ),
      };
    }
    return { storylineId, compiledOptions: options };
  }

  if (event.options) {
    // CSV-authored arbitrary option list. A non-empty encoding is always a
    // choice node; malformed encodings throw here so a bad CSV value is
    // rejected rather than silently ignored.
    return {
      storylineId,
      compiledOptions: parseStorylineOptionsEncoding<TState>(event.options),
    };
  }

  return { storylineId, compiledOptions: [] };
}

/**
 * Returns true if the event presents a story-driven choice at resolution
 * time — i.e. it has a non-empty `options` encoding or an explicit registered
 * option list.
 *
 * NOTE: a bare `storylineId` is descriptive metadata (grouping cards into a
 * named arc) and does NOT by itself make a card a choice. Terminal escalation
 * cards carry a `storylineId` for grouping/journal purposes but must still
 * resolve as plain incidents. Only `options` / registered options intercept
 * resolution.
 */
export function eventHasStoryline<TState, TCard extends StorylineCard>(
  event: TCard,
  registry: StorylineOptionRegistry<TState>,
): boolean {
  return (
    Boolean(event.options && event.options.trim() !== '') ||
    registry.has(event.id)
  );
}
