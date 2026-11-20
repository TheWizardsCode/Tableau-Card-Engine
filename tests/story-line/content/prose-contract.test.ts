/**
 * Story-line prose contract — **red tests** for the narrative context,
 * option-outcome prose and ending-epilogue slice (`CG-0MWO7CRT9001BLNL`).
 *
 * These tests are the behavioural specification the eight sibling items turn
 * green; they are written **before** the implementation and encode the agreed
 * API shape:
 *
 * | Surface | Agreed shape |
 * |---|---|
 * | `ContentCard` | `context?: string \| null`, `epilogue?: string \| null` |
 * | `ContentFieldMapping` | `context?: string`, `epilogue?: string` |
 * | `StorylineOption` | `says?: string` |
 * | Serialiser | `serialiseStorylineOptionsEncoding(options)` (`src/story-line/compile.ts`) |
 * | Diagnostics | `reason: 'unescaped-says-delimiter'` / `'says-segment-count'`, `path: 'options[N].says'` |
 * | `StorylineResolution` | `outcomeProse?: string \| null` |
 * | UI adapter | `defaultStoryUpdateLine(card, label, coin, rep, outcomeProse?)` |
 * | Journal | `truncateOutcome(text, maxLength?)` (`src/story-line/journal.ts`) |
 *
 * ## How a red test is encoded
 *
 * `finish`'s changed-scope gate requires a **green** suite, so a red test is
 * authored with Vitest's `it.fails(...)` marker: the body runs, its assertion
 * genuinely fails today (that is the "red"), and Vitest records the case as
 * expected-to-fail. When the owning sibling lands, the case starts *passing*
 * and the marker itself turns the suite red — so the sibling must flip
 * `it.fails` to `it` as its definition of done. A marker can therefore never
 * be silently forgotten.
 *
 * Missing exports are reached through a **variable** specifier with
 * `/* @vite-ignore *\/` (the pattern used by `tests/scripts/repo-publication.test.ts`),
 * so neither `tsc` nor Vite tries to resolve a symbol that does not exist yet
 * and the suite still collects cleanly.
 *
 * ## Escape policy under test
 *
 * Escapes are recognised **only inside a `#says=` attribute value**:
 * `\;` → `;`, `\#` → `#`, `\\` → `\`. A backslash anywhere else (label,
 * candidate id, `#cost` value) stays a literal character.
 *
 * `;` and `#` are the reserved characters inside a says value. `|`, `,`, `=`,
 * `:`, quotes and apostrophes are **not** reserved and must survive
 * unescaped. A prose segment is delimited by `;`, so a decoded says value must
 * be exactly **one** segment — an author-written parallel list
 * (`#says=One\; two`) round-trips byte-stably but is rejected by validation.
 *
 * @module tests/story-line/content/prose-contract
 */
import { describe, expect, it } from 'vitest';

import { GYM_CONTENT_ADAPTER } from '../../../src/story-line/content/adapters';
import {
  cardsFromCsv,
  compileContentOptions,
  parseCsv,
  serialiseCsv,
} from '../../../src/story-line/content/csv';
import type { ContentCard } from '../../../src/story-line/content/types';
import {
  StorylineOptionsEncodingError,
  parseStorylineOptionsEncoding,
} from '../../../src/story-line/compile';
import type { StorylineOptionsEncodingErrorReason } from '../../../src/story-line/compile';
import { defaultStoryUpdateLine } from '../../../src/story-line/ui-adapter';
import { parseStoryUpdate } from '../../../src/story-line/journal';
import { resolveStorylineOption } from '../../../src/story-line/resolve';
import type {
  StorylineCard,
  StorylineOption,
  StorylineResolution,
} from '../../../src/story-line/types';
import { runValidateStorylinesCli } from '../../../scripts/validate-storylines';
import { addTemplate, makeAdapter, makeCard, makeState } from '../helpers';
import { PROSE_CONTENT_ADAPTER } from './fixture-adapter';
import {
  captureOutput,
  proseFixturePath,
  readProseFixture,
} from './test-support';

// ── Agreed shapes (local, so `tsc` stays green before they exist) ────

