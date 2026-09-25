#!/usr/bin/env bash
# Electron launch smoke test runner (display-aware).
#
# Launches the real Electron app via Playwright's `_electron`. A display is
# required, selected in this order:
#
# - `TCE_SMOKE_BINARY=/path/to/exe` (built by the CI packaging job) runs the
#   packaged binary and bypasses the display heuristic entirely.
# - Linux with no `DISPLAY` but `xvfb-run` available: run under
#   `xvfb-run -a` (GitHub ubuntu runners ship xvfb).
# - A native display (`DISPLAY` set) or a non-Linux OS (macOS/Windows): run
#   directly.
# - Otherwise: print a SKIP notice and exit 0.
#
# Extracted from `scripts/run-ci-tests.sh` (CG-0MUECRMTO0016FH2) so the
# display heuristic is single-sourced between the full CI suite and the
# `/skill:test --type electron` profile.
#
# Output streams in full (no `tail` truncation) so a typed run's failures stay
# parseable; the human-facing CI wrapper (`run-ci-tests.sh`) applies the
# `tail -20` truncation when it calls this script.
#
# `TCE_SMOKE_DRY_RUN=1` prints the command that would run (or the SKIP notice)
# without executing it — used by the automated selection tests.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

# Print (dry-run) or execute the Electron smoke command.
run_electron() {
  if [ "${TCE_SMOKE_DRY_RUN:-}" = "1" ]; then
    echo "$*"
    return 0
  fi
  "$@"
}

if [ -n "${TCE_SMOKE_BINARY:-}" ]; then
  run_electron npx vitest run --project electron
elif command -v xvfb-run >/dev/null 2>&1 && [ -z "${DISPLAY:-}" ]; then
  run_electron xvfb-run -a npx vitest run --project electron
elif [ -n "${DISPLAY:-}" ] || [ "$(uname -s)" != "Linux" ]; then
  run_electron npx vitest run --project electron
else
  echo "SKIP: no display and xvfb-run unavailable (Linux). Install xvfb or set TCE_SMOKE_BINARY to run the Electron smoke test."
fi
