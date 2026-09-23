#!/usr/bin/env bash
# check-terminology-guards.sh — Scan for forbidden day-as-turn tokens in
# player-facing text (tutorial, HUD tooltips, docs).  Exits non-zero when
# violations are found.
#
# Allowed (preserved) tokens — NOT flagged:
#   • Same-day composite terminology: "same-day composite", "same-day placement",
#     "same-day apply", "same-day move+play", "same-day move + play",
#     "same-day premium", "same-day click", "same-day or held",
#     "same-day application", "same-day play", "same-day event",
#     "same-day upgrade composite", "same-day or not"
#   • "next day start" or "→ next day" (phase transition in engine code)
#   • State field names containing justMovedThisDayCardId
#   • Proper names: Day Spa, Rainy Day, Volunteer Day, Farmers Market Day,
#     St Brigid's Day / st brydgis day, May Day / Bealtaine
#   • "Day Phase" (identifier before rename)
#
# Scanned directories:
#   docs/                        (all .md files)
#   example-games/main-street/   (tutorial, UI strings — .ts files)

set -euo pipefail
cd "$(dirname "$0")/.."

violations=0

is_allowed_line() {
  local line="$1"
  # Same-day composite / placement / apply / move + play / move+play / premium
  # / click / application / play / event / upgrade composite / or held / or not
  if echo "$line" | grep -qE 'same-day (composite|placement|apply|move\+play|move \+ play|premium|click|application|play|event|upgrade composite| or held| or not)'; then return 0; fi
  # Phase-transition: "next day start" or "→ next day"
  if echo "$line" | grep -qE 'next day (start|\→| \(EndCheck\)|\.)'; then return 0; fi
  if echo "$line" | grep -qE '\→ next day\b'; then return 0; fi
  # State field name
  if echo "$line" | grep -q 'justMovedThisDayCardId'; then return 0; fi
  # Proper-name business / event cards
  if echo "$line" | grep -qiE 'Day Spa|Rainy Day|Volunteer Day|Farmers Market Day|St Brigid'\''s Day|st brydgis day|May Day|Bealtaine'; then return 0; fi
  # "Day Phase" (identifier before rename — acceptable until renamed)
  if echo "$line" | grep -q 'Day Phase'; then return 0; fi
  # "this day" as part of "this day is/costs/would/grants/uses/spends/holds/remains/starts/ends"
  if echo "$line" | grep -qE 'this day (is|costs|would|grants|uses|spends|holds|remains|starts|ends)'; then return 0; fi
  return 1
}

# Collect files to scan
{
  find docs -name '*.md' -type f 2>/dev/null
  find example-games/main-street -name '*.ts' -type f 2>/dev/null
} | sort -u > /tmp/_termguard_files.txt

# Forbidden patterns (POSIX ERE)
patterns=(
  'day \(or night\) cycle'
  'End the day'
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
      # Extract the actual text (everything after file:linenum:)
      actual_line="${match_line#*:}"
      actual_line="${actual_line#*:}"
      if ! is_allowed_line "$actual_line"; then
        rel_file="${file#./}"
        echo "VIOLATION [$pat]: ${rel_file}"
        echo "  ${match_line}"
        violations=$((violations + 1))
      fi
    done < <(grep -nE "$pat" "$file" 2>/dev/null || true)
  done < /tmp/_termguard_files.txt
done <<< "$(printf '%s\n' "${patterns[@]}")"

rm -f /tmp/_termguard_files.txt

# ---------- result ----------------------------------------------------
echo ""
if [ "$violations" -gt 0 ]; then
  echo "FAIL: $violations forbidden token violation(s) found."
  echo "Review and fix each violation, then re-run this script."
  exit 1
else
  echo "PASS: no forbidden terminology found."
  exit 0
fi