/** A content card with the prose fields the contract adds. */
interface ProseCard extends ContentCard {
  readonly context?: string | null;
  readonly epilogue?: string | null;
}

/** A compiled option with the authored outcome prose the grammar adds. */
type ProseOption<TState = unknown> = StorylineOption<TState>;

/** A resolution result carrying the chosen option's authored prose. */
interface ProseResolution extends StorylineResolution {
  readonly outcomeProse?: string | null;
}

/** `defaultStoryUpdateLine` with the additive outcome-prose argument. */
type StoryUpdateLine = (
  card: StorylineCard,
  option: string,
  coinChange: number,
  repChange: number,
  outcomeProse?: string | null,
) => string | null;

/** Re-encodes a compiled option list back to the `label|a,b#attr=value` cell. */
type SerialiseOptions = (
  options: readonly StorylineOption<unknown>[],
) => string;

/** One-line journal truncation helper (sibling item `CG-0MWO7CTVP004DQC6`). */
type TruncateOutcome = (text: string, maxLength?: number) => string;

// ── Lazy access to the not-yet-existing exports ─────────────────────

const COMPILE_SPECIFIER = '../../../src/story-line/compile';
const JOURNAL_SPECIFIER = '../../../src/story-line/journal';

/** Loads the compile module lazily (the specifier is a variable). */
async function loadCompile(): Promise<Record<string, unknown>> {
  return (await import(/* @vite-ignore */ COMPILE_SPECIFIER)) as Record<
    string,
    unknown
  >;
}

/** Loads the journal module lazily (the specifier is a variable). */
async function loadJournal(): Promise<Record<string, unknown>> {
  return (await import(/* @vite-ignore */ JOURNAL_SPECIFIER)) as Record<
    string,
    unknown
  >;
}

/** Narrows a content card to the agreed prose shape. */
function asProse(card: ContentCard): ProseCard {
  return card as ProseCard;
}

/** Narrows a compiled option list to the agreed prose shape. */
function asProseOptions(
  options: readonly StorylineOption<unknown>[],
): readonly ProseOption<unknown>[] {
  return options as readonly ProseOption<unknown>[];
}

/** The coherent one-segment says prose authored on `prose-option-attributes.csv`. */
const SAYS_DOOR =
  'The door opens on a room you remember. A note reads "1 # 2" and the ink is still wet.';
const SAYS_PAGE =
  'You read a page you have not written yet, and your own handwriting says: "stop". You don\'t remember buying the ink.';
const SAYS_WAIT =
  'You wait. The lamps burn down to stubs, and nothing comes.';
const SAYS_BOOK =
  'You close the book. The log reads C:\\ledger, and the room behind you is empty when you turn around.';

/** Every `options` cell in a fixture, with its 1-based CSV record row. */
function optionCells(csvText: string, column = 'options'): { row: number; cell: string }[] {
  const parsed = parseCsv(csvText);
  const index = parsed.header.indexOf(column);
  expect(index).toBeGreaterThanOrEqual(0);
  return parsed.rows.map((row, i) => ({ row: i + 2, cell: row[index] ?? '' }));
}

/** Runs a parser call and returns its structured reason, or `null`. */
function reasonOf(fn: () => unknown): StorylineOptionsEncodingErrorReason | null {
  try {
    fn();
    return null;
  } catch (error) {
    return error instanceof StorylineOptionsEncodingError ? error.reason : null;
  }
}

/** Reads the JSON report `storylines:validate` printed, failing loudly. */
function validateFixture(name: string): {
  code: number;
  valid: boolean;
  issues: {
    row?: number;
    column?: string;
    reason?: string;
    path?: string;
    message: string;
  }[];
} {
  const { code, stdout } = captureOutput(() =>
    runValidateStorylinesCli([
      '--csv',
      proseFixturePath(name),
      '--game',
      'gym',
      '--json',
    ]),
  );
  return { code, ...(JSON.parse(stdout) as { valid: boolean; issues: never[] }) };
}

// ── Content columns: context and epilogue ───────────────────────────

