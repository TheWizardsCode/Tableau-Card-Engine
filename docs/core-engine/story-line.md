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

## Engine adapter

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

Run the unit project with `npx vitest run --project unit` (or
`/skill:test --type unit`). The Gym scene runs in the `smoke` project.

Cross-repo behaviour preservation is guarded in the Main Street repo by a
parity gate that compares this module against the shipped Main Street
implementation and a set of golden fixtures.
