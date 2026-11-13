#!/usr/bin/env bash
# refresh-context-thresholds.sh
#
# Regenerate (or verify) docs/dev/context-budget.thresholds.json from the
# current pi startup-context measurement.
#
# The pre-push context-budget gate (.githooks/pre-push) fails a push when the
# startup context surface exceeds the committed thresholds. Any commit that
# changes AGENTS.md (or skills prose) must refresh the thresholds in the same
# commit — this script does that in one command.
#
# Usage:
#   scripts/refresh-context-thresholds.sh            # write refreshed thresholds
#   scripts/refresh-context-thresholds.sh --check    # verify only, never write
#
# measure_context.py is resolved in exactly the same order as
# .githooks/pre-push resolves it:
#   1. $repo_root/skill/context-audit/scripts/measure_context.py
#   2. $HOME/.pi/agent/skills/context-audit/scripts/measure_context.py
#
# The script exits non-zero (with actionable guidance) when the tooling is
# unavailable, and --check additionally exits non-zero when the committed
# thresholds are stale.
#
# The refresh delta table reports EVERY component present in the measured or
# committed JSON (canonical keys first, any extra key appended), so a component
# added by measure_context.py surfaces in the table instead of drifting
# silently — CG-0MW940SUV002GQCN added `skill_implement_md`.
#
# Related work item: CG-0MUFCL5N50023PHJ

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

MODE="refresh"
if [[ "${1:-}" == "--check" ]]; then
  MODE="check"
elif [[ $# -gt 0 ]]; then
  echo "Usage: $0 [--check]" >&2
  exit 2
fi

THRESHOLDS="$REPO_ROOT/docs/dev/context-budget.thresholds.json"

# ── Resolve measure_context.py (same order as .githooks/pre-push) ───────────
if [[ -f "$REPO_ROOT/skill/context-audit/scripts/measure_context.py" ]]; then
  MEASURE="$REPO_ROOT/skill/context-audit/scripts/measure_context.py"
elif [[ -f "$HOME/.pi/agent/skills/context-audit/scripts/measure_context.py" ]]; then
  MEASURE="$HOME/.pi/agent/skills/context-audit/scripts/measure_context.py"
else
  echo "ERROR: measure_context.py not found — cannot refresh context thresholds." >&2
  echo "  Looked in:" >&2
  echo "    $REPO_ROOT/skill/context-audit/scripts/measure_context.py" >&2
  echo "    $HOME/.pi/agent/skills/context-audit/scripts/measure_context.py" >&2
  echo "  Install the context-audit skill (scripts/install_pi.sh) or provide the" >&2
  echo "  local skill/context-audit/ copy, then re-run this script." >&2
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "ERROR: python3 not found on PATH — cannot measure the context surface." >&2
  exit 1
fi

# --repo-root is passed explicitly (as the hook does): when the global symlink
# is used, the script's default repo-root resolves to the symlink target.
measure_args=(--repo-root "$REPO_ROOT" --include-hidden)

# ── Capture the committed values (for delta reporting / equality check) ─────
committed_json="$(python3 - "$THRESHOLDS" <<'PY'
import json, sys
try:
    with open(sys.argv[1], encoding="utf-8") as fh:
        print(json.dumps(json.load(fh), sort_keys=True))
except Exception:
    print("")
PY
)"

if [[ "$MODE" == "check" ]]; then
  generated_json="$(python3 "$MEASURE" "${measure_args[@]}" --generate-thresholds \
    | python3 -c 'import json, sys; print(json.dumps(json.load(sys.stdin), sort_keys=True))')"
  if [[ -n "$committed_json" && "$generated_json" == "$committed_json" ]]; then
    echo "OK: committed thresholds match the measured startup context surface."
    exit 0
  fi
  echo "STALE: committed thresholds do not match the measured startup context surface." >&2
  echo "  Run: $0" >&2
  echo "  Then commit the updated $THRESHOLDS alongside your change." >&2
  exit 1
fi

# ── Refresh: regenerate the thresholds file and report the delta ────────────
python3 "$MEASURE" "${measure_args[@]}" --write-thresholds "$THRESHOLDS"

refreshed_json="$(cat "$THRESHOLDS")"
python3 - "$committed_json" "$refreshed_json" <<'PY'
import json, sys

before = json.loads(sys.argv[1] or "{}")
after = json.loads(sys.argv[2] or "{}")

# Derive the reported component list from the measured/committed JSON instead
# of a hardcoded key list: canonical components first, then any other key the
# measurement (or the committed file) carries. A component added by
# measure_context.py therefore appears in the delta table — CG-0MW940SUV002GQCN
# added `skill_implement_md`, which a fixed four-key list silently dropped —
# and an unknown/extra key is shown rather than discarded.
CANONICAL_ORDER = ["global_agents", "project_agents", "skills_prose", "total"]
order = [key for key in CANONICAL_ORDER if key in before or key in after]
extras = sorted(
    key for key in set(before) | set(after) if key not in CANONICAL_ORDER
)
order.extend(extras)

print("Refreshed docs/dev/context-budget.thresholds.json")
print(f"  {'component':<20} {'before':>8} {'after':>8} {'delta':>8}")
for key in order:
    b = before.get(key, 0)
    a = after.get(key, 0)
    d = a - b
    sign = "+" if d > 0 else ""
    print(f"  {key:<20} {b:>8} {a:>8} {sign}{d:>7}")
if extras:
    print(
        "  note: non-canonical component(s) reported: " + ", ".join(extras)
    )
PY
