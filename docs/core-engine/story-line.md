# Core: Generic Story-Line System

A game-agnostic branching narrative engine for tableau card games. A drawn
card presents an ordered set of options; the player's choice selects the next
card until the chain ends. The mechanic is used by Main Street and demonstrated
by the Gym `GymStorylineScene`.

Module root: [`src/story-line/`](../../src/story-line/) — import via the
`@story-line` alias. The module has **no game imports and no Phaser
dependency**; a game plugs its state and presentation in through two adapters.

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
| Journal | `parseStoryUpdate`, `buildJournal`, `journalIsEmpty`, `journalTitle` |
| Validation | `validateStorylineOptions` (declarative metadata guard) |

### Story-line options

A `StorylineOption` is the unit a player chooses from. Core describes options
**programmatically** via `registerStorylineOptions` — the CSV `options` column
is a *label/outcome* shorthand and cannot author the extended fields below
(producer decision: programmatic only).

| Field | Type | When it applies |
|---|---|---|
| `label` | `string` | always |
| `effectPolicy` | `'apply' \| 'skip'` | always — controls the card's intrinsic effect |
| `condition?` | `(state) => boolean` | draw time — omit the option when `false` |
| `successorId?` | `string \| null` | resolution — legacy single successor |
| `successorIds?` | `string[]` | resolution — one seeded random draw picks a candidate |
| `successorResolver?` | `(state) => string \| null` | resolution — callback, highest precedence |
| `conditionalSuccessors?` | `ConditionalSuccessorRule[]` | resolution — first matching rule wins |
| `cost?` | `{ coins?; reputation? }` | draw time **and** resolution — affordability gate + real payment |
| `extraEffect?` | `{ coins?; reputation? }` | resolution — additional resource gain |

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

### Compilation

Precedence: **registered options > CSV `options` encoding > legacy
`hasChoices` fields**.

- Legacy `hasChoices` cards compile to two options: `Accept` (`apply`) and
  `Reject` (`skip`).
- CSV `options` encoding: `label|cardA,cardB;label2|cardC` (`;` separates
  options, `|` separates the label from candidate ids, `,` separates
  candidates). An empty candidate list is a **terminal** option. Every
  CSV-authored option carries `effectPolicy: 'apply'`.
- Draw-time filtering is **combined**: a registered option is omitted when its
  `condition(state)` callback returns `false` **or** its declarative `cost`
  exceeds the player's current coins/reputation. Options without a cost are
  always included; a cost exactly equal to the balance is affordable.
  Filtering happens once, when the option list is compiled at draw time, and
  the result is frozen into `PendingStorylineChoice.options`, where consumers
  (including AI scoring) read the stable presented list.

### Resolution

`resolveStorylineOption(state, card, option)` runs the full lifecycle for a
selected option:

1. **`effectPolicy`** — `apply` runs the card effect, `skip` does not
   (unchanged legacy step).
2. **Cost payment** — the option's `cost` is deducted through the engine
   adapter's resource-mutation seam, in addition to the effect.
3. **Extra effect** — the option's `extraEffect` gains are applied, also
   through the resource-mutation seam.
4. **Deltas** — `coinChange` / `repChange` account for all three steps; each
   applied cost/extra effect appends an activity-log line (`Cost paid: -100
   coins.`, `Extra effect: +10 coins.`).
5. **Successor** — resolved with this precedence:

   1. `option.successorResolver(state)` — a callback; `null`/`undefined` ends
      the chain. Consumes no RNG.
   2. `option.conditionalSuccessors` — evaluated in declaration order against
      the post-resolution resources; the first matching rule's `successorId`
      is pushed (`null` ends the chain). A matching rule consumes no RNG.
   3. `option.successorIds` — exactly **one** seeded `rng()` draw selects a
      candidate. An empty list is terminal and consumes no draw.
   4. `option.successorId` — a legacy single id, pushed directly (no draw).

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
| `non-positive-cost` | `cost.coins` / `cost.reputation` equal to zero or negative. |
| `negative-extra-effect` | `extraEffect.coins` / `extraEffect.reputation` below zero (extra effects are gains). |
| `unknown-condition-field` | A condition field other than `coins` / `reputation`. |
| `unknown-condition-op` | An operator other than `>=`, `<=`, `>`, `<`, `==`. |
| `non-numeric-value` | A non-finite (or non-numeric) cost, extra-effect or condition value. |
| `dangling-conditional-successor` | A rule targeting an id outside `knownTemplateIds` (checked only when the catalogue is supplied). |
| `invalid-successor-id` | A rule `successorId` that is neither a string nor `null`. |
| `invalid-conditional-successors` | A `conditionalSuccessors` value that is not an array of rule objects. |
| `invalid-condition` | A rule without a `when` condition object. |

