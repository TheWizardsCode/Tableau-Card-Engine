/**
 * Story-line option compilation and the registered-option registry.
 *
 * Compilation turns a card's legacy `hasChoices` fields, its CSV `options`
 * encoding, or a programmatically registered option list into the
 * generalised {@link StorylineOption} model used by resolution.
 *
 * Precedence: registered options > CSV `options` encoding > legacy two-way
 * choice fields.
 *
 * @module
 */

import type {
  CompiledStoryline,
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
 * Parses a CSV `options` encoding into the generalised option model.
 *
 * Encoding: `label|cardA,cardB;label2|cardC`
 * - `;` separates options, `|` separates the label from its candidate card
 *   ids, and `,` separates candidate ids.
 * - A blank / whitespace-only encoding decodes to no options (non-choice).
 * - An empty candidate list (`label|`) is a terminal option — the chain ends.
 * - Every CSV-authored option carries `effectPolicy: 'apply'`; `skip` remains
 *   available only via the programmatic registry.
 *
 * Parsing is deterministic: labels and candidate ids are whitespace-trimmed
 * and empty segments/candidates are dropped. A non-empty encoding that does
 * not decode to at least one valid option (or contains a malformed segment)
 * is rejected with an error rather than silently ignored.
 *
 * @param encoding Raw `options` cell.
 * @returns Ordered option list (empty for a blank encoding).
 * @throws Error when the encoding is non-empty but malformed / yields no option.
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

    const separator = segment.indexOf('|');
    if (separator < 0) {
      throw new Error(
        `Invalid storyline options encoding "${encoding}": option "${segment}" is missing the "|" separator.`,
      );
    }

    const label = segment.slice(0, separator).trim();
    if (label === '') {
      throw new Error(
        `Invalid storyline options encoding "${encoding}": option "${segment}" has an empty label.`,
      );
    }

    const successorIds = segment
      .slice(separator + 1)
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id !== '');

    options.push({ label, successorIds, effectPolicy: 'apply' });
  }

  if (options.length === 0) {
    throw new Error(
      `Invalid storyline options encoding "${encoding}": no valid option decoded.`,
    );
  }
  return options;
}

/**
 * Compiles a card's story-line into the generalised option model.
 *
 * Precedence: explicit registry options > CSV `options` encoding > legacy
 * two-way choice fields.
 *
 * - A card with a non-empty `options` encoding compiles to the ordered option
 *   list it declares (candidate successor sets, always `effectPolicy: 'apply'`).
 * - Registered options take precedence over both CSV and legacy compilation.
 * - Non-choice cards (no `options`, no registered list, no `hasChoices`) →
 *   empty option list.
 * - Legacy choice cards → two options [Accept(apply), Reject(skip)].
 *
 * When `state` is provided, registry options whose `condition` callback
 * returns `false` are omitted from the result (draw-time filtering).
 *
 * @param event    The story-line card.
 * @param registry The option registry to consult (base-type-id keyed).
 * @param state    Optional game state for draw-time condition filtering.
 */
export function compileStorylineFromEvent<TState, TCard extends StorylineCard>(
  event: TCard,
  registry: StorylineOptionRegistry<TState>,
  state?: TState,
): CompiledStoryline<TState> {
  const storylineId = event.storylineId ?? null;
  const registered = registry.get(event.id);
  if (registered) {
    const options = registered.map((o) => ({ ...o }));
    if (state) {
      // Filter by condition at draw time: omit options whose condition
      // callback returns false. Options without a condition (or whose
      // condition returns true) are included unchanged.
      return {
        storylineId,
        compiledOptions: options.filter(
          (o) => o.condition == null || o.condition(state),
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

  if (!event.hasChoices) {
    return { storylineId, compiledOptions: [] };
  }

  return {
    storylineId,
    compiledOptions: [
      {
        label: 'Accept',
        successorId: event.acceptNextCardId ?? undefined,
        effectPolicy: 'apply',
      },
      {
        label: 'Reject',
        successorId: event.rejectNextCardId ?? undefined,
        effectPolicy: 'skip',
      },
    ] as StorylineOption<TState>[],
  };
}

/**
 * Returns true if the event presents a story-driven choice at resolution
 * time — i.e. it has legacy `hasChoices`, or a non-empty `options` encoding,
 * or an explicit registered option list.
 *
 * NOTE: a bare `storylineId` is descriptive metadata (grouping cards into a
 * named arc) and does NOT by itself make a card a choice. Terminal escalation
 * cards carry a `storylineId` for grouping/journal purposes but must still
 * resolve as plain incidents. Only `hasChoices` / `options` / registered
 * options intercept resolution.
 */
export function eventHasStoryline<TState, TCard extends StorylineCard>(
  event: TCard,
  registry: StorylineOptionRegistry<TState>,
): boolean {
  return (
    Boolean(event.hasChoices) ||
    Boolean(event.options && event.options.trim() !== '') ||
    registry.has(event.id)
  );
}
