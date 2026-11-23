# The Long Erasure — Game Design Document (GDD)

> **Status.** Complete design document, in review. This is the single reviewable
> document for the full story-line game; it ships no gameplay code. Settings names
> are final ([§4.2](#42-the-settings-names-final)): the IP-safe naming pass has run
> and its gate reads clean at the review commit
> ([§4.3](#43-prohibited-term-scan-record)–[§4.5](#45-the-prohibited-term-gate-and-how-a-writer-runs-it)).
>
> | | |
> |---|---|
> | **Work item** | `CG-0MWPY25W4002UNKB` (GDD foundation: setting, loop and beat-sheet data model) |
> | **Close-out review** | `CG-0MWPY2JEU006DYUL` (integration, review and verification close-out) — see [§5.4](#54-review-checklist-manual-for-the-producer-and-the-close-out) |
> | **Parent epic** | `CG-0MWNFVLYT003M7XF` (GDD: full story-line game, approach C — scene beat sheet) |
> | **Document path** | `docs/design/storyline-game-gdd.md` (final — see [§4.5](#45-the-prohibited-term-gate-and-how-a-writer-runs-it)) |
> | **Design direction** | Approach **C** (scene beat sheet) with approach A's card chain inside it and approach B's irreversible-loss dial |
> | **Evidence base** | [`docs/gym/long-erasure-observation-log.md`](../gym/long-erasure-observation-log.md) (`CG-0MWNHZEGJ0099JFM`), re-measured by [`docs/design/storyline-playtest-evaluation.md`](./storyline-playtest-evaluation.md) (`CG-0MWPY24IX00719NH`) |
> | **Engine contract composed with** | [`docs/core-engine/story-line.md`](../core-engine/story-line.md) (`@story-line`) |
> | **Section ownership** | [Appendix C](#appendix-c-work-item-map) |

**How to read this document.** Sections 1–2 are the implementer's core: the
setting, the loop, the beat-sheet data model and the composition contract.
Section 3 is the presentation contract, section 4 carries the fixed design
vocabulary and the final naming table, scan record and trademark read, section 5
is the test plan, section 6 is the engine-gap backlog and section 7 is the v1
scope statement and deferred list. [§2.7](#27-sections-owned-by-downstream-work-items)
records which child of the epic wrote each section, so a reviewer can always
trace an assertion back to its source.

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
trade, and abandoning the voyage scored 79 against 83 for finishing — a defect
this GDD corrects by crediting the acts actually played, so the same abandon
re-scores 54 ([§2.10.5](#2105-the-reset-ending-scoring-model)). The GDD
keeps what the spike proved works — CSV authoring with row/column/reason
diagnostics, game-declared resources, seeded determinism, the journal-derived
epilogue and a Phaser-free logic module — and adds only the layer the evidence
says is missing: per-scene objectives, per-scene budgets, explicit outcomes and
a finalised loss ledger.

V1 content target, replayability and the deferred list are fixed in
[§7](#7-v1-scope-statement-and-deferred-list) — three acts, seven scenes,
twenty-one authored scene beats, five endings, a 13-minute target run and a
3,200-word authored budget, with an explicit cut line. The engine work this
design needs is owned by `CG-0MWPY2ECE002P2NH` and listed against each v1
capability in [§7.5](#75-every-v1-capability-against-the-backlog). Neither is a
precondition for building the beat-sheet layer described here.

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
   - [2.9 Writer content pipeline](#29-writer-content-pipeline-csv-authoring-and-the-review-gate)
   - [2.10 Tension, pacing, failure and reset-ending scoring](#210-tension-pacing-failure-and-reset-ending-scoring)
3. [UX, Visual Design and Audio Direction](#3-ux-visual-design-and-audio-direction)
   - [3.1 Presentation surfaces and SLL zone names](#31-presentation-surfaces-and-sll-zone-names)
   - [3.2 Overlay behaviour](#32-overlay-behaviour)
   - [3.3 Audio and SFX mapping](#33-audio-and-sfx-mapping)
   - [3.4 Accessibility](#34-accessibility)
   - [3.5 Determinism, save/load, transcript and replay](#35-determinism-saveload-transcript-and-replay)
   - [3.6 Named presentation gaps](#36-named-presentation-gaps)
   - [3.7 How this section is verified](#37-how-this-section-is-verified)
   - [3.8 What this section does not prove](#38-what-this-section-does-not-prove)
4. [Glossary](#4-glossary)
   - [4.1 Design vocabulary](#41-design-vocabulary)
   - [4.2 The setting's names (final)](#42-the-settings-names-final)
   - [4.3 Prohibited-term scan record](#43-prohibited-term-scan-record)
   - [4.4 Trademark sanity read](#44-trademark-sanity-read)
   - [4.5 The prohibited-term gate, and how a writer runs it](#45-the-prohibited-term-gate-and-how-a-writer-runs-it)
5. [Test Plan](#5-test-plan)
6. [Engine-Gap Backlog](#6-engine-gap-backlog)
7. [V1 Scope Statement and Deferred List](#7-v1-scope-statement-and-deferred-list)
- [Appendix A: The episode manifest (complete worked example)](#appendix-a-the-episode-manifest-complete-worked-example)
- [Appendix B: Evidence base](#appendix-b-evidence-base)
- [Appendix C: Work-item map](#appendix-c-work-item-map)

---

## 1. Core Rules and Mechanics

### 1.1 Setting and tone

**Setting (final names — [§4.2](#42-the-settings-names-final)).** The survey vessel *Ashlight*
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
document or in the content it specifies; the naming table is
[§4.2](#42-the-settings-names-final), the scan record is
[§4.3](#43-prohibited-term-scan-record) and the trademark read is
[§4.4](#44-trademark-sanity-read).

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
- Abandoning the voyage scores **79**, against **83** for finishing the arc;
  the reset-ending scoring model corrects the arc rule so the same measured run
  scores **54** ([§2.10.5](#2105-the-reset-ending-scoring-model)).

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
| Content validation and the route-space guard | **`@story-line` content** | `storylines:validate`, `storylines:guard` | the manifest is validated by `validateEpisodeManifest` (gap [G2](#g2), delivered), not by a second content validator |
| Manifest validation | **Beat sheet** | `storylines:manifest` ([G2](#g2), delivered) | the rules are listed in [§2.4](#24-how-the-beat-sheet-composes-with-story-line) |

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
once for the content file and once in `manifest.resources.declared` (the beat
sheet needs it to validate conditions and loss rules statically). The manifest
validator enforces equality (`resource-set-mismatch`). The spike's *per-row*
repetition is gone: a leading `#resources: …` line declares the set once for
the whole file and a blank `resources` cell inherits it
([§2.9.7](#297-the-spikes-five-authoring-frictions-resolved-or-known-limits)
row 3, delivered by `CG-0MWQYDC7D003G4ON`).

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
| `resources` | `{ declared: string[]; irreversible: string[]; start: Record<string, number>; bounds: Record<string, { min: number; max: number }> }` | required | declared key set (must equal the content file's), the subset the beat sheet never restores, the run's starting bag (`start`, one value per declared key) and the per-key design bounds (`bounds`) — see [§2.8.2](#282-per-key-contract). The block is validated as data: `resource-set-mismatch` enforces declared-set equality with the content file and the structural agreement of `declared` / `start` / `bounds`, so no rule falls back to a game constant (**delivered** — `CG-0MWSJYLZ3005C2V1`) |
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

export interface ResourceBounds {
  min: number;
  max: number;
}

export interface EpisodeManifest {
  manifestVersion: 1;
  id: string;
  title: string;
  content: { adapter: string; file: string };
  resources: {
    declared: string[];
    irreversible: string[];
    start: Record<string, number>;
    bounds: Record<string, ResourceBounds>;
  };
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
| Manifest validator *(delivered — [G2](#g2))* | totality and consistency of the beat sheet (below) | `npm run storylines:manifest` |

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
| `resource-set-mismatch` | `resources.declared` equals the content file's declared set, and the block's `start` / `bounds` entries agree with `declared` (one finite start value per declared key, one well-ordered range per key, the start inside its own range) |
| `clock-cost-mismatch` | *(migration only)* `beat.clockCost` agrees with the legacy CSV `clockCost` cell until the column is retired |
| `ending-successor` | an ending card's successors, if any, resolve to assigned beats (the reset loop) or are absent |

The beat sheet needs a **third** check the content guard cannot perform, because
the clock is not a declared resource: a **scene-space guard** that enumerates
scene exits and beat refusals and asserts two invariants — *no exhausted close
classifies as `success`*, and *no refusal leads to a state with no reachable
ending*. It is a gap ([G3](#g3)); until it exists,
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
expectations table is written in
[§3.5](#35-determinism-saveload-transcript-and-replay).

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
| H2 | Per-scene budgets create a visible trade instead of a silent branch filter | **unproven**; the spike measured the *failure* of the containerless clock (12/138 routes expired, all on one boundary). The rules are now specified in [§2.10.1](#2101-the-clock-a-visible-per-scene-budget); the measurement is still outstanding. | extend the route-space enumeration over the manifest: no beat refusal may lead to a state with no ending; every refusal must route; measure refusals per run and happy-path clock slack | tension design (`CG-0MWPY2AZX001UI2A`, rules delivered; validation pending) |
| H3 | Irreversible loss (hull) + the ledger make loss visible and unrefunded | **unproven**; the spike measured the opposite (loss refunded by the loop; depleted players saw *fewer* options). The mechanism is specified in [§2.10.2](#2102-irreversible-loss-hull-as-the-dial) and the score penalty in [§2.10.5](#2105-the-reset-ending-scoring-model); the diff test is still outstanding. | replay two runs with different hull outcomes and diff the epilogue; assert the ledger is never restored and the epilogue names each ledger line; scoring bands must separate abandon from finish | tension design (`CG-0MWPY2AZX001UI2A`, rules delivered; validation pending) |
| H4 | The composition contract holds — no second choice model, condition language, prose store or RNG | **unproven** (no implementation) | import-boundary test: the beat-sheet module imports only `@story-line` public surface; a content-column test asserts the CSV gains no beat-sheet column; a manifest test asserts `resources.declared` equals the content set | build epic |
| H5 | Five scenes / fifteen beats / five to seven exits is enough structure to fill a v1 act-shaped game without authoring a hub-and-spoke fan | **scoped, still unproven** — [§7.1](#71-the-v1-counts) fixes v1 at 7 scenes / 21 beats / 16 exits inside P4's bands; proving the shape reads as consequence needs the vertical slice | scope the content volume from this shape and compare with the spike's 19-beat file; measure designer hours per scene against the writer's ≈ 8 s branch | scope (`CG-0MWPY2HJU006LJMU`, scoped; vertical slice pending) |
| H6 | The scene boundary is the right line between designer and writer work | **unproven** | author one new scene and one new in-scene branch end to end during the vertical slice; record which file each needed | content pipeline (`CG-0MWPY29730011FJ4`) |

Two further evidence limits are carried forward rather than resolved here: the
spike and the evaluation are **agent-driven structural measurements**, not human
playtests, and the recommendation is to run one human browser playtest — ideally
three people, at least one who has not read the content — before the act
structure is frozen. Nothing in sections 1–2 depends on that playtest; several
claims would be strengthened by it.

### 2.7 Sections owned by downstream work items

Every section below was a stub by design, and every one is now written at this
commit. Each row names the work item that owns it, so a reviewer can see the
whole document's shape and no section is silently forgotten. The resource model
([§2.8](#28-resource-model-and-economy)), the writer content pipeline
([§2.9](#29-writer-content-pipeline-csv-authoring-and-the-review-gate)), the
presentation contract ([§3](#3-ux-visual-design-and-audio-direction)), the
naming and prohibited-term gate
([§4.2](#42-the-settings-names-final)–[§4.5](#45-the-prohibited-term-gate-and-how-a-writer-runs-it)),
the engine-gap backlog ([§6](#6-engine-gap-backlog)) and the v1 scope
([§7](#7-v1-scope-statement-and-deferred-list)) are all delivered; the final row
records the integration and verification pass.

| Section | Contents it must add | Owner |
|---|---|---|
| Resource model and economy | **Written — [§2.8](#28-resource-model-and-economy)**: named key set, ranges, starting values, sources/sinks, each key's failure state and recovery, one worked trade per act, named engine gaps | `CG-0MWPY27EU008QPHN` |
| Writer content pipeline | **Written — [§2.9](#29-writer-content-pipeline-csv-authoring-and-the-review-gate)**: column table, three verbatim worked rows (validated), option-cell grammar, the end-to-end review gate with sign-off roles, the real malformed-entry diagnostics and the five spike frictions with owners | `CG-0MWPY29730011FJ4` |
| Tension, pacing, failure and reset-ending scoring | **Written — [§2.10](#210-tension-pacing-failure-and-reset-ending-scoring)**: the clock as a per-scene budget with two recovery paths, hull as the irreversible dial, numeric pacing rules, the failure/recovery table per type, the scoring inputs/weights/bands with a worked score per band and the earned-not-punitive proof | `CG-0MWPY2AZX001UI2A` |
| Presentation contract | **Written — [§3](#3-ux-visual-design-and-audio-direction)**: the SLL zone table (including three new game zones), overlay behaviour and depth ordering, the `COMMON_SFX_KEYS` map with a reduced-motion alternative per event, accessibility (reduced motion, verbosity/tooltips, colour independence, keyboard/touch), and determinism/save-load/transcript/replay expectations | `CG-0MWPY2CHF003AHE1` |
| Glossary proper nouns and prohibited-term gate | **Written — [§4.2](#42-the-settings-names-final)–[§4.5](#45-the-prohibited-term-gate-and-how-a-writer-runs-it)**: the final naming table with a rationale per name, the recorded prohibited-term scan of this document and its guarded set, the trademark sanity read and the carried-forward review gate | `CG-0MWPY2FV30041M48` |
| Engine-gap backlog | **Written — [§6](#6-engine-gap-backlog)**: every missing capability with unlock, module reference, effort band (with nearest precedent), issue type and disposition; filed items recorded in [§6.6](#66-disposition-record) | `CG-0MWPY2ECE002P2NH` |
| V1 scope and deferred list | **Written — [§7](#7-v1-scope-statement-and-deferred-list)**: the counts table (3 acts / 7 scenes / 21 beats / 16 exits / 5 endings), the playtime arithmetic with its two stated assumptions, the 3,200-word authored budget, the replayability story and targets, the per-capability backlog check and the five-row deferred list | `CG-0MWPY2HJU006LJMU` |
| Integration and review close-out | **Written — this close-out**: the developer-guide link and the reciprocal links (developer guide, README, Gym index, `@story-line` reference), the verification re-run at the review commit ([§5.1](#51-verification-available-at-this-commit) T1–T4 and T7–T14) and the producer review request | `CG-0MWPY2JEU006DYUL` |

---

### 2.8 Resource model and economy

> **Written by `CG-0MWPY27EU008QPHN`.** This section replaces the stub listed in
> [§2.7](#27-sections-owned-by-downstream-work-items). The **shape** of the model
> is fixed here; the **numbers** are the spike's measured values carried as the v1
> baseline, and the tension design
> (`CG-0MWPY2AZX001UI2A`) confirms them rather than re-tuning them: what changes
> is the **container** — per-scene budgets replace the run-wide clock
> ([§2.10.1](#2101-the-clock-a-visible-per-scene-budget)) — not the key values,
> sources or sinks. Any future re-tune must keep the rules in
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

Each gap is an entry in the engine-gap backlog ([§6](#6-engine-gap-backlog)), not
an assumption that it will be fixed. The module named is the one a reviewer can
open at this commit. The **backlog pointer** column names the entry this section
needs and its disposition; [§6](#6-engine-gap-backlog) carries the effort band,
the nearest precedent and the filed work item.

| # | The model needs | Why the engine cannot do it at this commit | Backlog pointer |
|---|---|---|---|
| 1 | **Bounds and clamping** — min/max per key, spill at maximum, clamped loss at minimum | `applyResourceDelta` is unbounded and unvalidated (`src/story-line/resources.ts`); a delta is applied as given, so a gain past the cap silently banks and a loss below zero silently goes negative. No spill or clamp is reported anywhere. | [G4](#g4) — filed (`CG-0MWR0BGVG004UE7X`) |
| 2 | **The start bag and bounds as manifest data** — `resources.start` / `resources.bounds`, so a validator can prove gate reachability from the start | **Delivered as data** — `resources.start` / `resources.bounds` are manifest fields (schema-required whenever the block is present), and the validator's `resource-set-mismatch` rule reads them through the default-free `readManifestStartBag` / `readManifestBounds` read-throughs, so the manifest validator no longer needs a game constant to see the start bag. What remains a gap is the *reachability proof* itself: gate reachability belongs to the scene-space guard ([G3](#g3)) and clamping to the bounds belongs to the economy ledger ([G4](#g4)). | [G2](#g2) — **Delivered** by `CG-0MWSJYLZ3005C2V1` (epic `CG-0MWR0BFMW003856N`) |
| 3 | **Surfaced affordability** — present the option with its requirement ("2 charge needed") | `#cost` is a draw-time **omission** gate: `isOptionAffordable` returns a boolean (`src/story-line/compile.ts`), and the presenting layer deletes the option. There is no requirement object for a UI to render. Measured cost: 32 of 302 instances hidden, 107 of 197 dead turns gate-collapsed. | [G7](#g7) — filed (`CG-0MWR0BI3S008K9Y6`) |
| 4 | **Condition expressiveness** — conjunction ("hull ≥ 5 **and** stores ≥ 3"), "at maximum", or a range | `Condition` is a single `{field, op, value}` (`src/story-line/types.ts`); the beat sheet adds only `{budget: "exhausted"}`. Any compound objective must be authored as data the runner cannot evaluate, or as two scenes. | [G6](#g6) — deferred to the build epic |
| 5 | **The scene clock inside the resource guard** — prove no scene exit strands the player | The clock is not a declared resource, so `src/story-line/content/guard.ts` enumerates the chain only; the scene-space guard is a named gap ([§2.4](#24-how-the-beat-sheet-composes-with-story-line)). | [G3](#g3) — filed (`CG-0MWR0BG9H007AFNU`) |
| 6 | **Irreversibility as an engine guarantee** — refuse any grant to an irreversible key | `resources.irreversible` is manifest data read only by the manifest validator's `loss-not-irreversible` rule; nothing in `@story-line` knows the concept, so `#extra=hull:1` is legal content. At this commit the rule is enforced by authoring discipline and the fixture test. | [G5](#g5) — filed (`CG-0MWR0BHH9002OQUZ`) |
| 7 | **The resource HUD and the act-boundary presentation** — where the trade is *seen* | No SLL zone or component renders the declared keys or marks the loss-bearing subset; the presentation contract is owned by `CG-0MWPY2CHF003AHE1` and the surface does not exist (`src/ui/screen-layout.ts`). | [G8](#g8) — filed (`CG-0MWR0BIPV0074WLM`); the act-boundary half is [G9](#g9) |

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

### 2.9 Writer content pipeline: CSV authoring and the review gate

> **Written by `CG-0MWPY29730011FJ4`.** This section replaces the stub listed in
> [§2.7](#27-sections-owned-by-downstream-work-items). It is written for the
> person who writes the story, not for the person who writes the engine: every
> command below is one a writer runs, every diagnostic quoted is a real one
> produced at this commit, and every limitation is named with the work item that
> owns it. The engine contract behind it is
> [`docs/core-engine/story-line.md`](../core-engine/story-line.md); the visual
> editor is [`docs/dev/storyline-editor.md`](../dev/storyline-editor.md).

The governing rule: **a writer owns rows; a designer owns structure.** A writer
adds, edits and prose story beats in one CSV file and runs the validator. A
writer never edits TypeScript, never edits the episode manifest, and never
hand-edits a generated artefact. The scene, its objective, its clock budget and
its exit routes belong to the beat sheet ([§2.2](#22-the-scene-beat-sheet-data-model))
and to the designer; the beat, its prose and its options belong to the writer.
If a change needs a new column, a new route or a new objective, that is the
designer's row in the manifest and the writer raises it — it is not a CSV edit.

#### 2.9.1 The file

One content CSV per story-line content set, UTF-8, comma-separated, one header
row and one **row per beat**. A row is a *beat*; a beat is a *choice* exactly
when its `options` cell is non-empty (there is no separate "is choice" flag). A
blank optional cell means "nothing authored" — never an empty quoted string with
meaning.

The file is bound to the game by a **content adapter**
([`src/story-line/content/adapters.ts`](../../src/story-line/content/adapters.ts)),
which declares the file's columns and says which of them carry the engine's
generic fields. The adapter is the only place the column set is decided: a
column that is not declared is refused by name rather than ignored, and a
declared column a row omits simply reads as blank (a hard
`missing-required-field` error only for `id` and `name`).

#### 2.9.2 The columns

The **generic columns** exist for every game; the **game columns** below are the
ones this document's worked fixture and the spike declare, and each game's
adapter names its own.

| Column | Required | What it holds | Worked value |
|---|---|---|---|
| `id` | yes (enforced) | Stable beat id, unique in the file. Prefix by act/beat (`le-i-open`) so reading order survives a diff. | `gx-crossing` |
| `name` | yes (enforced) | The beat's title, shown on the card. Sentence case, no full stop. | `The Reef Line` |
| `effect` | yes (GDD rule) | One line describing the beat's event, in the incident-log register ([§1.1](#11-setting-and-tone)). | `The reef shows itself in the swell a heartbeat before the hull does.` |
| `options` | choice rows | The whole option model for the beat — labels, targets, costs, gains, gates and outcome prose. Grammar in [§2.9.3](#293-the-options-cell). Blank on an ending or a non-choice beat. | `Chart the reef\|gx-reef#cost=coins:2#says=…` |
| `storylineId` | yes on a choice row (enforced) | The story-line group id; a choice row with no group is `missing-storyline-id`. | `gdd-worked` |
| `storylineTitle` | yes (GDD rule) | The group's display title, written by every member so the group survives a row being moved. Display-only; not validated. | `The GDD Worked Example` |
| `resources` | choice rows | The **declared resource keys** the row's `#cost` / `#extra` / `#when` attributes may name. A blank cell falls back to `coins`/`reputation`, which would reject every GDD key. Must match the game's declared set ([§2.8.1](#281-the-v1-declared-set-and-what-is-deliberately-not-in-it)). | `"coins,reputation"` |
| `context` | no | The beat's situation paragraph, ≤ 400 characters (`context` budget, [§1.1](#11-setting-and-tone)). A longer one is a **warning**, not an error. | quoted prose |
| `epilogue` | no | The closing paragraph on a terminal beat, ≤ 600 characters. | quoted prose |
| `consequential` | no | The option label(s) whose consequence must persist, `\|`/`;`/`,`-separated, or `*` for all. Drives the guard's rejoin check ([§2.9.5](#295-the-review-gate)). Leave blank on cosmetic choices. | `Chart the reef` |
| `ending` | no | `yes` on a beat that ends a route. Needed when the ending loops back to the first beat (a reset ending); with none marked, endings default to the beats with no outgoing target. | `yes` |
| `trigger` | game column | What causes the beat in the game's own rules. | `Incident` |
| `cost`, `coinDelta`, `reputationDelta` | game column | The spike/Gym adapter's legacy incident columns. A GDD-game adapter declares its own game columns; these are examples, not a requirement. | `0` |

**The two retired columns.** `act` and `clockCost` are beat-sheet data written in
the wrong place ([§2.1](#21-composition-contract-who-owns-what)): act membership
is `scene.id` under `act.scenes`, and pacing is `beat.clockCost` in the manifest.
They stay in the spike file only while the spike's own rule module reads them;
a writer on the GDD game never authors either, and the manifest validator must
reject a disagreeing pair while both exist (engine gap [G10](#g10)).

**"Enforced" means a hard error; "GDD rule" is a reviewer's check.** The
validator refuses a row on the enforced cells and the option attributes; the
writing conventions (a title, an `effect` line, a group title on every member)
are what the designer checks in [§2.9.5](#295-the-review-gate), because they are
about how the beat reads, not whether the file is well formed.

#### 2.9.3 The `options` cell

One cell holds the entire option model. The head is `label|successor`, followed
by zero or more `#`-attributes; `;` separates options:

```text
Cell      := Option (";" Option)*
Option    := Label "|" Successor? Attribute*
Attribute := "#cost=" ResourceList | "#extra=" ResourceList
           | "#when=" Condition ">" Successor | "#says=" Prose
ResourceList := key ":" number ("," key ":" number)*
Condition    := field (">=" | "<=" | "==" | ">" | "<") number
Successor    := card id, or a comma-separated candidate list for a random draw
```

| Attribute | What it does | Example | Read by |
|---|---|---|---|
| head `label` | The button the player reads. Unique per card. | `Chart the reef` | presenter |
| head successor | The card the choice pushes; several candidates = one seeded random draw | `gx-crossing` / `gx-crossing,gx-wait` | `@story-line` resolution |
| `#cost` | An affordability gate **and** a real payment on resolution | `#cost=coins:2` | runtime gate + payment |
| `#extra` | A resource gain on resolution; negative values are rejected | `#extra=reputation:1` | resolution |
| `#when` | One conditional successor (repeatable, authored order, first match wins); empty successor ends the chain | `#when=reputation>=2>gx-end-bold` | resolution, consumes no RNG |
| `#says` | The outcome paragraph the journal and the narration show for this choice | `#says=You buy the pilot's chart…` | presenter + journal |

Rules a writer can be caught by, and cannot be caught by:

- **Reserved delimiters.** `;` separates options, `|` label from successor, `,`
  separates targets and cost/extra pairs, `#` starts an attribute. None may
  appear inside a label or a card id.
- **Prose escaping is `#says`-only.** Inside a `#says` value, `\;` → `;`,
  `\#` → `#`, `\\` → `\`. A `#says` value is exactly one segment: an unescaped
  `;` or `#` is `unescaped-says-delimiter`, and a decoded second segment is
  `says-segment-count`. Everywhere else a backslash is literal, so no existing
  cell changes meaning.
- **An unaffordable option is not shown.** A cost the player cannot pay removes
  the option at draw time; the presentation contract must say *why* rather than
  let it vanish ([§2.8.6](#286-what-the-engine-cannot-express-at-this-commit-named-gaps),
  presentation `CG-0MWPY2CHF003AHE1`). A writer must therefore treat a gate as a
  statement about the *player's bag*, not as a conditional branch that will
  always be reachable.
- **`#when` is checked against post-resolution resources**, which is why
  `#when=charge>=2>…` after a `#cost=charge:2` means "if you still have two after
  paying".

#### 2.9.4 Worked example rows (verbatim, validated)

The three rows below are copied without editing from
[`tests/fixtures/story-line/gdd-worked-examples.csv`](../../tests/fixtures/story-line/gdd-worked-examples.csv).
The header is row 1 (blank lines and wrapped cells do not change the row
number); these are rows 3, 5 and 7.

<!-- gdd-worked-rows -->
```csv
id,name,effect,options,storylineId,storylineTitle,resources,trigger,cost,coinDelta,reputationDelta,context,consequential,ending
gx-crossing,The Reef Line,The reef shows itself in the swell a heartbeat before the hull does.,Chart the reef|gx-reef#cost=coins:2#says=You buy the pilot's chart and the soundings are honest.;Cut the line|gx-wait#says=You cut the tow line and let the current carry the barge clear.,gdd-worked,The GDD Worked Example,"coins,reputation",Incident,0,0,0,"The reef line runs across the channel mouth and the swell shows it a heartbeat before the hull does. The pilot's chart is for sale, and the barge is still on the tow.",Chart the reef,
gx-signal,The Shore Answers,The watch answers and the water opens.,Anchor for the night|gx-end-quiet#says=You anchor inside the harbour wall and the crew sleep.;Run the strait|gx-end-quiet#when=reputation>=2>gx-end-bold#says=You run the strait on the watch's word and the town will remember it.,gdd-worked,The GDD Worked Example,"coins,reputation",Incident,0,0,0,"The watch answers and the channel opens ahead of you. The crew will follow a captain the town trusts, and they are asking which way to run.",
gx-end-quiet,Quiet Harbour,The night ends in a quiet harbour.,,,,,Incident,0,0,0,The night ends in a quiet harbour and the town wakes to a full quay.,,yes
```

What each row is teaching:

- **`gx-crossing`** — a **costed** choice with authored outcome prose and a
  consequential mark. `#cost=coins:2` is both the gate and the payment; the
  label in the `consequential` cell must match an option on this card exactly or
  the guard reports it (that is how a mark is stopped from drifting).
- **`gx-signal`** — a **gated** successor. `Run the strait` falls through to
  `gx-end-quiet` normally, but when the resolving bag has `reputation >= 2` it
  pushes `gx-end-bold` instead. The rule consumes no RNG, so a replay that
  reaches this beat with the same bag takes the same door.
- **`gx-end-quiet`** — a **terminal** beat: no `options`, no `storylineId`, and
  `ending=yes`. The `ending` mark is what makes the route-space guard check the
  ending even though nothing has to link to it.

**Prove the rows yourself** (run from the repository root):

```bash
npm run storylines:validate -- --csv tests/fixtures/story-line/gdd-worked-examples.csv --game gym
```

Expected tail of the report:

```text
ERRORS (0): none
Warnings (0):
  (none)
RESULT: VALID
```

A unit test pins the document to the fixture: the rows in the fenced block above
are compared byte-for-byte with the fixture's rows on every run
([`tests/story-line/content/gdd-content-pipeline.test.ts`](../../tests/story-line/content/gdd-content-pipeline.test.ts)),
so a corrected row cannot leave a stale copy in this document. This is T8 in
[§5.1](#51-verification-available-at-this-commit).

#### 2.9.5 The review gate

The gate is a sequence, and every step is a command a writer can run. Steps 1–3
and 6 are the writer's own pre-flight before anything is committed; steps 4–5
and 7 bring in the reviewer.

| # | Step | Command | Passes when | Owner |
|---|---|---|---|---|
| 1 | **Draft** | the editor (`npm run storylines:editor`) or the `storylines:author` CLI | a pending draft exists and nothing is written yet | writer |
| 2 | **Validate** | `npm run storylines:validate -- --csv <file> --game <adapter>` | `RESULT: VALID`, and every warning read and either fixed or accepted in the change note | writer |
| 3 | **Guard the route space** | `npm run storylines:guard -- --csv <file> --game <adapter> --initial <bag>` (or `npm run storylines:guard` for every configured target) | `PASS` — all three invariants green, no bound hit | writer |
| 4 | **Preview and apply** | editor preview → apply (or `--apply` headless) | the preview diff shows only the intended rows, the validator report inside it is clean, and apply returns `written: true` | writer + designer |
| 5 | **Regenerate artefacts** | automatic on apply; verify with `npm run storylines:graph -- --format json --check` and `--format mermaid --check` | "no drift" — the committed manifest and Mermaid graph match the CSV | writer |
| 6 | **Scan for prohibited IP** | `npm run storylines:ip-scan` (or `-- <file>` for one candidate) | `RESULT: CLEAN`; the scan covers the change's file because that file is in the guarded set ([§4.5](#45-the-prohibited-term-gate-and-how-a-writer-runs-it)) | writer |
| 7 | **Sign off** | a comment on the content work item carrying steps 2–3 and 6's output, and steps 4–5's artefact result | designer approval + producer approval where required (below) | designer / producer |

**Hard errors versus warnings.** A hard error refuses the write and must be
fixed; a warning is reported and never invalidates the content.

| Class | Codes | Meaning and writer action |
|---|---|---|
| Hard error | `duplicate-id`, `missing-required-field`, `missing-storyline-id`, `invalid-option`, `unknown-successor`, `unreachable-card`, `missing-column` | The file will not be written and cannot be committed. Fix the named row/column; `unknown-successor` usually means a typo in a target or a branch authored before its target ([§2.9.7](#297-the-spikes-five-authoring-frictions-resolved-or-known-limits)). |
| Hard error (opt-in) | `cycle-error` | Only with `--fail-on-cycle`. A cycle is otherwise an informational finding — a reset ending is meant to loop. |
| Warning | `prose-budget` (`prose-over-budget`) | `context` over 400 or `epilogue` over 600 characters. Shorten it, or record why in the change note. |
| Guard warning | no `ending` mark; guard bound hit | Mark at least one ending when a route loops back; a bound hit is a **failure**, not a pass — the guard says it cannot prove the invariants and exits non-zero. |

**Artefact regeneration is not optional.** The committed JSON manifest and
Mermaid graph are the review surface for the designer and the drift guard for
CI. An accepted editor edit regenerates both and re-reads them to verify, and
reports `regenerated and verified 2 artefact(s) — no drift`. A CLI-authored edit
does not write them, so the artefact step is always run before commit:
`npm run storylines:graph -- --format json` and `--format mermaid` write them,
`--check` proves it. Hand-written documentation is never rewritten: an edit that
invalidates a hand-maintained page returns a **"manual documentation update
required"** result naming the failing check.

**Sign-off is three roles, and only three.**

| Role | Signs off | Evidence recorded |
|---|---|---|
| **Writer** | the row: prose, labels, targets, costs, the `consequential` and `ending` marks | the validator and guard output pasted into the work-item comment |
| **Designer / balance reviewer** | the branch's *consequence*: it changes the scene, it fits the act's economy, and the cost/gain is affordable from the starting bag ([§2.8.3](#283-the-economy-by-act)) | approval comment quoting the preview diff's `options` cell |
| **Producer** | a new act or scene, a change to a resource's source/sink set, a new proper noun (IP gate, [§4.2](#42-the-settings-names-final)), or a change to the declared resource set | approval comment naming the section of this document that authorises it, plus the `RESULT: CLEAN` line from step 6 |

The writer's own checks (steps 2–3 and 6) are necessary but not a sign-off: the
designer's whole question is *would a player feel this choice?*, which no
validator or scanner can answer.

#### 2.9.6 What happens on a malformed entry

Three surfaces report the same fault in three shapes. All three name the card
and the fault; the validator and the write bridge also give the **row, column,
reason code and dotted path**. None of them writes.

**The validator** (what step 2 prints). A typo'd resource key, produced by
changing one attribute in a copy of the worked fixture:

```text
✗ [unknown-resource-key] row 3, column "options" (unknown-resource-key):
  cost.chrono is not a declared resource (declared: coins, reputation).
```

**The editor / write bridge** (what step 4 returns as JSON, `HTTP 422`). The same
fault through `--apply`:

```json
{
  "status": "invalid",
  "ok": false,
  "code": 422,
  "written": false,
  "preview": {
    "validation": {
      "valid": false,
      "issues": [
        {
          "code": "unknown-resource-key",
          "cardId": "gx-signal",
          "row": 5,
          "column": "options",
          "reason": "unknown-resource-key",
          "path": "options[0].cost.chrono",
          "resource": "chrono",
          "message": "cost.chrono is not a declared resource (declared: coins, reputation)."
        }
      ]
    }
  }
}
```

**The author CLI** (what `storylines:author` prints and refuses). A forward
reference, which is a validity fault rather than a shape fault:

```text
storyline-author: refusing to write — validation failed:
  - Choice card "gx-open" option "Send word ahead" links to unknown card "gx-ghost".
```

**The consequence is always the same: the write is refused and the file is
unchanged, byte for byte.** Only `content/author.ts` writes the CSV, and it
writes atomically (temp file + rename) *after* validation passes, so a refused
edit cannot leave a partial row. The writer can prove this themselves:

```bash
cp tests/fixtures/story-line/gdd-worked-examples.csv /tmp/scratch.csv
md5sum /tmp/scratch.csv     # note the checksum
npx tsx scripts/storyline-author.ts update-card --csv /tmp/scratch.csv --game gym \
  --id gx-signal --options 'Anchor for the night|gx-end-quiet#cost=chrono:1'
md5sum /tmp/scratch.csv     # unchanged: same checksum, exit code 1
```

The editor adds one more refusal a writer should recognise: **`stale-content`
(HTTP 409)**. If the CSV changed on disk since the editor loaded it — someone
else's commit, a branch switch — the write is refused rather than clobbering it,
and the page asks for a reload.

| What you will see | Reason code | The fix |
|---|---|---|
| `option "Take the helm gx-crossing" is missing the "\|" separator` | `missing-separator` | add `\|` between label and target |
| `cost.chrono is not a declared resource` | `unknown-resource-key` | use a declared key, or raise the `resources` cell with the designer |
| `links to unknown card "gx-ghost"` | `unknown-successor` (author API) | author the target card first, or add both in one `add-linked-card` edit |
| `option … attribute "bogus"` | `unknown-attribute` | attributes are exactly `cost`, `extra`, `when`, `says` |
| `Card "gx-open" … is unreachable` | `unreachable-card` | link the new card from an existing card ([§2.9.7](#297-the-spikes-five-authoring-frictions-resolved-or-known-limits) friction 1) |
| `field "context" is a mapped story-line column` | — (author CLI) | author prose with `--context` / `--epilogue`, not `--field` ([§2.9.7](#297-the-spikes-five-authoring-frictions-resolved-or-known-limits) prose) |
| `unknown content column "acts"` | — (author seam) | use the file's real column names; they are listed in the error |

#### 2.9.7 The spike's five authoring frictions: resolved or known limits

The spike timed a complete branch end to end at **≈ 8 s of tool time with no
TypeScript and no engineering help**, and recorded five frictions in the way
([observation log §5](../gym/long-erasure-observation-log.md#5-authoring-ergonomics-timed)).
Re-verified at this commit: **all five are closed for the command line** (work
item `CG-0MWQYDC7D003G4ON`), and each row names the command that closes it. The
sixth friction the section itself found — prose was not authorable from the
CLI — is closed by the same work item and listed after the table.

| # | Friction (as recorded) | Status at this commit | What a writer does now | Owner |
|---|---|---|---|---|
| 1 | **Forward references are refused**, so a branch must be authored backwards from its target | **Resolved** — `add-linked-card` writes the new card **and** its predecessor's option in one validated transaction, so a branch is never half-authored and the authoring order no longer matters. The target-must-exist refusal itself is unchanged (a dangling link must never be writable). | author the branch in one command: `npm run storylines:author -- add-linked-card --id gx-gale --name "The Gale" --link-from gx-reef --link-label "Run before the gale"` | `CG-0MWQYDC7D003G4ON` (delivered) |
| 2 | **`update-card` replaces the whole `options` cell**, so one new option means retyping the rest | **Resolved** — `add-option` appends one encoded entry to the existing cell and leaves every existing option byte-for-byte alone. `update-card --options` still replaces the cell, deliberately, for a wholesale rewrite. | add one branch: `npm run storylines:author -- add-option --id gx-reef --label "Run before the gale" --target gx-gale --attr cost=coins:1` | `CG-0MWQYDC7D003G4ON` (delivered) |
| 3 | **Every row repeats the full declared resource set** in `resources` | **Resolved** — a leading `#resources: hull,morale,stores,goodwill,charge` line before the header declares the set once per file. A blank `resources` cell inherits it; a non-blank cell overrides it (mixed-resource files stay expressible). The declaration is validated per card exactly as before, so `unknown-resource-key` still fires. | declare the set once at the top of the file (`#resources: …`) and leave the column blank on every row | `CG-0MWQYDC7D003G4ON` (delivered) |
| 4 | **No positional insert** — a new card is appended, so reading order drifts from narrative order | **Resolved** — `add-card --after <card-id>` inserts the new row directly after that card's row; omitting `--after` appends exactly as before. Neither form can silently re-point a story-line's entry card: an edit that would move it is refused, naming both the old and the would-be entry and pointing at `add-linked-card --link-from`. | insert where the beat belongs: `npm run storylines:author -- add-card --id le-ii-toll --name "The Toll House" --after le-i-ford` | `CG-0MWQYDC7D003G4ON` (delivered) |
| 5 | **Act and clock are generic `--field` writes**, and a typo'd field name was a silent no-op | **Resolved** — an unknown column is a hard error naming the file's columns (`unknown content column "acts" (file columns: …)`); the legacy columns themselves retire into the manifest ([§2.1](#21-composition-contract-who-owns-what), engine gap [G10](#g10)) | nothing: authoring an `act`/`clockCost` column the adapter does not declare fails loudly | [G10](#g10) — filed (`CG-0MWR0BJXI007UINE`) |

**Prose (found while writing this section): resolved.** `storylines:author` now
authors prose directly: `--context <text>` and `--epilogue <text>` on `add-card`
and `add-linked-card`, and `update-card --context` / `--epilogue` with
`--clear-context` / `--clear-epilogue` to remove it. The mapped columns stay
refused as `--field` keys (the dedicated flag is the path), and prose over the
adopted budget is a warning on stderr — never a blocking error. No editor
session and no `--apply` payload is needed:

```bash
npm run storylines:author -- update-card --id gx-open \
  --context "The tide has turned and the barge is still on the reef line." \
  --epilogue "By morning the reef is empty and the barge is gone."
```

**The diagnostics are the part to keep.** The spike's verdict — "row, column,
reason and the declared set — a writer can fix that without asking anyone" —
still holds, and is why the gate above is written as commands rather than a
process.

#### 2.9.8 Authoring a branch, start to finish (the recipe this section promises)

With the tooling at this commit, a new branch is one linked edit, one validate,
one guard run and one artefact check. Worked on a scratch copy of the fixture:

```bash
# 0. Work on a copy; the tracked content is never touched until the edit is accepted.
cp tests/fixtures/story-line/gdd-worked-examples.csv /tmp/walk.csv

# 1. Add the beat AND its link, in one validated transaction.
#    (The author CLI's `add-linked-card` is the same transaction; the editor
#    CLI is used here because this walk also regenerates the artefacts.)
npx tsx scripts/storyline-editor-cli.ts --content /tmp/walk.csv \
  --artefact-json /tmp/walk-manifest.json --artefact-mermaid /tmp/walk-graph.mmd \
  --apply '{"edit":{"kind":"add-linked-card","spec":{
    "card":{"id":"gx-gale","name":"The Gale",
            "effect":"A gale drives the barge onto the reef line.",
            "context":"The wind backs into the north and the barge begins to set down onto the reef.",
            "options":"Run before it|gx-signal#cost=coins:1#says=You spend the last harbour coin on a tow and beat the gale to the channel.",
            "storylineId":"gdd-worked","storylineTitle":"The GDD Worked Example",
            "resources":"coins,reputation"},
    "linkFrom":{"id":"gx-reef","label":"Run before the gale"}}}}'
# → status "applied", written true, artefacts "regenerated and verified … no drift"

# 2. Validate the result.
npm run storylines:validate -- --csv /tmp/walk.csv --game gym      # RESULT: VALID

# 3. Prove the branch is playable, not just well formed.
npm run storylines:guard -- --csv /tmp/walk.csv --game gym --initial coins=3,reputation=1
# → ✓ gated-branch-survivable: 4 checked, 4 survivable
#   ✓ ending-reachable: 2 checked, 2 reachable
#   ✓ consequential-rejoin: 2 checked, 2 meet the minimum of 2
#   PASS

# 4. Prove the game's committed artefacts match its CSV (the scratch walk's own
#    artefacts were already regenerated and verified by the apply in step 1).
npm run storylines:graph -- --format json --check
npm run storylines:graph -- --format mermaid --check
```

Two failures are the interesting ones, and both were reproduced for this
section:

- **The branch is unreachable.** Validating a copy with a malformed option
  (`|` replaced by a space) reports `invalid-option` **and** two
  `unreachable-card` errors. The first is the typo; the second is its
  consequence. Fix the typo, not the reachability.
- **The branch is unwinnable.** The known-bad fixture
  [`guard-unwinnable-branch.csv`](../../tests/fixtures/story-line/guard-unwinnable-branch.csv)
  validates structurally and still fails the guard on all three invariants —
  which is the guard's positive control:

```text
✗ gated-branch-survivable: 2 checked, 0 survivable
✗ ending-reachable: 2 checked, 1 reachable
✗ consequential-rejoin: 1 checked, 0 meet the minimum of 2
FAIL   (exit code 1)
```

A writer who sees the second shape has a *design* decision, not a typo: make the
gated branch affordable on at least one route to an ending, unmark it as
consequential, or cut it.

#### 2.9.9 What this section deliberately does not promise

- **No scene authoring here.** Objectives, budgets, outcome tables and routes are
  the manifest's job ([§2.2](#22-the-scene-beat-sheet-data-model)–[§2.3](#23-how-a-scene-outcome-selects-the-next-beat)),
  and the manifest validator ships as the `storylines:manifest` CLI (engine gap
  [G2](#g2), delivered — `CG-0MWSJYV86000ZHM4`). A writer cannot yet create a
  scene from CSV, and this
  section does not describe one.
- **No scene-space guarantee.** The route-space guard models declared resources
  only; the pressure clock is not one, so a clock-expiry failure is outside it
  (engine gap [G3](#g3)). The GDD game keeps its own harness until the scene-space
  guard exists.
- **No second choice model.** If a branch cannot be expressed in the `options`
  cell, the answer is a `@story-line` gap filed on
  `CG-0MWPY2ECE002P2NH`, never a parallel format or a hand-edited load path.

---

### 2.10 Tension, pacing, failure and reset-ending scoring

> **Written by `CG-0MWPY2AZX001UI2A`.** This section replaces the stub listed in
> [§2.7](#27-sections-owned-by-downstream-work-items). It fixes the tension
> mechanism, the numeric pacing rules, the failure and recovery contract and the
> reset-ending scoring model. It adds **no data field** (the vocabulary is
> [§2.2](#22-the-scene-beat-sheet-data-model)), adjusts **no resource bound**
> ([§2.8](#28-resource-model-and-economy)), and specifies **no screen position**
> — zone placement, audio and accessibility belong to
> `CG-0MWPY2CHF003AHE1`.

**The design in one paragraph.** Tension has exactly two sources, and both are
visible to the player. The **clock** is a per-scene budget, paid beat by beat,
shown before every commitment, and it can never delete content from the run: a
refusal is a classified scene outcome with an authored door. The **irreversible
dial** is hull, spent only by a named choice or a named failure, recorded in a
ledger, and never refunded. Pacing is counted in beats, decisions, rejoin
distance and act length — not in minutes. Failure is a route, not a cut. The
score is the journal read back: the acts actually played, the choices made, the
resources kept and the costs paid. Every one of those four numbers is printed on
the closing screen, so the player can check the arithmetic that produced the
band.

#### 2.10.1 The clock: a visible per-scene budget

**What changes from the spike.** The spike ran one **run-wide** 17-tick clock.
The evaluation measured what that container does: 12 of 138 routes expire, all
on one boundary (entering `le-iii-approach`), and every expiry ends the run with
no ending card at all — the clock's only outcome was *deletion*. The v1 model
replaces the run clock with a **budget per scene**, declared in the manifest
([§2.2.3](#223-scene)), reset on scene entry and never carried between scenes.
The run-wide clock is retired; act-wide budgets are explicitly rejected in
[§2.2.2](#222-act) because they reintroduce a silent branch filter.

| # | Rule | Mechanism | Measured baseline | Guard |
|---|---|---|---|---|
| T1 | **The clock is per scene, and the scene shows it** | `budget.clock` per scene; the banner shows `clock remaining / budget` and the **next beat's `clockCost` before it is committed** | R2 enters Act III on **1 clock** and still finishes with 1 left — the one recorded run where the boundary is tight enough to feel (the gated route spends 16 of 17 ticks) | the presentation contract must render the cost before commitment (owned by `CG-0MWPY2CHF003AHE1`); the runner refuses a beat whose cost exceeds the remainder and records the refusal |
| T2 | **A refusal is a classified outcome, never a cut** | A beat that cannot be paid is not entered; the scene closes, an outcome rule keyed on `{budget: "exhausted"}` classifies it `failure`, and a `failure` route opens a door | the spike's 12 expiring routes become **12 routed scene failures**, not 12 runs with no ending; `s-iii-core` authors the cliff deliberately (`ahead` 3 of 5, then *Set the charge* 3 more → refused) | the manifest must contain a `{budget: "exhausted"}` outcome rule and a route for it; totality is a manifest validation rule ([§2.4](#24-how-the-beat-sheet-composes-with-story-line)) |
| T3 | **A refusal never deletes content** | the refused beat is recorded in the transcript and the journal as *unreached*, the scene's remaining beats stay unplayed (not skipped silently), and the failure route leads to authored content — a recovery scene or an ending | the refused `le-iii-approach` is followed by the `watch-spent` failure, the `hull-sacrificed` loss and the `quiet-core` ending, so the player still gets a closing screen | the scene-space guard must prove no refusal leads to a state with no ending ([G3](#g3), [§2.8.6](#286-what-the-engine-cannot-express-at-this-commit-named-gaps)) |
| T4 | **A scene failure always leaves a playable budget** | every recovery route opens a **scene**, and every scene entry resets its own budget; a deficit is never carried forward | the model has no run-wide counter to overspend, so the spike's structural failure (Act III unreachable because Act II was slow) cannot recur | the route target must be a `beat`/`ending`, not a clock refund; there is no retry target in v1 ([§2.2.7](#227-routes-and-route-targets)) |
| T5 | **Hidden affordability is not tension** | gates are surfaced as a requirement (`2 charge needed`), not removed; the clock is the only thing that can refuse a *legal* choice | the affordability gate hid **32 of 302 option instances (10.6%)**; **107 of 197** dead turns were gate-collapsed, so the depleted player was shown fewer options, silently | engine gap [G7](#g7) (surfaced affordability, [§2.8.6](#286-what-the-engine-cannot-express-at-this-commit-named-gaps)); a scene with a hidden gate fails pacing review |

**The budget numbers are fixed here.** [Appendix A](#appendix-a-the-episode-manifest-complete-worked-example)
marked its budgets as illustrative and owned by this item; they are adopted as
the v1 baseline: **2 / 2 / 6 / 7 / 5** ticks across the five scenes (22 authored
ticks). A complete run spends **18–20** ticks across the five scenes — 18 on
the cheap shelter walk (2 + 2 + 4 + 7 + 3), 20 on the long one
(2 + 2 + 6 + 7 + 3) — so the budget is not a scarce run-wide resource; it is a
per-scene shape whose size is set by the walk the scene has to afford. The
point of retiring the run clock is that a slow Act II no longer deletes Act III:
the third act's budget is already waiting.

**Sizing rule (reviewed per scene, then pinned by the scene-space guard):**

- An **interior walk** is a path of beats from the scene's entry beat to the
  beat whose choice pushes a card outside the scene. Let `L` be the longest such
  walk's summed `clockCost` and `S` the shortest.
- A **normal scene** sets `budget = L` (no slack, the last tick is the climax)
  or `L + 1` (one spare tick, for a scene that must offer a real choice at the
  exit). `budget < S` is invalid — no complete walk would fit.
- A **deliberate cliff scene** may set `budget = L − 1`, but only if (a) it is
  the only such scene in its act, (b) it authors a `{budget: "exhausted"}`
  outcome rule, (c) it authors a loss rule, and (d) its failure route opens a
  recovery scene or an ending. `s-iii-core` is the worked example.

| Scene | Shortest walk | Longest walk | Budget | Verdict |
|---|---|---|---|---|
| `s-i-open` | 1 (`open` → leave) | 2 (`open` + `log`/`rally`) | 2 | normal, no slack; the last tick is the first decision's consequence |
| `s-i-answer` | 2 | 2 | 2 | normal; transmit-or-silent is the whole scene |
| `s-ii-shelter` | 4 (`shelter` + `salvage`) | 6 (`shelter` + `derelict` + `salvage`) | 6 | normal, **2 slack** on the cheap walk — the act's breathing room |
| `s-ii-offer` | 4 (`offer` + `refuse`) | 7 (`offer` + `bargain` + `keep`) | 7 | normal; the cheap walk keeps 3 slack, the bargain walk spends the last tick |
| `s-iii-core` | 3 (`approach` → ending) | 6 (`ahead` + *Set the charge* → `approach`) | 5 | **deliberate cliff**: the longest walk is refused, and the failure is authored ([§1.4](#14-worked-walkthrough-act-entry-to-scene-outcome)) |

**Recovery paths.** The clock cannot be bought — it is not a declared resource,
and no option can add a tick ([§2.2.3](#223-scene)). Recovery is therefore
structural and authored, never a mid-run refund:

- **C1 — a fresh budget ahead (mandatory).** Every scene entry resets the
  budget, so a refusable scene is always followed by a scene the player can
  play. This is the primary recovery path and it is a property of the data
  model, not of any one route.
- **C2 — an authored recovery door per act (mandatory).** Each act must route
  at least one failure into a scene whose objective is achievable with the
  resources the failure leaves behind. This is the same survivability rule the
  content guard already enforces for gated branches (`gated-branch-survivable`,
  [§2.9.5](#295-the-review-gate)): a failure door that leaves the
  player with no affordable objective is a content bug, not tension.
- **C3 — the reset is the run-level recovery.** The timeline reset starts a
  fresh run at `start` with the starting bag; it is not a refund of the failed
  run's clock or hull ([§2.10.2](#2102-irreversible-loss-hull-as-the-dial)).

**No clock outcome may silently delete content — four guarantees.**

1. A refused beat is *recorded as unreached* in the transcript and the journal;
   it is never simply absent.
2. The scene closes through an authored outcome rule, so the failure has a name
   (`watch-spent`, not “the run ended”).
3. The failure route is authored and total, so the next beat is a door, not a
   stop.
4. The guard enumerates every refusal and asserts that each one reaches an
   ending, the same way the route-space guard asserts every gated branch
   survives.

**What the player sees (content contract, not placement).** The scene banner
carries the scene title and the objective statement; the beat clock reads
`clock remaining / budget` and names the next beat's cost before the choice;
the scene-exit banner names the objective result, the ticks spent, the outcome
word and the door that opened. The spike measured the cost of *not* doing this:
the clock was a silent branch filter, and 64% of policy runs hit at least one
dead turn. Placement and rendering are owned by
`CG-0MWPY2CHF003AHE1`.

#### 2.10.2 Irreversible loss: hull as the dial

**Mechanism.** `hull` is the one key in `resources.irreversible`
([§2.8.1](#281-the-v1-declared-set-and-what-is-deliberately-not-in-it)). It has
**no source, ever**: no option grants it, no scene restores it, no reset refunds
it into the next run. Two loss paths exist, and both use the engine's own
resource seam rather than arithmetic of their own ([§2.2.8](#228-loss-rules)):

1. **Chain loss** — the player pays a `#cost=hull:n` option. The beat sheet diffs
   the resource projection before and after and records a ledger line.
2. **Rule loss** — a scene's `losses[]` rule fires at close, on a named outcome,
   with a player-facing `statement`. The ledger records the rule id, the field
   and the amount.

The ledger is never written to except by those two paths, is never cleared, and
survives the reset ending as part of the record. The score reads the ledger; it
does not re-derive losses from the log ([§2.10.5](#2105-the-reset-ending-scoring-model)).

**What it costs and what it buys.** Hull is the only currency in the game that
can buy *time-adjacent* goods without touching the clock: the derelict locker
trades **1 hull for 2 stores**, and the terminal ram trades **3 hull** for the
destructive ending. In score terms every hull point paid costs **2 points**
(capped at −20), so the same voyage that buys stores is the voyage that scores
lower for prudence — the trade is real on both sides. Measured: R2 spends 8
cost points in total (16 score points, the largest penalty of any recorded run)
and drops `hull 5 → 2`; R4 spends 5 points (10 score points) for `hull 5 → 2`.

**Interaction with the scene budget.** The two dials are deliberately wired:

- The **only involuntary hull loss** is a `losses` rule fired by a scene
  outcome. In v1 those rules may only fire on `partial` or `failure` — a
  `losses` rule on `success` is a validation failure — and `failure` includes a
  budget refusal. The clock can therefore *cause* hull loss, but only through a
  named rule with a printed line.
- **Hull never buys clock.** There is no “pay a hull to buy a tick” option; the
  budget is not a resource. This keeps the failure mode honest: a slow run is
  paid for in permanent damage, never in a convertible currency.
- The **deliberate cliff scene must carry the act's rule loss**. That is what
  makes the arithmetic felt: `s-iii-core`'s refusal applies `hull-sacrificed`
  (−1) and prints *“Breaking for the core on the last of the watch costs the
  hull.”* The loss is the reason the cliff is a decision rather than a bug.

| Hull spend | Trigger | Clock interaction | What it buys | What the score charges |
|---|---|---|---|---|
| `hull:1` (derelict locker) | player choice | none directly; the beat costs clock as usual | `stores:2`, which keeps the Act II objective met | −2 points via the cost ledger |
| `hull:3` (ram the core) | player choice | the ending beat still costs clock | the destructive ending | −6 points via the cost ledger |
| `hull-sacrificed` (−1) | `{budget: "exhausted"}` failure at `s-iii-core` | **caused by** the refusal | the `quiet-core` ending and a continued run | −2 points via the cost ledger, plus the lost objective |

**Why this is a dial and not a second resource.** A second resource would be
bought, banked and spent; hull is none of those. The spike measured exactly why
the difference matters: the run loop refunded every loss at reset, so loss was
*computed* but never *felt*. The rule for v1 content is therefore absolute — an
`#extra=hull` is a validation failure, not a balance decision — and it is
recorded as engine gap [G5](#g5) ([§2.8.6](#286-what-the-engine-cannot-express-at-this-commit-named-gaps)).

#### 2.10.3 Pacing rules, stated numerically

Pacing is counted in units the harness can reproduce deterministically — beats,
decisions, rejoin distance and act length — not in wall-clock minutes. Every
number below is a rule a writer or designer can author against and a reviewer
can measure.

| # | Rule | Number | Measured baseline (what it proves) | Where it is checked |
|---|---|---|---|---|
| P1 | **Beats per scene** | 2–5, target 3 | the five worked scenes hold 3 / 2 / 3 / 5 / 2 beats (mean 3.0); a 6-beat scene is the point at which the middle beats stop being decisions | manifest review; the beat assignment table in [Appendix A](#appendix-a-the-episode-manifest-complete-worked-example) |
| P2 | **Decisions per scene** | every beat after the entry asks a real decision; decision density **≥ 0.90** per act; at most **one** authored single-option transit beat per act, labelled as a transit in the CSV | Act I measured **1.00**, Act II **0.69**, Act III **0.63**; `le-ii-keep` is the authored one-button transit that cost 3 clock | route-space harness (`pacing.decisionDensity`); the content guard's `consequential-rejoin` check |
| P3 | **Minimum rejoin distance for consequential choices** | **3 beats** (fork → distinct beats → different scene outcome); flavour choices may rejoin after 1 beat and must be labelled flavour | **9 of 12** authored forks rejoin one beat later; depth-1 visibility looked healthy (98.1%) while the run read as a menu. `minimum rejoin distance of 3` is the log's measured recommendation | content guard `consequential-rejoin` (positive control: `guard-unwinnable-branch.csv` fails it) |
| P4 | **Act length** | 3 acts; Act I **5–6 beats / 2 scenes**, Act II **8–10 beats / 3 scenes**, Act III **5–6 beats / 2 scenes** | the spike authored **5 / 8 / 2** and Act III ran on 0.63 beats per run — an ending selector, not an act. v1 doubles Act III and adds its second scene | the v1 scope statement (`CG-0MWPY2HJU006LJMU`) fixes final counts inside these bands |
| P5 | **Run length** | 12–16 beats and 10–14 decisions on a single run (5–6 of the 7 authored scenes) | the spike's 160 policy runs: 6 / 7.95 / 10 beats and 5 / 6.98 / 9 decisions (min / mean / max) — short, because thirds of the content converged | harness `beats` / `choices` per run; the scope statement's playtime target |
| P6 | **Dead turns** | **0** authored; **0** gate-collapsed | the spike measured **1.23 dead turns per run** (64% of runs had at least one), of which **107 of 197 were gate-collapsed** — written choices the resource bag removed | route-space harness (`pacing.deadBeats`); surfaced affordability (T5) is the fix |
| P7 | **Scene budget shape** | 2–7 ticks; the budget is the scene's longest interior walk (0 slack), that walk +1 (one spare tick), or −1 for the single deliberate cliff per act; the cheapest walk may keep 2–3 ticks as its reward | the five worked scenes: 2 / 2 / 6 / 7 / 5, each equal to its longest walk except the cliff; the spike's single 17-tick clock had no per-scene shape at all | the sizing rule in [§2.10.1](#2101-the-clock-a-visible-per-scene-budget) and the scene-space guard |
| P8 | **Ending length** | 1 beat; the ending card carries no options except the post-ending restart | every recorded run ends on one card (R1–R4); the spike's endings are terminal cards, not scenes | content review; the `endings[]` manifest list |

**The measured examples behind the rules.**

- **P1/P2 — the empty dramatic beat.** The `first` policy spends 3 clock on
  `le-ii-keep` *The Weave Advances*, a beat with one button (*Follow the
  thread*), then enters Act III with 1 clock. The joint-largest clock spend of
  the run buys a turn that asks nothing. A 5-beat scene with one authored
  transit is the rule's answer; two would make the scene a corridor.
- **P3 — the slideshow.** Nine forks rejoin one beat later, so the choice is
  visible (98.1% of decisions reach a different next card) but not
  *consequential* (the run reconverges before the scene closes). A 3-beat
  rejoin distance is the smallest distance at which the fork can change a scene
  outcome rather than a line of prose.
- **P4 — Act III is not an act.** 0.63 beats per run means most players see one
  beat and an ending. Doubling Act III to two scenes of 5–6 beats is the
  structural fix; the score's Act III weight (25 of 60 arc points) is the
  reason it is worth playing.
- **P6 — the gate, not the writer, made the dead turn.** `le-ii-bargain` and
  `le-ii-salvage` are authored as real choices; `107 of 197` dead turns exist
  because the resource bag removed those options on that visit. Surfacing
  affordability (T5) converts them back into decisions.

#### 2.10.4 Failure and recovery, per failure type

Failure is a **classified outcome with a route**, not an end state. The table
below is the contract; the prose after it is the rule a designer applies when
authoring the scene.

| Failure type | Trigger | Immediate effect | What the player keeps | What it costs | How the run continues | Recorded in |
|---|---|---|---|---|---|---|
| **Scene failure (objective unmet)** | the scene closes with `{objective: "unmet"}` and a matching outcome rule | outcome `failure`; matching `losses` rules fire through the engine seam; the scene-exit banner names the objective, the ticks spent and the outcome word | every resource not spent, the journal, the loss ledger, and **act credit for every act in which a choice was made** | the success door (and whatever it carried); any authored loss rule (e.g. `hull-sacrificed`); the objective's benefit for the rest of the act | the `failure` route opens a recovery scene or an ending; the clock is fresh on entry (T4) | transcript `scene-exit`, journal, loss ledger |
| **Budget exhaustion (a beat refused)** | a beat's `clockCost` exceeds `clock remaining` at entry | the beat is **not entered** and nothing is charged; the scene closes; `{budget: "exhausted"}` classifies it (`failure` by convention); the refused beat is journaled as unreached | everything earned before the refusal — resources, ledger lines, act credit, journal — **and an ending is still reachable** by the authored failure route | the ticks already spent, the beat that could not be played, and the loss rule attached to the refusal (e.g. −1 hull) | the failure route opens the act's recovery scene or ending (the worked example: `watch-spent` → `hull-sacrificed` → `quiet-core` → *A Quiet Chart*) | transcript refusal record, journal, loss ledger |
| **Resource at zero (a gate closes)** | a `#when` or `#cost` requirement exceeds the remaining key | the option is **shown as unaffordable with its requirement**, not removed (T5); no state changes | every other key, the journal, the ledger, and the free doors — every scene's routes are total, so zero is never a dead end | the gated door and its outcome; no hull loss unless a rule says so | the player chooses among the affordable doors; each key's zero-state recovery is the *Recovery path* column of [§2.8.2](#282-per-key-contract) (e.g. hull zero has no refund; morale recovers from an authored Act I source) | the option list + the scene-exit record |
| **Not a failure: the run ending** | the run reaches an ending card (reset, quiet, ram, abandon) | the closing screen renders the ending prose, the score, the band and the surviving journal | everything: the record is the run's only permanent output ([§2.10.5](#2105-the-reset-ending-scoring-model)) | nothing — the ending is not scored as a punishment; the ending card's own act contributes 0 arc points | `[ Begin a new survey ]` restarts at `start` with the starting bag; the hull is not refunded | epilogue screen + transcript |

**Rule for designers.** A failure route must satisfy the same test as a gated
branch: it must be reachable *and* survivable. A failure door that lands the
player in a scene whose objective cannot be met with the resources the failure
leaves behind is a content bug, and the guard must report it (C2 above). The
spike measured the failure mode the rule prevents: the goodwill-gated branch was
reachable and **unwinnable** (4 routes entered, 0 finished), and the lowest band
was reserved for the player who earned the secret path.

**What the player keeps, in one sentence.** They keep the record — every
journal line, every ledger line, every unspent resource, and the act credit they
earned — and they always keep a door: no failure type in the table can leave a
run without a route to an ending.

#### 2.10.5 The reset-ending scoring model

**Principle.** The score is **journal-derived**: it is computed from the voyage
the player actually made, never from a win/loss flag and never from which
ending card they stopped on. The closing screen shows the four ingredients, so
the player can check the arithmetic that produced the band. The weights and
bands below are the `JOURNEY_SCORE_TABLE` / `JOURNEY_BANDS` constants the Gym
already exports ([`GymLongErasureGame.ts`](../../example-games/gym/GymLongErasureGame.ts));
this section fixes the **arc rule** they are read through.

**Inputs.**

| Component | What it reads | Bounds | Why it is in the score |
|---|---|---|---|
| **Arc** | the declared acts in which the journal records **at least one choice made**; the `Ending` act is never credited | 0–60 | depth of the voyage: how much of the story was actually played |
| **Choices** | `history.length` × `perChoice` | 0–12 | breadth: the player kept making decisions rather than riding one corridor |
| **Resources** | each remaining declared key, capped per key | 0–20 | prudence: what survived the voyage (capped so an unspent stock cannot dominate) |
| **Losses** | resource points paid as option costs (the loss ledger) × `perCostPoint`, capped | −20–0 | the irreversible dial: what the voyage cost, charged once and visibly |
| **Total** | the four components, clamped | 0–100 | a stable, printable number with a stable band label |

**Weights (unchanged from the spike).**

| Weight | Value |
|---|---|
| Arc: Act I / II / III / Ending | 15 / 20 / 25 / **0** |
| Per choice / choice cap | 2 / 12 |
| Per remaining resource point / cap per key | 1 / 4 |
| Per cost point paid / loss cap | −2 / 20 |
| Total clamp | 0–100 |
| Bands (inclusive lower bound) | 80 *A chart worth keeping*; 60 *A voyage that left a mark*; 40 *A voyage the erasure nearly kept*; 20 *A voyage remembered only as a gap*; 0 *A voyage the timeline never noticed* |

**The arc rule, and the reconciliation with `CG-0MWNSR376002QBY9`.** The spike
currently credits **every act before the entered ending card**
(`recordActsBefore(working, ACT_RANK.Ending)` in `GymLongErasureGame.ts`), so
entering `Abandon the voyage` — a terminal card reachable from Act II — awards
the full **60** arc points. That is the defect the open item filed: the measured
`abandon` route scores **79** (*A voyage that left a mark*, 4 points below
finishing at 83). The v1 rule this document adopts is content-agnostic and
journal-derived:

> **An act is credited when the journal records at least one choice made in that
> act. The `Ending` act is never credited.**

The history already carries the act of every choice
(`LongErasureHistoryEntry.act` in `GymLongErasureGame.ts`), so the rule is a
derivation over `state.history` and needs no new bookkeeping in `enterCard`:
the scored act set is `new Set(history.map((entry) => entry.act))` minus
`'Ending'`. That is what makes the rule auditable: the arc cannot disagree with
the journal, because the journal is the input.

The consequences, which the implementing item must pin:

| Run | Spike arc (acts before the ending) | v1 arc (acts played) | Current total | v1 total | v1 band |
|---|---|---|---|---|---|
| R1 `reset-cheap` (Acts I–III played) | 60 | 60 | 83 | **83** | *A chart worth keeping* |
| R2 `gated-sabotage-core` (I–III) | 60 | 60 | 67 | **67** | *A voyage that left a mark* |
| R4 `ram-chip` (I–III) | 60 | 60 | 75 | **75** | *A voyage that left a mark* |
| R3 `abandon` (I–II played, ending entered from Act II) | 60 | **35** | 79 | **54** | *A voyage the erasure nearly kept* |
| Act II expiry at the Act III door (8 beats, `le-iii-approach` refused) | 15 (the failed Act III entry records nothing) | **35** | 31 | **51** | *A voyage the erasure nearly kept* |

The expiry row is the **one place this document corrects the open item's
plan**. `CG-0MWNSR376002QBY9`'s plan predicts “expiry unchanged” on the reading
that an unplayed beat earns no act credit; that is true of the *unpayable* Act
III beat, but the run played eight beats and five choices in Act II, and the
rule above credits the act that was played. Leaving that run at 15 arc points
would punish the player for the clock rather than the voyage — the exact
“punitive, not earned” failure the item exists to fix. The implementing item
should either credit the Act II played beats (31 → 51) or record a deliberate,
documented second clause; this section chooses the former. The correction is
recorded as a comment on `CG-0MWNSR376002QBY9`.

**Alternative considered and rejected: strict “acts advanced beyond”.**
Crediting only acts the run advanced *beyond* would give the abandon 15 arc
points (total 34) and the Act II expiry 15 (total 31). It is rejected because
the same reading strips Act II credit from a run that played five Act II beats
and makes abandoning *less* informative than an expiry it outlasted; and the
parent AC's primary clause is “the acts *played*”, with “acts advanced beyond”
offered only as an example. The chosen rule is the primary clause read
literally.

**Worked score per band (a reviewer can check every line).**

| Band | Worked run | Arithmetic | Total | Source |
|---|---|---|---|---|
| **80–100** *A chart worth keeping* | R1 `reset-cheap`, default content, 7 choices | arc 60 (I + II + III) + choices 12 (7 × 2, capped) + resources 15 (hull 5 capped at 4, morale 6 capped at 4, stores 3, goodwill 2, charge 2) − losses 4 (2 cost points × 2) | **83** | evaluation §1; reproduced by `npx tsx scripts/long-erasure-playtest.ts --seeds 12` |
| **60–79** *A voyage that left a mark* | R2 `gated-sabotage-core`, 9 choices | arc 60 + choices 12 + resources 11 (hull 2, morale 5 capped at 4, stores 4, goodwill 0, charge 1) − losses 16 (8 cost points × 2) | **67** | evaluation §1 |
| **40–59** *A voyage the erasure nearly kept* | R3 `abandon`, corrected arc rule | arc 35 (I + II) + choices 10 (5 × 2) + resources 13 (hull 5 capped at 4, morale 5 capped at 4, stores 3, goodwill 0, charge 2) − losses 4 (2 cost points × 2) | **54** | evaluation §1 + the v1 arc rule above |
| **20–39** *A voyage remembered only as a gap* | `first` policy, `clockMax: 10`, expired in Act I | arc 15 (Act I) + choices 12 (6 × 2, capped) + resources 15 (hull 5 capped at 4, morale 7 capped at 4, stores 6 capped at 4, goodwill 0, charge 3) − losses 4 (2 cost points × 2) | **38** | terminal band probe (explicit `clockMax`, like the pinned worst run in `tests/gym/LongErasureEpilogue.test.ts`) |
| **0–19** *A voyage the timeline never noticed* | `first` policy, `clockMax: 5`, expired before Act II | arc 0 + choices 6 (3 × 2) + resources 14 (hull 4, morale 4, stores 4, goodwill 0, charge 2) − losses 4 (2 cost points × 2) | **16** | terminal band probe (explicit `clockMax`) |

**One honest consequence of the corrected rule.** On the default spike content
the lowest scoring terminal route becomes **50** (an abandon that paid every
cost), because Act II is now credited whenever it was played. The two lowest
bands are therefore reachable in the shipped content only through an explicit
clock override — the test's `clockMax` probe — or through a no-choice failure.
That is a **content** observation, not a scoring defect: v1 must author at least
one early terminal (an Act I hatch or a failure route that ends the run) so the
bottom two bands are reachable in play, and the scope statement
(`CG-0MWPY2HJU006LJMU`) carries that as a content requirement.

**The exact summary the player sees.** The content contract, in render order;
zone placement and typography are the presentation contract's job:

```text
The voyage ends — 3 of 3 acts reached
The Long Erasure
The timeline was unwound. This record is the voyage that survives.
Journey score: 83 / 100 — A chart worth keeping
Arc 60 · Choice breadth 12 · Resources 15 · Losses −4
Acts: I · II · III    Choices: 7    Cost paid: 2
Left when the timeline closed: hull 5, morale 6, stores 3, goodwill 2, charge 2
── The record that survives ──
• <journal line> — <outcome line>
[ Begin a new survey ]
```

The ending card's authored `epilogue` prose renders in the narrative panel above
the score; when the content authors none, the outcome framing line (the third
line above) is the fallback. The component line (`Arc … · Choice breadth … · Resources
… · Losses …`) is the v1 addition: it is the arithmetic proof that the band is
earned, and every number on it is one the player can map to the run.

**The “earned, not punitive” test.** The model passes it on arithmetic, not
intent:

1. **Traceable.** Every point has a visible source: an act reached, a journal
   line, a resource left, a cost paid. Nothing is scored from a hidden flag.
2. **No ending penalty.** The ending card's act carries **0** arc points, so
   choosing *A Quiet Chart* over *The Long Erasure* is never itself a
   deduction; only the voyage before it is scored.
3. **No hidden deduction.** The only subtraction is the cost ledger, which
   records only resource points the player paid, plus named failure loss rules
   that print a `statement` at the moment they fire.
4. **Bounded.** Every component is capped (choices 12, resources 20, losses
   20), so one expensive scene cannot erase an otherwise earned voyage.
5. **The top band is earned, with headroom.** 80 requires all three acts (60)
   plus at least 20 of the remaining 40 points, and there are two ways to earn
   them (choice breadth or resource prudence). The authored content's maximum
   is 92 (60 + 12 + 20), so the clamp at 100 is a guard, not a treadmill.
6. **Abandoning cannot land in the top band — arithmetically.** A run that ends
   in Act II can score at most **35 + 12 + 20 − 0 = 67**, which is **13 points
   below** the top threshold. The old 79 was a defect of the arc rule, not a
   property of the weights.
7. **Finishing beats abandoning by a clear margin.** For two runs sharing a
   prefix and diverging only on the Act II hatch, the finisher gains Act III's
   **25** arc points and the abandoner gains none, so the margin is at least
   **25 ≥ 15** before resources and costs are counted.
8. **The low bands are honest, not punitive.** They describe a voyage that ended
   early, and the closing screen still gives the player the record, the ending
   prose and `[ Begin a new survey ]`. A low score is a description of the
   voyage, never a verdict on the player.

The one thing the model deliberately does **not** reward is *reaching an
ending*. An ending is the run's conclusion, not a win condition; the voyage is
the score.

#### 2.10.6 What this section does not prove

- **H2 and H3 remain unproven.** The rules are written; no vertical slice has
  yet played them. The falsification tests are in
  [§2.6](#26-hypotheses-and-how-they-will-be-validated).
- **The arc rule is not yet implemented.** The Gym still scores the old rule
  (abandon 79; Act II expiry 31). The deltas in
  [§2.10.5](#2105-the-reset-ending-scoring-model) are the contract for
  `CG-0MWNSR376002QBY9`, not a measurement of the shipped spike.
- **No human playtest.** All numbers are agent-driven structural measurements;
  the recommendation to run one human browser playtest before the act structure
  is frozen still stands.
- **The scene-space guard does not exist.** Proving that no refusal strands a
  run requires the guard named as engine gap [G3](#g3); until then, the GDD game
  keeps its own harness.
- **The bottom two bands are unreachable on the default spike content** after
  the arc correction (minimum 50). The v1 scope statement must require an early
  terminal so the bands are reachable in play.

#### 2.10.7 How this section is verified

| # | Claim | Command | Expected |
|---|---|---|---|
| T9 | The documented weights, caps, bands and the best/mid/worst worked scores are the ones the module exports and scores | `npx vitest run --project unit tests/gym/LongErasureEpilogue.test.ts` | pass — the table, the five band boundaries and the 87 / 42 / 0 pins (the abandon re-score is pinned by `CG-0MWNSR376002QBY9`) |
| T10 | The measured abandon route lands below the finishing routes after the arc correction | `npx tsx scripts/long-erasure-playtest.ts --seeds 12 --route "abandon=Log the erasure>Stay silent>Shelter in the dead zone>Ration the stores>Abandon the voyage"` | pass — the route now scores 54 (*A voyage the erasure nearly kept*, arc 35) against R1 83 / R2 67, pinned by `tests/gym/LongErasureEpilogue.test.ts` (`CG-0MWNSR376002QBY9`, delivered) |
| T11 | Every consequential choice meets the minimum rejoin distance, and the guard fails on the known-bad branch | `npm run storylines:guard -- --csv tests/fixtures/story-line/gdd-worked-examples.csv --game gym` and the positive control in [§2.9.5](#295-the-review-gate) | `PASS` on the worked content; `FAIL` on `guard-unwinnable-branch.csv` |
| T12 | The scene budgets satisfy the sizing rule (no scene without a complete walk; one deliberate cliff per act, with a `budget: exhausted` rule, a loss rule and a failure route) | review check against [Appendix A](#appendix-a-the-episode-manifest-complete-worked-example), then the scene-space guard when it exists | every scene in the table passes; `s-iii-core` is the only cliff and carries all four preconditions |

**Review checks (manual).**

1. **Earned, not punitive.** Walk any worked score in
   [§2.10.5](#2105-the-reset-ending-scoring-model) from the summary lines; if a
   point cannot be traced to a line, the model is wrong.
2. **No silent deletion.** Every refusal has a transcript entry, a journal line
   and a route; every scene's outcome table includes `{budget: "exhausted"}`.
3. **The dial is unrefunded.** `#extra=hull` appears nowhere; every hull loss
   has a ledger line and a printed statement.
4. **Pacing.** Apply P1–P8 to the manifest and to one written scene; a scene
   that fails P2 or P7 goes back to the designer before the writer sees it.

---

## 3. UX, Visual Design and Audio Direction

> **Written by `CG-0MWPY2CHF003AHE1`.** This section replaces the stub listed in
> [§2.7](#27-sections-owned-by-downstream-work-items) and closes the presentation
> and technical contract the rest of this document defers to. It invents no data:
> every surface below renders a field sections 1–2 already define, every sound is
> an existing `COMMON_SFX_KEYS` value, and every capability the engine cannot
> supply is a pointer to the engine-gap backlog
> ([§6](#6-engine-gap-backlog)), not a promise.
>
> The baseline is the spike's rendered surface. `GymLongErasureScene` plus
> `example-games/gym/layouts/gym-long-erasure.layout.json` prove, at this commit,
> that one SLL document, a `SoundManager`, `revealNarration`, `paginateProse`,
> `shakeIllegalMove` and `popTextOrIcon` compose into a playable narrative screen.
> The full game **keeps that screen** and adds three zones — scene banner,
> objective panel and epilogue — which are layout data, not engine work.

### 3.1 Presentation surfaces and SLL zone names

One layout document — the game owns `gdd-long-erasure-layout` (version 1, base
viewport 1280 × 720) — declares every zone and anchor the game resolves. Scenes
call `parseScreenLayoutDocument()` once, then `anchorPoint()` per element,
exactly as the spike does; **no scene passes a literal coordinate to a text,
button or container**. `validateScreenLayoutDocument()` runs before the first
render, so a malformed layout is a startup failure rather than a silently
misplaced surface.

A **zone** is a named normalised rectangle (a surface's reserved area); an
**anchor** is a named normalised point inside it. The table is the contract:

<!-- gdd-presentation-zones -->

| Surface | Zone | Anchors (`zone.anchor`) | Data rendered | Engine status | Gym reference |
|---|---|---|---|---|---|
| Resource HUD | `statusBar` | `statusBar.act`, `statusBar.clock`, `statusBar.nextBeatCost`, `statusBar.resources`, `statusBar.losses` | act title; `clockRemaining / budget.clock`; the next beat's cost; `storyline.engine.getResources` over the declared keys; the summed irreversible deltas | **Shipped** in the spike layout; `nextBeatCost` and `losses` are new anchors — layout data, no engine change | `GymLongErasureScene` |
| Act/scene banner | `sceneBanner` | `sceneBanner.actTitle`, `sceneBanner.sceneTitle`, `sceneBanner.outcome`, `sceneBanner.route` | `act.title`, `scene.title`; at a scene close, the `scene-exit` record's outcome word and the opened door ([§2.3](#23-how-a-scene-outcome-selects-the-next-beat)) | **New game zone**; `screen-layout-schema.ts` accepts any zone name. The *data* needs the beat-sheet layer (gap B1); the *transition motion* needs gap B5 | `GymHudComponentsScene` (panel chrome) |
| Objective panel | `objectivePanel` | `objectivePanel.statement`, `objectivePanel.status` | `objective.statement`; pending / met / unmet, evaluated once at scene close | **New game zone**; the data needs gap B1. Keep the statement within 90 characters ([§2.2.5](#225-objective)) | `GymHudComponentsScene` (panel chrome) |
| Beat narrative | `narrative` | `narrative.beat`, `narrative.title`, `narrative.effect`, `narrative.context`, `narrative.contextMore` | the compiled card: id, title, effect line, authored `context`; prose longer than the panel budget is **paged** by `paginateProse()`, never clipped | **Shipped** in the spike layout | `GymLongErasureScene` |
| Choice list | `options` | `options.option1` … `options.option6` | `@story-line` compiled options, gated by `isOptionAffordable`; an unaffordable option is **shown** with its shortfall, not removed ([§1.5](#15-approach-decision-a-vs-c)) | **Shipped** (`option1`–`option4`); v1 declares six anchors at a 0.062 vertical step, which is 44.6 design px at 720 | `GymSllScene` (composed anchors), `GymLongErasureScene` |
| Feedback line | `feedback` | `feedback.center` | one-line confirmation of the choice just made, and the refusal reason when a beat or option is refused | **Shipped**; the reason itself comes from `shakeIllegalMove`'s toast | `GymLongErasureScene` |
| Journal (inline ticker) | `journal` | `journal.heading`, `journal.body` | `buildJournal` / `runJournal` over the activity log, including `scene-exit` lines; the ticker shows the newest row only | **Shipped**; the full journal is the modal overlay ([§3.2](#32-overlay-behaviour)) | `GymLongErasureScene`, `GymOverlayUiScene` (overlay) |
| Epilogue | `epilogue` | `epilogue.endingTitle`, `epilogue.epilogueProse`, `epilogue.score`, `epilogue.band`, `epilogue.ledger`, `epilogue.journalSummary`, `epilogue.restart` | the ending card's `epilogue` prose, the score and band from [§2.10.5](#2105-the-reset-ending-scoring-model), the loss ledger, the surviving journal, and the post-ending action | **New game zone** rendered by game code; `buildEpilogue` and the scoring model exist (spike). The restart action needs the runner (gap B1) | `GymLongErasureScene` (ending screen), `GymAudioFeedbackScene` (score pop) |
| Controls | `controls` | `controls.journal`, `controls.help`, `controls.settings` | `[ Journal ]`, the engine `HelpButton`/`SettingsButton`, and (on the epilogue) `[ Begin a new survey ]` | **Shipped** (`controls` in the spike; the buttons are engine components) | `GymHudComponentsScene` |

**Zone rules.**

1. **One reserved area per surface.** A zone may carry several related anchors —
   the status bar carries the act, clock and resource HUD because they share one
   glance-line — but two unrelated surfaces never share a zone, so a layout
   change cannot move a surface the designer did not intend to move. `epilogue`
   is a full-screen state in the *same* document, not a second document, so the
   epilogue anchors move with the rest of the HUD.
2. **No absolute coordinates, anywhere.** Positions come from `anchorPoint()`;
   the only numbers a scene may pass are relative offsets *inside* an anchor's
   box. The guard in [§3.7](#37-how-this-section-is-verified) fails the build if
   the contract section regrows a coordinate pair.
3. **Prose is paged, never clipped.** `narrative.context` uses `paginateProse()`
   and `epilogue.epilogueProse` uses the same helper; a surface that cannot fit
   its text is a layout defect, not a licence to truncate the writer's prose.
4. **Tap targets have a floor.** The option anchors sit at a fixed 0.062
   vertical step (44.6 design px at 720), so no option is a thinner target than
   44 design px. Six anchors are headroom over the widest authored card (four
   options in the spike content), so a future card with five or six choices does
   not need the column re-laid out.
5. **The inline journal is a ticker.** The full journal is the overlay, so the
   deepest scene (six options) never competes with the journal for vertical
   space; the ticker keeps the record visible without stealing the choice column.
6. **The loss ledger is never a separate live zone.** Its permanent record is
   `epilogue.ledger`; its live presence is `statusBar.losses` (for example
   `hull −2`). A positive ledger line is what a refund would look like, and the
   model forbids one ([§2.10.2](#2102-irreversible-loss-hull-as-the-dial)).
7. **Colour is never the only channel.** Every state the palette distinguishes is
   also printed ([§3.4.3](#343-colour-independent-signalling)).

### 3.2 Overlay behaviour

The game has five overlay-like states, one transient toast and one in-layout
banner state (listed so the banner is not mistaken for an overlay). All of them
use the shared component or SLL zone named in the table; none is hand-rolled.

<!-- gdd-presentation-overlays -->

| Overlay | Trigger | Engine component | Depth (backdrop / box / content) | Input blocking | Dismiss | State effect | Reduced motion | SFX |
|---|---|---|---|---|---|---|---|---|
| Help | `HelpButton` | `HelpPanel` | HUD container 1000; panel blocker 900 / background 901 / content 902 / close 903 | Full-viewport blocker | Close button; `?` toggles (engine default `toggleKey`) | none | Appears instantly (engine panel) | `COMMON_SFX_KEYS.UI_CLICK` |
| Settings | `SettingsButton` | `SettingsPanel` (`hasTooltips` config) + `getReducedMotion` / `getTooltips` / `getEndTurnKeybind` | as Help | Full-viewport blocker | Close button; Escape (engine default `toggleKey`) | none; toggles apply immediately | Appears instantly | `COMMON_SFX_KEYS.UI_CLICK` |
| Journal | `controls.journal` | `createOverlayDialog` (renderer-aware clip through `createContainerClip`) + `paginateProse` pages | engine defaults 200 / 201 / 202 inside `hudContainer` | Backdrop swallows pointer input | Close button; Escape; page buttons are the only vertical control (no wheel-only path) | none (read-only) | Appears instantly; no page-turn tween | `COMMON_SFX_KEYS.UI_CLICK` |
| Confirmation | Epilogue restart; abandoning an ending | `createOverlayBackground` + `createOverlayButton` + `dismissOverlay` | 199 / 200 / 201 inside `hudContainer` | Backdrop swallows pointer input | Explicit confirm or cancel button; Escape = cancel | Mutates **only** on confirm; cancel leaves the run byte-identical | Appears instantly; no scale/fade | `COMMON_SFX_KEYS.UI_CLICK` |
| Resume | Startup with a checkpoint | `CheckpointManager.checkAndResume` + `createDefaultResumeOverlay` (or the game's own) | 199 / 200 / 201 inside `hudContainer` | Backdrop swallows pointer input | Resume or fresh-run choice; Escape = keep the save | Loads the checkpoint **or** starts fresh; a fresh start never deletes the old save until confirmed | Appears instantly | `COMMON_SFX_KEYS.UI_CLICK` |
| Illegal-move toast | A refused beat, unaffordable option or stale click | `shakeIllegalMove` (tint + shake + reason toast) | toast 1900 | none (non-blocking) | Auto-dismiss | none | No shake; the toast **still appears** | `COMMON_SFX_KEYS.ILLEGAL_MOVE` (automatic) |
| Scene-exit banner | A scene close | the `sceneBanner` zone, not an overlay | in-layout (below HUD) | none | Advances with the route | none (the route read the outcome) | Instant text swap; no transition | `COMMON_SFX_KEYS.TURN_CHANGE` |

**Overlay rules.**

1. **Everything is parented into `hudContainer`.** Text, buttons and the modal box
   itself — otherwise the content renders behind the backdrop (the project's
   most common overlay defect). `createOverlayDialog` parents its own objects;
   a hand-built modal must do the same.
2. **One modal at a time.** Opening a second modal closes the first, so a
   confirmation can never be buried under the journal and the run state can
   never be edited through two paths.
3. **Escape closes the topmost modal, never the game.** For the journal,
   confirmation and resume modals the game binds Escape once and removes the
   listener on teardown. The engine's own panels keep their default toggle keys
   (`?` for Help, Escape for Settings), and the game never opens both at once,
   so the bindings cannot collide.
4. **Destructive confirmations require an explicit button.** A backdrop click or
   Escape cancels; it never confirms a restart or an abandon.
5. **A modal that scrolls must also page.** The journal paginates with
   `paginateProse()` and page buttons instead of relying on the dialog's wheel
   handler, because a wheel-only path is unreachable on touch. This is a design
   decision, not a missing feature.
6. **Depth ordering is one convention, two bases.** A hand-built modal uses
   backdrop 199, box 200 and interactive content 201; `createOverlayDialog`
   ships the same ordering on its own base (200 / 201 / 202). Either is correct
   as long as the ordering holds, every object is parented into `hudContainer`,
   and one modal never mixes the two bases. Modal content always sits above the
   HUD's own panels and far below the illegal-move toast (1900).

**Gym references.** `GymOverlayUiScene` (overlay background, depth ordering and
renderer-aware clipping), `GymParameterizedOverlayScene` (a parameterised modal),
`GymHudComponentsScene` (help and settings panels) and `GymSaveLoadScene` (the
resume overlay).

### 3.3 Audio and SFX mapping

Every sound is a `COMMON_SFX_KEYS` value from `src/core-engine/SoundManager.ts`,
played through the game's `SoundManager`; there are **no game-scoped SFX string
literals** (`docs/SFX_CONVENTION.md`). Audio is best-effort: a missing or
unplayable asset is swallowed by the manager and the textual channel always
carries the message. `SoundManager` owns mute and volume, so the settings panel's
controls apply uniformly.

<!-- gdd-presentation-audio -->

| Event | When it fires | SFX key | Animation | Reduced-motion alternative |
|---|---|---|---|---|
| Beat entered | the clock is charged and the narrative swaps to the new card | `COMMON_SFX_KEYS.CARD_SWAP` | card/narrative swap | text swaps instantly; no tween |
| Choice resolved | the option resolves and its authored outcome prose is revealed | `COMMON_SFX_KEYS.SCORE_REVEAL` (via `revealNarration`) | progressive narration reveal at 28 ms per character, clamped to 400–9000 ms | full prose applied synchronously by `revealNarration`; `onComplete` fires synchronously |
| Loss recorded | a `losses` rule applies (or a chain cost removes an irreversible key) | `COMMON_SFX_KEYS.SCORE_REVEAL` | `popTextOrIcon` pop above `statusBar.losses` | the pop is an instant text change |
| Scene closed | the `scene-exit` record is classified and the banner rewrites | `COMMON_SFX_KEYS.TURN_CHANGE` | banner rewrite + (gap B5) scene transition | banner text swaps instantly |
| Act closed | the last scene of an act closes | `COMMON_SFX_KEYS.ROUND_END` | act transition presentation (gap B5) | instant; the banner still names the act |
| Ending reached | the ending card resolves and the epilogue opens | `COMMON_SFX_KEYS.ROUND_END` then `COMMON_SFX_KEYS.SCORE_REVEAL` | epilogue reveal, then the score pop | both texts are present instantly; no pop tween |
| Refused beat | `clockCost > clockRemaining` at beat entry | `COMMON_SFX_KEYS.ILLEGAL_MOVE` (automatic) | `shakeIllegalMove` shake + reason toast | no shake; the reason toast still renders |
| Refused option | an unaffordable or stale option is activated | `COMMON_SFX_KEYS.ILLEGAL_MOVE` (automatic) | `shakeIllegalMove` shake + reason toast naming the shortfall | no shake; the toast still renders |
| Overlay opened or closed | any of the overlays in [§3.2](#32-overlay-behaviour) | `COMMON_SFX_KEYS.UI_CLICK` | none (instant appearance) | unchanged — already instant |
| New run | the post-ending action starts a fresh survey | `COMMON_SFX_KEYS.UI_CLICK` | none | unchanged — already instant |

**Audio rules.**

1. **One key per event, played in sequence, never stacked.** An act close plays
   `TURN_CHANGE` for the scene close and *then* `ROUND_END`; an ending plays
   `ROUND_END` and *then* `SCORE_REVEAL`. No two keys are started on the same
   frame, so the mix never clips and each sound keeps its meaning.
2. **Reduced motion suppresses SFX.** That is the project-wide contract
   (`docs/ui-animations.md` → Accessibility): reduced motion skips every tween
   **and** every SFX, so the mapping's alternative column is always a *textual*
   alternative, not a quieter animation. Nothing in this game's feedback exists
   only in audio.
3. **No AI action stream.** The game is single-player and authored; there is no
   AI opponent, so the project's AI-animation rule has no subject here. The
   authored consequence is animated by the rules above instead.
4. **Restoring a save is silent.** Loading or resuming mutates no player action
   and plays no SFX; this exemption is deliberate and is recorded here rather
   than in code comments because the save path is engine code.
5. **Assets resolve through `audioPathWithFallback('long-erasure', …)`** with the
   six shared files as the fallback (`public/assets/audio/default/` already ships
   `card-swap`, `turn-change`, `round-end`, `score-reveal`, `illegal-move` and
   `ui-click`). No new asset is required by this section.

**Gym references.** `GymAudioFeedbackScene` (event-driven audio, mute/volume,
`popTextOrIcon`) and `GymLongErasureScene` (the full narrative map above, already
wired to `COMMON_SFX_KEYS`).

### 3.4 Accessibility

#### 3.4.1 Reduced motion

The preference chain is the engine's (`getEffectiveReducedMotion()` in
`src/ui/ReducedMotion.ts`): an explicit `reducedMotion` argument wins, then the
Settings panel toggle (`tce-ui-reduced-motion`), then
`prefers-reduced-motion: reduce`. Every helper in this section receives the
resolved flag; no scene re-derives it.

With reduced motion enabled: tweens are skipped and sprites snap; SFX are
suppressed; `revealNarration` applies the full prose synchronously and fires
`onComplete` synchronously; `paginateProse` pages are unchanged (paging is not
animation); the score pop is an instant text; `shakeIllegalMove` skips the shake
but still renders its reason toast. The textual channel is never suppressed —
this is the property that makes the mapping in [§3.3](#33-audio-and-sfx-mapping)
accessible rather than merely quieter.

#### 3.4.2 Verbosity and tooltips

**Gym reference.** `GymTooltipScene` (DOM and Phaser tooltip modes, the
settings toggle and the hover-intent delays).

| Setting | Values | Default | Persistence | Status |
|---|---|---|---|---|
| Tooltips | on / off | on | `getTooltips()` / `setTooltips()` (`tce-show-tooltips`), rendered in `SettingsPanel` when `hasTooltips` | **Available** |
| Reduced motion | on / off | system preference | `getReducedMotion()` / `setReducedMotion()` (`tce-ui-reduced-motion`) | **Available** |
| Mute and volume | on/off, 0–1 | unmuted, engine default | `SoundManager` (`tce-sound-muted`, `tce-sound-volume`) | **Available** |
| Verbosity | Full / Concise | Full | game-owned key via a SettingsPanel `extraToggles` entry | **Partly available** — the toggle seam exists; shared persistence is gap B8 |

**Verbosity.** `Full` (default) shows the animated narration reveal, the
one-line feedback after every choice, and one-line journal rows. `Concise` applies
the outcome prose instantly and suppresses the *auxiliary* feedback line and the
inline journal ticker (the journal overlay still holds every row). **Verbosity
never hides authored prose** — context, outcome prose and the epilogue are shown
at every level; it only controls the auxiliary chrome around them. The toggle is
rendered through `SettingsPanel`'s `extraToggles`, so it sits with the engine's
own toggles and needs no new panel code.

**Tooltips.** `TooltipManager` renders in DOM or Phaser mode; the game enables
hover intent (`delayMs: 350`) and press-and-hold (`touchDelayMs: 600`), so a
pointer sweep no longer flashes text. Rules: a tooltip never carries information
that is unavailable elsewhere (it repeats the on-screen label or the help
panel); an option's label is never tooltip-only, because options are already
visible text; tooltips follow the settings toggle and are cancelled by
`hide()`/`destroy()`; on touch the press-and-hold path is the only trigger, so
nothing requires hover.

#### 3.4.3 Colour-independent signalling

<!-- gdd-presentation-colour -->

| State | Colour (secondary cue) | Primary non-colour channel |
|---|---|---|
| Resource affordability | dimmed/red | printed shortfall: `2 charge needed` |
| Objective status | green / amber / red | word: `met` / `at risk` / `unmet` |
| Scene outcome | green / amber / red | the outcome word: `success` / `partial` / `failure` on the banner |
| Irreversible key | red marker | the word `irreversible` beside the key, and `losses only` in its tooltip |
| Loss ledger line | red | a signed line: `−1 hull — <statement>` |
| Selected option | tint/lift | a `[ selected ]` prefix and the raised card position |
| Act progress | colour band | `Act 1 of 3` in `statusBar.act` |

**Rule.** Colour is never the sole carrier of meaning. The review gate checks
every row above against the rendered screen; the automated guard
([§3.7](#37-how-this-section-is-verified)) pins that every row names a printed
channel, not only a colour.

Text contrast targets WCAG AA (4.5:1 for body text, 3:1 for
large text and UI boundaries); the palette itself is art direction and is
reviewed as art, not asserted by a unit test.

#### 3.4.4 Keyboard and touch input paths

| Action | Keyboard | Touch/pointer | Status |
|---|---|---|---|
| Open/close Help | `?` (engine default `toggleKey`) | tap the help button | **Available** (`HelpPanel`) |
| Open/close Settings | Escape (engine default `toggleKey`) | tap the settings button | **Available** (`SettingsPanel`) |
| Skip a narration reveal | any key | tap | **Available** (`revealNarration` `skipOnInput`, default on) |
| Page the narrative or journal | Gap B7 (the page control is pointer-driven at this commit) | tap the page control | **Partly available** — `paginateProse()` is available; keyboard activation is B7 |
| Select a choice | `1`–`6`, or arrows + Enter | tap the option row | **Gap B7** — no shared choice-navigation helper exists |
| Traverse/activate overlay buttons | Tab / Enter / Space | tap | **Gap B7** — overlay focus order is not implemented |
| Close a modal | Escape | close button | **Partly available** — the dialog exposes `close()`; the game binds Escape |
| End-turn shortcut | `getEndTurnKeybind()` | n/a | **Not applicable** — the loop has no end-turn action; choices advance the beat |

**Touch rules.** Every interactive element is a Phaser `Text`/container with
`setInteractive` and a hit area padded to at least 44 design px; the option
anchors' 0.062 step encodes that floor. Nothing depends on hover: tooltips use
`touchDelayMs`, the journal pages rather than scrolls, and confirmations use
explicit overlay buttons. Drag is not used (choices are taps), so there is no
drag/tap conflict to arbitrate.

### 3.5 Determinism, save/load, transcript and replay

**Gym references.** `GymDeckRngScene` (seeded RNG and reproducible shuffles),
`GymSaveLoadScene` (versioned save/load with a screenshot), `GymTranscriptScene`
(transcript recording and auto-save) and `GymHeadlessDeterminism` tests (the same
seed reproduces the same transcript).

#### 3.5.1 Determinism

The run has **one** RNG that affects play: the seeded `@story-line` candidate
draw (`createSeededRng(seed)`; `shuffleArray()` where order is drawn). The seed
is recorded at `run-start` and stored in the save, so the same seed plus the same
choice sequence reproduces the same run. (Storage-layer identifiers inside
`SaveLoadStore` are generated randomly, but they are not run state and never
enter the transcript or the replay comparison.) The constraint carried from
[§2.3](#23-how-a-scene-outcome-selects-the-next-beat) is absolute: **a scene
close consumes no RNG**. Outcome classification, loss application, route
selection and beat entry are pure functions of the run state; only the compiled
option resolution may draw. Route, outcome-rule and loss tables are evaluated in
declaration order, so a reordered table is the only thing that can change a
decision at a fixed seed. `Math.random` does not appear in `src/story-line/`
(pinned by the guard in [§3.7](#37-how-this-section-is-verified)).

Timestamps are the one intended non-determinism: `startedAt` and `endedAt` are
ISO wall-clock values. A replay comparison therefore compares the **content**
(scene exits, outcomes, routes, ledger lines, score and band) and never the
timestamps or screenshot pixels.

#### 3.5.2 Save/load

The run is persisted through `SaveLoadStore` with `SaveSerializer` and its own
`schemaVersion`, under domain `run-checkpoint` and game type `long-erasure`.
`serializeWithVersion()` writes the payload; `deserializeWithVersion()` refuses a
version mismatch unless the serializer supplies a `migrate` hook — a mismatch is
a refusal, never a best-effort load ([§2.4](#24-how-the-beat-sheet-composes-with-story-line)).

| Persisted field | Source | Why it must be in the save |
|---|---|---|
| `schemaVersion` | `SaveSerializer` | versioned refusal / migration |
| `seed` | run start | the only RNG stream; without it the run is not reproducible |
| `currentActId`, `currentSceneId`, `currentBeatId` | beat sheet | resume exactly where the player left |
| `sceneClockRemaining` | beat sheet | clocks reset per scene; carrying it is the only way to resume mid-scene |
| `pendingChain` | routing | a resolved choice whose scene close has not run yet |
| `sceneHistory`, `routeHistory` | beat sheet | the banner, the epilogue and the audit |
| `lossLedger` | [§2.10.2](#2102-irreversible-loss-hull-as-the-dial) | irreversible losses must survive a reload; a lost ledger is a refund |
| `resources` | `engine.getResources` projection | declared keys only; no derived score is stored |
| `journal`, `activityLog` | `@story-line` state | the prose is the record; ellipsised journal rows must not lose it |
| `endingReached`, `scoreInputs` | epilogue | a resumed ending must score the same as a live one |

**Cadence.** Checkpoint after every resolved choice (the unit of irreversible
change) and again at every scene close; one slot per run. The post-ending
`[ Begin a new survey ]` action clears the slot only after the new run's first
checkpoint writes, so a crash between the epilogue and the restart still resumes
the finished run rather than losing it.

**Resume.** `CheckpointManager.checkAndResume()` offers resume or fresh; a fresh
start never deletes the checkpoint until the player confirms. A failed load
(version mismatch, unreadable payload) surfaces an actionable line in the resume
overlay and falls back to a fresh run **only** on an explicit choice.

#### 3.5.3 Transcript

Recording uses `TranscriptRecorderBase<BaseTranscript<…>>`; persistence uses
`TranscriptStore` (IndexedDB plus the dev-server disk mirror) and
`autoSaveTranscript` at run end. The transcript is append-only: the recorder
never rewrites an event. The event set is the contract:

| Event | When | Required fields | Feeds |
|---|---|---|---|
| `run-start` | a new run, or a resume | `seed`, `manifestId`, `manifestVersion`, `contentChecksum`, `startingResources`, `resumedFrom` | replay reproducibility |
| `beat-entry` | a beat is entered and its clock charged | `sceneId`, `cardId`, `clockCost`, `clockRemaining` | clock arithmetic, replay |
| `beat-refused` | a beat cannot be entered | `sceneId`, `cardId`, `clockCost`, `clockRemaining`, `reason` | the refusal guarantee ([§2.10.4](#2104-failure-and-recovery-per-failure-type)) |
| `choice-resolved` | an option resolves | `sceneId`, `cardId`, `optionId`, applied effects, `pushedCard` | journal, replay |
| `scene-exit` | every scene close | exactly the record of [§2.3 step 11](#23-how-a-scene-outcome-selects-the-next-beat): `sceneId`, `objectiveMet`, `outcome`, `ruleId`, `routeId`, `clockSpent`, `clockRemaining`, `budgetExhausted`, `nextBeat` | banner, replay, audit |
| `loss-applied` | each `losses` rule fires | `sceneId`, `field`, `delta`, `statement` | ledger, epilogue |
| `ending-reached` | an ending card resolves | `cardId`, `score`, `band`, `hullLost`, `actsPlayed` | epilogue, replay |
| `run-reset` | the post-ending restart | `endingCardId`, `journalEntryCount` | the reset ending's record |

Every transcript carries the full authored prose for each resolved option; the
journal may ellipsise a display row, the transcript never does
(`StorylineJournalEntry` keeps the prose for exactly this reason).

#### 3.5.4 Replay

The replay tool (`scripts/replay.ts` plus a per-game `ReplayAdapter`) drives the
scene from a fixture transcript. The build epic adds the adapter (a named gap in
[§5.2](#52-verification-the-build-epic-must-add-named-gaps), [G13](#g13));
this contract states what it must prove:

1. **Idempotence.** Replaying one fixture twice produces identical ordered
   `scene-exit` records, identical `loss-applied` lines, and the same
   `ending-reached` score and band.
2. **No re-draw.** The adapter drives choices from the transcript's `optionId`;
   it never re-runs the RNG to pick again. A choice that is no longer available
   is a loud divergence failure, not a silent substitution.
3. **Same-seed replay.** A headless run with the recorded seed and choice
   sequence reproduces the transcript's content fields; only timestamps differ.
4. **Headless exemption.** Replay and test modes render no scene and play no
   audio, so the animation and SFX rules of [§3.3](#33-audio-and-sfx-mapping) do
   not apply there (the project's documented exemption).

### 3.6 Named presentation gaps

Every capability this section names is either already in the engine or listed
here and carried into the engine-gap backlog ([§6](#6-engine-gap-backlog)).
No gap is described as though it already works.

| Gap | What it unlocks here | Why the engine cannot do it at this commit | Provisional effort | Type | Backlog entry |
|---|---|---|---|---|---|
| B1 Beat-sheet / objective layer | the banner, objective, clock, ledger and restart data all read from it | no scene, objective or budget concept exists (`src/story-line/compile.ts`; the spike's act/clock live in `example-games/gym/GymLongErasureGame.ts`) | large (the build epic's core) | epic | [G1](#g1) — filed (`CG-0MWR0BAT30015DPQ`) |
| B4 Affordability presentation | showing an unaffordable option with its shortfall instead of removing it | content gating omits options rather than explaining them (`src/story-line/compile.ts`; `isOptionAffordable` is a predicate, not a presenter) | small | task | [G7](#g7) — filed (`CG-0MWR0BI3S008K9Y6`) |
| B5 Act/scene transition presentation | the `sceneBanner` and act transition motion | the camera transition ships (`runSceneTransition` in `src/ui/sceneTransition.ts`); no banner surface or outcome→route sequence exists, and the spike has no scene boundary (`example-games/gym/layouts/gym-long-erasure.layout.json`) | small–medium | feature | [G9](#g9) — filed (`CG-0MWR0BJBU005TDTT`) |
| B7 Keyboard choice navigation and overlay focus | the keyboard path in [§3.4.4](#344-keyboard-and-touch-input-paths) | only the panels' own toggle keys are bound (`?` for Help, Escape for Settings — `src/ui/HelpPanel.ts`, `src/ui/SettingsPanel.ts`, `src/ui/SettingsStore.ts`); no choice-list or overlay-focus helper exists | small | task | [G11](#g11) — filed (`CG-0MWR0BKIT0084ZID`) |
| B8 Shared verbosity preference | the Full/Concise toggle in [§3.4.2](#342-verbosity-and-tooltips) | `SettingsStore` has tooltips and reduced motion but no verbosity key; `SettingsPanel.extraToggles` gives a game-local toggle without shared persistence | extra-small | task | [G12](#g12) — filed (`CG-0MWR0BL4Q000OYG6`) |
| B9 Deterministic replay adapter | the replay guarantees in [§3.5.4](#354-replay) | the replay tool is engine code but a game's adapter is a build-epic deliverable; no adapter exists for this game | small | task | [G13](#g13) — deferred to the build epic |

Deliberately **not** gaps: SLL zones (a per-game layout document admits any
zone name), tooltips and their delays (`TooltipManager`), reduced motion
(`getEffectiveReducedMotion()` and every helper), versioned save/load
(`SaveLoadStore`, `serializeWithVersion`), transcript recording and persistence
(`TranscriptRecorderBase`, `TranscriptStore`), overlay depth and clipping
(`createOverlayBackground`, `createOverlayDialog`, `createContainerClip`) and
every SFX key in [§3.3](#33-audio-and-sfx-mapping) (`COMMON_SFX_KEYS`).

### 3.7 How this section is verified

The contract is pinned by one unit suite and four review checks.

| # | Claim being verified | Command | Expected |
|---|---|---|---|
| T13 | The zone table and the layout fixture agree; every anchor exists; option anchors meet the 44 design-px floor; every cited SFX key is a real `COMMON_SFX_KEYS` value; every audio row has a reduced-motion alternative; every colour-coded state names a printed channel; every cited Gym/source path exists; the section contains no coordinate pair; `Math.random` is absent from `src/story-line/` | `npx vitest run --project unit tests/story-line/content/gdd-presentation-contract.test.ts` | pass |

**Review checks (manual).**

1. **No absolute coordinates.** Open the game's only layout document and confirm
   every `rect` and `anchor` is normalised; a raw pixel in a scene is a defect.
2. **Overlay ordering.** Open the journal over the epilogue over the confirmation;
   confirm exactly one modal is live, every text object is inside
   `hudContainer`, and Escape closes the topmost only.
3. **Audio read-back with the sound off.** Mute the game and play one act: every
   event in [§3.3](#33-audio-and-sfx-mapping) must still be legible in text, and
   a refused beat must still show its reason toast.
4. **Colour independence.** Render one scene, one refusal and one epilogue in
   greyscale; every row of [§3.4.3](#343-colour-independent-signalling) must
   still be readable.

### 3.8 What this section does not prove

- **No human playtest of the presentation.** The zone set, the tap-target floor
  and the audio map are structural; whether the banner *feels* like a
  consequence is the human playtest [§2.6](#26-hypotheses-and-how-they-will-be-validated)
  recommends before the act structure freezes.
- **No audio mix.** Volumes, ducking and the SFX asset choice are art direction;
  the contract fixes the key per event, not the master gain.
- **No automated contrast audit.** The WCAG targets in
  [§3.4.3](#343-colour-independent-signalling) are a review gate; no engine
  checker measures the rendered palette.
- **The keyboard path is untestable until B7 lands.** Only the engine's own
  panel toggles and the narration skip can be exercised at this commit; choice
  navigation
  and overlay focus are explicitly a gap, not an assumed capability.
- **No touch browser test for the journal paging.** `paginateProse()` is unit
  tested and the spike renders it, but the full game's overlay does not exist yet;
  the touch assertion is a review check until the build epic supplies the scene.

---

## 4. Glossary

> **Written by `CG-0MWPY2FV30041M48`.** The naming pass is complete:
> [§4.2](#42-the-settings-names-final) is the final naming table,
> [§4.3](#43-prohibited-term-scan-record) is the prohibited-term scan record,
> [§4.4](#44-trademark-sanity-read) is the trademark sanity read and
> [§4.5](#45-the-prohibited-term-gate-and-how-a-writer-runs-it) is the gate a
> writer or reviewer runs. The design vocabulary in §4.1 is fixed by this
> document and was not renamed by the pass.

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

### 4.2 The setting's names (final)

These are the names the setting and its content use. Each row is either an
invented proper noun or a deliberately common noun; the table is the whole
inventory, so a name that is not here is not part of the setting's naming
layer.

| Name | Kind | What it is | Rationale (one line) | First use |
|---|---|---|---|---|
| **The Long Erasure** | Setting / title | The setting, the game's title and the name of the reset ending | Names the event in plain English — a long erasure of a volume of space — with no franchise vocabulary | Executive Summary; `le-end-reset` |
| **The Unwriting** | Phenomenon | The erasure itself: space being edited out of having happened | A descriptive gerund: the event is an edit, not a weapon, and the word is coined from common English parts | [§1.1](#11-setting-and-tone); `le-i-open` |
| **the weave** | Common noun (phenomenon) | The Revision Loom's ongoing revision, and the path a thread takes through it | A working metaphor for the mechanism; lower-case in prose and capitalised only inside the two card titles that name it | [§1.1](#11-setting-and-tone); `le-ii-keep`, `le-iii-ahead` |
| **Ashlight** | Vessel | The player's survey vessel | A lamp-name for a ship that measures the dark: one transparent coinage from two common words, with no class prefix or registry number | [§1.1](#11-setting-and-tone); `le-iii-approach` |
| **Archivist Vane** | Antagonist | The Revision Loom's unfailingly polite intermediary | An archivist, because the story is about records; `Vane` is an ordinary English surname with a weather-vane overtone — he shows which way the revision blows | [§1.1](#11-setting-and-tone); `le-ii-offer` |
| **The Revision Loom** | Technology / mechanism | The structure that edits the volume and is still turning | A loom that revises: a working craft noun, deliberately not a weapon, drive or reactor | [§1.1](#11-setting-and-tone); `le-ii-offer` |
| **the core** | Common noun (place) | The Loom's centre, where the player can stop it | Plain architectural noun; the scene title *The Core* capitalises it without coining anything | [§1.3](#13-the-core-loop); `le-iii-approach` |
| **the dead zone** | Common noun (place) | A listening shadow inside the erased volume | A functional, plain-language place descriptor; no planet name is invented, so the place stays generic | [§1.3](#13-the-core-loop); `le-ii-shelter` |
| **the muster station** | Common noun (place) | The nearest surviving port | A real maritime term for the place a crew assembles, used literally | [§1.1](#11-setting-and-tone); `le-ii-shelter` |
| **the drowned homeland** | Common noun (place) | The lost home port a crew member remembers | A common-noun description; the homeworld is deliberately left unnamed, so the setting owns no planet name | [§2.8](#28-resource-model-and-economy); `le-end-reset` |
| **the survey service** | Faction / institution | The civilian service the player's ship belongs to | **No proper noun is invented for the faction.** A plain institutional noun keeps the register civil-service rather than a polity, alliance or fleet | [§1.1](#11-setting-and-tone); content prose |
| **the crew, the survey commander, the ally** | Roles | The people aboard, and the unnamed contact who guides the ship | Role nouns only; apart from the antagonist no character is named, so the player projects the crew rather than reading a cast list | [§1.2](#12-player-role-and-the-pitch); content prose |

**Coverage by category.** Setting (1: The Long Erasure), phenomenon (2: The
Unwriting, the weave), vessel (1: Ashlight), antagonist (1: Archivist Vane),
technology (1: The Revision Loom), factions (1: the survey service — a
common-noun institution, not an invented proper noun), places (4) and roles (1
row covering the three role nouns) — twelve rows in all.

**Two deliberate absences.** The pass found **no invented faction proper noun**
and **no invented technology name beyond the Revision Loom**. That is a naming
decision, not an omission: an invented polity or drive name is exactly the kind
of term that invites a third-party comparison, and the design never needs one —
the survey service is an employer, not a power, and the Loom is a mechanism,
not a fleet.

**Naming rules.**

1. **The table is complete.** A capitalised word outside it is either a real
   place or institution used literally (`the survey service`, `the muster
   station`), a card title composed from the table's words and ordinary English
   (for example *Dead Reckoning*, *The Missing Berth*, *Mutiny*, *Salvage
   Rights*), or the design vocabulary in [§4.1](#41-design-vocabulary). Card and
   scene titles are descriptive; they are not a second naming layer.
2. **Every name is transparent.** Each is composed of common English words or
   (for `Ashlight`) a single coinage from two of them. None copies a
   third-party character, race, faction, vessel class, technology or episode
   title.
3. **A new proper noun is a reviewed change.** It needs a producer sign-off at
   the review gate ([§2.9.5](#295-the-review-gate)), a row in this table and a
   clean prohibited-term scan ([§4.5](#45-the-prohibited-term-gate-and-how-a-writer-runs-it)).
4. **Common nouns stay lower-case in prose.** `the weave`, `the core`, `the dead
   zone`, `the muster station` and `the drowned homeland` are capitalised only
   inside a title or at the start of a sentence.

### 4.3 Prohibited-term scan record

**Result: clean.** The scan was run over the guarded set at the commit this
section was written against, using
`tests/fixtures/story-line/ip-prohibited-terms.json` (40 terms, one narrow
allowance). No prohibited third-party term appears in this document, its worked
examples, its diagrams or the authored content it specifies.

```text
$ npm run storylines:ip-scan
Prohibited-term scan — 12 file(s), 40 term(s), 1 allowance(s)
  terms: tests/fixtures/story-line/ip-prohibited-terms.json
  ✓ docs/design/storyline-game-gdd.md
  ✓ docs/design/storyline-playtest-evaluation.md
  ✓ docs/gym/long-erasure-observation-log.md
  ✓ tests/fixtures/story-line/gdd-worked-examples.csv
  ✓ tests/fixtures/story-line/gdd-resource-trades.csv
  ✓ tests/fixtures/story-line/gdd-presentation-layout.json
  ✓ example-games/gym/content/long-erasure.csv
  ✓ example-games/gym/content/long-erasure-manifest.json
  ✓ example-games/gym/content/long-erasure-graph.mmd
  ✓ example-games/gym/content/storylines.csv
  ✓ example-games/gym/content/storyline-manifest.json
  ✓ example-games/gym/content/storyline-graph.mmd
RESULT: CLEAN — no prohibited term in 12 file(s).
```

**What "the guarded set" means.** It is data, not a list inside a test:
[`configs/storyline-ip-scan.json`](../../configs/storyline-ip-scan.json) names
the files, [`tests/fixtures/story-line/ip-prohibited-terms.json`](../../tests/fixtures/story-line/ip-prohibited-terms.json)
holds the terms and their allowances. Adding a content file or a document that
quotes content is a config edit; the CI guard scans the same set, so a file
cannot pass by being missing from it (a configured-but-absent path fails the
scan and the test).

**The one allowance.** One fictional-weapon term on the list is also the name
of the game framework this engine builds on. The term list allows only the
framework's **exact technical compounds** (its code-span/quoted name, `-free`,
`tooltip`, `mode` and `` `Text` ``), and the allowance is case-sensitive. A
narrative use of the word — for example, a ship's weapon banks — is still a
match, and both the unit test and the CI guard assert that the allowance cannot
hide it. This is the only allowance in the list; a second one would need the
same rationale and the same positive control.

**How the scan is enforced.** Three layers, none of which is a substitute for
the human read in [§4.4](#44-trademark-sanity-read):

| Layer | What it proves |
|---|---|
| `npm run storylines:ip-scan` | a writer or reviewer gets a per-file verdict, including an ad-hoc pre-commit check of a candidate file |
| `tests/gym/LongErasureContent.test.ts` | CI scans the same configured set and fails on a match **or a missing target** |
| `tests/story-line/content/ip-terms.test.ts`, `tests/scripts/ip-scan.test.ts` | the matching semantics, the allowance narrowness and the CLI's fail-closed behaviour are pinned |

### 4.4 Trademark sanity read

| | |
|---|---|
| **Read on** | 2026-11-21 |
| **Mechanical search** | Every term in `ip-prohibited-terms.json` (40) across the 12 guarded files, by `npm run storylines:ip-scan`; the recorded output is [§4.3](#43-prohibited-term-scan-record). |
| **Human read** | The whole of [§4.2](#42-the-settings-names-final) read name by name against the fixture's category list (franchise name, character, race, faction, ship class, technology, episode title), then the content CSV's titles and prose read as narrative rather than as data. Recorded as reviewed. |
| **Register search** | **Not performed.** This environment has no access to the trademark registers, so no register or common-law clearance is claimed. |
| **Decision** | Names retained as tabled; no rename is required by the scan or by the human read. |

**Findings.**

- **No list term appears anywhere in the guarded set.** The one mechanical
  collision is the engine framework's own name, handled by the documented
  allowance in [§4.3](#43-prohibited-term-scan-record); the narrative never
  uses the word for anything in the setting.
- **No name maps to a franchise element.** The setting noun, the vessel, the
  antagonist, the mechanism and the phenomenon are each either a common-noun
  description or a transparent coinage, and the faction is deliberately left
  without a proper noun.
- **Three card titles are ordinary phrases that are also the titles of
  unrelated works:** *The Dead Zone*, *Dead Reckoning* and *The Core*. Each is
  descriptive of its card, none is used as a source identifier, a series marker
  or a claim of association, and short descriptive titles of this kind are not
  distinctive in the relevant sense. The read records them rather than treating
  a coincidental title match as a prohibited reference.

**Residual risk, and what would reduce it.**

1. **A mechanical scan cannot catch a paraphrased, translated or visual
   reference.** The mitigation is the human read above plus the producer
   sign-off at the review gate ([§2.9.5](#295-the-review-gate)); a paraphrase
   that survives both is a content-review failure, not a scanner failure.
2. **The two coined names carry the highest (still low) register risk:**
   *The Long Erasure* and *Ashlight*. Both are transparent English formations
   used in a distinct game context, which is why the assessed risk is **low** —
   but low is not zero, and it is unverified because no register search was
   performed.
3. **Recommended before public promotion:** run register searches for both
   coined names in the games/entertainment classes, record the result on the
   close-out item (`CG-0MWPY2JEU006DYUL`), and re-run
   `npm run storylines:ip-scan` if any name changes.

### 4.5 The prohibited-term gate, and how a writer runs it

The checklist is carried forward for content review as three committed
artefacts, none of which is prose a reviewer has to reconstruct:

| What | Where |
|---|---|
| The prohibited terms and their allowances | [`tests/fixtures/story-line/ip-prohibited-terms.json`](../../tests/fixtures/story-line/ip-prohibited-terms.json) |
| The files the gate covers | [`configs/storyline-ip-scan.json`](../../configs/storyline-ip-scan.json) |
| The command | `npm run storylines:ip-scan` |

**Run it.**

```bash
npm run storylines:ip-scan                            # the guarded set (writer pre-commit and CI)
npm run storylines:ip-scan -- path/to/candidate.csv   # one ad-hoc file before it is committed
npm run storylines:ip-scan -- --json                  # machine-readable report
```

The command exits `0` only when every target was readable and no term matched;
anything else exits `1` and names the file, the line and the term. A writer runs
it before committing a content change; a reviewer runs it as part of the review
gate, at **step 6** of [§2.9.5](#295-the-review-gate), and pastes the
`RESULT: CLEAN` line into the sign-off comment. Adding a new content file to
the gate is a config edit — do that in the same change as the file, so the next
run covers it.

**What the gate cannot do.** It is a text scan over the files it is given, so it
cannot catch: a paraphrased reference, a translated term, a name that is not in
the list, an image or an audio cue, or a homograph hidden behind an allowance.
Those are the human read's job ([§4.4](#44-trademark-sanity-read)). It also does
not replace the content validator or the route-space guard: those prove a row is
well formed and playable, this proves its words are the setting's own.

**Adding or changing a term.** A new term is a change to the fixture with a
`source` note, and it applies to every guarded file at once. Never edit an
allowance to hide a narrative match: an allowance needs a rationale and a
positive control proving that a non-technical use of the same word is still
caught.

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
| T8 | The rows quoted in [§2.9.4](#294-worked-example-rows-verbatim-validated) are byte-identical to the rows `storylines:validate` accepts, and the document still names every row's target | `npx vitest run --project unit tests/story-line/content/gdd-content-pipeline.test.ts` | pass — the document's rows are the fixture's rows, and the fixture validates |
| T9–T12 | The scoring weights, bands and worked scores; the abandon band after the arc correction; the rejoin distance; the scene-budget sizing rule | see [§2.10.7](#2107-how-this-section-is-verified) | pass — the abandon re-score is pinned by the delivered `CG-0MWNSR376002QBY9` |
| T13 | The presentation contract's zone table matches its layout fixture (every zone and anchor), option anchors meet the 44 design-px floor, every cited SFX key exists in `COMMON_SFX_KEYS` and every audio row has a reduced-motion alternative, every cited source path exists, the section contains no coordinate pair, and `src/story-line/` contains no `Math.random` | `npx vitest run --project unit tests/story-line/content/gdd-presentation-contract.test.ts` | pass ([§3.7](#37-how-this-section-is-verified)) |
| T14 | The GDD, its worked examples, its diagrams and the authored content carry no prohibited third-party term; the gate cannot pass with a missing target and cannot be fooled by its framework allowance | `npm run storylines:ip-scan`, then `npx vitest run --project unit tests/gym/LongErasureContent.test.ts tests/story-line/content/ip-terms.test.ts tests/scripts/ip-scan.test.ts` | `RESULT: CLEAN`; tests pass ([§4.3](#43-prohibited-term-scan-record)) |

> T9–T12 live with the rules they verify ([§2.10.7](#2107-how-this-section-is-verified))
> rather than here, so a re-tune cannot leave a stale command behind; the
> numbering is kept in this table so the plan remains one list.

### 5.2 Verification the build epic must add (named gaps)

| Gap | Command the build epic must provide | Why it is not here | Backlog |
|---|---|---|---|
| Manifest validator | `npm run storylines:manifest -- --manifest <file> --json` | **delivered** — the rules are the table in [§2.4](#24-how-the-beat-sheet-composes-with-story-line) (`CG-0MWSJYV86000ZHM4`) | [G2](#g2) (delivered) |
| Manifest JSON schema | `schemas/episode-manifest.schema.json` validated with ajv in the unit suite | **delivered** — `CG-0MWSJYAXE001KMRU` | [G2](#g2) (delivered) |
| Scene-space guard | a `storylines:guard --manifest <file>` mode that enumerates scene exits and refusals | the current guard enumerates the chain only; the clock is not a declared resource, which is why the model adds scene bookkeeping | [G3](#g3) |
| Deterministic replay | a transcript replay test asserting identical scene-exit records and score at the same seed | depends on the runner | [G13](#g13) |

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
7. **IP names and gate.** Every invented proper noun is a row in
   [§4.2](#42-the-settings-names-final); `npm run storylines:ip-scan` reads
   `RESULT: CLEAN` at the commit under review; the trademark read's residual
   risk ([§4.4](#44-trademark-sanity-read)) is accepted by the producer, with
   the register-search recommendation carried to the close-out item.

---

## 6. Engine-Gap Backlog

> **Written by `CG-0MWPY2ECE002P2NH`.** This section replaces the stub that
> [§2.7](#27-sections-owned-by-downstream-work-items) listed. It is the complete
> answer to one question: *which capability this GDD needs does the engine not
> provide at this commit?* Every entry names the GDD section it unlocks, the
> module that proves the gap, an effort band whose nearest precedent makes the
> band auditable, a proposed issue type and a disposition.
>
> The engine follow-through already delivered — the declared resource set, the
> CSV option attributes (`#cost` / `#extra` / `#when` / `#says`), the prose
> columns, the content validator and the route-space guard — is **not** restated
> as a gap. What remains is listed below. Where a section of this document
> previously said "gap N" or "item N", the entry id (`G1` … `G14`) is now the
> stable reference, and the backlog item id is the work item that carries it.

**Verified at the commit this section was written against.** Each "why the
engine cannot do it at this commit" names a file a reviewer can open and states what that
file does *not* contain; no gap is claimed from memory. The structural contract is
unit-tested by `tests/story-line/content/gdd-engine-gap-backlog.test.ts`, which
fails if a cited path disappears or an entry loses its required fields.

### 6.1 How to read an entry

| Field | Rule |
|---|---|
| **Entry** | `G<n>`, stable across edits; every cross-reference in this document uses it. |
| **Capability** | One sentence naming what the engine would gain. |
| **Unlocks in this GDD** | The section(s) that cannot be implemented without it. A gap with no consumer is not listed. |
| **Why the engine cannot do it at this commit** | The file/module that would have to change, and what it does not contain at this commit. A follow-through gap also says what *did* land, so the band is judged against real code. |
| **Effort band** | `extra-small` (≤ half a day), `small` (0.5–2 days), `small–medium` (1–3 days), `medium` (2–5 days), `large` (1–3 weeks). Each band names its **nearest precedent** in the engine, so a reviewer can open that precedent and judge whether the band is credible. |
| **Type** | The proposed Worklog issue type (`epic`, `feature`, `task`, `chore`). |
| **Disposition** | **Filed** — a live Worklog item exists (id given). **Deferred to the build epic** — deliberately not filed; the reason is stated and the build epic's scope statement owns it. |

**Scheduling hold.** Every entry filed **by this item** is created `blocked`,
depends on the GDD epic `CG-0MWNFVLYT003M7XF`, and carries `startOn 2027-06-01`.
It therefore cannot be dispatched by `wl next` before the GDD closes and the
build epic is scoped. (G14 was filed before this backlog and keeps its own
schedule.) Clearing `startOn` is the build-epic owner's first act (§6.6). This is
how "deferred to the build epic" is made operational without leaving the work
invisible.

### 6.2 The backlog at a glance

| Entry | Capability | Unlocks in this GDD | Why the engine cannot do it at this commit | Effort band (nearest precedent) | Type | Disposition |
|---|---|---|---|---|---|---|
| [G1](#g1) | Episode beat-sheet / objective layer: scene budgets, outcome classification, routing, loss ledger | [§1.3](#13-the-core-loop), [§2.2](#22-the-scene-beat-sheet-data-model)–[§2.4](#24-how-the-beat-sheet-composes-with-story-line), [§2.10](#210-tension-pacing-failure-and-reset-ending-scoring), [§3.1](#31-presentation-surfaces-and-sll-zone-names) | `src/story-line/compile.ts` compiles one card's options; `src/story-line/resolve.ts` resolves one choice; neither knows a scene, objective, budget or route | large — `src/story-line/` itself | epic | Filed — `CG-0MWR0BAT30015DPQ` |
| [G2](#g2) | Episode manifest schema + validator (`storylines:manifest`), including `resources.start` / `resources.bounds` | [§2.2.1](#221-episode-manifest), [§2.4](#24-how-the-beat-sheet-composes-with-story-line) rule table, [§2.8.6](#286-what-the-engine-cannot-express-at-this-commit-named-gaps) item 2, [§5.2](#52-verification-the-build-epic-must-add-named-gaps) | **delivered** across the build epic — the schema (ajv-pinned), the pure validator and the `storylines:manifest` CLI (`CG-0MWSJYV86000ZHM4`) | medium — the `content/manifest.ts` + `content/validate.ts` pair | feature | **Delivered** — epic `CG-0MWR0BFMW003856N` |
| [G3](#g3) | Scene-space guard: enumerate scene exits and refusals, assert no `success` close on an exhausted clock and no refusal strands the run | [§2.4](#24-how-the-beat-sheet-composes-with-story-line) third check, [§2.8.6](#286-what-the-engine-cannot-express-at-this-commit-named-gaps) item 5, [§5.2](#52-verification-the-build-epic-must-add-named-gaps) | `src/story-line/content/guard.ts` enumerates the card chain over declared resources only; the clock is not a resource and there is no manifest input | medium — `src/story-line/content/guard.ts` (extend) | feature | Filed — `CG-0MWR0BG9H007AFNU` |
| [G4](#g4) | Resource bounds: per-key min/max, spill at the cap, clamped loss at the floor, reported remainder | [§2.8](#28-resource-model-and-economy) ranges and spill/clamp rules, [§2.8.6](#286-what-the-engine-cannot-express-at-this-commit-named-gaps) item 1 | `createResourceProjection(...).applyResourceDelta` in `src/story-line/resources.ts` forwards every finite delta unbounded; no bounds type, no spill/clamp report | small–medium — `src/rule-engine/EconomyLedger.ts` (constraint-checked deltas) | feature | Filed — `CG-0MWR0BGVG004UE7X` |
| [G5](#g5) | Irreversible-resource policy: never grant a declared irreversible key | [§2.8](#28-resource-model-and-economy) `hull`, [§2.8.6](#286-what-the-engine-cannot-express-at-this-commit-named-gaps) item 6, [§2.10](#210-tension-pacing-failure-and-reset-ending-scoring) | `resources.irreversible` is read only by a *proposed* manifest rule; `selectDeclaredDelta` filters undeclared keys, so `#extra=hull:1` is legal content | small — the `unknown-resource-key` rule in `src/story-line/content/validate.ts` | task | Filed — `CG-0MWR0BHH9002OQUZ` |
| [G6](#g6) | Compound / range conditions ("`hull ≥ 5` **and** `stores ≥ 3`", "at maximum") | [§2.2.5](#225-objective) `Objective.check`, [§2.8.6](#286-what-the-engine-cannot-express-at-this-commit-named-gaps) item 4 | `Condition` is a single `{field, op, value}` (`src/story-line/types.ts`) evaluated once (`evaluateCondition`, `src/story-line/resolve.ts`) | small — `Condition` + `evaluateCondition` | task | **Deferred to the build epic** (v1 uses one-clause objectives; two clauses are two scenes) |
| [G7](#g7) | Surfaced affordability: compile an unaffordable option with its shortfall instead of deleting it | [§2.3](#23-how-a-scene-outcome-selects-the-next-beat) option gating, [§2.8.6](#286-what-the-engine-cannot-express-at-this-commit-named-gaps) item 3, [§2.9](#29-writer-content-pipeline-csv-authoring-and-the-review-gate), [§3.6](#36-named-presentation-gaps) B4 | `isOptionAffordable` returns a boolean and `compileStorylineFromEvent` omits the option at draw time; no requirement object reaches the presenter | small — `isOptionAffordable` + the compiled-option shape in `src/story-line/compile.ts` | feature | Filed — `CG-0MWR0BI3S008K9Y6` |
| [G8](#g8) | Resource HUD: render a game-declared resource set, its bounds and its loss-bearing subset | [§2.8.6](#286-what-the-engine-cannot-express-at-this-commit-named-gaps) item 7, [§3.1](#31-presentation-surfaces-and-sll-zone-names), [§3.4.3](#343-colour-independent-signalling) | `src/ui/index.ts` exports card/hand/pile components and `TokenPileView`, but no component renders a declared resource bag; the spike draws its two-key economy as bespoke text | medium — `src/ui/TokenPileView.ts` + `src/ui/HintBar.ts` | feature | Filed — `CG-0MWR0BIPV0074WLM` |
| [G9](#g9) | Act/scene transition presentation: scene-exit banner and a sequenced act transition with a reduced-motion path | [§2.3 step D](#23-how-a-scene-outcome-selects-the-next-beat), [§3.1](#31-presentation-surfaces-and-sll-zone-names), [§3.6](#36-named-presentation-gaps) B5 | `src/ui/sceneTransition.ts` animates the camera only; no banner surface, no outcome→route sequence and no rendered scene boundary | small–medium — `src/ui/sceneTransition.ts` + `src/ui/narration-reveal.ts` | feature | Filed — `CG-0MWR0BJBU005TDTT` |
| [G10](#g10) | Retire the legacy `act` / `clockCost` CSV columns and add the migration check | [§2.1](#21-composition-contract-who-owns-what), [§2.9](#29-writer-content-pipeline-csv-authoring-and-the-review-gate) ("the two retired columns"), [§2.4](#24-how-the-beat-sheet-composes-with-story-line) | `src/story-line/content/adapters.ts` still declares both as Gym columns and as `editableColumns`; the spike reads `clockCost` from the CSV | small — the adapter column declaration + `missing-column` diagnostic | chore | Filed — `CG-0MWR0BJXI007UINE` |
| [G11](#g11) | Keyboard choice navigation and overlay focus order (`1`–`6` / arrows + Enter, Escape topmost-only) | [§3.4.4](#344-keyboard-and-touch-input-paths), [§3.6](#36-named-presentation-gaps) B7, [§3.8](#38-what-this-section-does-not-prove) | only `HelpPanel` / `SettingsPanel` toggle keys and `getEndTurnKeybind()` are bound; no choice-list navigator or focus helper is exported from `src/ui/index.ts` | small — `HelpPanel`'s keydown lifecycle + `OverlayManager` | task | Filed — `CG-0MWR0BKIT0084ZID` |
| [G12](#g12) | Shared verbosity preference (Full / Concise) in `SettingsStore` and `SettingsPanel` | [§3.4.2](#342-verbosity-and-tooltips), [§3.6](#36-named-presentation-gaps) B8 | `SettingsStore` persists tooltips and the end-turn keybind, `ReducedMotion` persists reduced motion; no verbosity key exists, and `extraToggles` is game-local | extra-small — the tooltips toggle in `SettingsStore` + `SettingsPanel` | task | Filed — `CG-0MWR0BL4Q000OYG6` |
| [G13](#g13) | Deterministic replay adapter + fixture for this game | [§3.5.4](#354-replay), [§3.6](#36-named-presentation-gaps) B9, [§5.2](#52-verification-the-build-epic-must-add-named-gaps) | the engine seam is present (`scripts/replay.ts` + `scripts/adapters/ReplayAdapter.ts`); no adapter or fixture for this game exists | small — the Golf replay adapter as the reference implementation | task | **Deferred to the build epic** (game-owned deliverable, not engine work) |
| [G14](#g14) | CSV authoring ergonomics for writers (the spike's five frictions) | [§2.9.7](#297-the-spikes-five-authoring-frictions-resolved-or-known-limits) | delivered: `add-option`, `add-linked-card`, `add-card --after`, `--context` / `--epilogue` and the per-file `#resources:` declaration close all five frictions on the CLI | small — `src/story-line/content/author.ts` + `src/story-line/content/mutate.ts` | chore | **Delivered** — `CG-0MWQYDC7D003G4ON` |

### 6.3 Entry detail

#### <a id="g1"></a>G1 — Beat-sheet and objective layer

**What it unlocks.** The core loop ([§1.3](#13-the-core-loop)) has no engine
at this commit: acts select scenes, a scene charges a clock budget per entered beat,
one objective is evaluated at the close, an ordered outcome table classifies
`success` / `partial` / `failure`, an ordered route table picks the next
beat/scene, and a loss ledger records what the close cost. It is also what the
scene banner, clock, objective line and restart data read
([§3.1](#31-presentation-surfaces-and-sll-zone-names)).

**Why the engine cannot do it at this commit.** `src/story-line/compile.ts` compiles a
single card's option list and `src/story-line/resolve.ts` resolves one chosen
option; the module set (`compile`, `resolve`, `resources`, `journal`,
`validate`, `ui-adapter`, `types`) has no episode type. The nearest artefact,
`src/story-line/content/manifest.ts`, is a flat authoring graph, not a run-time
beat sheet. The spike's act and clock bookkeeping live in its game rule module
(`example-games/gym/GymLongErasureGame.ts`), which is exactly the code the
backlog's epic must make generic.

**Nearest precedent and effort band.** **Large**: `src/story-line/` itself —
compile, resolve, resources, journal, ui-adapter, validate — is the closest
comparable build. The band is large because the entry is a new runtime layer
plus versioned save/load, transcript, replay and guard integration, not a
helper. Secondary precedents: `src/ui/PhaseManager.ts` (game-agnostic phase
state machine) and `src/core-engine/SaveLoad.ts` /
`serializeWithVersion` (versioned run state).

**Disposition.** **Filed** — `CG-0MWR0BAT30015DPQ` (`epic`, high, effort `L`).
Blocked by the GDD epic and by G2 (the manifest shape is its input).

#### <a id="g2"></a>G2 — Episode manifest schema and validator

**What it unlocks.** [§2.2.1](#221-episode-manifest)'s data model becomes
checkable: the [§2.4](#24-how-the-beat-sheet-composes-with-story-line) rule
table (`duplicate-act`, `unknown-card`, `unassigned-card`, `dangling-chain`,
`non-total-routes`, `non-total-outcome-rules`, `objective-invalid`,
`loss-not-irreversible`, `numeric-invalid`, `resource-set-mismatch`,
`clock-cost-mismatch`, `ending-successor`) runs as a pure validator behind
`storylines:manifest`, and `resources.start` / `resources.bounds` become
manifest data so gate reachability is provable from the declaration instead of
a game constant ([§2.8.6](#286-what-the-engine-cannot-express-at-this-commit-named-gaps)
item 2).

**Why the engine cannot do it at this commit.** `schemas/` contains only
`story-line-manifest.schema.json`, which describes the flat story-line graph.
`src/story-line/content/manifest.ts` builds that graph deterministically;
`src/story-line/content/validate.ts` validates CSV content only — ids, options
encoding, successors, prose budgets, declared keys. Neither knows an act, a
scene, a beat, an objective, a budget or a route. The manifest CLI landed with
the epic (`CG-0MWSJYV86000ZHM4`): `package.json` now exposes
`storylines:manifest` alongside `storylines:validate|guard|graph|author|editor`.

**Nearest precedent and effort band.** **Medium**: the
`src/story-line/content/manifest.ts` + `src/story-line/content/validate.ts`
pair — a deterministic artefact builder and a pure validator with row/column
diagnostics, both already unit-tested. The rule count is bounded (14 named
rules), the validator is pure, and no runtime layer is required.

**Disposition.** **Delivered** by the build epic `CG-0MWR0BFMW003856N`
(schema, pure validator and the `storylines:manifest` CLI —
`CG-0MWSJYV86000ZHM4`).

#### <a id="g3"></a>G3 — Scene-space guard

**What it unlocks.** The third static check of [§2.4](#24-how-the-beat-sheet-composes-with-story-line):
enumerate scene exits and beat refusals and assert that no exhausted close is
classified `success` and that no refusal leaves a state with no reachable
ending. This is what makes [§2.8](#28-resource-model-and-economy)'s hull and
clock failure states provable rather than asserted, and it is a named build-epic
check in [§5.2](#52-verification-the-build-epic-must-add-named-gaps).

**Why the engine cannot do it at this commit.** `src/story-line/content/guard.ts`
enumerates the **card chain** over declared resources and asserts
`gated-branch-survivable`, `ending-reachable` and `consequential-rejoin`. It
takes a `ContentAdapter` and a CSV, has no manifest input, no scene boundary,
no clock and no outcome/route semantics — the clock is not a declared resource,
so an exhausted scene is invisible to it. (It also cannot yet model clamping;
see G4.)

**Nearest precedent and effort band.** **Medium**: `src/story-line/content/guard.ts`
itself — 955 lines of bounded depth-first enumeration with fail-closed
truncation reporting. The entry extends its state shape; the bound and reporting
machinery is reused.

**Disposition.** **Filed** — `CG-0MWR0BG9H007AFNU` (`feature`, medium, effort
`M`). Blocked by the GDD epic and by G2 (the guard needs a manifest to read).

#### <a id="g4"></a>G4 — Resource bounds, spill and clamped loss

**What it unlocks.** The ranges in [§2.8](#28-resource-model-and-economy)
(`hull` 0–5, `morale` 0–8, `stores` 0–6, `goodwill` 0–5, `charge` 1–2) become
enforced: a gain at the cap spills rather than banks, a loss at the floor clamps
and its unapplied remainder is recorded. Without it the GDD's "surplus spills /
loss clamps" statements are authoring discipline plus a fixture test.

**Why the engine cannot do it at this commit.**
`createResourceProjection(...).applyResourceDelta` in
`src/story-line/resources.ts` forwards every finite, non-zero delta to the
game's own `apply` without bounds: nothing clamps, nothing spills and nothing is
reported. `DEFAULT_RESOURCES` is a value bag, not a bounds declaration. The
nearest constrained helper, `src/rule-engine/EconomyLedger.ts`, is hard-coded to
`coins` / `reputation` and offers only `minCoins` / `minReputation` — no
maximum, no spill, no clamped-loss record, and no other key.

**Nearest precedent and effort band.** **Small–medium**:
`src/rule-engine/EconomyLedger.ts` (constraint-checked deltas) plus the
`StorylineResourceProjection` seam. The work is a bounds type, clamp/spill
arithmetic, a reported remainder and the manifest plumbing shared with G2.

**Disposition.** **Filed** — `CG-0MWR0BGVG004UE7X` (`feature`, medium, effort
`M`). Blocked by the GDD epic.

#### <a id="g5"></a>G5 — Irreversible-resource policy

**What it unlocks.** `hull` becomes a guarantee rather than a convention: no
authored `#extra` and no manifest loss rule can grant it, so the irreversible
tension dial of [§2.10](#210-tension-pacing-failure-and-reset-ending-scoring)
cannot be undone by content drift.

**Why the engine cannot do it at this commit.** `resources.irreversible` appears only in
the proposed manifest rule `loss-not-irreversible`
([§2.4](#24-how-the-beat-sheet-composes-with-story-line)), and the manifest
validator does not exist yet (G2). In the runtime,
`selectDeclaredDelta` (`src/story-line/resources.ts`) filters **undeclared**
keys; a declared irreversible key is applied like any other, so `#extra=hull:1`
is legal content. `src/story-line/content/validate.ts` refuses an undeclared key
(`unknown-resource-key`) but has no direction rule. At this commit the GDD's
guard is a fixture test plus authoring discipline
([§2.8.3](#283-the-economy-by-act)).

**Nearest precedent and effort band.** **Small**: the `unknown-resource-key`
rule (a declarative diagnostic carrying row, column and reason) and the sign
handling in `selectDeclaredDelta`. One declaration, one validation rule, one
projection guard.

**Disposition.** **Filed** — `CG-0MWR0BHH9002OQUZ` (`task`, medium, effort `S`).
Blocked by the GDD epic.

#### <a id="g6"></a>G6 — Compound and range conditions

**What it unlocks.** [§2.2.5](#225-objective)'s `Objective.check` and the
`#when` grammar could express "`hull ≥ 5` **and** `stores ≥ 3`", "at maximum"
or a range, instead of forcing a one-clause objective.

**Why the engine cannot do it at this commit.** `Condition` is a single
`{field, op, value}` (`src/story-line/types.ts`) evaluated by
`evaluateCondition` (`src/story-line/resolve.ts`); the manifest's `Objective.check`
deliberately reuses that shape. The GDD works around it — a one-clause objective
plus "a scene that needs more is two scenes" ([§2.2.5](#225-objective)) — which
is why this entry is not on the v1 critical path.

**Nearest precedent and effort band.** **Small**: `Condition` + `evaluateCondition`;
the grammar and the validator already exist, so the work is a composite
condition shape and its evaluation.

**Disposition.** **Deferred to the build epic.** The v1 model is one clause by
design; if the build epic needs a compound objective it opens this entry rather
than widening the manifest informally.

#### <a id="g7"></a>G7 — Surfaced affordability

**What it unlocks.** An unaffordable option can be shown disabled with its
shortfall ("2 charge needed") instead of being deleted at draw time, so the
player learns the economy rather than seeing a shorter list
([§2.8.6](#286-what-the-engine-cannot-express-at-this-commit-named-gaps) item 3:
32 of 302 option instances hidden, 107 of 197 dead turns gate-collapsed).

**Why the engine cannot do it at this commit.** `isOptionAffordable` in
`src/story-line/compile.ts` returns a boolean and `compileStorylineFromEvent`
filters unaffordable options out of `compiledOptions` before any presenter sees
them. `StorylineOption` carries the authored `cost` but no computed
affordability state and no shortfall shape.

**Nearest precedent and effort band.** **Small**: `isOptionAffordable` plus the
compiled-option shape. The arithmetic already exists; the change is an additive
field and a policy switch (omit by default, surface on request), so every current
caller keeps its behaviour.

**Disposition.** **Filed** — `CG-0MWR0BI3S008K9Y6` (`feature`, medium, effort
`S`). Blocked by the GDD epic.

#### <a id="g8"></a>G8 — Resource HUD

**What it unlocks.** A rendered, labelled view of the declared key set (value,
maximum, loss-bearing marker) in the presentation contract's status zone
([§3.1](#31-presentation-surfaces-and-sll-zone-names)), so a five-key economy is
legible without bespoke scene text — the precondition for hypothesised
comprehension ([§2.8.7](#287-how-the-economy-is-verified) H7).

**Why the engine cannot do it at this commit.** `src/ui/index.ts` exports card, hand and
pile views (`HandView`, `PileView`, `TokenPileView`), status helpers
(`HintBar`) and the panel/overlay surface, but no component that renders a
declared resource bag. SLL is not the gap: `src/ui/screen-layout.ts` resolves any
zone a game's layout declares, so a `resources` zone is layout data. The feed
seam exists (`StorylineResourceProjection.getResources`), the presenter does not.

**Nearest precedent and effort band.** **Medium**: `src/ui/TokenPileView.ts`
(token stack with live count labels and click handling) and `src/ui/HintBar.ts`
(compact multi-item status strip), both SLL-positioned and unit-tested. The work
is a reusable component with labels, bounds display, a colour-independent
loss marker and a reduced-motion update path.

**Disposition.** **Filed** — `CG-0MWR0BIPV0074WLM` (`feature`, medium, effort
`M`). Blocked by the GDD epic.

#### <a id="g9"></a>G9 — Act/scene transition presentation

**What it unlocks.** The scene exit reads as a consequence: a banner (act, scene,
objective result), then the route, then the next beat — with an act-transition
motion and a reduced-motion fallback ([§3.1](#31-presentation-surfaces-and-sll-zone-names)
`sceneBanner`, [§3.6](#36-named-presentation-gaps) B5).

**Why the engine cannot do it at this commit.** Correcting B5's first phrasing: a shared
camera transition **does** ship — `runSceneTransition` in
`src/ui/sceneTransition.ts` fades or slides the camera and returns immediately
under reduced motion. What does not exist is the **banner surface and the
sequence**: no act/scene title component, no presentation of the objective
result before routing, and no rendered precedent — the spike has no scene
boundary (`example-games/gym/GymLongErasureGame.ts`) and its layout declares
`statusBar`, `narrative`, `options`, `feedback`, `journal`, `controls`, with no
`sceneBanner` zone (`example-games/gym/layouts/gym-long-erasure.layout.json`).

**Nearest precedent and effort band.** **Small–medium**:
`src/ui/sceneTransition.ts` (timed transition + reduced-motion skip),
`src/ui/narration-reveal.ts` (sequenced animated text with SFX and a skip path)
and `src/ui/Overlay.ts` (`createOverlayBackground` / `dismissOverlay` depth
conventions). Every primitive exists; the work is composition, SLL wiring and
SFX.

**Disposition.** **Filed** — `CG-0MWR0BJBU005TDTT` (`feature`, medium, effort
`M`). Blocked by the GDD epic. It depends on the runner (G1) for an outcome to
present, but the presentation module can land independently.

#### <a id="g10"></a>G10 — Retire the legacy `act` / `clockCost` columns

**What it unlocks.** [§2.1](#21-composition-contract-who-owns-what)'s ownership
rule: act membership is `scene.id` under `act.scenes`, pacing is
`beat.clockCost` in the manifest, and neither is a CSV cell. Until the columns
retire, a writer on the GDD game can still author beat-sheet data in the wrong
place.

**Why the engine cannot do it at this commit.** `src/story-line/content/adapters.ts`
declares `act` and `clockCost` as Gym game columns **and** lists both in
`editableColumns`, with defaults. `example-games/gym/GymLongErasureGame.ts` reads
`clockCost` from the CSV for its pressure clock. The migration check
(`clock-cost-mismatch`) is part of the manifest validator (G2), which does not
exist yet.

**Nearest precedent and effort band.** **Small**: the adapter's column
declaration and the `missing-column` diagnostic in
`src/story-line/content/validate.ts`. A content-format change with a migration,
not new machinery.

**Disposition.** **Filed** — `CG-0MWR0BJXI007UINE` (`chore`, low, effort `S`).
Blocked by the GDD epic and by G2.

#### <a id="g11"></a>G11 — Keyboard choice navigation and overlay focus order

**What it unlocks.** The keyboard path of
[§3.4.4](#344-keyboard-and-touch-input-paths): choose an option with `1`–`6` or
arrows + Enter, traverse focus in an open overlay, activate with Enter/Space and
close only the topmost modal with Escape
([§3.2](#32-overlay-behaviour)). Without it the accessibility contract's keyboard
claims are aspirational ([§3.8](#38-what-this-section-does-not-prove)).

**Why the engine cannot do it at this commit.** Only the panels bind their own toggle
key: `HelpPanel` (`toggleKey`, default `FORWARD_SLASH` = `?`) and `SettingsPanel`
(`toggleKey`, default `Escape`) register `keydown` listeners in their own
lifecycle. `getEndTurnKeybind()` / `setEndTurnKeybind()` in
`src/ui/SettingsStore.ts` bind one game action. No choice-list navigator,
focus-trap or focus-order helper is exported from `src/ui/index.ts`.

**Nearest precedent and effort band.** **Small**: the keydown listener lifecycle
in `src/ui/HelpPanel.ts` (register, and `off` on destroy) and
`src/ui/OverlayManager.ts` (one live modal, ordered open/close). One navigator
helper plus focus handling on the existing overlay primitives.

**Disposition.** **Filed** — `CG-0MWR0BKIT0084ZID` (`task`, low, effort `S`).
Blocked by the GDD epic.

#### <a id="g12"></a>G12 — Shared verbosity preference

**What it unlocks.** The Full/Concise reading preference of
[§3.4.2](#342-verbosity-and-tooltips) persists across games and sessions, like
tooltips and reduced motion already do.

**Why the engine cannot do it at this commit.** `src/ui/SettingsStore.ts` persists the
end-turn keybind (`tce-endturn-keybind`) and tooltips (`tce-show-tooltips`);
`src/ui/ReducedMotion.ts` persists reduced motion (`tce-ui-reduced-motion`).
There is no verbosity key or getter/setter, and `SettingsPanel.extraToggles` is
game-local with no shared persistence.

**Nearest precedent and effort band.** **Extra-small**: the tooltips toggle pair
in `SettingsStore` plus the `extraToggles` wiring in `SettingsPanel`. One storage
key, one getter/setter pair, one panel toggle.

**Disposition.** **Filed** — `CG-0MWR0BL4Q000OYG6` (`task`, low, effort `XS`).
Blocked by the GDD epic.

#### <a id="g13"></a>G13 — Deterministic replay adapter and fixture

**What it unlocks.** The [§3.5.4](#354-replay) guarantee can be asserted for
this game: a transcript replay reproduces identical scene exits and score at the
same seed.

**Why the engine cannot do it at this commit.** The engine seam **is** present —
`scripts/replay.ts` plus the per-game `ReplayAdapter` interface in
`scripts/adapters/ReplayAdapter.ts` (Golf is the reference implementation).
What does not exist is an adapter and fixture for this game, because the game
does not exist yet.

**Nearest precedent and effort band.** **Small**: the Golf replay adapter. The
tool and interface are done; the per-game parsing, state injection and scene
boot are the work.

**Disposition.** **Deferred to the build epic.** This is a **game-owned
deliverable, not engine work**; listing it as an engine gap would mis-size the
build epic.

#### <a id="g14"></a>G14 — CSV authoring ergonomics (delivered)

**What it unlocks.** The writer path of
[§2.9](#29-writer-content-pipeline-csv-authoring-and-the-review-gate) without the
five recorded frictions (whole-cell replacement, no forward reference, repeated
resource list, no positional insert, prose not authorable from the CLI).

**Why the engine cannot do it at this commit.** It can, and does:
`CG-0MWQYDC7D003G4ON` delivered every friction on the author CLI. `add-option`
appends one option to the existing `options` cell; `add-linked-card` writes a
card and its incoming link in one validated transaction; `add-card --after
<card-id>` inserts a row at a documented position (and refuses an edit that
would silently re-point a story-line's entry card); a leading `#resources:`
line declares the resource set once per file; and `--context` / `--epilogue`
author prose with no editor session. The target-must-exist refusal, the
whole-cell `update-card --options` rewrite and the strict validator are
unchanged, deliberately. Friction 5 (a typo'd column was a silent no-op) was
already resolved by the `unknown content column` hard error.

**Nearest precedent and effort band.** **Small**: the existing authoring verbs
and the editor's guided forms; the CLI was the gap, not the model.

**Disposition.** **Delivered** — `CG-0MWQYDC7D003G4ON` (`chore`). This backlog
entry stays for the record; no follow-up work is needed.

**Nearest precedent and effort band.** **Small**: the existing authoring verbs
and the editor's guided forms; the CLI is the gap, not the model.

**Disposition.** **Filed** — `CG-0MWQYDC7D003G4ON` (already live, `chore`,
open). This backlog records it as CSV follow-through work rather than re-filing
it.

### 6.4 The five expected gaps, assessed explicitly

The GDD's scope named five expected gaps. Each is assessed here, with the verdict
this backlog reaches.

| Expected gap | Verdict | Entries | Evidence at this commit |
|---|---|---|---|
| Beat-sheet / objective layer | **Confirmed — the build epic's core.** Not one gap but three that ship together: the runtime layer, the manifest contract that describes it and the guard that proves it. | [G1](#g1), [G2](#g2), [G3](#g3) | `src/story-line/compile.ts`, `src/story-line/resolve.ts`, `src/story-line/content/manifest.ts`, `src/story-line/content/guard.ts` |
| Arbitrary-resource generalisation follow-through | **Partially landed; the follow-through is real but split.** The declared set, declared-key deltas and `unknown-resource-key` shipped (`src/story-line/resources.ts`, `src/story-line/content/validate.ts`). What did **not** ship: bounds/clamping, the irreversibility guarantee, structured affordability and compound conditions. | [G4](#g4), [G5](#g5), [G6](#g6) (and [G7](#g7) for affordability) | `applyResourceDelta` is unbounded; `selectDeclaredDelta` has no direction rule; `Condition` is single-clause |
| CSV extension follow-through | **No single missing capability; the remaining work is split two ways.** The CSV vocabulary (`#cost` / `#extra` / `#when` / `#says`, `resources`, prose columns), the validator, the guard and the editor shipped, and the authoring ergonomics landed ([G14](#g14), delivered). Remaining: retire the legacy columns and validate the manifest/CSV agreement. | [G10](#g10), [G2](#g2), [G14](#g14) | `src/story-line/content/adapters.ts` still declares `act` / `clockCost`; `CG-0MWQYDC7D003G4ON` delivered the authoring CLI ergonomics |
| Resource HUD | **Confirmed.** No component renders a declared resource bag; the spike draws its two-key economy by hand. The zone itself is layout data and is not the gap. | [G8](#g8) (with [G7](#g7) for the affordability presentation) | `src/ui/index.ts` (no resource component), `src/ui/TokenPileView.ts` (nearest precedent) |
| Act/scene transition presentation | **Confirmed, but narrower than first stated.** A camera transition ships (`runSceneTransition`); the banner surface, the outcome→route sequence and any rendered scene boundary do not. | [G9](#g9) | `src/ui/sceneTransition.ts`, `example-games/gym/layouts/gym-long-erasure.layout.json` (no `sceneBanner` zone) |

### 6.5 What is deliberately not a gap

These capabilities were named while writing other sections and are **not**
backlog entries, because the engine already provides them. Listing them keeps the
backlog honest: a reviewer can see the claim was checked, not avoided.

| Capability | Why it is not a gap | Where it lives |
|---|---|---|
| Per-game SLL zone names (including the GDD's new zones) | SLL resolves any zone a layout declares; zones are per-game data | `src/ui/screen-layout.ts`, `src/ui/screen-layout-schema.ts` |
| Overlay depth, dismissal and renderer-aware clipping | shipped primitives; the depth contract is documented | `src/ui/Overlay.ts` (`createOverlayBackground`, `dismissOverlay`, `createOverlayDialog`), `src/ui/ContainerClip.ts` (`createContainerClip`) |
| Tooltips and hover-intent delays | shipped with pointer/touch delays | `src/ui/Tooltip.ts` |
| Reduced motion | one effective-preference helper and helper-level fallbacks | `src/ui/ReducedMotion.ts` (`getEffectiveReducedMotion`), `src/ui/sceneTransition.ts` |
| Versioned save/load | shipped, with a version-mismatch refusal | `src/core-engine/SaveLoad.ts` (`SaveLoadStore`, `serializeWithVersion`) |
| Transcript recording and persistence | shipped | `src/core-engine/TranscriptRecorder.ts` (`TranscriptRecorderBase`), `src/core-engine/TranscriptStore.ts` |
| SFX keys and event-driven audio | the shared key set and `SoundManager` mapping ship | `src/core-engine/SoundManager.ts` (`COMMON_SFX_KEYS`), `docs/SFX_CONVENTION.md` |
| Prose pagination and progressive narration | shipped, including reduced-motion/skip paths | `src/ui/prose-pagination.ts`, `src/ui/narration-reveal.ts` |
| Camera-level scene transitions | shipped | `src/ui/sceneTransition.ts` (`runSceneTransition`) |
| Deterministic seeded RNG | shipped and already used by `@story-line` candidate draws | `src/core-engine/` seeded RNG, `src/story-line/resolve.ts` |

### 6.6 Disposition record

| Entry | Worklog item | Type | Priority | Effort | Blocked by | Status at filing |
|---|---|---|---|---|---|---|
| G1 | `CG-0MWR0BAT30015DPQ` | epic | high | L | GDD epic, G2 | blocked, scheduled past the GDD close |
| G2 | `CG-0MWR0BFMW003856N` | feature | high | M | GDD epic | blocked, scheduled past the GDD close |
| G3 | `CG-0MWR0BG9H007AFNU` | feature | medium | M | GDD epic, G2 | blocked, scheduled past the GDD close |
| G4 | `CG-0MWR0BGVG004UE7X` | feature | medium | M | GDD epic | blocked, scheduled past the GDD close |
| G5 | `CG-0MWR0BHH9002OQUZ` | task | medium | S | GDD epic | blocked, scheduled past the GDD close |
| G6 | — | task | — | — | — | **Deferred** — one-clause objectives are the v1 model |
| G7 | `CG-0MWR0BI3S008K9Y6` | feature | medium | S | GDD epic | blocked, scheduled past the GDD close |
| G8 | `CG-0MWR0BIPV0074WLM` | feature | medium | M | GDD epic | blocked, scheduled past the GDD close |
| G9 | `CG-0MWR0BJBU005TDTT` | feature | medium | M | GDD epic | blocked, scheduled past the GDD close |
| G10 | `CG-0MWR0BJXI007UINE` | chore | low | S | GDD epic, G2 | blocked, scheduled past the GDD close |
| G11 | `CG-0MWR0BKIT0084ZID` | task | low | S | GDD epic | blocked, scheduled past the GDD close |
| G12 | `CG-0MWR0BL4Q000OYG6` | task | low | XS | GDD epic | blocked, scheduled past the GDD close |
| G13 | — | task | — | — | — | **Deferred** — game-owned replay adapter |
| G14 | `CG-0MWQYDC7D003G4ON` | chore | — | — | — | **Delivered** — authoring CLI ergonomics |

**The build-epic handover.** When the build epic is created, its first act is to
clear `startOn` on the filed entries it adopts and set each one's parent to the
build epic. Entries it declines stay blocked and scheduled, so a declined gap is
visible rather than silently dropped. G6 and G13 are adopted only if the build
epic's scope statement claims them.

### 6.7 How a reviewer verifies this backlog

1. **Open every cited module.** Each "why not at this commit" names a file in
   `src/story-line/`, `src/story-line/content/`, `src/ui/` or
   `example-games/gym/`. Confirm the named concept is absent (for a follow-through
   gap, confirm what landed is exactly what the entry credits).
2. **Check the effort band against its precedent.** Each band names a module or
   module pair; the band is credible only if the precedent is comparable in
   surface area.
3. **Check the disposition.** Every row of §6.6 is a live item id or the
   `Deferred` marker, and every filed item is blocked and scheduled.
4. **Run the structural contract.**
   `npx vitest run --project unit tests/story-line/content/gdd-engine-gap-backlog.test.ts`
   fails if a cited path disappears, a required field or entry is missing, or a
   disposition is neither a filed id nor the deferred marker.
5. **Check that no gap is a duplicate.** No filed entry re-creates an already
   completed item; G14 is explicitly reused rather than re-filed.

## 7. V1 Scope Statement and Deferred List

> **Written by `CG-0MWPY2HJU006LJMU`.** This section replaces the stub that
> [§2.7](#27-sections-owned-by-downstream-work-items) listed. It fixes the v1
> content volume, the playtime target and its arithmetic, the authored word
> budget, the replayability story and the cut line, and it checks every v1
> capability against the engine-gap backlog ([§6](#6-engine-gap-backlog)). It
> re-tunes no resource number ([§2.8](#28-resource-model-and-economy)), changes
> no scoring weight or band ([§2.10.5](#2105-the-reset-ending-scoring-model)) and
> files no new engine gap: it is the section where those three sections are
> converted into a volume a producer can approve, and a cut line that says what
> is deliberately absent.

**The cut line in one paragraph.** V1 is the complete voyage: **three acts,
seven scenes, twenty-one authored scene beats and five endings**, played against
all five declared resources, the per-scene clock, the irreversible hull ledger
and the journal-derived epilogue. Every **engine** capability that sentence
needs is a **filed** gap ([§7.5](#75-every-v1-capability-against-the-backlog));
the capabilities the engine already ships are listed, so they are checked rather
than assumed, in [§6.5](#65-what-is-deliberately-not-a-gap). Everything else is
either an engine gap the build epic builds first, or a deferral recorded in
[§7.6](#76-the-deferred-list) with what it blocks and where it is tracked. Two
things follow immediately, and they are the reason this section exists: nothing
in v1 needs a gap that is unfiled, and nothing in v1 needs a gap bigger than
`large`.

**Two kinds of count.** Every number below is either an **authored** count (what
the writer and designer produce) or a **run** count (what one player enters).
The spike's 19-card file against its measured 6–10-beat run is the proof that
the two must not be confused: a player never traverses every authored beat,
because a scene's beats form a small ring and a run takes a subset of them.

### 7.1 The v1 counts

| Item | V1 value | Derived from | Verified by |
|---|---|---|---|
| Acts | **3** | the arc weighting in [§2.10.5](#2105-the-reset-ending-scoring-model) (15 / 20 / 25) is defined over three acts | [§7.7](#77-consistency-check) and the contract test |
| Scenes | **7** — Act I 2, Act II 3, Act III 2 | [P4](#2103-pacing-rules-stated-numerically): 2 / 3 / 2 scenes | the manifest and the contract test |
| Authored scene beats | **21** — Act I 6, Act II 9, Act III 6 (3 per scene) | [P1](#2103-pacing-rules-stated-numerically) (2–5 beats, target 3) inside P4's act bands | the manifest and the contract test |
| Authored decision points | **21** — every scene beat offers a choice; **18** offer two or more options and **3** are labelled single-option transits (exactly one per act) | [P2](#2103-pacing-rules-stated-numerically) | the manifest, the route-space harness and the content guard |
| Consequential decision points | **12 or more of the 18**, each meeting the minimum rejoin distance of 3 | [P3](#2103-pacing-rules-stated-numerically) | content guard `consequential-rejoin` and the route-space harness |
| Authored scene exits | **16** — two scenes author three doors (success / partial / failure), five author two | [§2.2.7](#227-routes-and-route-targets) route tables and [§2.10.4](#2104-failure-and-recovery-per-failure-type) | the manifest's route tables |
| Endings | **5** — the four carried from the spike plus the Act I hatch | [§2.10.5](#2105-the-reset-ending-scoring-model): v1 must author an early terminal so the bottom two bands are reachable in play | `endings[]` in the manifest and the route-space guard |
| Scenes entered per run | **5–6 of 7** | [P5](#2103-pacing-rules-stated-numerically) | the route-space harness |
| Beats entered per run | **12–16** | [P5](#2103-pacing-rules-stated-numerically) (the spike measured 6–10) | the route-space harness (`beats`) |
| Decisions per run | **10–14** | [P5](#2103-pacing-rules-stated-numerically) (the spike measured 5–9) | the route-space harness (`choices`) |
| Target playtime | **13 minutes a run, 10–16 minute range** | [§7.2](#72-playtime-the-assumption-and-the-arithmetic) | the contract test's arithmetic check |
| Authored word budget | **3,200 words, tolerance 2,900–3,500** | [§7.3](#73-the-authored-word-budget) | the contract test's arithmetic check |
| Declared resource keys | **5** — `hull`, `morale`, `stores`, `goodwill`, `charge` | [§2.8.1](#281-the-v1-declared-set-and-what-is-deliberately-not-in-it) | the contract test's cross-check against [§2.8](#28-resource-model-and-economy) |
| Playable routes (target) | **150 or more** | [§7.4](#74-replayability-what-changes-between-runs) (the spike's route space was 138) | the route-space harness |
| Distinct terminal states (target) | **100 or more** | [§7.4](#74-replayability-what-changes-between-runs) (the spike's was 132) | the route-space harness |

**Per act, the counts inside P4's bands:**

| Act | Scenes | Authored beats | Decision points | Scenes a run enters | Arc weight |
|---|---|---|---|---|---|
| Act I — the record | 2 | 6 | 6 (5 real + 1 transit) | 2 | 15 |
| Act II — the price | 3 | 9 | 9 (8 real + 1 transit) | 2–3 | 20 |
| Act III — the core | 2 | 6 | 6 (5 real + 1 transit) | 1–2 | 25 |
| Endings | — | 5 terminal cards (1 beat each) | 0 (the post-ending restart aside) | 1 ending | 0 |

Across the whole run the two run-level rules bind: **5–6 of the 7 scenes** are
entered and **12–16 beats** are played. A run does not enter every authored beat
of a scene it visits — each scene's three beats form a small ring and a run takes
two or three of them — so the per-act columns above are authored volume, not a
per-run traversal.

**The five endings.** Four are carried unchanged from the spike; the fifth is the
early terminal [§2.10.5](#2105-the-reset-ending-scoring-model) requires so the
bottom two bands are reachable in play. The hatch's card title is composed from
ordinary English words, so it adds no proper noun to the naming layer
([§4.2](#42-the-settings-names-final) naming rule 1) and needs only the standing
prohibited-term scan at authoring time.

| Ending card | Title | Reachable from | Band ceiling |
|---|---|---|---|
| `le-end-reset` | *The Long Erasure* | the Act III scene's success door | 92 (authored maximum) |
| `le-end-quiet` | *A Quiet Chart* | the Act III scene's charge-gated door | 92 |
| `le-end-ram` | *Ashlight, Ends* | the Act III scene's hull-costing door | 92 |
| `le-end-abandon` | *The Voyage Abandoned* | the Act II hatch | 67 (arc 35 + choices 12 + resources 20) |
| `le-end-hatch` | *A Record Nobody Filed* | the Act I hatch | 47 (arc 15 + choices 12 + resources 20) |

**Appendix A is the shape example, not the v1 volume.** The worked manifest
stays a five-scene, fifteen-beat, four-ending manifest over the shipped spike
content; this section is the v1 volume the build epic implements. Where the two
disagree, this section is the contract and Appendix A is the illustration.

### 7.2 Playtime: the assumption and the arithmetic

Playtime is **estimated from the measured beats-per-run figure**, not from
playtested human sessions. The estimate is only as good as its two stated
assumptions, so both are printed here and neither is hidden inside a total.

| Input | Value | Source |
|---|---|---|
| Spike beats per run (measured, 160 policy runs) | 6 / **7.95** / 10 (min / mean / max) | [evaluation §4.2](./storyline-playtest-evaluation.md#4-pacing-measured-numerically) |
| Spike beats per run (measured, route space) | 6–10, mean **8.48** | [evaluation §4.2](./storyline-playtest-evaluation.md#4-pacing-measured-numerically) |
| Spike choices per run (measured, route space) | 5–9, mean 7.57 | [evaluation §4.2](./storyline-playtest-evaluation.md#4-pacing-measured-numerically) |
| V1 beats per run | **12–16, mean 14** | [P5](#2103-pacing-rules-stated-numerically) and [§7.1](#71-the-v1-counts) |
| Per-beat allowance (**assumption A1**) | **35–50 s, target 42 s** — read the beat's context and its two-to-three options, compare costs, decide | this section; not measured |
| Presentation overhead (**assumption A2**) | **~3 min** a run — opening, seven scene-exit banners, two act transitions, the epilogue and the score screen | this section; not measured |
| Arithmetic | 12 × 35 s + 3:00 ≈ **10:00**; 14 × 42 s + 3:00 ≈ **12:48**; 16 × 50 s + 3:00 ≈ **16:20** | this section |
| Published target | **13 minutes a run, 10–16 minute range** | this section |

**The estimate's basis, stated plainly.** The measured figure is **6–10 beats
and 5–9 choices per run** (mean 8.48 beats over the route space, 7.95 beats over
the 160 policy runs). V1 nearly doubles both: P5 requires **12–16 beats and
10–14 decisions**, because each scene now closes on an objective and routes on
its outcome rather than falling through a chain. Multiplying the v1 run length by
the per-beat allowance (A1) and adding the presentation overhead (A2) gives
roughly **10–16 minutes**, with a **13-minute target** at the mean run of 14
beats.

**Cross-check against the word volume.** A run reads about **1,300–1,700
words** (12–16 beats × about 100 words of context, outcome line and chosen
option prose, plus one ~100-word epilogue). At 200 words per minute that is
6.5–8.5 minutes of reading and at 150 words per minute 8.7–11.3 minutes, leaving
**2–3 minutes of decision and presentation time** to reach the same 10–16 minute
range. The two derivations agreeing is the reason the target is credible; they
share one weakness — **neither was measured on a human**.

**What the estimate does not claim.**

1. **It is not a playtest.** A1 and A2 are assumptions; a human browser playtest
   (ideally three people, at least one who has not read the content) is the
   measurement that would replace them, and it is deferred in
   [§7.6](#76-the-deferred-list) row D3.
2. **It describes a first run.** A returning player who already knows the
   doors reads faster and lands at the low end of the range.
3. **It is a single run, not a completion time.** Seeing all seven scenes and
   all five endings takes **two to three runs** — a run enters 5–6 of the 7
   scenes and exactly 1 of the 5 endings — so the whole chart is roughly
   **25–45 minutes** of play. That is the replayability time the design is
   sized for.
4. **It cannot be verified by the unit suite.** The contract test checks the
   arithmetic in this section, not the human experience of the run.

### 7.3 The authored word budget

The budget is derived from the engine's own prose budgets
([`PROSE_FIELD_SPECS`](../../src/story-line/content/prose.ts)) and the spike's
measured authoring density, so a writer has a per-surface limit rather than a
single opaque total.

| Prose surface | Engine budget | Authored count | Character ceiling | Approx. words |
|---|---|---|---|---|
| `context` (the beat's situation) | 400 chars a beat | 21 beats | 8,400 | 1,370 |
| `epilogue` (the ending's close) | 600 chars an ending | 5 endings | 3,000 | 490 |
| `effect` (the beat's outcome line) | ~90 chars a card (the spike's measured density) | 26 cards | 2,340 | 380 |
| option `#says` (the chosen option's prose) | ~130 chars an option (the spike's measured density) | ~45 options | 5,850 | 950 |
| **Total authored** | — | **26 cards** | **~19,600 chars** | **~3,200 words** |

**The rule.** The authored budget is **3,200 words**, with a **±10% approval
tolerance (2,900–3,500)** a writer may land inside without re-approval. It is
derived at **6.15 characters per word** — the conversion the spike's 1,820
authored words over 19 cards implies. The hard floor is **2,500 words**: that is
the spike's own measured density (96 words a card) carried to 26 cards, below
which the cards cannot carry their context and option prose at the engine
budgets. A change to a prose budget in `PROSE_FIELD_SPECS` changes this table,
not the other way round.

**Per run, the player reads roughly 40–50% of it** (1,300–1,700 of the 3,200
words), which is the replayability budget made concrete: a second run reads a
different subset because it enters different beats and chooses different options.

### 7.4 Replayability: what changes between runs

| What varies | What is fixed | Target |
|---|---|---|
| **Route** — 18 real decisions, 12 or more of them consequential (rejoin distance 3), every scene exit an authored door | the three-act frame, the 7 scenes, the one-clause objective a scene asks, the per-scene budget | **150 or more playable routes, 100 or more distinct terminal states**; every ending reachable, and each of the four carried endings reached on at least 2 routes |
| **Seed** — the run's only RNG, drawn when one choice pushes to several possible head successors; the seed is recorded at `run-start` and stored in the save | the authored tables are evaluated in declaration order and a scene close consumes no RNG ([§3.5.1](#351-determinism)) | **160 measured runs (40 seeds × 4 policies — `first`, `last`, `seeded`, `greedy-goodwill`)**, covering all 7 scenes and all 5 endings, with zero runs that reach no ending and zero dead turns ([P6](#2103-pacing-rules-stated-numerically)) |
| **Resources and the ledger** — a run's five-key bag, the hull it spends and every ledger line it records | the starting bag (5 / 5 / 4 / 0 / 2) and the bounds in [§2.8.2](#282-per-key-contract); `hull` is never granted | every one of the five keys has at least one source, one sink and one gate in v1; the ledger is never cleared, including at reset |
| **Scene outcomes and doors** — `success` / `partial` / `failure` per scene and the door it opens, refusals included | the route vocabulary (`chain` / `beat` / `ending`) with no `retry` kind | every refusal routes to authored content; no route leads to a state without an ending |
| **Score and band** — the journal-derived score and one of the five bands | the weights, caps and band boundaries of [§2.10.5](#2105-the-reset-ending-scoring-model) | all five bands reachable in play, including 0–19 and 20–39, which is why the Act I hatch exists |

**What changes between runs, in one paragraph.** A second run is a **different
voyage over the same chart**, not a reshuffle: the acts, scenes, objectives and
budgets are identical, so the player's knowledge carries; the doors they opened
last time are not the doors they open this time, because a consequential choice
forks three or more beats before its scene closes; the bag and the hull ledger
make the middle of the run a consequence of the beginning; and only one of five
endings was seen. The seed never changes the *story* — it only moves a choice
onto a different authored successor when the content offers more than one — so
the variety a player feels is authored, and the seed's job is to make it
replayable, not to generate it.

**Why the route target is credible.** The spike's route space was **138 playable
routes and 132 distinct terminal states** over 5 scenes, 15 beats and 14 decision
points ([evaluation §4.2](./storyline-playtest-evaluation.md#4-pacing-measured-numerically)).
V1 adds two scenes, six beats and four decision points across a wider per-scene
ring, so **150 routes and 100 terminal states** is a floor rather than a stretch
— and it is the floor the route-space harness measures, not a count the writer
aims at.

### 7.5 Every v1 capability against the backlog

Every engine capability v1 needs is traced to a **filed** gap below, and no row
is an unfiled gap or one of the deferred entries `G6` / `G13`.

| V1 capability | GDD section | Backlog entry | Effort band | Filed item |
|---|---|---|---|---|
| Beat sheet / objective runtime layer (acts, scenes, budgets, outcomes, routing, ledger) | [§1.3](#13-the-core-loop), [§2.2](#22-the-scene-beat-sheet-data-model) | [G1](#g1) | large | `CG-0MWR0BAT30015DPQ` |
| Episode manifest schema and validator (`storylines:manifest`) | [§2.2.1](#221-episode-manifest), [§2.4](#24-how-the-beat-sheet-composes-with-story-line) | [G2](#g2) | medium | `CG-0MWR0BFMW003856N` |
| Scene-space guard (every exit, every refusal, every ending) | [§2.4](#24-how-the-beat-sheet-composes-with-story-line), [§2.10.4](#2104-failure-and-recovery-per-failure-type) | [G3](#g3) | medium | `CG-0MWR0BG9H007AFNU` |
| Resource bounds and spill/clamp reporting | [§2.8](#28-resource-model-and-economy) | [G4](#g4) | small–medium | `CG-0MWR0BGVG004UE7X` |
| Irreversible-resource policy (`hull` is never granted) | [§2.8.2](#282-per-key-contract), [§2.10.2](#2102-irreversible-loss-hull-as-the-dial) | [G5](#g5) | small | `CG-0MWR0BHH9002OQUZ` |
| Surfaced affordability (an unaffordable door is shown, not deleted) | [§2.3](#23-how-a-scene-outcome-selects-the-next-beat), [§2.10.1](#2101-the-clock-a-visible-per-scene-budget) T5 | [G7](#g7) | small | `CG-0MWR0BI3S008K9Y6` |
| Resource HUD for the declared five-key bag | [§3.1](#31-presentation-surfaces-and-sll-zone-names), [§3.4.3](#343-colour-independent-signalling) | [G8](#g8) | medium | `CG-0MWR0BIPV0074WLM` |
| Scene-exit banner and sequenced act transition (with reduced motion) | [§2.3](#23-how-a-scene-outcome-selects-the-next-beat), [§3.1](#31-presentation-surfaces-and-sll-zone-names) | [G9](#g9) | small–medium | `CG-0MWR0BJBU005TDTT` |
| Retire the legacy `act` / `clockCost` CSV columns | [§2.1](#21-composition-contract-who-owns-what), [§2.9](#29-writer-content-pipeline-csv-authoring-and-the-review-gate) | [G10](#g10) | small | `CG-0MWR0BJXI007UINE` |
| Keyboard choice navigation and overlay focus order | [§3.4.4](#344-keyboard-and-touch-input-paths) | [G11](#g11) | small | `CG-0MWR0BKIT0084ZID` |
| Shared verbosity preference (Full / Concise) | [§3.4.2](#342-verbosity-and-tooltips) | [G12](#g12) | extra-small | `CG-0MWR0BL4Q000OYG6` |
| Writer authoring ergonomics for the v1 volume | [§2.9.7](#297-the-spikes-five-authoring-frictions-resolved-or-known-limits) | [G14](#g14) | small | `CG-0MWQYDC7D003G4ON` (delivered) |

**The disposition check.** Every row names a live Worklog item that already
exists in [§6.6](#66-disposition-record), and every effort band is the one
[§6.2](#62-the-backlog-at-a-glance) states for that entry. The largest band on
the list is **`large`** (G1, the runtime layer), which is filed and scheduled;
the backlog's band vocabulary tops out at `large`
([§6.1](#61-how-to-read-an-entry)), so **no** v1 capability is `extra-large` —
and none is unfiled. The two entries v1 does **not** depend on are `G6`
(compound conditions) and `G13` (this game's replay adapter); both are deferred
in [§7.6](#76-the-deferred-list).

**The scheduling hold is unchanged.** Every filed entry is `blocked`, depends on
the GDD epic `CG-0MWNFVLYT003M7XF` and carries `startOn 2027-06-01`, so nothing
on this list can be dispatched before the GDD closes and the build epic is
scoped. Clearing `startOn` and re-parenting the adopted entries is the build
epic's first act ([§6.6](#66-disposition-record)).

### 7.6 The deferred list

Each row names **what the deferral blocks** (the capability that is unavailable
until it is lifted), why v1 does not need it, and where it is tracked so it
cannot be silently dropped.

| # | Deferral | What it blocks | Why v1 does not need it | Tracked in |
|---|---|---|---|---|
| D1 | Compound and range conditions — [G6](#g6) | any objective or gate with two clauses ("`hull ≥ 5` **and** `stores ≥ 3`", "at maximum") | every v1 objective is one clause by design; a scene that needs more than one is authored as two scenes ([§2.2.5](#225-objective)) | [§6.6](#66-disposition-record) row `G6` (marked **Deferred**) and the build epic's handover |
| D2 | Deterministic replay adapter and fixture for this game — [G13](#g13) | fixture-driven replay regression of recorded runs ([§3.5.4](#354-replay)) | v1 records append-only transcripts ([§3.5.3](#353-transcript)) and the pure module is unit-tested; the adapter is a game-owned deliverable, not engine work | [§6.6](#66-disposition-record) row `G13` and [§5.2](#52-verification-the-build-epic-must-add-named-gaps) |
| D3 | A human browser playtest of the v1 content | measured wall-clock playtime, phone readability and felt tension — i.e. the measurement that would replace assumptions A1 and A2 in [§7.2](#72-playtime-the-assumption-and-the-arithmetic) | no v1 acceptance criterion depends on the playtest; the playtime target states its basis and its weakness | `CG-0MWR27FHI000HPT3` (filed by this item) |
| D4 | Re-tuning the five resource numbers after the vertical slice | the final balance values — the starts, bounds and per-key costs in [§2.8.2](#282-per-key-contract) | v1 fixes the **container** (per-scene budgets, the irreversible dial, one-clause objectives); the numbers are the spike's measured baseline and any change must keep the rules of [§2.8.2](#282-per-key-contract) and [§2.8.3](#283-the-economy-by-act) | [§2.8](#28-resource-model-and-economy) preamble (the change-control rule) and the build epic's handover |
| D5 | Steam achievements for the voyage | platform achievement unlocks and any player-visible progression outside the epilogue | v1's record is the epilogue and the transcript; the engine's achievement seam is game-agnostic and a game only declares a mapping | `electron/achievement-manifest.json` (the single source of truth) and [§6.5](#65-what-is-deliberately-not-a-gap) |

**What "deferred" does not mean.** A deferred entry is not a rejected one: D1
and D2 are live rows in the backlog with an explicit reason, D3 has its own work
item, D4 is governed by the resource model's own change-control rule, and D5 is
gated behind a manifest that a launcher build reads. None of them blocks a v1
acceptance criterion, and none of them can be closed by saying "it was never
written down".

### 7.7 Consistency check

| Axis | v1 commitment | Where it comes from |
|---|---|---|
| Act / scene shape | 3 acts, 7 scenes (2 / 3 / 2), 21 beats (6 / 9 / 6) — inside P4's bands | [§2.10.3](#2103-pacing-rules-stated-numerically) P1, P4 |
| Run length | 12–16 beats and 10–14 decisions, 5–6 of 7 scenes, one ending | [P5](#2103-pacing-rules-stated-numerically) |
| Resources | the five declared keys (`hull`, `morale`, `stores`, `goodwill`, `charge`), starts 5 / 5 / 4 / 0 / 2, the bounds of §2.8.2, `hull` irreversible | [§2.8.1](#281-the-v1-declared-set-and-what-is-deliberately-not-in-it), [§2.8.2](#282-per-key-contract) |
| Objectives | one clause each; every declared key is read by at least one objective or `#when` gate | [§2.2.5](#225-objective), [§2.8.1](#281-the-v1-declared-set-and-what-is-deliberately-not-in-it) |
| Clock | per-scene budgets of 2–7 ticks, at most one deliberate cliff per act, every scene entry resets its budget | [§2.10.1](#2101-the-clock-a-visible-per-scene-budget), [P7](#2103-pacing-rules-stated-numerically) |
| Loss rules | only on `partial` or `failure`, only on an irreversible key, always with a printed statement; no scene close consumes RNG | [§2.10.2](#2102-irreversible-loss-hull-as-the-dial), [§3.5.1](#351-determinism) |
| Scoring | arc 15 / 20 / 25 / 0, choices 12, resources 20, losses 20, five bands | [§2.10.5](#2105-the-reset-ending-scoring-model) |
| Endings | 5, including the Act I hatch that makes the 0–19 and 20–39 bands reachable in play | [§2.10.5](#2105-the-reset-ending-scoring-model), [§2.10.6](#2106-what-this-section-does-not-prove) |
| Engine | every capability a filed gap; the largest is `large` (G1); nothing `extra-large`; G6 and G13 not required | [§6.1](#61-how-to-read-an-entry), [§6.6](#66-disposition-record) |

**The Act I hatch is arithmetic, not a wish.** The bottom two bands are reachable
only if the hatch can be entered early with most of the bag already spent. With
arc 15 for Act I, 2 points a choice, 1 point a remaining resource point (capped
at 4 a key) and −2 a cost point, the hatch's reachable range is:

| Hatch run | Arc | Choices | Resources | Losses | Total | Band |
|---|---|---|---|---|---|---|
| Entered after 1 choice, bag intact | 15 | 2 | 18 | 0 | 35 | 20–39 |
| Entered after 1 choice, two keys spent | 15 | 2 | 9 | −4 | 22 | 20–39 |
| Entered after 1 choice, heavy spend | 15 | 2 | 6 | −6 | 17 | **0–19** |
| For comparison: R3 abandon in Act II | 35 | 10 | 13 | −4 | 54 | 40–59 |
| For comparison: R1 finish in Act III | 60 | 12 | 15 | −4 | 83 | 80–100 |

The hatch therefore has to be authored on a beat where the player can already
have spent most of the bag — that is the content requirement this section adds,
and it is checkable against the manifest and the route-space harness rather than
argued from intent. The `le-end-abandon` ceiling of 67 in [§7.1](#71-the-v1-counts)
is the same arithmetic: 35 + 12 + 20 − 0, which is 13 points below the top band
and is why abandoning can never read as the best run.

**No v1 number contradicts another.** The act weights (15 / 20 / 25) are the
share of the 60 arc points, and they are defined over the same three acts that
hold the seven scenes; the run length those scenes produce is what the playtime
multiplies; the word budget is sized by the same 26 cards; and the route target
is the harness's measure over the decision points. Where a later re-tune moves
one of these numbers (§7.6 row D4), it must move the row's neighbours in the
same commit.

### 7.8 How a reviewer verifies this section

1. **Run the structural contract.**
   `npx vitest run --project unit tests/story-line/content/gdd-v1-scope.test.ts`
   fails if a count leaves P4's or P5's bands, if the playtime or word-budget
   arithmetic stops reconciling, if a must-have row cites an unfiled gap or a
   deferred one, if a deferral loses its tracking reference, or if the resource
   key list drifts from [§2.8.1](#281-the-v1-declared-set-and-what-is-deliberately-not-in-it).
2. **Recompute the playtime arithmetic** from the three inputs in
   [§7.2](#72-playtime-the-assumption-and-the-arithmetic); if 12 × 35 s + 3:00
   is no longer about 10 minutes, the target moved and the section is stale.
3. **Check the counts against the manifest** once the build epic authors it: 7
   scenes, 21 scene beats, 5 endings, 16 exits, 18 real decisions. The numbers in
   [§7.1](#71-the-v1-counts) are the acceptance contract, not a description.
4. **Check every deferral's tracking reference** resolves to a live item, a
   §6.6 row, or the named manifest — a deferral with nowhere to live is a
   dropped feature.
5. **Confirm the cut line is complete**: every capability in the one-paragraph
   cut line appears in the [§7.5](#75-every-v1-capability-against-the-backlog)
   table, and every row of that table is a **filed** item.

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
    "irreversible": ["hull"],
    "start": { "hull": 5, "morale": 5, "stores": 4, "goodwill": 0, "charge": 2 },
    "bounds": {
      "hull": { "min": 0, "max": 5 },
      "morale": { "min": 0, "max": 8 },
      "stores": { "min": 0, "max": 6 },
      "goodwill": { "min": 0, "max": 5 },
      "charge": { "min": 0, "max": 4 }
    }
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
| Abandoning is over-rewarded | 79 for abandoning vs 83 for finishing | the loss ledger and the act-played arc rule of [§2.10.5](#2105-the-reset-ending-scoring-model) separate the bands: the measured abandon re-scores 79 → 54, any Act II exit caps at 67, and finishing keeps its 83 |
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
| `CG-0MWPY29730011FJ4` | Writer content pipeline (CSV authoring gate) — delivered: [§2.9](#29-writer-content-pipeline-csv-authoring-and-the-review-gate), T8; authored the frictions follow-up `CG-0MWQYDC7D003G4ON` |
| `CG-0MWPY2AZX001UI2A` | Tension, pacing, failure and reset-ending scoring — delivered: [§2.10](#210-tension-pacing-failure-and-reset-ending-scoring), T9–T12; reconciled the open arc-credit item `CG-0MWNSR376002QBY9` |
| `CG-0MWPY2CHF003AHE1` | Presentation contract: UI, audio, accessibility, determinism — delivered: [§3](#3-ux-visual-design-and-audio-direction), T13; named gaps B1, B4, B5, B7, B8, B9 for the backlog and build epic |
| `CG-0MWPY2ECE002P2NH` | Engine-gap backlog — delivered: [§6](#6-engine-gap-backlog); filed the engine-gap items listed in [§6.6](#66-disposition-record) |
| `CG-0MWPY2FV30041M48` | IP-safe naming pass and prohibited-term gate — delivered: [§4.2](#42-the-settings-names-final)–[§4.5](#45-the-prohibited-term-gate-and-how-a-writer-runs-it), T14; the GDD path is final (no rename needed) |
| `CG-0MWPY2HJU006LJMU` | V1 scope statement and deferred list — delivered: [§7](#7-v1-scope-statement-and-deferred-list); filed the human playtest deferral `CG-0MWR27FHI000HPT3` |
| `CG-0MWPY2JEU006DYUL` | Integration, review and verification close-out |
