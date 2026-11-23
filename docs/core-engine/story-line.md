# Core: Generic Story-Line System

A game-agnostic branching narrative engine for tableau card games. A drawn
card presents an ordered set of options; the player's choice selects the next
card until the chain ends. The mechanic is used by Main Street and demonstrated
by the Gym `GymStorylineScene` (the base experience) and the Gym *Long Erasure*
spike scene (a three-act authored narrative with costed, effect-bearing and
state-gated branches).

Module root: [`src/story-line/`](../../src/story-line/) — import via the
`@story-line` alias. The module has **no game imports and no Phaser
dependency**; a game plugs its state and presentation in through two adapters.

Resources are **game-declared data**, not a fixed pair: a game advertises the
keys it threads through conditions, costs and extra effects (see
[Declared resources](#declared-resources)). `coins` / `reputation` remain the
**default projection**, so a game that declares nothing behaves exactly as it
did before.

## API

```ts
import { createStorylineSystem } from '@story-line';

const storyline = createStorylineSystem({ engine, ui });
```

`createStorylineSystem` composes the generic mechanics with a game's adapters
and returns a {@link StorylineSystem} with:

| Concern | Members |
|---|---|
| Compilation | `compileStorylineFromEvent`, `eventHasStoryline`, `getStorylineOptions`, `storylineOptionCount`, `parseStorylineOptionsEncoding` |
| Registry | `registerStorylineOptions`, `resetStorylineRegistry`, `hasRegisteredStorylineOptions` |
| Resolution | `resolveStorylineOption`, `pushChainCard` |
| Pending choice | `createPendingStorylineChoice`, `getPendingStorylineOptions`, `markChoiceResolved` |
| Journal | `parseStoryUpdate`, `buildJournal`, `journalIsEmpty`, `journalTitle` (`truncateOutcome` is exported for display truncation) |
| Validation | `validateStorylineOptions` (declarative metadata guard) |

### Story-line options

A `StorylineOption` is the unit a player chooses from. Options come from one of
two sources, and both produce the same model:

- **Content** — a card's CSV `options` cell authors the label/outcome shorthand
  *and* the extended declarative fields through `#`-prefixed attributes
  (`#cost`, `#extra`, `#when`, `#says`). See
  [Authoring options in CSV](#authoring-options-in-csv).
- **Programmatically** — `registerStorylineOptions` supplies the whole model,
  including the two callbacks (`condition`, `successorResolver`) that content
  cannot express. Registered options take precedence over the CSV cell.

> **Decision reversal — 2026-11-19.** An earlier revision of this document
> recorded **"producer decision: programmatic only"** for `cost`,
> `extraEffect` and `conditionalSuccessors`, i.e. *every costed or state-gated
> branch required an engineering ticket*. That decision is **reversed**, and
> this paragraph replaces it rather than sitting beside it: writers author
> costed, effect-bearing and state-gated branches entirely in content, with no
> TypeScript registration (CG-0MWNHZCWJ002XUQI, for the spike
> CG-0MWNFV6VU003O3PC).
>
> **Rationale.** The three fields are plain declarative data — a number map or
> an ordered condition list — so they serialise without loss; the guard rails
> that were missing now exist (byte-stable round-trip, row + column + reason
> diagnostics, an ordered repeatable `#when` rule list); and a ticket per
> branch was the main obstacle to iterating on a story. The two callbacks
> (`condition`, `successorResolver`) stay programmatic because a function is
> not serialisable.

| Field | Type | When it applies | Authored from CSV as |
|---|---|---|---|
| `label` | `string` | always | the `label` head of `label\|successors` |
| `effectPolicy` | `'apply' \| 'skip'` | always — controls the card's intrinsic effect | always `'apply'` for CSV options |
| `condition?` | `(state) => boolean` | draw time — omit the option when `false` | — (callback; programmatic) |
| `successorId?` | `string \| null` | resolution — the lowest-precedence single successor | — (registry seam) |
| `successorIds?` | `string[]` | resolution — one seeded random draw picks a candidate | the `cardA,cardB` candidate list |
| `successorResolver?` | `(state) => string \| null` | resolution — callback, highest precedence | — (callback; programmatic) |
| `conditionalSuccessors?` | `ConditionalSuccessorRule[]` | resolution — first matching rule wins | `#when=field<op>number>successor` (repeatable) |
| `cost?` | `Record<resourceKey, number>` | affordability gate + real payment at resolution | `#cost=key:number,…` |
| `extraEffect?` | `Record<resourceKey, number>` | resolution — additional resource gain | `#extra=key:number,…` |
| `says?` | `string` | presentation — the authored outcome prose for the option | `#says=<escaped prose>` |

```ts
import { createStorylineSystem, validateStorylineOptions } from '@story-line';

storyline.registerStorylineOptions('evt-mystery', [
  {
    label: 'Hire a detective',
    effectPolicy: 'apply',
    cost: { coins: 100, reputation: 5 },
    extraEffect: { coins: 10 },
    conditionalSuccessors: [
      { when: { field: 'coins', op: '>=', value: 500 }, successorId: 'evt-rich-outcome' },
      { when: { field: 'reputation', op: '<', value: 10 }, successorId: null },
    ],
    successorId: 'evt-default-outcome',
  },
  {
    label: 'Walk away',
    effectPolicy: 'skip',
  },
]);

const { valid, issues } = validateStorylineOptions(
  storyline.getStorylineOptions(eventCard, state),
);
```

Semantics:

- **`cost`** — an affordability *gate* at draw time (an option the player
  cannot afford is **omitted**, never disabled) and a *real payment* at
  resolution. An unspecified component is unconstrained. Costs are paid in
  addition to whatever `effectPolicy` does — `skip` still pays.
- **`extraEffect`** — a resource *gain* applied after the cost payment,
  independently of `effectPolicy`. Negative extras are rejected by
  `validateStorylineOptions`.
- **`conditionalSuccessors`** — ordered declarative rules. The first rule
  whose `when` condition matches the **post-resolution** resources determines
  the pushed card; `null` ends the chain. Rules are evaluated before any
  random draw and consume no RNG.

### Declared resources

The resource *name set* is supplied by the game, not baked into the engine. A
game declares its keys on the engine adapter — or, equivalently, builds the
resource half of that adapter from a declarative projection — and every
declared key is then usable in a `Condition.field`, a `cost` and an
`extraEffect`:

```ts
import { createResourceProjection, createStorylineSystem } from '@story-line';

const resources = createResourceProjection<VoyageState>({
  hull: { read: (s) => s.hull, apply: (s, d) => { s.hull += d; } },
  morale: { read: (s) => s.morale, apply: (s, d) => { s.morale += d; } },
  stores: { read: (s) => s.stores, apply: (s, d) => { s.stores += d; } },
  goodwill: { read: (s) => s.goodwill, apply: (s, d) => { s.goodwill += d; } },
});

const storyline = createStorylineSystem({
  engine: { ...resources, rng, applyEffect, appendLog, /* … */ },
});

storyline.registerStorylineOptions('evt-storm', [
  {
    label: 'Ride it out',
    effectPolicy: 'skip',
    cost: { stores: 4 },
    extraEffect: { morale: 1, goodwill: 2 },
    conditionalSuccessors: [
      { when: { field: 'hull', op: '>=', value: 4 }, successorId: 'evt-hold' },
      { when: { field: 'morale', op: '<', value: 1 }, successorId: null },
    ],
  },
]);
```

`createResourceProjection` makes the field map **the** declaration — the keys
and the accessors cannot drift apart — and it is spread straight into the
adapter (`resources`, `getResources`, `applyResourceDelta`).

The declared set is threaded through the whole lifecycle:

- `StorylineSystem.resources` reports the keys in force (the adapter's
  declaration, else `DEFAULT_RESOURCE_KEYS` — `['coins', 'reputation']`).
- **Draw-time affordability** gates option-by-option over the declared keys.
  `compileStorylineFromEvent` applies it to registered options; a presenting
  layer applies it to content-authored options (see
  [Authoring options in CSV](#authoring-options-in-csv)).
- **Cost payment** and **extra effects** are applied per declared key, and
  each activity-log line names the key (`Cost paid: -4 stores.`,
  `Extra effect: +1 morale, +2 goodwill.`).
- **`validateStorylineOptions(options, { resources, cardId })`** checks costs,
  extra effects and condition fields against the same set.

Three rules keep the set honest:

1. **An absent key reads as `0`** — a declared key the state does not
   currently carry is zero (never `undefined`/`NaN`), both in condition
   evaluation and in the reported deltas.
2. **An unspecified cost key is unconstrained** — only the keys a cost names
   are required; everything else is left alone.
3. **No resource is ever invented** — the engine only ever forwards declared
   keys to `applyResourceDelta`. An undeclared key in a cost or extra effect
   is not applied (it reads as `0`, so a positive cost on it is unaffordable)
   and resolution appends a warning line naming the ignored key(s).
   `validateStorylineOptions` reports the same fault ahead of time.

`coins` / `reputation` stay the **default projection**: omit `resources` (or
declare the pair) and the shipped behaviour is byte-identical. A game with a
non-monetary vocabulary can override the default UI adapter's
`storyUpdateLine` to describe its own currencies — the resolution result
reports the `coins` / `reputation` projections only.

### Authoring options in CSV

A writer authors the whole option model in the `options` cell. Each option is a
`label|successors` head followed by zero or more `#name=value` attributes:

```text
encoding   := option (";" option)*
option     := label "|" candidates attribute*
attribute  := "#" ("cost" | "extra" | "when" | "says") "=" value
candidates := candidate ("," candidate)*        // empty = terminal option
cost       := key ":" number ("," key ":" number)*
extra      := key ":" number ("," key ":" number)*
when       := field op number ">" successor     // empty successor = chain end
says       := prose                             // one segment; escapes below
op         := ">=" | "<=" | "==" | ">" | "<"
```

| Attribute | Authored example | Compiles to |
|---|---|---|
| head label | `Log the erasure\|le-i-log` | `label` |
| head candidates | `Transmit\|le-i-transmit,le-i-silent` | `successorIds` — one seeded draw picks a candidate |
| `#cost` | `#cost=stores:1,goodwill:1` | `cost` — a real payment at resolution |
| `#extra` | `#extra=morale:+2` | `extraEffect` — a resolution gain |
| `#when` | `#when=charge>=2>le-iii-ahead` | one `conditionalSuccessors` rule (repeat for an ordered list) |
| `#says` | `#says=You log it, and the charts go blank with it.` | `says` — the option's authored outcome prose |

Rules the parser and validator enforce:

- **The shorthand stays valid.** `label|cardA,cardB;label2|cardC` compiles to
  exactly the options it always did; attributes are additive and may appear in
  the same cell.
- **Reserved delimiters.** `;` separates options, `|` separates the label from
  its candidates, `,` separates candidates and `cost`/`extra` pairs, and `#`
  starts an attribute — none may appear inside a label or a candidate card id.
- **`#says` is escaped prose, and escapes are recognised only there.** Inside a
  `#says` value, `\;` → `;`, `\#` → `#` and `\\` → `\`. Every other backslash
  (in a label, a candidate id, or a `#cost` / `#extra` / `#when` value) stays a
  literal character, so no existing cell changes meaning. `|`, `,`, `=`, `:`,
  quotes and apostrophes are not reserved in prose and need no escaping.
  `parse → serialise` is byte-identical for a canonically ordered cell
  (`#cost`, `#extra`, `#when`*, `#says` last), via
  `serialiseStorylineOptionsEncoding`.
- **A `#says` value is exactly one prose segment.** `;` delimits options, so a
  value that decodes to more than one segment (an author-written parallel list,
  `#says=One\; two`) is rejected by validation as `says-segment-count`, and an
  unescaped `;` or `#` inside the value is rejected by the parser as
  `unescaped-says-delimiter`, both with row + column + `options[N].says`.
- **`#cost` / `#extra` pairs are `key:number`.** Each key is checked against the
  card's declared resources (the `resources` column, below); an undeclared key
  is an authoring error, never a silently invented resource.
- **`#cost` is a resolution payment, gated by the presenter.**
  `compileStorylineFromEvent` applies the draw-time affordability filter to
  *registered* options only, so a content-compiled list is returned as
  authored. A scene that presents CSV-authored options filters with
  `isOptionAffordable(option, resources, declared)` before offering them — the
  Long Erasure run's `availableOptions` is the reference implementation, so an
  unaffordable branch is never shown.
- **`#when` rules keep authored order, first match wins,** and an empty
  successor ends the chain (`#when=morale<1>`). A matching rule consumes no RNG
  draw.
- **Trimming and round-trip.** Whitespace around every component is trimmed and
  the cell round-trips byte-identically through `parseCsv` → `serialiseCsv`,
  including quoted and empty values.
- **Callbacks are not authorable.** `condition` and `successorResolver` are
  functions; use `registerStorylineOptions` for those (registered options also
  win over the cell).

**Declaring the resource keys.** The adapter's `resources` mapping
(`fields.resources`) points at a column carrying the card's declared keys —
`"hull,morale,stores,goodwill,charge"` in the Long Erasure content. That set is
the vocabulary for the card's `#cost` / `#extra` / `#when` keys and the set the
validator checks.

The key set can instead be declared **once for the whole file** with a leading
`#resources:` comment line before the header — the per-file declaration seam
(`CG-0MWQZJEXQ002G3KE`):

```csv
#resources: hull,morale,stores,goodwill,charge
id,name,effect,options,resources,storylineId
le-i-open,The First Unwriting,The charts forget the volume with it.,,long-erasure
```

(The fixture is
[`tests/fixtures/story-line/prose/per-file-resources.csv`](../../tests/fixtures/story-line/prose/per-file-resources.csv);
the `resources` cell is blank, so the row inherits the declaration.)

`parseCsv` lifts leading `#` comment lines out of the header/row matrix into
`ParsedCsv.declarations` (so the schema and rows are unchanged and a
round-trip is still byte-identical), and `parseResourceDeclaration` reads the
first `#resources:` line. The effective set per card resolves in this order:

1. **The row's `resources` cell**, when non-blank — it *overrides*, never
extends, the file declaration, so a mixed-resource minority stays expressible
   in one file.
2. **The file-level `#resources:` declaration**, when the cell is blank (the
   seam that removes the old per-row repetition).
3. **The engine's default `coins` / `reputation` projection**, when neither
   declares any (or the adapter has no `resources` mapping).

Validation always uses the **effective** set, so `unknown-resource-key` still
fires for a key outside a row's override or outside the file declaration.
Files that keep per-row `resources` cells validate exactly as before — the
declaration is opt-in and backward compatible.

Authoring follows the same rule: `add-card` / `add-linked-card` into a file
that declares `#resources:` leaves the new row's `resources` cell **blank**, so
the row inherits the declaration instead of re-introducing the per-row copy
(`CG-0MWRQVBGB003RB6X`). An explicit `--resources <keys>` fills the cell and
overrides the declaration, and an adapter's `newCardDefaults.resources` is
applied only when the file declares nothing.

**Worked example.** One row from
[`example-games/gym/content/long-erasure.csv`](../../example-games/gym/content/long-erasure.csv)
(record 2, quoted verbatim):

```csv
le-i-open,The First Unwriting,A volume of space stops having happened and the ship's charts forget it with it.,"Log the erasure|le-i-log#cost=stores:1#says=You spend a store of paper and power writing down a volume that no longer exists. The log is exact, and the charts stay blank where it used to be.;Rally the survey crew|le-i-rally#extra=morale:1#says=You call the crew to the observation deck and name what you all just saw. They go back to their stations steadier than they left them.",long-erasure,The Long Erasure,"hull,morale,stores,goodwill,charge",I,1,"The survey vessel Ashlight holds station at the edge of a volume that has stopped having happened, which the crew call the Unwriting. Your charts no longer agree with the stars ahead, and the mechanism behind it, the Revision Loom, is still turning past the last fix. Archivist Vane's voice arrives, polite and unhurried. Whatever is erased next, you must decide what the record is worth.",
```

Its `options` cell compiles to:

```json
[
  {
    "label": "Log the erasure",
    "successorIds": ["le-i-log"],
    "effectPolicy": "apply",
    "cost": { "stores": 1 },
    "says": "You spend a store of paper and power writing down a volume that no longer exists. The log is exact, and the charts stay blank where it used to be."
  },
  {
    "label": "Rally the survey crew",
    "successorIds": ["le-i-rally"],
    "effectPolicy": "apply",
    "extraEffect": { "morale": 1 },
    "says": "You call the crew to the observation deck and name what you all just saw. They go back to their stations steadier than they left them."
  }
]
```

A state-gated branch from the same file (the `options` cell of record 12),
where a random candidate list and a conditional gate share one option:

```csv
Break for the core|le-iii-approach,le-iii-ahead#when=charge>=2>le-iii-ahead#says=You drive straight for the Loom's core while the tear is still open. The Ashlight arrives close enough to touch it, and the clock starts again.;Follow the unravelling|le-iii-approach#extra=charge:1#says=You follow the unravelling instead of racing it and harvest its charge as it comes apart. The core will still be there, and you will arrive with more to spend.
```

`Break for the core` resolves to `le-iii-ahead` only while `charge >= 2`;
otherwise its candidate draw picks between `le-iii-approach` and
`le-iii-ahead` as usual.

**Diagnostics.** `npm run storylines:validate` names the record, the column and
a stable reason, so a writer fixes content without reading engine code:

```text
✗ [invalid-option] row 2, column "options" (unknown-attribute): Choice card "bad-a" has a malformed options column: Invalid storyline options encoding "Go|bad-b#bogus=1": unknown option attribute "bogus" (expected cost, extra or when).
✗ [unknown-resource-key] row 2, column "options" (unknown-resource-key): cost.gold is not a declared resource (declared: coins, hull).
```

Cell-level reason codes are `missing-separator`, `empty-label`,
`malformed-attribute`, `unknown-attribute`, `malformed-cost-pair`,
`malformed-extra-pair`, `unparseable-condition` and `no-valid-option`; the
semantic codes (`unknown-resource-key`, `non-positive-cost`,
`negative-extra-effect`, `unknown-condition-op`, `non-numeric-value`,
`dangling-conditional-successor`) come from
[`validateStorylineOptions`](#validation) and are reported on the same row and
column. The fixture tests live in
[`tests/story-line/content/extended-options.test.ts`](../../tests/story-line/content/extended-options.test.ts).

### Authored prose: `context`, `#says` and `epilogue`

Three prose surfaces let a writer tell the story in their own words. All three
are **optional and additive**: content that authors none behaves exactly as it
did before the prose slice, and a game opts in by mapping the columns in its
content adapter.

| Surface | Authored as | Scope | Budget | Presented as |
|---|---|---|---|---|
| `context` | the `context` CSV column | every beat | 400 characters | the narrative panel above the options, paged with `paginateProse()` |
| outcome prose | the `#says=<escaped prose>` option attribute | one option | — | `StorylineResolution.outcomeProse` → the story-update line, the journal row, the narration reveal |
| `epilogue` | the `epilogue` CSV column | a terminal card | 600 characters | the closing screen (`buildEpilogue().epilogueProse`) |

**The columns are opt-in per adapter.** `ContentFieldMapping` gains two
optional keys, `context` and `epilogue`, which point at the game's own column
names:

```ts
export const LONG_ERASURE_CONTENT_ADAPTER: ContentAdapter = {
  gameId: 'long-erasure',
  columns: [
    'id', 'name', 'effect', 'options', 'storylineId', 'storylineTitle',
    'resources', 'act', 'clockCost', 'context', 'epilogue',
  ],
  fields: {
    id: 'id',
    name: 'name',
    effect: 'effect',
    options: 'options',
    storylineId: 'storylineId',
    storylineTitle: 'storylineTitle',
    resources: 'resources',
    context: 'context',
    epilogue: 'epilogue',
  },
  // …
};
```

**An omitted mapping means "this file has no such column".** An adapter that
does not map `context` / `epilogue` is never an error, and its cards carry no
prose key at all (`ContentCard.context` / `ContentCard.epilogue` are absent,
not empty strings). When the columns **are** mapped, a blank cell reads as "no
prose authored" (`null`) and is always valid. An adapter that maps a prose
column the file's header does not contain is a hard `missing-column` error, so
a renamed column is caught rather than silently dropping the prose. The
no-prose parity promise is pinned by
[`tests/story-line/content/prose-parity.test.ts`](../../tests/story-line/content/prose-parity.test.ts).

**Shipped CSV examples.** Both Gym content files author these fields. The *Long
Erasure* header:

```csv
id,name,effect,options,storylineId,storylineTitle,resources,act,clockCost,context,epilogue
```

A beat with its `context` and both of its options' `#says` values (record 2 of
[`storylines.csv`](../../example-games/gym/content/storylines.csv)):

```csv
gym-story-start,Town Roads,Lose 50 coins in expenses for the meeting.,"Invest|gym-story-invest#cost=coins:5#extra=reputation:+2#when=coins>=100>gym-story-end#says=The vote passes, and the road crews are working before the week is out.;Ignore|gym-story-ignore#says=The question is set aside, and the ruts deepen with every cart that passes.",gym-story,Gym Storyline,"coins,reputation",Incident,0,-50,0,"The people of the town are warning that the roads are in disrepair and the winter is coming to make them worse. The town meets in the hall above the market, with the road budget on the table and rain coming in off the hills. Everyone is waiting to see who will pay for the roads this year."
```

A terminal card carrying its `epilogue` (record 17 of
[`long-erasure.csv`](../../example-games/gym/content/long-erasure.csv)):

```csv
le-end-abandon,The Voyage Abandoned,You turn for home and the erasure follows you there.,,long-erasure,The Long Erasure,"hull,morale,stores,goodwill,charge",Ending,0,"You give the order to turn for home and the Ashlight comes about slowly, as though the hull has an opinion. The Unwriting does not pursue, which is worse, because it does not need to. Behind you the volume is still going out, edge first, and ahead of you is every berth you promised to come back for.","The Ashlight reaches home berth with every certificate in order and no survey to show for it. The port authority thanks you for the quiet and asks you not to file the log until it has been reviewed. You wake some nights with the volume in your head exactly as it was, and then watch it go out edge first, taking the harbour with it. Home is still there in the morning. It is just not the home that was there when you left."
```

#### Escape policy (`#says` only)

`;` and `#` are reserved delimiters in a `#says` value; a literal one must be
escaped. Escapes are recognised **only inside a says value**, so no existing
cell can change meaning:

| Written inside `#says` | Decodes to | Shipped / fixture quote |
|---|---|---|
| `\;` | `;` | `#says=One thing happened\; then another was forgotten` ([`prose-says-parallel.csv`](../../tests/fixtures/story-line/prose/prose-says-parallel.csv)) |
| `\#` | `#` | `#says=… A note reads ""1 \# 2"" and the ink is still wet.` ([`prose-option-attributes.csv`](../../tests/fixtures/story-line/prose/prose-option-attributes.csv); `""` is the CSV-escaped double quote) |
| `\\` | `\` | `#says=… The log reads C:\\ledger, and the room behind you is empty when you turn around.` (same fixture) |
| any other `\` | `\` (literal) | A backslash in a label, a candidate id, or a `#cost` / `#extra` / `#when` value is an ordinary character |

**Not reserved in prose (no escaping needed):** `,`, `|`, `=`, `:`, double
quotes and apostrophes. The linked fixture's says values contain all of them
unescaped (in the `Read it` option) and parse verbatim.

**Reserved and rejected:** an unescaped `;` or `#` inside a says value is
rejected by the parser (`unescaped-says-delimiter`) instead of silently
splitting the cell, and a says value that **decodes** to more than one segment
(an author-written parallel list, `#says=One\; two`) is rejected by validation
as `says-segment-count`. A says value is exactly **one** prose segment.

**Round-trip.** `serialiseStorylineOptionsEncoding(options)` is the inverse of
the parser and re-escapes `;`, `#` and `\` in a says value (and touches nothing
else). Attributes are written in the canonical order `#cost`, `#extra`,
`#when`*, `#says` last, so a cell authored in that order round-trips
byte-identically; any other authored order round-trips stably to the same
model. The fixtures in
[`tests/fixtures/story-line/prose/prose-option-attributes.csv`](../../tests/fixtures/story-line/prose/prose-option-attributes.csv)
are pinned by [`prose-contract.test.ts`](../../tests/story-line/content/prose-contract.test.ts).

#### Prose budgets

Authored prose has an adopted length budget. Exceeding it is a **non-fatal
warning**, never a hard error — an author can deliberately exceed it.

| Field | Budget (characters) | Diagnostic |
|---|---|---|
| `context` | 400 | `prose-budget`, reason `prose-over-budget` — reported, never invalidating |
| `epilogue` | 600 | the same |

The table lives in `PROSE_FIELD_SPECS`
([`src/story-line/content/prose.ts`](../../src/story-line/content/prose.ts)) so
the validator, the editor's field hints and this document quote one source of
truth. `storylines:validate` prints the warning on the offending record and
column, e.g. `! [prose-budget] row 2, column "context" (prose-over-budget):
Card "p-a" context prose is 401 characters, over the 400-character budget.`
(the shape pinned by `tests/story-line/content/validate.test.ts`).

#### Journal and closing behaviour

- **Resolution** — `resolveStorylineOption()` returns the chosen option's
  `says` verbatim as `StorylineResolution.outcomeProse` (`null` when the option
  authors none). It never changes the resolved deltas or successor.
- **Story-update line** — `defaultStoryUpdateLine(card, label, coins, rep,
  outcomeProse?)` renders `Story update — <story-line name>: <prose>` when
  prose is present, byte-identically to the pre-prose wording when it is not.
- **Journal** — `buildJournal()` derives one row per resolved choice;
  `StorylineJournalEntry.outcome` is cut to a single display line by
  `truncateOutcome(text, 80)`, while `outcomeFull` keeps the full prose and
  `text` the original log line, so a transcript never loses what the journal
  ellipsised.
- **Closing** — a terminal card's `epilogue` is surfaced by
  `buildEpilogue()` as `epilogueProse` (or `null`); the scene falls back to its
  pre-prose framing line when none is authored, so an ending without an
  epilogue is unchanged. The epilogue is presentation only: the journey score
  still comes from the journal.

### Compilation

There is exactly **one** choice model: a card is a choice when it supplies
options, either through the CSV `options` encoding or through the programmatic
registry. No separate choice flag or second link-field pair exists.

Precedence: **registered options > CSV `options` encoding**.

- A card with no registered options and no `options` encoding is not a choice
  and compiles to an empty option list. A bare `storylineId` is descriptive
  metadata only — it never makes a card a choice.
- CSV `options` encoding: `label|cardA,cardB;label2|cardC` (`;` separates
  options, `|` separates the label from candidate ids, `,` separates
  candidates), optionally followed by `#cost` / `#extra` / `#when` attributes
  ([grammar](#authoring-options-in-csv)). An empty candidate list is a
  **terminal** option. Every CSV-authored option carries `effectPolicy:
  'apply'`.
- Draw-time filtering is **combined**: a registered option is omitted when its
  `condition(state)` callback returns `false` **or** its declarative `cost`
  exceeds the player's current value of a declared resource. Options without a
  cost are always included; a cost exactly equal to the balance is affordable.
  Filtering happens once, when the option list is compiled at draw time, and
  the result is frozen into `PendingStorylineChoice.options`, where consumers
  (including AI scoring) read the stable presented list.
- Cost filtering applies to **registered** options; a content-compiled list is
  returned as authored, and the presenting layer gates it with
  `isOptionAffordable` over the declared keys (see
  [Authoring options in CSV](#authoring-options-in-csv)).

### Resolution

`resolveStorylineOption(state, card, option)` runs the full lifecycle for a
selected option:

1. **`effectPolicy`** — `apply` runs the card effect, `skip` does not.
2. **Cost payment** — the option's `cost` is deducted through the engine
   adapter's resource-mutation seam, in addition to the effect.
3. **Extra effect** — the option's `extraEffect` gains are applied, also
   through the resource-mutation seam.
4. **Deltas** — `coinChange` / `repChange` are *projections*: the change in
   the `coins` / `reputation` keys across all three steps (`0` when the game
   does not declare that key), which keeps every existing consumer — scene,
   AI, tests — source-compatible. Each applied cost/extra effect appends an
   activity-log line naming the declared key (`Cost paid: -100 coins.`,
   `Extra effect: +10 coins.`, `Cost paid: -4 stores.`).
5. **Successor** — resolved with this precedence:

   1. `option.successorResolver(state)` — a callback; `null`/`undefined` ends
      the chain. Consumes no RNG.
   2. `option.conditionalSuccessors` — evaluated in declaration order against
      the post-resolution resources; the first matching rule's `successorId`
      is pushed (`null` ends the chain). A matching rule consumes no RNG.
   3. `option.successorIds` — exactly **one** seeded `rng()` draw selects a
      candidate. An empty list is terminal and consumes no draw.
   4. `option.successorId` — a single id, pushed directly (no draw). It is the
      lowest-precedence successor and the programmatic registry seam.

The pushed card uses deterministic serial naming: `${base}-${maxSerial+1}`,
scanning every card the engine adapter returns from `getChainScanCards`.

## Validation

`validateStorylineOptions(options, { knownTemplateIds? })` statically validates
the **declarative** parts of an option list — `cost`, `extraEffect` and
`conditionalSuccessors`. It never throws and never mutates the list, and it
works on any source: options registered with `registerStorylineOptions`,
options compiled from a CSV `options` encoding, or an option list assembled by
a game.

```ts
import { validateStorylineOptions } from '@story-line';

const { valid, issues } = validateStorylineOptions(
  storyline.getStorylineOptions(card, state),
  { knownTemplateIds: allCardTemplateIds },
);
if (!valid) {
  for (const issue of issues) {
    console.warn(`${issue.path}: ${issue.message}`);
  }
}
```

Rules:

| Code | Rejects |
|---|---|
| `non-positive-cost` | A declared `cost.<key>` equal to zero or negative. |
| `negative-extra-effect` | A declared `extraEffect.<key>` below zero (extra effects are gains). |
| `unknown-resource-key` | A `cost.<key>` / `extraEffect.<key>` outside the declared resource set. |
| `unknown-condition-field` | A condition field outside the declared resource set (the default projection is `coins` / `reputation`). |
| `unknown-condition-op` | An operator other than `>=`, `<=`, `>`, `<`, `==`. |
| `non-numeric-value` | A non-finite (or non-numeric) cost, extra-effect or condition value. |
| `dangling-conditional-successor` | A rule targeting an id outside `knownTemplateIds` (checked only when the catalogue is supplied). |
| `invalid-successor-id` | A rule `successorId` that is neither a string nor `null`. |
| `invalid-conditional-successors` | A `conditionalSuccessors` value that is not an array of rule objects. |
| `invalid-condition` | A rule without a `when` condition object. |

Every resource-scoped issue also carries the offending `resource` key, and
passing `cardId` stamps it onto every issue — so a content author sees the
**card id, field path, resource key and reason** at once:

```ts
const { valid, issues } = validateStorylineOptions(options, {
  resources: storyline.resources, // the same set the runtime uses
  cardId: card.id,
  knownTemplateIds: allCardTemplateIds,
});
// e.g. { path: 'options[0].cost.hull', code: 'unknown-resource-key',
//        cardId: 'evt-storm', resource: 'hull',
//        message: 'cost.hull is not a declared resource (declared: coins, reputation).' }
```

Validation is authoring-time only: runtime resolution remains permissive, so a
list that fails validation still resolves exactly as declared (an undeclared
key is not applied and is reported in the activity log).

Both shipped Gym content files author these fields from CSV:
[`storylines.csv`](../../example-games/gym/content/storylines.csv) (default
`coins` / `reputation` projection) and
[`long-erasure.csv`](../../example-games/gym/content/long-erasure.csv) (the
five-key declared set), and both validate cleanly. `storylines:validate`
passes each card's own declared resource keys to this helper, so the vocabulary
the runtime uses is the one the author is checked against.

## Authoring seams (content, manifest, validator, author)

The runtime system above resolves a story-line; the **content toolkit** in
[`src/story-line/content/`](../../src/story-line/content/) authors one. It is
game-agnostic: a game supplies a **content adapter** (plain data) that maps its
CSV columns onto the generic story-line fields, and core provides parsing, a
manifest/graph generator, a validator and a single transactional write path.

The toolkit has **no game imports and no Phaser dependency**, and only
`author.ts` writes content. Import paths are relative (or `node:` builtins), so
the whole toolkit also loads under plain `tsx` with no bundler.

| Module | Responsibility |
|---|---|
| `content/types.ts` | `ContentCard` (generic card record), `ContentAdapter` / `ContentFieldMapping`, `baseIdOf`, mapping helpers. |
| `content/csv.ts` | `parseCsv` / `serialiseCsv` (byte-identical round-trip), `computeContentChecksum`, `cardsFromCsv`, `compileContentOptions`. |
| `content/manifest.ts` | `buildStorylineManifest`, `serialiseManifest`, `renderMermaid`, `filterManifestByStoryline`, label helpers (`nodeLabel`, `briefEventDescription`, `describeChoiceRouting`). |
| `content/validate.ts` | `validateContentCards` / `validateContentCsv`, text + JSON reports, `findCycles`. |
| `content/author.ts` | `addContentCard`, `updateContentCard`, `applyContentEditToFile` — the only content writer. |
| `content/adapters.ts` | `GYM_CONTENT_ADAPTER` (the default), `getContentAdapter`, `DEFAULT_CONTENT_PATH`. |
| `content/index.ts` | Barrel (also reachable as `@story-line/content`). |

### Content adapter

An adapter declares the game's columns, the story-line field mapping and the
new-card defaults. Only `id` and `name` mappings are required: an adapter
without an `options` column simply omits `options`.

```ts
import type { ContentAdapter } from '@story-line/content';

export const TAVERN_ADAPTER: ContentAdapter = {
  gameId: 'tavern',
  columns: ['card_key', 'card_name', 'flavour', 'arc', 'arc_name', 'choices', 'resource_keys', 'payoff'],
  fields: {
    id: 'card_key',
    name: 'card_name',
    effect: 'flavour',
    options: 'choices',
    storylineId: 'arc',
    storylineTitle: 'arc_name',
    resources: 'resource_keys',
  },
  editableColumns: ['payoff'],
  newCardDefaults: { flavour: '', choices: '', payoff: '0' },
  // Optional: a human-readable game impact for manifest labels/diagrams.
  describeImpact: (card) => (card.fields.payoff ? `payoff ${card.fields.payoff}` : ''),
};
```

An adapter may also map `resources` — the column declaring the card's resource
keys, which is the vocabulary its `#cost` / `#extra` / `#when` attributes are
validated against. A blank cell inherits the file's leading `#resources:`
declaration; a cell and declaration that are both absent fall back to the
default `coins` / `reputation` projection (see
[Declaring the resource keys](#declaring-the-resource-keys)).

Every column **not** in `fields` lands in `ContentCard.fields`, keyed by column
name, so game columns (coin/reputation deltas, renown, payoff, …) are editable
and inspectable without core knowing what they mean. Two optional hooks keep
game semantics out of core: `baseId` (chain-serial stripping; identity by
default) and `describeImpact` (manifest impact text).

Core ships two adapters: `GYM_CONTENT_ADAPTER` (the default, backed by the
committed
[`storylines.csv`](../../example-games/gym/content/storylines.csv)) and
`LONG_ERASURE_CONTENT_ADAPTER` (backed by
[`long-erasure.csv`](../../example-games/gym/content/long-erasure.csv), whose
`act` / `clockCost` columns drive the spike scene). `DEFAULT_CONTENT_FILES`
registers both, so the CLIs validate and drift-check every shipped content
file, not only the default one. Tests additionally exercise a differently
shaped fixture adapter, proving the seam is not shaped around one game.

### CSV and change detection

`parseCsv` handles quoted fields, embedded commas/quotes/newlines and CRLF;
`serialiseCsv` writes LF with a trailing newline, so a canonically quoted file
round-trips **byte-identically** (column order and leading `#` declaration
comments preserved). Leading `#` lines before the header are file-level
declarations — lifted into `ParsedCsv.declarations` and never parsed as data
rows (see [Declaring the resource keys](#declaring-the-resource-keys)).
`computeContentChecksum(csvText)` is a deterministic DJB2 hex hash (8 chars) for
change detection — any byte change produces a different checksum.

`cardsFromCsv(parsed, adapter)` projects rows onto `ContentCard`;
`compileContentOptions(card)` compiles a content card's `options` encoding
through the runtime engine's semantics, so authored content compiles exactly
as the runtime reads it.

### Manifest, Mermaid and the JSON schema

`buildStorylineManifest(cards, adapter)` produces a **deterministic,
timestamp-free** manifest — sorted nodes (by id) and edges (by source, label,
candidate index, target), sorted story-line ids and sorted cycle paths. Two
runs over the same content are byte-identical, and the result is independent of
input card order, which is what makes `--check` a safe drift guard.

Manifest shape: `{ version, source, gameId, storylineIds, nodes, edges, cycles }`,
where a node carries the derived story-line fields plus `impact` and `fields`
(every game column), and an edge carries `from`, `label`, `to`, `random`,
`candidateIndex`, `cycle` and `effectPolicy`. A terminal option becomes one
`to: null` edge; every candidate of a multi-candidate option becomes its own
`random` edge. Cycles are a first-class shape: they are reported and their
edges marked, never treated as an error by the builder.

The generated manifest validates against
[`schemas/story-line-manifest.schema.json`](../../schemas/story-line-manifest.schema.json)
(devDependency `ajv`), which is enforced in the unit suite. The committed Gym
artefacts are `example-games/gym/content/storyline-manifest.json` and
`example-games/gym/content/storyline-graph.mmd`; `--check` fails on drift.

### Validator

`validateContentCards(cards, adapter, { failOnCycle? })` is pure (never mutates,
never throws) and returns `{ valid, issues, findings, cardCount,
choiceCardCount, storylineIds, gameId }`.

| Hard error code | Meaning |
|---|---|
| `duplicate-id` | Two cards share the same (base) id. |
| `missing-required-field` | The id, name or a required adapter column is empty. |
| `missing-storyline-id` | A choice card declares no storyline id. |
| `invalid-option` | Malformed `options` encoding, or an empty/duplicate option label. |
| `unknown-successor` | An `options` candidate names a card id that does not exist. |
| `unreachable-card` | A story-line member is unreachable from its story-line's entry card. |
| `cycle-error` | A cycle treated as invalid — **opt-in** via `failOnCycle`. |

Informational findings are `cycle` and `self-link`; they never fail validation
unless `failOnCycle` is set. A storyline's entry card is its first member (in
file order) with no incoming edge from another member (a closed cycle uses its
first member), so a disconnected fragment is reported as `unreachable-card`.

`formatContentValidationReport(result)` and
`contentValidationToJson(result)` render the same issue/finding data, so the
text and JSON reports cannot disagree.

### Route-space guard

The static validator proves a content file is **well formed**; it cannot tell a
writer whether an authored branch is **playable to an ending**. A cost gate can
leave an option reachable but unwinnable, and a cosmetic choice can undo its own
consequence one beat later. The route-space guard
([`src/story-line/content/guard.ts`](../../src/story-line/content/guard.ts))
answers that question by enumerating the **playable route space** — the same
affordability-aware walk the Long Erasure playtest harness
(`scripts/long-erasure-playtest.ts`) uses, generalised over any
[`ContentAdapter`](#content-adapter).

`evaluateContentGuard(cards, adapter, options)` is pure (never mutates, never
throws) and returns `{ valid, gatedBranches, endings, consequentialChoices,
violations, warnings, errors, exploration }`. It asserts three invariants:

| Invariant | Meaning |
|---|---|
| `gated-branch-survivable` | Every **state-gated** option — a `#cost` affordability gate, a `#when` successor rule, or both — can be taken on at least one route that reaches an ending. |
| `ending-reachable` | Every ending is reachable on the playable route space. |
| `consequential-rejoin` | Every choice **marked consequential** stays distinct from its alternatives for at least the minimum rejoin distance, in beats entered after the fork (`1` = every branch shares the very next beat). |

**Marking choices and endings.** Both are ordinary content data, read from the
card's own extra columns — the runtime ignores them and the static validator
does not require them:

| Column | Value | Meaning |
|---|---|---|
| `consequential` | option label(s), `\|`/`;`/`,` separated, or `*` | The choice(s) whose consequences must persist. An absent/blank cell marks nothing. |
| `ending` | `1`, `true`, `yes` or `ending` | A card that ends a route. When **no** card is marked, endings default to the structural terminals (cards with no outgoing successor). |

A typo in a `consequential` cell (a label the card does not offer) is a
`consequential-rejoin` violation, so a mark cannot silently drift from the
content. A card that marks a choice but offers no alternative gets a warning.

**Rejoin distance** is measured over the declared successor graph ignoring
conditions and affordability (a `#when` target counts as reachable). Branches
that never rejoin pass any minimum — a terminal branch keeps its consequence.

**Bounds.** The enumeration is bounded (`maxDepth` beats per route, `maxStates`
explored states) because a cycle that also grows a resource has no finite state
space. Hitting a bound is reported (`exploration.truncated`) and makes the
report **invalid**: the guard fails closed rather than claiming an invariant it
could not check, and an unproven invariant is never reported as a violation.
Resource-neutral cycles (including a reset ending that loops back to the entry)
terminate through state revisits, so they are an ordinary shape.

**Invocation.** `npm run storylines:guard` guards every target declared in
[`configs/storyline-guard.json`](../../configs/storyline-guard.json) — the CI
form. A single file can be guarded ad hoc:

```bash
npm run storylines:guard
npm run storylines:guard -- --csv tests/fixtures/story-line/gdd-worked-examples.csv \
  --game gym --initial coins=3,reputation=1
npm run storylines:guard -- --csv some/content.csv --game gym \
  --endings end-a,end-b --min-rejoin 3 --json
```

| Flag | Purpose |
|---|---|
| `--csv <path>` | Guard one file (default: every configured target). |
| `--game <id>` | Content adapter id (default `gym`). |
| `--entry <ids>` | Explicit entry card ids (default: every root; a pure cycle falls back to each story-line's first card). |
| `--initial <k=v,…>` | Starting resource bag (default: every declared key = `0`). |
| `--endings <ids>` | Explicit ending ids (precedence: this flag > the `ending` column > structural terminals). |
| `--min-rejoin <n>` | Minimum rejoin distance for marked choices (default `2`). |
| `--max-depth <n>` / `--max-states <n>` | Search bounds (default `48` / `20000`). |
| `--consequential-column` / `--ending-column` | Override the annotation column names. |
| `--json` | Machine-readable report. |

Exit codes: `0` when every invariant holds, `1` on a violation, a content
error, an exhausted bound, or an unreadable/misconfigured target.

The guard models **declared resources only**. A game-specific mechanic that is
not a declared resource (Long Erasure's pressure clock, for example) is outside
it and keeps its own harness; that is why the committed config passes
explicit `endings` for the Long Erasure content (its reset ending loops back and
its clock is not a declared resource).

### Transactional author API

Every edit is: parse → mutate in memory → validate → write atomically (temp file
+ rename). On any validation failure the original CSV is returned unchanged and
the file is not touched; the writer re-validates the candidate itself, so no
caller can bypass the check.

```ts
import {
  GYM_CONTENT_ADAPTER,
  addContentCard,
  applyContentEditToFile,
  updateContentCard,
} from '@story-line/content';

// Pure, in-memory (returns the candidate or the unchanged input + errors).
const edited = addContentCard(csvText, GYM_CONTENT_ADAPTER, {
  id: 'evt-new',
  name: 'A New Event',
  effect: 'Something happens.',
});

// Transactional file edit (`dryRun` returns the candidate without writing).
const result = applyContentEditToFile({
  contentPath: 'src/card-data.csv',
  adapter: GYM_CONTENT_ADAPTER,
  dryRun: true,
  mutate: (csv) =>
    updateContentCard(csv, GYM_CONTENT_ADAPTER, {
      id: 'evt-tax',
      storylineId: 'storyline-tax',
      storylineTitle: 'Tax Arc',
    }),
});
```

`addContentCard` refuses a duplicate id, a missing id/name, an unknown or mapped
game column, and any edit whose result fails validation (for example a new card
in a story-line that nothing links to — it would be `unreachable-card`). The
optional `after` field names a base card id and inserts the new row directly
after that card's row instead of appending, so CSV reading order can track
narrative order; an `after` that names no card is refused with an error naming
the id, and omitting it appends exactly as before. Neither form can silently
re-point an existing story-line's entry card: an add that would move the entry
(the first member with no incoming link) is refused, naming the old and
would-be entry card.
`updateContentCard` changes only the supplied fields; a nullable field set to
`null` is cleared. A card is a choice exactly when its `options` encoding is
non-empty — no separate flag or link column exists to set.

**Forward references: `addLinkedContentCard`.** A branch cannot be authored
one cell at a time — an option may not name a card that does not exist yet
(`unknown-successor`) and a new card added alone to an existing story-line is
`unreachable-card`. `addLinkedContentCard(csv, adapter, { card, linkFrom })`
adds the new card **and** appends an option on the `linkFrom` predecessor
(`label|newId`, label defaulting to the new card's name) in one in-memory pass,
then validates the **combined** candidate once — so the branch is never
half-authored, and either half failing returns the unchanged input. The link is
appended through the same option-append primitive as `add-option`, so an
existing options cell (including its `#cost` / `#extra` / `#when` / `#says`
attributes) is preserved verbatim. `linkFrom.attributes` authors those same
attributes on the **generated** option (in authored order, with or without the
leading `#`), so a gated branch is authored in the same single transaction
rather than in a follow-up `add-option` pass; an attribute naming an undeclared
resource is refused before anything is written. The editor's `add-linked-card`
edit and the CLI's `add-linked-card` command are both thin wrappers over this
one function.

### CLIs

Thin `tsx` entry points over the seams (no Vite loader, no game import). The
writer-facing workflow built on them — column table, worked rows, the review
gate and the malformed-entry behaviour — is documented in the GDD's
[writer content pipeline](../../docs/design/storyline-game-gdd.md#29-writer-content-pipeline-csv-authoring-and-the-review-gate).

| npm script | Script | Purpose |
|---|---|---|
| `npm run storylines:validate` | `scripts/validate-storylines.ts` | Validate a content CSV (`--csv`, `--game`, `--json`, `--fail-on-cycle`). |
| `npm run storylines:guard` | `scripts/storyline-guard.ts` | Guard the playable route space: gated-branch survival, ending reachability, consequential rejoin distance (`--csv`, `--initial`, `--endings`, `--min-rejoin`, `--json`). |
| `npm run storylines:graph` | `scripts/storyline-graph.ts` | Write or `--check` the JSON manifest / Mermaid graph (`--format`, `--out`). |
| `npm run storylines:author` | `scripts/storyline-author.ts` | `add-card` / `add-linked-card` / `add-option` / `update-card` (`--dry-run`, `--field column=value`, `add-card --after <card-id>` positional insert, prose via `--context` / `--epilogue` and `update-card --clear-context` / `--clear-epilogue`, `add-linked-card --link-attr` for the generated link). |
| `npm run storylines:editor` | `scripts/storyline-editor-cli.ts` | Launch the local editor page or apply one edit headlessly (`--content`, `--adapter`, `--port`, `--host`, `--artefact-json`, `--artefact-mermaid`, `--apply`, `--dry-run`). |

Every CLI supports `--help`, resolves `--game` (the author/validator/graph
CLIs) or `--adapter` (the editor) through the shipped adapter registry
(default `gym`), and exits `0` on success and `1` on invalid/unreadable content
or drift. `npm run storylines:author -- add-card --id … --dry-run` prints the
candidate content without writing it.

A forward reference is authored in one command with `add-linked-card`: the new
card and the predecessor's incoming option land in a single validated write.

A new card appends at the end of the file by default. `--after <card-id>`
inserts its row directly after that card's row, so the CSV reads in narrative
order instead of every new beat landing after the last one:

```bash
npm run storylines:author -- add-card --id gym-story-detour \
  --name "A Detour" --effect "The scenic route." \
  --storyline-id gym-story --storyline-title "Gym Storyline" \
  --after gym-story-invest --options "Walk back|gym-story-start"
```

`--after` must name an existing base card id; an unknown id is refused with an
error naming it, and nothing is written. Omitting `--after` appends exactly as
before. A positional insert never silently re-points a story-line's entry card:
the entry is the first member in file order with no incoming link, and an add
that would move the entry (or leave a member unreachable from it) is refused,
naming the old and would-be entry card. Link the new card in from a story-line
member with `add-linked-card --link-from <card-id>` to keep the entry unchanged.

```bash
npm run storylines:author -- add-linked-card --id gym-story-detour \
  --name "A Detour" --effect "The scenic route." \
  --storyline-id gym-story --storyline-title "Gym Storyline" \
  --link-from gym-story-invest --link-label "Take the detour" \
  --link-attr cost=coins:2 --link-attr extra=reputation:+1
```

`--link-from` names the predecessor (required; an absent or unknown predecessor
is refused and nothing is written) and `--link-label` sets the option text
(default: the new card's name). Each `--link-attr <name=value>` (repeatable)
is appended, in authored order, to the option the command generates on that
predecessor — the same `#cost` / `#extra` / `#when` / `#says` encoding
`add-option --attr` accepts, validated against the card's declared resources,
so a gated branch needs no follow-up `add-option` pass. Every `add-card` flag
(`--effect`, `--options`,
`--context`, `--epilogue`, `--storyline-id`, `--storyline-title`,
`--resources`, `--after`, `--field`) also applies to `add-linked-card`, so an
inserted card is linked in from its predecessor in the same transaction.

One option is appended in place with `add-option`, so the existing cell is
never retyped (and a dropped `;` can no longer remove a branch):

```bash
npm run storylines:author -- add-option --id gym-story-invest \
  --label "Wait for spring" --target gym-story-end \
  --attr cost=coins:2 --attr extra=reputation:+1
```

`--id` is the card that gains the option, `--label` is its (card-unique) text
and `--target` is the successor card id; omit `--target` to author a terminal
option (`label|`). Each `--attr <name=value>` is appended in authored order
with an optional leading `#` (`cost=coins:2` and `#cost=coins:2` are the same
attribute). The append is refused, with nothing written, when the label is
already declared on the card, the target names no card (`unknown-successor`),
an attribute names an undeclared resource key, or the option encoding is
malformed — the same validation `update-card --options` runs, applied to the
whole appended candidate. `update-card --options` still replaces the entire
cell.

## Editor (visual authoring tool)

`npm run storylines:editor` launches a local, plain-DOM authoring page over the
same seams. It is a **development tool**, not a shipped game: it has its own
Vite root ([`tools/storyline-editor/`](../../tools/storyline-editor/)) and config
([`vite.editor.config.ts`](../../vite.editor.config.ts), port 5174, output
`dist/editor/`), nothing in `index.html`, `main.ts`, `src/` or `electron/`
references it, and it adds no runtime dependency. Every mutation goes through
the single transactional author API — the page never writes the content CSV
itself.

### Launch

```bash
npm run storylines:editor                     # Gym content on http://127.0.0.1:5174
npm run storylines:editor -- --port 5180
npm run storylines:editor -- --host 127.0.0.1   # loopback is the default
npm run storylines:editor -- --host             # bind all interfaces (0.0.0.0)
npm run storylines:editor -- --content path/to/storylines.csv
npm run storylines:editor -- --adapter ./my-game-adapter.ts
npm run storylines:editor -- --artefact-json my-game/storyline-manifest.json \
  --artefact-mermaid my-game/storyline-graph.mmd
npm run storylines:editor -- --apply '{"edit":{"kind":"update-card","spec":{...}}}'
npm run storylines:editor -- --help
```

| Option | Meaning |
|---|---|
| `--content <path>` | The game's content CSV (default: the Gym demo content). |
| `--adapter <module>` | A shipped adapter id (`gym`) or a module path/specifier exporting a `ContentAdapter` as its default, `adapter` or `contentAdapter` export. |
| `--port` / `--host` | Dev-server port (default `5174`) and bind host (default `127.0.0.1`, loopback). A **valueless `--host`** binds all interfaces (`0.0.0.0`, Vite's convention); an explicit `--host <addr>` binds that address. On startup the CLI prints every resolved URL (`server.resolvedUrls`): the local/loopback URL(s) plus each network URL when a non-loopback interface was bound — and, for a non-loopback bind, warns that the editor is reachable from the network and can write the loaded content CSV (the tool has no authentication). |
| `--artefact-json <path>` | Where an accepted edit writes (and then verifies) the generated JSON manifest artefact (default: the committed Gym artefact, `DEFAULT_ARTEFACT_PATHS.json`). A game points this at its own path so it never overwrites the Gym's, in both serving and `--apply` mode (an `artefactPaths` object in the `--apply` payload still wins). |
| `--artefact-mermaid <path>` | The same for the generated Mermaid flowchart artefact (default: `DEFAULT_ARTEFACT_PATHS.mermaid`). |
| `--apply <json\|@file>` | Apply one edit through the write bridge, print the JSON result and exit (no dev server). `--dry-run` previews/validates while writing nothing. |
| `--help` | Print usage and exit `0`. |

The CLI resolves the adapter, loads the content into an **editor session** (the
CSV snapshot plus its concurrency checksum) and either boots the host or — with
`--apply` — runs the same write bridge headlessly. Exit codes: `0` when serving,
when help was shown or when a headless apply succeeded; `1` on a bad option, an
unknown adapter, unreadable content, a host failure or a refused edit (invalid
or stale content).

### Viewer

The host serves `GET /manifest.json` from memory (built at launch from the
content CSV + adapter) and the page fetches it **once**, so pan/zoom and node
selection never round-trip to the host. The rendered graph is manifest-driven:

- one block per story-line group (a group taller than ten cards wraps into
side-by-side sub-columns inside the same block);
- choice cards drawn as diamonds, plain incidents as rounded rectangles;
- cycle edges and cycle members highlighted;
- an option label on every link (a terminal option is a `to: null` link);
- the graph opens **fitted** to its pane, which fills the window (the page
itself never scrolls); drag to pan, wheel to zoom around the pointer, toolbar
buttons to zoom around the centre, fit and reset (100%, centred); no `viewBox`,
so graph units are CSS pixels and the pan/zoom transform is the only scale;
- selecting a node shows its name, effect, adapter `impact`, routing summary,
successor and incoming links, story-line id/title and every adapter-declared
game column.

The mapping step is [`src/story-line/editor/view-model.ts`](../../src/story-line/editor/view-model.ts)
— a pure manifest → view-model function that reuses the manifest's own label
helpers (`nodeLabel`, `briefEventDescription`, `describeEventImpact`,
`describeChoiceRouting`) and `filterManifestByStoryline` for grouping, so the
editor can never disagree with the generated artefacts.

### Edit workflow

Three surfaces share one workflow — draft, preview, apply, discard:

- **Edit card** — opens the selected node's card form. Core edits the generic
story-line fields (id read-only, name, effect, `options` encoding, story-line
id/title); every adapter-declared column
renders as an additional field without core knowing its semantics. The field
list comes from the adapter's descriptors
([`field-descriptors.ts`](../../src/story-line/editor/field-descriptors.ts)),
not hard-coded column names.
- **Add card** — a guided form that picks the story-line group (existing or a
new one) and optionally the card that leads to the new card. With an incoming
link the form emits a single transactional `add-linked-card` edit (append the
card **and** add the predecessor's option), validated once and written once.
- **Manage story-lines** — create, rename and reassign groups (below).

A change stays a **pending draft** until it is applied; **Discard** throws it
away and leaves the content file untouched. **Apply** previews again first, so a
write can never happen without a fresh, valid preview. Inline validation errors
are attributed to the offending field and block the write, while the full
validator report stays visible.

### Preview and validation

Every edit is previewed before it is written: the preview panel renders the
pending **diff** (only the affected rows, column by column, before → after)
plus the validator's own report — the same text and JSON the `storylines:validate`
CLI renders — so the author sees exactly what would be written and why it is
(or is not) allowed. A refused edit renders its validation errors instead of a
diff, writes nothing, and keeps the draft pending.

The host exposes the bridge as `POST /api/preview`, `POST /api/validate` and
`POST /api/apply`; the page is a client of those endpoints, so tooling can
drive the same workflow.

### Artefact regeneration and hand-written documentation

After an **accepted** edit the committed Mermaid graph and JSON manifest are
regenerated and then re-read to verify them (`writeArtefacts` → `checkArtefacts`
in [`content/artefacts.ts`](../../src/story-line/content/artefacts.ts)). A
"regenerated" claim is therefore verified rather than assumed, and the result
reports any remaining drift. A dry run reports whether the artefacts **would**
stay in sync.

Hand-written documentation is never rewritten. An edit that touches a row
documented by hand surfaces an explicit **"manual documentation update
required"** result naming the check that now fails. The registry lives in
[`src/story-line/editor/manual-docs.ts`](../../src/story-line/editor/manual-docs.ts);
the shipped entry is the Gym demo's hand-maintained card catalogue.

Artefact paths default to the committed Gym artefacts (`DEFAULT_ARTEFACT_PATHS`).
A game supplies its own with `--artefact-json <path>` / `--artefact-mermaid
<path>` (the resolved pair is passed to `loadEditorSession({ artefactPaths })`,
so the served page and the host API write and verify the game's own files), as
a session/bridge option (`loadEditorSession({ artefactPaths })`,
`applyEdit({ artefactPaths })`), or in the `--apply` JSON payload. Omitting both
flags reproduces the Gym defaults exactly.

### Story-line management

A story-line has no declaration file of its own: it exists through the cards
that declare its id and title. Managing one is therefore always a **batch edit
of its member cards' story-line fields**, and the panel drives create, rename
and reassign as one `set-storyline-batch` edit — the combined member cards are
validated once and written once through `applyContentEditToFile`, so renaming a
four-member group is a single author-API call, never one write per card. The
panel lists every group the generated manifest reports plus any group created in
the session; a newly created group with no members stays in-session, listed as
pending, until cards are moved into it (there is nothing to write yet).

### Concurrency guard

The session captures the content checksum at load and hands it to the write
bridge, which compares it with its own read of the file. If the CSV changed on
disk since the page loaded (an external edit, a branch switch), the write is
refused with `stale-content` (HTTP 409), nothing is written, and the page
instructs the author to reload before retrying — a stale snapshot can never
clobber a concurrent edit.

## Engine adapter

`StorylineEngineAdapter<TState, TCard>` inverts all state coupling:

| Method | Contract |
|---|---|
| `rng(state)` | Returns the next seeded value in `[0, 1)`. |
| `applyEffect(state, card)` | Applies the card's intrinsic effect. |
| `applyResourceDelta?(state, delta)` | **Optional** resource-mutation seam core uses to deduct costs and apply extra effects. `delta` is a sparse record keyed by declared resource key (`{ hull: -2 }`); core never names an undeclared key, so an adapter cannot be asked to invent a resource. A legacy adapter that omits the seam compiles and runs unchanged; core then leaves resources untouched and appends a warning line instead. |
| `getResources(state)` | Current resource values keyed by declared resource key (`{ coins, reputation }` by default) for delta reporting and condition evaluation. An omitted key reads as `0`. |
| `resources?` | **Optional** declared resource keys. Omitted/empty means the default `coins` / `reputation` projection, so a pre-declaration adapter is unchanged. The declared set is what `StorylineSystem.resources` reports and what affordability, cost payment, extra effects, condition evaluation and validation operate over. `createResourceProjection({ … })` builds this member plus the two above from one declarative field map. |
| `appendLog(state, text, kind?)` | Appends to the game activity log. |
| `getActivityLog(state)` | The game's append-only log (`{ turn, text }`). |
| `getTemplate(id)` | Template lookup for chain-card creation. |
| `getBaseTypeId(id)` | Strips an instance serial (`evt-x-3` → `evt-x`). |
| `getChainScanCards(state)` | Cards scanned for serial naming (deck/discard locations). |
| `pushChainCard(state, card)` | Pushes a created chain card onto the active deck. |

The adapter is the **only** path from core logic into game state, which keeps
the module deterministic and replay-safe (one seeded draw per candidate
selection). All new declarative semantics — cost payments, extra effects and
condition evaluation — go through `getResources` + `applyResourceDelta`, so no
new coupling is introduced.

## UI adapter

`StorylineUiAdapter<TCard>` is the pluggable presentation seam. It depends
only on the card type — presentation no longer reads game state:

- `storylineName` / `choiceDialogTitle` / `choiceDialogSubtitle`
- `storyUpdateLine` (the narrative line emitted when a choice resolves)
- `journalTitle` / `storylineSummary`

The contract has **no clarity-label method**: the retired choice-clarity API is
gone, and nothing replaces it.

### Option labels with costs

An option's authored `#cost` is part of what the player is choosing, so the
shared formatters render it rather than leaving it to each game:

```ts
formatOptionCost({ coins: 5 })                       // '5 coins'
formatOptionCost({ charge: 1, stores: 2 })           // '1 charge, 2 stores'
formatOptionLabel({ label: 'Invest', cost: { coins: 5 } })
                                                     // 'Invest — 5 coins'
formatOptionLabel({ label: 'Ignore' })               // 'Ignore' (no cost)
```

Rules the implementation keeps, and the tests pin:

- **Keys are printed as authored** (`coins`, `charge`, `stores`). The engine
  knows nothing about a game's resource nouns, so it never invents
  pluralisation — `{ stores: 1 }` renders `1 stores`, and a game that wants
  `1 store` formats its own text.
- **Declaration order is preserved**, so the same content always renders the
  same string.
- **Zero and non-finite amounts are omitted** (a cost that costs nothing is
  invisible, not `0 coins`).
- **A cost-free option keeps its bare label**, so content that authors no cost
  renders exactly as it did before the formatter existed.

`GymStorylineScene` renders `[ <formatOptionLabel(option)> ]`, which is why its
first beat shows `[ Invest — 5 coins ]` next to `[ Ignore ]`.

`defaultStoryUpdateLine`'s `accept` / `reject` wording is **label-driven** —
it switches on the chosen option *label* (a legacy Main Street wording
convention) and has nothing to do with the retired API. Any other label
renders the generalised `you chose "<label>"` form.

### Authored outcome prose

An option may author its consequence in the writer's own words (`#says=`,
see [Authoring options in CSV](#authoring-options-in-csv)). That prose is
threaded from content to every presentation surface — the engine never
paraphrases a label the player has just clicked when real prose exists:

1. **Resolution** — `resolveStorylineOption()` returns the chosen option's
   `says` verbatim as `StorylineResolution.outcomeProse`, or `null` when the
   option authors none. It never changes the resolved deltas or successor.
2. **Story-update line** — pass it as the optional fifth argument to
   `defaultStoryUpdateLine(card, label, coins, rep, outcomeProse?)` (or through
   `ui.storyUpdateLine`, which takes the same optional argument). With prose,
   the line is exactly `Story update — <story-line name>: <prose>` — no
   paraphrase and no appended delta summary. Without prose (absent, `null` or
   blank) the line is byte-identical to the pre-prose wording, so content that
   authors none is unchanged. A game that overrides `storyUpdateLine` should
   forward the argument and prefer the prose when present.
3. **Journal** — `buildJournal()` derives its rows from those log lines.
   `parseStoryUpdate()` splits the envelope on the **first** `: `, so authored
   prose may itself contain `: `, `;`, `#`, quotes and apostrophes.

Journal rows are display copies, so they are short by design:
`StorylineJournalEntry.outcome` is cut to one line by
`truncateOutcome(text, maxLength = 80)` — ellipsis, never mid-word, no
trailing space, no embedded newline, and a space-less string hard-cut to
`maxLength - 1` + `…`. The untruncated outcome stays on `outcomeFull` and the
original line on `text`, so the transcript artefact never loses prose the
journal overlay had to ellipsise.

Core ships `createDefaultStorylineUiAdapter()` (and a ready-made
`defaultStorylineUiAdapter`). Its wording is the shipped Main Street wording, so
a game that supplies no override is visually identical to Main Street. A game
overrides any subset:

```ts
const ui = {
  ...createDefaultStorylineUiAdapter<MyCard>(),
  storyUpdateLine: (card, option, coins, rep) =>
    `${card.name}: ${option} (${coins >= 0 ? '+' : ''}${coins} coins)`,
};
```

The Gym demo uses the default adapter, demonstrating that no game code is
required to present the mechanic. It plays the shipped Gym content CSV
directly (`demoCardsFromCsv` over
[`storylines.csv`](../../example-games/gym/content/storylines.csv)), so the
authoring path — a `#cost`, a `#extra` and a `#when` in one cell — is exercised
by the demo itself: the demo starts at 60 coins so that `Invest`'s 5-coin cost
is affordable while the `coins>=100` gate stays closed, keeping the branch
reachable. A card's authored `cost` column is a real payment too:
`Public Investment` costs 100 coins, charged when the beat resolves together
with that beat's own +120 coin effect, so the branch reads as a +20 trade
rather than a free reward (the scene shows the price on the card line before
the player chooses).

## Episode runner

The beat-sheet layer of [GDD §2.3](../design/storyline-game-gdd.md#23-how-a-scene-outcome-selects-the-next-beat):
an episode manifest authors acts → scenes → beats, a per-scene clock budget,
one objective, an outcome-rule table and a route table, and the runner walks
that data one beat at a time. It is constructed **around** a
`StorylineSystem`, never beside it, so there is exactly one choice model,
resource projection and RNG for the run.

Module: [`src/story-line/episode-runner.ts`](../../src/story-line/episode-runner.ts),
reachable through the `@story-line` barrel. No Phaser import reaches the module
or its transitive imports (`tests/story-line/episode-runner-surface.test.ts`
walks the graph and fails on any `phaser` specifier).

| Exported name | Kind | Meaning |
|---|---|---|
| `createEpisodeRunner` | function | Constructs the runner positioned at the manifest's `start`. |
| `EpisodeRunnerConfig` | type | `{ manifest, storyline, content, seed }` — the validated manifest, the one choice model, the card map and the run's seed. |
| `EpisodeRunner` | type | The runner surface: the config collaborators plus `getState()` / `getSceneExits()` / `getLossLedger()` / `enterBeat()` / `resolveChoice()` / `closeScene()` / `applyLossRule()` / `getBudgetExhausted()`. |
| `EpisodeRunState` | type | The read-only run state (see below). |
| `ChoiceResolution` | type | One resolved choice's classification: `next`, `case`, `cardId`, `pendingChain`, `pushedCard` and the unchanged `@story-line` `resolution`. |
| `ChoiceNext` | type | Where a resolved choice sends the run: `'continue'` or `'close'`. |
| `PushedCardCase` | type | The §2.3 step B.5 case: `'in-scene-beat'`, `'out-of-scene-beat'`, `'ending'` or `'none'`. |
| `evaluateSceneCondition` | function | Evaluates one `SceneCondition` (`objective`, `budget` or raw resource) against a close context; shared with routing's `when` gates. |
| `classifySceneOutcome` | function | First-match-wins outcome classification over a scene's authored `outcomeRules`. |
| `SceneConditionContext` | type | `{ objectiveMet, budgetExhausted, resources }` — the one context the outcome and route gates read. |
| `SceneOutcomeClassification` | type | The winning outcome rule's `{ ruleId, outcome }`. |
| `SceneCloseResult` | type | One scene close's `{ sceneId, objectiveMet, outcome, ruleId, budgetExhausted, losses }` — what routing and the `scene-exit` record read. |
| `BeatEntry` | type | One beat-entry outcome: the `presented` or `refused` variant (see "Beat entry"). |
| `PresentedBeatEntry` | type | A beat the clock paid for: charged cost, prose and gated options. |
| `RefusedBeatEntry` | type | A beat the clock could not pay for: no charge, no options, `budget-exhausted`. |
| `BeatEntryRefusalReason` | type | Why an entry was refused; currently only `'budget-exhausted'`. |
| `SceneExitRecord` | type | The nine-field record appended once per scene close. |
| `LossLedgerEntry` | type | One irreversible-loss line: the `chain` or `rule` variant. |
| `LOSS_LEDGER_KINDS` | const | The two ledger kinds, `['chain', 'rule']`. |
| `SCENE_EXIT_FIELDS` | const | The nine `SceneExitRecord` field names, in §2.3 step 11 order. |

```ts
import { createEpisodeRunner } from '@story-line';

const runner = createEpisodeRunner({
  manifest,          // EpisodeManifest (already validated — never re-validated)
  storyline,         // createStorylineSystem({ engine, ui })
  content: cardsById, // cardsFromCsv(parseCsv(csv), adapter)
  seed: 1234,
});

runner.getState();       // EpisodeRunState — frozen snapshot
runner.getSceneExits();  // readonly SceneExitRecord[] — frozen snapshot
runner.getLossLedger();  // readonly LossLedgerEntry[] — frozen snapshot
runner.enterBeat('le-i-open', gameState); // BeatEntry — presented or refused
runner.resolveChoice(option, gameState);  // ChoiceResolution — next / case / pendingChain
runner.closeScene(gameState);            // SceneCloseResult — objective / outcome / losses
```

Construction consumes no RNG and applies no resource delta. A requested run
whose manifest starts at a scene no act declares throws an actionable error
naming the manifest and the scene id; everything else is left to
`validateEpisodeManifest` (GDD §2.4), because the runner must not re-check an
already validated manifest.

### Beat entry

GDD §2.3 steps A.1–A.3. `enterBeat(cardId, state)` enters a beat **of the
current scene** (a beat of another scene is entered by routing, step 12):

1. **A.1 — read the cost.** The beat's `clockCost` is read from the validated
   manifest's `Beat`, never from the legacy per-card CSV `clockCost` column
   (which survives only as a validator cross-check and retires with G10).
2. **A.2 — refuse what the clock cannot pay.** If `clockCost > sceneClockRemaining`
   the beat is **refused**: it is not played, `currentBeatId` and the clock are
   left unchanged, no options are returned, `budgetExhausted` is set (read
   through `getBudgetExhausted()`), and the record reports
   `reason: 'budget-exhausted'`. The refusal is the scene's close trigger; the
   scene close classifies it through the authored outcome table (step 7), so an
   exhausted close is never hard-coded to `failure`.
3. **A.3 — charge and present.** Otherwise the cost is charged
   (`sceneClockRemaining -= clockCost`), `currentBeatId` becomes the beat, and
   the record carries the card's `context` prose, the scene id (for the scene
   banner) and the surviving options. Options are gated by the shipped
   `isOptionAffordable` over the manifest's declared keys
   (`storyline.resources`); the runner never re-derives affordability.
   **A cost exactly equal to the remaining clock is affordable** — spending the
   last tick on the last beat is a legal, authored climax, so that entry is
   presented with `clockRemaining: 0`.

```ts
const entry = runner.enterBeat('le-i-open', gameState);
if (entry.status === 'presented') {
  renderProse(entry.context);      // the card's `context` paragraph
  renderOptions(entry.options);    // already affordability-gated
} else {
  closeScene(gameState);        // 'budget-exhausted' close trigger
}
```

A `BeatEntry` is a discriminated union on `status`, so the options cannot be
reached on a refusal; the record and its options array are frozen. Beat entry
consumes no RNG and applies no resource delta. Requesting a `cardId` the
current scene does not assign throws an actionable error naming the scene
(a content defect, not a modelling gap). `budgetExhausted` is close-path
bookkeeping: it is **not** part of the frozen `EpisodeRunState` snapshot and is
reset when the run enters the next scene (step 12).

### Choice resolution and the scene boundary

GDD §2.3 steps B.4–B.5. `resolveChoice(option, state)` takes the player's
choice from the presented beat and does exactly two things:

1. **B.4 — delegate.** The option resolves through the run's one choice model,
   `storyline.resolveStorylineOption(state, card, option)`: effect policy, cost
   payment, extra effect, the successor push, outcome prose, journal and log
   are all `@story-line`'s work. The runner adds no second resolution path, does
   not re-read the card's `options` cell and does not re-implement successor
   precedence. The returned record carries that same resolution object by
   reference, so nothing is recomputed.
2. **B.5 — classify the pushed card.** The pushed card is compared against the
   validated manifest's assigned-card index (beat card id → the scene that
   assigns it) and its `endings` list:

| `case` | `cardId` | `next` | `pendingChain` | Meaning |
|---|---|---|---|---|
| `in-scene-beat` | a beat of the current scene | `'continue'` | `null` | continue the scene at that beat (the caller's next step is `enterBeat`) |
| `out-of-scene-beat` | a beat assigned to another scene | `'close'` | the same base id | close the scene; the chain route opens that beat |
| `ending` | a card in `manifest.endings` | `'close'` | the same base id | close the scene; the chain route opens the ending |
| `none` | `null` | `'close'` | `null` | close the scene with no chain to route |

```ts
const resolved = runner.resolveChoice(option, gameState);
if (resolved.next === 'continue') {
  runner.enterBeat(resolved.cardId!, gameState); // still the same scene
} else {
  closeScene(gameState);           // reads resolved.pendingChain for the chain route
}
```

`ChoiceResolution` is the **one** shape the scene close and the tests read: it
names the case, carries `next`, the classified `cardId` and `pendingChain`, and
exposes the pushed card and the underlying `StorylineResolution`. The record is
frozen. `pushedCard` is the card `@story-line` pushed (an instance, e.g.
`le-i-log-0`); `cardId` and `pendingChain` are its **base** id (the adapter's
`getBaseTypeId`, e.g. `le-i-log`), because the manifest, `enterBeat`, the route
targets and the scene close all speak template ids. The two close cases record
`pendingChain` on the run state (`getState().pendingChain`) for the scene close
to route; the continuing case changes no run state at all — the scene id, act,
clock and current beat stay where the beat entry left them.

Classification consumes no RNG and applies no resource delta: everything the
resolution changed, the engine seam changed. A pushed card that is neither an
assigned beat nor a declared ending is a content defect (`validateEpisodeManifest`
reports it as `unassigned-card`), so the runner throws an actionable error
naming the card and the episode instead of silently classifying it.

### Scene close

GDD §2.3 steps C.6–C.8. `closeScene(state)` closes the current scene in the
contract's order and returns one frozen {@link SceneCloseResult}:

1. **C.6 — objective, exactly once.** `engine.getResources(state)` is read
   **once** and the scene's `objective.check` is evaluated against that
   post-resolution snapshot. `objectiveMet` records the verdict; the same
   snapshot is the resource bag the outcome table's raw conditions read, so a
   close observes one moment in time.
2. **C.7 — outcome, first match wins.** The first `outcomeRules` entry in
   **declaration order** whose `when` matches classifies the outcome. `when` is
   one of the three `SceneCondition` forms — `{ objective }`, `{ budget }` or a
   raw `{ field, op, value }` resource check — evaluated by the exported
   `evaluateSceneCondition(condition, { objectiveMet, budgetExhausted, resources })`
   helper (the same helper routing's `when` gates use). The last rule is
   unconditional by validation (`non-total-outcome-rules`), so classification is
   total; the classifier has **no defensive catch-all** and throws an actionable
   error naming the scene if a table classifies nothing.
   **`budgetExhausted` is an authored input, never a hard-coded `failure`.** A
   refused beat entry sets it on the run, and a scene that can exhaust its budget
   authors a `{ budget: "exhausted" }` rule *before* its catch-all — the
   committed `s-iii-core` authors `watch-spent` (failure) ahead of
   `crew-with-you`/`crew-gone`, so a refused close classifies `failure` through
   the table, and a scene whose objective was already achieved may legitimately
   classify `partial` instead.
3. **C.8 — losses, declaration order.** Every `losses[]` rule whose `on` equals
   the classified outcome is applied through `EpisodeRunner.applyLossRule`
   (hence `engine.applyResourceDelta`) in **declaration order**. Each applied
   rule appends one ledger `rule` line and one `engine.appendLog` line carrying
   the authored `statement` plus the signed amount the seam actually applied and
   the key it fell on, e.g.
   `Breaking for the core on the last of the watch costs the hull. (−1 hull)`,
   tagged `'loss'`. A rule the seam did not apply (no resource seam, or a clamped
   non-negative change) records neither line.

```ts
const closed = runner.closeScene(gameState);
// { sceneId, objectiveMet, outcome, ruleId, budgetExhausted, losses }
closed.objectiveMet; // C.6 verdict
closed.outcome;      // C.7 word
closed.ruleId;       // the outcomeRules[] entry that classified it
closed.losses;       // C.8 ledger lines this close appended, in order
```

The close consumes no RNG, performs no routing (C.9–C.12 owns the route
selection, the scene-exit record and scene entry) and does not move the run's
position or clock: it only classifies and applies the authored losses. The
returned result is the single shape routing reads, so the objective and the
outcome table are never re-evaluated.

### Run state

`EpisodeRunState` is exactly the beat-sheet state of GDD §3.5.2 — resources
and the journal stay in the game's own state, read through the storyline engine
adapter:

| Field | At run start |
|---|---|
| `seed` | the seed the runner was constructed with |
| `currentActId` / `currentSceneId` / `currentBeatId` | `manifest.start.act` / `.scene` / `.beat` |
| `sceneClockRemaining` | the entry scene's `budget.clock` |
| `pendingChain` | `null` |
| `sceneHistory` / `routeHistory` | empty (the start scene counts as entered once it closes) |
| `lossLedger` | empty |

Every read returns a frozen defensively-copied snapshot, so mutating what
`getState()` returns never changes the run, and two calls never share an
array instance. The scene-exit records live on `getSceneExits()` and follow
the same rule; they are append-only, in close order.

### Scene-exit record

One record per scene close, exactly the nine fields of §2.3 step 11 and in
that order (`SCENE_EXIT_FIELDS`):

| Field | Type | Meaning |
|---|---|---|
| `sceneId` | `string` | the scene that closed |
| `objectiveMet` | `boolean` | whether the scene objective was met at close |
| `outcome` | `'success' \| 'partial' \| 'failure'` | the classified outcome |
| `ruleId` | `string` | the `outcomeRules[].id` that classified it |
| `routeId` | `string` | the `routes[].id` the close took |
| `clockSpent` | `number` | ticks spent in the scene |
| `clockRemaining` | `number` | ticks left when the scene closed |
| `budgetExhausted` | `boolean` | whether a beat was refused for want of clock |
| `nextBeat` | `string` | the beat (or ending card id) the route opens |

A change to the record is a deliberate, compiler-checked change in both the
interface and `SCENE_EXIT_FIELDS`; the surface test fails `npm run build` when
the two disagree, and checks this section lists the same nine names.

### Loss ledger entries

GDD §2.2.8. The ledger is the beat sheet's permanent record of every
irreversible loss; the resources themselves live in the game's state, and every
change reaches them through `storyline.engine.applyResourceDelta` — the runner
performs no resource arithmetic of its own. It has exactly two sources, and
both record what the run **observed**, never a value re-derived from authored
data:

| `kind` | Fields | Recorded when |
|---|---|---|
| `chain` | `sceneId`, `beatId`, `field`, `delta` | an irreversible key fell across a beat resolution |
| `rule` | `sceneId`, `ruleId`, `field`, `delta`, `statement` | a scene's `losses[]` rule fired at close, in declaration order |

**Chain lines.** `resolveChoice()` snapshots the manifest's
`resources.irreversible` keys from `engine.getResources` immediately before and
after the one choice model resolves, and records one line per key whose **net**
change is negative. Keys are visited in the manifest's declaration order, so a
single resolution that spends two irreversible keys appends both lines in
authored order. `delta` is the observed difference (e.g. `#cost=hull:1` records
`-1`), and `beatId` is the beat being resolved — the player's choice spent the
resource, and the ledger only noticed.

**Rule lines.** `applyLossRule(rule, state)` is the ledger's **rule-loss seam**,
called once per matching `losses[]` entry, in declaration order, by the scene
close (step C.8). The manifest authors `amount` as a magnitude removed, so the
seam passes `-amount` to `engine.applyResourceDelta`; the recorded `delta` is
then read back from `engine.getResources`, so it is the change the seam actually
applied rather than a repeat of the authored number. `sceneId` is the scene the
rule fired in (`currentSceneId` at close), `ruleId` is the rule's `id`, and
`statement` is the rule's player-facing line, copied verbatim for the ledger
consumer and the journal.

```ts
// Scene close, GDD §2.3 step C.8 — matching rules in declaration order.
for (const rule of scene.losses?.filter((loss) => loss.on === outcome) ?? []) {
  runner.applyLossRule(rule, gameState);
  appendLossLogLine(rule);           // statement + signed amount + key
}
```

**Invariants.**

- The ledger **never holds a positive line**: a refund (a net positive change on
  an irreversible key) records nothing, and neither does a zero change.
- A line **never exists without its apply**: a rule whose field the seam cannot
  change — or an adapter that omits the optional `applyResourceDelta` seam —
  applies nothing, so nothing is recorded. `applyLossRule` returns the appended
  line, or `null` when nothing was observed to fall.
- Lines are **ordered by observation**, across both sources: chain lines appear
  where the resolution that spent them happened, rule lines where the close
  applied them.
- The ledger is **read-only to callers**: `getLossLedger()` (and
  `getState().lossLedger`) return frozen snapshots with freshly-copied entries,
  so mutating what a caller received cannot change the run.
- Every line is **JSON-safe** and survives a `JSON.parse(JSON.stringify(...))`
  round-trip unchanged, because the ephemeral score and epilogue read it from a
  save or a transcript.

Irreversible keys are never reset, topped up or compensated when a scene is
entered or closed; the ledger and the journal are what survive the reset
ending.

The numbered §2.3 subsections (beat entry, choice resolution, scene close,
routing, persistence) are documented here as they ship.

## Gym demo

[`GymStorylineScene`](../../example-games/gym/scenes/GymStorylineScene.ts)
(`GymStorylineScene` in the Gym catalogue) deals a small branching story-line
(3–4 cards) with two-way and terminal options, read from the shipped content
CSV at build time. It draws a card, renders the compiled options with the
default UI adapter, resolves the choice, and deals the successor until the
chain ends. It is covered by the Gym individual-scene
smoke test (`tests/gym/GymSceneSmoke.browser.test.ts`) and listed in the
[Gym index](../gym/GYM_INDEX.md).

### Long Erasure (the authored-narrative spike)

[`GymLongErasureScene`](../../example-games/gym/scenes/GymLongErasureScene.ts)
plays *The Long Erasure*: an original-setting, IP-safe three-act story-line
built entirely from the content path above. Its rules — act gating, the
pressure clock, availability filtering, branch resolution and the
journal-derived epilogue score — live in the Phaser-free
[`GymLongErasureGame.ts`](../../example-games/gym/GymLongErasureGame.ts)
(unit-tested by `tests/gym/GymLongErasureGame.test.ts`), so the narrative is
verified headlessly and the scene only renders state and forwards the choice.

The full game design built on this content path — the three-act scene beat
sheet, the economy, the presentation contract, the engine-gap backlog and the
v1 scope — is the [*Long Erasure* GDD](../design/storyline-game-gdd.md); the
spike's evidence is the
[observation log](../gym/long-erasure-observation-log.md) and the
[playtest evaluation](../design/storyline-playtest-evaluation.md).

Its content is
[`example-games/gym/content/long-erasure.csv`](../../example-games/gym/content/long-erasure.csv)
with the `long-erasure` adapter: a five-key declared set
(`hull,morale,stores,goodwill,charge`) plus `act` / `clockCost` game columns.
Every cost, extra effect and conditional successor in that file is authored in
CSV with no TypeScript registration — the worked example above is a row from
it. The run ends with a timeline reset and a scored epilogue, which is the
manifest `cycles` shape used as designed rather than a loop the runtime
follows.

## Testing

- `tests/story-line/compile.test.ts` — options-only and CSV compilation,
  registry precedence, draw-time condition **and cost** filtering, snapshot
  stability.
- `tests/story-line/episode-runner-surface.test.ts` / `episode-runner-beat-entry.test.ts`
  — the runner's shipped surface (run state, frozen snapshots, no Phaser import,
  the nine `scene-exit` fields) and beat entry (A.1–A.3: manifest cost, exact-cost
  affordability, refusal with `budget-exhausted`, gated options, no RNG).
- `tests/story-line/episode-runner-choice.test.ts` — choice resolution (B.4–B.5):
  delegation to `resolveStorylineOption` proved with a spy, and one test per
  `pushedCard` case (in-scene beat continues, out-of-scene beat and ending close
  with `pendingChain`, no push closes with `null`).
- `tests/story-line/resolve.test.ts` — apply/skip, cost payment, extra
  effects, conditional successors, successor precedence, the one-draw rule,
  deterministic serial naming, pending-choice lifecycle, and carrying the
  chosen option's authored outcome prose (`outcomeProse`).
- `tests/story-line/validate.test.ts` — declarative metadata validation
  (costs, extra effects, conditions, dangling successors, declared-resource
  vocabulary and the `cardId` / `resource` issue fields).
- `tests/story-line/content/extended-options.test.ts` — the CSV attribute
  grammar (`#cost` / `#extra` / `#when`), shorthand compatibility, the
  malformed-cell fixtures (row/column/reason diagnostics) and conditional
  successor resolution.
- `tests/story-line/resource-declaration.test.ts` — the declared-resource
  contract: a five-resource fixture game authoring conditions, costs and extra
  effects on any key, draw-time affordability over declared keys, the
  absent-key/unspecified-key/no-invention rules, the `coins` / `reputation`
  default projection and `createResourceProjection` itself.
- `tests/story-line/journal.test.ts` — journal parsing, ordering, empty state,
  and the display-safe `truncateOutcome()` boundaries (word boundary,
  space-less hard cut, default 80-character budget) that keep the full prose
  on `outcomeFull`.
- `tests/story-line/ui-adapter.test.ts` — default adapter wording, the
  pluggable override seam, and the absence of a clarity-label method.
- `tests/story-line/content/csv.test.ts` — byte-identical round-trip (two
  adapter shapes), checksum determinism, projection and option compilation.
- `tests/story-line/content/manifest.test.ts` — manifest shape, determinism and
  input-order independence, cycle marking, filtering, Mermaid rendering, AJV
  schema validation and `--check` drift behaviour.
- `tests/story-line/content/validate.test.ts` — every hard-error class, cycle
  policy, report parity and non-mutation.
- `tests/story-line/content/author.test.ts` — transactional add/update, refusal
  on invalid content, dry-run and atomic file writes.
- `tests/story-line/content/adapters.test.ts` — the default adapter/registry and
  the seam proven with a second, differently shaped adapter.
- `tests/story-line/content/import-boundary.test.ts` — the module graph imports
  only relative modules/`node:` builtins, and only `author.ts` writes files.
- `tests/story-line/content/cli.test.ts` — validator/builder exit codes, report
  output and a `tsx` subprocess smoke run of the entry points.
- `tests/story-line/editor/view-model.test.ts` — the view model diffs against the
  generated manifest (nodes, edges, story-line ids/titles, cycle flags).
- `tests/story-line/editor/bridge.test.ts` / `host-api.test.ts` / `cli.test.ts`
  — the write bridge (preview/validate/apply), the host middleware and the CLI
  (launch, `--help`, adapter resolution, headless `--apply`).
- `tests/story-line/editor/concurrency.test.ts` — the stale-content guard refuses
  a write and returns a reload instruction.
- `tests/story-line/editor/preview-validate.test.ts` — broken edits are refused,
  write nothing and surface the offending card/link.
- `tests/story-line/editor/edit-forms.test.ts` / `add-card-form` coverage —
  adapter-driven field descriptors, drafts, diff preview and inline error
  attribution.
- `tests/story-line/editor/storyline-manager.test.ts` — group derivation, draft
  validation and one-batch writes against a temp fixture copy.
- `tests/story-line/editor/harness.browser.test.ts` / `viewer.browser.test.ts` /
  `edit-roundtrip.browser.test.ts` / `storyline-manager.browser.test.ts` — the
  editor page's plain-DOM renderers run in Vitest's browser project: viewer
  rendering, grouping, cycle marking, pan/zoom/select, and a representative
  edit round-trip.
- `tests/story-line/editor/build-exclusion.test.ts` / `vite-editor-config.test.ts`
  — the editor entry is not referenced from the game/Electron build, and its
  config is distinct from the game config.
- `tests/gym/LongErasureContent.test.ts` / `LongErasureEpilogue.test.ts` — the
  authored content's structure (acts, branch points, the state gate, the
  terminal option), the prohibited-IP-term scan over content and artefacts,
  and the epilogue scoring.

Run the unit project with `npx vitest run --project unit` (or
`/skill:test --type unit`). The Gym scene runs in the `smoke` project.

Cross-repo behaviour preservation is guarded in the Main Street repo by a
parity gate that compares this module against the shipped Main Street
implementation and a set of golden fixtures.
