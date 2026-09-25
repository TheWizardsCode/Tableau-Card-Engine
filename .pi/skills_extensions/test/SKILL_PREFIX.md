# TCE staged-testing policy (`/skill:test --type <profile>`)

This project maps the global test skill's `--type` selector onto TCE's staged
Vitest profiles (see the sibling `extension.json`). Pick the **cheapest
profile that gives trustworthy feedback for the task at hand** — do not run
the full suite during normal implementation.

| Stage | Type | Command profile | Typical runtime | When to use |
|-------|------|-----------------|-----------------|-------------|
| Implement | `unit` | `--project unit` (Node logic/data/integration) | seconds | **Minimum bar** for every change; run frequently while iterating. |
| Quick validation | `smoke` | representative file per game + core/UI browser smoke | ~2 min | Sanity-check a change across games before a longer run. |
| Pre-audit / pre-commit | `dev` | smoke + key E2E per game | ~3.5 min | Validate a work item before requesting an audit or opening a PR. |
| Targeted E2E debugging | `browser` | all non-tutorial browser tests | ~6–8 min | Debug a browser/Phaser regression without the tutorial E2E cost. |
| Targeted E2E debugging | `tutorial` | Main Street tutorial parts, one browser instance each | ~4 min | Debug a tutorial flow in isolation (parts run `part1, part2, part4, part5, part6, part3`). |
| Targeted E2E debugging | `e2e` | every tutorial part plus `replay-e2e` | ~5 min | Full E2E sweep when a change touches recorded/replayed flows. |
| Release / pre-`in_review` | `full` | real CI suite (`npm test`: unit → browser → tutorial E2E → electron) | ~15–20 min | **Only** the pre-`in_review` gate and the release confirmation. |
| Electron | `electron` | display-aware launch smoke (`scripts/run-electron-smoke.sh`) | varies | Electron launcher changes; needs a display or `xvfb-run`. |

## Escalation rule

`unit` during implementation → `smoke` for quick validation → `dev` before an
audit or commit → `browser` / `tutorial` / `e2e` for targeted E2E debugging →
`full` **only** before `in_review` and at release.

- `full` is deliberately omitted from `extension.json`, so a bare
  `/skill:test` (no `--type`) keeps resolving to the genuine full CI suite.
- **Only `--type full` populates the audit-accepted full-suite cache entry.**
  The audit skill consumes that entry read-only to auto-verify
  execution-dependent acceptance criteria; a `unit`/`smoke`/`dev`/`e2e` run
  uses an independent cache key and can never satisfy a "full test suite
  passes" AC.

## Prerequisites

- Browser-dependent profiles (`smoke`, `dev`, `browser`, `tutorial`, `e2e`)
  need Playwright's Chromium. Install it once with:

  ```bash
  npx playwright install chromium
  ```

  Each browser-dependent command chains `scripts/check-browser-test-env.ts`
  first, so a missing prerequisite fails fast with remediation steps instead
  of an opaque Vitest browser timeout.
- The `electron` profile needs a display: `xvfb-run` on headless Linux, a
  native display on macOS/Windows, or `TCE_SMOKE_BINARY=/path/to/exe` for a
  packaged binary.

## Reliability wrapper

Every typed Vitest command runs through `scripts/vitest-run-with-retry.ts`,
which:

- retries once on Vitest's transient contention-induced failures (worker RPC
  timeout / browser WebSocket drop) when every test file actually passed;
- bounds each attempt with a wall-clock timeout and exits `124` with a
  `[hang-timeout]` diagnostic on a true hang (hangs are never retried); and
- emits a final `[vitest-runner] attempts=N status=S outcome=…` line so the
  attempt count survives output truncation.

Commands also load `scripts/vitest-tap-reporter.ts` alongside the default
reporter, so a red typed run emits flat TAP that the global runner triages
per test (rather than an opaque suite-level failure).
