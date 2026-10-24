#!/usr/bin/env bash
# CI test runner - runs all test suites with workspace project isolation.
#
# Order:
# 1. Unit tests (Node environment, fast)
# 2. Non-tutorial browser tests
# 3. Tutorial E2E tests (each in own browser context via workspace projects)
# 4. Electron launch smoke test (display-aware, via run-electron-smoke.sh)
#
# For faster local feedback during implementation, use the test profiles
# instead of this full suite (see docs/DEVELOPER.md#smoke-tests):
#   npm run test:smoke  # ~2 min, one representative test per game
#   npm run test:dev    # ~3.5 min, smoke + key E2E per game
#
# The unit and browser steps opt into the runner's project-coverage gate
# (--expect-project-coverage, CG-0MVL21CVM003VK5H): before the run the runner
# derives the expected test-file set from a collection-only
# `vitest list --filesOnly --json` over the same project, captures the files
# each attempt actually executed (injected JSON reporter), and fails the stage
# if the sets differ. A run that silently dropped part of the suite (e.g. a
# Vitest group-loop abort after a pool rejection) can no longer be accepted as
# green via the transient path. A pre-flight collection failure fails closed
# (exit 2).
#
# The unit and browser steps run through scripts/vitest-run-with-retry.ts, which
# retries once on Vitest's transient contention-induced failures
# ([vitest-worker]: Timeout calling "onTaskUpdate" for the worker RPC layer,
# [vitest] Browser connection was closed while running tests for the browser-mode
# WebSocket drop) — a non-zero exit that can happen even when every test passed.
# The retry is masked against genuine failures (see that script's
# shouldRetryOnce): it qualifies when every file passed, or when the summary
# reports failures but every error is attributable to the transient signature
# (the failed-file variant, CG-0MUIMM28K001W88F). If the retry is ALSO a pure
# transient failure the run is accepted as green — no genuine failure was
# masked (CG-0MUF0LU4X006IXXU). See CG-0MS9M5UJP005PWD3 and
# CG-0MSCI73RH004VPCE.
#
# The runner retries once when a run is attributable to the transient
# contention signatures and emits a final
# `[vitest-runner] attempts=N status=S outcome=... expected=N ran=M` line after
# every run (expected=unset when no expectation was supplied).
# Stage output is NOT truncated (CG-0MUIMM28K001W88F), so a recurrence names
# the failed test/file and shows any distinct assertion error alongside the
# transient signature instead of only the reporter's summary counts.
#
# The same runner bounds every attempt with a wall-clock timeout
# (CG-0MT08R2QR0070F3N): a true hang — e.g. a browser test whose
# requestAnimationFrame loop is starved of frames under CPU contention, or a
# Phaser game destroy that never completes — is aborted with exit 124 and a
# [hang-timeout] diagnostic instead of stalling the gate indefinitely. Hangs
# are never retried. Bounds: 5 min for unit (nominal <2 min), 20 min for
# browser (115 files; ~13-15 min nominal, longer under heavy concurrent-suite
# contention — the previous 15 min bound sat within normal run-to-run variance
# and could abort an otherwise green stage). Tune with --timeout-ms if needed.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

# The test suites exercise every game, so tests always build/test against the
# full preset regardless of the ambient GAMES_CONFIG (which defaults to
# `core-only` for production builds). See scripts/vite-game-discovery-plugin.ts.
export GAMES_CONFIG="${GAMES_CONFIG:-full}"

# Fast-fail pre-check: the browser stages below need Playwright's Chromium.
# Detect a missing prerequisite up front (launch-free, <2s) and print the
# exact remediation commands instead of timing out with an opaque Vitest
# browser error. Non-zero exit aborts under set -euo pipefail. See
# CG-0MSJ7ZXD5005N9E5.
echo "=== Browser Test Env Pre-check ==="
npx tsx scripts/check-browser-test-env.ts
echo ""

echo "=== Unit Tests ==="
npx tsx scripts/vitest-run-with-retry.ts --expect-project-coverage --project unit --timeout-ms 300000 2>&1
echo ""

echo "=== Browser Tests (non-tutorial) ==="
npx tsx scripts/vitest-run-with-retry.ts --expect-project-coverage --project browser --timeout-ms 1200000 2>&1
echo ""

echo "=== Tutorial E2E Tests ==="
bash scripts/run-tutorial-tests.sh
echo ""

echo "=== Electron Launch Smoke Test ==="
# Display detection is single-sourced in scripts/run-electron-smoke.sh
# (CG-0MUECRMTO0016FH2); its output streams in full (CG-0MUIMM28K001W88F).
bash scripts/run-electron-smoke.sh 2>&1
echo ""

echo "=== All Tests Complete ==="
