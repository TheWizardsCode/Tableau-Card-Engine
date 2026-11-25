/**
 * Unit tests for launcher game-asset composition (CG-0MUKYCG9L00587FA).
 *
 * The launcher owns only the shared `public/assets` tree; each game's own
 * assets (thumbnails, icons, audio) live in its sibling checkout. These tests
 * pin the composition contract over a temporary launcher fixture:
 *
 *   - the ownership table is read from `repo-layout.json → gameAssets`;
 *   - selected games' asset roots are symlinked into `public/assets`;
 *   - composition is idempotent and never clobbers a real file;
 *   - switching presets removes stale links (core-only leaves the tree clean);
 *   - an absent sibling is reported, not fatal;
 *   - the `tce-game-assets` Vite plugin performs the composition and is
 *     registered in `vite.config.ts`.
 *
 * No browser and no network — pure filesystem behaviour.
 */
import { describe, expect, it, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { build } from 'vite';

import {
  composeGameAssets,
  planGameAssetLinks,
  pruneDanglingComposedLinks,
  readGameAssetOwnership,
  type GameAssetOwnership,
} from '../../scripts/link-game-assets';
import { gameAssetsPlugin } from '../../scripts/vite-game-assets-plugin';
import viteConfig from '../../vite.config';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const REAL_LAYOUT = path.join(REPO_ROOT, 'scripts', 'configs', 'repo-layout.json');

/** A small ownership table used by the fixture tests. */
const FIXTURE_OWNERSHIP: GameAssetOwnership[] = [
  { game: 'golf', assets: ['audio/golf', 'games/golf'] },
  { game: 'main-street', assets: ['games/main-street'] },
  {
    game: 'lost-cities',
    assets: ['cards/lost-cities', 'audio/lost-cities', 'games/lost-cities'],
  },
];

const tmpDirs: string[] = [];

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

interface FixtureOptions {
  /** Game ids whose sibling checkouts exist on disk. */
  siblings: string[];
  /** Games listed in the active preset (defaults to `siblings`). */
  selected?: string[];
  /** Preset name written to `configs/<name>.json` (defaults to `preset`). */
  presetName?: string;
  /** Asset roots to create per sibling (defaults to the ownership table). */
  ownership?: GameAssetOwnership[];
}

/**
 * Build a temporary launcher root: `configs/`, the layout contract, and a
 * `public/assets` tree, plus sibling `tce-<game>` checkouts holding their own
 * `public/assets` game-owned roots.
 */
function makeLauncherFixture(options: FixtureOptions): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tce-assets-'));
  tmpDirs.push(root);

  const ownership = options.ownership ?? FIXTURE_OWNERSHIP;
  const presetName = options.presetName ?? 'preset';
  const selected = options.selected ?? options.siblings;

  fs.mkdirSync(path.join(root, 'configs'), { recursive: true });
  fs.mkdirSync(path.join(root, 'scripts', 'configs'), { recursive: true });
  fs.mkdirSync(path.join(root, 'public', 'assets'), { recursive: true });

  fs.writeFileSync(
    path.join(root, 'scripts', 'configs', 'repo-layout.json'),
    JSON.stringify({ gameAssets: ownership }, null, 2),
  );

  const games = selected.map((id) => ({
    id,
    path: `tce-${id}`,
    scenePath: `src/scenes/${id}Scene.ts`,
  }));
  fs.writeFileSync(
    path.join(root, 'configs', `${presetName}.json`),
    JSON.stringify({ games }, null, 2),
  );

  for (const id of options.siblings) {
    const owned = ownership.find((o) => o.game === id);
    if (!owned) continue;
    for (const asset of owned.assets) {
      const source = path.join(root, `tce-${id}`, 'public', 'assets', asset);
      fs.mkdirSync(source, { recursive: true });
      fs.writeFileSync(path.join(source, 'marker.txt'), `${id}:${asset}`);
    }
  }
  return root;
}

function isSymlink(p: string): boolean {
  return fs.lstatSync(p, { throwIfNoEntry: false })?.isSymbolicLink() === true;
}

describe('readGameAssetOwnership', () => {
  it('reads every game and its asset roots from the real layout contract', () => {
    const ownership = readGameAssetOwnership(REAL_LAYOUT);
    const byGame = new Map(ownership.map((o) => [o.game, o.assets]));

    expect([...byGame.keys()].sort()).toEqual(
      [
        'beleaguered-castle',
        'blackjack',
        'coloretto',
        'feudalism',
        'golf',
        'lost-cities',
        'main-street',
        'sushi-go',
        'the-rising',
      ].sort(),
    );
    // Trailing slashes are stripped so the paths join cleanly.
    expect(byGame.get('golf')).toContain('games/golf');
    expect(byGame.get('lost-cities')).toContain('cards/lost-cities');
    expect(byGame.get('blackjack')).toContain('audio/blackjack');
    // The Rising ships both its own SFX and its selector art (thumbnail,
    // card backs, portraits).
    expect(byGame.get('the-rising')).toEqual([
      'audio/the-rising',
      'games/the-rising',
    ]);
  });

  it('tolerates malformed entries and a missing layout file', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tce-assets-bad-'));
    tmpDirs.push(root);
    const layout = path.join(root, 'repo-layout.json');
    fs.writeFileSync(
      layout,
      JSON.stringify({
        gameAssets: [
          { game: 'golf', assets: ['audio/golf/'] },
          { game: '', assets: ['audio/x'] },
          { assets: ['audio/y'] },
          { game: 'blackjack', assets: 'not-an-array' },
          null,
        ],
      }),
    );
    expect(readGameAssetOwnership(layout)).toEqual([
      { game: 'golf', assets: ['audio/golf'] },
    ]);
    expect(readGameAssetOwnership(path.join(root, 'absent.json'))).toEqual([]);
  });
});

