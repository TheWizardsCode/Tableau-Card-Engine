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

import {
  composeGameAssets,
  planGameAssetLinks,
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
      ].sort(),
    );
    // Trailing slashes are stripped so the paths join cleanly.
    expect(byGame.get('golf')).toContain('games/golf');
    expect(byGame.get('lost-cities')).toContain('cards/lost-cities');
    expect(byGame.get('blackjack')).toContain('audio/blackjack');
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
