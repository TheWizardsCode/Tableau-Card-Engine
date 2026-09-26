# Test Suite Review — value audit (2026-09-20)

**Work item:** CG-0MTCOPO8U001UW2Y — *Review all tests*
**Audit child:** CG-0MU9PKH5300114KR — *Run full audit and produce test-suite-review report*
**Supersedes / extends:** CG-0MS9AGG3N003ASCR (2026-07-31 cleanup — 32 files, ~3,806 lines removed)

> **Status:** analysis complete; report committed via the implement workflow after two blockers were resolved (dirty tree §8.1; incident-deck hang §8.2).

## 1. Scope & inventory snapshot

| Metric | Value |
|---|---|
| Finalisation snapshot (`dev` HEAD) | `9e792ac3` (mid-audit commits `7a204687`, `9e792ac3` included and re-verified) |
| Working-tree state | clean |
| `*.test.ts` files reviewed | **501** |
| Total test lines | **145,310** (`wc -l` newline count) |
| Unit project (`*.test.ts`, non-browser) | 380 |
| Browser project (`*.browser.test.ts`) | 120 |
| E2E / tutorial / replay / electron | counted within the total above |

Discovery commands (reproducible):

```bash
git rev-parse HEAD
find tests -name '*.test.ts' -type f | wc -l
find tests -name '*.test.ts' -type f -exec wc -l {} \; | awk '{s+=$1} END {print s}'
```

The inventory reconciles exactly: **501 files classified, 501 rows in Appendix A**. The single mid-audit addition (`CalendarSaveLoad.test.ts`, calendar save/load + transcript week/year stamps, CG-0MTT0K9RX0004QTE F6) was classified as `keep` (5 tests, 14 assertions, imports production code).

### Files per group

| Group | Files | Lines | remove | clean-up |
|---|---:|---:|---:|---:|
| `tests/main-street` | 249 | 73,731 | 1 | 4 |
| `tests/ui` | 55 | 17,897 | 0 | 0 |
| `tests/gym` | 37 | 8,453 | 0 | 0 |
| `tests/core-engine` | 32 | 7,232 | 0 | 4 |
| `tests/feudalism` | 14 | 4,423 | 0 | 0 |
| `tests/golf` | 14 | 4,688 | 0 | 0 |
| `tests/beleaguered-castle` | 13 | 5,108 | 0 | 0 |
| `tests/e2e` | 12 | 1,650 | 0 | 0 |
| `tests/sushi-go` | 12 | 3,010 | 0 | 0 |
| `tests/lost-cities` | 11 | 6,420 | 0 | 0 |
| `tests/balance` | 7 | 2,002 | 0 | 0 |
| `tests/` (root) | 7 | 1,011 | 0 | 0 |
| `tests/coloretto` | 7 | 3,279 | 0 | 0 |
| `tests/scripts` | 7 | 1,607 | 1 | 0 |
| `tests/card-system` | 5 | 525 | 0 | 0 |
| `tests/ai` | 4 | 816 | 0 | 0 |
| `tests/electron` | 4 | 504 | 0 | 0 |
| `tests/handView` | 3 | 691 | 0 | 0 |
| `tests/release-windows` | 2 | 175 | 0 | 0 |
| `tests/replay` | 2 | 1,121 | 0 | 0 |
| `tests/rule-engine` | 2 | 1,153 | 0 | 1 |
| `tests/blackjack` | 1 | 192 | 0 | 0 |
| `tests/helpers` | 1 | 123 | 0 | 0 |

### Decision totals

- **keep:** 490
- **clean-up:** 9
- **remove:** 2

## 2. Methodology

The audit reuses the anti-pattern taxonomy from CG-0MS9AGG3N003ASCR (the
precedent cleanup) and applies it as a set of mechanical probes followed by a
manual read of every flagged file.

### Anti-pattern categories

1. **source-code-grep** — assertions over the *text* of source files (`.ts`)
   via `readFileSync` + `toContain`/string index. Break on any refactor and
   never detect behavioural regressions.
2. **placeholder/tautological** — `expect(true).toBe(true)` (or equivalent)
   with no real assertion.
3. **self-referential simulation** — imports zero production code and tests
   only its own local helper copies/structure.
4. **duplicates of core coverage** — re-asserts something a deeper
   core-engine test already covers.
5. **type-level/structural-only** — asserts factory/union shapes the
   TypeScript compiler already enforces.
6. **zero-assertion browser tests** — browser tests with no `expect()` calls.

### Discovery probes

```bash
# 1. Placeholder / tautological
grep -rc 'expect(true)\.toBe(true)' tests --include='*.test.ts' | grep -v ':0'

# 2. Source-code-grep: files that read .ts source text
grep -rl 'readFileSync' tests --include='*.test.ts'
grep -rln "example-games/[a-zA-Z-]*/.*\.ts['\"]\|src/[a-zA-Z-]*/.*\.ts['\"]" tests --include='*.test.ts'

# 3. Zero-assertion files (all and browser-only)
find tests -name '*.test.ts' -type f -exec sh -c '! grep -q "expect(" "$1" && echo "$1"' _ {} \;
find tests -name '*.browser.test.ts' -type f -exec sh -c '! grep -q "expect(" "$1" && echo "$1"' _ {} \;

# 4. Self-referential simulation: imports no production code
#    (whitespace-tolerant; covers multi-line imports and dynamic import())
./scripts/test-review/scan-self-referential.sh   # provided by the test-review skill
```

### Classification rules

- A file is **`keep`** unless a probe fires **and** a manual read confirms the
  anti-pattern is material.
- The 2026-07-31 precedent plus the work-item constraint apply: tests that
  guard historical regressions, documented precedents, or carry explicit
  work-item linkage are **kept** unless evidence shows they no longer assert
  anything. Where such a test uses an anti-pattern, the recommendation is
  **`clean-up`** (preserve the guard, remove the anti-pattern) — never
  `remove`.
- Ambiguous cases default to **`keep`** with a watch-list note.
- Browser/E2E files were assessed by assertion structure (every one boots and
  asserts) and, where uncertain, left as `keep`.

## 3. Anti-pattern scan results

| Probe | Result |
|---|---|
| `expect(true).toBe(true)` | **2 files** — `MainStreetApplicant.test.ts` (30), `helpers/main-street-tutorial-cleanup.browser.test.ts` (1, defensive) |
| Files reading `.ts` source text | **6 files** — `ChallengeSystem`, `SaveLoad`, `DifficultyPresets`, `staff-market-row-ui`, `sold-card-tooltip`, `market-card-cheat` |
| Source-text sweeps (no literal path) | **2 files** — `no-runtime-synthesis`, `test-workflow-safety` |
| Zero-assertion `.test.ts` | **0** |
| Zero-assertion `.browser.test.ts` | **0** |
| Imports no production code | **~23 files**, of which most are legitimate integration/E2E/subprocess/asset tests; **2 are true self-referential** (`dev-server-cleanup`, `help-panel-content`) |

## 4. Removal recommendations (2)

> Executed by child work items, never by this audit (see §7).

### R1 — `tests/main-street/MainStreetApplicant.test.ts` (721 lines)

- **Category:** placeholder/tautological (100% vacuous)
- **Evidence:** 23 tests, 30 `expect(true).toBe(true)`, 69 total `expect(`.
  Every test resolves the functions under test through a helper:

  ```ts
  function engineExport<T>(name: string): T | undefined {
    try {
      const eng: Record<string, unknown> = require('../../example-games/main-street/MainStreetEngine');
      return eng[name] as T | undefined;
    } catch { return undefined; }
  }
  ```

  A runtime probe under the `unit` project shows `require` **is** defined but
  the module request throws `Cannot find module
  '../../example-games/main-street/MainStreetEngine'`, so `engineExport()`
  always returns `undefined`. Every `if (!pendingFn(fn))` branch therefore
  takes the `expect(true).toBe(true)` fallback. The functions *do* exist now
  (`MainStreetEngine.ts` — `resolveStaffApplicant` L3825, `hireStaffApplicant`
  L3905, `declineStaffApplicant` L3938, `letGoStaffMember` L3951), so the file
  is dead weight: **zero real assertions execute**.
- **Recommendation:** delete the file and re-implement its specification using
  static ESM imports as a new task (the intent — applicant trigger/hire/
  decline/let-go economics — has value; the current mechanism does not).
- **Confidence:** high (empirically verified).