describe('planGameAssetLinks', () => {
  it('plans a link per selected asset root and reports absent ones', () => {
    const root = makeLauncherFixture({ siblings: ['golf'] });
    // Select golf and lost-cities, but only golf is checked out.
    fs.writeFileSync(
      path.join(root, 'configs', 'preset.json'),
      JSON.stringify({
        games: [
          { id: 'golf', path: 'tce-golf', scenePath: 'src/scenes/GolfScene.ts' },
          {
            id: 'lost-cities',
            path: 'tce-lost-cities',
            scenePath: 'src/scenes/LostCitiesScene.ts',
          },
        ],
      }),
    );

    const plan = planGameAssetLinks({
      projectRoot: root,
      selectedGames: [
        { id: 'golf', path: 'tce-golf' },
        { id: 'lost-cities', path: 'tce-lost-cities' },
      ],
      ownership: FIXTURE_OWNERSHIP,
    });

    expect(plan.links.map((l) => l.asset).sort()).toEqual(['audio/golf', 'games/golf']);
    expect(plan.missingGames).toEqual(['lost-cities']);
    expect(plan.missingAssets).toEqual([]);
  });

  it('reports a declared asset root that is absent in the sibling', () => {
    const root = makeLauncherFixture({ siblings: ['golf'], selected: ['golf'] });
    fs.rmSync(path.join(root, 'tce-golf', 'public', 'assets', 'audio', 'golf'), {
      recursive: true,
    });

    const plan = planGameAssetLinks({
      projectRoot: root,
      selectedGames: [{ id: 'golf', path: 'tce-golf' }],
      ownership: FIXTURE_OWNERSHIP,
    });

    expect(plan.missingAssets.map((l) => l.asset)).toEqual(['audio/golf']);
    expect(plan.links.map((l) => l.asset)).toEqual(['games/golf']);
  });
});

