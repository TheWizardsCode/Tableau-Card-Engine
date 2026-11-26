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
# WebSocket drop, and "Failed to fetch dynamically imported module" for the Vite
# dev server failing to serve a test module under load) — a non-zero exit that
# can happen even when every test passed. The retry is masked against genuine
# failures (see that script's shouldRetryOnce): it qualifies when every file
# passed, or when the summary reports failures but every error is attributable
# to the transient signature (the failed-file variant, CG-0MUIMM28K001W88F). If
# the retry is ALSO a pure transient failure of one of the two original
# signatures the run is accepted as green — no genuine failure was masked
# (CG-0MUF0LU4X006IXXU). A module-fetch failure is deliberately RETRY-ONLY: a
# genuine module-resolution regression is deterministic, so a both-attempts
# module-fetch run keeps the retry's own failing status
# (CG-0MVNDK56G007C1U7). See CG-0MS9M5UJP005PWD3, CG-0MSCI73RH004VPCE and
# CG-0MVNDK56G007C1U7.
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
# are never retried.
#
# Unit bound is HYBRID and load-aware (SA-0MWEURUYL004I470): a 600 s static
# floor scaled up to a 1200 s ceiling by the sampled 1-min load average per
# core (factor = clamp((load1m/cpuCount)/0.75, 1, 2)). Measured green unit
# stages: 88, 96, 106, 111, 128, 141, 147, 149, 206, 217 s (worst 217 s =
# 72 % of the old fixed 300 s bound) — so the unit stage deliberately does
# NOT pass --timeout-ms and lets the runner size its own bound per host. On
# Windows (no load average) the 600 s floor applies.
#
# Browser is pinned at 20 min (1200 s = the hybrid ceiling; 115 files,
# ~13-15 min nominal, longer under heavy concurrent-suite contention — the
# previous 15 min bound sat within normal run-to-run variance and could abort
# an otherwise green stage). Any stage can still be pinned with --timeout-ms,
# which wins verbatim over the computed bound.
#
# Inner bounds must stay strictly inside the outer gate budget
# (.pi/test-config.json timeoutPerCommand = 3000 s). Worst-case arithmetic:
#   unit ceiling 1200 + browser 1200 + two vitest list pre-flights 240
#   = 2640 s of stage bounds; terminology guard + browser-env pre-checks +
#   orchestration ~60 s ⇒ ~2700 s worst case, leaving ~300 s margin so the
#   outer suite_timeout can never truncate a legitimately slow stage (zero
#   slack was the original defect this bound fixes). Raise the outer value in
#   the same change as any inner bound.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

# The test suites exercise every game, so tests always build/test against the
# full preset regardless of the ambient GAMES_CONFIG (which defaults to
# `core-only` for production builds). See scripts/vite-game-discovery-plugin.ts.
export GAMES_CONFIG="${GAMES_CONFIG:-full}"

# Fast-fail pre-check: the terminology guard (one turn = one week). It scans
# docs/**/*.md and example-games/main-street/**.ts for day-as-turn tokens.
# Consuming game repos run this same script from their own suite (e.g. Main
# Street's tests/main-street/terminology-guard.test.ts), so a wording drift
# here reddens their build as soon as their engine pin follows core `dev` —
# which is exactly how `docs/DEVELOPER.md`'s "today" reached a release-shaped
# pin (CG-0MVWFLG8Z005FSH8). Runs in ~1s; keep it ahead of the browser stages.
echo "=== Terminology Guard ==="
bash scripts/check-terminology-guards.sh
echo ""

# Fast-fail pre-check: the browser stages below need Playwright's Chromium.
# Detect a missing prerequisite up front (launch-free, <2s) and print the
# exact remediation commands instead of timing out with an opaque Vitest
# browser error. Non-zero exit aborts under set -euo pipefail. See
# CG-0MSJ7ZXD5005N9E5.
echo "=== Browser Test Env Pre-check ==="
npx tsx scripts/check-browser-test-env.ts
echo ""

echo "=== Unit Tests ==="
# No --timeout-ms: the runner applies the hybrid load-aware unit bound
# (floor 600 s, ceiling 1200 s). Pin explicitly only to override that on a
# specific host.
npx tsx scripts/vitest-run-with-retry.ts --expect-project-coverage --project unit 2>&1
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
