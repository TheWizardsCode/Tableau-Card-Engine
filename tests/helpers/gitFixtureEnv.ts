/**
 * Hermetic environment for **fixture** `git` commands in tests.
 *
 * `implement.py finish` validates the would-be-commit tree by exporting a
 * temporary `GIT_INDEX_FILE` (a copy of the real index plus the pending change
 * set) for the whole suite run, so the test verdict is attributable to the
 * exact tree that would be committed. Git honours `GIT_INDEX_FILE` over the
 * repository `cwd`, so a fixture that spawns `git` with an inherited
 * environment writes into the *gate's* index instead of its own — and
 * `git worktree add … HEAD` resets that index to `HEAD`'s tree, which wipes
 * the staged change set and makes the gate reject its own evidence
 * (CG-0MVVKUUY50010004):
 *
 * ```
 * gate evidence invalid: the temporary index changed while the suite ran
 * (tested tree c07044e7…, index now 86050dff…).
 * ```
 *
 * This is the TypeScript counterpart of the Python
 * `shared.git_sandbox.fixture_git_env()` contract: a fixture `git` invocation
 * must not inherit repository-override variables, and must never inherit an
 * ambient `GIT_INDEX_FILE`. Tests that deliberately target their own index
 * pass it explicitly (an explicit `env` value wins over the stripped base).
 *
 * @module
 */

/**
 * Variables that redirect `git` at a different repository than `cwd`.
 *
 * Mirrors `REPOSITORY_OVERRIDE_ENV_VARS` in
 * `skill/shared/git_sandbox.py`; kept in sync deliberately so the TS and
 * Python fixture paths isolate identically.
 */
export const REPOSITORY_OVERRIDE_ENV_VARS = [
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_CONFIG',
  'GIT_CONFIG_GLOBAL',
  'GIT_CONFIG_SYSTEM',
  'GIT_CONFIG_NOSYSTEM',
  'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
] as const;

/**
 * Build a copy of *base* with every repository-override variable **and**
 * `GIT_INDEX_FILE` removed, ready to pass as a fixture `git` command's `env`.
 *
 * Neither *base* nor `process.env` is mutated.
 *
 * @param base Environment to start from (defaults to `process.env`).
 * @returns A new environment mapping safe for a hermetic fixture.
 */
export function fixtureGitEnv(
  base: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...base };
  delete env.GIT_INDEX_FILE;
  for (const name of REPOSITORY_OVERRIDE_ENV_VARS) delete env[name];
  return env;
}

/**
 * Remove the ambient repository-override variables (including
 * `GIT_INDEX_FILE`) from `process.env` for the current test file.
 *
 * Use this at the top of a test file whose code under test spawns `git`
 * itself with the process environment (so no explicit `env` can be supplied):
 * a finish-gate `GIT_INDEX_FILE` must not reach the system under test, or it
 * writes into the gate's temporary index (CG-0MVVKUUY50010004). Vitest
 * isolates each test file in its own worker, so the scrub is file-scoped.
 *
 * @param env The mapping to clear (defaults to `process.env`).
 */
export function clearAmbientGitOverrides(
  env: NodeJS.ProcessEnv = process.env,
): void {
  delete env.GIT_INDEX_FILE;
  for (const name of REPOSITORY_OVERRIDE_ENV_VARS) delete env[name];
}