describe('composeGameAssets', () => {
  it('symlinks every selected game asset root into public/assets', () => {
    const root = makeLauncherFixture({ siblings: ['golf', 'main-street'] });
    const report = composeGameAssets({
      projectRoot: root,
      env: { GAMES_CONFIG: 'preset' },
      layoutPath: path.join(root, 'scripts', 'configs', 'repo-layout.json'),
    });

    expect(report.linked.map((l) => l.asset).sort()).toEqual([
      'audio/golf',
      'games/golf',
      'games/main-street',
    ]);
    expect(report.removed).toEqual([]);

    const link = path.join(root, 'public', 'assets', 'games', 'golf');
    expect(isSymlink(link)).toBe(true);
    expect(fs.readFileSync(path.join(link, 'marker.txt'), 'utf-8')).toBe('golf:games/golf');
  });

  it('is idempotent: a second pass changes nothing', () => {
    const root = makeLauncherFixture({ siblings: ['golf', 'main-street'] });
    const opts = {
      projectRoot: root,
      env: { GAMES_CONFIG: 'preset' },
      layoutPath: path.join(root, 'scripts', 'configs', 'repo-layout.json'),
    };

    const first = composeGameAssets(opts);
    expect(first.linked.length).toBe(3);

    const second = composeGameAssets(opts);
    expect(second.linked).toEqual([]);
    expect(second.replaced).toEqual([]);
    expect(second.removed).toEqual([]);
    expect(second.unchanged.length).toBe(3);
  });

  it('removes stale links when the preset no longer selects a game', () => {
    const root = makeLauncherFixture({ siblings: ['golf', 'main-street'] });
    const layoutPath = path.join(root, 'scripts', 'configs', 'repo-layout.json');
    composeGameAssets({ projectRoot: root, env: { GAMES_CONFIG: 'preset' }, layoutPath });

    // Rewrite the preset to select only golf.
    fs.writeFileSync(
      path.join(root, 'configs', 'preset.json'),
      JSON.stringify({
        games: [{ id: 'golf', path: 'tce-golf', scenePath: 'src/scenes/GolfScene.ts' }],
      }),
    );
    const report = composeGameAssets({ projectRoot: root, env: { GAMES_CONFIG: 'preset' }, layoutPath });

    expect(report.removed).toEqual([
      path.join(root, 'public', 'assets', 'games', 'main-street'),
    ]);
    expect(isSymlink(path.join(root, 'public', 'assets', 'games', 'golf'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'public', 'assets', 'games', 'main-street'))).toBe(false);
  });

  it('a core-only preset composes nothing and cleans up prior links', () => {
    const root = makeLauncherFixture({ siblings: ['golf'], ownership: FIXTURE_OWNERSHIP });
    const layoutPath = path.join(root, 'scripts', 'configs', 'repo-layout.json');
    composeGameAssets({ projectRoot: root, env: { GAMES_CONFIG: 'preset' }, layoutPath });
    expect(isSymlink(path.join(root, 'public', 'assets', 'games', 'golf'))).toBe(true);

    fs.writeFileSync(path.join(root, 'configs', 'core-only.json'), JSON.stringify({ games: [] }));
    const report = composeGameAssets({
      projectRoot: root,
      env: { GAMES_CONFIG: 'core-only' },
      layoutPath,
    });

    expect(report.linked).toEqual([]);
    expect(report.removed).toEqual([
      path.join(root, 'public', 'assets', 'audio', 'golf'),
      path.join(root, 'public', 'assets', 'games', 'golf'),
    ]);
  });

  it('never clobbers a real file occupying a destination', () => {
    const root = makeLauncherFixture({ siblings: ['golf'] });
    const dest = path.join(root, 'public', 'assets', 'games', 'golf');
    fs.mkdirSync(dest, { recursive: true });
    fs.writeFileSync(path.join(dest, 'user-file.txt'), 'keep me');

    const report = composeGameAssets({
      projectRoot: root,
      env: { GAMES_CONFIG: 'preset' },
      layoutPath: path.join(root, 'scripts', 'configs', 'repo-layout.json'),
    });

    expect(report.skipped.map((s) => s.dest)).toContain(dest);
    expect(fs.readFileSync(path.join(dest, 'user-file.txt'), 'utf-8')).toBe('keep me');
    expect(isSymlink(dest)).toBe(false);
  });

  it('re-creates a symlink that points at the wrong target', () => {
    const root = makeLauncherFixture({ siblings: ['golf', 'main-street'] });
    const layoutPath = path.join(root, 'scripts', 'configs', 'repo-layout.json');
    const dest = path.join(root, 'public', 'assets', 'games', 'golf');
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.symlinkSync(
      path.relative(path.dirname(dest), path.join(root, 'tce-main-street', 'public', 'assets', 'games', 'main-street')),
      dest,
      'dir',
    );

    const report = composeGameAssets({
      projectRoot: root,
      env: { GAMES_CONFIG: 'preset' },
      layoutPath,
    });

    expect(report.replaced.map((l) => l.asset)).toContain('games/golf');
    expect(fs.realpathSync(dest)).toBe(
      fs.realpathSync(path.join(root, 'tce-golf', 'public', 'assets', 'games', 'golf')),
    );
  });

  it('dry-run classifies without touching the filesystem', () => {
    const root = makeLauncherFixture({ siblings: ['golf'] });
    const report = composeGameAssets({
      projectRoot: root,
      env: { GAMES_CONFIG: 'preset' },
      layoutPath: path.join(root, 'scripts', 'configs', 'repo-layout.json'),
      dryRun: true,
    });

    expect(report.linked.length).toBe(2);
    expect(fs.existsSync(path.join(root, 'public', 'assets', 'games', 'golf'))).toBe(false);
  });
});

