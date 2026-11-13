#!/bin/sh
# worklog:pre-push-hook:v3
# 1. Enforce branch naming policy: block pushes to protected branches.
# 2. Context-budget regression gate (F6, SA-0MSLK7XNZ00366YY): fail the push
#    when the startup context surface exceeds committed thresholds.
# 3. Scope-aware full-suite gate (RISE-0MVSS1KVV002TJUL): run the FULL suite
#    (run_tests.py --scope full) for a push targeting refs/heads/dev or
#    refs/heads/main, bound to the pushed commit (--gate-commit,
#    SA-0MVTRBT50005DUEH), and refuse the push when it is not green. This hook is
#    the repository's integration checkpoint — implement.py finish validates
#    changed scope only, so the full suite first runs here
#    (SA-0MVECQUGF0064U81). The gate produces the full-suite cache entry the
#    post-push verification and the audit skill read read-only.
# 4. Auto-sync Worklog data before pushing (committed hooks).
#
# Set TEST_SCOPE_SKIP=1 to bypass the full-suite gate (not recommended — it is
#   the only way to skip it).
# Set WORKLOG_SKIP_PRE_PUSH=1 to bypass worklog sync (it does NOT skip the
#   full-suite gate).
# Set BRANCH_POLICY_SKIP=1 to bypass branch policy check (not recommended).
# Set CONTEXT_BUDGET_SKIP=1 to bypass the context-budget gate (not recommended).
#
# Contract and cache-evidence flow: docs/dev/pre-push-hook.md
set -e

# ── Read the pushed refs ONCE, before any exit path ─────────────────────────
# git feeds one line per pushed ref on stdin:
#   <local_ref> <local_sha> <remote_ref> <remote_sha>
# stdin is consumed by the first reader, so capture everything the gates below
# need here — a later `read` would see EOF and silently skip the gate.
#
# need_full_suite: at least one ref targets dev/main and is not a deletion
#   (a ref deletion has an all-zero local sha, so there is no tree to test).
# gated_ref_shas: the <ref>=<sha> pairs the full-suite gate is bound to
#   (the pushed commit is the gate's subject, SA-0MVTRBT50005DUEH).
# skip_worklog_sync: the push carries refs/worklog/data (the sync's own ref;
#   syncing while pushing it would loop).
need_full_suite=0
skip_worklog_sync=0
gated_ref_shas=""
while read local_ref local_sha remote_ref remote_sha; do
  [ -n "$remote_ref" ] || continue
  case "$remote_ref" in
    refs/heads/dev|refs/heads/main)
      case "$local_sha" in
        # All zeros means "delete this ref": nothing to test.
        *[!0]*)
          need_full_suite=1
          gated_ref_shas="$gated_ref_shas $remote_ref=$local_sha"
          ;;
      esac
      ;;
    refs/worklog/data)
      skip_worklog_sync=1
      ;;
  esac
done

# ── Branch policy enforcement ────────────────────────────────────────────────
# Check that the current branch is not a protected branch.
if [ "$BRANCH_POLICY_SKIP" != "1" ]; then
  current_branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
  # Protected branches that agents must never push to.
  blocked_branches="main master HEAD"
  for blocked in $blocked_branches; do
    if [ "$current_branch" = "$blocked" ]; then
      echo "ERROR: Push to '$current_branch' is blocked by branch policy." >&2
      echo "  Regular agents must NOT push directly to main." >&2
      echo "  Work in feature branches (wl-<id>-<desc>) and push into dev." >&2
      echo "  See the framework ship skill for the push-to-dev workflow." >&2
      exit 1
    fi
  done
fi

