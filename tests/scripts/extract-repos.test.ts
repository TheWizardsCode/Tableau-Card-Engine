/**
 * Unit tests for the multi-repo extraction tooling (F1 / CG-0MTRO6P18003AZIZ).
 *
 * The epic decomposes the flat TCE monorepo into one core-engine repository
 * plus one repository per example game, composed back together with git
 * submodules. The extraction is driven by two machine-readable inputs that
 * this suite locks down:
 *
 *   - `scripts/configs/repo-layout.json`      — the repo partition (paths +
 *     asset ownership), the single source of truth for both extraction and
 *     distribution builds.
 *   - `scripts/extract-repos.sh`              — the git-filter-repo driver.
 *
 * These are behaviour tests over the committed layout contract and the
 * driver's interface (argument parsing, dry-run reporting, filter-spec
 * derivation, tool preflight). No repository is rewritten and no network is
 * touched: extraction is exercised through the script's `--dry-run` mode,
 * which is deterministic and side-effect free.
 */
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const LAYOUT_PATH = path.join(REPO_ROOT, 'scripts', 'configs', 'repo-layout.json');
const SCRIPT_PATH = path.join(REPO_ROOT, 'scripts', 'extract-repos.sh');

/** All eight example games that move to their own repository. */
const GAME_NAMES = [
  'golf',
  'beleaguered-castle',
  'blackjack',
  'sushi-go',
  'feudalism',
  'lost-cities',
  'main-street',
  'coloretto',
] as const;

/** Shared engine modules that stay in the core repository. */
const CORE_ENGINE_DIRS = [
  'src/core-engine',
  'src/card-system',
  'src/rule-engine',
  'src/ui',
  'src/ai',
  'src/balance-cards',
] as const;

interface AssetRule {
  asset: string;
  owner: string;
  rationale: string;
}

interface RepoLayout {
  core: {
    name: string;
    slug: string;
    paths: string[];
    assets: string[];
  };
  games: Array<{
    name: string;
    slug: string;
    paths: string[];
    assets: string[];
  }>;
  sharedAssets: string[];
  gameAssets: Array<{
    game: string;
    assets: string[];
  }>;
  assetDecisionTable: AssetRule[];
  notes: {
    crossBoundaryFixes: string[];
    [key: string]: unknown;
  };
}

function readLayout(): RepoLayout {
  return JSON.parse(fs.readFileSync(LAYOUT_PATH, 'utf-8')) as RepoLayout;
}

function runExtract(args: string[]): { stdout: string; status: number } {
  try {
    const stdout = execFileSync('bash', [SCRIPT_PATH, ...args], {
      cwd: REPO_ROOT,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 60_000,
    });
    return { stdout, status: 0 };
  } catch (error) {
    const err = error as { status?: number; stdout?: string };
    return { stdout: err.stdout ?? '', status: err.status ?? 1 };
  }
}