describe('dangling composed links (CG-0MWTSRRWU0062OMI)', () => {
  /**
   * A composed link is worktree-fragile: `composeGameAssets` writes a
   * *relative* target, so a link created in the parent checkout and carried
   * into `.worklog/worktrees/<id>/` (or one whose sibling game checkout was
   * removed) resolves to a path that does not exist. Vite's public-dir copy
   * stats every entry, so a single dangling link aborts `npm run build` with
   * ENOENT. Composition must therefore never leave one behind.
   */
  function makeDanglingLink(dest: string, target: string): void {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.symlinkSync(target, dest, 'dir');
    expect(isSymlink(dest)).toBe(true);
    expect(fs.existsSync(dest)).toBe(false);
  }

  it('prunes a dangling link owned by a selected game whose source is absent', () => {
    const root = makeLauncherFixture({ siblings: ['golf', 'lost-cities'] });
    const layoutPath = path.join(root, 'scripts', 'configs', 'repo-layout.json');
    // The sibling checkout exists but has no `cards/lost-cities` root (a
    // partially-bootstrapped or asset-less game worktree).
    fs.rmSync(path.join(root, 'tce-lost-cities', 'public', 'assets', 'cards'), {
      recursive: true,
    });
    const dest = path.join(root, 'public', 'assets', 'cards', 'lost-cities');
    // Relative to `<root>/public/assets/cards`, as written by the parent
    // checkout; it dangles because the source root was removed above.
    makeDanglingLink(dest, '../../tce-lost-cities/public/assets/cards/lost-cities');

    const report = composeGameAssets({
      projectRoot: root,
      env: { GAMES_CONFIG: 'preset' },
      layoutPath,
    });

    expect(report.prunedDangling).toEqual([dest]);
    expect(() => fs.lstatSync(dest)).toThrow();
  });

  it('prunes a dangling link carried into a worktree-style layout', () => {
    // `<root>` is the parent checkout; `<root>/.worklog/worktrees/<id>` is the
    // worktree that inherited its composed links. The same relative targets
    // resolve one directory too shallow there and dangle.
    const root = makeLauncherFixture({ siblings: ['golf'] });
    const worktree = path.join(root, '.worklog', 'worktrees', 'audit-exec-X');
    fs.mkdirSync(path.join(worktree, 'configs'), { recursive: true });
    fs.copyFileSync(
      path.join(root, 'configs', 'preset.json'),
      path.join(worktree, 'configs', 'preset.json'),
    );
    const dest = path.join(worktree, 'public', 'assets', 'games', 'golf');
    // The parent-checkout target (`<root>/tce-golf`) — one level too shallow
    // from the worktree, where it resolves under `.worklog/worktrees/`.
    makeDanglingLink(dest, '../../tce-golf/public/assets/games/golf');

    // The worktree's own sibling resolution: `<worktree>/../tce-golf` is
    // `<root>/.worklog/worktrees/tce-golf` — another item's checkout, or an
    // absent one. Sibling resolution anchors on the main checkout
    // (CG-0MWTVP7AI008RAPB), so this extra symlink is only fixture scaffolding:
    // it keeps `tce-golf` reachable under the old, unanchored path too.
    fs.symlinkSync(path.join(root, 'tce-golf'), path.join(worktree, 'tce-golf'), 'dir');

    const report = composeGameAssets({
      projectRoot: worktree,
      env: { GAMES_CONFIG: 'preset' },
      layoutPath: path.join(root, 'scripts', 'configs', 'repo-layout.json'),
    });

    // The link is repaired (the worktree's sibling resolves), so the composed
    // destination serves the real assets again.
    expect(report.prunedDangling).toEqual([dest]);
    expect(fs.existsSync(dest)).toBe(true);
    expect(fs.readFileSync(path.join(dest, 'marker.txt'), 'utf-8')).toBe('golf:games/golf');
  });

  it('prunes a dangling link for a game the preset no longer selects', () => {
    const root = makeLauncherFixture({ siblings: ['golf'], selected: ['golf'] });
    const layoutPath = path.join(root, 'scripts', 'configs', 'repo-layout.json');
    const dest = path.join(root, 'public', 'assets', 'cards', 'lost-cities');
    makeDanglingLink(dest, '../../tce-lost-cities/public/assets/cards/lost-cities');

    const report = composeGameAssets({
      projectRoot: root,
      env: { GAMES_CONFIG: 'preset' },
      layoutPath,
    });

    expect(report.prunedDangling).toEqual([dest]);
    expect(() => fs.lstatSync(dest)).toThrow();
  });

  it('leaves dangling links alone in dry-run mode', () => {
    const root = makeLauncherFixture({ siblings: ['golf'], selected: ['golf'] });
    const layoutPath = path.join(root, 'scripts', 'configs', 'repo-layout.json');
    const dest = path.join(root, 'public', 'assets', 'cards', 'lost-cities');
    makeDanglingLink(dest, '../../tce-lost-cities/public/assets/cards/lost-cities');

    const report = composeGameAssets({
      projectRoot: root,
      env: { GAMES_CONFIG: 'preset' },
      layoutPath,
      dryRun: true,
    });

    expect(report.prunedDangling).toEqual([dest]);
    expect(isSymlink(dest)).toBe(true);
  });

  it('pruneDanglingComposedLinks is safe to run on its own and is idempotent', () => {
    const root = makeLauncherFixture({ siblings: ['golf'], selected: ['golf'] });
    const layoutPath = path.join(root, 'scripts', 'configs', 'repo-layout.json');
    const dest = path.join(root, 'public', 'assets', 'audio', 'golf');
    makeDanglingLink(dest, '../../tce-missing/public/assets/audio/golf');

    const first = pruneDanglingComposedLinks({ projectRoot: root, layoutPath });
    expect(first.pruned).toEqual([dest]);

    const second = pruneDanglingComposedLinks({ projectRoot: root, layoutPath });
    expect(second.pruned).toEqual([]);
    expect(() => fs.lstatSync(dest)).toThrow();
  });

  it('a dangling composed link never fails a Vite build', async () => {
    // The reported failure (CG-0MWSJ8RJM001IRCJ): Vite's public-dir copy stats
    // every entry, so one dangling composed link aborted the build with ENOENT.
    const root = makeLauncherFixture({ siblings: ['golf'], selected: ['golf'] });
    fs.writeFileSync(
      path.join(root, 'index.html'),
      '<!doctype html><html><body><div id="app"></div>' +
        '<script type="module" src="/main.js"></script></body></html>',
    );
    fs.writeFileSync(path.join(root, 'main.js'), "document.getElementById('app');\n");
    const dest = path.join(root, 'public', 'assets', 'cards', 'lost-cities');
    makeDanglingLink(dest, '../../tce-lost-cities/public/assets/cards/lost-cities');

    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tce-vite-dangling-'));
    tmpDirs.push(outDir);
    await expect(
      build({
        configFile: false,
        root,
        logLevel: 'silent',
        plugins: [gameAssetsPlugin({ projectRoot: root, env: { GAMES_CONFIG: 'preset' } })],
        build: { outDir, emptyOutDir: true },
      }),
    ).resolves.toBeDefined();

    expect(() => fs.lstatSync(dest)).toThrow();
  }, 60_000);
});

