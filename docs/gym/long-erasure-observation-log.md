# The Long Erasure — observation log

**Work item:** `CG-0MWNHZEGJ0099JFM` (observation log + GDD handoff) — child 8 of the
Gym story-line spike `CG-0MWNFV6VU003O3PC`.
**Feeds:** `CG-0MWNFVLYT003M7XF` (GDD: full story-line game, approach C — scene beat
sheet).
**Scene:** `GymLongErasureScene` → `example-games/gym/scenes/GymLongErasureScene.ts`
**Logic under test:** `example-games/gym/GymLongErasureGame.ts` (Phaser-free)
**Content:** `example-games/gym/content/long-erasure.csv` (19 authored beats)

This log answers the five questions the follow-up GDD needs before it commits to a
shape: does each choice visibly change what follows (the **slideshow test**); where
did the pressure clock and the resources actually bite (**tension and pacing**); how
did authoring a branch in CSV feel with no engineering help (**authoring
ergonomics**); does the chain-first model carry three acts and a clock without a
scene/objective layer (the spike's central assumption); and is **approach A still the
right full-game shape, or should the game be C** (an explicit recommendation).

Negative findings are recorded as findings, not failures. The spike was explicitly
allowed to conclude that a chain-first structure cannot carry a full game.

---

## 1. How this was measured

Everything below is reproducible from the committed harness; no number in this log is
an impression.

| Instrument | What it produces |
|---|---|
| `scripts/long-erasure-playtest.ts` (`npx tsx scripts/long-erasure-playtest.ts --seeds 40 --json …`) | Policy playthroughs, exhaustive playable-route enumeration, content-shape and reconvergence analysis, named-route playback with the real epilogue |
| `npm run storylines:validate` / `storylines:graph` / `storylines:author` | Authoring ergonomics timings and diagnostics |
| `GymLongErasureScene` browser test (`tests/gym/GymLongErasureScene.browser.test.ts`) | The rendered surface: option labels with cost/benefit hints, act/clock/resource/beat panels, live journal, epilogue screen, SFX |

**Coverage of this measurement pass**

- **160 playthroughs**: seeds `1..40` × four policies (`first` = always the top option,
  `last` = always the bottom option, `seeded` = uniform random over the affordable
  options, `greedy-goodwill` = always maximise goodwill).
- **132 distinct terminal states** from an exhaustive, affordability-aware
  depth-first enumeration of every route a player can take from the entry beat
  (identical `(beat, resources, clock)` states are visited once, so this counts
  distinct run outcomes, not label permutations).
- **4 named routes** played step by step: the cheap reset, the goodwill-gated branch,
  the abandon terminal, and a chip-the-core ending.
- Determinism: the module draws successors from a seeded LCG, so a seed plus a choice
  list always reproduces the same run — every figure here is replayable.

**Limitation (recorded honestly).** This pass was agent-driven through the
Phaser-free module and the repo tooling. No human played the scene in a browser during
this pass, so the log measures *structure and recorded state* (beats, choices, clock,
resources, journal, score, rendered option lists, prose volume), not felt enjoyment,
readability on a phone screen, or the audio/motion experience. A human playtest of the
scene — ideally three people, at least one who has not read the content — is the
natural next evidence step and should happen before the GDD fixes its act structure.
Reduced-motion behaviour and SFX wiring are covered by the scene's browser test, not
by this log.

---

## 2. Findings at a glance

| Question | Finding | Key evidence |
|---|---|---|
| Does each choice visibly change what follows? | **At one beat, yes — beyond that, mostly no.** The story is a hub-and-spoke, not a tree. | 12 of 14 decision points fork immediately, but **9 of the 12 rejoin one beat later**, one rejoins on the next beat, one two beats later, and only the Act III ending choice never rejoins |
| Does the chain-first model carry three acts plus a clock? | **Partly.** Acts I and II carry the run; Act III does not. | 5 Act I beats, 8 Act II beats, **2 Act III beats**; Act I holds 5 decisions, Act II 7, Act III 2 (one of them the ending menu) |
| Does the pressure clock bite? | **Not as pressure — as a silent branch filter.** | Clock 17; cheapest complete route spends 13; **`first` policy reaches the ending with 0 clock remaining in 40/40 runs**; only 5 of 160 policy runs expired, and 10 of the 14 expiring routes are on one branch |
| Is the resource-gated branch a reward? | **No — it is reachable and unwinnable.** | 4 labelled routes enter `le-ii-sabotage`; **0 of them reach an ending**; every entry arrives with exactly 2 clock and every successor from that beat costs 3 |
| Does the epilogue differentiate the journey? | **Only partly, and the abandon terminal is over-rewarded.** | Abandoning in Act II scores 79–81 (*top band*) vs 83 for finishing the arc; the arc award (60 points) is granted on entering any ending card |
| Can a writer add a branch with no engineering help? | **Yes — under ~10 s of tool time, with five specific frictions.** | New branch authored, validated, graphed and played end to end (§5) |
| Is approach A still the right full-game shape? | **No on its own — recommend C with A inside it (hybrid).** | §6 |

One-line verdict: **the chain is a competent story *carrier*, but on this content it is
a slideshow *shape* — every act is a small ring of single-line flavour beats that
rejoin a shared hub, and the only irreversible consequence in the run is which ending
card you stop on.**

---

## 3. The slideshow test

### 3.1 Structure

| Metric | Value |
|---|---|
| Authored beats | 19 (`le-i-open` … `le-end-ram`) |
| Beats per act | Act I **5**, Act II **8**, Act III **2**, endings **4** |
| Decision points (≥ 2 authored options) | **14** — Act I 5, Act II 7, Act III 2 |
| Decisions whose options reach a *different* next beat | **12** |
| Decisions whose options reach the *same* next beat | **2** — `le-ii-salvage` (*Take the ally's berth* / *Share the berth*), `le-ii-refuse` (*Side with the captain* / *Side with the crew*) |
| Run length actually seen | **6–9 beats** (mean 8.36 over the route space, 7.94 over policy runs); **5–8 choices** |
| Prose read in one run | **73–119 words** (mean 101) across the beats' `effect` lines |
| Distinct endings reachable | 4 (`reset`, `quiet`, `ram`, `abandon`) |

Superficially that clears the spike's bar (three branch points, two alternatives per
act, one state-gated branch, one deliberate terminal). The problem is not the count of
forks — it is their **shape**.

### 3.2 Reconvergence: forks that rejoin

Measured over the declared graph, for each diverging decision, the number of beats
after the fork at which two branches can meet again:

| Rejoin distance | Decisions | Beats |
|---|---|---|
| Branches share a successor on the *next* beat | 1 | `le-ii-sabotage` |
| Rejoin **one beat later** (fork → one flavour card → shared hub) | **9** | `le-i-open`, `le-i-log`, `le-i-rally`, `le-i-transmit`, `le-i-silent`, `le-ii-shelter`, `le-ii-derelict`, `le-ii-bargain`, `le-iii-ahead` |
| Rejoin two beats later | 1 | `le-ii-offer` |
| **Never rejoin** | **1** | `le-iii-approach` (the ending choice) |

So nine of the twelve forks buy the player exactly **one intervening one-sentence
card** before the run returns to the same hub. The clearest example: *The Answering
Silence*, *The Quiet Chart* and *The Missing Berth* are three different Act I cards,
and all three funnel into *The Dead Zone*. The choice changes a line of text, not a
situation.

### 3.3 Visibility measured in play

| Metric (160 policy runs) | Value |
|---|---|
| Decisions met | 918 |
| Decisions where the chosen option reached a different next beat than at least one alternative | **901 (98.1 %)** |
| Decisions where every alternative reached the same next beat | 17 (1.9 %) — only the two converging cards above |

That is the trap this spike exists to expose: **the engine can prove that a choice is
visible one beat ahead while the player still experiences a slideshow**, because the
visible next beat is a single line that rejoins the same hub. "Visible consequence"
measured at depth 1 is not a proxy for consequence. The GDD should adopt a stronger
authored metric — *minimum rejoin distance* — instead of "does the option lead
somewhere else".

### 3.4 What does work in the chain

- The ending choice is genuinely a decision with four distinct terminal outcomes, and
  the reset ending (`begin the survey again` → entry card) is a clean, deliberately
  looped expression of the narrative conceit.
- The state-gated option does appear only when earned (§4.3) — the mechanic works even
  though the balance around it does not.
- The journal is the right accumulator for a reset ending: it is the only thing that
  survives the reset, and the epilogue re-derives the score from the same record, so
  the closing line describes the run the player actually made.

---

## 4. Tension and pacing

### 4.1 The clock

| Metric | Value |
|---|---|
| Pressure clock (`clockMax`) | 17 |
| Beats per run | 6–9 |
| Clock per beat | 0–3 (entry beat 1; Act II hubs 2; Act III 3) |
| Cheapest complete route | spends **13** (4 left) |
| Most expensive authored route | 21 |
| Clock left at the end, policy runs | min 0, max 9, mean 3.31 |
| Expired runs, policy sample | **5 of 160** (all from the `seeded` policy) |
| Expired routes, playable space | **14 of 132 (10.6 %)** |

Two readings, both true:

- **It can land.** The cheapest route (`first` policy) finishes Act III with *exactly*
  zero clock in 40 of 40 runs. Spending the last tick on "Finish the weave" is the best
  dramatic moment the spike produced, and it came out of arithmetic, not authored
  drama.
- **It does not bite most players.** Half of the 160 runs never felt the clock at all
  (`first` and `greedy-goodwill` finished with 0 left because they took the shortest
  route; `last` abandoned with 9 left). Expiry is rare because the route space is
  short: an eight-beat run at 2 clock per beat lands on 16 of 17, so the budget is
  effectively "just enough" rather than "not enough". The clock therefore does not
  create a *trade* the player weighs each beat; it silently deletes one branch (§4.2).

### 4.2 Where the clock actually cuts

All 14 expiring routes expire on entry to an Act III beat (`le-iii-approach` × 12,
`le-iii-ahead` × 2), because Act III beats cost 3 against a remaining clock of 2 or
less. Ten of the 14 are on the **bargain** branch — *Bargain in bad faith* (`le-ii-bargain`)
costs 3 clock, which is the single most expensive non-Act-III beat in the content, so
taking the bargain and running the clock down are the same act. The bargain branch is
therefore "the branch you cannot afford to survive": the flavour of danger without a
recoverable cost.

That is the opposite of a tension dial. Tension needs a *visible* budget the player
spends deliberately ("if I shelter here I lose the core"), and a *recoverable* setback.
What exists is an invisible hit-test applied when you cross into Act III.

### 4.3 Resource pressure (and where it hides options)

| Metric | Value |
|---|---|
| Starting bag | `hull 5, morale 5, stores 4, goodwill 0, charge 2` |
| Authoring-time option instances over the played state space | 292 |
| **Instances hidden by the affordability gate** | **32 (11.0 %)** |
| Worst offenders | `le-ii-bargain` 14 of 16 (the gated option), `le-iii-approach` 12 of 38 (two of the three endings), `le-ii-salvage` 6 of 8 (*Take the ally's berth*) |

The gate is real — 11 % of authored options never appear — but it is **invisible and
regressive**: the player who spent the most (low `charge`/`hull`) is shown the *fewest*
endings, so the game whispers exactly when it should shout. At `le-iii-approach` a
depleted player sees only *Finish the weave*; the choice between three endings has
quietly become a single button. If the GDD keeps affordability gates, it should surface
them ("you cannot afford this: 2 charge needed") rather than hide the option.

### 4.4 The state-gated branch — reachable and unwinnable

This is the sharpest balance finding of the spike. `Sabotage the Loom` (`cost=goodwill:3`
on `le-ii-bargain`) is the authored "earned" path, and the scene help text promises it.

| Metric | Value |
|---|---|
| Route labels that enter `le-ii-sabotage` | **4** (2 distinct states) |
| Of those, routes that reach an ending | **0** |
| Clock on entry to the gated beat | **exactly 2 on every route** |
| Cost of every successor from the gated beat | **3** |
| Policy runs that ever even *saw* the option | 1 of 160 |

Measured route (seed 1): `Log the erasure → Transmit the warning → Shelter in the dead
zone → Strip the derelict → Share the berth → Bargain in bad faith → Sabotage the Loom
→ Break for the core` — outcome `expired`, score **28** ("A voyage remembered only as a
gap"). The player who earned the secret branch is the only player who cannot finish the
story, and the epilogue's lowest band is reserved for them.

Mechanically the gate works (the option is absent at goodwill 2 and present at 3, and
the `#when=charge>=2` conditional successor fires), so this is a **content-balance
defect**, not an engine defect: the goodwill route is the slowest route, and the clock
was tuned without it. Two follow-up items are filed for this (§7).

**Resolution note (2026-11-21, `CG-0MWPVYXG6003ZIOV`).** The finding above is
historical — it records the shipped content at the time of the spike. The branch is
now completable: `CG-0MWPVYTSU0065BXC` lowered two `clockCost` values in
`example-games/gym/content/long-erasure.csv`, `le-ii-bargain` 3 → 2 and
`le-ii-sabotage` 2 → 1, with no option, gate, `#when`, prose or `DEFAULT_CLOCK_MAX`
change and no `src/story-line/**` change. Both edits were needed: the bargain nudge
buys the branch its entry clock, and the sabotage nudge buys the documented route one
spare tick. Re-measured with the same harness on the fixed content
(`npx tsx scripts/long-erasure-playtest.ts --seeds 5`):

| Metric | Before (§4.4) | After |
|---|---|---|
| Playable routes | 132 | **138** |
| Expired routes | 14 | **12** |
| `gated beat:` routes / completed | 4 / 0 | **10 / 8** |

The documented gated route (now named `gated-sabotage-core`: … → Sabotage the Loom →
Break for the core → Hit the core now) ends `closed` on `le-end-ram` with score **67**
and **`clockLeft=1`**; before the nudge the same walk expired entering `le-iii-ahead`
with 2 clock left. All four endings remain reachable (`le-end-reset`, `le-end-quiet`,
`le-end-ram`, `le-end-abandon`).

**Accepted trade-off.** §4.1 records the `first` policy finishing on exactly **zero**
clock in 40 of 40 runs — the "last tick" moment. Lowering the bargain branch's clock
also shortens the cheap `first` route to 16 of the 17 default clock, so that run now
finishes with **clock 1**: the exact-zero finish is no longer reachable at the default
clock (the soft-boundary scenario test exercises it only at an explicit
`clockMax: 16`). The scene help panel's "Pressure clock and state gates" slide and its
Test Plan step 2 now describe the gated branch as earned *and* completable.

### 4.5 Pacing shape

- **Act I (5 beats)**: the strongest act. Loss is concrete (a named berth), and
  *Transmit the warning* costs `charge` while granting goodwill — the one place where
  cost and consequence visibly trade against each other.
- **Act II (8 beats)**: the most authored, and the most redundant. The shelter /
  derelict / salvage trio is three doors into one room, and it holds the only two
  strictly converging choices in the content.
- **Act III (2 beats)**: arrives and resolves in the same breath (one arrival beat
  plus the ending menu; `le-iii-ahead` only exists on the doomed gated path). It reads
  as an **ending selector**, not a climax. The story's peak is *The Archivist's Offer*
  — an Act II beat.
- **The abandon hatch** is always visible at the Offer and 56 of 160 policy runs took
  it: five choices and ~80 words of prose. It is well written and it is the fastest way
  to make the "deliberate terminal option" AC disappear from your own playthrough.

---

## 5. Authoring ergonomics (timed)

Exercise: add **one new branch** to the shipped content with no TypeScript, no
engineering help: a fourth option on `le-ii-offer` (*A final transmission*, `cost=charge:2`,
`extra=goodwill:1`) leading to a new Act II card `le-ii-broadcast` (*The Last
Transmission*, clock 2) which rejoins `le-iii-approach`.

Performed on a scratch copy of the CSV (`/tmp/le-authoring/long-erasure.csv`) so the
tracked content was never touched; measured wall-clock, one cold-cache `npx tsx`
invocation each:

| Step | Command | Wall clock | Result |
|---|---|---|---|
| 1. Add the successor card | `storyline-author.ts add-card --id le-ii-broadcast … --field act=II --field clockCost=2` | **1.6 s** | applied |
| 2. Add the option that points at it | `storyline-author.ts update-card --id le-ii-offer --options "…;A final transmission\|le-ii-broadcast#cost=charge:2#extra=goodwill:1"` | **1.7 s** | applied |
| 3. Validate | `validate-storylines.ts --csv … --game gym` | **1.5 s** | `RESULT: VALID` (one informational cycle = the intended reset) |
| 4. Regenerate the graph | `storyline-graph.ts --csv … --game gym --format json --out …` | **1.5 s** | written |
| 5. Play it | `long-erasure-playtest.ts --content … --seeds 40` | **1.7 s** | 132 → **152** terminal states; the new option is offered and taken |

**Total tool time ≈ 8 s.** The engine-side authoring promise (AC 4) holds: cost, extra
effect and conditional successor were expressed entirely in the `options` cell, with no
registration, and the branch was live in the game on the next run.

**Frictions** (all real, all fixable, none blocking):

1. **Forward references are refused.** The first attempt — adding the option before the
   card — was rejected: `Choice card "le-ii-offer" option "A final transmission" links
   to unknown card "le-ii-broadcast"`. Good guard, but it means a writer must author
   **backwards from the ending**, which is the opposite of how a scene is drafted.
2. **`update-card` replaces the whole `options` cell.** Adding one option means
   retyping all existing ones (copy-paste). A dropped separator silently removes a
   branch until validation/graph-diff catches it.
3. **Every new row repeats the full declared resource set** (`--resources
   hull,morale,stores,goodwill,charge`) — noise that has to be copied correctly, and a
   mismatch is only caught downstream.
4. **No positional insert.** The new card is appended at the end of the file, so the
   CSV's reading order drifts away from narrative order (the artefacts stay correct, so
   this is an authoring-comfort issue only).
5. **Act and clock are generic `--field` writes** (`--field act=II --field
   clockCost=2`) — discoverable from `--help`, but not part of the typed card contract,
   so a typo in the field name is a no-op rather than an error.

**What was excellent:** the diagnostics. Introducing a typo'd resource key produced

```
✗ [unknown-resource-key] row 10, column "options" (unknown-resource-key):
  cost.chrono is not a declared resource (declared: hull, morale, stores, goodwill, charge).
```

Row, column, reason and the declared set — a writer can fix that without asking
anyone. This is the part of the CSV story the GDD should keep verbatim.

---

## 6. Is approach A still the right full-game shape?

**Recommendation: C is still the right shape — specifically a hybrid, "C with A inside
it": a scene beat sheet with hard per-scene budgets owns the loop; the card chain
becomes the body of a scene, not the whole game.**

### Why A alone does not scale (measured, not guessed)

1. **The failure mode predicted for A is the one that happened.** The parent item
   named A's failure mode as "slideshow". Nine of twelve forks rejoin one beat later,
   the whole run is ~100 words, and the only never-rejoining decision is which ending
   you stop on. Scaling that graph means scaling a hub-and-spoke fan, not a narrative.
2. **Acts are uneven, and Act III is not an act.** 5 / 8 / 2 beats. Without a
   scene-level objective there is nothing to make the final act *take time*.
3. **The clock can only prune.** Because every beat costs clock and nothing gives it
   back, the only expressible tension is "you cannot get there from here". There is no
   room to convert time into risk (a scene that costs more if you fail it) without a
   scene layer to hold the failure.
4. **Effort per outcome is poor at the frontier.** The single most expensive authored
   branch (bargain → sabotage, three gated steps, `#when` rule, conditional successor)
   produced no reachable payoff. Authoring effort in a pure chain buys flavour, not
   consequence.

### Why C alone would be a mistake

C needs the beat-sheet/objective layer (2–4 weeks by the parent's estimate), and the
parent already names C's risk: "two systems drifting". The card chain here is
*already* the thing that carries prose, choices, resources, journal and score, it is
Phaser-free and unit-tested, and a writer can extend it in ~8 s of tool time. Throwing
it away to build a scene layer from scratch buys nothing.

### What the hybrid should specify in the GDD

- **Loop:** act → scene → beat. The beat sheet owns: the scene's objective, its budget
  (clock), and its outcome (success/partial/failure), each with a hard authored cost.
  The card chain is the scene's body, entered with the scene's remaining budget.
- **Consequential choice metric:** author to a **minimum rejoin distance of 3** for any
  choice marked as consequential (fork → distinct beats → different scene outcome).
  Choices below that threshold are explicitly *flavour* and should be authored cheaply
  and labelled as such in the editor.
- **Clock as a dial, not a filter:** budgets per scene, spent visibly, with at least one
  recovery path. Never let the clock's only expressible outcome be "the last act is
  deleted".
- **Gates must pay out:** any state-gated branch must be verified reachable *and*
  survivable by a test (the route-space enumeration in this harness already does this
  mechanically — reuse it as a CI guard on authored content).
- **Endings must be distinguishable:** the epilogue must not award full arc credit for
  abandoning the voyage (§7), and the band table needs scoring headroom so the top band
  is earned.
- **Keep from A:** CSV authoring with row/column/reason diagnostics, game-declared
  resources, the seeded RNG, the journal-derived score, and the Phaser-free logic module
  with its headless route-space test.

**Explicit answer to AC 13:** the slideshow test, the tension/pacing read, the
authoring ergonomics and this recommendation are all recorded here, and this log is
linked from `CG-0MWNFVLYT003M7XF`. The recommendation is **C (hybrid, A inside it)** —
not "scale A".

---

## 7. What I would do next (and what was parked as scope creep)

Filed as follow-ups from this log (not absorbed into the spike):

- `discovered-from` this item — **make the goodwill-gated branch survivable** (or stop
  promising an earned path in the scene help text). Content balance: 4 routes enter
  it, 0 finish. **Resolved** by `CG-0MWPVYTSU0065BXC` (content) and
  `CG-0MWPVYXG6003ZIOV` (docs) — see the §4.4 resolution note.
- `discovered-from` this item — **epilogue: stop awarding full arc credit for
  abandoning the voyage**. Abandoning in Act II scores 79–81 in the top band against 83
  for finishing, so the closing screen cannot tell the two apart.

Proposed for the GDD's own backlog (recorded on `CG-0MWNFVLYT003M7XF`, intentionally not
built here):

- Scene beat sheet with per-scene budgets and outcomes (approach C loop).
- A **tableau/board layer** for irreversible loss — the thing this spike deliberately
  left out: physical tableau loss (approach B's tension dial) is the mechanism a pure
  chain cannot express, and the clock experiment above shows why the chain needs one.
- Surface affordability ("2 charge needed") instead of hiding gated options.
- Reuse the route-space enumeration from `scripts/long-erasure-playtest.ts` as an
  authored-content CI guard: assert that every gated branch has at least one surviving
  route, that every ending is reachable, and that consequential choices meet the rejoin
  distance threshold.

---

## 8. IP statement

This log accompanies an original setting and records no third-party franchise
character, race, faction, ship class, technology name or episode title. The prose here
was checked against the parent item's prohibited-term list by hand; the only match a
mechanical scan of this file produces is the engine framework's own name
("Phaser"), which is why the automated guard
(`tests/gym/LongErasureContent.test.ts`) scans the authored content and its generated
artefacts rather than prose documentation. The framework name is not a reference to any
fictional technology in the content.

---

## Appendix: reproducing this log

```bash
# Shape, route space, 160 policy runs, and four named routes
npx tsx scripts/long-erasure-playtest.ts --seeds 40 --json /tmp/le.json \
  --route "reset-cheap=Log the erasure>Stay silent>Shelter in the dead zone>Ration the stores>Refuse him>Side with the captain>Finish the weave" \
  --route "gated-sabotage=Log the erasure>Transmit the warning>Shelter in the dead zone>Strip the derelict>Share the berth>Bargain in bad faith>Sabotage the Loom>Break for the core" \
  --route "abandon=Log the erasure>Stay silent>Shelter in the dead zone>Ration the stores>Abandon the voyage" \
  --route "ram-chip=Log the erasure>Stay silent>Shelter in the dead zone>Ration the stores>Refuse him>Side with the captain>Ram the core"

# Authoring loop (§5)
npx tsx scripts/storyline-author.ts add-card --csv <copy>.csv --game gym --id le-ii-broadcast …
npx tsx scripts/storyline-author.ts update-card --csv <copy>.csv --game gym --id le-ii-offer --options "…"
npx tsx scripts/validate-storylines.ts --csv <copy>.csv --game gym
npx tsx scripts/storyline-graph.ts --csv <copy>.csv --game gym --format json --out <manifest>.json
npx tsx scripts/long-erasure-playtest.ts --content <copy>.csv --seeds 40
```

Journals used as evidence (most recent choice first, straight from `buildEpilogue`):

- **reset-cheap** (score 83 = arc 60 + choices 12 + resources 15 − losses 4; 4 clock
  left): *The Core* → Finish the weave · *Mutiny* → Side with the captain · *The
  Archivist's Offer* → Refuse him · *The Dead Zone* → Ration the stores · *The Quiet
  Chart* → Shelter in the dead zone · *Dead Reckoning* → Stay silent · *The First
  Unwriting* → Log the erasure
- **gated-sabotage** (score 28 = arc 15 + choices 12 + resources 13 − losses 12;
  expired): *The Loom Bleeds* → Break for the core · *Terms in Bad Faith* → Sabotage the
  Loom · *The Archivist's Offer* → Bargain in bad faith · *Salvage Rights* → Share the
  berth · *The Dead Zone* → Strip the derelict · *The Answering Silence* → Shelter in
  the dead zone · *Dead Reckoning* → Transmit the warning · *The First Unwriting* → Log
  the erasure
- **abandon** (score 79 = arc 60 + choices 10 + resources 13 − losses 4; 9 clock left):
  *The Archivist's Offer* → Abandon the voyage · *The Dead Zone* → Ration the stores ·
  *The Quiet Chart* → Shelter in the dead zone · *Dead Reckoning* → Stay silent · *The
  First Unwriting* → Log the erasure
