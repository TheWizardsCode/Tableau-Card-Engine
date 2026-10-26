/**
 * Type declarations for the engine submodule sync/verify script
 * (`scripts/engine-sync.mjs`, MS-0MVCRGKZY007DIED).
 *
 * The script is plain ESM so it runs with a stock `node` (no build step);
 * these declarations give its programmatic API types for the TypeScript
 * tests (game-repo `tests/…/engine-sync.test.ts` and engine
 * `tests/scripts/engine-sync.test.ts`).
 */

/** The engine pin file contract: a single `sha` field. */
export interface EnginePin {
  sha: string;
}

/** Whether the pin file has a value (i.e. this repo is pinned). */
export declare function writePin(repoRoot: string, pinRel: string, sha: string): boolean;

/** Stage the `core` gitlink and (when given) the pin file together. */
export declare function stageEngineState(
  repoRoot: string,
  coreRel: string,
  pinRel?: string | null,
): void;

/** Standard git command result. */
export interface GitResult {
  ok: boolean;
  code: number;
  stdout: string;
  stderr: string;
}

/** Result of `syncEngine`. */
export interface SyncResult {
  updated: boolean;
  from: string;
  to: string;
  /** True when this run rewrote `configs/engine-pin.json` to the new HEAD. */
  pinWritten: boolean;
  warning?: string;
}

/** Result of `verifyEngine`. */
export interface VerifyResult {
  sha: string;
}

export declare class EngineSyncError extends Error {}

/** Submodule path relative to the game repo root (from .gitmodules). */
export declare const DEFAULT_CORE_REL: string;
/** Engine pin file relative to the game repo root. */
export declare const DEFAULT_PIN_REL: string;

/** Run a git command from a given cwd. */
export declare function runGit(
  cwd: string,
  args: string[],
  env?: Record<string, string>,
): GitResult;

/** Absolute submodule directory for a game repo root. */
export declare function corePath(repoRoot: string, coreRel?: string): string;

/** True when the submodule working tree has uncommitted changes. */
export declare function submoduleIsDirty(repoRoot: string, coreRel?: string): boolean;

/** Ensure the `core` submodule is initialised (throws on failure). */
export declare function ensureSubmoduleInit(repoRoot: string, coreRel?: string): void;

/** The branch the `core` submodule tracks ('' = remote HEAD default). */
export declare function resolveTrackedBranch(repoRoot: string, coreRel?: string): string;

/** The full SHA of the remote-resolved target of the tracked branch. */
export declare function resolveRemoteTarget(repoRoot: string, coreRel?: string): string;

/** Read and validate the engine pin file; returns its `sha`. */
export declare function readPin(repoRoot: string, pinRel?: string): string;

/** Expand a (possibly short) SHA to a full 40-hex SHA (or null). */
export declare function resolveShaFull(
  repoRoot: string,
  coreRel: string,
  sha: string,
): string | null;

/** Dev sync: guard, then follow the latest engine remote head; pin travels. */
export declare function syncEngine(opts: {
  repoRoot: string;
  coreRel?: string;
  pinRel?: string;
  log?: (line: string) => void;
}): SyncResult;

/** Release verify: guard, pin check, exact checkout. */
export declare function verifyEngine(opts: {
  repoRoot: string;
  coreRel?: string;
  pinRel?: string;
  log?: (line: string) => void;
}): VerifyResult;

/** CLI entry. Returns the process exit code. */
export declare function main(
  argv: string[],
  io?: { stdout: { write(s: string): void }; stderr: { write(s: string): void } },
): number;