describe('prose columns — context and epilogue (CG-0MWO7CSH9000JYWH)', () => {
  const text = readProseFixture('prose-basic.csv');
  const cards = cardsFromCsv(parseCsv(text), PROSE_CONTENT_ADAPTER);

  it('[green] maps the context column onto the content card', () => {
    expect(asProse(cards[0]!).context).toBe(
      'You step off the last coach of the evening. The harbour is quiet, but the lamps are lit, and someone has left a note under your door: "Do not take the morning boat."',
    );
  });

  it('[green] keeps multi-sentence context verbatim (commas, quotes, `;`, `|`, `#`)', () => {
    expect(asProse(cards[1]!).context).toBe(
      "The ferryman does not look up. 'I have been expecting you,' he says; his oar rests, dripping, on the stones, and the word | on the sign above him has been freshly repainted. A hand has added # 4 in chalk.",
    );
  });

  it('[green] maps the epilogue column onto a terminal card', () => {
    expect(asProse(cards[3]!).epilogue).toBe(
      'The boat slips its mooring before you have found a seat. Behind you the lamps go out one by one; by the time you look again, the town is not there.',
    );
  });

  it('[green] reads an empty prose cell as null (absent), never as ""', () => {
    // `prose-pier` has neither prose; `prose-open` has no epilogue.
    expect(asProse(cards[2]!).context).toBeNull();
    expect(asProse(cards[2]!).epilogue).toBeNull();
    expect(asProse(cards[0]!).epilogue).toBeNull();
  });

  it('[green] never also duplicates mapped prose into the game-specific `fields` bag', () => {
    // The adapter's mapping table already drives which columns land in
    // `fields`; a mapped prose column is lifted out from day one.
    expect(asProse(cards[0]!).fields.context).toBeUndefined();
    expect(asProse(cards[3]!).fields.epilogue).toBeUndefined();
  });

  it('[green] needs no adapter key for a file without prose columns (opt-in)', () => {
    // The Gym adapter maps no prose column; the Gym demo content must parse
    // exactly as it does today, reporting no prose at all.
    const gymCards = cardsFromCsv(
      parseCsv(readProseFixture('parity-gym-baseline.csv')),
      GYM_CONTENT_ADAPTER,
    );
    expect(asProse(gymCards[0]!).context ?? null).toBeNull();
    expect(asProse(gymCards[0]!).epilogue ?? null).toBeNull();
  });

  it('[green] round-trips every prose fixture through CSV byte-identically', () => {
    for (const name of [
      'prose-basic.csv',
      'prose-option-attributes.csv',
      'prose-says-unescaped.csv',
      'prose-says-parallel.csv',
    ]) {
      const original = readProseFixture(name);
      expect(serialiseCsv(parseCsv(original)), name).toBe(original);
    }
  });
});

// ── `#says=` grammar: decode, re-encode, literal backslashes ────────

