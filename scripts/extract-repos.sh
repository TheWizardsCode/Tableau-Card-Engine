#!/usr/bin/env bash
#
# extract-repos.sh — decompose the TCE monorepo into the core-engine repo plus
# one repository per example game, preserving git history.
#
# Part of epic CG-0MTR7DLMY008CK17 (F1: CG-0MTRO6P18003AZIZ). The repo
# partition is read from scripts/configs/repo-layout.json — the single source
# of truth shared with the distribution builds (configs/*.json presets, F3).
#
# History preservation uses `git filter-repo` (producer decision: full history,
# not subtree/squashed). filter-repo rewrites the CURRENT repository in place,
# so extraction always operates on a *clone* of the monorepo; the source repo
# is never modified.
#
# Usage:
#   scripts/extract-repos.sh --dry-run              # plan only (no writes)
#   scripts/extract-repos.sh --list                 # list target names
#   scripts/extract-repos.sh                        # extract every target
#   scripts/extract-repos.sh --target golf          # extract one target
#   scripts/extract-repos.sh --out-dir ../tce-repos # where repos are written
#   scripts/extract-repos.sh --source /path/to/repo # monorepo to clone from
#
# Exit codes:
#   0  success (plan printed, or extraction completed)
#   1  bad usage / unknown target / missing dependency during a real run
#
set -euo pipefail

# ── Locate the script and repo ────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LAYOUT_FILE="${SCRIPT_DIR}/configs/repo-layout.json"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

SOURCE_REPO="${REPO_ROOT}"
OUT_DIR="$(cd "${REPO_ROOT}/.." && pwd)"
DRY_RUN=0
MODE="extract"
TARGET=""

usage() {
  cat <<'EOF'
Usage: scripts/extract-repos.sh [options]

Decomposes the TCE monorepo into the core-engine repo plus one repository per
example game, preserving git history via `git filter-repo`.

Options:
  --dry-run            Print the extraction plan without writing anything.
  --list               List extractable target names (one per line) and exit.
  --target <name>      Extract only one target: "core" or a game name
                       (golf, beleaguered-castle, blackjack, sushi-go,
                       feudalism, lost-cities, main-street, coloretto).
  --out-dir <path>     Directory in which to create the extracted repos
                       (default: the monorepo's parent directory).
  --source <path>      Source repository to clone before filtering
                       (default: this monorepo checkout).
  -h, --help           Show this help.

The repo partition is read from scripts/configs/repo-layout.json.

Exit codes: 0 success; 1 bad usage / unknown target / missing dependency.
EOF
}

# ── Argument parsing ──────────────────────────────────────────────────────
if [[ $# -eq 0 ]]; then
  # Usage to stdout: callers (and tests) read the plan/instructions from
  # stdout, and the non-zero exit still signals misuse to scripts.
  usage
  exit 1
fi

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --list) MODE="list" ;;
    --target) TARGET="${2:-}"; shift ;;
    --target=*) TARGET="${1#*=}" ;;
    --out-dir) OUT_DIR="${2:-}"; shift ;;
    --out-dir=*) OUT_DIR="${1#*=}" ;;
    --source) SOURCE_REPO="${2:-}"; shift ;;
    --source=*) SOURCE_REPO="${1#*=}" ;;
    -h|--help) usage; exit 0 ;;
    *)
      echo "error: unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
  shift
done

if [[ ! -f "${LAYOUT_FILE}" ]]; then
  echo "error: layout file not found: ${LAYOUT_FILE}" >&2
  exit 1
fi

