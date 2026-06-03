# Ralph Infinite Loop RCA: implement→audit Cycle on Already-Completed Work Items

**Project:** Tableau Card Engine — `~/projects/Tableau-Card-Engine`
**Target work item:** Implement Main Street Milestone 6 (CG-0MOY7Y56Q009MDTM)
**Date:** 2026-06-02

## Summary

On 2026-06-02, Ralph was launched against work item **CG-0MOY7Y56Q009MDTM** (Implement Main Street Milestone 6) with `--model-source remote`. Over 5 hours 19 minutes, Ralph completed 2 of 6 child items but then entered an infinite implement→audit loop on the second child, cycling approximately **14 times** without making progress. The loop was manually terminated by the operator.

## Timeline

| Event | Time (UTC) | Elapsed |
|-------|------------|---------|
| Ralph launched (PID 30570) | 19:03:43 | 0h 00m |
| Begin work on CG-0MPWZ5R1M001MZ3B (Test MarketOfferEngine Extraction) | ~19:03 | ~0h 00m |
| 5 implement→audit cycles on CG-0MPWZ5R1M001MZ3B | 19:03 → ~19:16 | ~0h 13m |
| Completed CG-0MPWZ5R1M001MZ3B at `in_review` | ~19:16 | ~0h 13m |
| Begin work on CG-0MPWZ5RFI001DJUA (Test EconomyLedger Extraction) | ~19:16 | ~0h 13m |
| **Loop starts** — 9 implement→audit cycles on CG-0MPWZ5RFI001DJUA | 19:16 → 00:23+ | ~5h 07m |
| Manually terminated by operator | ~00:23 | 5h 19m |

## The Infinite Loop Pattern

Each cycle followed this exact pattern:

```
  ┌─────────────────────────────────────────────────┐
  │                                                 │
  │  implement-single (opencode-go/qwen3.6-plus)    │
  │    → Finds work already done                    │
  │    → Verifies all ACs manually                  │
  │    → Updates stage to in_review                 │
  │    → Returns "all complete"                     │
  │         │                                       │
  │         ▼                                       │
  │  audit (opencode-go/glm-5.1)                    │
  │    → Runs /skill:audit                          │
  │    → Cannot find evidence in codebase context   │
  │    → Reports all 5 ACs as "unmet"              │
  │    → Returns evidence as empty/null             │
  │         │                                       │
  │         ▼                                       │
  │  Ralph sees "audit found issues"                │
  │  → Triggers another implement-single cycle      │
  │    with instruction:                             │
  │    "The previous audit found issues.            │
  │     Address all the gaps identified             │
  │     in the audit."                              │
  │                                                 │
  └─────────────────────────────────────────────────┘
```

## Log Evidence

### Cycle Count from Log

**Log file:** `~/.worklog/ralph/CG-0MOY7Y56Q009MDTM.log`
**Absolute path:** `/home/rgardler/projects/Tableau-Card-Engine/.worklog/ralph/CG-0MOY7Y56Q009MDTM.log`

**CG-0MPWZ5R1M001MZ3B** (5 implement + 5 audit cycles):
```
Line  11 — first implement-single
Line 172 — first audit
Line 208 — second implement-single (previous audit found issues)
Line 278 — second audit
Line 315 — third implement-single
Line 423 — third audit
Line 467 — fourth implement-single
Line 534 — fourth audit
Line 561 — fifth implement-single
Line 611 — fifth audit
```
→ Item advanced to `in_review`, Ralph moved to CG-0MPWZ5RFI001DJUA.

**CG-0MPWZ5RFI001DJUA** (9 implement + 9 audit cycles):
```
Line  662 — first implement-single (clean, no prior audit context)
Line  706 — first audit
Line  741 — second implement-single ("previous audit found issues")
Line  846 — second audit
Line  890 — third implement-single
Line  990 — third audit
Line 1022 — fourth implement-single
Line 1068 — fourth audit
Line 1099 — fifth implement-single
Line 1117 — fifth audit
Line 1169 — sixth implement-single
Line 1298 — sixth audit
Line 1325 — seventh implement-single
Line 1378 — seventh audit
Line 1407 — eighth implement-single
Line 1457 — eighth audit
Line 1490 — ninth implement-single
Line 1551 — ninth audit (last before termination)
```

