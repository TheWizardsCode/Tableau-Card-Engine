#!/usr/bin/env bash
# refresh-thumbnails.sh
#
# Refresh all game thumbnails by replaying fixture transcripts to capture
# fresh screenshots and then regenerating thumbnail PNGs from the output.
#
# Usage:
#   ./scripts/refresh-thumbnails.sh           # process all games
#   ./scripts/refresh-thumbnails.sh golf      # process only the listed games
#
# For each game the script:
#   1. Looks for a fixture transcript at tests/fixtures/transcripts/<game>/fixture-game.json
#   2. Runs the replay tool to capture turn-NNN.png screenshots
#   3. Runs the thumbnail generator to produce a 120x68 PNG
#
# Games without a fixture transcript are skipped with a warning.
# The script exits non-zero if any supported game fails during replay or
# thumbnail generation.
#
# Related work item: CG-0MM08TKAO1ETFHNI
# Supersedes: scripts/generate-all-thumbnails.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# All known games (hello-world excluded -- it has no gameplay)
ALL_GAMES=(golf beleaguered-castle lost-cities sushi-go feudalism the-mind)

# If arguments are provided, use those as the game list; otherwise process all
if [[ $# -gt 0 ]]; then
  GAMES=("$@")
else
  GAMES=("${ALL_GAMES[@]}")
fi

# Tracking arrays
refreshed=()
skipped=()
failed=()

echo "=== Refresh Thumbnails ==="
echo ""

for game in "${GAMES[@]}"; do
  fixture="$ROOT_DIR/tests/fixtures/transcripts/$game/fixture-game.json"
  screenshot_dir="$ROOT_DIR/data/screenshots/$game"
  thumbnail_out="$ROOT_DIR/public/assets/games/$game/thumbnail.png"

  # ── Check for fixture transcript ──
  if [[ ! -f "$fixture" ]]; then
    echo "[$game] SKIP -- no fixture transcript at tests/fixtures/transcripts/$game/fixture-game.json"
    skipped+=("$game")
    continue
  fi

  echo "[$game] Replaying fixture transcript..."

  # ── Step 1: Replay to capture screenshots ──
  if ! npx tsx scripts/replay.ts "$fixture" --output "$screenshot_dir" --game "$game" 2>&1; then
    echo "[$game] FAIL -- replay tool exited with an error"
    failed+=("$game")
    continue
  fi

  echo "[$game] Generating thumbnail..."

  # ── Step 2: Generate thumbnail from screenshots ──
  if ! npx tsx scripts/generate-thumbnail.ts "$game" "$screenshot_dir" 2>&1; then
    echo "[$game] FAIL -- thumbnail generation failed"
    failed+=("$game")
    continue
  fi

  echo "[$game] OK -- $thumbnail_out"
  refreshed+=("$game")
  echo ""
done

# ── Summary ──
echo ""
echo "=== Summary ==="
echo "  Refreshed: ${#refreshed[@]}  ${refreshed[*]:-none}"
echo "  Skipped:   ${#skipped[@]}  ${skipped[*]:-none}"
echo "  Failed:    ${#failed[@]}  ${failed[*]:-none}"

if [[ ${#failed[@]} -gt 0 ]]; then
  echo ""
  echo "ERROR: ${#failed[@]} game(s) failed. See output above for details."
  exit 1
fi

echo ""
echo "Done."
