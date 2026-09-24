# Startup Context Budget

**Audience:** Engine maintainers and agents editing `AGENTS.md` (or the global ruleset)
**Related work:** CG-0MUFCL5N50023PHJ — *AGENTS.md exceeds context-budget threshold, blocking all pushes to dev*
**Gate:** `.githooks/pre-push` → *Context-budget regression gate (F6, SA-0MSLK7XNZ00366YY)*

Every pi session loads a fixed **startup context surface** before the agent sees
the task. That surface is paid for on every session, so TCE commits a byte
budget and enforces it at push time. This document explains what the gate
measures, why an `AGENTS.md` edit requires a threshold refresh in the *same*
commit, and the exact refresh workflow.

---

## What the gate measures

The gate measures the same surface reported at session startup, using the
`context-audit` skill's `measure_context.py`:

| Component | What it counts |
|-----------|----------------|
| `global_agents` | `AGENTS_GLOBAL.md` at the repo root |
| `project_agents` | the project `AGENTS.md` at the repo root |
| `skills_prose` | the frontmatter `description` prose of `skill/*/SKILL.md` (with `--include-hidden`, matching the hook) |
| `total` | the sum of the components above |

The committed budget lives in
[`docs/dev/context-budget.thresholds.json`](context-budget.thresholds.json):

```json
{
  "global_agents": 0,
  "project_agents": 45470,
  "skills_prose": 0,
  "total": 45470
}
```

TCE uses an **exact-match** convention: each threshold equals the measured byte
count, so any growth of the surface is a visible, deliberate commit rather than
silent creep. The gate fails a push when the measured surface **exceeds** a
committed threshold; the guard test additionally fails when the committed and
measured values differ at all.

## Why an `AGENTS.md` edit needs a threshold refresh in the same commit

`AGENTS.md` is the dominant component of the surface. The pre-push hook only
compares against the **committed** thresholds, so if a commit grows `AGENTS.md`
without refreshing the threshold, the next push from *any* agent is rejected —
the breach is now committed at `dev` HEAD and blocks the whole team, not just
the author. That drift class has recurred five times
(`39555 → 41692 → 41706 → 43564 → 45898 → 45470`), which is why the refresh is
a required part of any `AGENTS.md` change and a guard test now catches it
locally.

The gate is intentionally **not** auto-ratcheting: refreshing stays a
deliberate, reviewed, committed act so the budget remains a meaningful signal.

## Refresh workflow

1. Edit `AGENTS.md` (or the skills prose) as normal.
2. Regenerate the thresholds and inspect the reported delta:

   ```bash
   scripts/refresh-context-thresholds.sh
   ```

   This resolves `measure_context.py` in exactly the same order as the pre-push
   hook — local `skill/context-audit/scripts/measure_context.py` first, then the
   global `~/.pi/agent/skills/context-audit/scripts/measure_context.py` — and
   writes the freshly measured byte counts to
   `docs/dev/context-budget.thresholds.json`, printing the before/after/delta
   table.
3. Commit the updated `AGENTS.md` **and**
   `docs/dev/context-budget.thresholds.json` together.
4. Optionally verify without writing:

   ```bash
   scripts/refresh-context-thresholds.sh --check
   ```

   `--check` exits non-zero with the refresh command when the committed
   thresholds are stale, and never rewrites the file. The same check runs in
   the `unit` test profile
   (`tests/scripts/context-budget-thresholds.test.ts`), so drift is caught
   before push.

Equivalent npm scripts are available:

```bash
npm run context:refresh   # = scripts/refresh-context-thresholds.sh
npm run context:check     # = scripts/refresh-context-thresholds.sh --check
```

## Fail-open behaviour

The gate and its guard are **fail-open** when the tooling is absent:

- The pre-push hook skips the check when `measure_context.py` or the thresholds
  file cannot be found (e.g. worktrees of old commits, or repositories without
  the `context-audit` skill).
- The guard test skips with a clear reason when `python3` or
  `measure_context.py` is unavailable, so environments without the global
  `context-audit` skill are not broken.

Bypassing the gate for a one-off push is possible with
`CONTEXT_BUDGET_SKIP=1`, but a committed breach should always be fixed by
refreshing the threshold rather than by bypassing.

## See also

- [Developer Guide — Testing](../DEVELOPER.md#testing)
- [AGENTS.md](../../AGENTS.md) — project and agent guidance