# ── Context-budget regression gate ──────────────────────────────────────────
# Fail the push when the pi session startup context surface exceeds the
# committed thresholds (docs/dev/context-budget.thresholds.json). The gate is
# fail-open when the tooling or thresholds file is absent (e.g. worktrees of
# old commits, or repositories that do not ship the context-audit skill).
# measure_context.py is resolved first from the local skill/context-audit/
# path, then from the installed global symlink
# (~/.pi/agent/skills/context-audit/scripts/measure_context.py) installed by
# the framework's install_pi.sh.
if [ "$CONTEXT_BUDGET_SKIP" != "1" ]; then
  repo_root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
  if [ -f "$repo_root/skill/context-audit/scripts/measure_context.py" ]; then
    measure="$repo_root/skill/context-audit/scripts/measure_context.py"
  elif [ -f "$HOME/.pi/agent/skills/context-audit/scripts/measure_context.py" ]; then
    measure="$HOME/.pi/agent/skills/context-audit/scripts/measure_context.py"
  else
    measure=""
  fi
  thresholds="$repo_root/docs/dev/context-budget.thresholds.json"
  if [ -n "$repo_root" ] && [ -n "$measure" ] && [ -f "$measure" ] && [ -f "$thresholds" ]; then
    # Pass --repo-root explicitly: when the global symlink is used, the
    # script's default repo-root resolves to the symlink target (the framework
    # checkout) instead of the project being pushed.
    if python3 "$measure" --repo-root "$repo_root" --include-hidden --thresholds "$thresholds" >/dev/null 2>&1; then
      :
    else
      echo "ERROR: Context budget exceeded committed thresholds." >&2
      echo "  Run: python3 $measure --repo-root $repo_root --include-hidden --thresholds $thresholds" >&2
      echo "  See docs/dev/context-budget.md. Set CONTEXT_BUDGET_SKIP=1 to bypass." >&2
      exit 1
    fi
  fi
fi