# ── Layout parsing (python3 is a project prerequisite) ────────────────────
# Emits tab-separated records; one per repo:
#   <kind>\t<name>\t<slug>\t<remote>\t<comma-separated code paths>\t<comma-separated asset paths>
# Asset paths are relative to public/assets/. Shared assets are enumerated as
# the precise set of shared objects (never a broad parent of a game-owned
# dir, because filter-repo directory includes re-include their children).
layout_records() {
  python3 - "${LAYOUT_FILE}" <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as fh:
    layout = json.load(fh)

game_assets = {
    entry["game"]: list(entry["assets"]) for entry in layout.get("gameAssets", [])
}

def assets_for(kind, name):
    if kind == "core":
        entries = list(layout.get("sharedAssets", []))
        # The legacy root-level SFX set is shared but is NOT a directory
        # include (that would pull in the per-game subdirectories), so the
        # individual files are appended here.
        root_audio = layout.get("notes", {}).get("audioRootShared", [])
        entries += list(root_audio)
        return entries
    return list(game_assets.get(name, []))


core = layout["core"]
print("\t".join([
    "core", core["name"], core["slug"], core.get("remote", ""),
    ",".join(core.get("paths", [])),
    ",".join(assets_for("core", core["name"])),
]))
for game in layout["games"]:
    print("\t".join([
        "game", game["name"], game["slug"], game.get("remote", ""),
        ",".join(game.get("paths", [])),
        ",".join(assets_for("game", game["name"])),
    ]))
PY
}

# ── --list ────────────────────────────────────────────────────────────────
# The core repo's public target name is "core" (its repo name is
# tableau-card-engine-core); game targets keep their game name.
if [[ "${MODE}" == "list" ]]; then
  while IFS=$'\t' read -r kind name _slug _remote _paths _assets; do
    if [[ "${kind}" == "core" ]]; then
      echo "core"
    else
      echo "${name}"
    fi
  done < <(layout_records)
  exit 0
fi

# ── Resolve the requested targets ─────────────────────────────────────────
declare -a TARGET_KINDS=()
declare -a TARGET_NAMES=()
declare -a TARGET_SLUGS=()
declare -a TARGET_REMOTES=()
declare -a TARGET_PATHS=()
declare -a TARGET_ASSETS=()

while IFS=$'\t' read -r kind name slug remote paths assets; do
  [[ -z "${name}" ]] && continue
  # "core" is the public target name for the core repo.
  if [[ -n "${TARGET}" ]]; then
    if [[ "${kind}" == "core" && "${TARGET}" != "core" && "${TARGET}" != "${name}" ]]; then
      continue
    fi
    if [[ "${kind}" != "core" && "${TARGET}" != "${name}" ]]; then
      continue
    fi
  fi
  TARGET_KINDS+=("${kind}")
  TARGET_NAMES+=("${name}")
  TARGET_SLUGS+=("${slug}")
  TARGET_REMOTES+=("${remote}")
  TARGET_PATHS+=("${paths}")
  TARGET_ASSETS+=("${assets}")
done < <(layout_records)