### R2 — `tests/scripts/dev-server-cleanup.test.ts` (222 lines)

- **Category:** self-referential simulation (duplicate of core coverage)
- **Evidence:** the file defines its own `createLockFile()` /
  `removeLockFileDirectly()` helpers and asserts on *those*; it imports **zero**
  production code (`vitest` + `node:fs`/`os`/`path` only). The real functions
  in `scripts/dev-server-utils.ts` (`writeLockFile`, `removeLockFile`,
  `killDevServer`, `installDevServerCleanupHandlers`, …) are already exercised
  by `tests/scripts/dev-server-utils.test.ts`, which imports the real module.
- **Recommendation:** delete; the surviving test file already covers the same
  behaviour against production code.
- **Confidence:** high.

## 5. Clean-up recommendations (9)

> Guards are preserved; only the anti-pattern is removed.

### C1 — Core-engine "module isolation" source-grep blocks (3 files)

- `tests/core-engine/ChallengeSystem.test.ts` — `describe('ChallengeSystem module isolation')`, 2 tests: greps `src/core-engine/ChallengeSystem.ts` text for `example-games` and for the phrase *"M6 extraction design notes"*.
- `tests/core-engine/SaveLoad.test.ts` — same shape, 2 tests.
- `tests/core-engine/DifficultyPresets.test.ts` — same shape, 2 tests.
- **Recommendation:** delete the three `module isolation` describe blocks
  (6 tests). The behavioural tests in each file remain. If the "no
  example-games import" invariant matters, enforce it once with an ESLint
  `no-restricted-imports` rule or a dependency-cruiser check rather than three
  hand-rolled text greps.

### C2 — `tests/main-street/staff-market-row-ui.test.ts`

- `describe('AC6: no orphaned staffCardMarket references in the UI layer')`,
  4 tests: walk `example-games/main-street/scenes`, `src/ui`, `src/core-engine`
  and grep every `.ts` for the identifier `staffCardMarket`.
- **Recommendation:** delete the AC6 block; keep the 5 behavioural tests
  (hire flow, illegal-move feedback, tooltip builder).

### C3 — `tests/main-street/sold-card-tooltip.test.ts`

- Entire file reads `MainStreetRenderer.ts` and asserts a tooltip string is
  present / absent (regression guard for CG-0MTFS4PP40064GHE).
- **Recommendation:** reimplement as a behavioural test that invokes the
  tooltip builder and asserts the returned string; drop the `readFileSync` of
  the renderer source. The guard value is preserved.

### C4 — `tests/main-street/market-card-cheat.test.ts`

- One test reads `MainStreetScene.ts` and asserts it contains
  `import.meta.env.DEV` and `createMarketCardCheatTool` (tree-shake guard).
- **Recommendation:** keep the invariant but assert it behaviourally (e.g.
  that the cheat tool is absent from a production-mode build/registration
  path); remove the source read.

### C5 — `tests/main-street/help-panel-content.test.ts`

- **Category:** self-referential / duplicated content. The file defines its own
  `HELP_SECTIONS` copy (comment: *"mirror of LifecycleManager helpSections"*)
  and asserts on that copy; it imports zero production code. The production
  content is defined inline inside a method in
  `MainStreetLifecycleManager.ts` (L326) and is not exported, so the test can
  drift silently.
- **Recommendation:** extract the help/rules content to a Phaser-free module
  (e.g. `MainStreetHelpContent.ts`) and import it from both the scene and the
  test. Preserves the PRD section/line-count guards against real production
  data.

### C6 — `tests/core-engine/no-runtime-synthesis.test.ts`

- **Category:** source-code-grep. The whole file walks `src/` and
  `example-games/` and greps `.ts` text for `from 'tone'`.
- **Recommendation:** keep the invariant (no Tone.js in runtime code) but
  enforce it with an ESLint `no-restricted-imports` rule, which fails on the
  import itself rather than on a text sweep.

### C7 — `tests/rule-engine/LegalityResult.test.ts`

- **Category:** type-level/structural-only. Helpers `_assertLegal`,
  `_assertIllegal`, `_assertNarrowing`, `_assertHelperLegal`,
  `_assertHelperIllegal`, `_assertHelperNarrowing` are `void`-ed compile-time
  checks the compiler already performs; several `it()` blocks assert on
  hand-built object literals (`{ legal: true }`) rather than production output.
- **Recommendation:** delete the `void`-ed compile-time helpers and the
  literal-shape assertions; keep the genuine `legalAction()` /
  `illegalAction()` behavioural tests that use dynamic `import()`.

## 6. Kept with a watch-list note

| File | Note |
|---|---|
| `tests/helpers/main-street-tutorial-cleanup.browser.test.ts` | Single `expect(true).toBe(true)` is a documented fallback when Phaser does not expose `CanvasPool.pool`; the remaining assertions are real. **keep.** |
| `tests/smoke.phaser4.browser.test.ts` | 13 lines, 2 trivial assertions (`ENGINE_VERSION` truthy; `GymRouterScene.prototype instanceof Phaser.Scene` — compiler-guaranteed). Largely subsumed by `tests/gym/GymRouterScene.browser.test.ts`. Retained per the conservative default; flagged for manual review. |
| `tests/test-workflow-safety.test.ts` | Reads `package.json` and one test file to assert no destructive pretest hook exists. Static, but guards a real destructive-tooling regression. **keep.** |
| `tests/*/index.test.ts` (barrel exports) | Assert runtime re-exports resolve. Minor value; catches a broken barrel. **keep.** |

## 7. Tracking of recommendations

Each recommendation above is created as a child work item under
**CG-0MTCOPO8U001UW2Y** (`--issue-type task --priority low --stage idea`), with
a goal, measurable ACs, and a reference to this report. **No test file is
deleted or modified by this audit** — the children execute the changes through
the normal implement → audit gate.

| Recommendation | Child work item |
|---|---|
| R1 — remove `MainStreetApplicant.test.ts` | `CG-0MUA14BRW008HXMX` |
| R2 — remove `dev-server-cleanup.test.ts` | `CG-0MUA14CF60034UW4` |
| C1 — strip core-engine module-isolation greps | `CG-0MUA14D390010P9H` |
| C2 — strip `staff-market-row-ui` AC6 grep block | `CG-0MUA14DQR009U8CE` |
| C3 — convert `sold-card-tooltip.test.ts` | `CG-0MUA14EEB004QFDJ` |
| C4 — convert `market-card-cheat` tree-shake grep | `CG-0MUA14F1B005LRNR` |
| C5 — extract help content to a shared module | `CG-0MUA14FNQ008FXHJ` |
| C6 — convert `no-runtime-synthesis` to a lint rule | `CG-0MUA14GAU0063D95` |
| C7 — strip type-level-only helpers (`LegalityResult`) | `CG-0MUA14GXJ009C4W8` |

## 8. Blockers and their resolution

`/skill:implement CG-0MTCOPO8U001UW2Y` was initially blocked by the workflow's
**mandatory worktree gate**: the main checkout carried uncommitted changes from
other in-progress Main Street work (`CG-0MTT0K9RX0004QTE`, `CG-0MTT7FC7A000AA58`,
referencing `CG-0MTSHG8RP008E128`, `CG-0MTIOLY2A0092OT1`), and the
dirty-main-checkout recovery playbook forbids stashing/committing another
party's changes without permission. The blocker and two questions were recorded
on the work item (`CG-C0MU9ZZRVT007O3NV`) and the item flagged for producer
review.

**Operator response (2026-09-20):** (1) *commit the dirty changes under their
owning work items*; (2) *the proposed child grouping is acceptable*.

**Resolution:**

- The WIP was verified (build green; 25 affected unit files / 725 tests green)
  and committed to `dev` as **`ce9ba1b4`** —
  *WIP(main-street): commit in-progress calendar & chain-card work (CG-0MTT0K9RX0004QTE, CG-0MTT7FC7A000AA58)*.
  The commit was recorded on both owning work items.
- `implement.py start CG-0MU9PKH5300114KR` then created the audit worktree from
  `dev` (clean tree).
- The nine recommendation child work items were created (§7).
- The report was committed through the normal implement → audit gate.

This report reflects the inventory at `9e792ac3` (final `dev` HEAD at commit time);
the earlier snapshot `ce9ba1b4` differed only by the now-committed WIP and two
mid-audit commits.

### 8.2 Second blocker — hanging unit test in the committed WIP (resolved upstream)