### Evidence: implement-single Keeps Finding Work Already Done

Every implement-single cycle produced the same conclusion. Example from the first cycle on CG-0MPWZ5RFI001DJUA (`/home/rgardler/projects/Tableau-Card-Engine/.worklog/ralph/CG-0MOY7Y56Q009MDTM.log`, line 662):

```
"Based on my review, the implementation appears solid. Let me verify each
acceptance criterion:

1. Unit tests for get/canApply/apply: ✅ 51 tests covering all three
   semantics for coins, reputation, score
2. Invariant checks: ✅ Underflow guards, deterministic ordering,
   additive semantics, resource independence
3. Integration tests: ✅ Purchase, income, event, full turn, multi-turn,
   score parity, negative economy
4. npm test passes: ✅ 51/51 EconomyLedger tests pass, 2941/2946 full
   suite
5. Documentation: ✅ docs/rule-engine/economy-ledger.md exists, barrel
   exports in place, README references rule-engine docs

All acceptance criteria are met. Now I'll push to dev to complete the
work item."
```

### Evidence: Audit Model Does Not Persist the Structured Report

Contrary to the initial hypothesis, the audit model **does** produce structured reports with evidence and "Ready to close: Yes" in its streaming output. The issue is that it **never persists the audit to the work item** via `wl update --audit-text`.

Ralph's loop works like this:

```
1. Ralph runs: pi -p /skill:audit <item-id>
2. Pi agent produces audit report in its output stream
3. Ralph reads the work item via wl show
4. Ralph checks workItem.audit field
5. If audit is empty → treat as failed attempt → retry
```

The persisted `audit` field on the work item is the **sole signal** Ralph uses to determine audit success. Without it, Ralph always retries.

**Evidence from work item CG-0MPWZ5RFI001DJUA** (the item that looped):
```
audit field:   MISSING
auditText field: MISSING
Comments:      7 comments (all from implement-single-agent)
               No audit was ever persisted via --audit-text
```

**Evidence from work item CG-0MPWZ5R1M001MZ3B** (the item that Ralph escaped):
```
audit field:   PRESENT
  author: rgardler (human)
  time:   2026-06-02T21:16:25Z
Comments:      1 comment from agent (6 seconds later)
```

The first item was only escapable because a **human** (`rgardler`) manually persisted the audit at `2026-06-02T21:16:25Z`. Ralph found it on the next cycle, parsed "Ready to close: Yes", and moved on. The automated audit skill ran 6 seconds later and added a comment, but never persisted the `audit` field.

### Evidence: implement-single Fills the Gap Incorrectly

Each implement-single cycle independently verified all ACs and concluded the work was complete. The implement model (opencode-go/qwen3.6-plus) then added a **comment** on the work item documenting its findings, but did **not** persist an `audit` field — because that's the audit phase's responsibility, not implementation's.

## Root Cause Analysis

### Primary Cause: The Audit Model Does Not Persist — Ralph Has No Fallback

Ralph delegates audit persistence to the Pi agent running `/skill:audit`. The audit skill's instructions (SKILL.md) state:

> *"When persisting, use the canonical persister script or the runner's built-in persistence option."*

However, the model **opencode-go/glm-5.1** never executes the persistence step. The model produces the structured report in its output stream but never runs:

```
wl update <item-id> --audit-text "Ready to close: Yes\n..."
```

or the canonical runner:

```
python3 skill/audit/scripts/audit_runner.py issue <item-id>
```

The audit SKILL.md provides two canonical persistence mechanisms, but the model does not invoke either.

**Ralph has no fallback.** Ralph's loop logic is:

```python
# Read the persisted audit from the work item via wl show
item = self._wl_show(item_id).get("workItem", {})
audit_field = item.get("audit")
...
if not audit_text:
    # No persisted audit — treat as failed attempt
    remediation = _build_remediation_prompt()
    continue  # → triggers another implement-single cycle
```

If the audit skill did not persist (for any reason — model failure, tool limitation, token exhaustion), Ralph always retries. There is no graceful degradation, timeout, or fallback to reading the Pi agent's output directly.

