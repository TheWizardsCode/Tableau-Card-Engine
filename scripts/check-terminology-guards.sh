#!/usr/bin/env bash
# check-terminology-guards.sh — Scan for forbidden day-as-turn tokens in
# player-facing text (tutorial, HUD tooltips, docs) and in-game messages.
# Exits non-zero when violations are found.
#
# Canonical vocabulary (one turn = one week):
#   in-world time is "week" / "this week" / "next week"; the activity-log
#   header remains "Turn N".
#
# Allowed (preserved) tokens — NOT flagged:
#   • Proper names containing "Day": Day Spa, Rainy Day, Volunteer Day,
#     Farmers Market Day, St Brigid's Day / st brydgis day, May Day,
#     Bealtaine.  (These are card/business/event names, not turn synonyms.)
#
# Scanned:
#   docs/                        (all .md files, recursively)
#   example-games/main-street/   (all .ts files — tutorial + in-game messages)

set -euo pipefail
cd "$(dirname "$0")/.."

violations=0

is_allowed_line() {
  local line="$1"
  # The canonical terminology rule itself enumerates the forbidden tokens
  # (docs/main-street/core-rules-and-mechanics.md §1.1). Exempt the rule line.
  if echo "$line" | grep -q '\*\*Do not\*\* use'; then
    return 0
  fi
  # Proper-name business / event cards
  if echo "$line" | grep -qiE "Day Spa|Rainy Day|Volunteer Day|Farmers Market Day|St Brigid's Day|st brydgis day|May Day|Bealtaine"; then
    return 0
  fi
  return 1
}

# Collect files to scan
{
  find docs -name '*.md' -type f 2>/dev/null
  find example-games/main-street -name '*.ts' -type f 2>/dev/null
} | sort -u > /tmp/_termguard_files.txt

# Forbidden patterns (POSIX ERE) — day-as-turn tokens
patterns=(
  'day \(or night\) cycle'
  'End the day'
  'end the day'
  'overnight'
  'this day'
  '\btoday\b'
  '\btomorrow\b'
  '\bnext day\b'
  '\bsame-day\b'
)

while IFS= read -r pat; do
  while IFS= read -r file; do
    [ -z "$file" ] && continue
    [ ! -f "$file" ] && continue
    while IFS= read -r match_line; do
      [ -z "$match_line" ] && continue
      # Strip "file:linenum:" prefix to get the actual source text
      actual_line="${match_line#*:}"
      actual_line="${actual_line#*:}"
      if ! is_allowed_line "$actual_line"; then
        rel_file="${file#./}"
        echo "VIOLATION [$pat]: ${rel_file}"
        echo "  ${match_line}"
        violations=$((violations + 1))
      fi
    done < <(grep -niE "$pat" "$file" 2>/dev/null || true)
  done < /tmp/_termguard_files.txt
done <<< "$(printf '%s\n' "${patterns[@]}")"

rm -f /tmp/_termguard_files.txt

echo ""
if [ "$violations" -gt 0 ]; then
  echo "FAIL: $violations forbidden token violation(s) found."
  echo "Review and fix each violation, then re-run this script."
  exit 1
else
  echo "PASS: no forbidden terminology found."
  exit 0
fi