`implement.py finish CG-0MU9PKH5300114KR` initially failed its full-suite gate
because `tests/main-street/incident-deck.test.ts > AC2 > "should return null when
the deck is empty"` **hung indefinitely**: the test drained the deck with
`while (deck.length > 0) resolveIncident(state)`, but the week-gating in
CG-0MTT0K9RX0004QTE (F4) makes `resolveIncident` return `null` **without
splicing** when `findConstrainedIncidentIndex` finds no week-eligible card —
so the loop spun once only out-of-window windowed cards remained. Reproduced at
`567ae2d4` (passes) vs `ce9ba1b4` (hangs); a critical `test-failure` item
(`CG-0MUA2YJ9S008QLGO`) was filed and the parent flagged for review.

**Resolution:** the calendar owner (`CG-0MTTAOWHO000BYJR`, commit **`7a204687`**)
fixed it by pinning the test to week 28 (inside the 23–35 summer window), with
the full unit suite verified green; `CG-0MUA2YJ9S008QLGO` was closed as a
duplicate. The audit worktree was then repositioned onto the updated `dev`
(`9e792ac3`) and the inventory re-verified (501 files).

**Open design note for the calendar owner:** the underlying engine hazard remains —
a non-empty incident deck whose remaining cards are all out-of-window never
drains and `replenishIncidentDeck` only fires at length 0, so incidents can
silently stop late in a year cycle. Recommended to track separately (it does
not block this audit).


## Appendix A — Full classification table (501 files)

Every `*.test.ts` file in the suite at the finalisation snapshot (`9e792ac3`). `keep` rows carry no per-file evidence line (no anti-pattern detected); flagged rows are explained in §§4–6.