if [[ ${#TARGET_NAMES[@]} -eq 0 ]]; then
  echo "error: unknown target '${TARGET}'. Use --list to see valid targets." >&2
  exit 1
fi

# ── Tool preflight ────────────────────────────────────────────────────────
HAS_FILTER_REPO=0
if git filter-repo --version >/dev/null 2>&1; then
  HAS_FILTER_REPO=1
fi

filter_repo_hint() {
  cat <<'EOF'
Install git filter-repo first:
  pip install git-filter-repo        # or: apt-get install git-filter-repo
Also declare the tool as safe for in-place history rewrites:
  git config --global --add safe.directory '*'
EOF
}

# ── Plan printing ─────────────────────────────────────────────────────────
print_plan() {
  echo "Repo extraction plan (history preserved via git filter-repo)"
  echo "============================================================"
  echo "Source repo: ${SOURCE_REPO}"
  echo "Output dir : ${OUT_DIR}"
  echo "Layout     : ${LAYOUT_FILE}"
  echo "Filter tool: $( [[ ${HAS_FILTER_REPO} -eq 1 ]] && echo 'git filter-repo (available)' || echo 'git filter-repo (NOT INSTALLED)' )"
  echo
  local i
  for i in "${!TARGET_NAMES[@]}"; do
    echo "[${TARGET_KINDS[$i]}] ${TARGET_SLUGS[$i]}"
    echo "    remote: ${TARGET_REMOTES[$i]}"
    echo "    output: ${OUT_DIR}/${TARGET_SLUGS[$i]}"
    if [[ "${TARGET_KINDS[$i]}" == "game" ]]; then
      echo "    rename: example-games/${TARGET_NAMES[$i]}/ -> src/ (Option C)"
    fi
    echo "    paths:"
    local p
    while IFS= read -r p; do
      [[ -n "${p}" ]] && echo "      - ${p}"
    done < <(printf '%s\n' "${TARGET_PATHS[$i]}" | tr ',' '\n')
    if [[ -n "${TARGET_ASSETS[$i]}" ]]; then
      echo "    assets:"
      local a
      while IFS= read -r a; do
        [[ -n "${a}" ]] && echo "      - public/assets/${a}"
      done < <(printf '%s\n' "${TARGET_ASSETS[$i]}" | tr ',' '\n')
    fi
    echo
  done
}

if [[ ${DRY_RUN} -eq 1 ]]; then
  print_plan
  if [[ ${HAS_FILTER_REPO} -eq 0 ]]; then
    echo "NOTE: git filter-repo is not installed; this is a plan only."
    filter_repo_hint
  fi
  echo "Dry run complete; no repositories were written."
  exit 0
fi

# ── Real extraction ───────────────────────────────────────────────────────
if [[ ${HAS_FILTER_REPO} -eq 0 ]]; then
  echo "error: git filter-repo is required for extraction." >&2
  filter_repo_hint >&2
  exit 1
fi

mkdir -p "${OUT_DIR}"

extract_one() {
  local index="$1"
  local kind="${TARGET_KINDS[$index]}"
  local name="${TARGET_NAMES[$index]}"
  local slug="${TARGET_SLUGS[$index]}"
  local remote="${TARGET_REMOTES[$index]}"
  local dest="${OUT_DIR}/${slug}"
  local paths_csv="${TARGET_PATHS[$index]}"
  local assets_csv="${TARGET_ASSETS[$index]}"

  echo "--- Extracting ${slug} -> ${dest}"

  if [[ -e "${dest}" ]]; then
    echo "error: destination already exists: ${dest}" >&2
    exit 1
  fi

  # Build the filter-repo argument list: code paths first, then the
  # (already precise) asset paths. Shared assets are enumerated as exact
  # files/subtrees in the layout — no exclusions are needed, because a broad
  # directory include would re-include game-owned children that filter-repo
  # cannot subtract again.
  local -a filter_args=()
  local p
  while IFS= read -r p; do
    [[ -n "${p}" ]] && filter_args+=(--path "${p}/" --path "${p}")
  done < <(printf '%s\n' "${paths_csv}" | tr ',' '\n')
  local -a asset_args=()
  if [[ -n "${assets_csv}" ]]; then
    local a
    while IFS= read -r a; do
      [[ -z "${a}" ]] && continue
      asset_args+=(--path "public/assets/${a}")
    done < <(printf '%s\n' "${assets_csv}" | tr ',' '\n')
  fi

  # Option C (F9 / C1): a game repo keeps its source at repo-root `src/`.
  # Rename the extracted game tree in place, history-preserving, so the
  # per-game repo has `src/**` instead of `example-games/<game>/**`. This is
  # a single directory rename; the game's own `tests/` and `scripts/` trees
  # stay under `src/` (`src/tests/`, `src/scripts/`).
  local -a rename_args=()
  if [[ "${kind}" == "game" ]]; then
    rename_args+=(--path-rename "example-games/${name}/:src/")
  fi

  # Work on a clone so the source monorepo is never rewritten in place.
  git clone --no-local --quiet "${SOURCE_REPO}" "${dest}"
  git -C "${dest}" filter-repo --force "${rename_args[@]}" "${filter_args[@]}" "${asset_args[@]}"

  if [[ -n "${remote}" ]]; then
    git -C "${dest}" remote add origin "${remote}" 2>/dev/null || true
  fi

  echo "    done: $(git -C "${dest}" rev-list --count HEAD) commits retained"
}

for i in "${!TARGET_NAMES[@]}"; do
  extract_one "${i}"
done

echo
echo "Extraction complete. ${#TARGET_NAMES[@]} repo(s) written to ${OUT_DIR}."
