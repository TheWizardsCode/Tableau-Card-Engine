#!/usr/bin/env bash
# CI test runner - runs all test suites with workspace project isolation.
#
# Order:
# 1. Unit tests (Node environment, fast)
# 2. Non-tutorial browser tests
# 3. Tutorial E2E tests (each in own browser context via workspace projects)
#
# The unit and browser steps run through scripts/vitest-run-with-retry.ts, which
# retries once on Vitest's transient contention-induced failures
# ([vitest-worker]: Timeout calling "onTaskUpdate" for the worker RPC layer,
# [vitest] Browser connection was closed while running tests for the browser-mode
# WebSocket drop) — a non-zero exit that happens even when every test passed.
# The retry is masked against genuine failures (see that script's
# shouldRetryOnce). See CG-0MS9M5UJP005PWD3 and CG-0MSCI73RH004VPCE.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

# Fast-fail pre-check: the browser stages below need Playwright's Chromium.
# Detect a missing prerequisite up front (launch-free, <2s) and print the
# exact remediation commands instead of timing out with an opaque Vitest
# browser error. Non-zero exit aborts under set -euo pipefail. See
# CG-0MSJ7ZXD5005N9E5.
echo "=== Browser Test Env Pre-check ==="
npx tsx scripts/check-browser-test-env.ts
echo ""

echo "=== Unit Tests ==="
npx tsx scripts/vitest-run-with-retry.ts --project unit 2>&1 | tail -20
echo ""

echo "=== Browser Tests (non-tutorial) ==="
npx tsx scripts/vitest-run-with-retry.ts --project browser 2>&1 | tail -20
echo ""

echo "=== Tutorial E2E Tests ==="
bash scripts/run-tutorial-tests.sh
echo ""

echo "=== Electron Launch Smoke Test ==="
# Launches the real Electron app (Playwright _electron). Needs a display:
# - Linux CI/dev: xvfb-run when no DISPLAY is set (GitHub ubuntu runners ship xvfb)
# - macOS/Windows: native display available (uname != Linux)
# - Packaged-binary mode: TCE_SMOKE_BINARY=/path/to/exe (built by the CI
#   packaging job) bypasses the display heuristic.
if [ -n "${TCE_SMOKE_BINARY:-}" ]; then
  npx vitest run --project electron 2>&1 | tail -20
elif command -v xvfb-run >/dev/null 2>&1 && [ -z "${DISPLAY:-}" ]; then
  xvfb-run -a npx vitest run --project electron 2>&1 | tail -20
elif [ -n "${DISPLAY:-}" ] || [ "$(uname -s)" != "Linux" ]; then
  npx vitest run --project electron 2>&1 | tail -20
else
  echo "SKIP: no display and xvfb-run unavailable (Linux). Install xvfb or set TCE_SMOKE_BINARY to run the Electron smoke test."
fi
echo ""

echo "=== All Tests Complete ==="
