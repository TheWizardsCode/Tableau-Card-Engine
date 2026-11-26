# The Long Erasure — playtest evaluation

**Work item:** `CG-0MWPY24IX00719NH` (playtest evaluation: three recorded runs + slideshow test)
**Evidence base:** [`docs/gym/long-erasure-observation-log.md`](../gym/long-erasure-observation-log.md) (`CG-0MWNHZEGJ0099JFM`)
**Feeds:** `CG-0MWNFVLYT003M7XF` (GDD: full story-line game, approach C — scene beat sheet)
**Content measured:** `example-games/gym/content/long-erasure.csv` (19 authored beats, post-`CG-0MWPVYTSU0065BXC` clock fix)
**Harness:** `scripts/long-erasure-playtest.ts` (reproducible; one command, below)

This note is the evidence the GDD cites. It records four complete spike runs played
end to end, answers the slideshow test explicitly, names the moments that produced
the most and least tension, and records pacing numerically. Every figure below is
printed by the committed harness; nothing here is an impression.

**What this measured — and what it did not.** These runs were driven headlessly
through the Phaser-free logic module (`GymLongErasureGame`) and the repo tooling. They
measure *structure and recorded state*: beats entered, options actually offered,
clock and resources at each act boundary, ending reached, prose volume. They do **not**
measure felt enjoyment, readability on a phone, or the audio/motion experience.
**Recommendation: run one human browser playtest (ideally three people, at least one
who has not read the content) before the GDD freezes its act structure.** No claim
below depends on that playtest; several claims would be strengthened by it.

---

## 1. The four recorded runs

**Run duration** is recorded in the game's own pacing units — **beats entered** and
**clock ticks spent** — because those are what the harness can reproduce deterministically.
Wall-clock playtime was not measured headlessly; that is one of the things the human
playtest above should supply.

### R1 — `reset-cheap` (the cheapest complete route)

| | Value |
|---|---|
| Outcome / ending | `reset` → **The Long Erasure** (`le-end-reset`) |
| Duration | **8 beats**, 7 choices, **13 of 17 clock spent** (4 left) |
| Score / band | **83** — *A chart worth keeping* (arc 60 + choices 12 + resources 15 − losses 4) |
| Prose | 106 words |
| Dead beats | none |

Path: `The First Unwriting → Log the erasure → Dead Reckoning → Stay silent →`
`The Quiet Chart → Shelter in the dead zone → The Dead Zone → Ration the stores →`
`The Archivist's Offer → Refuse him → Mutiny → Side with the captain →`
`The Core → Finish the weave → The Long Erasure`

| Boundary | Beat | First card of the act | Clock | hull | morale | stores | goodwill | charge |
|---|---|---|---|---|---|---|---|---|
| I → II | 4 | `le-ii-shelter` *The Dead Zone* | 11 | 5 | 4 | 3 | 0 | 2 |
| II → III | 7 | `le-iii-approach` *The Core* | 4 | 5 | 6 | 3 | 2 | 2 |
| III → Ending | 8 | `le-end-reset` *The Long Erasure* | 4 | 5 | 6 | 3 | 2 | 2 |

### R2 — `gated-sabotage-core` (the goodwill-gated branch, now survivable)

| | Value |
|---|---|
| Outcome / ending | `closed` → **Ashlight, Ends** (`le-end-ram`) |
| Duration | **10 beats**, 9 choices, **16 of 17 clock spent** (1 left) |
| Score / band | **67** — *A voyage that left a mark* (arc 60 + choices 12 + resources 11 − losses 16) |
| Prose | 126 words |
| Dead beats | none; `#when` rule fired |

Path: `The First Unwriting → Log the erasure → Dead Reckoning → Transmit the warning →`
`The Answering Silence → Shelter in the dead zone → The Dead Zone → Strip the derelict →`
`The Derelict → Share the berth → Salvage Rights → Bargain in bad faith →`
`Terms in Bad Faith → Sabotage the Loom → The Loom Bleeds → Break for the core →`
`Ahead of the Weave → Hit the core now → Ashlight, Ends`