describe('tce-game-assets Vite plugin', () => {
  it('is registered in vite.config.ts', () => {
    const config = viteConfig({ command: 'serve', mode: 'test' });
    const names = (Array.isArray(config.plugins) ? config.plugins : []).flatMap(
      (p): string[] => (p && typeof p === 'object' && 'name' in p ? [String(p.name)] : []),
    );
    expect(names).toContain('tce-game-assets');
  });

  it('composes assets during config resolution', () => {
    const root = makeLauncherFixture({ siblings: ['golf', 'main-street'] });
    const infos: string[] = [];
    const plugin = gameAssetsPlugin({ projectRoot: root, env: { GAMES_CONFIG: 'preset' } });

    (
      plugin.configResolved as (config: unknown) => void
    )({
      root,
      logger: { info: (m: string) => infos.push(m), warn: (m: string) => infos.push(m) },
    });

    expect(isSymlink(path.join(root, 'public', 'assets', 'games', 'main-street'))).toBe(true);
    expect(infos.join('\n')).toContain('[game-assets] composed');
  });

  it('re-prunes dangling links at build start (config-resolved race window)', () => {
    const root = makeLauncherFixture({ siblings: ['golf'], selected: ['golf'] });
    const plugin = gameAssetsPlugin({ projectRoot: root, env: { GAMES_CONFIG: 'preset' } });
    const logger = { info: () => {}, warn: () => {} };
    (plugin.configResolved as (config: unknown) => void)({ root, logger });

    // A dangling link appears after config resolution (a concurrent run, or a
    // sibling checkout removed mid-build). Build start must heal it before
    // Vite copies the public dir.
    const dest = path.join(root, 'public', 'assets', 'cards', 'lost-cities');
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.symlinkSync('../../tce-gone/public/assets/cards/lost-cities', dest, 'dir');
    expect(fs.existsSync(dest)).toBe(false);

    (plugin.buildStart as () => void)();

    expect(() => fs.lstatSync(dest)).toThrow();
  });

  it('warns instead of throwing when the preset is unknown', () => {
    const root = makeLauncherFixture({ siblings: ['golf'] });
    const warnings: string[] = [];
    const plugin = gameAssetsPlugin({ projectRoot: root, env: { GAMES_CONFIG: 'does-not-exist' } });

    expect(() =>
      (plugin.configResolved as (config: unknown) => void)({
        root,
        logger: { info: () => {}, warn: (m: string) => warnings.push(m) },
      }),
    ).not.toThrow();
    expect(warnings.join('\n')).toContain('[game-assets] skipped asset composition');
  });

  /**
   * Full snapshot of a fixture's `public/assets` tree: every path with its kind
   * and (for symlinks) its raw target, sorted by path. Used to prove an
   * opt-out hook touches nothing at all.
   */
  function snapshotAssetsTree(root: string): Array<{
    relativePath: string;
    kind: string;
    detail: string;
  }> {
    const assetsRoot = path.join(root, 'public', 'assets');
    const entries: Array<{ relativePath: string; kind: string; detail: string }> = [];
    const walk = (dir: string): void => {
      for (const name of fs.readdirSync(dir)) {
        const abs = path.join(dir, name);
        const stat = fs.lstatSync(abs);
        const relativePath = path.relative(assetsRoot, abs).split(path.sep).join('/');
        if (stat.isSymbolicLink()) {
          entries.push({ relativePath, kind: 'symlink', detail: fs.readlinkSync(abs) });
        } else if (stat.isDirectory()) {
          entries.push({ relativePath, kind: 'directory', detail: '' });
          walk(abs);
        } else {
          entries.push({ relativePath, kind: 'file', detail: fs.readFileSync(abs, 'utf-8') });
        }
      }
    };
    walk(assetsRoot);
    return entries.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  }

  /**
   * Seed the two destructive paths composition owns: a stale link for a game
   * the preset does not select, and a dangling link the prune pass removes.
   */
  function seedDestructiveCompositionState(root: string): void {
    const assetsRoot = path.join(root, 'public', 'assets');
    const staleLink = path.join(assetsRoot, 'games', 'lost-cities');
    fs.mkdirSync(path.dirname(staleLink), { recursive: true });
    fs.symlinkSync(
      path.relative(
        path.dirname(staleLink),
        path.join(root, 'tce-golf', 'public', 'assets', 'games', 'golf'),
      ),
      staleLink,
      'dir',
    );
    const danglingLink = path.join(assetsRoot, 'cards', 'lost-cities');
    fs.mkdirSync(path.dirname(danglingLink), { recursive: true });
    fs.symlinkSync('../../tce-gone/public/assets/cards/lost-cities', danglingLink, 'dir');
  }

  it('compose: false leaves public/assets byte-for-byte untouched at both hooks', () => {
    // Test isolation (CG-0MWW6BWZB00968NQ): a Vitest-context build must not
    // create, replace, remove OR prune anything in the shared tree.
    const root = makeLauncherFixture({ siblings: ['golf', 'main-street'] });
    seedDestructiveCompositionState(root);
    const before = snapshotAssetsTree(root);

    const infos: string[] = [];
    const logger = { info: (m: string) => infos.push(m), warn: (m: string) => infos.push(m) };
    const plugin = gameAssetsPlugin({
      projectRoot: root,
      env: { GAMES_CONFIG: 'preset' },
      compose: false,
    });

    (plugin.configResolved as (config: unknown) => void)({ root, logger });
    (plugin.buildStart as () => void)();

    expect(snapshotAssetsTree(root)).toEqual(before);
    // The no-op is silent: no composition or prune log line is emitted.
    expect(infos).toEqual([]);
  });

  it('composition stays the default: compose: true still composes, removes and prunes', () => {
    // The opt-out must never become the default. An explicit `compose: true`
    // (and an omitted option) must perform the full destructive pass.
    const root = makeLauncherFixture({ siblings: ['golf', 'main-street'] });
    seedDestructiveCompositionState(root);
    const plugin = gameAssetsPlugin({
      projectRoot: root,
      env: { GAMES_CONFIG: 'preset' },
      compose: true,
    });

    (plugin.configResolved as (config: unknown) => void)({
      root,
      logger: { info: () => {}, warn: () => {} },
    });

    const assetsRoot = path.join(root, 'public', 'assets');
    // Selected games are linked…
    expect(isSymlink(path.join(assetsRoot, 'games', 'golf'))).toBe(true);
    expect(isSymlink(path.join(assetsRoot, 'games', 'main-street'))).toBe(true);
    // …the unselected game's stale link is removed…
    expect(fs.lstatSync(path.join(assetsRoot, 'games', 'lost-cities'), { throwIfNoEntry: false })).toBeUndefined();
    // …and the dangling link is pruned.
    expect(fs.lstatSync(path.join(assetsRoot, 'cards', 'lost-cities'), { throwIfNoEntry: false })).toBeUndefined();
  });
});