describe('#says= option prose (red: CG-0MWO7CT6X004J2EU)', () => {
  const text = readProseFixture('prose-option-attributes.csv');

  /**
   * The entry card's compiled options.
   *
   * Compiled lazily **inside** each case: today the grammar rejects `#says=`,
   * and a module-scope call would fail the file at collection time — which
   * AC8 of `CG-0MWO7CRT9001BLNL` explicitly forbids.
   */
  function entryOptions(): readonly ProseOption<unknown>[] {
    const entry = cardsFromCsv(parseCsv(text), PROSE_CONTENT_ADAPTER)[0]!;
    return asProseOptions(compileContentOptions(entry));
  }

  it('[green] parses `#says=` in any attribute position', () => {
    const options = entryOptions();
    expect(options.map((option) => option.label)).toEqual([
      'Open it',
      'Read it',
      'Wait',
      'Close the book',
    ]);
    expect(options[0]!.says).toBe(SAYS_DOOR);
    expect(options[1]!.says).toBe(SAYS_PAGE);
    expect(options[2]!.says).toBe(SAYS_WAIT);
    expect(options[3]!.says).toBe(SAYS_BOOK);
  });

  it('[green] decodes `\\#` and `\\\\` but leaves `: `, commas, quotes and apostrophes alone', () => {
    const options = entryOptions();
    expect(options[0]!.says).toContain('"1 # 2"');
    expect(options[1]!.says).toContain('says: "stop"');
    expect(options[1]!.says).toContain("don't");
    expect(options[3]!.says).toContain('C:\\ledger');
    expect(options[3]!.says).not.toContain('\\\\');
  });

  it('[green] keeps the mechanical attributes parsed alongside `#says=`', () => {
    const options = entryOptions();
    expect(options[0]!.cost).toEqual({ coins: 5 });
    expect(options[0]!.conditionalSuccessors?.[0]?.successorId).toBe('p-c');
    expect(options[1]!.cost).toEqual({ coins: 2 });
    expect(options[3]!.extraEffect).toEqual({ reputation: 1 });
  });

  it('[green] re-encodes the escaped cell byte-identically (parse → serialise identity)', async () => {
    const serialise = (await loadCompile())
      .serialiseStorylineOptionsEncoding as SerialiseOptions | undefined;
    expect(typeof serialise).toBe('function');

    const cell = 'Recall|q-end#says=One thing happened\\; then another was forgotten';
    const parsed = parseStorylineOptionsEncoding(cell);
    expect(serialise!(parsed)).toBe(cell);
  });

  it('[green] re-encodes every authored option cell to a stable, re-parseable model', async () => {
    const serialise = (await loadCompile())
      .serialiseStorylineOptionsEncoding as SerialiseOptions | undefined;
    expect(typeof serialise).toBe('function');

    for (const { cell, row } of optionCells(text)) {
      const parsed = parseStorylineOptionsEncoding(cell);
      const reencoded = serialise!(parsed);
      expect(
        serialise!(parseStorylineOptionsEncoding(reencoded)),
        `row ${row} re-encodes stably`,
      ).toBe(reencoded);
      expect(
        parseStorylineOptionsEncoding(reencoded),
        `row ${row} re-parses to the same model`,
      ).toEqual(parsed);
    }
  });

  it('[green] a backslash in a label stays a literal character', () => {
    const parsed = parseStorylineOptionsEncoding('C:\\ledger|t-a') as readonly ProseOption[];
    expect(parsed[0]!.label).toBe('C:\\ledger');
    expect(parsed[0]!.label).not.toBe('C:;ledger');
  });

  it('[green] a backslash in a candidate id stays a literal character', () => {
    const parsed = parseStorylineOptionsEncoding('Keep|t\\-a,t-b');
    expect(parsed[0]!.successorIds).toEqual(['t\\-a', 't-b']);
  });

  it('[green] a backslash in a `#cost` value is not an escape', () => {
    // `\5` must stay literal (hence unparseable), not decode to `5`.
    expect(reasonOf(() => parseStorylineOptionsEncoding('Pay|t-a#cost=coins:\\5'))).toBe(
      'malformed-cost-pair',
    );
  });

  it('[green] an unknown attribute is still rejected (no silent `says`-like alias)', () => {
    expect(reasonOf(() => parseStorylineOptionsEncoding('Pay|t-a#said=nope'))).toBe(
      'unknown-attribute',
    );
  });
});

// ── Validation diagnostics (row + column + reason) ──────────────────

describe('prose validation diagnostics (red: CG-0MWO7CT6X004J2EU)', () => {
  it('[green] reports an unescaped `;` or `#` inside a says value', () => {
    const report = validateFixture('prose-says-unescaped.csv');
    expect(report.code).toBe(1);
    expect(report.valid).toBe(false);

    const flagged = report.issues.filter(
      (issue) => issue.reason === 'unescaped-says-delimiter',
    );
    expect(flagged.map((issue) => issue.row)).toEqual([3, 4]);
    for (const issue of flagged) {
      expect(issue.column).toBe('options');
      expect(issue.path).toBe('options[0].says');
    }
  });

  it('[green] reports a says value that decodes to more than one prose segment', () => {
    const report = validateFixture('prose-says-parallel.csv');
    expect(report.code).toBe(1);

    const issue = report.issues.find(
      (candidate) => candidate.reason === 'says-segment-count',
    );
    expect(issue).toBeDefined();
    expect(issue).toMatchObject({
      row: 3,
      column: 'options',
      path: 'options[0].says',
    });
    expect(issue!.message).toContain('expected 1');
    expect(issue!.message).toContain('actual 2');
  });

  it('[green] still reports an ordinary malformed options cell unchanged', () => {
    // Negative control: the new diagnostics must not swallow the existing
    // `missing-separator` class for a cell that declares no says at all.
    expect(reasonOf(() => parseStorylineOptionsEncoding('One thing happened;Another'))).toBe(
      'missing-separator',
    );
  });
});