### Secondary Cause: No Distinction Between "Audit Not Run" and "Audit Found Issues"

Ralph uses a single remediation prompt for both scenarios:

> `"The previous audit found issues. Address all the gaps identified in the audit."`

This prompt fires when:
- The audit phase threw an exception (`except Exception → continue`)
- The audit ran but produced no persisted output (`if not audit_text → continue`)
- The audit produced a report that did not say "Ready to close: Yes" (`if not parsed.ready_to_close → continue`)

All three cases are treated identically, even though "no persisted audit" is fundamentally different from "audit found genuine gaps."

### No Change Detection

Each implement-single cycle found all work already completed, ran `npm test` (all passing), verified docs (all present), and pushed nothing new (branch already on `dev`). Yet Ralph treated each cycle as productive and repeated the full 5–15 minute implementation run, burning tokens on re-verifying work that hadn't changed.

### No Retry Limit on Persistence Failure

Ralph's `max_attempts` (default 10) applies to the implement step, not the audit persistence. Looking at the loop:

```python
try:
    self._run_pi(f"/skill:audit {item_id}", phase="audit")
except Exception:
    if attempt >= max_attempts:
        return {"status": "max_attempts", "attempt": attempt}
    remediation = _build_remediation_prompt()
    continue
```

The exception handler checks `attempt >= max_attempts`, but persistence failure is NOT an exception — Pi completes without error; it just doesn't persist. The code falls through to:

```python
if not audit_text:
    # No persisted audit — treat as failed attempt
    if attempt >= max_attempts:  # ← same check, but this is checked every retry
        return {"status": "max_attempts", ...}
    remediation = _build_remediation_prompt()
    continue
```

The `attempt` counter is incremented on each full implement→audit cycle. But looking at the log: **9 cycles on CG-0MPWZ5RFI001DJUA** with no termination — this suggests `max_attempts` either wasn't reached (default 10) or the attempt counter wasn't being properly incremented for persistence-failure retries.

## Impact

| Metric | Value |
|--------|-------|
| Total runtime | 5h 19m |
| Token waste | ~14 complete implement→audit cycles on already-complete work |
| Work items completed | 2 of 6 (should have been 2 of 6 — wasted cycles didn't regress progress) |
| Work items stuck | 0 progressed past `in_review` for items in the loop |
| Operator intervention | Required manual `kill` to stop the loop |

## Recommendations for Ralph Team

1. **Verify audit persistence after `/skill:audit`**: After running the audit phase, verify that `wl update --audit-text` was actually executed. If no audit text was persisted within a timeout, attempt fallback persistence (e.g., read the Pi output stream and persist the report directly) rather than blindly retrying implementation.

2. **Distinguish "not persisted" from "found issues"**: The `if not audit_text` case means "the audit skill didn't complete its job," not "the audit found real gaps." Treat these differently — log a warning, attempt fallback persistence, or escalate instead of re-running implementation.

3. **Implement retry limits with escalation**: If the same work item receives 3+ cycles where the audit produces output text but never persists, halt and report the stall to the operator. This prevents infinite loops on persistence failures.

4. **Add change detection**: Before starting an implementation cycle, diff the relevant files against the previous cycle. If nothing changed, skip the implementation and proceed to audit or escalate.

5. **Model capability check before loop**: Test whether the configured audit model can execute `wl update --audit-text` before entering the main loop. If it can't, warn the operator or fall back to a model with proven tool-calling ability.

6. **Graceful fallback for audit persistence**: If the audit model produces a valid report in its output stream but doesn't persist it, Ralph should detect this (e.g., by scanning Pi output for `Ready to close:` markers) and persist the report itself as a fallback.

## Configuration at Time of Failure

```json
{
  "model_source": "remote",
  "model": {
    "remote": {
      "intake": "opencode/claude-opus-4.7",
      "planning": "opencode/gpt-5.5",
      "implementation": "opencode-go/qwen3.6-plus",
      "audit": "opencode-go/glm-5.1"
    }
  },
  "timeout": {
    "pi_stream": { "remote": 900 }
  }
}
```
