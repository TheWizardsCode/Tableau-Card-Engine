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

### Compilation

Precedence: **registered options > CSV `options` encoding > legacy
`hasChoices` fields**.

- Legacy `hasChoices` cards compile to two options: `Accept` (`apply`) and
  `Reject` (`skip`).
- CSV `options` encoding: `label|cardA,cardB;label2|cardC` (`;` separates
  options, `|` separates the label from candidate ids, `,` separates
  candidates). An empty candidate list is a **terminal** option. Every
  CSV-authored option carries `effectPolicy: 'apply'`.
- Registry/CSV options can carry a `condition(state)` callback, evaluated once
  at draw time; options whose condition returns `false` are omitted from the
  presented list.

### Resolution

`resolveStorylineOption(state, card, option)` applies the option's
`effectPolicy` (`apply` runs the card effect, `skip` does not), then resolves
the successor with this precedence:

1. `option.successorResolver(state)` — a callback; `null`/`undefined` ends the
   chain. Consumes no RNG.
2. `option.successorIds` — exactly **one** seeded `rng()` draw selects a
   candidate. An empty list is terminal and consumes no draw.
3. `option.successorId` — a legacy single id, pushed directly (no draw).

The pushed card uses deterministic serial naming: `${base}-${maxSerial+1}`,
scanning every card the engine adapter returns from `getChainScanCards`.

## Engine adapter

`StorylineEngineAdapter<TState, TCard>` inverts all state coupling:

| Method | Contract |
|---|---|
| `rng(state)` | Returns the next seeded value in `[0, 1)`. |
| `applyEffect(state, card)` | Applies the card's intrinsic effect. |
| `getResources(state)` | Current `{ coins, reputation }` for delta reporting. |
| `appendLog(state, text, kind?)` | Appends to the game activity log. |
| `getActivityLog(state)` | The game's append-only log (`{ turn, text }`). |
| `getTemplate(id)` | Template lookup for chain-card creation. |
| `getBaseTypeId(id)` | Strips an instance serial (`evt-x-3` → `evt-x`). |
| `getChainScanCards(state)` | Cards scanned for serial naming (deck/discard locations). |
| `pushChainCard(state, card)` | Pushes a created chain card onto the active deck. |

The adapter is the **only** path from core logic into game state, which keeps
the module deterministic and replay-safe (one seeded draw per candidate
selection).

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
required to present the mechanic.

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
  precedence, draw-time condition filtering.
- `tests/story-line/resolve.test.ts` — apply/skip, successor precedence, the
  one-draw rule, deterministic serial naming, pending-choice lifecycle.
- `tests/story-line/journal.test.ts` — journal parsing, ordering, empty state.
- `tests/story-line/ui-adapter.test.ts` — default adapter wording and the
  pluggable override seam.

Run the unit project with `npx vitest run --project unit` (or
`/skill:test --type unit`). The Gym scene runs in the `smoke` project.

Cross-repo behaviour preservation is guarded in the Main Street repo by a
parity gate that compares this module against the shipped Main Street
implementation and a set of golden fixtures.