| Boundary | Beat | First card of the act | Clock | hull | morale | stores | goodwill | charge |
|---|---|---|---|---|---|---|---|---|
| I → II | 4 | `le-ii-shelter` *The Dead Zone* | 11 | 5 | 5 | 3 | 2 | 1 |
| II → III | 9 | `le-iii-ahead` *Ahead of the Weave* | **1** | 4 | 5 | 4 | 0 | 1 |
| III → Ending | 10 | `le-end-ram` *Ashlight, Ends* | **1** | 2 | 5 | 4 | 0 | 1 |

This is the run the log's §4.4 resolution note promised was now possible: the earned
branch completes, and it completes with **one clock left**, not zero. Hull is the
visible cost — 5 at entry, 2 at the ending, the largest loss of any recorded run.

### R3 — `abandon` (the deliberate terminal hatch)

| | Value |
|---|---|
| Outcome / ending | `closed` → **The Voyage Abandoned** (`le-end-abandon`) |
| Duration | **6 beats**, 5 choices, **8 of 17 clock spent** (9 left) |
| Score / band | **79** — *A voyage that left a mark* (arc 60 + choices 10 + resources 13 − losses 4) |
| Prose | 80 words |
| Dead beats | none |

Path: `The First Unwriting → Log the erasure → Dead Reckoning → Stay silent →`
`The Quiet Chart → Shelter in the dead zone → The Dead Zone → Ration the stores →`
`The Archivist's Offer → Abandon the voyage → The Voyage Abandoned`

| Boundary | Beat | First card of the act | Clock | hull | morale | stores | goodwill | charge |
|---|---|---|---|---|---|---|---|---|
| I → II | 4 | `le-ii-shelter` *The Dead Zone* | 11 | 5 | 4 | 3 | 0 | 2 |
| II → Ending | 6 | `le-end-abandon` *The Voyage Abandoned* | 9 | 5 | 5 | 3 | 0 | 2 |

The run never enters Act III; the harness records **no invented III boundary**, which is
how a reader can tell the act was skipped rather than played.

### R4 — `ram-chip` (a destructive ending from the cheap route)

| | Value |
|---|---|
| Outcome / ending | `closed` → **Ashlight, Ends** (`le-end-ram`) |
| Duration | **8 beats**, 7 choices, **13 of 17 clock spent** (4 left) |
| Score / band | **75** — *A voyage that left a mark* (arc 60 + choices 12 + resources 13 − losses 10) |
| Prose | 107 words |
| Dead beats | none |

| Boundary | Beat | First card of the act | Clock | hull | morale | stores | goodwill | charge |
|---|---|---|---|---|---|---|---|---|
| I → II | 4 | `le-ii-shelter` *The Dead Zone* | 11 | 5 | 4 | 3 | 0 | 2 |
| II → III | 7 | `le-iii-approach` *The Core* | 4 | 5 | 6 | 3 | 2 | 2 |
| III → Ending | 8 | `le-end-ram` *Ashlight, Ends* | 4 | 2 | 6 | 3 | 2 | 2 |

R1 and R4 take the same first six choices and diverge only on the seventh (which
ending to stop on). The resource snapshot entering Act III is identical
(`hull 5, morale 6, stores 3, goodwill 2, charge 2`), and the ending is decided in one
beat. That is the slideshow problem in a single pair of tables.

---

## 2. The slideshow test, answered

**Did it read as a story or as a menu? On this content: as a menu.**

The answer rests on the **measured rejoin distance** of each written fork — how many
beats after a choice two options can meet again — not on "does the option lead
somewhere else". Measured over the declared graph (14 decision points, 12 of them
diverging):

| Rejoin distance | Decisions | Where |
|---|---|---|
| Options already share a successor one beat on | 1 | `le-ii-sabotage` |
| Rejoin **one beat later** (fork → one flavour card → shared hub) | **9** | `le-i-open`, `le-i-log`, `le-i-rally`, `le-i-transmit`, `le-i-silent`, `le-ii-shelter`, `le-ii-derelict`, `le-ii-bargain`, `le-iii-ahead` |
| Rejoin two beats later | 1 | `le-ii-offer` |
| **Never rejoin** | **1** | `le-iii-approach` (the ending choice) |

