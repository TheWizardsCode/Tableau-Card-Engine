---
name: test-review
description: "Reproducible test-suite value audit for Tableau-Card-Engine. Classifies every *.test.ts file against the six documented low-value anti-patterns (source-code-grep, placeholder/tautological, self-referential simulations, duplicates of core coverage, type-level/structural-only, zero-assertion browser tests), produces the classification table and removal/clean-up list in docs/dev/test-suite-review.md, and creates child work items that carry out the changes. Trigger on queries like: 'review all tests', 'audit the test suite', 're-run the test review', 'test-review'. Precedent audit: CG-0MTCOPO8U001UW2Y (2026-09-20, report at docs/dev/test-suite-review.md)."
---

# Test Review — Agent Skill

## 1. Overview

This skill codifies the **test-suite value audit** for the Tableau Card Engine
(TCE). The suite has grown to ~500 `*.test.ts` files (~145k lines); low-value
tests accumulate silently. This skill makes the audit a repeatable procedure:
run the discovery probes, classify every file, write the report, and convert
each removal/clean-up recommendation into a child work item executed through
the normal implement → audit gate.

**When to use this skill:**

- The producer asks to *review / audit / re-check the test suite*.
- The suite has grown since the last review and needs a fresh pass.
- A previous review needs re-running or diffing (e.g. after more growth).

**What this skill is NOT:**

- Not an executable test runner — it is a **procedure document** (+ optional
  helper scripts).
- Not a code-change tool: the audit itself must **never delete or modify a
  test file**; it produces a report and child work items. The children execute
  the changes.

**Precedent run:** CG-0MTCOPO8U001UW2Y (2026-09-20) reviewed 501 files and
produced `docs/dev/test-suite-review.md` (490 keep / 9 clean-up / 2 remove).
This skill extends that report's continuity item CG-0MS9AGG3N003ASCR (the
2026-07-31 cleanup that introduced the taxonomy).

## 2. Prerequisites

- Run from a **clean checkout of `dev`** (a worktree of the latest `origin/dev`
  is ideal) so the inventory snapshot is unambiguous.
- Record the audit commit: `git rev-parse HEAD`.
- A prior report may be used for diffing:
  `diff <(docs/dev/test-suite-review.md) ...` (see §7).
- Optional helper: `.pi/skills/test-review/scripts/scan-self-referential.sh`
  (whitespace-tolerant probe for files that import zero production code).

## 3. Anti-pattern categories

The taxonomy is reused from CG-0MS9AGG3N003ASCR (fixed list — do not invent
new categories without producer sign-off):

1. **source-code-grep** — asserts over the *text* of `.ts` source files
   (`readFileSync(pathToTsSource)` + `toContain` / regex). Breaks on any
   refactor; never detects behavioural regressions. *Exception:* reading
   **data** files (JSON manifests, SVG/CSV assets, transcripts) is NOT
   source-grep — those are asset/data-integrity tests and are `keep`.
2. **placeholder/tautological** — `expect(true).toBe(true)` (or equivalent)
   with no real assertion. A single defensive fallback (a documented
   environment guard) is tolerated; many branches that are actually dead
   (e.g. a `require()` probe that never resolves a function) make the whole
   file vacuous → `remove`.
3. **self-referential simulation** — imports **zero production code** and
   asserts on its own local helper copies/structure. Detection:
   whitespace-tolerant scan of `from`/`import(` clauses for
   `src/|example-games/|scripts/|electron/` and the `@core-engine|@card-system|@rule-engine|@ai|@ui` aliases.
   *Exceptions:* integration tests that spawn subprocesses / run real CLIs,
   and asset-integrity tests, are legitimate despite no static imports.
4. **duplicates of core coverage** — re-asserts something a deeper
   core-engine test already covers (e.g. a local re-implementation of
   `dev-server-utils` lock-file logic when a real-import test exists).
5. **type-level/structural-only** — asserts factory return shapes / union
   narrowing the TypeScript compiler already enforces (e.g. `void`-ed
   `_assert*` helpers, hand-built literal `{ legal: true }` assertions).
6. **zero-assertion browser tests** — `*.browser.test.ts` with no `expect()`.

## 4. Discovery commands (probes)

Run from `tests/`. The exact probes used in the precedent audit:

```bash
# 0. Inventory (record in the report)
git rev-parse HEAD
find tests -name '*.test.ts' -type f | wc -l
find tests -name '*.test.ts' -type f -exec wc -l {} \; | awk '{s+=$1} END {print s}'

# 1. Placeholder / tautological
grep -rc 'expect(true)\.toBe(true)' tests --include='*.test.ts' | grep -v ':0'

# 2a. Source-code-grep: files reading any file, then confirm .ts targets
grep -rl 'readFileSync' tests --include='*.test.ts'
grep -rln "example-games/[a-zA-Z-]*/.*\.ts['\"]\|src/[a-zA-Z-]*/.*\.ts['\"]" tests --include='*.test.ts'

# 2b. Zero-assertion files (all and browser-only)
find tests -name '*.test.ts' -type f -exec sh -c '! grep -q "expect(" "$1" && echo "$1"' _ {} \;
find tests -name '*.browser.test.ts' -type f -exec sh -c '! grep -q "expect(" "$1" && echo "$1"' _ {} \;

# 3. Self-referential simulations (no production imports, whitespace-tolerant)
bash .pi/skills/test-review/scripts/scan-self-referential.sh

# 4. Duplicates / type-level — manual pass over the flagged files plus:
find tests -name '*.test.ts' -type f -exec basename {} \; | sort | uniq -d   # duplicate basenames
grep -rln "\brequire(" tests --include='*.test.ts'                            # require() probes (broken under Vitest ESM)
```

