#!/usr/bin/env bash
# Run the Main Street Tutorial E2E tests in separate vitest workspace projects.
#
# Each part runs as its own workspace project with its own browser instance,
# preventing canvas/GPU context exhaustion from sequential Phaser game
# create/destroy cycles.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

# Fast-fail pre-check: the tutorial E2E parts below run in headless
# Chromium via Playwright. Detect a missing prerequisite up front
# (launch-free, <2s) and print the exact remediation commands instead of
# failing with an opaque Vitest browser error. Non-zero exit aborts under
# set -euo pipefail. See CG-0MSJ7ZXD5005N9E5.
echo "=== Browser Test Env Pre-check ==="
npx tsx scripts/check-browser-test-env.ts
echo ""

for part in part1 part2 part4 part5 part6 part3; do
  echo "=== Tutorial E2E ${part} ==="
  npx vitest run --project "tutorial-${part}" 2>&1 | grep -E "^===|^( ✓| ×| Test )|Tests|Test Files|FAIL"
  echo ""
done
