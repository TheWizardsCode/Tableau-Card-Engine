/**
 * Unit tests for the per-game repo scaffold (F4 / CG-0MTRO72W5003ECAK).
 *
 * The scaffold turns an extracted game tree (F1) into a runnable single-game
 * launcher: root configs (`package.json`, `vite.config.ts`, `tsconfig.json`,
 * `main.ts`, `env.d.ts`, `index.html`), a single-game `configs/game.json`
 * preset, and the `src`/`core` symlinks into the sibling core checkout. These
 * tests exercise the pure templates and a real scaffold over a temporary
 * fixture, then prove the generated preset is discovered by the F3 plugin.
 *
 * No browser, no npm install, no network.
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  DEFAULT_CORE_REL,
  DEFAULT_GAME_PRESET,
  defaultScenePath,
  findGameInPreset,
  linkSharedAssets,
  pascalCase,
  readLayoutGames,
  renderPackageJson,
  renderPreset,
  renderTsconfig,
  renderViteConfig,
  scaffoldGameRepo,
  type CoreManifest,
} from '../../scripts/game-repo-scaffold';
import {
  discoverGames,
  loadGamesConfig,
} from '../../scripts/vite-game-discovery-plugin';

const GAMES = [
  'golf',
  'beleaguered-castle',
  'blackjack',
  'sushi-go',
  'feudalism',
  'lost-cities',
  'main-street',
  'coloretto',
] as const;

const MANIFEST: CoreManifest = {
  version: '9.9.9',
  scripts: {
    'save-load-smoke': 'vite-node example-games/main-street/scripts/save-load-smoke.ts',
    build: 'core-build',
  },
  dependencies: { phaser: '4.0.0-rc.7' },
  devDependencies: { vite: '^6.1.0', vitest: '^3.0.0', typescript: '^5.7.0' },
};

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = '';
});

afterEach(() => {
  if (tmpRoot) fs.rmSync(tmpRoot, { recursive: true, force: true });
});

/** Build a minimal sibling layout: core checkout + extracted game repo. */
function makeLayout(game: string): { core: string; gameRepo: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tce-scaffold-'));
  tmpRoot = root;

  const core = path.join(root, 'tableau-card-engine-core');
  fs.mkdirSync(path.join(core, 'configs'), { recursive: true });
  fs.mkdirSync(path.join(core, 'src', 'card-system'), { recursive: true });
  fs.mkdirSync(path.join(core, 'scripts', 'adapters'), { recursive: true });
  fs.mkdirSync(path.join(core, 'tests', 'helpers'), { recursive: true });
  fs.mkdirSync(path.join(core, 'example-games', 'gym'), { recursive: true });
  fs.writeFileSync(path.join(core, 'package.json'), JSON.stringify(MANIFEST));
  fs.writeFileSync(path.join(core, 'index.html'), '<html><body></body></html>\n');
  fs.writeFileSync(
    path.join(core, 'configs', 'full.json'),
    JSON.stringify({
      games: [
        {
          id: game,
          path: `../tce-${game}`,
          scenePath: defaultScenePath(game),
        },
      ],
    }),
  );

  const gameRepo = path.join(root, `tce-${game}`);
  const sceneDir = path.join(gameRepo, 'example-games', game, 'scenes');
  fs.mkdirSync(sceneDir, { recursive: true });
  fs.writeFileSync(
    path.join(sceneDir, `${pascalCase(game)}Scene.ts`),
    [
      `export class ${pascalCase(game)}Scene {}`,
      'export const GAME_INFO = {',
      "  sceneKey: 'X',",
      "  title: 'X',",
      "  description: 'demo',",
      '};',
      '',
    ].join('\n'),
  );
  return { core, gameRepo };
}

// ── Shared asset linking ──────────────────────────────────────────────────

describe('linkSharedAssets', () => {
  it('links the core shared assets into the game repo public tree', () => {
    const { core, gameRepo } = makeLayout('golf');
    fs.mkdirSync(path.join(core, 'public', 'assets', 'audio', 'default'), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(core, 'public', 'assets', 'audio', 'default', 'game-win.wav'),
      'x',
    );
    fs.mkdirSync(path.join(core, 'scripts', 'configs'), { recursive: true });
    fs.writeFileSync(
      path.join(core, 'scripts', 'configs', 'repo-layout.json'),
      JSON.stringify({ sharedAssets: ['audio/default/'] }),
    );

    const linked = linkSharedAssets(gameRepo, core);
    expect(linked).toHaveLength(1);
    expect(
      fs.realpathSync(path.join(gameRepo, 'public', 'assets', 'audio', 'default')),
    ).toBe(fs.realpathSync(path.join(core, 'public', 'assets', 'audio', 'default')));
    // Re-running does not recreate an existing link (idempotent).
    expect(linkSharedAssets(gameRepo, core)).toHaveLength(0);
  });

  it('is a no-op when the core has no asset layout', () => {
    const { core, gameRepo } = makeLayout('golf');
    expect(linkSharedAssets(gameRepo, core)).toEqual([]);
  });
});

