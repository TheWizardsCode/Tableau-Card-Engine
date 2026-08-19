---
name: release-windows
description: "Promote the latest CI-built Windows Setup installer to a draft GitHub Release. Auto-picks the latest successful 'Package Windows Binary' run, downloads its tce-windows-installer artifact, and creates a draft release v<version> with CHANGELOG.md notes for the operator to review and publish. Trigger on queries like: 'create a GitHub release for the Windows installer', 'promote the Windows build to a draft release', 'publish the Windows binary', 'release-windows'."
---

# Release Windows — Agent Skill

## 1. Overview

This skill turns a CI-produced Windows installer into a **draft GitHub Release**
ready for operator review. The project builds `TCE-Setup-<version>.exe` via the
`Package Windows Binary` workflow (`.github/workflows/package.yml`, artifact
`tce-windows-installer`) but has no built-in path to publish it as a GitHub
Release. This skill closes that gap with a repeatable, one-command flow.

**When to use this skill:**

- The operator wants the latest Windows installer available as a GitHub Release
  draft for review and publishing.
- A release draft needs regenerating or re-checking after a new CI run.

**Operator approval model:** creating the **draft** needs no pre-approval — the
draft itself is the approval gate. The operator reviews the draft in the GitHub
UI and clicks **Publish release** to complete the release. This skill never
publishes and never marks a release as pre-release.

**Target audience:** AI agents and the operator invoking `/skill:release-windows`.

## 2. Prerequisites

- `gh` CLI installed and authenticated with `repo` scope (`gh auth status`).
- Run from the repository root (the script resolves `CHANGELOG.md` and
  `package.json` relative to the repo).
- At least one successful `Package Windows Binary` run with a
  `tce-windows-installer` artifact (see `.github/workflows/package.yml`).
- The helper script: `.pi/skills/release-windows/scripts/promote-windows-release.mjs`
  (zero dependencies, plain ESM — no build step required).

## 3. Workflow

Invoke the skill's helper script (Node.js is required):

```bash
# See exactly what would happen without touching origin:
node .pi/skills/release-windows/scripts/promote-windows-release.mjs --dry-run

# Create the draft release:
node .pi/skills/release-windows/scripts/promote-windows-release.mjs
```

The script performs these steps (mirroring the `--dry-run` output):

1. **Auto-resolve the run** — `gh run list --workflow package.yml --status success --limit 1 --json databaseId` picks the latest successful `Package Windows Binary` run; no manual run ID is required. If none exists, it stops with a clear message (exit 1).
2. **Download the artifact** — `gh run download <run-id> --name tce-windows-installer --dir <tmp-dir>` fetches the Windows installer into a temp directory.
3. **Locate the installer** — finds `TCE-Setup-<version>.exe` inside the downloaded artifact (searches recursively; handles both `release/`-nested and flat extraction layouts).
4. **Derive the version** — `v<version>` comes from the artifact filename (`TCE-Setup-<version>.exe`, matching `electron-builder.yml` `artifactName`), not from any other source.
5. **Extract release notes** — the matching `## v<version> (date)` section body is read from `CHANGELOG.md`. If the section is missing, the script falls back to `gh release create --generate-notes` and prints an explicit notice.
6. **Create the draft release** — `gh release create v<version> <exe> --draft` (notes via `--notes-file`, or `--generate-notes` on fallback). The tag is auto-created/reused by `gh` — an existing `v<version>` tag (e.g. created by the ship skill) is reused, never overwritten. The installer is attached as the release asset.
7. **Report the URL** — prints the draft release URL and states that the operator must review and publish it in the GitHub UI to complete the release.

## 4. Dry-run (`--dry-run`)

`--dry-run` prints the exact commands the real run would execute **without
touching origin**: no artifact download, no release/tag creation. It performs
read-only checks only (resolving the latest run, checking for an existing
release). The version shown comes from `package.json` (the artifact is named
from it per `electron-builder.yml`); the real run derives it from the artifact
filename.

```bash
$ node .pi/skills/release-windows/scripts/promote-windows-release.mjs --dry-run
# dry-run: latest successful Package Windows Binary run with a `tce-windows-installer` artifact: run 31609434642
# version (from package.json, artifact filename in real run): 0.1.12
$ gh run download 31609434642 --name tce-windows-installer --dir <tmp-dir>
$ gh release create v0.1.12 <tmp-dir>/tce-windows-installer/release/TCE-Setup-0.1.12.exe --draft --notes-file <tmp-dir>/release-notes.md
```

## 5. Idempotence & safety

- **Existing release:** if a release for `v<version>` already exists, the script
  skips creation and reports the existing release URL (exit 0) — it never
  duplicates.
- **Existing tag:** if only the `v<version>` tag exists (no release), `gh`
  reuses the tag for the draft release (no force/overwrite) and the script
  prints a notice that the tag will be reused.
- **Draft only:** `--draft` is always passed; the script never publishes and
  never passes `--prerelease`.
- **Cleanup:** the temp download directory is removed after the run.

## 6. Error / fallback paths

| Situation | Behaviour |
|-----------|-----------|
| No successful `Package Windows Binary` run | Clear message, exit 1 |
| Download fails / `gh` not authenticated | Error message, exit 1 |
| No `TCE-Setup-<version>.exe` in the artifact | Clear message, exit 1 |
| `CHANGELOG.md` section missing for the version | Falls back to `--generate-notes` with an explicit notice |
| Release creation fails | Error message, exit 1 |
| Release already exists | Skips, reports existing URL, exit 0 |

## 7. Exit codes

- `0` — draft release created, or skipped because a release already exists.
- `1` — fatal (no successful run, download failure, missing installer, release
  creation failure, or unreadable `package.json` during dry-run).

## 8. Conventions & out of scope

- **Windows Setup only:** the `TCE-Setup-<version>.exe` from the
  `tce-windows-installer` artifact. Linux/macOS assets, Steam upload
  integration, and webhook/automation triggers are **out of scope** — record
  them as follow-ups, not additions.
- **`CHANGELOG.md` is read-only** for this skill (the release pipeline manages
  it); notes are extracted, never edited.
- The pure helper functions (`deriveVersionFromFilename`,
  `extractChangelogNotes`, `buildGhReleaseCreateArgs`,
  `extractReleaseUrlFromCreateOutput`) are unit-tested under
  `tests/release-windows/` — keep them side-effect free.
- The operator's final step is always: review the draft in the GitHub UI and
  publish it. The skill reports the draft URL and reminds the operator of this.