/**
 * Isolation contract for automated builds (CG-0MWW8CWPB004TIUF, parent
 * CG-0MWW6BWZB00968NQ).
 *
 * Several unit tests build the **real** project root (real `vite.config.ts`,
 * real `public/`). Composition is destructive by design (it creates, replaces
 * and removes links), so when two of those builds pinned different presets
 * they raced over the shared `public/assets/games` tree: one worker's
 * `core-only` composition removed `games/main-street` while another worker's
 * Vite `copyDir` was stats-ing it, aborting the copy with `ENOENT`.
 *
 * This test is the **reproduction**: it establishes a `full` baseline inside
 * the test, then runs a real-root `build()` on the `core-only` preset (the
 * mutator from the report) and asserts the composed-link set is unchanged. On
 * the pre-fix behaviour the build removes every `full` link (red); once
 * Vitest-context builds opt out of composition it mutates nothing (green).
 * The assertions are on observable filesystem state — no sleeps, no polling,
 * no retries.
 */
describe('real-root build isolation (CG-0MWW6BWZB00968NQ)', () => {
  /** One entry observed under `public/assets/games/`. */
  interface ComposedEntry {
    /** Path relative to `public/assets/games/`, using `/` separators. */
    relativePath: string;
    /** `readlink` target for a symlink; a sentinel for a real entry. */
    target: string;
  }

  const REAL_GAMES_ASSETS = path.join(REPO_ROOT, 'public', 'assets', 'games');
  const REAL_ENTRY_SENTINEL = '[not-a-symlink]';

  /**
   * Snapshot the composed-link set under the real `public/assets/games/`:
   * one `{ relativePath, target }` entry per link (and a sentinel entry for
   * every real directory/file), sorted by path so equality is order-blind.
   */
  function readComposedLinkSet(): ComposedEntry[] {
    const entries: ComposedEntry[] = [];
    const walk = (dir: string): void => {
      for (const name of fs.readdirSync(dir)) {
        const abs = path.join(dir, name);
        const stat = fs.lstatSync(abs);
        const relativePath = path.relative(REAL_GAMES_ASSETS, abs).split(path.sep).join('/');
        if (stat.isSymbolicLink()) {
          // Record the raw link target: a link re-pointed elsewhere is a
          // mutation even when its resolved contents look the same.
          entries.push({ relativePath, target: fs.readlinkSync(abs) });
        } else {
          entries.push({ relativePath, target: REAL_ENTRY_SENTINEL });
          if (stat.isDirectory()) walk(abs);
        }
      }
    };
    if (fs.existsSync(REAL_GAMES_ASSETS)) walk(REAL_GAMES_ASSETS);
    return entries.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  }

  it('a real-root build leaves the composed game-asset link set unchanged', async (ctx) => {
    const fullPreset = JSON.parse(
      fs.readFileSync(path.join(REPO_ROOT, 'configs', 'full.json'), 'utf-8'),
    ) as { games: Array<{ id: string }> };

    // Establish the baseline deterministically *inside* the test, so it cannot
    // pass trivially on a tree an earlier `core-only` run already stripped.
    const baseline = composeGameAssets({
      projectRoot: REPO_ROOT,
      env: { GAMES_CONFIG: 'full' },
      layoutPath: REAL_LAYOUT,
    });
    if (baseline.missingGames.length === fullPreset.games.length) {
      ctx.skip(
        'no sibling game checkouts present (composeGameAssets reports every selected ' +
          'game under missingGames) — the real-root mutation assertion would be vacuous',
      );
      return;
    }

    const before = readComposedLinkSet();

    // A partially bootstrapped distribution can be present yet compose no
    // `games/` link (e.g. only audio-only siblings checked out). Assert the
    // baseline is observable whenever some present game owns a `games/` root,
    // so an equality check over two empty sets is never mistaken for proof.
    const ownership = readGameAssetOwnership(REAL_LAYOUT);
    const presentGamesDirOwners = fullPreset.games
      .map((game) => game.id)
      .filter((id) => !baseline.missingGames.includes(id))
      .filter((id) =>
        ownership.some((o) => o.game === id && o.assets.some((a) => a.startsWith('games/'))),
      );
    if (presentGamesDirOwners.length > 0) expect(before.length).toBeGreaterThan(0);

    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tce-real-root-build-'));
    const previousPreset = process.env.GAMES_CONFIG;
    // The preset from the bug report: with composition ON this removes every
    // `full` link the baseline just composed.
    process.env.GAMES_CONFIG = 'core-only';
    try {
      await build({
        mode: 'development',
        root: REPO_ROOT,
        configFile: path.join(REPO_ROOT, 'vite.config.ts'),
        logLevel: 'silent',
        build: { outDir, emptyOutDir: true, sourcemap: false },
      });

      expect(readComposedLinkSet()).toEqual(before);
    } finally {
      if (previousPreset === undefined) delete process.env.GAMES_CONFIG;
      else process.env.GAMES_CONFIG = previousPreset;
      fs.rmSync(outDir, { recursive: true, force: true });
    }
  }, 120_000);
});

