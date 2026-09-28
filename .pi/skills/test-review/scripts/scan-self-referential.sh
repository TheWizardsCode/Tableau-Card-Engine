#!/usr/bin/env bash
# scan-self-referential.sh — probe for test files that import ZERO production code.
#
# Part of the test-review skill (.pi/skills/test-review/SKILL.md, §4 probe 3).
# A "self-referential simulation" imports no production code and asserts on its
# own local helpers/structure, so it can never catch a production regression.
#
# Notes:
# - Whitespace-tolerant: collapses each file to one line so multi-line imports
#   and dynamic `await import(\n '…')` clauses are caught (a single-line grep
#   misses both).
# - "Production code" = `src/`, `example-games/`, `scripts/`, `electron/`,
#   `.pi/` skills and the `@core-engine|@card-system|@rule-engine|@ai|@ui`
#   aliases.
# - Files listed here need a MANUAL read: many are legitimate integration /
#   subprocess / asset tests that still exercise production behaviour (their
#   discovery is expected; they are not automatically "remove").
#
# Usage: bash .pi/skills/test-review/scripts/scan-self-referential.sh
# Run from the repository root (or pass the tests dir as $1).

TESTS_DIR="${1:-tests}"

find "$TESTS_DIR" -name '*.test.ts' -type f | sort | while read -r f; do
  flat=$(tr '\n' ' ' < "$f")
  if echo "$flat" | grep -qE "(from|import)[[:space:]]*\(?[[:space:]]*['\"](\.\.?/)+(src|example-games|scripts|electron)($|/|[\"']|\.)"; then
    continue
  fi
  if echo "$flat" | grep -qE "from[[:space:]]+['\"]@(core-engine|card-system|rule-engine|ai|ui)/"; then
    continue
  fi
  if echo "$flat" | grep -qE "(from|import)[[:space:]]*\(?[[:space:]]*['\"](\.\.?/)+\.pi/|vite\.config"; then
    continue
  fi
  echo "$f"
done