> **require() probe gotcha (empirical, 2026-09-20):** under Vitest ESM
> (`"type": "module"`), `require()` IS defined but a `require('<rel-path>')`
> of an engine module throws `Cannot find module` (path resolution differs).
> Any test that gates real assertions behind such a probe is **vacuous** —
> verify with a one-off probe and classify `remove`.

## 5. Classification procedure

For each flagged file:

1. Read the file (body + imports).
2. Does a probe fire?
   - No → `keep` (no evidence line needed).
   - Yes → does a manual read confirm the anti-pattern is **material**?
     - No (defensive guard / legitimate integration or asset test) → `keep`,
       with a watch-list note.
     - Yes → `remove` or `clean-up` per §5.1.
3. **Regression-guard rule:** a file that guards a historical regression,
   documented precedent, or carries explicit work-item linkage is `keep`
   UNLESS evidence shows it no longer asserts anything (e.g. the vacuous
   `require()`-probe case). Where such a file uses an anti-pattern, prefer
   `clean-up` (preserve the guard, remove the anti-pattern) — never `remove`.
4. **Conservative default:** ambiguity → `keep`, noted as
   `needs-manual-verification` / watch-list. Prefer a false negative to a
   false removal.

### 5.1 remove vs clean-up

- **`remove`** — the whole file is low-value: entirely placeholder/tautological
  (zero real assertions execute), entirely self-referential, or a byte-for-byte
  duplicate of core coverage.
- **`clean-up`** — the file has value but contains an anti-pattern block:
  strip a source-grep `describe` block, convert a source-grep test to a
  behavioural assertion, delete `void`-ed type-level helpers, extract a
  duplicated content mirror to a shared module, or replace a source-text sweep
  with a lint rule. The guard's intent is preserved.

### 5.2 Browser / E2E files

Value is assessed by **structure + assertion inspection** (every browser file
boots a real Phaser game — treat as genuine unless it has no `expect()`).
Anything uncertain → `keep` with a `needs-manual-verification` note. Full
run-cost triage is out of scope (see CG-0MSZ4TN5Z001JADX).

## 6. Report format

Produce `docs/dev/test-suite-review.md` with:

1. **Metadata:** audit commit hash, working-tree state, file count, line count,
   the report's status line, superceding/extending the prior cleanup item.
2. **Scope & inventory snapshot** — the exact counts and discovery commands.
3. **Files per group** table (`tests/<group>` → files, lines, remove, clean-up).
4. **Anti-pattern scan results** — one row per probe with the files that fired.
5. **Removal recommendations** (§R1…Rn) with file path, line count, category,
   evidence (quote the offending pattern), and confidence.
6. **Clean-up recommendations** (§C1…Cn) with the same detail.
7. **Kept-with-notes / watch-list** table.
8. **Tracking of recommendations** — the child work items with their IDs.
9. **Blockers / resolution** log — anything that interrupted the audit.
10. **Appendix A — Full classification table** — one row per file:
    `# | path | lines | decision | category`. The row count MUST equal the
    inventory count (reconciliation check).
11. **Appendix B — Reproducing this audit** — pointer to this skill.

## 7. Child-work-item creation convention

For each removal/clean-up *group* create one child under the audit parent:

```bash
wl create --parent <PARENT_ID> --issue-type task --priority low --stage idea \
  --title "Test review: <action> <target>" \
  --description "…" --json
```

Description template (goal + why + measurable ACs):

```md
# Goal
<what changes>

# Why
Audit recommendation <ref> (docs/dev/test-suite-review.md §X). <one-line evidence>

# Acceptance criteria
- <file> is deleted / the <block> is removed.
- <targeted test command> is green after the change.
- No remaining references / no production-code semantic change (for clean-ups, the guard is preserved behaviourally).
```

Rules:

- One item per recommendation or clearly-related group (e.g. "strip
  module-isolation grep blocks from 3 core-engine tests").
- **The audit item itself never deletes or modifies tests** — only the
  children do, through the normal implement → audit gate.
- The parent item's diff contains only report + skill + docs.

## 8. Re-running / diffing

- Re-run the probes (§4) on the new commit; compare file count and line count
  against the report's snapshot. Add new files and re-classify.
- `diff` the per-group table and Appendix A row count against the stored
  report to confirm the drift is only the growth delta.
- Update `docs/dev/test-suite-review.md` in place (keep the same section
  structure so diffs stay clean).

## 9. Verification (self-test)

After authoring/updating this skill, exercise the procedure on a subset:

```bash
# AC: discover the same candidates a fresh run finds
grep -rc 'expect(true)\.toBe(true)' tests --include='*.test.ts' | grep -v ':0'
bash .pi/skills/test-review/scripts/scan-self-referential.sh
```

The output must be **stable** (deterministic given the same checkout) so that
a re-run on the same commit reproduces the same classification table. Any
non-determinism (unordered `find` output, absolute paths) must be normalised
before committing the skill.