describe('worktree-aware sibling resolution (CG-0MWTVP7AI008RAPB)', () => {
  /**
   * A distribution layout in its **canonical** form: preset sibling paths are
   * `../tce-<game>`, i.e. siblings of the main checkout — never of the
   * worktree, whose parent is `.worklog/worktrees/`.
   *
   * ```text
   * <parent>/
   *   tableau-card-engine/            main checkout (.worklog/ + configs/)
   *     .worklog/worktrees/wl-X/      linked worktree (configs/ only)
   *   tce-golf/                       canonical sibling game repo
   * ```
   */
  function makeWorktreeLayout(options: {
    games: string[];
    /** Write the active preset into the main checkout too (default true). */
    presetInMain?: boolean;
  }): { parent: string; main: string; worktree: string } {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'tce-wt-assets-'));
    tmpDirs.push(parent);
    const main = path.join(parent, 'tableau-card-engine');
    const worktree = path.join(main, '.worklog', 'worktrees', 'wl-CG-X');

    for (const root of [main, worktree]) {
      fs.mkdirSync(path.join(root, 'configs'), { recursive: true });
      fs.mkdirSync(path.join(root, 'scripts', 'configs'), { recursive: true });
      fs.mkdirSync(path.join(root, 'public', 'assets'), { recursive: true });
      fs.writeFileSync(
        path.join(root, 'scripts', 'configs', 'repo-layout.json'),
        JSON.stringify({ gameAssets: FIXTURE_OWNERSHIP }, null, 2),
      );
    }
    fs.mkdirSync(path.join(main, '.worklog', 'worktrees'), { recursive: true });

    const games = options.games.map((id) => ({
      id,
      path: `../tce-${id}`,
      scenePath: `src/scenes/${id}Scene.ts`,
    }));
    for (const presetRoot of options.presetInMain === false ? [worktree] : [main, worktree]) {
      fs.writeFileSync(
        path.join(presetRoot, 'configs', 'preset.json'),
        JSON.stringify({ games }, null, 2),
      );
    }

    for (const id of options.games) {
      const owned = FIXTURE_OWNERSHIP.find((o) => o.game === id);
      if (!owned) continue;
      for (const asset of owned.assets) {
        const source = path.join(parent, `tce-${id}`, 'public', 'assets', asset);
        fs.mkdirSync(source, { recursive: true });
        fs.writeFileSync(path.join(source, 'marker.txt'), `canonical:${id}:${asset}`);
      }
    }

    return { parent, main, worktree };
  }

  it('anchors planGameAssetLinks on the main checkout, not the worktree parent', () => {
    const { parent, worktree } = makeWorktreeLayout({ games: ['golf'] });
    // Decoy: another item's game checkout sitting where `<worktree>/../tce-golf`
    // resolves. Before the fix this is what a worktree build composed.
    const decoy = path.join(parent, 'tableau-card-engine', '.worklog', 'worktrees', 'tce-golf');
    for (const asset of ['audio/golf', 'games/golf']) {
      const source = path.join(decoy, 'public', 'assets', asset);
      fs.mkdirSync(source, { recursive: true });
      fs.writeFileSync(path.join(source, 'marker.txt'), `decoy:golf:${asset}`);
    }

    const plan = planGameAssetLinks({
      projectRoot: worktree,
      selectedGames: [{ id: 'golf', path: '../tce-golf' }],
      ownership: FIXTURE_OWNERSHIP,
      env: { GAMES_CONFIG: 'preset' },
    });

    expect(plan.missingGames).toEqual([]);
    expect(plan.missingAssets).toEqual([]);
    expect(plan.links.map((l) => l.source).sort()).toEqual([
      path.join(parent, 'tce-golf', 'public', 'assets', 'audio', 'golf'),
      path.join(parent, 'tce-golf', 'public', 'assets', 'games', 'golf'),
    ]);
    for (const link of plan.links) {
      expect(link.source).not.toContain(`.worklog${path.sep}worktrees${path.sep}tce-`);
    }
  });

  it('composes the canonical sibling assets from a worktree build', () => {
    const { parent, worktree } = makeWorktreeLayout({ games: ['golf'] });

    const report = composeGameAssets({
      projectRoot: worktree,
      env: { GAMES_CONFIG: 'preset' },
      layoutPath: path.join(worktree, 'scripts', 'configs', 'repo-layout.json'),
    });

    expect(report.missingGames).toEqual([]);
    expect(report.linked.map((l) => l.asset).sort()).toEqual(['audio/golf', 'games/golf']);
    // The link lives in the worktree's own public/assets (the tree Vite copies)
    // but serves the main checkout's sibling game assets.
    const composed = path.join(worktree, 'public', 'assets', 'games', 'golf');
    expect(fs.realpathSync(composed)).toBe(
      fs.realpathSync(path.join(parent, 'tce-golf', 'public', 'assets', 'games', 'golf')),
    );
    expect(fs.readFileSync(path.join(composed, 'marker.txt'), 'utf-8')).toBe(
      'canonical:golf:games/golf',
    );
  });

  it('leaves a main-checkout build resolving exactly as before', () => {
    const { parent, main } = makeWorktreeLayout({ games: ['golf'] });

    const plan = planGameAssetLinks({
      projectRoot: main,
      selectedGames: [{ id: 'golf', path: '../tce-golf' }],
      ownership: FIXTURE_OWNERSHIP,
      env: { GAMES_CONFIG: 'preset' },
    });

    expect(plan.missingGames).toEqual([]);
    expect(plan.links.map((l) => l.source).sort()).toEqual([
      path.join(parent, 'tce-golf', 'public', 'assets', 'audio', 'golf'),
      path.join(parent, 'tce-golf', 'public', 'assets', 'games', 'golf'),
    ]);
  });

  it('does not treat a .worklog ancestor without the active preset as the main checkout', () => {
    // Conservative detection: the ancestor must carry the preset the build
    // selected, so an unrelated parent holding a `.worklog/` directory cannot
    // silently redirect sibling resolution.
    const { worktree } = makeWorktreeLayout({ games: ['golf'], presetInMain: false });

    const plan = planGameAssetLinks({
      projectRoot: worktree,
      selectedGames: [{ id: 'golf', path: '../tce-golf' }],
      ownership: FIXTURE_OWNERSHIP,
      env: { GAMES_CONFIG: 'preset' },
    });

    expect(plan.links).toEqual([]);
    expect(plan.missingGames).toEqual(['golf']);
  });
});

describe('layout contract integration', () => {
  it('the full preset composes a link for every sibling that is checked out', () => {
    // Only run the on-disk sibling check when the distribution is bootstrapped;
    // a game-free core checkout legitimately has no ../tce-* directories.
    const allGames = readGameAssetOwnership(REAL_LAYOUT).map((o) => o.game);
    const present = allGames.filter((g) =>
      fs.existsSync(path.resolve(REPO_ROOT, '..', `tce-${g}`)),
    );
    if (present.length === 0) return;

    const realConfig = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'configs', 'full.json'), 'utf-8'));
    const plan = planGameAssetLinks({
      projectRoot: REPO_ROOT,
      selectedGames: realConfig.games.map((g: { id: string; path: string }) => ({
        id: g.id,
        path: g.path,
      })),
      ownership: readGameAssetOwnership(REAL_LAYOUT),
    });

    for (const game of present) {
      expect(plan.links.some((l) => l.game === game)).toBe(true);
      expect(plan.missingGames).not.toContain(game);
    }
  });
});
