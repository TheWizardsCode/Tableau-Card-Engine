# The Long Erasure — Game Design Document (GDD)

> **Status.** Working draft. This is the single reviewable document for the full
> story-line game; it ships no gameplay code. Settings names are working names
> until the IP-safe naming pass assigns final ones.
>
> | | |
> |---|---|
> | **Work item** | `CG-0MWPY25W4002UNKB` (GDD foundation: setting, loop and beat-sheet data model) |
> | **Parent epic** | `CG-0MWNFVLYT003M7XF` (GDD: full story-line game, approach C — scene beat sheet) |
> | **Document path** | `docs/design/storyline-game-gdd.md` (working default; finalised by `CG-0MWPY2FV30041M48`) |
> | **Design direction** | Approach **C** (scene beat sheet) with approach A's card chain inside it and approach B's irreversible-loss dial |
> | **Evidence base** | [`docs/gym/long-erasure-observation-log.md`](../gym/long-erasure-observation-log.md) (`CG-0MWNHZEGJ0099JFM`), re-measured by [`docs/design/storyline-playtest-evaluation.md`](./storyline-playtest-evaluation.md) (`CG-0MWPY24IX00719NH`) |
> | **Engine contract composed with** | [`docs/core-engine/story-line.md`](../core-engine/story-line.md) (`@story-line`) |
> | **Section ownership** | [Appendix C](#appendix-c-work-item-map) |

**How to read this document.** Sections 1–2 are written and complete: they are
what an implementer needs to build the beat-sheet layer. Section 4 carries the
fixed design vocabulary (its proper-noun table is pending the IP pass), and
sections 3 and 6–7 are owned by later children of the epic and are present as
marked stubs so the document is one continuous artefact from the start. Every
stub names the work item that fills it, and nothing in sections 1–2 depends on
a stub being filled.

---

## Executive Summary

**The Long Erasure** is a single-player, turn-free narrative card game for the
Tableau Card Engine. The player commands a survey vessel at the edge of a volume
of space that is being edited out of existence, and each run is one attempt to
leave a record of what was there before the record, the charts and the crew's
memories go with it. The story is played, not read: the player resolves a
sequence of incident cards, and the order of play is decided by a **scene beat
sheet** — three acts, each split into scenes, each scene carrying one objective,
a hard clock budget, a success/partial/failure outcome and the route that
outcome opens into the next beat.

The design is **approach C with approach A inside it** and approach B's single
best idea as the tension dial. The beat sheet owns dramaturgy: acts, scenes,
objectives, budgets, outcomes and cross-scene routing. The existing
`@story-line` card chain owns every *incident*: the prose, the labelled options,
declarative costs, extras, conditional gates, seeded branch selection and the
journal. The card chain is the **body of a scene**, never a second story
engine — one choice model, one condition vocabulary, one resource projection,
one journal, one RNG.

Why this shape and not the alternatives is decided on measured evidence, not
taste ([§1.5](#15-approach-decision-a-vs-c)): under a pure card chain, 9 of 12
forks in the spike rejoin one beat later, Act III is entered on 0.63 beats per
run, the pressure clock silently deleted 12 of 138 routes instead of creating a
trade, and abandoning the voyage scored 79 against 83 for finishing. The GDD
keeps what the spike proved works — CSV authoring with row/column/reason
diagnostics, game-declared resources, seeded determinism, the journal-derived
epilogue and a Phaser-free logic module — and adds only the layer the evidence
says is missing: per-scene objectives, per-scene budgets, explicit outcomes and
a finalised loss ledger.

V1 content target, replayability and the deferred list are owned by
`CG-0MWPY2HJU006LJMU`; the engine work this design needs is owned by
`CG-0MWPY2ECE002P2NH`. Neither is a precondition for building the beat-sheet
layer described here.

---

## Table of Contents

1. [Core Rules and Mechanics](#1-core-rules-and-mechanics)
   - [1.1 Setting and tone](#11-setting-and-tone)
   - [1.2 Player role and the pitch](#12-player-role-and-the-pitch)
   - [1.3 The core loop](#13-the-core-loop)
   - [1.4 Worked walkthrough: act entry to scene outcome](#14-worked-walkthrough-act-entry-to-scene-outcome)
   - [1.5 Approach decision: A vs C](#15-approach-decision-a-vs-c)
2. [Content and Progression](#2-content-and-progression)
   - [2.1 Composition contract: who owns what](#21-composition-contract-who-owns-what)
   - [2.2 The scene beat-sheet data model](#22-the-scene-beat-sheet-data-model)
   - [2.3 How a scene outcome selects the next beat](#23-how-a-scene-outcome-selects-the-next-beat)
   - [2.4 How the beat sheet composes with `@story-line`](#24-how-the-beat-sheet-composes-with-story-line)
   - [2.5 A worked manifest excerpt](#25-a-worked-manifest-excerpt)
   - [2.6 Hypotheses and how they will be validated](#26-hypotheses-and-how-they-will-be-validated)
   - [2.7 Sections owned by downstream work items](#27-sections-owned-by-downstream-work-items)
   - [2.8 Resource model and economy](#28-resource-model-and-economy)
3. [UX, Visual Design and Audio Direction](#3-ux-visual-design-and-audio-direction)
4. [Glossary](#4-glossary)
5. [Test Plan](#5-test-plan)
6. [Engine-Gap Backlog](#6-engine-gap-backlog-todo)
7. [V1 Scope Statement and Deferred List](#7-v1-scope-statement-and-deferred-list-todo)
- [Appendix A: The episode manifest (complete worked example)](#appendix-a-the-episode-manifest-complete-worked-example)
- [Appendix B: Evidence base](#appendix-b-evidence-base)
- [Appendix C: Work-item map](#appendix-c-work-item-map)

---

## 1. Core Rules and Mechanics

### 1.1 Setting and tone

**Working setting (names pending the IP pass).** The survey vessel *Ashlight*
holds station at the edge of a volume of space that has stopped having happened.
The event has no monster and no fleet behind it: it is an *editing* event. Charts
that cross the boundary come back blank, the log records a volume that no
longer exists, and the crew's memories of a place survive the place itself. The
mechanism is the **Revision Loom**, a structure that is still turning past the
last reliable fix, and its intermediary is **Archivist Vane**, who is unfailingly
polite and who offers survival in exchange for one more revision of the world.
The player's run ends the way the event ends: with the timeline reset, the
voyage scored, and the journal as the only thing that survives. The player's
record is *the episode they made*.

The setting is original and is used at trope level only. No third-party
character, race, faction, vessel, technology or episode title appears in this
document or in the content it specifies; the prohibited-term checklist and the
final naming table belong to `CG-0MWPY2FV30041M48`.

**Tone contract.** The register is a **survey service incident log**, not a
military bridge. Four rules make that audible:

| Do | Do not |
|---|---|
| Write loss as record-keeping — a berth that never existed, a badge nobody mentions, a chart that stays blank | Write loss as battle damage or a body count |
| Let the antagonist stay procedural and polite; he never gloats and never explains the mechanism | Give the antagonist a monologue, a throne room or a personal grievance |
| Make the crew's competence the emotional register: they keep working, and that is the horror | Make the crew panicked, insubordinate or comic relief |
| End on the record: the epilogue is a filed account, distant and exact | End on a rescue, a victory or a moral pronouncement |

Prose budgets come from the engine, not from taste: `context` is budgeted at 400
characters per beat and `epilogue` at 600 characters per ending
([`PROSE_FIELD_SPECS`](../../src/story-line/content/prose.ts)), with over-budget
prose a warning rather than an error.

### 1.2 Player role and the pitch

**One paragraph.** You are the survey commander of the *Ashlight*, sent to
measure a volume that is being erased. Your instruments work; the thing they
measure does not persist. Each beat of the story is a card that states what just
happened and offers you two or three things you can do about it, with the cost
of each written plainly. What you spend — stores, hull, the crew's morale, the
core's charge, the goodwill of whoever is still listening — is not refunded when
the next scene opens. At the end of each scene the ship's record shows whether
you did what you came to do, and the next beat you face is the one that outcome
opened. At the end of the run the timeline resets, the survey is gone, and the
journal of what you chose is the only account of it; the epilogue scores that
account.

**The three questions the game asks each scene.** Every scene is authored to ask
one of them, and the objective vocabulary in [§2.2.5](#225-objective) is the
only way it is expressed:

1. *Can you afford this?* — a budget question (clock, and the resource cost of
   the beats you choose).
2. *Will you still have what you need when you get there?* — a preservation
   question (an objective that reads a declared resource at scene close).
3. *Who is still with you?* — an allegiance question (goodwill/morale read at
   scene close, which routes to different doors).

### 1.3 The core loop

The loop has four levels and one rule per level. Nothing below the beat level is
new engine work: it is `@story-line`.

```
act  ──>  scene  ──>  beat  ──>  option
 │          │          │           │
 │          │          │           └─ @story-line: label, cost, extra, #when, #says
 │          │          └─ a content card played inside the scene (clock cost, prose)
 │          └─ objective + clock budget + outcome rules + exit routes
 └─ ordered scenes; the route into the next scene is decided by the previous outcome
```

1. **Act** — an ordered group of scenes with one entry scene. Acts are the
   coarse narrative unit (the survey, the dead zone, the core) and the unit the
   score and the act banner read.
2. **Scene** — the unit of *dramaturgy*. A scene declares exactly one objective,
   one clock budget, an ordered set of beat cards, a total outcome table and a
   total exit routing table. The scene is what makes a run *take time*.
3. **Beat** — one card played inside the scene. Entering a beat charges its
   clock cost against the scene budget. The beat's options, costs, gates,
   conditional successors and prose are authored in the content CSV and resolved
   by `@story-line`, unchanged.
4. **Option** — a choice the player makes at a beat. It may cost resources,
   grant resources, gate on a condition and push the next card. This is the only
   choice model in the game.

**The rules that keep the loop from drifting.** Within a scene the chain runs
normally; when a choice pushes a beat that belongs to *another* scene (or an
ending), the scene closes, classifies its outcome and decides the route
([§2.3](#23-how-a-scene-outcome-selects-the-next-beat)). No other layer chooses
what comes next. No RNG is consumed by a scene close.

### 1.4 Worked walkthrough: act entry to scene outcome

One complete pass, using the worked manifest in
[Appendix A](#appendix-a-the-episode-manifest-complete-worked-example) and the
shipped spike content (`example-games/gym/content/long-erasure.csv`). Starting
bag: `hull 5, morale 5, stores 4, goodwill 0, charge 2`.

**Step 1 — Run entry.** The manifest's `start` is
`{ act: "act-i", scene: "s-i-open", beat: "le-i-open" }`. The run state is
created from `resources.declared` with the content's starting bag; the
irreversible set is `["hull"]`; the loss ledger and the scene history are empty.

**Step 2 — Scene entry.** Act I scene `s-i-open` ("The First Unwriting") opens:
scene clock is set to `budget.clock = 2`, and the current beat is the scene's
entry beat `le-i-open`.

**Step 3 — Beat entry.** `le-i-open` costs 1 → scene clock 2 → 1. The card's
`context` prose is presented, the scene banner names the objective ("End the
watch with the survey's stores intact") and the beat clock shows 1 of 2.

**Step 4 — Choice.** The card offers *Log the erasure* (`#cost=stores:1`) and
*Rally the survey crew* (`#extra=morale:1`). The player picks *Log the erasure*:
`@story-line` pays `stores 4 → 3`, writes its `#says` prose to the story-update
line and the journal, and pushes `le-i-log`.

**Step 5 — Beat entry and choice inside the same scene.** `le-i-log` costs 1 →
scene clock 1 → 0. Its options are *Transmit the warning*
(`#cost=charge:1#extra=goodwill:2`) and *Stay silent*. The player transmits:
`charge 2 → 1`, `goodwill 0 → 2`, and the pushed card is `le-i-transmit`.

**Step 6 — Scene close is triggered by the boundary.** `le-i-transmit` is not a
beat of `s-i-open` (it belongs to `s-i-answer`), so the scene closes:

| Step | What happens | Value |
|---|---|---|
| 6a | Objective check `stores >= 3` against post-resolution resources | `3 >= 3` → **met** |
| 6b | Outcome rules, first match: `survey-held` (`when: {objective: "met"}`) | `success` |
| 6c | Loss rules for `success` | none authored |
| 6d | Exit routes, first match: `honour-the-door` (`on: "success"`, `to: {kind: "chain"}`) | target = pushed card `le-i-transmit` |
| 6e | Scene clock had reached 0 without refusing a beat | `budget` is **intact** (not exhausted) |

The transcript records one `scene-exit` entry: scene `s-i-open`, objective met,
outcome `success`, clock spent 2, rule `survey-held`, route `honour-the-door`,
next beat `le-i-transmit`.

**Step 7 — Next scene entry.** `le-i-transmit` is a beat of Act I scene
`s-i-answer`, so that scene opens with a fresh budget of 2 and the pushed card as
its (non-default) entry beat. The run has now used both of Act I's scenes; the
act does not hold a budget of its own — the scenes do.

**Step 8 — Second scene outcome.** `le-i-transmit` costs 2 → clock 0. The player
chooses *Shelter in the dead zone* (no cost), pushing `le-ii-shelter`. The scene
closes: objective `goodwill >= 1` is met (`2 >= 1`) → `success` → route
`follow-the-door` → `chain` → Act II scene `s-ii-shelter` opens at its entry beat
`le-ii-shelter`. Act II is where the hull can actually be spent.

**The counter-example that matters.** The same rule set turns the spike's
measured *silent deletion* into an explicit outcome. A run that reaches Act III
at `le-iii-ahead` (cost 3 of its scene's budget 5) and chooses *Set the charge*
asks for `le-iii-approach`, which costs 3 against 2 remaining. The beat is
**refused**, the `watch-spent` outcome rule classifies the scene `failure`, the
hull loss rule `hull-sacrificed` applies one point through the engine's resource
seam, and the `quiet-core` route plays the *A Quiet Chart* ending instead of
leaving the player with no ending at all. The spike recorded twelve routes
expiring on exactly this boundary with no ending card; the beat-sheet model
makes the same arithmetic a stated consequence with a named route.

### 1.5 Approach decision: A vs C

**Recommendation (explicit): build the full game as approach C, with approach
A's card chain as the incident layer inside each scene, and approach B's
irreversible loss as the tension dial.** This document is C-shaped throughout:
the beat sheet owns objectives, budgets, outcomes and routing
([§2.2](#22-the-scene-beat-sheet-data-model)); the chain is never asked to carry
act structure, and the beat sheet is never asked to carry prose, choice or
resource arithmetic ([§2.1](#21-composition-contract-who-owns-what)).

| | A: episode-as-deck | B: tableau-as-timeline | C: scene beat sheet |
|---|---|---|---|
| Where the story lives | the card chain | board state | act → scene structure |
| What this design keeps | **everything below the scene**: prose, options, costs, gates, journal, CSV authoring, seeded determinism | **one idea**: irreversible loss as the tension dial | **the loop**: objective, budget, outcome, route |
| Measured failure mode | slideshow | unrecognisable episode | two systems drifting |

**Why A alone is rejected — measured, not asserted.**

- Nine of twelve authored forks rejoin **one beat later**; the only
  never-rejoining choice is which ending card you stop on. Depth-1 visibility
  looked healthy (98.1% of decisions reached a different next beat) while the
  run still read as a menu.
- Act III is entered on **0.63 beats per run** across 160 policy runs: it is an
  ending selector, not an act.
- The pressure clock prunes rather than trades: **12 of 138 routes expire**, all
  on entry to an Act III beat, and the affordability gate hides **10.6%** of
  authored options — the weakest player sees the fewest endings.
- Abandoning the voyage scores **79**, against **83** for finishing the arc.

**Why C alone is rejected.** A scene layer built from scratch would discard the
part of the spike that already works: a writer added a complete branch — a new
card, a new option with cost, extra and a conditional successor — in **≈ 8 s of
tool time with no TypeScript**, validated, graphed and played. C's own named
failure mode (the beat sheet and the card chain drifting apart) is answered by
the composition contract in [§2.1](#21-composition-contract-who-owns-what): one
choice model, one condition vocabulary, one prose store, one journal, one RNG,
and every field owned by exactly one layer.

**What would falsify the recommendation.** Two revisit triggers, both testable
in a vertical slice rather than argued: (a) if scene outcomes have to override
the player's authored successor on most exits, the scene layer is fighting the
chain and the boundary is drawn wrong; (b) if the beat-sheet layer cannot be
built without re-reading or re-implementing the content `options` cell, the
composition contract has failed ([§2.6](#26-hypotheses-and-how-they-will-be-validated),
H1 and H4). The evidence also recommends **one human browser playtest before
the act structure is frozen**; none of the numbers above depend on it.

---

## 2. Content and Progression

### 2.1 Composition contract: who owns what

The contract has one sentence: **the card chain is the incident layer inside a
scene, and no field, rule or content column duplicates a `@story-line`
responsibility.** The table below is the audit of that sentence.

| Concern | Owner | Lives in | Invariant |
|---|---|---|---|
| Act membership, scene membership, scene order | **Beat sheet** | episode manifest | the manifest assigns every choice card of the episode to exactly one scene (or to `endings`) |
| Scene objective, clock budget, outcome rules, exit routes, loss rules | **Beat sheet** | episode manifest | one objective and one total outcome table per scene; total route table; no RNG |
| Beat clock cost | **Beat sheet** | `beat.clockCost` | see the retirement note below |
| Endings set | **Beat sheet** | `endings[]` | fed to the route-space guard as its `--endings` argument |
| Labelled options, successors, `#cost`, `#extra`, `#when`, `#says` | **`@story-line`** | content CSV `options` cell | the beat sheet never declares, parses or re-orders an option list |
| Resource values, cost payment, extra effects, declared key set | **`@story-line`** | `createResourceProjection` + engine adapter | the beat sheet applies its loss rules through `applyResourceDelta` and does no arithmetic of its own |
| Prose (`context`, `#says`, `epilogue`) and prose budgets | **`@story-line`** | content CSV prose columns | the beat sheet stores no narrative prose and rewrites none |
| Journal and activity log | **`@story-line`** | adapter activity log + `buildJournal` | the beat sheet appends `scene-exit` lines through `appendLog`; the journal still derives from the log |
| Intra-scene successor selection and its precedence | **`@story-line`** | `resolveStorylineOption` | the beat sheet reads `StorylineResolution.pushedCard`; it never resolves a successor itself |
| Cross-scene routing | **Beat sheet** | `scene.routes` | the only authority on which scene opens next |
| Determinism | **both, disjointly** | seeded `rng()` in `@story-line` | a scene close consumes no RNG; every draw is a `@story-line` candidate draw |
| Content validation and the route-space guard | **`@story-line` content** | `storylines:validate`, `storylines:guard` | the manifest is validated by the new `validateEpisodeManifest` (gap), not by a second content validator |
| Manifest validation | **Beat sheet** | *(gap)* | the backlog entry; rules listed in [§2.4](#24-how-the-beat-sheet-composes-with-story-line) |

**What moves out of the CSV.** Two columns in the spike's content file are
beat-sheet data written in the wrong place, and v1 retires them:

| Spike column | Why it moves | v1 home |
|---|---|---|
| `act` | act membership is dramaturgy, and a per-row label cannot be validated against a structure | `scene.id` under `act.scenes` |
| `clockCost` | pacing belongs to the scene that owns the budget; the spike's value is a per-card override with no scene to spend against | `beat.clockCost` |

Until the beat-sheet layer lands, the spike keeps those columns and they are the
`GymLongErasureGame` rule implementation's input. The manifest validator must
reject a manifest whose beat clock cost disagrees with the legacy column while
both exist (`clock-cost-mismatch`); the build epic removes the column once the
beat sheet is the only reader.

**Three deliberate non-duplications.** The beat sheet must never grow: (a) a
second condition language — it reuses `@story-line`'s `Condition` shape
(`{field, op, value}` over declared resource keys, operators
`>= <= > < ==`); (b) a second choice model — a beat is a card, not a
`BeatOption`; (c) a second prose store — the scene banner shows the objective's
`statement` (one line, ≤ 90 characters, validated), and every other word the
player reads comes from the content CSV.

**One deliberate duplication, named.** The declared resource set exists twice:
per card in the CSV `resources` column (an engine friction the spike measured —
every row repeats the full set) and once in `manifest.resources.declared`
(the beat sheet needs it to validate conditions and loss rules statically). The
manifest validator enforces equality (`resource-set-mismatch`), and the
one-declaration-per-file fix is the content pipeline's known limit, owned by
`CG-0MWPY29730011FJ4`.

### 2.2 The scene beat-sheet data model

The beat sheet is **pure data**, authored as one JSON **episode manifest** per
episode — the same authoring shape as the project's Screen Layout Language
layout files, and validated by the same pattern (schema + a pure validator that
never throws). It carries no timestamps and no derived state, so a deterministic
serialiser makes two serialisations of the same manifest byte-identical and a
`--check`-style drift guard possible from day one.

**Who authors what.** A *writer* adds prose, options, costs and gates to the
CSV and never touches the manifest. A *designer* adds or rewires scenes, beats,
objectives, budgets and routes in the manifest and never touches the CSV except
to reuse a card id. A branch inside a scene is a writer-only change; a new scene
is a designer change. That division is the practical reason the two layers stay
separate.

#### 2.2.1 Episode manifest

| Field | Type | Required | Meaning |
|---|---|---|---|
| `manifestVersion` | `1` | required | literal schema version; a mismatched version is refused, never coerced |
| `id` | `string` | required | stable episode id, `^[a-z0-9][a-z0-9-]*$`, unique in the distribution |
| `title` | `string` | required | player-facing episode title |
| `content` | `{ adapter: string; file: string }` | required | the content adapter id and repo-relative CSV path the beats resolve in |
| `resources` | `{ declared: string[]; irreversible: string[] }` | required | declared key set (must equal the content file's) and the subset the beat sheet never restores |
| `start` | `{ act: string; scene: string; beat: string }` | required | run entry point |
| `endings` | `string[]` | required | content card ids that finish a run; non-empty, unique; fed to the route-space guard |
| `acts` | `Act[]` | required | non-empty, ordered by `order` |
| `notes` | `string` | optional | reviewer-facing design notes; ignored at runtime |

#### 2.2.2 Act

| Field | Type | Required | Meaning |
|---|---|---|---|
| `id` | `string` | required | unique, same pattern as the episode id |
| `title` | `string` | required | act banner text |
| `order` | `integer ≥ 1` | required | unique; the only ordering authority (array order is not play order) |
| `entryScene` | `string` | required | scene id inside this act that a run enters by default |
| `scenes` | `Scene[]` | required | non-empty |
| `notes` | `string` | optional | reviewer-facing |

An act has **no budget of its own**. The evidence's "give Act III a budget" is
served by scene budgets; an act-wide clock would reintroduce the silent
branch-delete the model exists to remove. Act length is a *count* (scenes,
beats), enforced by the scope statement and by pacing review, not by a counter.

#### 2.2.3 Scene

| Field | Type | Required | Meaning |
|---|---|---|---|
| `id` | `string` | required | unique across the episode |
| `title` | `string` | required | scene banner text |
| `objective` | `Objective` | required | exactly one; evaluated once at scene close |
| `budget` | `{ clock: integer ≥ 1 }` | required | clock ticks available in this scene; reset per scene entry, never carried |
| `entryBeat` | `string` | required | a `cardId` in `beats`; the default first beat |
| `beats` | `Beat[]` | required | non-empty; the scene's beat set, and therefore its boundary |
| `outcomeRules` | `OutcomeRule[]` | required | ordered, first match wins; the last rule must be unconditional |
| `routes` | `SceneRoute[]` | required | ordered, first match wins; must cover all three outcomes or end with `on: "*"`; the last route must be unconditional |
| `losses` | `LossRule[]` | optional (default `[]`) | additional irreversible losses applied at close, per outcome |
| `notes` | `string` | optional | reviewer-facing |

The **beat set is the scene boundary**. A choice that pushes a card inside the
set continues the scene; a choice that pushes a card outside it (a beat of
another scene, or an ending) closes the scene. A scene may be entered at a beat
that is not its `entryBeat` — this is how a `chain` route honours the card the
player's choice actually reached — and entering later still costs the entered
beat normally.

#### 2.2.4 Beat

| Field | Type | Required | Meaning |
|---|---|---|---|
| `cardId` | `string` | required | content card id; **the beat's identity** and unique across the episode |
| `clockCost` | `integer ≥ 0` | required | ticks charged when the beat is entered |
| `note` | `string` | optional | reviewer-facing; ignored at runtime |

A beat has **no id of its own**, no options, no costs and no prose of its own:
all of that is the card's. Beat identity being the card id is what makes the
manifest checkable against the content file — a beat cannot silently drift from
its card, and a card cannot appear in two scenes.

#### 2.2.5 Objective

| Field | Type | Required | Meaning |
|---|---|---|---|
| `statement` | `string` | required | player-facing, imperative, ≤ 90 characters (validated) |
| `check` | `{ field: string; op: '>=' \| '<=' \| '>' \| '<' \| '=='; value: number }` | required | evaluated once, at close, against post-resolution resources |

`check.field` must be a declared resource key. This is deliberately the *same*
condition shape `@story-line` uses, so a writer learns one vocabulary. A
resource that is absent reads as `0`, exactly as in `@story-line`; an
undeclared field is a manifest validation error, never a silent zero.

The objective is **one line of intent plus one measurable check**. It is not a
second rules engine: no time limits, no multi-clause objectives, no objectives
that are evaluated mid-scene. Scenes that need more than that are two scenes.

#### 2.2.6 Outcome rules

| Field | Type | Required | Meaning |
|---|---|---|---|
| `id` | `string` | required | unique within the scene; recorded in the transcript |
| `when` | `SceneCondition` | optional | absent only on the final catch-all rule |
| `outcome` | `'success' \| 'partial' \| 'failure'` | required | classification when the rule matches |

`SceneCondition` is one of:

| Form | Meaning |
|---|---|
| `{ objective: "met" \| "unmet" }` | the scene objective's check |
| `{ budget: "exhausted" \| "intact" }` | whether a beat was refused for want of clock |
| `{ field: string; op: …; value: number }` | a raw declared-resource check, same shape and operators as `@story-line` |

#### 2.2.7 Routes and route targets

| Field | Type | Required | Meaning |
|---|---|---|---|
| `id` | `string` | required | unique within the scene; recorded in the transcript |
| `on` | `'success' \| 'partial' \| 'failure' \| '*'` | required | which outcome this route serves |
| `when` | `SceneCondition` | optional | additional gate; evaluated after `on` |
| `to` | `RouteTarget` | required | the door this route opens |

| `RouteTarget` | Shape | Meaning |
|---|---|---|
| chain | `{ kind: "chain" }` | continue to the card the player's choice pushed; skipped when the chain ended instead of pushing a card |
| beat | `{ kind: "beat"; act: string; scene: string; beat?: string }` | open the named scene at the named beat, or at its `entryBeat` when `beat` is omitted |
| ending | `{ kind: "ending"; cardId: string }` | play the named ending card and close the run |

There is **no `retry` target kind in v1**. Failure recovery is authored as an
ordinary route into a recovery scene, which keeps the routing surface at three
kinds and makes a retry the tension designer's content decision rather than a
modelling special case.

**Authored convention (validated by review, not by schema):** the `chain` route
is the default, and an explicit target is authored only for a *consequence* (a
failure or partial door) or for an act entry. A route may therefore override the
player's choice, but it must be a consequence the scene-exit banner names. If a
scene routinely overrides success exits, the boundary is drawn wrong — that is
falsification trigger (a) in [§1.5](#15-approach-decision-a-vs-c).

#### 2.2.8 Loss rules

| Field | Type | Required | Meaning |
|---|---|---|---|
| `id` | `string` | required | unique within the scene; recorded in the transcript and the ledger |
| `on` | `'success' \| 'partial' \| 'failure'` | required | the outcome that triggers the loss |
| `field` | `string` | required | must be in `resources.irreversible` (validated) |
| `amount` | `integer ≥ 1` | required | points removed |
| `statement` | `string` | required | player-facing line for the loss ledger and the journal |

**How irreversible loss actually works — the ledger, not a second resource
path.** The beat sheet keeps a **loss ledger** and applies every rule through
the *same* engine seam `@story-line` uses for costs and extras
(`storyline.engine.applyResourceDelta`); it performs no arithmetic of its own.
The ledger has two sources:

1. **Chain losses** — after each beat resolution the beat sheet diffs
   `engine.getResources` before and after for the irreversible keys; a negative
   net change is recorded as `{ kind: "chain", sceneId, beatId, field, delta }`.
   The player's choice spent it, and the ledger saw it.
2. **Rule losses** — each matching `LossRule` at scene close is applied through
   the seam and recorded as
   `{ kind: "rule", sceneId, ruleId, field, delta, statement }`.

Irreversible keys are never reset, topped up or compensated by the beat sheet at
scene entry or scene exit; the loss ledger and the journal are what survive the
reset ending. What that is worth *to the score* is the reset-ending scoring
model's job (`CG-0MWPY2AZX001UI2A`), which reads the ledger rather than
re-deriving losses from the log.

#### 2.2.9 The typed shape

```ts
export type SceneOutcome = 'success' | 'partial' | 'failure';

export type SceneCondition =
  | { objective: 'met' | 'unmet' }
  | { budget: 'exhausted' | 'intact' }
  | { field: string; op: '>=' | '<=' | '>' | '<' | '=='; value: number };

export interface EpisodeManifest {
  manifestVersion: 1;
  id: string;
  title: string;
  content: { adapter: string; file: string };
  resources: { declared: string[]; irreversible: string[] };
  start: { act: string; scene: string; beat: string };
  endings: string[];
  acts: Act[];
  notes?: string;
}

export interface Act {
  id: string;
  title: string;
  order: number;          // integer >= 1, unique
  entryScene: string;
  scenes: Scene[];
  notes?: string;
}

export interface Scene {
  id: string;
  title: string;
  objective: Objective;
  budget: { clock: number };   // integer >= 1
  entryBeat: string;
  beats: Beat[];
  outcomeRules: OutcomeRule[];
  routes: SceneRoute[];
  losses?: LossRule[];
  notes?: string;
}

export interface Beat {
  cardId: string;              // identity + CSV card id, unique in the episode
  clockCost: number;           // integer >= 0
  note?: string;
}

export interface Objective {
  statement: string;           // <= 90 characters
  check: { field: string; op: '>=' | '<=' | '>' | '<' | '=='; value: number };
}

export interface OutcomeRule {
  id: string;
  when?: SceneCondition;       // absent only on the final catch-all
  outcome: SceneOutcome;
}

export type RouteTarget =
  | { kind: 'chain' }
  | { kind: 'beat'; act: string; scene: string; beat?: string }
  | { kind: 'ending'; cardId: string };

export interface SceneRoute {
  id: string;
  on: SceneOutcome | '*';
  when?: SceneCondition;
  to: RouteTarget;
}

export interface LossRule {
  id: string;
  on: SceneOutcome;
  field: string;               // must be in resources.irreversible
  amount: number;              // integer >= 1
  statement: string;
}
```

### 2.3 How a scene outcome selects the next beat

This is the whole routing contract, in order. Each numbered step is a pure
function of the run state; none consumes RNG. The build epic must implement it
exactly once, in one module, and every step below is an acceptance test.

**A. Beat entry**

1. Read the beat's `clockCost`.
2. If `clockCost > sceneClockRemaining`, the beat is **refused**: it is not
   played, its options are never presented, and the scene closes with reason
   `budget-exhausted`.
3. Otherwise charge the cost (`sceneClockRemaining -= clockCost`), present the
   card's `context` prose and the scene banner, gate the content options with
   `isOptionAffordable` over the declared keys, and present the surviving
   options. A cost exactly equal to the remaining clock is affordable: spending
   the last tick on the last beat is a legal, authored climax, not a failure.

**B. Choice resolution**

4. The player's option resolves through `@story-line` unchanged: effect,
   cost payment, extra effect, `pushedCard`, outcome prose, journal and log.
5. Classify `pushedCard`:
   - **in-scene beat** → go to A with that beat;
   - **out-of-scene beat** (a beat of another scene) → close the scene with
     `pendingChain = pushedCard`;
   - **ending card** → close the scene with `pendingChain = pushedCard`;
   - **none** (terminal option or chain end) → close the scene with
     `pendingChain = null`.

   A pushed card that is neither an assigned beat nor a declared ending is a
   content defect, not a modelling gap: the content validator already rejects an
   unknown successor, and the manifest validator rejects an assigned-card gap
   ([§2.4](#24-how-the-beat-sheet-composes-with-story-line)).

**C. Scene close**

6. Evaluate the objective: `check` against `engine.getResources(state)` after
   the resolving choice. Record `objectiveMet: boolean`.
7. Classify the outcome, first match wins — **this order is the contract**:
   1. the first `outcomeRule` whose `when` matches. `when` is evaluated against
      the post-resolution resources, `objectiveMet` and `budgetExhausted`;
   2. the last rule is unconditional by validation, so the function is total.

   A refused beat sets `budgetExhausted = true` and closes the scene. The
   authored convention is that a scene which *can* exhaust its budget states
   that case in an outcome rule placed before its catch-all (the fragment's
   `watch-spent` rule in `s-iii-core`), and the scene-space guard asserts the
   invariant **no exhausted close classifies as `success`**. The outcome is not
   hard-coded to `failure`: running out of watch on a scene you had already
   achieved may legitimately be a `partial`, and the authored table is where
   that judgement belongs.
8. Apply the matching `losses` rules through `engine.applyResourceDelta`, in
   declaration order, recording each in the loss ledger and appending one
   activity-log line per rule (`statement` plus the signed amount and key).
9. Select the route: iterate `routes` in declaration order and take the first
   route where
   - `on === "*"` or `on === outcome`, **and**
   - `when` is absent or matches, **and**
   - the route is not `{kind:"chain"}` while `pendingChain === null`.
10. Resolve the target into the next action:
    - `chain` → the next beat is `pendingChain` (a beat of another scene, or an
      ending card);
    - `beat` → the next beat is `target.beat ?? target.scene.entryBeat`;
    - `ending` → play the ending card, present its `epilogue` prose, and close
      the run (a terminal option on an ending card is the post-ending action;
      `le-end-reset`'s *Begin the survey again* restarts the run at `start`).
11. Append one `scene-exit` transcript record:
    `{ sceneId, objectiveMet, outcome, ruleId, routeId, clockSpent, clockRemaining, budgetExhausted, nextBeat }`.
12. Enter the target scene: reset `sceneClockRemaining` to that scene's
    `budget.clock`, push the scene id onto the scene history, and clear
    `pendingChain`. Irreversible keys are **not** restored.

**D. What the player sees at the boundary.** The scene-exit banner names four
things and no more: the objective and whether it was met, the clock spent against
the budget, the outcome word, and the door it opened ("You kept the survey's
stores. *The Answering Silence* — the warning goes out and nothing answers.").
The presentation contract (SLL zones, depth, audio) is owned by
`CG-0MWPY2CHF003AHE1`; the data it renders is exactly the `scene-exit` record
above, which is why the banner cannot disagree with the routing.

### 2.4 How the beat sheet composes with `@story-line`

**Runtime composition.** The beat-sheet layer is constructed *around* a
`StorylineSystem`, not beside it:

```ts
const storyline = createStorylineSystem<VoyageState, ContentCard>({ engine, ui });
const beatSheet = createEpisodeRunner({
  manifest,                    // EpisodeManifest
  storyline,                   // the ONE choice model, resource projection and RNG
  content: cardsById,          // cardsFromCsv(parseCsv(csv), adapter)
  clock: episodeClock,         // scene budget bookkeeping (new; no resource arithmetic)
  ledger: lossLedger,          // observations of engine.getResources deltas
});
```

The runner calls only public `@story-line` surface: `getStorylineOptions` (or the
content-compiled list plus `isOptionAffordable`), `resolveStorylineOption`
(reading `pushedCard`), `engine.getResources`, `engine.applyResourceDelta`,
`engine.appendLog`, `buildJournal` and `buildEpilogue`. It never re-reads the
`options` cell, never re-implements successor precedence and never carries a
second copy of the declared key set at runtime (it reads `storyline.resources`
and validates the manifest's copy against it).

**Static composition.** Two validators exist at this commit, one per layer; the third is
the gap this design creates:

| Checker | Covers | Command |
|---|---|---|
| Content validator | well-formedness of the CSV: ids, options encoding, unknown successors, prose budgets, declared resource keys | `npm run storylines:validate` |
| Route-space guard | playability of the chain: every gated branch survivable, every ending reachable, every consequential choice meets the minimum rejoin distance | `npm run storylines:guard` |
| Manifest validator *(gap, build epic)* | totality and consistency of the beat sheet (below) | `npm run storylines:manifest` *(proposed)* |

The rejoin-distance *number* is pacing design, not structure: the evidence
recommends **3** for choices marked consequential (the current committed guard
configuration uses 2), and the tension design (`CG-0MWPY2AZX001UI2A`) owns
raising it.

The manifest validator's rules — the contract the build epic implements, and the
list this document is written against:

| Code | Rule |
|---|---|
| `duplicate-act`, `duplicate-scene`, `duplicate-beat` | ids unique in their scope; beat identity is the card id, unique across the episode |
| `unknown-card` | every `cardId`, `start.beat`, `endings[]` and `beat` route target resolves in the bound content file |
| `unknown-scene`, `unknown-act` | `entryScene`, `entryBeat`, `act.entryScene` and scene/act targets resolve |
| `unassigned-card` | every choice card of the episode's storyline in the content file is a beat or an ending — no orphan content |
| `dangling-chain` | a scene with a `chain` route has every beat successor resolving to an assigned beat or an ending, so the chain route can never target nothing |
| `non-total-routes` | routes cover all three outcomes or end with `on: "*"`; the last route is unconditional |
| `non-total-outcome-rules` | the last outcome rule is unconditional |
| `objective-invalid` | `statement` present and ≤ 90 characters; `check.field` is declared |
| `loss-not-irreversible` | every loss rule's `field` is in `resources.irreversible` |
| `numeric-invalid` | `budget.clock ≥ 1`, `clockCost ≥ 0`, `amount ≥ 1` |
| `resource-set-mismatch` | `resources.declared` equals the content file's declared set |
| `clock-cost-mismatch` | *(migration only)* `beat.clockCost` agrees with the legacy CSV `clockCost` cell until the column is retired |
| `ending-successor` | an ending card's successors, if any, resolve to assigned beats (the reset loop) or are absent |

The beat sheet needs a **third** check the content guard cannot perform, because
the clock is not a declared resource: a **scene-space guard** that enumerates
scene exits and beat refusals and asserts two invariants — *no exhausted close
classifies as `success`*, and *no refusal leads to a state with no reachable
ending*. It is a gap ([§6](#6-engine-gap-backlog-todo) item 3); until it exists,
the worked manifest's clock arithmetic is checked by hand
([Appendix A](#appendix-a-the-episode-manifest-complete-worked-example)).

**What the layer adds to the engine, and what it must not.** Three capabilities
are genuinely new: scene budget bookkeeping, outcome classification + routing,
and the loss ledger. Everything else is composition. The engine-gap backlog
(`CG-0MWPY2ECE002P2NH`) carries the formal entries, effort bands and issue
types; this document's job is that each entry is named against a module a
reviewer can open — `src/story-line/compile.ts` (resolution to read),
`src/story-line/resources.ts` (the projection the ledger observes),
`src/story-line/content/guard.ts` (the enumeration the scene-space guard will
extend) and `src/story-line/content/manifest.ts` (the deterministic-artefact
pattern the manifest validator should copy).

**Save/load, transcript and replay.** The runner's run state is the scene id,
the current beat card id, the scene clock, the scene history, the route history
and the loss ledger — plus whatever `@story-line` already serialises. It is
serialised through `serializeWithVersion` with its own version field, and a
version mismatch is a refusal, not a best-effort load. Replaying the transcript
must reproduce the same scene exits, outcomes, routes and score with no re-draw:
the only RNG in the system is the seeded `@story-line` candidate draw. The full
expectations table is owned by `CG-0MWPY2CHF003AHE1`.

### 2.5 A worked manifest excerpt

One scene from the worked episode (its two beats and every field around them),
verbatim from
[Appendix A](#appendix-a-the-episode-manifest-complete-worked-example), chosen
because it shows every field the model needs in one place:

```json
{
  "id": "s-iii-core",
  "title": "The Core",
  "objective": {
    "statement": "Reach the core with the crew still behind you.",
    "check": { "field": "morale", "op": ">=", "value": 4 }
  },
  "budget": { "clock": 5 },
  "entryBeat": "le-iii-approach",
  "beats": [
    { "cardId": "le-iii-approach", "clockCost": 3 },
    {
      "cardId": "le-iii-ahead",
      "clockCost": 3,
      "note": "Entering here leaves 2 of 5; 'Set the charge' needs 3, so this is the scene's deliberate cliff."
    }
  ],
  "outcomeRules": [
    { "id": "watch-spent", "when": { "budget": "exhausted" }, "outcome": "failure" },
    { "id": "crew-with-you", "when": { "objective": "met" }, "outcome": "success" },
    { "id": "crew-gone", "outcome": "partial" }
  ],
  "routes": [
    { "id": "choose-the-ending", "on": "success", "to": { "kind": "chain" } },
    { "id": "quiet-core", "on": "*", "to": { "kind": "ending", "cardId": "le-end-quiet" } }
  ],
  "losses": [
    {
      "id": "hull-sacrificed",
      "on": "failure",
      "field": "hull",
      "amount": 1,
      "statement": "Breaking for the core on the last of the watch costs the hull."
    }
  ]
}
```

Read it as the three questions of [§1.2](#12-player-role-and-the-pitch): the
objective asks *who is still with you*, the budget asks *can you afford the
next beat*, and the routes answer *which door your answer opens*. The `note`
records the arithmetic for a reviewer without affecting play.

### 2.6 Hypotheses and how they will be validated

Everything in this section is **design, not proof**. Each row below is a
hypothesis with a named validation method and the work item that will run it,
because the beat-sheet layer has no implementation at this commit.

| # | Hypothesis | Status | Validation method | Owner |
|---|---|---|---|---|
| H1 | Scene outcomes read as consequence rather than as an arbitrary override | **unproven** | vertical slice: enumerate every scene exit per route; measure how often an exit is overridden and whether the banner makes it predictable; falsification trigger (a) in [§1.5](#15-approach-decision-a-vs-c) | build epic (`CG-0MWPY2ECE002P2NH`) |
| H2 | Per-scene budgets create a visible trade instead of a silent branch filter | **unproven**; the spike measured the *failure* of the containerless clock (12/138 routes expired, all on one boundary) | extend the route-space enumeration over the manifest: no beat refusal may lead to a state with no ending; every refusal must route; measure refusals per run and happy-path clock slack | tension design (`CG-0MWPY2AZX001UI2A`) |
| H3 | Irreversible loss (hull) + the ledger make loss visible and unrefunded | **unproven**; the spike measured the opposite (loss refunded by the loop; depleted players saw *fewer* options) | replay two runs with different hull outcomes and diff the epilogue; assert the ledger is never restored and the epilogue names each ledger line; scoring bands must separate abandon from finish | tension design (`CG-0MWPY2AZX001UI2A`) |
| H4 | The composition contract holds — no second choice model, condition language, prose store or RNG | **unproven** (no implementation) | import-boundary test: the beat-sheet module imports only `@story-line` public surface; a content-column test asserts the CSV gains no beat-sheet column; a manifest test asserts `resources.declared` equals the content set | build epic |
| H5 | Five scenes / fifteen beats / five to seven exits is enough structure to fill a v1 act-shaped game without authoring a hub-and-spoke fan | **unproven** | scope the content volume from this shape and compare with the spike's 19-beat file; measure designer hours per scene against the writer's ≈ 8 s branch | scope (`CG-0MWPY2HJU006LJMU`) |
| H6 | The scene boundary is the right line between designer and writer work | **unproven** | author one new scene and one new in-scene branch end to end during the vertical slice; record which file each needed | content pipeline (`CG-0MWPY29730011FJ4`) |

Two further evidence limits are carried forward rather than resolved here: the
spike and the evaluation are **agent-driven structural measurements**, not human
playtests, and the recommendation is to run one human browser playtest — ideally
three people, at least one who has not read the content — before the act
structure is frozen. Nothing in sections 1–2 depends on that playtest; several
claims would be strengthened by it.

### 2.7 Sections owned by downstream work items

The following sections of this GDD were stubs by design. Each names the work item
that owns it, so a reviewer can see the whole document's shape and no section is
silently forgotten. The resource model is now written
([§2.8](#28-resource-model-and-economy)); the rest remain stubs.

| Section | Contents it must add | Owner |
|---|---|---|
| Resource model and economy | **Written — [§2.8](#28-resource-model-and-economy)**: named key set, ranges, starting values, sources/sinks, each key's failure state and recovery, one worked trade per act, named engine gaps | `CG-0MWPY27EU008QPHN` |
| Writer content pipeline | exact CSV columns, two worked rows, validator/editor/review gate, malformed-entry behaviour, the spike's five frictions | `CG-0MWPY29730011FJ4` |
| Tension, pacing, failure and reset-ending scoring | clock as a visible budget with a recovery path, irreversible-loss mechanism, numeric pacing rules, failure/recovery per type, scoring inputs/weights/bands, earned-vs-punitive justification | `CG-0MWPY2AZX001UI2A` |
| Presentation contract | SLL zone names, overlay behaviour, audio/SFX mapping, accessibility, determinism/save-load/transcript/replay expectations | `CG-0MWPY2CHF003AHE1` |
| Glossary proper nouns and prohibited-term gate | final names with rationale, prohibited-term scan of this document, trademark sanity read | `CG-0MWPY2FV30041M48` |
| Engine-gap backlog | every missing capability with unlock, module reference, effort band, issue type | `CG-0MWPY2ECE002P2NH` |
| V1 scope and deferred list | act/scene/beat/branch counts, playtime, word budget, replayability, deferrals | `CG-0MWPY2HJU006LJMU` |
| Integration and review close-out | developer-guide link, reciprocal links, re-run verification at the final commit | `CG-0MWPY2JEU006DYUL` |

---

### 2.8 Resource model and economy

> **Written by `CG-0MWPY27EU008QPHN`.** This section replaces the stub listed in
> [§2.7](#27-sections-owned-by-downstream-work-items). The **shape** of the model
> is fixed here; the **numbers** are the spike's measured values carried as the v1
> baseline, and re-tuning them is the tension design's job
> (`CG-0MWPY2AZX001UI2A`). Any re-tune must keep the rules in
> [§2.8.2](#282-per-key-contract) and [§2.8.3](#283-the-economy-by-act), and must
> not need a vocabulary this section marks as a gap.

The economy has one governing rule: **a resource exists only if it has a sink, a
source and a gate that reads it.** A key with no sink is a score; a key with no
source is a countdown; a key no gate reads is decoration. The spike's own
measurement of the failure mode is the reason for the rule — of 302 authored
option instances, the affordability gate silently removed **32 (10.6 %)** across
the playable state space, and `107 of 197` dead turns in the 160-run sample were
*written choices the bag removed*
([evaluation §3–4](./storyline-playtest-evaluation.md#4-pacing-measured-numerically)).
That is an economy that computes without being felt. v1 spends its five keys so
that each act's best choice and its objective are in conflict.

**Every statement below is expressed in the vocabulary the engine supports
at this commit**: a `createResourceProjection` field map is the declaration (`hull`,
`morale`, `stores`, `goodwill`, `charge` in that order), the content's `#cost` /
`#extra` / `#when` option attributes are the only place a number is authored, and
the beat-sheet manifest's `objective.check` reuses the same single-field
`Condition` shape. Where the engine has no carrier for part of the model, the gap
is named in [§2.8.6](#286-what-the-engine-cannot-express-at-this-commit-named-gaps) and
points at the backlog, never assumed away.

#### 2.8.1 The v1 declared set, and what is deliberately not in it

| Key | Role in one phrase | Why it is in the v1 set (evidence, not taste) |
|---|---|---|
| `hull` | **The irreversible dial** — what the voyage permanently costs | The only key the shipped content never grants, and the only one the evaluation measured visibly degrading (R2 and R4: `5 → 2`, "the largest loss of any recorded run"). It exists to make loss *unrefunded*, which the spike showed the loop otherwise refunds ([evaluation §3](./storyline-playtest-evaluation.md#was-irreversibility-missed)). |
| `morale` | **The crew's consent** — whether they are still with you | Read by the Act III worked objective (`morale >= 4`); granted by four authored options and spent by two. The spike's Act III is entered on 0.63 beats per run, so the one thing that must be legible on entry is who is still aboard. |
| `stores` | **The consumable that the record costs** | The Act I objective reads `stores` and the story's own "Log the erasure" costs exactly that store; spending it leaves the Act II objective met with zero slack. This is the clearest case of the objective and the story fighting over one key. |
| `goodwill` | **Earned external help** — the key the secret branch is bought with | Gates the one authored "earned" branch (`Sabotage the Loom`, `cost=goodwill:3`) and is granted only by giving something up (charge, or a berth). The spike's sharpest balance finding was that this branch was reachable and **unwinnable**; keeping the key forces v1 to keep the reachable-*and*-survivable rule ([§2.8.3](#283-the-economy-by-act)). |
| `charge` | **Tempo** — the plot currency, spendable and refillable | Read by the content's only `#when` rule (`charge>=2`) and by the quiet ending (`cost=charge:2`); at `le-iii-approach` it hid two of three endings on 12 of 38 visits. It is what turns Act III from a menu into a decision. |

**Not in the set — and why** (each was considered and rejected in writing so the
next designer does not re-open it):

- **`coins` / `reputation`** — the engine's *default projection*
  (`DEFAULT_RESOURCE_KEYS`) is **overridden**, not extended: the setting is a
  survey service, not a market, and has no public standing to model. The rule is
  the engine's own — a game that declares a field map gets exactly that set, and
  the default pair only appears when a game declares nothing
  ([`docs/core-engine/story-line.md` §Declared resources](../core-engine/story-line.md#declared-resources)).
- **`clock` / `time` / `pressure`** — the clock is **scene bookkeeping, not a
  resource** ([§2.1](#21-composition-contract-who-owns-what): pacing belongs to the
  scene budget, and the spike's `clockCost` column retires into `beat.clockCost`).
  Declaring it as a resource would let content in one scene spend another scene's
  budget and would blur the act/scene boundary the beat sheet exists to draw. It
  is a **named gap** that the current content guard cannot see it
  ([§2.8.6](#286-what-the-engine-cannot-express-at-this-commit-named-gaps) item 5).
- **`insight` / `revelation`** (considered as a "knowledge" track) — rejected: a
  knowledge resource is monotonic, cannot be reasonably sunk, and would therefore
  be a progress flag wearing a resource's clothes. Progress is the route table's
  job ([§2.3](#23-how-a-scene-outcome-selects-the-next-beat)).
- **A sixth "reputation with the survey service"** — rejected: it would read the
  same choices as `goodwill` and be spent in the same beat, so it is the same key
  under another name (the rule below).

**Rules for adding or removing a key later** (the model's own change control, so
"the five-key spike set may not be the right v1 set" is decided on evidence):
a key is **added** only when (a) the shipped acts give it at least one sink and
one source, (b) at least one objective, `#when` rule or `#cost` reads it,
(c) a player can say in one sentence what it protects, and (d) the human playtest
shows players tracking it; a key is **removed** when (b) stops being true, or
when two keys are always spent in the same choice — then they are one key.

#### 2.8.2 Per-key contract

Every key below states the four things a writer needs: where it starts, what it
can reach, what reads it, and what happens at each bound. Values are the spike's
starting bag (`DEFAULT_RESOURCES` in
`example-games/gym/GymLongErasureGame.ts`); bounds are the v1 design bounds the
engine cannot enforce yet (gap 1 below).

| Key | Start | Bounds | Sources (authored gains) | Sinks (authored costs) | Gates that read it | At zero | At maximum | Recovery path |
|---|---|---|---|---|---|---|---|---|
| `hull` | 5 | 0–5 | **none, ever** (irreversible) | `hull:1` (shelter strip, derelict locker), `hull:2` (hit the core now), `hull:3` (ram the core), plus the beat sheet's `losses` | `hull >= 5` (Act II objective); every hull `#cost` is an affordability gate | Every hull-costing door is **unaffordable** and shown as unaffordable ([§2.8.6](#286-what-the-engine-cannot-express-at-this-commit-named-gaps) gap 3), not deleted. The run continues on hull-free doors (a design invariant the scene-space guard must prove — [§2.8.6](#286-what-the-engine-cannot-express-at-this-commit-named-gaps) item 5); a scene `losses` entry is designed to clamp to 0 with the ledger recording the unapplied remainder. | Nothing — 5 **is** full hull. A loss at full hull is still a loss, so the maximum and the start are the same value. | **No recovery within a run**, by design. The recovery is structural: the reset ending restarts at `start` ([Appendix A](#appendix-a-the-episode-manifest-complete-worked-example)) while the journal and the loss ledger survive as the record. |
| `morale` | 5 | 0–8 | `morale:1` (rally the crew, hold the survey line, ration the stores, refuse him) | `morale:1` (shelter in the dead zone, side with the crew) | `morale >= 4` (Act III objective); `morale < 1` as a `#when` guard is available in the vocabulary | The crew door closes: the Act III objective cannot be met, the scene classifies `partial`/`failure` and routes to a non-crew door. **Not a dead end** — every scene's routes are total ([§2.4](#24-how-the-beat-sheet-composes-with-story-line)). | Surplus is **spilled** (not banked): a morale gain at 8 is wasted, which is the designer's signal that the content is granting morale faster than a gate reads it. | Authored `#extra=morale` choices; at least one per act, and the Act I source is reachable **without spending any other key** (rally the crew), so a depleted player can always climb back. |
| `stores` | 4 | 0–6 | `stores:1` (push deeper, take the ally's berth, side with the crew, bargain in bad faith), `stores:2` (strip the locker) | `stores:1` (log the erasure, turn for the muster) | `stores >= 3` (Act I and Act II objectives); every store `#cost` | No detour and no record can be bought: the store-cost doors close and the objectives that read `stores` cannot be met. The run survives on the free doors. | Hold full: a salvage gain at 6 **spills**, so a choice taken at a full hold is a real waste rather than a free bank. | Salvage: the derelict locker (`+2`, paid in hull) and the ally's berth (`+1`, paid in goodwill). Recovery is deliberately priced in another key. |
| `goodwill` | 0 | 0–5 | `goodwill:2` (transmit the warning, side with the captain), `goodwill:1` (share the berth) | `goodwill:2` (take the ally's berth), `goodwill:3` (sabotage the Loom) | `goodwill >= 1` (Act I second-scene objective); `goodwill:3` affordability gate on the earned branch | The earned door closes; the player routes to refuse or keep. This is exactly the spike's unwinnable branch, and the rule that fixes it is in [§2.8.3](#283-the-economy-by-act). | Every ally already banked: a further goodwill grant spills, so social capital cannot be hoarded past five. | One-shot per act, and never purchasable: Act I's sources are the transmit warning (spends charge) and the crew's decision; Act II's is sharing the berth. A player who spends goodwill in Act II cannot re-earn it before Act III. |
| `charge` | 2 | 0–4 | `charge:1` (follow the unravelling, follow the thread), `charge:2` (set the charge) | `charge:1` (transmit the warning), `charge:2` (unwrite the Loom) | `charge >= 2` as the content's only `#when` rule; `charge:2` affordability on the quiet ending | The quiet ending and the conditional core route close. The player still holds the free reset door and, if hull allows, the ram — so zero charge is a *sharper* choice, not a dead end. | Core saturated: a refill at 4 spills, so the player must spend before refilling. | Tempo refills, each behind a clock cost: `+1` for following the unravelling or the thread, `+2` for setting the charge properly. Charge is the one key whose recovery is always one beat away — and that beat is what the clock sells. |

**The irreversibility rule, stated once.** `hull` is the sole member of
`manifest.resources.irreversible`, and the model's promise is exactly one
sentence: **nothing in the content, the beat sheet or the reset loop ever grants
`hull` back within a run.** That promise is currently enforced by authoring
discipline and by the fixture test in [§2.8.7](#287-how-the-economy-is-verified),
because the engine has no notion of an irreversible key (gap 6). The manifest
validator's `loss-not-irreversible` rule keeps *loss rules* pointed at the right
key; it cannot stop a writer typing `#extra=hull:1`.

**Bounds are design bounds, not engine bounds.** A cost is only authored up to a
value the starting bag plus that key's own authored sources can supply; a gain is
authored so that the recorded route's peak stays under the cap. Until the engine
clamps (gap 1), a fixture test asserts those inequalities
([§2.8.7](#287-how-the-economy-is-verified)) — the model is checked at authoring
time because it cannot be enforced at runtime. Where the columns above say a surplus *spills* or a loss *clamps*, read "is designed to spill / clamp": the engine applies every delta unclamped until gap 1 closes, so the bound is authoring discipline plus the fixture test, not a runtime guarantee.

#### 2.8.3 The economy by act

The design principle that turns economy into tension is one sentence: **each
scene's objective is measured in the key that the scene's best choice spends.**
If the objective reads a key the scene never touches, the objective is a
checklist; if it reads the key the story most wants to spend, the player is
choosing which of two goods to keep.

| Act | The objective reads | What the story's best choice spends | The act's deliberate trade |
|---|---|---|---|
| I — The First Unwriting | `stores >= 3` | `stores:1` (log the erasure) or `stores:1` (turn for the muster) | **Keep the record or keep the hold.** At most one store is spent in Act I, so a player who spends it exits on exactly the Act II objective's minimum with *zero slack*: only salvage keeps the check met, and salvage costs hull. |
| II — The Dead Zone | `hull >= 5` | `hull:1` (strip the locker) for `stores:2` | **Spend the irreversible key to buy the consumable.** Hull is the only key that never comes back; the stores it buys are what keeps the later objectives met. Leaving the locker sealed is the choice that protects the objective and starves the hold. |
| III — The Core | `morale >= 4` | `charge:2` (unwrite the Loom), `hull:3` (ram the core), or nothing (finish the weave) | **What the crew's morale earns you the right to spend.** The three doors are priced in three different currencies — tempo, the hull itself, and the timeline — and the objective decides whether the crew ending is still a door at all. |

**Audited sources and sinks per act** (counted from the shipped content; this is
the housekeeping check the principle above has to pass). A key that has no sink
in an act is a resource only the *other* acts spend, which is deliberate: you
earn in one act and pay in the next.

| Key | Act I source / sink | Act II source / sink | Act III source / sink | Reads as |
|---|---|---|---|---|
| `hull` | 0 / 0 | 0 / 2 | 0 / 2 | a pure sink — irreversible by construction |
| `morale` | 2 / 1 | 3 / 2 | 0 / 0 | recoverable, and the Act III objective's subject |
| `stores` | 1 / 2 | 4 / 0 | 0 / 0 | earned in Act II, spent in Act I: the debt is paid forward |
| `goodwill` | 1 / 0 | 2 / 2 | 0 / 0 | earned by giving something up, spent on the earned branch |
| `charge` | 0 / 1 | 2 / 0 | 1 / 1 | tempo: spent in Act I, refilled in Act II, spent again in Act III |

**The arithmetic that produces tension rather than housekeeping** (worst-case
spend on a played route, from the four recorded runs and the exhaustive route
space):

| Key | Start | Recorded range across the four named runs | Worst designed spend | Why the number is this number |
|---|---|---|---|---|
| `hull` | 5 | 2–5 | 4 (`hull:1` salvage + `hull:3` ram), plus a scene `losses` entry | The most destructive *non-terminal* path leaves 1 hull; the terminal ram may take the last one. Hull 5 makes "one hull left" the designed cliff, and the Act III loss rule is what pushes a hull-1 player to the clamp. |
| `morale` | 5 | 4–6 | 2 spent (`-1` shelter, `-1` side with the crew) | The Act III objective needs 4. Two sinks with no source fail it; one source turns failure into success. The crew is never unreachable — only unreachable *if you spent it twice*. |
| `stores` | 4 | 3–4 | 1 before the Act II check, 4 granted in Act II | 4 − 1 = 3 meets the Act II objective exactly. There is no slack, which is why Act II's salvage is not optional for a player who spent in Act I. |
| `goodwill` | 0 | 0–2 | 3 (`sabotage`) | 0 at start is deliberate: the earned branch is reachable only by earning it — transmit (`+2`, paid in charge) then share the berth (`+1`), or share then side with the captain. Two authored routes reach 3, so the branch is reachable from the start bag plus one source per act. |
| `charge` | 2 | 1–2 | 3 (`transmit` `-1` + `unwrite` `-2`) | A player who transmits in Act I cannot pay for the quiet ending without an Act II refill; skipping the transmit keeps the ending and forfeits the `goodwill` it buys. That is the act-to-act trade, in one key. |

**The reachable-and-survivable rule** (the spike's measured failure, absorbed as
a gate on content rather than a hope). A state-gated branch must be
(i) reachable from the starting bag plus the sources the acts can guarantee
*before* the gate, and (ii) survivable: taking it must still leave an affordable
ending. Content enforces this through `npm run storylines:guard`'s
`gated-branch-survivable` and `ending-reachable` invariants; the worked trade
fixture in [§2.8.4](#284-worked-trade-per-act-one-csv-row-each) is guarded in the
unit suite ([§2.8.7](#287-how-the-economy-is-verified)). The `charge>=2` gate at
`gxr-iii-core` is the model's positive case: charge starts at 2, nothing on that
route spends charge before the gate, and both doors behind it end the run.

**The affordability rule.** A `#cost` gate must be **surfaced, not hidden**: the
player sees the option and its requirement ("2 charge needed"), because the spike
measured that hiding it made the game go quiet exactly when it should speak
(`107 of 197` dead turns were gate-collapsed). The engine's `#cost` currently
*omits* the option (`isOptionAffordable` → boolean; gap 3), so v1 states the rule
here and the presentation/UI item consumes it; no content may be authored on the
assumption that a hidden option is a design.

#### 2.8.4 Worked trade per act (one CSV row each)

Three rows from the working fixture
[`tests/fixtures/story-line/gdd-resource-trades.csv`](../../tests/fixtures/story-line/gdd-resource-trades.csv),
verbatim. They use the Long Erasure adapter (so the declared set is the five-key
one), the same `#cost` / `#extra` / `#when` vocabulary as the shipped content,
and each one is a trade the objective fights. They validate through
`npm run storylines:validate` and guard clean
([§2.8.7](#287-how-the-economy-is-verified)).

**Act I — stores against the record.**

```csv
gxr-i-record,The Record or the Crew,The log spends a store; the crew costs nothing.,"Log the erasure|gxr-ii-locker#cost=stores:1#says=You write the volume down and spend a store of paper and power doing it. The record is exact and the hold is one lighter.;Rally the crew|gxr-ii-locker#extra=morale:1#says=You gather the crew on the observation deck instead. Nobody writes anything down, and the watch ends steadier.",gdd-resource-trades,The GDD Resource Trades,"hull,morale,stores,goodwill,charge",I,1,"Act I trade: the scene objective reads stores, and the story's record costs exactly that store. Keeping the objective and keeping the record are the same currency.",
```

Read it as arithmetic: the scene objective is `stores >= 3` and the starting hold
is 4, so "Log the erasure" lands the player exactly on the bound. The
alternative grants `morale` — the Act III objective's key — so the choice is
"pay the future check now" or "buy crew consent that only pays off two acts
later". Neither option is a no-op, and neither is a clear win.

**Act II — hull against stores.**

```csv
gxr-ii-locker,The Locker,The locker is full and the hull is not.,"Strip the locker|gxr-iii-core#cost=hull:1#extra=stores:2#says=You cut the locker open and take the stores aboard, and the sound the hull makes doing it stays with the crew.;Leave it sealed|gxr-iii-core#says=You log the position and hold your course. The locker stays full behind you and the hull stays whole.",gdd-resource-trades,The GDD Resource Trades,"hull,morale,stores,goodwill,charge",II,2,"Act II trade: stores are bought with the one key the scene objective is measuring, and the objective reads hull.",
```

The scene objective is `hull >= 5`, and stripping the locker is the only way to
buy stores in Act II. **The best choice fails the objective**, which is the whole
point: the objective is not a checklist, it is the price tag on the menu. Because
the scene's routes are total, failing it is a consequence, not a dead end —
either door leaves the scene.

**Act III — three currencies and one free door.**

```csv
gxr-iii-core,The Core Door,Three doors and only some of them are affordable.,"Unwrite the Loom|gxr-end-quiet#cost=charge:2#says=You empty the core's charge into the Loom and the mechanism stops remembering.;Break for the core|gxr-end-quiet,gxr-end-ram#when=charge>=2>gxr-end-ram#says=You drive for the core while the tear is still open, and the hull pays for the approach.;Finish the weave|gxr-end-reset#says=You let the weave finish and the timeline closes over the room.",gdd-resource-trades,The GDD Resource Trades,"hull,morale,stores,goodwill,charge",III,3,"Act III trade: the quiet ending spends charge (recoverable), the ram spends hull (irreversible), and the reset spends nothing. The #when rule reads charge before the door is offered.",
```

Here the objective (`morale >= 4`) is read *before* the doors, so the player
knows whether the crew ending is still theirs. `charge:2` is recoverable and
buys the honest chart; `hull:3` is irreversible and buys the argument; the free
door ends the timeline. `#when=charge>=2>gxr-end-ram` is the only state gate, and
it is readable: two charge converts "break for the core" from a coin-flip into
the ram. The reset's `Begin again` option closes the loop back to Act I, which is
why the reset ending is the model's structural recovery path for `hull`.

#### 2.8.5 How the model is expressed in the current engine vocabulary

Every element of the model has exactly one carrier at this commit; nothing in this table
is a proposal.

| Model element | Carrier | Where it is written |
|---|---|---|
| The declared key set | `createResourceProjection` field map — the map **is** the declaration | game module, e.g. `DEFAULT_RESOURCES` / `LONG_ERASURE_RESOURCES` in `example-games/gym/GymLongErasureGame.ts` |
| Starting values | the game's starting state (proposed `resources.start` manifest data is a gap — item 2) | `DEFAULT_RESOURCES` |
| Costs and sinks | `#cost=key:number` on an option, paid at resolution, gated by `isOptionAffordable` at draw time | content CSV `options` cell |
| Sources and gains | `#extra=key:number` on an option, applied at resolution | content CSV `options` cell |
| State-gated branch | `#when=field<op>number>successor`, first matching rule wins, evaluated on **post-resolution** resources | content CSV `options` cell |
| Objective check | the manifest's `objective.check`, the same `{field, op, value}` `Condition` shape over declared keys | episode manifest |
| Irreversibility | `resources.irreversible` in the manifest, checked by the `loss-not-irreversible` rule | episode manifest |
| Losses | `losses[]` rules applied at scene close through `engine.applyResourceDelta` | episode manifest |
| Bounds | **nothing** — design bounds, asserted by the fixture test | — (gap 1) |

The declaration is a five-line projection, and the keys cannot drift from the
accessors because the same object supplies both:

```ts
const resources = createResourceProjection<VoyageState>({
  hull:     { read: (s) => s.hull,     apply: (s, d) => { s.hull += d; } },
  morale:   { read: (s) => s.morale,   apply: (s, d) => { s.morale += d; } },
  stores:   { read: (s) => s.stores,   apply: (s, d) => { s.stores += d; } },
  goodwill: { read: (s) => s.goodwill, apply: (s, d) => { s.goodwill += d; } },
  charge:   { read: (s) => s.charge,   apply: (s, d) => { s.charge += d; } },
});
```

Two consequences worth stating because they constrain the content pipeline
(`CG-0MWPY29730011FJ4`):

- **The declaration order is the delta-application order** and the set is
  normalised (trimmed, de-duplicated), so a writer cannot change behaviour by
  reordering the `resources` column.
- **An absent key reads as `0`**, so a card that forgets to declare `hull` makes
  every hull cost unaffordable (and a positive hull cost reads as unaffordable,
  not free). The validator reports that as `unknown-resource-key`, not as a
  silent balance change.

#### 2.8.6 What the engine cannot express at this commit (named gaps)

Each gap is a pointer to the backlog (`CG-0MWPY2ECE002P2NH`, [§6](#6-engine-gap-backlog-todo)),
not an assumption that it will be fixed. The module named is the one a reviewer
can open at this commit. The **backlog pointer** column names the proposed
backlog entry this section needs; [§6](#6-engine-gap-backlog-todo) is still that
item's stub, so these are its inputs, not entries it has already filed.

| # | The model needs | Why the engine cannot do it at this commit | Backlog pointer |
|---|---|---|---|
| 1 | **Bounds and clamping** — min/max per key, spill at maximum, clamped loss at minimum | `applyResourceDelta` is unbounded and unvalidated (`src/story-line/resources.ts`); a delta is applied as given, so a gain past the cap silently banks and a loss below zero silently goes negative. No spill or clamp is reported anywhere. | `CG-0MWPY2ECE002P2NH` — *resource bounds and clamping* |
| 2 | **The start bag and bounds as manifest data** — `resources.start` / `resources.bounds`, so a validator can prove gate reachability from the start | The manifest's `resources` block carries `declared` and `irreversible` only ([§2.2.1](#221-episode-manifest)); the start bag is a game constant (`DEFAULT_RESOURCES`), and the manifest validator has no way to see it. | `CG-0MWPY2ECE002P2NH` — *manifest validator* (`resources.start` / `resources.bounds` rules) |
| 3 | **Surfaced affordability** — present the option with its requirement ("2 charge needed") | `#cost` is a draw-time **omission** gate: `isOptionAffordable` returns a boolean (`src/story-line/compile.ts`), and the presenting layer deletes the option. There is no requirement object for a UI to render. Measured cost: 32 of 302 instances hidden, 107 of 197 dead turns gate-collapsed. | `CG-0MWPY2ECE002P2NH` — *resource HUD + affordability presentation* (§6 item 4) |
| 4 | **Condition expressiveness** — conjunction ("hull ≥ 5 **and** stores ≥ 3"), "at maximum", or a range | `Condition` is a single `{field, op, value}` (`src/story-line/types.ts`); the beat sheet adds only `{budget: "exhausted"}`. Any compound objective must be authored as data the runner cannot evaluate, or as two scenes. | `CG-0MWPY2ECE002P2NH` — *objective / condition expressiveness* |
| 5 | **The scene clock inside the resource guard** — prove no scene exit strands the player | The clock is not a declared resource, so `src/story-line/content/guard.ts` enumerates the chain only; the scene-space guard is a named gap ([§2.4](#24-how-the-beat-sheet-composes-with-story-line)). | `CG-0MWPY2ECE002P2NH` — *scene-space guard* (§6 item 3) |
| 6 | **Irreversibility as an engine guarantee** — refuse any grant to an irreversible key | `resources.irreversible` is manifest data read only by the manifest validator's `loss-not-irreversible` rule; nothing in `@story-line` knows the concept, so `#extra=hull:1` is legal content. At this commit the rule is enforced by authoring discipline and the fixture test. | `CG-0MWPY2ECE002P2NH` — *irreversible-key policy* (with the bounds entry) |
| 7 | **The resource HUD and the act-boundary presentation** — where the trade is *seen* | No SLL zone or component renders the declared keys or marks the loss-bearing subset; the presentation contract is owned by `CG-0MWPY2CHF003AHE1` and the surface does not exist (`src/ui/screen-layout.ts`). | `CG-0MWPY2ECE002P2NH` — *resource HUD* (§6 item 4) |

#### 2.8.7 How the economy is verified

The model's claims that can be machine-checked are checked; the rest are review
checks. The fixture is
[`tests/fixtures/story-line/gdd-resource-trades.csv`](../../tests/fixtures/story-line/gdd-resource-trades.csv)
and the enforcement is
[`tests/story-line/content/gdd-resource-model.test.ts`](../../tests/story-line/content/gdd-resource-model.test.ts).

| Claim | Command | Expected |
|---|---|---|
| The worked trade rows are valid authored content against the five-key set | `npm run storylines:validate -- --csv tests/fixtures/story-line/gdd-resource-trades.csv --game long-erasure` | `RESULT: VALID` |
| Each act carries a real cost/gain trade, with the numbers this section prints | `npx vitest run --project unit tests/story-line/content/gdd-resource-model.test.ts` | 12 tests pass; the three trade rows assert `stores:1`/`morale:1`, `hull:1`+`stores:2`, `charge:2`/`#when=charge>=2` |
| The irreversible key is never granted, and no cost exceeds the start bag plus authored gains | same test file | zero `extraEffect.hull`; every cost ≤ supply |
| The state-gated branch is reachable **and** survivable, and every ending is reachable | same test file (guard with the start bag) | `gated-branch-survivable` and `ending-reachable` green |
| Bounds hold on the authored content | same test file (authoring-time inequalities) | every cost/gain within the bounds of [§2.8.2](#282-per-key-contract) |

What the checks cannot prove — and a reviewer must judge — is the part that
makes the numbers *felt*: that the Act I store and the Act III crew door are
recognisably the same decision two acts apart, and that the hull loss reads as a
record rather than a counter. Those are hypotheses H7–H8 in
[§2.8.8](#288-hypotheses-and-what-would-falsify-them), and they need the human
playtest the evaluation recommends before the act structure freezes.

#### 2.8.8 Hypotheses and what would falsify them

| # | Hypothesis | Status | Validation | Owner |
|---|---|---|---|---|
| H7 | Five keys are legible in play — a player can name what each protects without the HUD telling them | **unproven**; the spike measured tracking of two (`charge`, `hull`) and no tracking of the other three | human browser playtest: after one run, ask the player what `goodwill` and `morale` bought; a blank answer fails the key | tension design (`CG-0MWPY2AZX001UI2A`) |
| H8 | "The objective is measured in the key the best choice spends" produces a felt trade rather than a visible checklist | **unproven**; it is a design rule applied to the worked manifest, not yet played | vertical slice: record how often a player names the trade in the scene-exit review; a player who never mentions the objective fails the rule | build epic (`CG-0MWPY2ECE002P2NH`) |
| H9 | The bounds (0–5 hull, 0–8 morale, 0–6 stores, 0–5 goodwill, 0–4 charge) are never hit by authored content, so a spill is always a writer error | **unproven**; the caps are set one "hold" above the recorded peaks | the fixture test's inequality check fails loudly if a re-tune authors a cost/gain past a bound; a spill observed in the vertical slice means the cap is wrong, not the content | tension design |

---

## 3. UX, Visual Design and Audio Direction

> **TODO — owned by `CG-0MWPY2CHF003AHE1` (GDD presentation contract: UI, audio,
> accessibility, determinism).** This section is a stub. It must not invent
> surfaces that sections 1–2 do not need, and it must not change the data model.

The surfaces the beat-sheet model implies, as a checklist for that item:

| Surface | Data it renders (from this document) | Notes for the owner |
|---|---|---|
| Resource HUD | `storyline.engine.getResources` over the declared keys; the irreversible subset marked as loss-bearing | must not hide affordability — surface "2 charge needed" instead of removing an option ([§1.5](#15-approach-decision-a-vs-c)) |
| Scene banner | `scene.title`, `objective.statement` | objective is one line; no pixel positions (SLL zones only) |
| Beat clock | `clockRemaining / budget.clock`, next beat's `clockCost` before it is entered | the beat cost must be visible *before* the player commits, so a refusal is never a surprise |
| Scene-exit banner | the `scene-exit` record ([§2.3](#23-how-a-scene-outcome-selects-the-next-beat)): objective met/unmet, clock spent, outcome word, the door opened | the banner is the consequence, so it cannot be silent |
| Choice list | `@story-line` compiled options, `isOptionAffordable` gating | the affordability decision must be presented, not merely applied |
| Journal | `buildJournal` over the activity log, including `scene-exit` lines | the journal is the artefact that survives the reset |
| Loss ledger | `{sceneId, field, delta, statement}` entries | the only place a refund would be visible, so it must never show one |
| Epilogue | `buildEpilogue(...).epilogueProse`, the score/band from the scoring model | `le-end-reset` restarts the run at `start` as a post-ending action |

Audio, reduced motion, accessibility, save/load, transcript and replay are all
owned by that item; the determinism constraint this document imposes is the one
that cannot be traded: **a scene close consumes no RNG**, so a replay is
reproducible from the seeded candidate draws alone.

---

## 4. Glossary

> **Proper nouns are working names.** The final naming table, the
> prohibited-term scan and the trademark sanity read are owned by
> `CG-0MWPY2FV30041M48`. The design vocabulary below is fixed by this document
> and should not be renamed by that pass.

### 4.1 Design vocabulary

| Term | Meaning |
|---|---|
| **Episode** | One complete run: one episode manifest, one bound content file, one start beat, one ending reached. |
| **Act** | An ordered group of scenes. Carries no clock of its own. |
| **Scene** | The unit of dramaturgy: one objective, one clock budget, one beat set, one outcome table, one route table. |
| **Beat** | One content card played inside a scene; identified by its card id; charges its clock cost on entry. |
| **Objective** | One player-facing line plus one measurable check over declared resources, evaluated once at scene close. |
| **Budget** | The scene's clock ticks. Reset per scene entry; never carried between scenes. |
| **Outcome** | `success`, `partial` or `failure`, classified at scene close by the outcome rules. |
| **Route** | The ordered rule that turns a scene outcome into the next beat (chain, beat or ending). |
| **Chain route** | A route that honours the card the player's choice pushed. |
| **Incident layer** | The `@story-line` card chain inside a scene: prose, options, costs, gates, journal. |
| **Loss ledger** | The beat sheet's record of every irreversible loss, from chain costs and from loss rules. |
| **Irreversible key** | A declared resource the beat sheet never restores; v1: `hull`. |
| **Scene-exit record** | The transcript entry (and banner source) naming objective, outcome, rule, route, clock and next beat. |
| **Reset ending** | The ending that restarts the run at `start`, leaving the journal and the ledger as the record. |
| **Consequential choice** | A choice marked in the content's `consequential` column, held to the minimum rejoin distance by the route-space guard. |

### 4.2 Working proper nouns (pending the IP pass)

| Name | What it is | Rationale |
|---|---|---|
| **The Long Erasure** | Working title, and the name of the reset ending | names the phenomenon, not a franchise |
| **Ashlight** | The survey vessel | a lamp-name for a ship that measures the dark |
| **The Unwriting** | The phenomenon: space being edited out of having happened | describes the event, no proper-noun baggage |
| **The Revision Loom** | The mechanism doing the editing | a working loom, not a weapon |
| **Archivist Vane** | The antagonist's intermediary | an archivist, because the story is about records |
| **The dead zone** | A listening shadow inside the erased volume | functional, plain-language place name |
| **The muster station** | The nearest surviving port | functional, plain-language place name |

---

## 5. Test Plan

The GDD makes claims that are machine-checkable, and the ones that are not are
listed as review checks. Nothing here substitutes for the project's test
profiles; the commands below verify *this document* and the model it specifies.

### 5.1 Verification available at this commit

| # | Claim being verified | Command | Expected |
|---|---|---|---|
| T1 | The GDD's worked CSV rows are valid authored content | `npm run storylines:validate -- --csv tests/fixtures/story-line/gdd-worked-examples.csv --game gym` | `RESULT: VALID` |
| T2 | The worked rows are playable to an ending, with every gated branch survivable and every consequential choice at or above the minimum rejoin distance | `npm run storylines:guard -- --csv tests/fixtures/story-line/gdd-worked-examples.csv --game gym --initial coins=3,reputation=1` | `PASS`, three invariants green |
| T3 | The route-space guard fails on a known-bad branch (positive control: the guard can fail) | `npm run storylines:guard -- --csv tests/fixtures/story-line/guard-unwinnable-branch.csv --game gym --initial coins=0,reputation=0` | `FAIL`, non-zero exit, `gated-branch-survivable`, `ending-reachable` and `consequential-rejoin` reported |
| T4 | Every card id in the worked manifest resolves in the bound content file, and every content card is assigned to exactly one scene or to `endings` | the script in [§5.3](#53-self-check-for-the-worked-manifest) | `PASS: every manifest card id resolves and every content card is assigned` |
| T5 | No second choice model, no re-implementation of the chain | review check: `createEpisodeRunner` calls only public `@story-line` surface ([§2.4](#24-how-the-beat-sheet-composes-with-story-line)); no module outside `src/story-line/` parses the `options` cell | reviewer sign-off at the build epic |
| T6 | The document builds and the changed scope is green | `npm run build` then the test skill's unit profile | green |
| T7 | The resource model's working fixture declares the GDD key set, carries one trade per act, never grants the irreversible key and keeps the state-gated branch survivable | `npm run storylines:validate -- --csv tests/fixtures/story-line/gdd-resource-trades.csv --game long-erasure`, then `npx vitest run --project unit tests/story-line/content/gdd-resource-model.test.ts` | `RESULT: VALID`; 12 tests pass ([§2.8.7](#287-how-the-economy-is-verified)) |

### 5.2 Verification the build epic must add (named gaps)

| Gap | Command the build epic must provide | Why it is not here |
|---|---|---|
| Manifest validator | `npm run storylines:manifest -- --manifest <file> --json` | no beat-sheet layer exists yet; the rules are the table in [§2.4](#24-how-the-beat-sheet-composes-with-story-line) |
| Manifest JSON schema | `schemas/episode-manifest.schema.json` validated with ajv in the unit suite | same |
| Scene-space guard | a `storylines:guard --manifest <file>` mode that enumerates scene exits and refusals | the current guard enumerates the chain only; the clock is not a declared resource, which is why the model adds scene bookkeeping |
| Deterministic replay | a transcript replay test asserting identical scene-exit records and score at the same seed | depends on the runner |

### 5.3 Self-check for the worked manifest

Run from the repository root. It extracts the manifest from
[Appendix A](#appendix-a-the-episode-manifest-complete-worked-example), parses
it, and checks the two claims that make the composition contract auditable
without a new build step.

```bash
node -e '
const fs = require("node:fs");
const doc = fs.readFileSync("docs/design/storyline-game-gdd.md", "utf8");
const block = doc.match(/<!-- episode-manifest-example -->\s*```json\n([\s\S]*?)\n```/);
if (!block) throw new Error("manifest example block not found");
const manifest = JSON.parse(block[1]);
const ids = new Set(
  fs.readFileSync(manifest.content.file, "utf8").trimEnd().split(/\r?\n/).slice(1)
    .map((line) => line.slice(0, line.indexOf(","))),
);
const beats = new Set(manifest.acts.flatMap((a) => a.scenes.flatMap((s) => s.beats.map((b) => b.cardId))));
const missing = [...beats, ...manifest.endings].filter((id) => !ids.has(id));
const unassigned = [...ids].filter((id) => !beats.has(id) && !manifest.endings.includes(id));
console.log(`beats=${beats.size} endings=${manifest.endings.length} content cards=${ids.size}`);
if (missing.length > 0 || unassigned.length > 0) {
  console.error({ missing, unassigned });
  process.exit(1);
}
console.log("PASS: every manifest card id resolves and every content card is assigned");
'
```

### 5.4 Review checklist (manual, for the producer and the close-out)

1. **A-vs-C consistency.** Every section assumes approach C. No section asks the
   card chain to carry acts, and no section asks the beat sheet to carry choice,
   prose or resource arithmetic.
2. **Ownership audit.** Every field in [§2.2](#22-the-scene-beat-sheet-data-model)
   appears in exactly one row of [§2.1](#21-composition-contract-who-owns-what).
3. **Totality.** Every scene's routes cover all three outcomes or end with `*`;
   every outcome table ends with an unconditional rule.
4. **Traceability.** Every stub in [§2.7](#27-sections-owned-by-downstream-work-items)
   names a live work item; every claim about the spike cites the observation log
   or the evaluation.
5. **Hypotheses.** Anything unproven is in [§2.6](#26-hypotheses-and-how-they-will-be-validated)
   with a validation method — no unproven mechanism is presented as settled.
6. **UK English and prose budgets.** Spelling convention held; objective
   statements within 90 characters.

---

## 6. Engine-Gap Backlog (TODO)

> **TODO — owned by `CG-0MWPY2ECE002P2NH`.** This section is a stub. The gaps
> named in this document are pointers for that item, not a backlog in their own
> right.

The beat-sheet work this document needs, as named here so no gap is lost between
documents:

1. **Beat-sheet / objective layer** — scene budgets, outcome classification,
   routing and the loss ledger ([§2.2](#22-the-scene-beat-sheet-data-model),
   [§2.3](#23-how-a-scene-outcome-selects-the-next-beat)). At this commit the engine has
   no scene, objective or budget concept (`src/story-line/compile.ts`; the spike's
   act/clock live in a game rule module, `example-games/gym/GymLongErasureGame.ts`).
2. **Manifest validator** — the rule table in
   [§2.4](#24-how-the-beat-sheet-composes-with-story-line) over a new episode
   manifest schema; at this commit only content is validated
   (`src/story-line/content/validate.ts`), and no manifest exists.
3. **Scene-space guard** — route-space enumeration extended over scenes and
   refusals; the current guard models declared resources only and cannot see the
   clock (`src/story-line/content/guard.ts`).
4. **Resource HUD + affordability presentation** — surface what a gate would
   hide ([§2.3](#23-how-a-scene-outcome-selects-the-next-beat), option gating);
   options are currently omitted, not explained.
5. **Act/scene transition presentation** — the scene-exit banner and act
   transition surfaces ([§2.3 step D](#23-how-a-scene-outcome-selects-the-next-beat));
   no SLL zone exists for them at this commit (`src/ui/screen-layout.ts`).
6. **Retirement of the legacy `act` / `clockCost` columns** — a content-format
   change with a migration check ([§2.1](#21-composition-contract-who-owns-what));
   the spike's game module currently reads them.

---

## 7. V1 Scope Statement and Deferred List (TODO)

> **TODO — owned by `CG-0MWPY2HJU006LJMU`.** This section is a stub: it must be
> internally consistent with the resource model, the scoring model and the gap
> backlog, and no v1 feature may depend on an unfiled gap.

To be fixed by that item, using this document's numbers as the baseline:

| Input | Value used here |
|---|---|
| Acts | 3 |
| Scenes | 5 in the worked manifest; v1 total is the owner's decision |
| Beats | 15 assigned beats + 4 ending cards in the worked manifest |
| Branches / exits | 5 scenes × 2–5 beats; the authored chain contributes the in-scene branches |
| Target playtime basis | the spike's measured **6–10 beats** and **5–9 choices** per run (mean 8.48 beats), extended by scene exits — the owner converts this to minutes with a stated assumption |
| Replayability basis | seeded content order, authored doors, and the scene outcomes that open or close them |

---

## Appendix A: The episode manifest (complete worked example)

A complete three-act manifest over the shipped spike content: **5 scenes, 15
assigned beats and 4 endings**. It is a valid manifest by the rules of
[§2.4](#24-how-the-beat-sheet-composes-with-story-line), every card id in it
resolves in `example-games/gym/content/long-erasure.csv` at this commit, and
every non-ending card in that file is assigned exactly once. Tuning numbers
(clock budgets, objectives) are illustrative of the *shape* and are owned by the
tension design (`CG-0MWPY2AZX001UI2A`).

**One route is deliberately a safety net.** `failed-watch` in `s-i-answer` guards
on `{budget: "exhausted"}`, a condition the current budget cannot produce. Route
tables are required to be total for every *condition*, not merely for the
conditions the current numbers happen to reach, because budgets and beat costs are
re-tuned by the tension design after this document — and a re-tune must never be
able to leave a scene without a door.

<!-- episode-manifest-example -->
```json
{
  "manifestVersion": 1,
  "id": "long-erasure",
  "title": "The Long Erasure",
  "content": {
    "adapter": "long-erasure",
    "file": "example-games/gym/content/long-erasure.csv"
  },
  "resources": {
    "declared": ["hull", "morale", "stores", "goodwill", "charge"],
    "irreversible": ["hull"]
  },
  "start": { "act": "act-i", "scene": "s-i-open", "beat": "le-i-open" },
  "endings": ["le-end-reset", "le-end-quiet", "le-end-ram", "le-end-abandon"],
  "acts": [
    {
      "id": "act-i",
      "title": "The First Unwriting",
      "order": 1,
      "entryScene": "s-i-open",
      "scenes": [
        {
          "id": "s-i-open",
          "title": "The First Unwriting",
          "objective": {
            "statement": "End the watch with the survey's stores intact.",
            "check": { "field": "stores", "op": ">=", "value": 3 }
          },
          "budget": { "clock": 2 },
          "entryBeat": "le-i-open",
          "beats": [
            { "cardId": "le-i-open", "clockCost": 1 },
            { "cardId": "le-i-log", "clockCost": 1 },
            { "cardId": "le-i-rally", "clockCost": 1 }
          ],
          "outcomeRules": [
            { "id": "survey-held", "when": { "objective": "met" }, "outcome": "success" },
            { "id": "survey-shaken", "outcome": "partial" }
          ],
          "routes": [
            { "id": "honour-the-door", "on": "success", "to": { "kind": "chain" } },
            {
              "id": "quiet-answer",
              "on": "*",
              "to": { "kind": "beat", "act": "act-i", "scene": "s-i-answer", "beat": "le-i-silent" }
            }
          ]
        },
        {
          "id": "s-i-answer",
          "title": "The Answering Silence",
          "objective": {
            "statement": "Leave the first act with someone still listening.",
            "check": { "field": "goodwill", "op": ">=", "value": 1 }
          },
          "budget": { "clock": 2 },
          "entryBeat": "le-i-transmit",
          "beats": [
            { "cardId": "le-i-transmit", "clockCost": 2 },
            { "cardId": "le-i-silent", "clockCost": 2 }
          ],
          "outcomeRules": [
            { "id": "someone-answered", "when": { "objective": "met" }, "outcome": "success" },
            { "id": "silence", "outcome": "partial" }
          ],
          "routes": [
            {
              "id": "failed-watch",
              "on": "*",
              "when": { "budget": "exhausted" },
              "to": { "kind": "beat", "act": "act-ii", "scene": "s-ii-shelter", "beat": "le-ii-shelter" }
            },
            { "id": "follow-the-door", "on": "*", "to": { "kind": "chain" } }
          ]
        }
      ]
    },
    {
      "id": "act-ii",
      "title": "The Dead Zone",
      "order": 2,
      "entryScene": "s-ii-shelter",
      "scenes": [
        {
          "id": "s-ii-shelter",
          "title": "The Dead Zone",
          "objective": {
            "statement": "Leave the dead zone with the hull whole.",
            "check": { "field": "hull", "op": ">=", "value": 5 }
          },
          "budget": { "clock": 6 },
          "entryBeat": "le-ii-shelter",
          "beats": [
            { "cardId": "le-ii-shelter", "clockCost": 2 },
            { "cardId": "le-ii-derelict", "clockCost": 2 },
            { "cardId": "le-ii-salvage", "clockCost": 2 }
          ],
          "outcomeRules": [
            { "id": "hull-whole", "when": { "objective": "met" }, "outcome": "success" },
            { "id": "hull-scored", "outcome": "partial" }
          ],
          "routes": [
            { "id": "open-the-offer", "on": "*", "to": { "kind": "chain" } }
          ]
        },
        {
          "id": "s-ii-offer",
          "title": "The Archivist's Offer",
          "objective": {
            "statement": "Reach the muster with stores to spare.",
            "check": { "field": "stores", "op": ">=", "value": 3 }
          },
          "budget": { "clock": 7 },
          "entryBeat": "le-ii-offer",
          "beats": [
            { "cardId": "le-ii-offer", "clockCost": 2 },
            { "cardId": "le-ii-bargain", "clockCost": 2 },
            { "cardId": "le-ii-refuse", "clockCost": 2 },
            { "cardId": "le-ii-keep", "clockCost": 3 },
            { "cardId": "le-ii-sabotage", "clockCost": 1 }
          ],
          "outcomeRules": [
            { "id": "stores-kept", "when": { "objective": "met" }, "outcome": "success" },
            { "id": "stores-spent", "outcome": "partial" }
          ],
          "routes": [
            { "id": "honour-the-answer", "on": "*", "to": { "kind": "chain" } }
          ]
        }
      ]
    },
    {
      "id": "act-iii",
      "title": "The Core",
      "order": 3,
      "entryScene": "s-iii-core",
      "scenes": [
        {
          "id": "s-iii-core",
          "title": "The Core",
          "objective": {
            "statement": "Reach the core with the crew still behind you.",
            "check": { "field": "morale", "op": ">=", "value": 4 }
          },
          "budget": { "clock": 5 },
          "entryBeat": "le-iii-approach",
          "beats": [
            { "cardId": "le-iii-approach", "clockCost": 3 },
            {
              "cardId": "le-iii-ahead",
              "clockCost": 3,
              "note": "Entering here leaves 2 of 5; 'Set the charge' needs 3, so this is the scene's deliberate cliff."
            }
          ],
          "outcomeRules": [
            { "id": "watch-spent", "when": { "budget": "exhausted" }, "outcome": "failure" },
            { "id": "crew-with-you", "when": { "objective": "met" }, "outcome": "success" },
            { "id": "crew-gone", "outcome": "partial" }
          ],
          "routes": [
            { "id": "choose-the-ending", "on": "success", "to": { "kind": "chain" } },
            { "id": "quiet-core", "on": "*", "to": { "kind": "ending", "cardId": "le-end-quiet" } }
          ],
          "losses": [
            {
              "id": "hull-sacrificed",
              "on": "failure",
              "field": "hull",
              "amount": 1,
              "statement": "Breaking for the core on the last of the watch costs the hull."
            }
          ]
        }
      ]
    }
  ]
}
```

**Walking the assignment table** (the check T4 automates):

| Scene | Beats | Budget | Objective field |
|---|---|---|---|
| `s-i-open` | `le-i-open`, `le-i-log`, `le-i-rally` | 2 | `stores` |
| `s-i-answer` | `le-i-transmit`, `le-i-silent` | 2 | `goodwill` |
| `s-ii-shelter` | `le-ii-shelter`, `le-ii-derelict`, `le-ii-salvage` | 6 | `hull` |
| `s-ii-offer` | `le-ii-offer`, `le-ii-bargain`, `le-ii-refuse`, `le-ii-keep`, `le-ii-sabotage` | 7 | `stores` |
| `s-iii-core` | `le-iii-approach`, `le-iii-ahead` | 5 | `morale` |
| endings (not beats) | `le-end-reset`, `le-end-quiet`, `le-end-ram`, `le-end-abandon` | — | — |

**Clock feasibility, checked by hand** (the arithmetic the build epic must
pin with tests):

| Path | Spend | Verdict |
|---|---|---|
| `s-i-open`: open → log/rally, then exit | 1 + 1 = 2 of 2 | last tick spent on the final beat; allowed |
| `s-i-answer`: transmit **or** silent, then exit | 2 of 2 | allowed |
| `s-ii-shelter`: shelter/derelict → salvage, then exit | 2 + 2 = 4 of 6 | slack 2 |
| `s-ii-offer`: offer → bargain → keep, then exit | 2 + 2 + 3 = 7 of 7 | last tick, legal climax |
| `s-ii-offer`: offer → bargain → sabotage, then exit | 2 + 2 + 1 = 5 of 7 | slack 2 |
| `s-iii-core`: approach → ending | 3 of 5 | allowed |
| `s-iii-core`: ahead → *Set the charge* (approach) | 3 + 3 = 6 of 5 | **refused** → scene failure → hull loss → *A Quiet Chart* |

---

## Appendix B: Evidence base

This document cites two artefacts. The **[observation log](../gym/long-erasure-observation-log.md)**
is the primary evidence and the place where the reasoning lives; the
**[playtest evaluation](./storyline-playtest-evaluation.md)** re-measures the
post-fix content and carries the current numbers. Where they differ, the
evaluation is the current figure. Both are agent-driven structural measurements
through the Phaser-free logic module, not human playtests.

| Measured finding | Figure | What this design does about it |
|---|---|---|
| Fork depth | 9 of 12 forks rejoin one beat later; only the ending choice never rejoins | scene outcomes and explicit routes give a fork consequence beyond depth 1; the content guard enforces `minimum rejoin distance` for choices marked consequential |
| Depth-1 visibility is misleading | 902 of 919 decisions (98.1%) reached a different next beat while the run read as a menu | the authored metric is rejoin distance in *scenes and beats*, not "a different next card" |
| Act III is not an act | 0.63 beats entered per run; 5 / 8 / 2 beats authored per act | scenes are the unit of time, and Act III's scene has an objective and a budget; act length is a scene count |
| The clock prunes rather than trades | 12 of 138 routes expire, all on entry to an Act III beat | per-scene budgets, a refused beat becomes an explicit scene failure with a route, and the beat's cost is visible before commitment |
| The affordability gate hides options | 10.6% of authored option instances hidden; at the final beat 12 of 38 states hide two of three endings | gates must be surfaced ("2 charge needed") and the resource/presentation sections own the change; the beat sheet adds no new hiding |
| The earned branch was reachable and unwinnable | 4 routes entered, 0 finished, clock 2 on entry against cost 3 | the same arithmetic is now a scene failure with a named consequence ([§1.4](#14-worked-walkthrough-act-entry-to-scene-outcome)) and a route to an ending; the guard requires every gated branch to survive |
| Abandoning is over-rewarded | 79 for abandoning vs 83 for finishing | the loss ledger and the reset-ending scoring model (`CG-0MWPY2AZX001UI2A`) must separate the bands |
| Authoring is cheap and diagnostic | a complete branch in ≈ 8 s of tool time, no TypeScript, row/column/reason diagnostics | the CSV authoring path is kept verbatim; the content pipeline documents it unchanged |

Reproduction commands for the measurements live in the evaluation note's §6 and
the log's appendix; they are not repeated here because a stale copy of a command
is worse than a link.

---

## Appendix C: Work-item map

| Work item | Owns |
|---|---|
| `CG-0MWNFVLYT003M7XF` | Parent epic: the full GDD |
| `CG-0MWPY22YG003PDY8` | Authored-content validation harness + route-space CI guard (delivered: T1–T3) |
| `CG-0MWPY24IX00719NH` | Playtest evaluation: three recorded runs + slideshow test (delivered: evidence) |
| **`CG-0MWPY25W4002UNKB`** | **This foundation: setting and tone, core loop, data model, outcome routing, composition contract, A-vs-C recommendation** |
| `CG-0MWPY27EU008QPHN` | Resource model and economy (delivered: [§2.8](#28-resource-model-and-economy), one worked trade per act) |
| `CG-0MWPY29730011FJ4` | Writer content pipeline (CSV authoring gate) |
| `CG-0MWPY2AZX001UI2A` | Tension, pacing, failure and reset-ending scoring |
| `CG-0MWPY2CHF003AHE1` | Presentation contract: UI, audio, accessibility, determinism |
| `CG-0MWPY2ECE002P2NH` | Engine-gap backlog |
| `CG-0MWPY2FV30041M48` | IP-safe naming pass and prohibited-term gate |
| `CG-0MWPY2HJU006LJMU` | V1 scope statement and deferred list |
| `CG-0MWPY2JEU006DYUL` | Integration, review and verification close-out |