| # | Test file | Lines | Decision | Category |
|---|-----------|------:|----------|----------|
| 1 | `tests/ai/AiStrategy.test.ts` | 110 | keep | — |
| 2 | `tests/ai/AiUtils.test.ts` | 126 | keep | — |
| 3 | `tests/ai/CardMemoryTracker.test.ts` | 533 | keep | — |
| 4 | `tests/ai/index.test.ts` | 47 | keep | — |
| 5 | `tests/balance/baseline.test.ts` | 206 | keep | — |
| 6 | `tests/balance/card-metrics.test.ts` | 407 | keep | — |
| 7 | `tests/balance/comparison.test.ts` | 187 | keep | — |
| 8 | `tests/balance/global-metrics.test.ts` | 393 | keep | — |
| 9 | `tests/balance/integration.test.ts` | 338 | keep | — |
| 10 | `tests/balance/statistics.test.ts` | 266 | keep | — |
| 11 | `tests/balance/thresholds.test.ts` | 205 | keep | — |
| 12 | `tests/beleaguered-castle/BeleagueredCastleAi.test.ts` | 267 | keep | — |
| 13 | `tests/beleaguered-castle/BeleagueredCastleConstants.test.ts` | 134 | keep | — |
| 14 | `tests/beleaguered-castle/BeleagueredCastleDrag.browser.test.ts` | 366 | keep | — |
| 15 | `tests/beleaguered-castle/BeleagueredCastleHint.browser.test.ts` | 148 | keep | — |
| 16 | `tests/beleaguered-castle/BeleagueredCastleLayout.browser.test.ts` | 275 | keep | — |
| 17 | `tests/beleaguered-castle/BeleagueredCastleMigration.browser.test.ts` | 171 | keep | — |
| 18 | `tests/beleaguered-castle/BeleagueredCastleOverlay.browser.test.ts` | 354 | keep | — |
| 19 | `tests/beleaguered-castle/BeleagueredCastleRules.test.ts` | 1767 | keep | — |
| 20 | `tests/beleaguered-castle/BeleagueredCastleTurnController.browser.test.ts` | 169 | keep | — |
| 21 | `tests/beleaguered-castle/BeleagueredCastleVariant.browser.test.ts` | 210 | keep | — |
| 22 | `tests/beleaguered-castle/BeleagueredCastleVariant.test.ts` | 104 | keep | — |
| 23 | `tests/beleaguered-castle/Integration.test.ts` | 709 | keep | — |
| 24 | `tests/beleaguered-castle/save-load-autosave.test.ts` | 434 | keep | — |
| 25 | `tests/blackjack.test.ts` | 633 | keep | — |
| 26 | `tests/blackjack/BlackjackHandView.browser.test.ts` | 192 | keep | — |
| 27 | `tests/card-system/Card.test.ts` | 45 | keep | — |
| 28 | `tests/card-system/Deck.test.ts` | 220 | keep | — |
| 29 | `tests/card-system/Pile.test.ts` | 154 | keep | — |
| 30 | `tests/card-system/index.test.ts` | 57 | keep | — |
| 31 | `tests/card-system/rankValue.test.ts` | 49 | keep | — |
| 32 | `tests/coloretto/ColorettoAis.test.ts` | 269 | keep | — |
| 33 | `tests/coloretto/ColorettoCards.test.ts` | 162 | keep | — |
| 34 | `tests/coloretto/ColorettoGame.test.ts` | 767 | keep | — |
| 35 | `tests/coloretto/ColorettoGameIntegration.test.ts` | 148 | keep | — |
| 36 | `tests/coloretto/ColorettoScene.browser.test.ts` | 1438 | keep | — |
| 37 | `tests/coloretto/ColorettoScoring.test.ts` | 311 | keep | — |
| 38 | `tests/coloretto/GameTranscript.test.ts` | 184 | keep | — |
| 39 | `tests/core-engine/ActiveEffect.test.ts` | 246 | keep | — |
| 40 | `tests/core-engine/ChallengeSystem.test.ts` | 301 | clean-up | source-code-grep |
| 41 | `tests/core-engine/CsvLoader.test.ts` | 56 | keep | — |
| 42 | `tests/core-engine/DifficultyPresets.test.ts` | 177 | clean-up | source-code-grep |
| 43 | `tests/core-engine/GameEventEmitter.test.ts` | 694 | keep | — |
| 44 | `tests/core-engine/GameState.test.ts` | 148 | keep | — |
| 45 | `tests/core-engine/I18n.test.ts` | 243 | keep | — |
| 46 | `tests/core-engine/ListenerRegistry.test.ts` | 195 | keep | — |
| 47 | `tests/core-engine/PhaserEventBridge.browser.test.ts` | 155 | keep | — |
| 48 | `tests/core-engine/PhaserEventBridge.test.ts` | 300 | keep | — |
| 49 | `tests/core-engine/SaveLoad.test.ts` | 123 | clean-up | source-code-grep |
| 50 | `tests/core-engine/SeededRng.test.ts` | 81 | keep | — |
| 51 | `tests/core-engine/SoundManager.test.ts` | 503 | keep | — |
| 52 | `tests/core-engine/SoundManager.tf-integration.test.ts` | 91 | keep | — |
| 53 | `tests/core-engine/SpatialRules.test.ts` | 128 | keep | — |
| 54 | `tests/core-engine/SvgHelpers.browser.test.ts` | 73 | keep | — |
| 55 | `tests/core-engine/SvgHelpers.test.ts` | 205 | keep | — |
| 56 | `tests/core-engine/TranscriptRecorder.test.ts` | 253 | keep | — |
| 57 | `tests/core-engine/TranscriptStore.test.ts` | 382 | keep | — |
| 58 | `tests/core-engine/TranscriptTypes.test.ts` | 104 | keep | — |
| 59 | `tests/core-engine/TurnSequencer.test.ts` | 375 | keep | — |
| 60 | `tests/core-engine/UndoRedoManager.test.ts` | 385 | keep | — |
| 61 | `tests/core-engine/VisibilityOwnership.test.ts` | 133 | keep | — |
| 62 | `tests/core-engine/action-commands.test.ts` | 436 | keep | — |
| 63 | `tests/core-engine/autoSaveTranscript.test.ts` | 139 | keep | — |
| 64 | `tests/core-engine/checkpoint-manager.test.ts` | 426 | keep | — |
| 65 | `tests/core-engine/checkpoint-resume-overlay.test.ts` | 262 | keep | — |
| 66 | `tests/core-engine/index.test.ts` | 122 | keep | — |
| 67 | `tests/core-engine/no-runtime-synthesis.test.ts` | 44 | clean-up | source-code-grep |
| 68 | `tests/core-engine/scene-registry.test.ts` | 116 | keep | — |
| 69 | `tests/core-engine/setup-options.test.ts` | 245 | keep | — |
| 70 | `tests/core-engine/tfAdapter.test.ts` | 91 | keep | — |
| 71 | `tests/e2e/generate-thumbnail.main-street.test.ts` | 63 | keep | — |
| 72 | `tests/e2e/main-street-cheat-smoke.browser.test.ts` | 135 | keep | — |
| 73 | `tests/e2e/main-street-headless.e2e.test.ts` | 220 | keep | — |
| 74 | `tests/e2e/main-street-no-console-errors.browser.test.ts` | 228 | keep | — |
| 75 | `tests/e2e/main-street-transcript.e2e.test.ts` | 58 | keep | — |
| 76 | `tests/e2e/main-street-tutorial-e2e-part1.browser.test.ts` | 135 | keep | — |
| 77 | `tests/e2e/main-street-tutorial-e2e-part2.browser.test.ts` | 102 | keep | — |
| 78 | `tests/e2e/main-street-tutorial-e2e-part3.browser.test.ts` | 114 | keep | — |
| 79 | `tests/e2e/main-street-tutorial-e2e-part4.browser.test.ts` | 113 | keep | — |
| 80 | `tests/e2e/main-street-tutorial-e2e-part5.browser.test.ts` | 228 | keep | — |
| 81 | `tests/e2e/main-street-tutorial-e2e-part6.browser.test.ts` | 148 | keep | — |
| 82 | `tests/e2e/replay-main-street.e2e.test.ts` | 106 | keep | — |
| 83 | `tests/electron/content-locator.test.ts` | 149 | keep | — |
| 84 | `tests/electron/launch-smoke.test.ts` | 161 | keep | — |
| 85 | `tests/electron/launcher-config.test.ts` | 126 | keep | — |
| 86 | `tests/electron/vite-base-gating.test.ts` | 68 | keep | — |
| 87 | `tests/feudalism/AiStrategy.test.ts` | 227 | keep | — |
| 88 | `tests/feudalism/FeudalismAudioResilience.browser.test.ts` | 181 | keep | — |
| 89 | `tests/feudalism/FeudalismCards.test.ts` | 438 | keep | — |
| 90 | `tests/feudalism/FeudalismGame.test.ts` | 1160 | keep | — |
| 91 | `tests/feudalism/FeudalismGameOverOverlay.test.ts` | 147 | keep | — |
| 92 | `tests/feudalism/FeudalismLayout.browser.test.ts` | 380 | keep | — |
| 93 | `tests/feudalism/FeudalismRefillAnimation.browser.test.ts` | 257 | keep | — |
| 94 | `tests/feudalism/FeudalismSelection.browser.test.ts` | 95 | keep | — |
| 95 | `tests/feudalism/FeudalismSmokeTest.browser.test.ts` | 287 | keep | — |
| 96 | `tests/feudalism/FeudalismTokenSelection.browser.test.ts` | 80 | keep | — |
| 97 | `tests/feudalism/FeudalismZOrder.browser.test.ts` | 194 | keep | — |
| 98 | `tests/feudalism/render-helpers.test.ts` | 39 | keep | — |
| 99 | `tests/feudalism/resume-turn-phase.test.ts` | 421 | keep | — |
| 100 | `tests/feudalism/save-load.test.ts` | 517 | keep | — |
| 101 | `tests/golf/AiStrategy.test.ts` | 1420 | keep | — |
| 102 | `tests/golf/GameTranscript.test.ts` | 385 | keep | — |
| 103 | `tests/golf/GolfEvents.browser.test.ts` | 245 | keep | — |
| 104 | `tests/golf/GolfGame.test.ts` | 222 | keep | — |
| 105 | `tests/golf/GolfGrid.test.ts` | 142 | keep | — |
| 106 | `tests/golf/GolfInteraction.browser.test.ts` | 495 | keep | — |
| 107 | `tests/golf/GolfOverlay.browser.test.ts` | 314 | keep | — |
| 108 | `tests/golf/GolfReplay.browser.test.ts` | 297 | keep | — |
| 109 | `tests/golf/GolfRules.test.ts` | 279 | keep | — |
| 110 | `tests/golf/GolfScene.browser.test.ts` | 177 | keep | — |
| 111 | `tests/golf/GolfScoring.test.ts` | 130 | keep | — |
| 112 | `tests/golf/GolfWinLoseAudio.browser.test.ts` | 124 | keep | — |
| 113 | `tests/golf/GolfWinLoseAudio.test.ts` | 50 | keep | — |
| 114 | `tests/golf/Integration.test.ts` | 408 | keep | — |
| 115 | `tests/gym/GymAiStrategy.test.ts` | 306 | keep | — |
| 116 | `tests/gym/GymButtonBar.test.ts` | 363 | keep | — |
| 117 | `tests/gym/GymButtonBarVisibility.browser.test.ts` | 201 | keep | — |
| 118 | `tests/gym/GymCardIndex.test.ts` | 400 | keep | — |
| 119 | `tests/gym/GymCardIndexScene.browser.test.ts` | 269 | keep | — |
| 120 | `tests/gym/GymConstants.test.ts` | 97 | keep | — |
| 121 | `tests/gym/GymDeckRngGrid.smoke.browser.test.ts` | 119 | keep | — |
| 122 | `tests/gym/GymDeckRngScene.browser.test.ts` | 249 | keep | — |
| 123 | `tests/gym/GymEventLogSmoke.smoke.browser.test.ts` | 146 | keep | — |
| 124 | `tests/gym/GymGraphicsLightingSpikeScene.browser.test.ts` | 210 | keep | — |
| 125 | `tests/gym/GymGraphicsShaderSpikeScene.browser.test.ts` | 202 | keep | — |
| 126 | `tests/gym/GymHandPile.test.ts` | 243 | keep | — |
| 127 | `tests/gym/GymHeadlessDeterminism.test.ts` | 357 | keep | — |
| 128 | `tests/gym/GymHudComponentsScene.browser.test.ts` | 462 | keep | — |
| 129 | `tests/gym/GymI18nScene.browser.test.ts` | 179 | keep | — |
| 130 | `tests/gym/GymLayoutOwnershipScene.browser.test.ts` | 305 | keep | — |
| 131 | `tests/gym/GymMarketOfferEngine.browser.test.ts` | 186 | keep | — |
| 132 | `tests/gym/GymOverlayUiScene.browser.test.ts` | 515 | keep | — |
| 133 | `tests/gym/GymParameterizedOverlayScene.browser.test.ts` | 312 | keep | — |
| 134 | `tests/gym/GymRegistry.test.ts` | 83 | keep | — |
| 135 | `tests/gym/GymRouterScene.browser.test.ts` | 160 | keep | — |
| 136 | `tests/gym/GymRuleEngine.test.ts` | 200 | keep | — |
| 137 | `tests/gym/GymSaveLoad.test.ts` | 241 | keep | — |
| 138 | `tests/gym/GymSaveLoadRandomizeHand.test.ts` | 116 | keep | — |
| 139 | `tests/gym/GymSceneHeaderNavigation.test.ts` | 69 | keep | — |
| 140 | `tests/gym/GymSceneSmoke.browser.test.ts` | 108 | keep | — |
| 141 | `tests/gym/GymSceneUtils.smoke.test.ts` | 250 | keep | — |
| 142 | `tests/gym/GymSllLayout.test.ts` | 107 | keep | — |
| 143 | `tests/gym/GymSllScene.browser.test.ts` | 288 | keep | — |
| 144 | `tests/gym/GymSpatialRules.test.ts` | 356 | keep | — |
| 145 | `tests/gym/GymSvgHelpers.test.ts` | 60 | keep | — |
| 146 | `tests/gym/GymTokenPileView.browser.test.ts` | 184 | keep | — |
| 147 | `tests/gym/GymTooltipLayout.test.ts` | 69 | keep | — |
| 148 | `tests/gym/GymTooltipToggle.browser.test.ts` | 152 | keep | — |
| 149 | `tests/gym/GymTranscript.test.ts` | 329 | keep | — |
| 150 | `tests/gym/GymUndoRedo.test.ts` | 126 | keep | — |
| 151 | `tests/gym/handPileScene.animation.test.ts` | 434 | keep | — |
| 152 | `tests/handView/gym-handpile-cancel.browser.test.ts` | 231 | keep | — |
| 153 | `tests/handView/gym-handpile-drag.browser.test.ts` | 230 | keep | — |
| 154 | `tests/handView/gym-handpile-outlines.browser.test.ts` | 230 | keep | — |
| 155 | `tests/helpers/main-street-tutorial-cleanup.browser.test.ts` | 123 | keep | defensive guard |
| 156 | `tests/lost-cities/LostCitiesOverlayAlignment.browser.test.ts` | 356 | keep | — |
| 157 | `tests/lost-cities/LostCitiesRoundEnd.browser.test.ts` | 471 | keep | — |
| 158 | `tests/lost-cities/lost-cities-ai.test.ts` | 1845 | keep | — |
| 159 | `tests/lost-cities/lost-cities-cards.test.ts` | 408 | keep | — |
| 160 | `tests/lost-cities/lost-cities-draw-pile-view.test.ts` | 218 | keep | — |
| 161 | `tests/lost-cities/lost-cities-game.test.ts` | 687 | keep | — |
| 162 | `tests/lost-cities/lost-cities-hand-pile-migration.test.ts` | 783 | keep | — |
| 163 | `tests/lost-cities/lost-cities-rules.test.ts` | 346 | keep | — |
| 164 | `tests/lost-cities/lost-cities-scoring.test.ts` | 352 | keep | — |
| 165 | `tests/lost-cities/lost-cities-transcript.test.ts` | 583 | keep | — |
| 166 | `tests/lost-cities/texture-helpers.test.ts` | 371 | keep | — |
| 167 | `tests/main-street/CalendarSaveLoad.test.ts` | 100 | keep | — |
| 168 | `tests/main-street/CalendarState.test.ts` | 203 | keep | — |
| 169 | `tests/main-street/CloseBusiness.test.ts` | 585 | keep | — |
| 170 | `tests/main-street/HelpPanelLayering.browser.test.ts` | 224 | keep | — |
| 171 | `tests/main-street/HelpSettingsButtons.browser.test.ts` | 139 | keep | — |
| 172 | `tests/main-street/IrishHolidayCards.test.ts` | 130 | keep | — |
| 173 | `tests/main-street/MainStreet-hud-week.browser.test.ts` | 112 | keep | — |
| 174 | `tests/main-street/MainStreetAiEventChoice.test.ts` | 263 | keep | — |
| 175 | `tests/main-street/MainStreetApplicant.browser.test.ts` | 267 | keep | — |
| 176 | `tests/main-street/MainStreetApplicant.test.ts` | 722 | remove | placeholder/tautological |
| 177 | `tests/main-street/MainStreetCards-week-window.test.ts` | 200 | keep | — |
| 178 | `tests/main-street/MainStreetEngineEventChoice.test.ts` | 372 | keep | — |
| 179 | `tests/main-street/MainStreetEventChoice.test.ts` | 270 | keep | — |
| 180 | `tests/main-street/MainStreetEventChoiceUndo.test.ts` | 253 | keep | — |
| 181 | `tests/main-street/MainStreetHandState.test.ts` | 470 | keep | — |
| 182 | `tests/main-street/MainStreetHandSynergy.test.ts` | 174 | keep | — |
| 183 | `tests/main-street/MainStreetIntegration.test.ts` | 453 | keep | — |
| 184 | `tests/main-street/MainStreetLayoutAnchors.browser.test.ts` | 104 | keep | — |
| 185 | `tests/main-street/MainStreetMarketCycling.test.ts` | 451 | keep | — |
| 186 | `tests/main-street/MainStreetOverlay.browser.test.ts` | 420 | keep | — |
| 187 | `tests/main-street/MainStreetPlaceSell.test.ts` | 1049 | keep | — |
| 188 | `tests/main-street/MainStreetScene.browser.test.ts` | 911 | keep | — |
| 189 | `tests/main-street/MainStreetSellCards.test.ts` | 650 | keep | — |
| 190 | `tests/main-street/MainStreetSellPriceFormula.test.ts` | 262 | keep | — |
| 191 | `tests/main-street/MainStreetStaffCards.test.ts` | 691 | keep | — |
| 192 | `tests/main-street/MainStreetSvgSmoke.browser.test.ts` | 105 | keep | — |
| 193 | `tests/main-street/MainStreetZOrder.browser.test.ts` | 187 | keep | — |
| 194 | `tests/main-street/SidebarOverlay.browser.test.ts` | 84 | keep | — |
| 195 | `tests/main-street/TutorialOverlayClickThrough.browser.test.ts` | 560 | keep | — |
| 196 | `tests/main-street/TutorialOverlayHighlights.browser.test.ts` | 477 | keep | — |
| 197 | `tests/main-street/TutorialOverlayManager.browser.test.ts` | 537 | keep | — |
| 198 | `tests/main-street/WeekGatedIncidents.test.ts` | 159 | keep | — |
| 199 | `tests/main-street/WeekGatedMarket.test.ts` | 141 | keep | — |
| 200 | `tests/main-street/action-banking.test.ts` | 631 | keep | — |
| 201 | `tests/main-street/action-economy.test.ts` | 682 | keep | — |
| 202 | `tests/main-street/action-restore-on-failure.test.ts` | 290 | keep | — |
| 203 | `tests/main-street/activity-log-rendering.browser.test.ts` | 688 | keep | — |
| 204 | `tests/main-street/activity-log-rendering.test.ts` | 132 | keep | — |
| 205 | `tests/main-street/activity-log.test.ts` | 860 | keep | — |
| 206 | `tests/main-street/adjacency.test.ts` | 384 | keep | — |
| 207 | `tests/main-street/ai-action-budget.test.ts` | 195 | keep | — |
| 208 | `tests/main-street/ai-banking-strategy.test.ts` | 532 | keep | — |
| 209 | `tests/main-street/ai-choice.test.ts` | 254 | keep | — |
| 210 | `tests/main-street/ai-event-budget.test.ts` | 259 | keep | — |
| 211 | `tests/main-street/ai-strategy.test.ts` | 688 | keep | — |
| 212 | `tests/main-street/ai-upgrade-budget.test.ts` | 332 | keep | — |
| 213 | `tests/main-street/balance-cards-csv-pipeline.test.ts` | 78 | keep | — |
| 214 | `tests/main-street/balance-cards.test.ts` | 576 | keep | — |
| 215 | `tests/main-street/business-card-tooltip-info.test.ts` | 96 | keep | — |
| 216 | `tests/main-street/business-ongoing-cost.test.ts` | 457 | keep | — |
| 217 | `tests/main-street/buy-transfer-destination.test.ts` | 321 | keep | — |
| 218 | `tests/main-street/camera-zoom.browser.test.ts` | 381 | keep | — |
| 219 | `tests/main-street/card-catalog-baseline.test.ts` | 63 | keep | — |
| 220 | `tests/main-street/card-currency-formatting.test.ts` | 275 | keep | — |
| 221 | `tests/main-street/card-icons.smoke.test.ts` | 37 | keep | — |
| 222 | `tests/main-street/card-manifest.test.ts` | 65 | keep | — |
| 223 | `tests/main-street/card-schema-validation.test.ts` | 79 | keep | — |
| 224 | `tests/main-street/card-svg-coverage.test.ts` | 37 | keep | — |
| 225 | `tests/main-street/card-svg-generator.test.ts` | 237 | keep | — |
| 226 | `tests/main-street/cash-line-overlay.test.ts` | 299 | keep | — |
| 227 | `tests/main-street/cash-line-two-tone.browser.test.ts` | 189 | keep | — |
| 228 | `tests/main-street/chain-content.test.ts` | 194 | keep | — |
| 229 | `tests/main-street/challenge-celebration.test.ts` | 182 | keep | — |
| 230 | `tests/main-street/challenges.test.ts` | 767 | keep | — |
| 231 | `tests/main-street/checkpoint-manager.test.ts` | 193 | keep | — |
| 232 | `tests/main-street/click-place.browser.test.ts` | 261 | keep | — |
| 233 | `tests/main-street/clinic-health-synergy.test.ts` | 368 | keep | — |
| 234 | `tests/main-street/coin-grid.browser.test.ts` | 238 | keep | — |
| 235 | `tests/main-street/coin-grid.test.ts` | 226 | keep | — |
| 236 | `tests/main-street/coin-vfx-scaling.test.ts` | 138 | keep | — |
| 237 | `tests/main-street/command-action-economy.test.ts` | 264 | keep | — |
| 238 | `tests/main-street/community-favour-ai.test.ts` | 228 | keep | — |
| 239 | `tests/main-street/community-favour-engine.test.ts` | 320 | keep | — |
| 240 | `tests/main-street/community-favour-persistence.test.ts` | 148 | keep | — |
| 241 | `tests/main-street/community-favour-ui.browser.test.ts` | 244 | keep | — |
| 242 | `tests/main-street/community-favour-ui.test.ts` | 84 | keep | — |
| 243 | `tests/main-street/community-space-ongoing-cost.test.ts` | 259 | keep | — |
| 244 | `tests/main-street/community-space-tooltip.test.ts` | 321 | keep | — |
| 245 | `tests/main-street/community-space-types.test.ts` | 597 | keep | — |
| 246 | `tests/main-street/competitive-ai-strategy.test.ts` | 360 | keep | — |
| 247 | `tests/main-street/competitive-endless.test.ts` | 304 | keep | — |
| 248 | `tests/main-street/competitive-income-events.test.ts` | 407 | keep | — |
| 249 | `tests/main-street/competitive-monte-carlo.test.ts` | 288 | keep | — |
| 250 | `tests/main-street/competitive-phase.test.ts` | 402 | keep | — |
| 251 | `tests/main-street/competitive-state.test.ts` | 501 | keep | — |
| 252 | `tests/main-street/composite-click.browser.test.ts` | 513 | keep | — |
| 253 | `tests/main-street/controller-composite-pricing.test.ts` | 431 | keep | — |
| 254 | `tests/main-street/csv-checksum.test.ts` | 409 | keep | — |
| 255 | `tests/main-street/day-banner-animator.test.ts` | 201 | keep | — |
| 256 | `tests/main-street/day-banner.browser.test.ts` | 226 | keep | — |
| 257 | `tests/main-street/difficulty-presets.test.ts` | 644 | keep | — |
| 258 | `tests/main-street/drag-transfer-duration.test.ts` | 46 | keep | — |
| 259 | `tests/main-street/drag.browser.test.ts` | 369 | keep | — |
| 260 | `tests/main-street/drag.test.ts` | 523 | keep | — |
| 261 | `tests/main-street/duration-event-card.test.ts` | 125 | keep | — |
| 262 | `tests/main-street/duration-event-resolution.test.ts` | 208 | keep | — |
| 263 | `tests/main-street/easy-mode-phase-bug.test.ts` | 125 | keep | — |
| 264 | `tests/main-street/event-card-tooltip-info.test.ts` | 205 | keep | — |
| 265 | `tests/main-street/event-choice-dialog-slice.browser.test.ts` | 205 | keep | — |
| 266 | `tests/main-street/event-choice-dialog.browser.test.ts` | 166 | keep | — |
| 267 | `tests/main-street/event-choice.test.ts` | 424 | keep | — |
| 268 | `tests/main-street/event-played-animator.test.ts` | 172 | keep | — |
| 269 | `tests/main-street/event-played.browser.test.ts` | 124 | keep | — |
| 270 | `tests/main-street/expanded-card-integration.test.ts` | 45 | keep | — |
| 271 | `tests/main-street/expanded-card-pool.test.ts` | 642 | keep | — |
| 272 | `tests/main-street/expanded-grid-contract.test.ts` | 335 | keep | — |
| 273 | `tests/main-street/expanded-grid-edgecases.test.ts` | 259 | keep | — |
| 274 | `tests/main-street/expanded-grid-state.test.ts` | 109 | keep | — |
| 275 | `tests/main-street/expanded-viewport.browser.test.ts` | 336 | keep | — |
| 276 | `tests/main-street/expanded-viewport.test.ts` | 170 | keep | — |
| 277 | `tests/main-street/flu-integration.test.ts` | 284 | keep | — |
| 278 | `tests/main-street/game-over-animator.test.ts` | 202 | keep | — |
| 279 | `tests/main-street/game-over.browser.test.ts` | 173 | keep | — |
| 280 | `tests/main-street/game-state.test.ts` | 431 | keep | — |
| 281 | `tests/main-street/graffiti-art-incident.test.ts` | 177 | keep | — |
| 282 | `tests/main-street/grand-opening-same-turn-gate.test.ts` | 423 | keep | — |
| 283 | `tests/main-street/group-a-business-expansion.test.ts` | 251 | keep | — |
| 284 | `tests/main-street/group-b-community-space-expansion.test.ts` | 266 | keep | — |
| 285 | `tests/main-street/group-c-investment-events-expansion.test.ts` | 387 | keep | — |
| 286 | `tests/main-street/group-d-incident-events-expansion.test.ts` | 307 | keep | — |
| 287 | `tests/main-street/group-e-upgrade-cards-expansion.test.ts` | 190 | keep | — |
| 288 | `tests/main-street/group-f-staff-abilities-expansion.test.ts` | 284 | keep | — |
| 289 | `tests/main-street/hand-business-click.test.ts` | 311 | keep | — |
| 290 | `tests/main-street/hand-outlines.browser.test.ts` | 248 | keep | — |
| 291 | `tests/main-street/harness-cli.test.ts` | 134 | keep | — |
| 292 | `tests/main-street/help-panel-content.test.ts` | 195 | clean-up | self-referential / duplicated content |
| 293 | `tests/main-street/hint-bar-placement.browser.test.ts` | 241 | keep | — |
| 294 | `tests/main-street/hint.test.ts` | 365 | keep | — |
| 295 | `tests/main-street/hud-tooltips.test.ts` | 515 | keep | — |
| 296 | `tests/main-street/illegal-afford-feedback.test.ts` | 476 | keep | — |
| 297 | `tests/main-street/incident-balance.test.ts` | 613 | keep | — |
| 298 | `tests/main-street/incident-deck.test.ts` | 180 | keep | — |
| 299 | `tests/main-street/incident-queue-card-aspect.test.ts` | 51 | keep | — |
| 300 | `tests/main-street/incident-reveal-animator.test.ts` | 593 | keep | — |
| 301 | `tests/main-street/incident-reveal.browser.test.ts` | 213 | keep | — |
| 302 | `tests/main-street/income-collection-animator.test.ts` | 305 | keep | — |
| 303 | `tests/main-street/income-collection.browser.test.ts` | 360 | keep | — |
| 304 | `tests/main-street/income-decay.test.ts` | 205 | keep | — |
| 305 | `tests/main-street/income-phase-animation.browser.test.ts` | 347 | keep | — |
| 306 | `tests/main-street/income-phase-data.test.ts` | 291 | keep | — |
| 307 | `tests/main-street/income-phase-sequential-animator.test.ts` | 345 | keep | — |
| 308 | `tests/main-street/income-sound.test.ts` | 154 | keep | — |
| 309 | `tests/main-street/incremental-income.test.ts` | 609 | keep | — |
| 310 | `tests/main-street/integration.test.ts` | 792 | keep | — |
| 311 | `tests/main-street/layout-adapter.test.ts` | 99 | keep | — |
| 312 | `tests/main-street/main-street-animators-deferred.browser.test.ts` | 202 | keep | — |
| 313 | `tests/main-street/main-street-engine-deltas.test.ts` | 396 | keep | — |
| 314 | `tests/main-street/main-street-prefs.test.ts` | 77 | keep | — |
| 315 | `tests/main-street/main-street-renderer-deferred.browser.test.ts` | 136 | keep | — |
| 316 | `tests/main-street/manage-card-dialog.browser.test.ts` | 334 | keep | — |
| 317 | `tests/main-street/map-view.test.ts` | 247 | keep | — |
| 318 | `tests/main-street/market-card-cheat.test.ts` | 293 | clean-up | source-code-grep |
| 319 | `tests/main-street/market-deal-in-animator.test.ts` | 261 | keep | — |
| 320 | `tests/main-street/market-deal-in.browser.test.ts` | 150 | keep | — |
| 321 | `tests/main-street/market-extraction-parity.test.ts` | 1032 | keep | — |
| 322 | `tests/main-street/market-row-alignment.test.ts` | 64 | keep | — |
| 323 | `tests/main-street/market-specialist-staff.test.ts` | 173 | keep | — |
| 324 | `tests/main-street/market.integration.test.ts` | 269 | keep | — |
| 325 | `tests/main-street/market.test.ts` | 695 | keep | — |
| 326 | `tests/main-street/meta-progression.test.ts` | 1319 | keep | — |
| 327 | `tests/main-street/mjs-svg-generator.test.ts` | 203 | keep | — |
| 328 | `tests/main-street/monte-carlo-balance.test.ts` | 71 | keep | — |
| 329 | `tests/main-street/monte-carlo-batch-runner.test.ts` | 166 | keep | — |
| 330 | `tests/main-street/monte-carlo-greedy-guardrail.test.ts` | 122 | keep | — |
| 331 | `tests/main-street/monte-carlo-guardrails.test.ts` | 103 | keep | — |
| 332 | `tests/main-street/monte-carlo-run-summary-extensions.test.ts` | 157 | keep | — |
| 333 | `tests/main-street/move-to-hand-no-auto-select.test.ts` | 311 | keep | — |
| 334 | `tests/main-street/no-phantom-synergy.test.ts` | 125 | keep | — |
| 335 | `tests/main-street/ongoing-cost-tooltips.test.ts` | 305 | keep | — |
| 336 | `tests/main-street/peek.browser.test.ts` | 243 | keep | — |
| 337 | `tests/main-street/peek.test.ts` | 321 | keep | — |
| 338 | `tests/main-street/positive-incident-multiplier.test.ts` | 70 | keep | — |
| 339 | `tests/main-street/premium-placeFromHand.test.ts` | 274 | keep | — |
| 340 | `tests/main-street/premium-play-from-hand-command.test.ts` | 155 | keep | — |
| 341 | `tests/main-street/readers-cafe-upgrade.test.ts` | 93 | keep | — |
| 342 | `tests/main-street/refresh-market.test.ts` | 488 | keep | — |
| 343 | `tests/main-street/repro-diagonal-synergy.test.ts` | 89 | keep | — |
| 344 | `tests/main-street/reputation-coin-multiplier.test.ts` | 390 | keep | — |
| 345 | `tests/main-street/same-type-synergy.test.ts` | 485 | keep | — |
| 346 | `tests/main-street/save-load-expanded.test.ts` | 277 | keep | — |
| 347 | `tests/main-street/save-load.test.ts` | 272 | keep | — |
| 348 | `tests/main-street/scenario-validation.test.ts` | 140 | keep | — |
| 349 | `tests/main-street/sell-demolition-animator.test.ts` | 252 | keep | — |
| 350 | `tests/main-street/sell-demolition.browser.test.ts` | 152 | keep | — |
| 351 | `tests/main-street/serialized-state-migration.test.ts` | 306 | keep | — |
| 352 | `tests/main-street/sfxTfMapping.test.ts` | 19 | keep | — |
| 353 | `tests/main-street/smoke-scenario.test.ts` | 260 | keep | — |
| 354 | `tests/main-street/sold-card-tooltip.test.ts` | 44 | clean-up | source-code-grep |
| 355 | `tests/main-street/staff-applicant-cheat.browser.test.ts` | 144 | keep | — |
| 356 | `tests/main-street/staff-applicant-cheat.test.ts` | 225 | keep | — |
| 357 | `tests/main-street/staff-business-type-matching.test.ts` | 349 | keep | — |
| 358 | `tests/main-street/staff-effect-scoping.test.ts` | 180 | keep | — |
| 359 | `tests/main-street/staff-general-market-purchase.test.ts` | 306 | keep | — |
| 360 | `tests/main-street/staff-general-market-state.test.ts` | 295 | keep | — |
| 361 | `tests/main-street/staff-market-row-ui.test.ts` | 307 | clean-up | source-code-grep |
| 362 | `tests/main-street/staff-market-row.browser.test.ts` | 172 | keep | — |
| 363 | `tests/main-street/staff-placement-commands.test.ts` | 279 | keep | — |
| 364 | `tests/main-street/staff-placement-removal.browser.test.ts` | 193 | keep | — |
| 365 | `tests/main-street/staff-skill-assignment-state.test.ts` | 168 | keep | — |
| 366 | `tests/main-street/staff-skill-assignment.test.ts` | 189 | keep | — |
| 367 | `tests/main-street/staff-skill-buff-wiring.test.ts` | 493 | keep | — |
| 368 | `tests/main-street/staff-skill-buffs.test.ts` | 302 | keep | — |
| 369 | `tests/main-street/staff-skill-catalog.test.ts` | 156 | keep | — |
| 370 | `tests/main-street/staff-skill-stacking.test.ts` | 223 | keep | — |
| 371 | `tests/main-street/staff-skill-tooltip.test.ts` | 71 | keep | — |
| 372 | `tests/main-street/staff-specialization.integration.test.ts` | 209 | keep | — |
| 373 | `tests/main-street/staff-underlay-formatting.test.ts` | 58 | keep | — |
| 374 | `tests/main-street/staff-underlay-rendering.browser.test.ts` | 171 | keep | — |
| 375 | `tests/main-street/stats-button-icon.test.ts` | 50 | keep | — |
| 376 | `tests/main-street/stats-domain.test.ts` | 439 | keep | — |
| 377 | `tests/main-street/stats-integration.test.ts` | 188 | keep | — |
| 378 | `tests/main-street/svg-texture-cache-invalidation.test.ts` | 193 | keep | — |
| 379 | `tests/main-street/synergy-formation-animator.test.ts` | 265 | keep | — |
| 380 | `tests/main-street/synergy-formation.browser.test.ts` | 368 | keep | — |
| 381 | `tests/main-street/synergy-formatting.test.ts` | 158 | keep | — |
| 382 | `tests/main-street/synergy-visuals.test.ts` | 382 | keep | — |
| 383 | `tests/main-street/tfModuleLoader.test.ts` | 63 | keep | — |
| 384 | `tests/main-street/tier-catalog-coverage.test.ts` | 61 | keep | — |
| 385 | `tests/main-street/tier-family-balance.test.ts` | 104 | keep | — |
| 386 | `tests/main-street/tier-synergy-balance.test.ts` | 139 | keep | — |
| 387 | `tests/main-street/transcript-autosave.integration.test.ts` | 244 | keep | — |
| 388 | `tests/main-street/transcript-recording.test.ts` | 82 | keep | — |
| 389 | `tests/main-street/turn-cash-net.test.ts` | 522 | keep | — |
| 390 | `tests/main-street/turn-cash-repro.test.ts` | 345 | keep | — |
| 391 | `tests/main-street/turnflow.test.ts` | 1087 | keep | — |
| 392 | `tests/main-street/tutorial-action-economy.test.ts` | 178 | keep | — |
| 393 | `tests/main-street/tutorial-choice-exclusion.test.ts` | 72 | keep | — |
| 394 | `tests/main-street/tutorial-flow-integration.test.ts` | 167 | keep | — |
| 395 | `tests/main-street/tutorial-flow.test.ts` | 231 | keep | — |
| 396 | `tests/main-street/tutorial-i18n.test.ts` | 201 | keep | — |
| 397 | `tests/main-street/tutorial-layout-resolution.test.ts` | 644 | keep | — |
| 398 | `tests/main-street/tutorial-offer-modal.test.ts` | 181 | keep | — |
| 399 | `tests/main-street/tutorial-scenario.test.ts` | 360 | keep | — |
| 400 | `tests/main-street/tutorial-setup-path.test.ts` | 537 | keep | — |
| 401 | `tests/main-street/tutorial-state.test.ts` | 482 | keep | — |
| 402 | `tests/main-street/tutorial-text-updates.test.ts` | 385 | keep | — |
| 403 | `tests/main-street/undo-redo-animator.test.ts` | 127 | keep | — |
| 404 | `tests/main-street/undo-redo-button-state.browser.test.ts` | 252 | keep | — |
| 405 | `tests/main-street/undo-redo.browser.test.ts` | 221 | keep | — |
| 406 | `tests/main-street/upgrade-action-economy.test.ts` | 387 | keep | — |
| 407 | `tests/main-street/upgrade-display-name-variant.test.ts` | 114 | keep | — |
| 408 | `tests/main-street/upgrade-drag-drop.browser.test.ts` | 419 | keep | — |
| 409 | `tests/main-street/upgrade-hand-flow.browser.test.ts` | 457 | keep | — |
| 410 | `tests/main-street/upgrade-level-up-animator.test.ts` | 166 | keep | — |
| 411 | `tests/main-street/upgrade-level-up.browser.test.ts` | 173 | keep | — |
| 412 | `tests/main-street/upgrade-overlay-spec.test.ts` | 189 | keep | — |
| 413 | `tests/main-street/upgraded-card-rendering.test.ts` | 148 | keep | — |
| 414 | `tests/main-street/upgrades.test.ts` | 586 | keep | — |
| 415 | `tests/main-street/walk-on-applicant-gating.test.ts` | 168 | keep | — |
| 416 | `tests/release-windows/cli.test.ts` | 71 | keep | — |
| 417 | `tests/release-windows/helpers.test.ts` | 104 | keep | — |
| 418 | `tests/replay/adapters.test.ts` | 630 | keep | — |
| 419 | `tests/replay/replay.test.ts` | 491 | keep | — |
| 420 | `tests/rule-engine/EconomyLedger.test.ts` | 946 | keep | — |
| 421 | `tests/rule-engine/LegalityResult.test.ts` | 207 | clean-up | type-level/structural-only |
| 422 | `tests/scripts/check-browser-test-env.test.ts` | 203 | keep | — |
| 423 | `tests/scripts/contact-sheet.test.ts` | 187 | keep | — |
| 424 | `tests/scripts/dev-server-cleanup.test.ts` | 250 | remove | self-referential simulation |
| 425 | `tests/scripts/dev-server-utils.test.ts` | 211 | keep | — |
| 426 | `tests/scripts/generate-card-csv.test.ts` | 172 | keep | — |
| 427 | `tests/scripts/vite-transcript-plugin.test.ts` | 245 | keep | — |
| 428 | `tests/scripts/vitest-run-with-retry.test.ts` | 339 | keep | — |
| 429 | `tests/smoke.phaser4.browser.test.ts` | 14 | keep | low-value (watch-list) |
| 430 | `tests/sushi-go-icons.test.ts` | 19 | keep | — |
| 431 | `tests/sushi-go-wasabi.test.ts` | 54 | keep | — |
| 432 | `tests/sushi-go/AiStrategy.test.ts` | 245 | keep | — |
| 433 | `tests/sushi-go/SushiGoCards.test.ts` | 165 | keep | — |
| 434 | `tests/sushi-go/SushiGoChopsticksScene.test.ts` | 199 | keep | — |
| 435 | `tests/sushi-go/SushiGoConstants.test.ts` | 283 | keep | — |
| 436 | `tests/sushi-go/SushiGoGame.test.ts` | 367 | keep | — |
| 437 | `tests/sushi-go/SushiGoIcons.browser.test.ts` | 75 | keep | — |
| 438 | `tests/sushi-go/SushiGoOverlay.browser.test.ts` | 708 | keep | — |
| 439 | `tests/sushi-go/SushiGoPudding.browser.test.ts` | 72 | keep | — |
| 440 | `tests/sushi-go/SushiGoScoring.test.ts` | 297 | keep | — |
| 441 | `tests/sushi-go/SushiGoTableauRendering.browser.test.ts` | 368 | keep | — |
| 442 | `tests/sushi-go/SushiGoZOrder.browser.test.ts` | 148 | keep | — |
| 443 | `tests/sushi-go/tableau.test.ts` | 83 | keep | — |
| 444 | `tests/test-workflow-safety.test.ts` | 27 | keep | — |
| 445 | `tests/ui/CardDesign.browser.test.ts` | 164 | keep | — |
| 446 | `tests/ui/CardDesign.test.ts` | 184 | keep | — |
| 447 | `tests/ui/CardGameScene.test.ts` | 612 | keep | — |
| 448 | `tests/ui/CardGameSceneUndoRedoPositions.browser.test.ts` | 116 | keep | — |
| 449 | `tests/ui/CardTextureHelpers.test.ts` | 129 | keep | — |
| 450 | `tests/ui/GameOverOverlay.test.ts` | 377 | keep | — |
| 451 | `tests/ui/GameSelectorScene.test.ts` | 770 | keep | — |
| 452 | `tests/ui/HelpPanel.browser.test.ts` | 246 | keep | — |
| 453 | `tests/ui/HelpPanel.test.ts` | 62 | keep | — |
| 454 | `tests/ui/HighlightManager.test.ts` | 414 | keep | — |
| 455 | `tests/ui/HintBar.test.ts` | 154 | keep | — |
| 456 | `tests/ui/ListenerLeaks.browser.test.ts` | 125 | keep | — |
| 457 | `tests/ui/MainStreetMigration.browser.test.ts` | 318 | keep | — |
| 458 | `tests/ui/Overlay.test.ts` | 326 | keep | — |
| 459 | `tests/ui/OverlayManager.test.ts` | 125 | keep | — |
| 460 | `tests/ui/ParameterizedOverlay.test.ts` | 78 | keep | — |
| 461 | `tests/ui/PhaseManager.test.ts` | 282 | keep | — |
| 462 | `tests/ui/ReducedMotion.test.ts` | 215 | keep | — |
| 463 | `tests/ui/SceneHeader.test.ts` | 309 | keep | — |
| 464 | `tests/ui/SettingsPanel.test.ts` | 148 | keep | — |
| 465 | `tests/ui/SettingsPanelTooltips.browser.test.ts` | 264 | keep | — |
| 466 | `tests/ui/SettingsPanelVersion.browser.test.ts` | 182 | keep | — |
| 467 | `tests/ui/SettingsStore.test.ts` | 90 | keep | — |
| 468 | `tests/ui/Slider.test.ts` | 415 | keep | — |
| 469 | `tests/ui/TooltipManager.browser.test.ts` | 152 | keep | — |
| 470 | `tests/ui/TooltipManager.test.ts` | 243 | keep | — |
| 471 | `tests/ui/createCardGame.test.ts` | 193 | keep | — |
| 472 | `tests/ui/dealCard.test.ts` | 118 | keep | — |
| 473 | `tests/ui/debug/AiDecisionOverlay.test.ts` | 115 | keep | — |
| 474 | `tests/ui/discardCard.test.ts` | 453 | keep | — |
| 475 | `tests/ui/dragDrop.browser.test.ts` | 206 | keep | — |
| 476 | `tests/ui/dragDrop.test.ts` | 547 | keep | — |
| 477 | `tests/ui/flipCard.test.ts` | 354 | keep | — |
| 478 | `tests/ui/handView.animation.test.ts` | 1039 | keep | — |
| 479 | `tests/ui/handView.centerX.test.ts` | 571 | keep | — |
| 480 | `tests/ui/handView.outlines.test.ts` | 968 | keep | — |
| 481 | `tests/ui/handView.raise.test.ts` | 476 | keep | — |
| 482 | `tests/ui/handView.spacing.test.ts` | 96 | keep | — |
| 483 | `tests/ui/handView.test.ts` | 2325 | keep | — |
| 484 | `tests/ui/hud-layer-contract.browser.test.ts` | 142 | keep | — |
| 485 | `tests/ui/layoutCardPositions.test.ts` | 254 | keep | — |
| 486 | `tests/ui/moveGameObject.test.ts` | 82 | keep | — |
| 487 | `tests/ui/pileView.faceUp.test.ts` | 371 | keep | — |
| 488 | `tests/ui/pileView.test.ts` | 358 | keep | — |
| 489 | `tests/ui/placeCard.test.ts` | 120 | keep | — |
| 490 | `tests/ui/popTextOrIcon.test.ts` | 82 | keep | — |
| 491 | `tests/ui/renderer.test.ts` | 723 | keep | — |
| 492 | `tests/ui/sceneTransition.test.ts` | 72 | keep | — |
| 493 | `tests/ui/screen-layout-compose.test.ts` | 191 | keep | — |
| 494 | `tests/ui/screen-layout-dimensions.test.ts` | 544 | keep | — |
| 495 | `tests/ui/screen-layout-mapping.test.ts` | 135 | keep | — |
| 496 | `tests/ui/screen-layout-schema.test.ts` | 92 | keep | — |
| 497 | `tests/ui/selection.test.ts` | 89 | keep | — |
| 498 | `tests/ui/shakeIllegalMove.test.ts` | 286 | keep | — |
| 499 | `tests/ui/tokenPileView.test.ts` | 395 | keep | — |
| 500 | `tests/vite-config.test.ts` | 53 | keep | — |
| 501 | `tests/vite-transcript-plugin-regression.test.ts` | 211 | keep | — |


## Appendix B — Reproducing this audit

Run `/skill:test-review` (see `.pi/skills/test-review/SKILL.md`) to re-run the probes, regenerate the classification table, and diff the inventory against this report. The report format and child-work-item convention are documented in the skill.