// ── Naming helpers ────────────────────────────────────────────────────────

describe('game id helpers', () => {
  it('maps every shipped game id to its scene module path', () => {
    expect(defaultScenePath('golf')).toBe('example-games/golf/scenes/GolfScene.ts');
    expect(defaultScenePath('beleaguered-castle')).toBe(
      'example-games/beleaguered-castle/scenes/BeleagueredCastleScene.ts',
    );
    expect(defaultScenePath('blackjack')).toBe(
      'example-games/blackjack/scenes/BlackjackScene.ts',
    );
    expect(defaultScenePath('sushi-go')).toBe(
      'example-games/sushi-go/scenes/SushiGoScene.ts',
    );
    expect(defaultScenePath('feudalism')).toBe(
      'example-games/feudalism/scenes/FeudalismScene.ts',
    );
    expect(defaultScenePath('lost-cities')).toBe(
      'example-games/lost-cities/scenes/LostCitiesScene.ts',
    );
    expect(defaultScenePath('main-street')).toBe(
      'example-games/main-street/scenes/MainStreetScene.ts',
    );
    expect(defaultScenePath('coloretto')).toBe(
      'example-games/coloretto/scenes/ColorettoScene.ts',
    );
  });

  it('pascal-cases kebab ids', () => {
    expect(pascalCase('main-street')).toBe('MainStreet');
    expect(pascalCase('golf')).toBe('Golf');
  });
});

// ── Templates ─────────────────────────────────────────────────────────────

describe('renderPackageJson', () => {
  it('names the repo for the game and reuses the core toolchain deps', () => {
    const pkg = JSON.parse(renderPackageJson('golf', MANIFEST, DEFAULT_CORE_REL));
    expect(pkg.name).toBe('tce-golf');
    expect(pkg.version).toBe('9.9.9');
    expect(pkg.type).toBe('module');
    // Game-specific toolchain scripts are inherited from the core manifest…
    expect(pkg.scripts['save-load-smoke']).toContain('save-load-smoke');
    // …while the repo entry points override the core's.
    expect(pkg.scripts.build).toContain('tsc --noEmit');
    expect(pkg.scripts.dev).toContain('vite');
    expect(pkg.scripts['build:electron']).toContain('--mode electron');
    expect(pkg.scripts.test).toBe('vitest run --project unit');
    expect(pkg.dependencies).toEqual(MANIFEST.dependencies);
    expect(pkg.devDependencies).toEqual(MANIFEST.devDependencies);
  });
});

describe('renderViteConfig', () => {
  it('imports the discovery plugin and aliases from the sibling core', () => {
    const src = renderViteConfig('golf', DEFAULT_CORE_REL);
    expect(src).toContain("from '../tableau-card-engine-core/scripts/vite-game-discovery-plugin'");
    expect(src).toContain('gameDiscoveryPlugin({ projectRoot: __dirname, coreRoot, env: presetEnv })');
    expect(src).toContain("GAMES_CONFIG: process.env.GAMES_CONFIG ?? 'game'");
    expect(src).toContain('resolveCoreAliases(coreRoot)');
    expect(src).toContain("name: 'unit'");
  });
});

describe('renderTsconfig', () => {
  it('points every core alias at the sibling core checkout', () => {
    const cfg = JSON.parse(renderTsconfig('golf', DEFAULT_CORE_REL));
    for (const [key, expected] of [
      ['@core-engine/*', 'src/core-engine/*'],
      ['@card-system/*', 'src/card-system/*'],
      ['@rule-engine/*', 'src/rule-engine/*'],
      ['@ui/*', 'src/ui/*'],
      ['@ai/*', 'src/ai/*'],
    ] as const) {
      expect(cfg.compilerOptions.paths[key]).toEqual([
        `${DEFAULT_CORE_REL}/${expected}`,
      ]);
    }
    expect(cfg.include).toContain('example-games/golf/**/*.ts');
    expect(cfg.include).toContain('tests/**/*.ts');
  });
});

describe('renderPreset', () => {
  it('selects exactly one game, resolved locally', () => {
    const preset = JSON.parse(
      renderPreset('golf', 'example-games/golf/scenes/GolfScene.ts'),
    );
    expect(preset.games).toHaveLength(1);
    expect(preset.games[0]).toEqual({
      id: 'golf',
      path: '.',
      scenePath: 'example-games/golf/scenes/GolfScene.ts',
    });
  });

  it('includes an adapter path where the game supports replay', () => {
    const preset = JSON.parse(
      renderPreset('golf', 'example-games/golf/scenes/GolfScene.ts', 'example-games/golf/scripts/adapters/GolfReplayAdapter.ts'),
    );
    expect(preset.games[0].adapterPath).toContain('GolfReplayAdapter');
  });
});

describe('findGameInPreset', () => {
  it('reads the scene path for a game from the core full.json preset', () => {
    const { core } = makeLayout('golf');
    expect(findGameInPreset(core, 'golf')?.scenePath).toBe(
      'example-games/golf/scenes/GolfScene.ts',
    );
  });

  it('returns undefined for an unknown game or absent preset', () => {
    const { core } = makeLayout('golf');
    expect(findGameInPreset(core, 'ghost')).toBeUndefined();
    expect(findGameInPreset(path.join(tmpRoot, 'nope'), 'golf')).toBeUndefined();
  });
});