Validation is authoring-time only: runtime resolution remains permissive, so a
list that fails validation still resolves exactly as declared. No shipped CSV
content uses `cost`, `extraEffect` or `conditionalSuccessors`, so all shipped
content validates cleanly.

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
new-card defaults. Only `id` and `name` mappings are required: a game without a
legacy two-way choice model simply omits `hasChoices` /
`acceptNextCardId` / `rejectNextCardId`, and a game without an `options` column
omits `options`.

```ts
import type { ContentAdapter } from '@story-line/content';

export const TAVERN_ADAPTER: ContentAdapter = {
  gameId: 'tavern',
  columns: ['card_key', 'card_name', 'flavour', 'arc', 'arc_name', 'choices', 'payoff'],
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
  // Optional: a human-readable game impact for manifest labels/diagrams.
  describeImpact: (card) => (card.fields.payoff ? `payoff ${card.fields.payoff}` : ''),
};
```

Every column **not** in `fields` lands in `ContentCard.fields`, keyed by column
name, so game columns (coin/reputation deltas, renown, payoff, …) are editable
and inspectable without core knowing what they mean. Two optional hooks keep
game semantics out of core: `baseId` (chain-serial stripping; identity by
default) and `describeImpact` (manifest impact text).

Core ships `GYM_CONTENT_ADAPTER` as the default, backed by the committed
[`example-games/gym/content/storylines.csv`](../../example-games/gym/content/storylines.csv)
of the Gym demo content. Tests additionally exercise a differently shaped
fixture adapter, proving the seam is not shaped around one game.

### CSV and change detection

`parseCsv` handles quoted fields, embedded commas/quotes/newlines and CRLF;
`serialiseCsv` writes LF with a trailing newline, so a canonically quoted file
round-trips **byte-identically** (column order preserved).
`computeContentChecksum(csvText)` is a deterministic DJB2 hex hash (8 chars) for
change detection — any byte change produces a different checksum.

`cardsFromCsv(parsed, adapter)` projects rows onto `ContentCard`;
`compileContentOptions(card)` applies the runtime engine's precedence (CSV
`options` encoding → legacy `hasChoices`), so authored content compiles exactly
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
| `missing-required-field` | The id or name is empty. |
| `missing-storyline-id` | A choice card declares no storyline id. |
| `orphan-link` | A card declares accept/reject links but is not a choice card. |
| `invalid-option` | Malformed `options` encoding, or an empty/duplicate option label. |
| `unknown-successor` | An option (including a legacy `Accept`/`Reject` option) names an unknown card. |
| `dangling-link` | An inert accept/reject link (on a non-choice card) names an unknown card. |
| `unreachable-card` | A story-line member is unreachable from its story-line's entry card. |
| `cycle-error` | A cycle treated as invalid — **opt-in** via `failOnCycle`. |

Informational findings are `cycle` and `self-link`; they never fail validation
unless `failOnCycle` is set. A storyline's entry card is its first member (in
file order) with no incoming edge from another member (a closed cycle uses its
first member), so a disconnected fragment is reported as `unreachable-card`.

`formatContentValidationReport(result)` and
`contentValidationToJson(result)` render the same issue/finding data, so the
text and JSON reports cannot disagree.

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
in a story-line that nothing links to — it would be `unreachable-card`).
`updateContentCard` changes only the supplied fields; a nullable field set to
`null` is cleared, and setting a legacy link also marks the card as a choice.

### CLIs

