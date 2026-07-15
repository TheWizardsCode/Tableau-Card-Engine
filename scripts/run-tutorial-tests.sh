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

for part in part1 part2 part4 part5 part6 part3; do
  echo "=== Tutorial E2E ${part} ==="
  npx vitest run --project "tutorial-${part}" 2>&1 | grep -E "^===|^( ✓| ×| Test )|Tests|Test Files|FAIL"
  echo ""
done