Ten of the twelve forks buy the player **at most one intervening one-sentence card**
before the run returns to the same hub. The clearest instance: *The Answering Silence*,
*The Quiet Chart* and *The Missing Berth* are three different Act I cards, and all
three funnel into *The Dead Zone*. The only choice whose alternatives never meet again
is which ending card you stop on.

The trap is that depth-1 visibility *looks* fine: across the 160 policy runs, 919
decisions were met and **902 (98.1%)** led to a different next beat than at least one
alternative. Only 17 (1.9%) were strictly converging — `le-ii-salvage` and
`le-ii-refuse`. **A visible next beat is not a consequence.** "Leads somewhere else"
measured at depth 1 is not a proxy for consequence; the GDD should adopt a minimum
rejoin distance instead, and this harness already computes it.

---

## 3. Tension: the moments that produced the most and least

Each moment is tied to the recorded run that produced it.

### Most tension

1. **R2 entering Act III on one clock tick** (`gated-sabotage-core`, beat 9,
   `le-iii-ahead`, clock 1). The earned branch spends everything: 16 of 17 ticks, one
   spare tick at the act boundary, one at the ending. The tension is real because it is
   arithmetic — you can count what you have left. It is also the *only* recorded run
   where the Act II → III boundary is that tight.
2. **`first` policy, seed 1 — the dead-beat-to-last-tick sequence.** The run pays 3
   clock for `le-ii-keep` *The Weave Advances*, a beat with **one button** ("Follow the
   thread"), then enters Act III at beat 8 with **clock 1** and finishes with
   `clockLeft = 1`, score **84**. All 40 `first` seeds are identical: 9 beats, 8 choices,
   clock 1. The joint-largest clock expenditure of the run (3 ticks, tied only with an
   Act III beat) buys a turn that asks nothing — the most dramatic beat is also the
   emptiest.
3. **The 12 expiring routes** — every one dies entering `le-iii-approach` with clock 2
   against a cost of 3. The concrete record is `seeded` **seed 18**: 8 beats, no ending
   card, score **39** (*A voyage remembered only as a gap*), and **the last act boundary
   recorded is I → II at clock 11** — the harness records no later boundary precisely
   because the beat that would have opened Act III was never played. Expiry is
   concentrated on the `Keep the bargain` path, which reaches Act III two ticks short.

### Least tension

1. **R3 `abandon`** — 6 beats, 5 choices, 80 words, **9 of 17 clock left**, score **79**.
   The exit is available on the same beat as the biggest decision (*The Archivist's
   Offer*), it is the shortest run recorded, and it lands one band below a full arc run
   (79 vs 83/84). Nothing about it is costly; the voyage simply stops.
2. **The `last` policy sample (40 of 40 runs)** confirms R3 is not an outlier:
   every run takes the always-visible abandon hatch, ends with **9 clock left**, reads
   **76 words**, and scores **81**. Abandoning is the path of least resistance in the
   content, and the epilogue only partly punishes it.

### Was irreversibility missed?

**Yes.** Within a run, loss is real but almost invisible:

- **Hull is the only visibly degrading resource** (R2: 5 → 2; R4: 5 → 2), and it changes
  nothing a player can see — no option is written against hull in a way that reads as a
  consequence.
- The affordability gate hides **32 of 302 authored option instances (10.6%)** across the
  playable state space. That is how loss expresses itself: the depleted player is shown
  *fewer* options, silently. At `le-iii-approach`, 12 of 40 visits hide two of the three
  endings.
- **Nothing survives a run.** The reset ending returns to the entry card, and a fresh run
  starts from `hull 5, morale 5, stores 4, goodwill 0, charge 2` regardless of what the
  last one cost. Loss is therefore refunded by the loop, which is exactly the mechanism
  the log says approach B's tableau layer would supply.

This is the strongest argument for the GDD's "C with A inside it **plus B's irreversible
loss**" direction: the measurement shows the chain can *compute* loss but cannot *show*
it.

---

## 4. Pacing, measured numerically

**Dead turns** are beats entered with at most one affordable option — a beat that
advances the story without asking the player anything. Terminal beats (the ending card)
are excluded: reaching the ending is the conclusion, not a turn. Dead turns are split by
cause, because the two causes mean different things:

- **authored** — the writer's beat has one option by design (a transit beat);
- **gate-collapsed** — the writer wrote a real choice and the affordability gate hid it
  on this visit.

### Per act (authored content vs. what runs actually played)

| | Act I | Act II | Act III | Ending |
|---|---|---|---|---|
| Authored beats | 5 | 8 | 2 | 4 |
| Authored decision points | 5 | 7 | 2 | 0 |
| **Mean beats entered per run** | **3.00** | **3.35** | **0.63** | **0.98** |
| **Mean decisions offered per run** | **3.00** | **2.12** | **0.63** | 0 |
| **Decision density (decisions ÷ beats)** | **1.00** | **0.69** | **0.63** | 0 |

Act I is uniformly a decision. Act II's offered-decision rate drops to 0.69 because
the affordability gate collapses `le-ii-bargain` and `le-ii-salvage` on some visits and
`le-ii-keep` is authored as a single-button transit (7 of the 8 Act II beats are authored
as decisions). Act III is entered on **0.63 beats per run**: most runs see a single beat
and an ending. That is the "Act III is an ending selector, not an act" finding, now
quantified.

### Per run

| Run | Beats | Decisions | Density | Dead turns | Prose (words) |
|---|---|---|---|---|---|
| R1 `reset-cheap` | 8 | 7 | 0.88 | 0 | 106 |
| R2 `gated-sabotage-core` | 10 | 9 | 0.90 | 0 | 126 |
| R3 `abandon` | 6 | 5 | 0.83 | 0 | 80 |
| R4 `ram-chip` | 8 | 7 | 0.88 | 0 | 107 |
| **160 policy runs (min / mean / max)** | 6 / 7.95 / 10 | 5 / 6.98 / 9 | 0.73 mean | **1.23 mean** | 73 / 100.81 / 125 |

### Dead turns across the 160 policy runs

| Measure | Value |
|---|---|
| Runs with at least one dead turn | **103 of 160 (64%)** |
| Dead turns per run (mean) | **1.23** |
| Authored dead turns (all runs) | **90** |
| Gate-collapsed dead turns (all runs) | **107** |
| Beats that produced them | `le-ii-keep` (authored), `le-ii-bargain` and `le-ii-salvage` (gate-collapsed) |

**Gate collapse is the larger cause: 107 of 197 dead turns.** The written choice exists;
the resource bag removes it. `first` and `greedy-goodwill` each hit two dead turns per
run (`le-ii-bargain`, then `le-ii-keep`), which is why their decision density is 0.67
against `seeded`'s 0.77.

### Route space and the clock (post-fix content)

| Measure | Value |
|---|---|
| Playable routes (exhaustive, affordability-aware) | **138** |
| Outcomes | 40 `reset`, 86 `closed`, **12 `expired`** |
| Endings reached | 40 reset, 28 quiet, 42 ram, 16 abandon, 12 none |
| Beats per route / choices per route | 6–10 (mean 8.48) / 5–9 (mean 7.57) |
| Score per route | 31–88 (mean 74.38) |
| Clock left, 160 policy runs | 1–9 (mean 3.87) |
| `first` policy (40 runs) | 9 beats, 8 choices, **clock 1 every time** |
| Gated branch | 10 routes enter, **8 complete**, clock 1 on entry |
| Abandon routes | 16 of 138 |

The clock no longer prunes a majority (12 of 138 routes expire, 8.7%), and it no longer
lands on exactly zero — the exact-zero finish the log celebrated is gone, as its §4.4
resolution note records. What remains is the shape the log identified: the clock is a
**silent branch filter**, not a dial the player spends deliberately.

---

## 5. The observation log, summarised

The [observation log](../gym/long-erasure-observation-log.md) is the primary evidence
base and remains the place where the *reasoning* lives. In brief:

- The chain is a competent story **carrier** but, on this content, a slideshow **shape**:
  9 of 12 forks rejoin one beat later; the only never-rejoining choice is the ending.
- Acts are uneven (5 / 8 / 2 beats) and Act III behaves as an ending selector.
- The clock can only prune; it cannot create a recoverable trade.
- The state-gated branch was reachable and **unwinnable**; `CG-0MWPVYTSU0065BXC` fixed the
  content clock, and the re-measurement above (10 routes enter, 8 complete, clock 1 on
  entry) is the current number.
- Abandoning is over-rewarded: 79–81 (top two bands) against 83–84 for finishing the arc.
- Authoring a new branch took **≈ 8 s** of tool time with no engineering help, with five
  specific frictions (forward references refused, whole-`options`-cell replacement, the
  repeated resource declaration, no positional insert, untyped `--field` writes).
- Recommendation: **approach C, hybrid — A inside it, with B's irreversible-loss dial**.
  Measured minima: consequential choices should be authored to a **minimum rejoin
  distance of 3**; any gated branch must be test-verified reachable *and* survivable;
  budgets should be per scene and recoverable.

**Where this note and the log differ, this note is the current number** (it re-measures
post-fix content). The log's narrative and reasoning are unaffected; its §4.4 resolution
note already explains the one substantive change — the `first` policy now finishes on
clock 1 rather than exactly 0.

---

## 6. Reproduction

Complete command used for every figure above (four named routes, 160 policy runs,
full JSON):

```bash
npx tsx scripts/long-erasure-playtest.ts --seeds 40 --json /tmp/le.json \
  --route "reset-cheap=Log the erasure>Stay silent>Shelter in the dead zone>Ration the stores>Refuse him>Side with the captain>Finish the weave" \
  --route "gated-sabotage-core=Log the erasure>Transmit the warning>Shelter in the dead zone>Strip the derelict>Share the berth>Bargain in bad faith>Sabotage the Loom>Break for the core>Hit the core now" \
  --route "abandon=Log the erasure>Stay silent>Shelter in the dead zone>Ration the stores>Abandon the voyage" \
  --route "ram-chip=Log the erasure>Stay silent>Shelter in the dead zone>Ration the stores>Refuse him>Side with the captain>Ram the core"
```

The four named-route records — path, act-boundary resources, ending, beats, clock,
dead turns, density, prose and journal — are in `/tmp/le.json` under `routes`, and the
per-run records under `runs`. The reporting extension itself is pinned by
`tests/scripts/long-erasure-playtest.test.ts` (`npx vitest run --project unit
tests/scripts/long-erasure-playtest.test.ts`). Add `--timings` for wall-clock
replay timings (the only non-deterministic output).

The log's own authoring and validation commands (the `storylines:author|validate|graph`
loop) are unchanged and are reproduced in its appendix.

---

## 7. What the GDD should take from this

1. **Author to a minimum rejoin distance of 3** for choices marked consequential; label
   anything below that as flavour and author it cheaply. The depth-1 visibility metric is
   misleading (98.1% "visible", 10 of 12 forks rejoin within one beat).
2. **Surface affordability instead of hiding it.** 107 of 197 dead turns in the sample
   were written choices the gate removed — the game goes quiet exactly when it should
   speak.
3. **Give Act III a budget, not a single beat.** Runs enter it on 0.63 beats; no pacing
   shape survives that.
4. **Make at least one loss irreversible and visible.** The only loss the player can
   currently perceive is a hidden option, and the reset loop refunds everything else.
5. **Fix the epilogue bands** so abandoning (79) cannot sit within 4 points of finishing
   (83) — otherwise the closing screen cannot tell the two stories apart.
6. **Run the human playtest before freezing acts.** Everything above is structural;
   none of it measures whether the story lands.