describe('repo-layout.json — repo partition contract', () => {
  it('is valid JSON with the expected top-level sections', () => {
    const layout = readLayout();
    expect(layout.core).toBeDefined();
    expect(Array.isArray(layout.games)).toBe(true);
    expect(Array.isArray(layout.sharedAssets)).toBe(true);
    expect(Array.isArray(layout.gameAssets)).toBe(true);
    expect(Array.isArray(layout.assetDecisionTable)).toBe(true);
  });

  it('declares exactly the eight example games as separate repos', () => {
    const layout = readLayout();
    expect(layout.games.map((g) => g.name).sort()).toEqual([...GAME_NAMES].sort());
  });

  it('gives every repo a unique slug', () => {
    const layout = readLayout();
    const slugs = [layout.core.slug, ...layout.games.map((g) => g.slug)];
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('keeps all shared engine modules in core', () => {
    const layout = readLayout();
    for (const dir of CORE_ENGINE_DIRS) {
      expect(layout.core.paths).toContain(dir);
    }
  });

  it('keeps the Gym and launcher shell in core', () => {
    const layout = readLayout();
    expect(layout.core.paths).toContain('example-games/gym');
    expect(layout.core.paths).toContain('src/ui/GameSelectorScene.ts');
    expect(layout.core.paths).toContain('src/ui/createCardGame.ts');
    expect(layout.core.paths).toContain('electron');
  });

  it('assigns each game its own example-games subtree', () => {
    const layout = readLayout();
    for (const game of layout.games) {
      expect(game.paths).toContain(`example-games/${game.name}`);
    }
  });

  it('never assigns the same path to both core and a game', () => {
    const layout = readLayout();
    const corePaths = new Set(layout.core.paths);
    for (const game of layout.games) {
      for (const p of game.paths) {
        expect(corePaths.has(p), `${p} in both core and ${game.name}`).toBe(false);
      }
    }
  });

  it('audits every game-owned asset subtree to an existing game', () => {
    const layout = readLayout();
    const names = new Set(layout.games.map((g) => g.name));
    for (const entry of layout.gameAssets) {
      expect(names.has(entry.game), `unknown game ${entry.game}`).toBe(true);
      expect(entry.assets.length).toBeGreaterThan(0);
    }
  });

  it('records a rationale for every asset ownership decision (AC3)', () => {
    const layout = readLayout();
    expect(layout.assetDecisionTable.length).toBeGreaterThan(0);
    for (const rule of layout.assetDecisionTable) {
      expect(rule.asset.length).toBeGreaterThan(0);
      expect(['core', ...GAME_NAMES]).toContain(rule.owner);
      expect(rule.rationale.length).toBeGreaterThan(0);
    }
  });

  it('enumerates shared assets as files/disjoint subtrees, never a game parent', () => {
    const layout = readLayout();
    // `cards/` and `audio/` are broad parents of game-owned children
    // (cards/lost-cities/, audio/<game>/). filter-repo cannot exclude them,
    // so they must never appear verbatim as shared assets.
    expect(layout.sharedAssets).not.toContain('cards/');
    expect(layout.sharedAssets).not.toContain('audio/');
    expect(layout.sharedAssets).not.toContain('games/');
    // The shared canonical deck is enumerated as the individual SVG faces.
    expect(layout.sharedAssets).toContain('cards/card_back.svg');
    expect(layout.sharedAssets.filter((a) => /^cards\/.*\.svg$/.test(a)).length).toBe(53);
  });

  it('documents the cross-boundary Gym asset fixes', () => {
    const layout = readLayout();
    const fixes = layout.notes.crossBoundaryFixes;
    expect(Array.isArray(fixes)).toBe(true);
    expect(fixes.join('\n')).toContain('classic-vector');
    expect(fixes.join('\n')).toContain('sushi-go/icon-tempura.svg');
  });

  it('classifies the shared canonical deck and default SFX as core assets', () => {
    const layout = readLayout();
    expect(layout.sharedAssets).toContain('cards/card_back.svg');
    expect(layout.sharedAssets).toContain('audio/default/');
    expect(layout.sharedAssets).toContain('CREDITS.md');
  });

  it('classifies per-game SFX and thumbnails as game-owned', () => {
    const layout = readLayout();
    const byGame = new Map(layout.gameAssets.map((e) => [e.game, e.assets]));
    expect(byGame.get('golf')).toContain('audio/golf/');
    expect(byGame.get('main-street')).toContain('games/main-street/');
    expect(byGame.get('lost-cities')).toContain('cards/lost-cities/');
    expect(byGame.get('sushi-go')).toContain('sushi-go/');
  });

  it('covers every asset directory present under public/assets', () => {
    const layout = readLayout();
    const declared = new Set([
      ...layout.sharedAssets,
      ...layout.gameAssets.flatMap((e) => e.assets),
      ...layout.assetDecisionTable.map((r) => r.asset),
    ]);
    // Directories that exist in the monorepo's public/assets tree. Each must
    // be classified by exactly one ownership rule (the decision table can
    // additionally carry container/parent rows such as 'audio/' and 'games/').
    const expectedDirs = [
      'cards/',
      'cards/alternative/',
      'cards/lost-cities/',
      'audio/',
      'audio/default/',
      'audio/beleaguered-castle/',
      'audio/blackjack/',
      'audio/coloretto/',
      'audio/feudalism/',
      'audio/golf/',
      'audio/lost-cities/',
      'audio/sushi-go/',
      'games/',
      'games/main-street/',
      'sushi-go/',
    ];
    for (const dir of expectedDirs) {
      expect(declared.has(dir), `asset dir ${dir} unclassified`).toBe(true);
    }
  });
});

describe('extract-repos.sh — driver interface', () => {
  it('exists and is executable by bash', () => {
    expect(fs.existsSync(SCRIPT_PATH)).toBe(true);
  });

  it('prints usage and exits non-zero when run with no arguments', () => {
    const { stdout, status } = runExtract([]);
    expect(status).not.toBe(0);
    expect(stdout.toLowerCase()).toContain('usage');
  });

  it('prints usage for --help', () => {
    const { stdout, status } = runExtract(['--help']);
    expect(status).toBe(0);
    expect(stdout.toLowerCase()).toContain('usage');
  });

  it('supports dry-run, list-targets and out-dir flags in its usage', () => {
    const { stdout } = runExtract(['--help']);
    expect(stdout).toContain('--dry-run');
    expect(stdout).toContain('--out-dir');
    expect(stdout).toContain('--list');
  });

  it('rejects an unknown target with a non-zero exit', () => {
    const { status } = runExtract(['--target', 'no-such-repo', '--dry-run']);
    expect(status).not.toBe(0);
  });
});

describe('extract-repos.sh — dry-run plan', () => {
  it('succeeds and names the core repo plus all eight game repos', () => {
    const { stdout, status } = runExtract(['--dry-run']);
    expect(status).toBe(0);
    expect(stdout).toContain('tableau-card-engine-core');
    for (const game of GAME_NAMES) {
      expect(stdout, `missing tce-${game} in plan`).toContain(`tce-${game}`);
    }
  });

  it('reports the filter path for each repo', () => {
    const { stdout } = runExtract(['--dry-run']);
    // The plan must state the monorepo paths each repo selects.
    expect(stdout).toContain('src/core-engine');
    expect(stdout).toContain('example-games/golf');
    expect(stdout).toContain('example-games/gym');
  });

  it('plans the history-preserving rename of each game tree to src/ (Option C)', () => {
    const { stdout } = runExtract(['--dry-run']);
    for (const game of GAME_NAMES) {
      expect(stdout, `missing rename for ${game}`).toContain(
        `example-games/${game}/ -> src/`,
      );
    }
    // The core repo is not renamed.
    const { stdout: coreOnly } = runExtract(['--target', 'core', '--dry-run']);
    expect(coreOnly).not.toContain('-> src/');
  });

  it('warns when git-filter-repo is unavailable but still plans (fail-open)', () => {
    const { stdout, status } = runExtract(['--dry-run']);
    expect(status).toBe(0);
    expect(stdout.toLowerCase()).toContain('git filter-repo');
  });

  it('lists targets one per line with --list', () => {
    const { stdout, status } = runExtract(['--list']);
    expect(status).toBe(0);
    const lines = stdout
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    expect(lines).toContain('core');
    for (const game of GAME_NAMES) {
      expect(lines).toContain(game);
    }
  });

  it('plans a single target when --target is supplied', () => {
    const { stdout, status } = runExtract(['--target', 'golf', '--dry-run']);
    expect(status).toBe(0);
    expect(stdout).toContain('tce-golf');
    expect(stdout).not.toContain('tce-blackjack');
  });

  it('lists the asset subtree each repo carries', () => {
    const { stdout } = runExtract(['--dry-run']);
    expect(stdout).toContain('public/assets/audio/golf/');
    expect(stdout).toContain('public/assets/cards/card_back.svg');
  });

  it('excludes game-owned asset subtrees from the core repo plan', () => {
    const { stdout } = runExtract(['--target', 'core', '--dry-run']);
    // Core carries the shared deck but must NOT carry a broad parent of a
    // game-owned asset dir (filter-repo directory includes re-include their
    // children, so exclusions cannot subtract them).
    expect(stdout).toContain('public/assets/cards/card_back.svg');
    expect(stdout).toContain('public/assets/audio/default/');
    expect(stdout).not.toContain('public/assets/audio/golf/');
    expect(stdout).not.toContain('public/assets/games/main-street/');
    expect(stdout).not.toContain('public/assets/sushi-go/');
  });

  it('plans core as a target by its public name', () => {
    const { stdout, status } = runExtract(['--target', 'core', '--dry-run']);
    expect(status).toBe(0);
    expect(stdout).toContain('tableau-card-engine-core');
    expect(stdout).not.toContain('tce-golf');
  });
});
