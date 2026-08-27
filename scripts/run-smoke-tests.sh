#!/usr/bin/env bash
# Smoke test runner - rapid feedback during implementation.
#
# Runs one representative test file per game + core engine/UI smoke tests.
# Target: ~30s for 8-10 files.
#
# Usage:
#   bash scripts/run-smoke-tests.sh
#   npx vitest run --project smoke
#
# Test files selected for speed and coverage of critical paths:
#   - MainStreet: MainStreetScene.browser.test.ts (core game flow)
#   - Golf:       GolfScene.browser.test.ts
#   - FC:         FeudalismSmokeTest.browser.test.ts
#   - BC:         BeleagueredCastleOverlay.browser.test.ts
#   - Coloretto:  ColorettoScene.browser.test.ts
#   - Sushi Go:   SushiGoIcons.browser.test.ts
#   - Lost Cities: LostCitiesRoundEnd.browser.test.ts
#   - Core:       SvgHelpers.browser.test.ts
#   - UI:         HelpPanel.browser.test.ts
#   - Gym:        GymSceneSmoke.browser.test.ts (boots all gym scenes)
#
# Tutorial E2E tests are excluded from smoke (too slow for rapid feedback).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

echo "=== Browser Test Env Pre-check ==="
npx tsx scripts/check-browser-test-env.ts
echo ""

echo "=== Smoke Tests ==="
npx tsx scripts/vitest-run-with-retry.ts --project smoke 2>&1 | tail -20
echo ""

echo "=== Smoke Tests Complete ==="
