---
type: source
title: "Observation: Pre-push hook worklog sync conflicts in worktrees"
tags:
  - git
  - worktree
  - pre-push
  - worklog
status: observation
created: 2026-08-08
updated: 2026-08-08
slug: obs-2026-08-08-pre-push-hook-worklog-sync-conflicts-in-worktrees
relevance: medium
observed_at: 2026-08-08T23:24:11.257Z
source_context: Pushing CG-0MSKU0BE5003I2ZD to dev from worktree
---

# 🔍 Observation: Pre-push hook worklog sync conflicts in worktrees

Pushing from an implement-skill worktree to dev failed at the pre-push hook: .githooks/pre-push runs `wl sync`, which errors with "Cross-project sync blocked: data file ... belongs to git repository <main>, but this command is running inside <worktree>" (WL-0MSAH26DD001XXST). The hook documents the bypass: WORKLOG_SKIP_PRE_PUSH=1 git push origin HEAD:refs/heads/dev. Safe when the worklog data is unchanged (wl writes resolve to the main repo's .worklog). Worktree has no .worklog/ dir.

*Relevance: medium*
*Context: Pushing CG-0MSKU0BE5003I2ZD to dev from worktree*
*Tags: git worktree pre-push worklog*

---
*Observed: 2026-08-08T23:24:11.257Z*
