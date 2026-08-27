#!/usr/bin/env bash
# Dev test runner - comprehensive but faster than full CI.
#
# Runs smoke tests + key E2E per game. Target: ~3 min.
# Used by the implement/audit workflow for validation.
#
# Usage:
#   bash scripts/run-dev-tests.sh
#   npx vitest run --project dev
#
# Coverage:
#   - All smoke files (see run-smoke-tests.sh)
#   - Main Street: MainStreetScene, drag, undo-redo, overlay, game-over
#   - Golf: GolfScene, GolfInteraction, GolfEvents
#   - FC: FeudalismSmokeTest, FeudalismSelection, FeudalismLayout
#   - BC: BeleagueredCastleOverlay, BeleagueredCastleTurnController, BeleagueredCastleLayout
#   - Sushi Go: SushiGoIcons, SushiGoOverlay, SushiGoTableauRendering
#   - Lost Cities: LostCitiesRoundEnd, LostCitiesOverlayAlignment
#   - Coloretto: ColorettoScene
#   - HandView: gym-handpile-drag, gym-handpile-cancel
#   - Gym: GymOverlayUiScene, GymDeckRngScene (feature + smoke)
#   - Core: SvgHelpers, PhaserEventBridge
#   - UI: HelpPanel, TooltipManager, SettingsPanelTooltips
#   - Helpers: main-street-tutorial-cleanup
#
# Tutorial E2E tests excluded from dev (run in CI only).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

echo "=== Browser Test Env Pre-check ==="
npx tsx scripts/check-browser-test-env.ts
echo ""

echo "=== Dev Tests ==="
npx tsx scripts/vitest-run-with-retry.ts --project dev 2>&1 | tail -20
echo ""

echo "=== Dev Tests Complete ==="
