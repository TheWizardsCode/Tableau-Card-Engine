#!/usr/bin/env bash
# CI test runner - runs all test suites with workspace project isolation.
#
# Order:
# 1. Unit tests (Node environment, fast)
# 2. Non-tutorial browser tests
# 3. Tutorial E2E tests (each in own browser context via workspace projects)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

echo "=== Unit Tests ==="
npx vitest run --project unit 2>&1 | tail -20
echo ""

echo "=== Browser Tests (non-tutorial) ==="
npx vitest run --project browser 2>&1 | tail -20
echo ""

echo "=== Tutorial E2E Tests ==="
bash scripts/run-tutorial-tests.sh
echo ""

echo "=== All Tests Complete ==="
