/**
 * Codemod: rewrite deep-relative engine imports to engine path aliases (F9 / C2).
 *
 * Part of epic CG-0MTR7DLMY008CK17. Decided by C1
 * (`docs/dev/per-game-src-layout-decision.md`): per-game repos keep their
 * source at repo-root `src/` and import the engine **only** through aliases,
 * so the `src -> <core>/src` compatibility symlink can be removed.
 *
 * The codemod rewrites, in game source (`example-games/<game>/**`) and game
 * tests (`tests/<game>/**`):
 *
 *   `(../)+src/core-engine/…`     → `@core-engine/…`
 *   `(../)+src/card-system/…`     → `@card-system/…`
 *   `(../)+src/rule-engine/…`     → `@rule-engine/…`
 *   `(../)+src/ui/…`              → `@ui/…`
 *   `(../)+src/ai/…`              → `@ai/…`
 *   `(../)+src/balance-cards/…`   → `@balance-cards/…`
 *   `(../)+scripts/adapters/…`    → `@core-scripts/adapters/…`
 *   `(../)+tests/helpers/…`       → `@core-tests/helpers/…`
 *
 * It is deterministic and idempotent: aliases never match the relative
 * pattern, so a second run is a no-op. It reports before/after counts.
 *
 * ## CLI
 *
 * ```bash
 * tsx scripts/codemod-src-imports.ts            # dry-run, prints the plan
 * tsx scripts/codemod-src-imports.ts --apply    # rewrite in place
 * tsx scripts/codemod-src-imports.ts --game golf --apply
 * ```
 *
 * @module
 */

import fs from 'node:fs';
import path from 'node:path';

// ── Public constants ──────────────────────────────────────────────────────

/** The eight games that move to their own repositories. */
export const GAME_NAMES = [
  'beleaguered-castle',
  'blackjack',
  'coloretto',
  'feudalism',
  'golf',
  'lost-cities',
  'main-street',
  'sushi-go',
] as const;

export type GameName = (typeof GAME_NAMES)[number];

/** A single relative-prefix → alias mapping. */
export interface AliasRule {
  /** Regex over the specifier body after the `(../)+` prefix. */
  readonly match: RegExp;
  /** Replacement (may use `$1`). */
  readonly replace: string;
}

/**
 * The alias rules, in order. `src/<engine-dir>` maps to the matching alias;
 * `scripts/adapters/*` and `tests/helpers/*` map to the new core-framework
 * aliases (C1 §4).
 */
export const ALIAS_RULES: readonly AliasRule[] = [
  { match: /^src\/core-engine(\/.*)?$/, replace: '@core-engine$1' },
  { match: /^src\/card-system(\/.*)?$/, replace: '@card-system$1' },
  { match: /^src\/rule-engine(\/.*)?$/, replace: '@rule-engine$1' },
  { match: /^src\/ui(\/.*)?$/, replace: '@ui$1' },
  { match: /^src\/ai(\/.*)?$/, replace: '@ai$1' },
  { match: /^src\/balance-cards(\/.*)?$/, replace: '@balance-cards$1' },
  { match: /^scripts\/adapters\/(.*)$/, replace: '@core-scripts/adapters/$1' },
  { match: /^tests\/helpers\/(.*)$/, replace: '@core-tests/helpers/$1' },
  // Game tests import the core helper tree via the `tests/helpers` symlink as
  // `../helpers/…`; no game ships its own `helpers/` reachable that way.
  { match: /^helpers\/(.*)$/, replace: '@core-tests/helpers/$1' },
];

/**
 * Matches a quoted module specifier with one or more `../` segments, e.g.
 * `'../../../src/ui'`. Capture 1 is the quote, 2 the relative prefix, 3 the
 * remainder (the part the alias rules match).
 */