// ── End-to-end scaffold over a fixture ────────────────────────────────────

describe('scaffoldGameRepo', () => {
  it('writes the root configs, preset and core symlinks', () => {
    const { core, gameRepo } = makeLayout('golf');
    const result = scaffoldGameRepo({ game: 'golf', gameRepoRoot: gameRepo, coreRoot: core });

    for (const file of [
      'package.json',
      'vite.config.ts',
      'tsconfig.json',
      'env.d.ts',
      'main.ts',
      'index.html',
      `configs/${DEFAULT_GAME_PRESET}.json`,
    ]) {
      expect(fs.existsSync(path.join(gameRepo, file)), `${file} missing`).toBe(true);
    }
    expect(result.presetPath).toBe(path.join(gameRepo, 'configs', `${DEFAULT_GAME_PRESET}.json`));

    // The symlinks make root-relative `../../src`, `../../scripts` and
    // `../../example-games/gym` imports resolve to the core checkout.
    expect(fs.lstatSync(path.join(gameRepo, 'src')).isSymbolicLink()).toBe(true);
    expect(fs.realpathSync(path.join(gameRepo, 'src'))).toBe(fs.realpathSync(path.join(core, 'src')));
    expect(fs.realpathSync(path.join(gameRepo, 'scripts'))).toBe(fs.realpathSync(path.join(core, 'scripts')));
    expect(fs.realpathSync(path.join(gameRepo, 'example-games', 'gym'))).toBe(
      fs.realpathSync(path.join(core, 'example-games', 'gym')),
    );
    expect(fs.realpathSync(path.join(gameRepo, 'core'))).toBe(fs.realpathSync(core));
    expect(fs.realpathSync(path.join(gameRepo, 'tests', 'helpers'))).toBe(
      fs.realpathSync(path.join(core, 'tests', 'helpers')),
    );
  });

  it('produces a preset the discovery plugin resolves to exactly one game', () => {
    const { core, gameRepo } = makeLayout('main-street');
    scaffoldGameRepo({ game: 'main-street', gameRepoRoot: gameRepo, coreRoot: core });

    const presetPath = path.join(gameRepo, 'configs', `${DEFAULT_GAME_PRESET}.json`);
    const config = loadGamesConfig(presetPath);
    const games = discoverGames(config, gameRepo);

    expect(games).toHaveLength(1);
    expect(games[0].id).toBe('main-street');
    expect(games[0].info.description).toBe('demo');
    expect(games[0].absoluteScenePath).toBe(
      path.join(gameRepo, 'example-games', 'main-street', 'scenes', 'MainStreetScene.ts'),
    );
  });

  it('is idempotent (a re-scaffold does not recreate the symlinks)', () => {
    const { core, gameRepo } = makeLayout('blackjack');
    const first = scaffoldGameRepo({ game: 'blackjack', gameRepoRoot: gameRepo, coreRoot: core });
    const second = scaffoldGameRepo({ game: 'blackjack', gameRepoRoot: gameRepo, coreRoot: core });
    expect(first.symlinks.length).toBe(5);
    expect(second.symlinks.length).toBe(0);
    expect(fs.realpathSync(path.join(gameRepo, 'core'))).toBe(fs.realpathSync(core));
  });

  it('fails fast when the game repo root does not exist', () => {
    const { core } = makeLayout('golf');
    expect(() =>
      scaffoldGameRepo({ game: 'golf', gameRepoRoot: path.join(tmpRoot, 'nope'), coreRoot: core }),
    ).toThrow(/game repo root/i);
  });

  it('fails fast when the core checkout does not exist', () => {
    const { gameRepo } = makeLayout('golf');
    expect(() =>
      scaffoldGameRepo({ game: 'golf', gameRepoRoot: gameRepo, coreRoot: path.join(tmpRoot, 'nope') }),
    ).toThrow(/core checkout/i);
  });
});

// ── Every shipped game scaffolds ──────────────────────────────────────────

describe('readLayoutGames', () => {
  it('lists every game from the F1 repo-layout contract', () => {
    const layout = path.resolve(
      __dirname,
      '..',
      '..',
      'scripts',
      'configs',
      'repo-layout.json',
    );
    expect(readLayoutGames(layout).sort()).toEqual([...GAMES].sort());
  });
});

describe('all shipped games', () => {
  for (const game of GAMES) {
    it(`scaffolds ${game} with a single-game preset`, () => {
      const { core, gameRepo } = makeLayout(game);
      scaffoldGameRepo({ game, gameRepoRoot: gameRepo, coreRoot: core });
      const config = loadGamesConfig(
        path.join(gameRepo, 'configs', `${DEFAULT_GAME_PRESET}.json`),
      );
      expect(config.games.map((g) => g.id)).toEqual([game]);
    });
  }
});