// ── Outcome prose through resolve, the log line and the journal ─────

describe('authored outcome prose (red: CG-0MWO7CTVP004DQC6)', () => {
  /** Builds a resolving state + adapter with one template (no prose compiled). */
  function engine(): {
    state: ReturnType<typeof makeState>;
    adapter: ReturnType<typeof makeAdapter>;
    card: StorylineCard;
  } {
    const templates = new Map<string, ReturnType<typeof makeCard>>();
    addTemplate(templates, makeCard({ id: 'prose-end', name: 'Morning Boat' }));
    const card: StorylineCard = {
      id: 'prose-open',
      name: 'The Lamplit Quay',
      effect: 'The tide has turned.',
      storylineId: 'prose-quay',
      storylineTitle: 'The Lamplit Quay',
    };
    return { state: makeState(), adapter: makeAdapter(templates), card };
  }

  /** The authored-prose option (parsed lazily: the grammar rejects it today). */
  function proseOption(): StorylineOption<unknown> {
    return parseStorylineOptionsEncoding(
      'Speak to the ferryman|prose-end#says=He does not look up, and the oar drips on the stones.',
    )[0]!;
  }

  it('[green] carries the chosen option\'s prose on the resolution', () => {
    const { state, adapter, card } = engine();
    const result = resolveStorylineOption(
      state,
      adapter,
      card,
      proseOption(),
    ) as ProseResolution;
    expect(result.outcomeProse).toBe(
      'He does not look up, and the oar drips on the stones.',
    );
  });

  it('[green] uses the authored prose as the story-update outcome', () => {
    const { card } = engine();
    const storyUpdateLine = defaultStoryUpdateLine as unknown as StoryUpdateLine;
    expect(
      storyUpdateLine(
        card,
        'Speak to the ferryman',
        0,
        0,
        'He does not look up, and the oar drips on the stones.',
      ),
    ).toBe(
      'Story update — The Lamplit Quay: He does not look up, and the oar drips on the stones.',
    );
  });

  it('[green] keeps today\'s paraphrase when no prose is authored (parity)', () => {
    const { card } = engine();
    expect(defaultStoryUpdateLine(card, 'Speak to the ferryman', 0, 0)).toBe(
      'Story update — The Lamplit Quay: you chose "Speak to the ferryman".',
    );
  });

  it('[green] parseStoryUpdate splits on the first separator only', () => {
    // The authored prose may itself contain `: `, `;`, `#`, quotes and
    // apostrophes; only the first separator belongs to the envelope.
    expect(
      parseStoryUpdate(
        'Story update — The Lamplit Quay: He says: "no"; and the ink is # 2.',
      ),
    ).toEqual({
      storyline: 'The Lamplit Quay',
      outcome: 'He says: "no"; and the ink is # 2.',
    });
  });

  it('[green] truncates a journal outcome to one display-safe line', async () => {
    const truncateOutcome = (await loadJournal()).truncateOutcome as
      | TruncateOutcome
      | undefined;
    expect(typeof truncateOutcome).toBe('function');

    const short = 'He does not look up.';
    expect(truncateOutcome!(short)).toBe(short);

    const long =
      'He does not look up, and the oar drips on the stones, and the word on the sign above him has been freshly repainted in chalk.';
    const cut = truncateOutcome!(long, 40);
    expect(cut.length).toBeLessThan(long.length);
    expect(cut.endsWith('…')).toBe(true);
    expect(long.startsWith(cut.slice(0, -1))).toBe(true);
    expect(cut.slice(0, -1).endsWith(' ')).toBe(false);

    const unbroken = 'A'.repeat(80);
    expect(truncateOutcome!(unbroken, 20)).toBe(`${'A'.repeat(19)}…`);
  });
});