export const RELATIVE_SPECIFIER_RE =
  /(['"])((?:\.\.\/)+)((?:src|scripts|tests|helpers)\/[^'"]+)\1/g;

/** Result of codemodding one file. */
export interface FileRewrite {
  /** Path relative to the repo root. */
  readonly file: string;
  /** Number of specifiers rewritten in this file. */
  readonly rewrites: number;
}

/** Aggregate result of a codemod run. */
export interface CodemodResult {
  /** Files that would change (or changed). */
  readonly files: FileRewrite[];
  /** Total specifier rewrites. */
  readonly totalRewrites: number;
  /** Specifiers left untouched (relative engine specifiers that matched no rule). */
  readonly unmatched: string[];
  /** True when `--apply` was used. */
  readonly applied: boolean;
}

// ── Pure helpers ──────────────────────────────────────────────────────────

/**
 * Rewrite all alias-eligible specifiers in `source`.
 *
 * @param source File contents.
 * @returns The rewritten contents plus per-specifier counts.
 */
export function rewriteSource(source: string): {
  source: string;
  rewrites: number;
  unmatched: string[];
} {
  let rewrites = 0;
  const unmatched: string[] = [];

  const out = source.replace(
    RELATIVE_SPECIFIER_RE,
    (full: string, quote: string, _prefix: string, body: string) => {
      for (const rule of ALIAS_RULES) {
        if (rule.match.test(body)) {
          rewrites += 1;
          return `${quote}${body.replace(rule.match, rule.replace)}${quote}`;
        }
      }
      unmatched.push(body);
      return full;
    },
  );

  return { source: out, rewrites, unmatched };
}

/** Recursively collect `.ts`/`.tsx` files under `dir` (excluding node_modules). */
export function collectTypeScriptFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  const walk = (current: string): void => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
    }
  };
  walk(dir);
  return out.sort();
}

/**
 * The files the codemod operates on: all game source (minus the core-owned
 * Gym) and all game tests.
 *
 * @param repoRoot Repository root.
 * @param games Game ids to include (defaults to all eight).
 * @returns Absolute file paths.
 */
export function targetFiles(
  repoRoot: string,
  games: readonly string[] = GAME_NAMES,
): string[] {
  const files: string[] = [];
  for (const game of games) {
    files.push(
      ...collectTypeScriptFiles(path.join(repoRoot, 'example-games', game)),
      ...collectTypeScriptFiles(path.join(repoRoot, 'tests', game)),
    );
  }
  return files.sort();
}

/**
 * Run the codemod over `repoRoot`.
 *
 * @param repoRoot Repository root.
 * @param options.apply Write changes (default false = dry-run).
 * @param options.games Game ids to include.
 * @returns Aggregate result.
 */
export function codemod(
  repoRoot: string,
  options: { apply?: boolean; games?: readonly string[] } = {},
): CodemodResult {
  const files = targetFiles(repoRoot, options.games);
  const changed: FileRewrite[] = [];
  const unmatched: string[] = [];
  let totalRewrites = 0;

  for (const file of files) {
    const original = fs.readFileSync(file, 'utf-8');
    const { source, rewrites, unmatched: fileUnmatched } = rewriteSource(original);
    if (rewrites > 0) {
      changed.push({ file: path.relative(repoRoot, file), rewrites });
      totalRewrites += rewrites;
      if (options.apply) fs.writeFileSync(file, source, 'utf-8');
    }
    unmatched.push(...fileUnmatched);
  }

  return {
    files: changed,
    totalRewrites,
    unmatched,
    applied: options.apply ?? false,
  };
}

// ── CLI ───────────────────────────────────────────────────────────────────

interface CliArgs {
  apply: boolean;
  game?: string;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { apply: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--apply') args.apply = true;
    else if (arg === '--game') {
      args.game = argv[i + 1];
      i += 1;
    } else if (arg === '-h' || arg === '--help') {
      console.log(
        'Usage: tsx scripts/codemod-src-imports.ts [--apply] [--game <id>]',
      );
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function main(argv: string[]): number {
  let args: CliArgs;
  try {
    args = parseArgs(argv);
  } catch (err) {
    console.error((err as Error).message);
    return 1;
  }
  const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
  const games = args.game ? [args.game] : GAME_NAMES;
  const result = codemod(repoRoot, { apply: args.apply, games });

  console.log(
    `codemod-src-imports: ${result.totalRewrites} specifier(s) across ` +
      `${result.files.length} file(s)${result.applied ? ' (applied)' : ' (dry-run)'}`,
  );
  for (const f of result.files) {
    console.log(`  ${f.rewrites.toString().padStart(3)}  ${f.file}`);
  }
  if (result.unmatched.length > 0) {
    const unique = [...new Set(result.unmatched)].sort();
    console.log(`\nUnmatched relative engine specifiers (${unique.length}):`);
    for (const u of unique) console.log(`  ${u}`);
  }
  return 0;
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (invokedDirectly) {
  process.exitCode = main(process.argv.slice(2));
}
