/**
 * Per-worker snapshot of the repo `public/` tree for real-root Vite builds
 * (CG-0MWW8D6N6006ZR49).
 *
 * The electron build-output tests run the real `vite.config.ts` against the
 * real project root, so Vite copies the shared repo `public/` tree into the
 * build output. That tree is **shared process-wide**: under Vitest the
 * composition plugin is off (`gameAssetsPlugin({ compose: !process.env.VITEST })`),
 * but a concurrently running `npm run dev` / `npm run build` / `package` in the
 * same checkout can still create, replace or remove `public/assets` links while
 * Vite walks it, which surfaces as an `ENOENT` from the public-dir copy.
 *
 * Copying `public/` into a private `mkdtemp` directory first gives every worker
 * (and every build) a tree nothing else can mutate, so icon/manifest
 * assertions read immutable content. The copy is faithful: symlinked content is
 * dereferenced into real files, so the snapshot never reads through the shared
 * tree either, and a dangling composed link is copied as a link rather than
 * aborting the snapshot.
 *
 * Measured cost of the repo tree (133 files, 9.2 MB): ~36 ms per copy, so a
 * fresh snapshot per build is cheap enough to keep cleanup in a `finally`.
 *
 * @example
 * ```ts
 * const snapshot = createPublicSnapshot();
 * try {
 *   await build({ ..., publicDir: snapshot.publicDir });
 * } finally {
 *   snapshot.cleanup();
 * }
 * ```
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** A private, immutable copy of the repo `public/` tree. */
export interface PublicSnapshot {
  /** Absolute path to the snapshot root; pass it as Vite's `publicDir`. */
  readonly publicDir: string;
  /** Remove the snapshot. Idempotent, so it is safe at the end of a `finally`. */
  cleanup(): void;
}

/** Options for {@link createPublicSnapshot}. */
export interface PublicSnapshotOptions {
  /** Tree to copy (defaults to the repo `public/` next to this helper). */
  sourceDir?: string;
  /** `mkdtemp` prefix (defaults to `tce-public-snapshot-`). */
  prefix?: string;
}

/** Repo `public/` tree: `tests/helpers/` → repo root. */
export const DEFAULT_PUBLIC_DIR = path.resolve(__dirname, '..', '..', 'public');

/**
 * Copy `public/` (or `options.sourceDir`) into a fresh temp directory.
 *
 * The caller owns the returned directory and must call `cleanup()` — normally
 * in a `finally` block — so no temp dirs leak.
 */
export function createPublicSnapshot(options: PublicSnapshotOptions = {}): PublicSnapshot {
  const sourceDir = options.sourceDir ?? DEFAULT_PUBLIC_DIR;
  const snapshotDir = fs.mkdtempSync(
    path.join(os.tmpdir(), options.prefix ?? 'tce-public-snapshot-'),
  );
  try {
    copyTree(sourceDir, snapshotDir, new Set<string>());
  } catch (error) {
    fs.rmSync(snapshotDir, { recursive: true, force: true });
    throw error;
  }
  return {
    publicDir: snapshotDir,
    cleanup(): void {
      fs.rmSync(snapshotDir, { recursive: true, force: true });
    },
  };
}

/**
 * Copy a directory recursively, resolving symlinks to their real content.
 *
 * `fs.cpSync(..., { dereference: true })` does not dereference a symlinked
 * *directory* on every supported Node release, so the walk is explicit. A
 * dangling link (a composed game-asset link whose sibling checkout is gone) is
 * copied as a link: failing here would be worse than mirroring the tree Vite
 * would have pruned.
 *
 * `ancestors` holds the real paths on the current descent only, so a symlink
 * cycle terminates while two sibling links to the same directory both copy.
 */
function copyTree(sourceDir: string, destDir: string, ancestors: Set<string>): void {
  const realSource = fs.realpathSync(sourceDir);
  if (ancestors.has(realSource)) return;
  ancestors.add(realSource);
  try {
    for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
      const source = path.join(sourceDir, entry.name);
      const dest = path.join(destDir, entry.name);
      if (entry.isSymbolicLink()) {
        copyLinkTarget(source, dest, ancestors);
      } else if (entry.isDirectory()) {
        fs.mkdirSync(dest);
        copyTree(source, dest, ancestors);
      } else if (entry.isFile()) {
        fs.copyFileSync(source, dest);
      }
      // Sockets/FIFOs never appear in a public asset tree; skip them.
    }
  } finally {
    ancestors.delete(realSource);
  }
}

/** Copy the content a symlink resolves to, or the link itself when it dangles. */
function copyLinkTarget(source: string, dest: string, ancestors: Set<string>): void {
  let target: fs.Stats;
  try {
    target = fs.statSync(source);
  } catch {
    fs.symlinkSync(fs.readlinkSync(source), dest);
    return;
  }
  if (target.isDirectory()) {
    fs.mkdirSync(dest);
    copyTree(source, dest, ancestors);
    return;
  }
  if (target.isFile()) {
    fs.copyFileSync(fs.realpathSync(source), dest);
    return;
  }
  fs.symlinkSync(fs.readlinkSync(source), dest);
}