Thin `tsx` entry points over the seams (no Vite loader, no game import):

| npm script | Script | Purpose |
|---|---|---|
| `npm run storylines:validate` | `scripts/validate-storylines.ts` | Validate a content CSV (`--csv`, `--game`, `--json`, `--fail-on-cycle`). |
| `npm run storylines:graph` | `scripts/storyline-graph.ts` | Write or `--check` the JSON manifest / Mermaid graph (`--format`, `--out`). |
| `npm run storylines:author` | `scripts/storyline-author.ts` | `add-card` / `update-card` (`--dry-run`, `--field column=value`). |

Every CLI supports `--help`, resolves `--game` through the shipped adapter
registry (default `gym`), and exits `0` on success and `1` on invalid/unreadable
content or drift. `npm run storylines:author -- add-card --id … --dry-run`
prints the candidate content without writing it.



`StorylineEngineAdapter<TState, TCard>` inverts all state coupling:

| Method | Contract |
|---|---|
| `rng(state)` | Returns the next seeded value in `[0, 1)`. |
| `applyEffect(state, card)` | Applies the card's intrinsic effect. |
| `applyResourceDelta?(state, { coins?, reputation? })` | **Optional** resource-mutation seam core uses to deduct costs and apply extra effects. A legacy adapter that omits it compiles and runs unchanged; core then leaves resources untouched and appends a warning line instead. |
| `getResources(state)` | Current `{ coins, reputation }` for delta reporting and condition evaluation. |
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

`StorylineUiAdapter<TState, TCard>` is the pluggable presentation seam:

- `storylineName` / `choiceDialogTitle` / `choiceDialogSubtitle`
- `storyUpdateLine` (the narrative line emitted when a choice resolves)
- `choiceClarityLabels` (must explain apply/skip semantics without revealing
  the escalation card id)
- `journalTitle` / `storylineSummary`

Core ships `createDefaultStorylineUiAdapter()` (and a ready-made
`defaultStorylineUiAdapter`). Its wording is the shipped Main Street wording, so
a game that supplies no override is visually identical to Main Street. A game
overrides any subset:

```ts
const ui = {
  ...createDefaultStorylineUiAdapter<MyState, MyCard>(),
  storyUpdateLine: (card, option, coins, rep) =>
    `${card.name}: ${option} (${coins >= 0 ? '+' : ''}${coins} coins)`,
};
```

The Gym demo uses the default adapter, demonstrating that no game code is
required to present the mechanic. The demo's fixtures are unchanged by the
cost/extra-effect/conditional-successor extension: it exercises the legacy
experience, and no Gym fixture uses the new fields.

## Gym demo

[`GymStorylineScene`](../../example-games/gym/scenes/GymStorylineScene.ts)
(`GymStorylineScene` in the Gym catalogue) deals a small branching fixture
(3–4 cards) with two-way and terminal options. It draws a card, renders the
compiled options with the default UI adapter, resolves the choice, and deals
the successor until the chain ends. It is covered by the Gym individual-scene
smoke test (`tests/gym/GymSceneSmoke.browser.test.ts`) and listed in the
[Gym index](../gym/GYM_INDEX.md).

## Testing

- `tests/story-line/compile.test.ts` — legacy and CSV compilation, registry
  precedence, draw-time condition **and cost** filtering, snapshot stability.
- `tests/story-line/resolve.test.ts` — apply/skip, cost payment, extra
  effects, conditional successors, successor precedence, the one-draw rule,
  deterministic serial naming, pending-choice lifecycle.
- `tests/story-line/validate.test.ts` — declarative metadata validation
  (costs, extra effects, conditions, dangling successors).
- `tests/story-line/journal.test.ts` — journal parsing, ordering, empty state.
- `tests/story-line/ui-adapter.test.ts` — default adapter wording and the
  pluggable override seam.
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

Run the unit project with `npx vitest run --project unit` (or
`/skill:test --type unit`). The Gym scene runs in the `smoke` project.

Cross-repo behaviour preservation is guarded in the Main Street repo by a
parity gate that compares this module against the shipped Main Street
implementation and a set of golden fixtures.