# ── Cache evidence bridge: mirror worktree gate entries to the main checkout ─
# A linked worktree resolves its test cache inside itself
# (<worktree>/.worklog/cache, else <git-dir>/test-cache — see
# test_cache.cache_dir()), while the post-push verification and the audit
# skill read the MAIN checkout's <main>/.worklog/cache. Without this bridge a
# green gate run leaves no evidence the main checkout can see (AC4,
# RISE-0MVSS1KVV002TJUL; durable fix: SA-0MVEJIRZ60017H4V).
#
# Keys are content-addressed (normalized command + git state), so copying an
# entry the main cache lacks is always safe — an identical key is an identical
# run. An existing entry is never overwritten, and cache plumbing must never
# decide a push: every failure here is a warning.
mirror_suite_cache() {
  wt_root="$1"
  [ -n "$wt_root" ] || return 0
  if [ -d "$wt_root/.worklog" ]; then
    wt_cache="$wt_root/.worklog/cache"
  else
    git_dir="$(git rev-parse --absolute-git-dir 2>/dev/null || true)"
    [ -n "$git_dir" ] || return 0
    wt_cache="$git_dir/test-cache"
  fi
  [ -d "$wt_cache" ] && [ -n "$(ls -A "$wt_cache" 2>/dev/null)" ] || return 0

  common_dir="$(git rev-parse --git-common-dir 2>/dev/null || true)"
  [ -n "$common_dir" ] || return 0
  case "$common_dir" in
    /*) main_git_dir="$common_dir" ;;
    *) main_git_dir="$wt_root/$common_dir" ;;
  esac
  main_root="$(dirname "$main_git_dir")"
  # Same checkout (a main-checkout push): the entries are already in place.
  [ "$main_root" != "$wt_root" ] || return 0
  [ -d "$main_root/.worklog" ] || return 0
  main_cache="$main_root/.worklog/cache"
  mkdir -p "$main_cache" 2>/dev/null || return 0

  for entry in "$wt_cache"/*; do
    [ -d "$entry" ] || continue
    name="$(basename "$entry")"
    [ -e "$main_cache/$name" ] && continue
    if cp -a "$entry" "$main_cache/$name" 2>/dev/null; then
      echo "pre-push: mirrored gate cache entry $name into $main_cache" >&2
    else
      echo "pre-push: warning: could not mirror cache entry $name into $main_cache" >&2
    fi
  done
  return 0
}

# ── Scope-aware full-suite gate (RISE-0MVSS1KVV002TJUL) ─────────────────────
# Runs for pushes targeting dev/main only; partial runs are never full-suite
# evidence, so the gate always runs scope=full. No timeout or concurrency
# mechanism is introduced here: run_tests.py applies .pi/test-config.json's
# timeoutPerCommand per command and acquires the shared host test semaphore.
#
# The gate is bound to the pushed commit (SA-0MVTRBT50005DUEH): the runner is
# given --gate-commit <sha>, resolves a clean checkout whose HEAD is exactly
# that commit (the push cwd when it qualifies, else any clean `git worktree
# list` checkout), and refuses when none holds it. So "the dev push
# succeeded" means the full suite ran against the commit that landed.
if [ "$need_full_suite" = "1" ] && [ "$TEST_SCOPE_SKIP" != "1" ]; then
  repo_root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
  runner=""
  if [ -n "$repo_root" ] && [ -f "$repo_root/skill/test/scripts/run_tests.py" ]; then
    # Repo-local runner (repos that vendor the framework skills).
    runner="$repo_root/skill/test/scripts/run_tests.py"
  elif [ -n "$HOME" ] && [ -f "$HOME/.pi/agent/skills/test/scripts/run_tests.py" ]; then
    # Installed global runner (install_pi.sh); this repository's layout.
    runner="$HOME/.pi/agent/skills/test/scripts/run_tests.py"
  fi

  if [ -z "$runner" ]; then
    echo "ERROR: run_tests.py not found — cannot run the full-suite gate for a dev/main push." >&2
    echo "  Looked for: <repo>/skill/test/scripts/run_tests.py and" >&2
    echo "              \$HOME/.pi/agent/skills/test/scripts/run_tests.py" >&2
    echo "  Install the framework skills (scripts/install_pi.sh), then re-push." >&2
    echo "  Set TEST_SCOPE_SKIP=1 to bypass (not recommended)." >&2
    exit 1
  fi

  # The gate binds its verdict to one commit, so a runner predating
  # --gate-commit cannot be used: refuse with an actionable message instead of
  # letting argparse fail the push opaquely (AC3).
  if ! grep -q -- "--gate-commit" "$runner" 2>/dev/null; then
    echo "ERROR: the resolved run_tests.py predates --gate-commit." >&2
    echo "  Runner: $runner" >&2
    echo "  The dev/main full-suite gate must bind to the pushed commit." >&2
    echo "  Upgrade the framework skills (scripts/install_pi.sh) or the repo-local runner." >&2
    echo "  Set TEST_SCOPE_SKIP=1 to bypass (not recommended)." >&2
    exit 1
  fi

  # One suite can evidence one commit. A push carrying several different
  # dev/main commits would need a run per commit (the gate must not run more
  # than one full suite), so refuse and let the pusher split the push (AC2).
  gate_commit=""
  for entry in $gated_ref_shas; do
    entry_sha="${entry#*=}"
    if [ -z "$gate_commit" ]; then
      gate_commit="$entry_sha"
    elif [ "$gate_commit" != "$entry_sha" ]; then
      echo "ERROR: pre-push gate cannot evidence one suite for several pushed commits." >&2
      echo "  pushed:" >&2
      for ref_entry in $gated_ref_shas; do
        echo "    ${ref_entry%%=*} ${ref_entry#*=}" >&2
      done
      echo "  The full-suite gate runs at most one suite and binds it to one commit." >&2
      echo "  Recovery: push the dev/main refs one at a time (one commit per push)." >&2
      echo "  Escape hatch (explicit, not recommended): TEST_SCOPE_SKIP=1 or git push --no-verify." >&2
      exit 1
    fi
  done

  gate_err="${TMPDIR:-/tmp}/rise-pre-push-test-gate.$$.err"
  echo "pre-push: full-suite gate for a dev/main push — running run_tests.py --scope full --strict-git-env --gate-commit $gate_commit" >&2
  # `set -e` is disabled for commands in an `if` condition: the gate's own
  # non-zero exit is a verdict, not a hook failure, so it is classified below.
  if python3 "$runner" --scope full --strict-git-env --json \
    --project-root "$repo_root" --gate-commit "$gate_commit" \
    >"$gate_err" 2>&1; then
    gate_status=0
  else
    gate_status=$?
  fi
  # Surface the runner's gate provenance/refusal lines: which state was
  # validated, and executed-vs-cached (AC3/AC4).
  grep '^run_tests: gate-' "$gate_err" >&2 || true
  if [ "$gate_status" -eq 0 ]; then
    echo "pre-push: full suite green (cached runs make repeat pushes cheap)" >&2
    # Mirror the cache of the checkout the gate actually resolved (it may be a
    # worktree other than this one) into the main checkout's cache (AC4).
    gate_root="$(sed -n 's/^run_tests: gate-root //p' "$gate_err" | head -1)"
    mirror_suite_cache "${gate_root:-$repo_root}"
    rm -f "$gate_err"
  else
    echo "ERROR: Full test suite failed — pushes to dev/main require a green suite." >&2
    echo "  gated commit: $gate_commit${gated_ref_shas:+ (from:$gated_ref_shas)}" >&2
    if [ -s "$gate_err" ]; then
      echo "--- run_tests.py output (tail) ---" >&2
      tail -n 40 "$gate_err" >&2 || true
      echo "--- end of run_tests.py output ---" >&2
    fi
    rm -f "$gate_err"
    echo "  Run: python3 \"$runner\" --scope full  (or implement.py finish) and fix the failures." >&2
    echo "  Set TEST_SCOPE_SKIP=1 to bypass (not recommended)." >&2
    exit 1
  fi
fi

# ── Worklog sync ─────────────────────────────────────────────────────────────
if [ "$WORKLOG_SKIP_PRE_PUSH" = "1" ]; then
  echo "worklog: pre-push sync skipped (WORKLOG_SKIP_PRE_PUSH=1)" >&2
  exit 0
fi

# Skip when running inside a temp worktree created by withTempWorktree
# for internal sync operations. These worktrees don't have worklog
# initialized and the push is already done with --no-verify as defense.
case "$PWD" in
  *tmp-worktree-*)
    exit 0
    ;;
esac

# Skip when inside a git worktree (not the main checkout).
# Worktrees are for feature development and typically don't have worklog
# initialized. The sync should run from the main checkout. This early exit is
# deliberately AFTER the full-suite gate: a dev push from an implement
# worktree must still be gated (RISE-0MVSS1KVV002TJUL AC3).
if [ "$(git rev-parse --git-dir 2>/dev/null)" != "$(git rev-parse --git-common-dir 2>/dev/null)" ]; then
  echo "worklog: pre-push sync skipped (linked worktree; sync from the main checkout)" >&2
  exit 0
fi

# A refs/worklog/data-only push skips the sync to avoid infinite loops.
if [ "$skip_worklog_sync" = "1" ]; then
  exit 0
fi

if command -v wl >/dev/null 2>&1; then
  WL=wl
elif command -v worklog >/dev/null 2>&1; then
  WL=worklog
else
  echo "worklog: wl/worklog not found; skipping pre-push sync" >&2
  exit 0
fi

# Force the data branch to refs/worklog/data regardless of config.
# This prevents the sync from accidentally pushing to a standard branch
# if the user has overridden syncBranch in their worklog config.
"$WL" sync --git-branch refs/worklog/data || {
  echo "worklog: pre-push sync failed (pushing anyway)" >&2
  exit 0
}
exit 0
