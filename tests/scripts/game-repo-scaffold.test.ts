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
  CORE_REMOTE,
  DEFAULT_CORE_REL,
  DEFAULT_GAME_PRESET,
  GAME_INITIAL_VERSION,
  defaultScenePath,
  findGameInPreset,
  linkSharedAssets,
  linkSharedPublicAssets,
  pascalCase,
  readExistingPackageVersion,
  readLayoutGames,
  renderMainTs,
  renderPackageJson,
  renderPreset,
  renderTsconfig,
  renderViteConfig,
  scaffoldGameRepo,
  toGameRepoPath,
  type CoreManifest,
} from '../../scripts/game-repo-scaffold';
import {
  discoverGames,
  loadGamesConfig,
} from '../../scripts/vite-game-discovery-plugin';
import { DEV_WATCH_IGNORE_PATTERNS } from '../../scripts/vite-transcript-plugin';

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

/** The root app-icon files a game repo composes from the core (CG-0MUUFZSE90061KKL). */
const ROOT_ICONS = [
  'favicon.svg',
  'apple-touch-icon.png',
  'icon-32.png',
  'icon-192.png',
  'icon-512.png',
  'site.webmanifest',
] as const;

/**
 * Populate a fixture core with the root app-icon files and the
 * `sharedPublicRoot` layout that names them, mirroring the real core layout.
 */
function writeCoreIconLayout(core: string): void {
  fs.mkdirSync(path.join(core, 'public'), { recursive: true });
  for (const icon of ROOT_ICONS) {
    fs.writeFileSync(path.join(core, 'public', icon), `${icon}\n`);
  }
  fs.mkdirSync(path.join(core, 'scripts', 'configs'), { recursive: true });
  fs.writeFileSync(
    path.join(core, 'scripts', 'configs', 'repo-layout.json'),
    JSON.stringify({ sharedPublicRoot: [...ROOT_ICONS] }),
  );
}

const MANIFEST: CoreManifest = {
  version: '9.9.9',
  scripts: {
    'save-load-smoke': 'vite-node example-games/golf/scripts/save-load-smoke.ts',
    build: 'core-build',
  },
  dependencies: { phaser: '4.0.0-rc.7' },
  devDependencies: { vite: '^6.1.0', vitest: '^3.0.0', typescript: '^5.7.0' },
};

/**
 * Extract the balanced `resolve: { … }` body from a rendered/scaffolded Vite
 * config. Locating the block keeps the dedupe assertions placement-aware: a
 * bare `toContain` on the whole file would also pass if the guard drifted into
 * an unrelated option (e.g. `build.dedupe`).
 */
function extractResolveBlock(src: string): string {
  const key = src.indexOf('resolve: {');
  expect(key, 'resolve block missing from the rendered config').toBeGreaterThanOrEqual(0);
  const open = src.indexOf('{', key);
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(open + 1, i);
    }
  }
  throw new Error('unbalanced resolve block in the rendered config');
}

/**
 * Extract the balanced `plugins: [ … ]` body from a rendered/scaffolded Vite
 * config. Placement-aware like {@link extractResolveBlock}: a bare `toContain`
 * on the whole file would also pass if the registration drifted into an
 * unrelated array (e.g. a plugin's own `plugins` option).
 */
function extractPluginsBlock(src: string): string {
  const key = src.indexOf('plugins: [');
  expect(key, 'plugins array missing from the rendered config').toBeGreaterThanOrEqual(0);
  const open = src.indexOf('[', key);
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === '[') depth += 1;
    else if (src[i] === ']') {
      depth -= 1;
      if (depth === 0) return src.slice(open + 1, i);
    }
  }
  throw new Error('unbalanced plugins array in the rendered config');
}

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

  const core = path.join(root, 'Tableau-Card-Engine');
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
  const sceneDir = path.join(gameRepo, 'src', 'scenes');
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
  // The game's own tests still reach the game tree via the monorepo
  // `example-games/<game>/…` prefix; the scaffold rewrites it to `src/`.
  // They may also import core-owned `scripts/…` modules (present only in the
  // core checkout) and game-owned `scripts/…` modules (present locally).
  const testDir = path.join(gameRepo, 'tests', game);
  fs.mkdirSync(testDir, { recursive: true });
  // A game-owned script lives under the game tree (`src/scripts/`).
  fs.mkdirSync(path.join(gameRepo, 'src', 'scripts'), { recursive: true });
  fs.writeFileSync(
    path.join(gameRepo, 'src', 'scripts', 'game-script.ts'),
    'export const g = 1;\n',
  );
  fs.writeFileSync(
    path.join(testDir, `${pascalCase(game)}.test.ts`),
    [
      `import { ${pascalCase(game)}Scene } from '../../example-games/${game}/scenes/${pascalCase(game)}Scene';`,
      `import { validateTranscriptFile } from '../../scripts/validate-transcript';`,
      `import { g } from '../../src/scripts/game-script';`,
      `spawnSync('node', ['--import', 'tsx/esm', 'scripts/replay.ts']);`,
      `const roots = [{ dir: 'src/ui' }, { dir: 'src/core-engine' }];`,
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

// ── Shared public-root icon linking ───────────────────────────────────────

describe('linkSharedPublicAssets', () => {
  it('links the core root app-icon files into the game repo public root', () => {
    const { core, gameRepo } = makeLayout('golf');
    writeCoreIconLayout(core);

    const linked = linkSharedPublicAssets(gameRepo, core);
    expect(linked).toHaveLength(ROOT_ICONS.length);
    for (const icon of ROOT_ICONS) {
      expect(fs.realpathSync(path.join(gameRepo, 'public', icon))).toBe(
        fs.realpathSync(path.join(core, 'public', icon)),
      );
    }
    // Re-running does not recreate an existing link (idempotent).
    expect(linkSharedPublicAssets(gameRepo, core)).toHaveLength(0);
  });

  it('is a no-op when the core layout has no sharedPublicRoot list', () => {
    const { core, gameRepo } = makeLayout('golf');
    expect(linkSharedPublicAssets(gameRepo, core)).toEqual([]);
  });

  it('skips entries whose core source file is absent', () => {
    const { core, gameRepo } = makeLayout('golf');
    fs.mkdirSync(path.join(core, 'public'), { recursive: true });
    fs.writeFileSync(path.join(core, 'public', 'favicon.svg'), 'x');
    fs.mkdirSync(path.join(core, 'scripts', 'configs'), { recursive: true });
    fs.writeFileSync(
      path.join(core, 'scripts', 'configs', 'repo-layout.json'),
      JSON.stringify({ sharedPublicRoot: ['favicon.svg', 'missing.png'] }),
    );

    const linked = linkSharedPublicAssets(gameRepo, core);
    expect(linked).toHaveLength(1);
    expect(path.basename(linked[0])).toBe('favicon.svg');
    expect(fs.existsSync(path.join(gameRepo, 'public', 'missing.png'))).toBe(false);
  });
});

// ── Naming helpers ────────────────────────────────────────────────────────

describe('game id helpers', () => {
  it('maps every shipped game id to its scene module path', () => {
    expect(defaultScenePath('golf')).toBe('src/scenes/GolfScene.ts');
    expect(defaultScenePath('beleaguered-castle')).toBe(
      'src/scenes/BeleagueredCastleScene.ts',
    );
    expect(defaultScenePath('blackjack')).toBe(
      'src/scenes/BlackjackScene.ts',
    );
    expect(defaultScenePath('sushi-go')).toBe(
      'src/scenes/SushiGoScene.ts',
    );
    expect(defaultScenePath('feudalism')).toBe(
      'src/scenes/FeudalismScene.ts',
    );
    expect(defaultScenePath('lost-cities')).toBe(
      'src/scenes/LostCitiesScene.ts',
    );
    expect(defaultScenePath('main-street')).toBe(
      'src/scenes/MainStreetScene.ts',
    );
    expect(defaultScenePath('coloretto')).toBe(
      'src/scenes/ColorettoScene.ts',
    );
  });

  it('translates a monorepo game-tree path to the src/ layout', () => {
    expect(toGameRepoPath('example-games/golf/GolfGame.ts', 'golf')).toBe(
      'src/GolfGame.ts',
    );
    expect(
      toGameRepoPath('example-games/golf/scripts/adapters/GolfReplayAdapter.ts', 'golf'),
    ).toBe('src/scripts/adapters/GolfReplayAdapter.ts');
    // Paths that do not reference this game's tree are unchanged.
    expect(toGameRepoPath('src/scenes/GolfScene.ts', 'golf')).toBe(
      'src/scenes/GolfScene.ts',
    );
    expect(toGameRepoPath('example-games/main-street/MainStreetEngine.ts', 'golf')).toBe(
      'example-games/main-street/MainStreetEngine.ts',
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
    expect(pkg.type).toBe('module');
    // Game-specific toolchain scripts are inherited from the core manifest…
    expect(pkg.scripts['save-load-smoke']).toContain('src/scripts/save-load-smoke');
    expect(pkg.scripts['save-load-smoke']).not.toContain('example-games/golf/');
    // …while the repo entry points override the core's.
    expect(pkg.scripts.build).toContain('tsc --noEmit');
    expect(pkg.scripts.dev).toContain('vite');
    expect(pkg.scripts['build:electron']).toContain('--mode electron');
    expect(pkg.scripts.test).toBe('vitest run --project unit');
    expect(pkg.dependencies).toEqual(MANIFEST.dependencies);
    expect(pkg.devDependencies).toEqual(MANIFEST.devDependencies);
  });

  it('seeds a new game repo with an engine-independent baseline version', () => {
    // The core manifest deliberately declares a different version: a game repo
    // owns its own version and must never inherit the engine's
    // (CG-0MVGF2QE9008NA5R).
    expect(MANIFEST.version).toBe('9.9.9');
    const pkg = JSON.parse(renderPackageJson('golf', MANIFEST, DEFAULT_CORE_REL));
    expect(pkg.version).toBe(GAME_INITIAL_VERSION);
    expect(pkg.version).toBe('0.1.0');
    expect(pkg.version).not.toBe(MANIFEST.version);
  });

  it('writes an explicitly supplied version verbatim', () => {
    const pkg = JSON.parse(
      renderPackageJson('golf', MANIFEST, DEFAULT_CORE_REL, '1.4.2'),
    );
    expect(pkg.version).toBe('1.4.2');
    // An explicit version is the only thing that can diverge from the baseline;
    // the core manifest version still never leaks through.
    expect(pkg.version).not.toBe(MANIFEST.version);
  });

  it('wires engine:sync into dev builds and engine:verify into release builds', () => {
    const pkg = JSON.parse(renderPackageJson('golf', MANIFEST, DEFAULT_CORE_REL));
    // Dev builds compose the latest engine remote head before compiling
    // (MS-0MVCRGKZY007DIED AC1).
    expect(pkg.scripts.build).toBe('npm run engine:sync && tsc --noEmit && vite build');
    expect(pkg.scripts['build:electron']).toBe(
      'npm run engine:sync && tsc --noEmit && vite build --mode electron',
    );
    // Release builds verify the committed engine pin instead (AC2/AC3).
    expect(pkg.scripts['build:release']).toBe('npm run engine:verify && tsc --noEmit && vite build');
    // The engine-sync script lives in the engine repo — game repos have no
    // root `scripts/` tree (Option C) and invoke it through the submodule.
    expect(pkg.scripts['engine:sync']).toBe(
      `node ${DEFAULT_CORE_REL}/scripts/engine-sync.mjs sync`,
    );
    expect(pkg.scripts['engine:verify']).toBe(
      `node ${DEFAULT_CORE_REL}/scripts/engine-sync.mjs verify`,
    );
  });
});

describe('renderViteConfig', () => {
  it('imports the discovery plugin and aliases from the sibling core', () => {
    const src = renderViteConfig('golf', DEFAULT_CORE_REL);
    expect(src).toContain("from '../Tableau-Card-Engine/scripts/vite-game-discovery-plugin'");
    expect(src).toContain('gameDiscoveryPlugin({ projectRoot: __dirname, coreRoot, env: presetEnv })');
    expect(src).toContain("GAMES_CONFIG: process.env.GAMES_CONFIG ?? 'game'");
    expect(src).toContain('resolveCoreAliases(coreRoot)');
    expect(src).toContain("name: 'unit'");
  });

  it('emits the single-copy resolve.dedupe guard inside the resolve block', () => {
    const src = renderViteConfig('golf', DEFAULT_CORE_REL);
    const block = extractResolveBlock(src);

    // Shared runtime deps must resolve to exactly one copy: a second `phaser`
    // (e.g. from an `npm install` inside the core submodule) becomes a distinct
    // module id, so Node-env unit tests stop mocking it and real Phaser is
    // evaluated on collection (`window is not defined`, MS-0MVK3SF54006Y6A6).
    // Mirrors `resolve.dedupe` in core/vite.config.ts.
    expect(block).toContain("dedupe: ['phaser', 'tone']");
    // Placement contract: the guard sits after the alias entry, in the same
    // `resolve` block.
    expect(block.indexOf("dedupe: ['phaser', 'tone']")).toBeGreaterThan(
      block.indexOf('resolveCoreAliases(coreRoot)'),
    );
    // The list stays exactly the two shared runtime deps.
    const dedupeLine = block
      .split('\n')
      .find((line) => line.trimStart().startsWith('dedupe:'));
    expect(dedupeLine?.trim()).toBe("dedupe: ['phaser', 'tone'],");
    // The rationale comment explains why, so a future maintainer does not drop
    // it as noise.
    expect(block.toLowerCase()).toContain('one copy');
    expect(block).toContain('core/vite.config.ts');
  });

  it('registers the transcript-persist middleware for dev serve only', () => {
    const src = renderViteConfig('main-street', DEFAULT_CORE_REL);
    const plugins = extractPluginsBlock(src);

    // A generated game repo must wire the POST /api/transcripts middleware.
    // Without it every game-over 404s in a normal dev session
    // (`[TranscriptStore] Disk persistence POST returned HTTP 404`,
    // MS-0MVREB31W004F48D).
    expect(src).toContain(
      "import { transcriptPersistPlugin, DEV_WATCH_IGNORE_PATTERNS } from '../Tableau-Card-Engine/scripts/vite-transcript-plugin'",
    );
    // Dev-serve only, and never during a Vitest run: the plugin writes to disk,
    // so registering it under test would add file-system side effects (see
    // docs/DEVELOPER.md § Transcript Persistence). Mirrors core/vite.config.ts.
    expect(plugins).toContain(
      "...(command === 'serve' && !process.env.VITEST ? [transcriptPersistPlugin()] : []),",
    );
    // Placement contract: after the game-discovery plugin, so discovery still
    // runs first (the order core/vite.config.ts uses).
    expect(plugins.indexOf('transcriptPersistPlugin()')).toBeGreaterThan(
      plugins.indexOf('gameDiscoveryPlugin('),
    );
    // The factory must receive `command`, otherwise `command === 'serve'` can
    // never be true and the middleware is silently never registered.
    expect(src).toContain('export default defineConfig(({ command, mode }) => ({');
  });

  it('excludes .worklog and dev-output trees from the Vite file watcher (ENOSPC guard)', () => {
    const src = renderViteConfig('golf', DEFAULT_CORE_REL);
    // The generated config must wire the shared ignore list into the watcher so
    // a recursive watch does not follow .worklog/worktrees symlinks into other
    // project checkouts and exhaust fs.inotify.max_user_watches
    // (CG-0MV5SEHHG000ZKUA).
    // Named import (order-tolerant: the transcript-persist plugin is imported
    // from the same module since MS-0MVREB31W004F48D).
    expect(src).toMatch(
      /import \{[^}]*DEV_WATCH_IGNORE_PATTERNS[^}]*\} from '\.\.\/Tableau-Card-Engine\/scripts\/vite-transcript-plugin'/,
    );
    expect(src).toContain('ignored: [...DEV_WATCH_IGNORE_PATTERNS]');
    // ...and the shared list must actually cover .worklog (the failure mode).
    expect(DEV_WATCH_IGNORE_PATTERNS).toContain('**/.worklog/**');
  });

  it('derives the production Pages base from the package name with a PAGES_BASE override', () => {
    const src = renderViteConfig('main-street', DEFAULT_CORE_REL);

    // Mode gating: electron stays relative, dev stays at root, production is
    // derived — mirroring the generated game-repo configs (MS-0MUQZH5PH001JXLV).
    expect(src).toContain("mode === 'electron' ? './'");
    expect(src).toContain("mode === 'production' ? resolvePagesBase() : '/'");
    expect(src).toContain('PAGES_BASE');

    // Evaluate the emitted helper with injectable pkg/process so the base
    // behaviour (not just its presence) is asserted.
    const fnMatch = src.match(/function resolvePagesBase\(\): string \{([\s\S]*?)\n\}/);
    expect(fnMatch, 'resolvePagesBase missing from scaffolded config').not.toBeNull();
    const body = fnMatch![1];
    const derive = (name: string, pagesBase?: string): string =>
      new Function('pkg', 'process', `return (function () {${body}})();`)(
        { name },
        { env: pagesBase === undefined ? {} : { PAGES_BASE: pagesBase } },
      ) as string;

    expect(derive('tce-main-street')).toBe('/tce-main-street/');
    expect(derive('@scope/game')).toBe('/game/');
    expect(derive('tce-main-street', '/custom-base/')).toBe('/custom-base/');
    expect(derive('tce-main-street', 'custom-base')).toBe('/custom-base/');
    expect(derive('tce-main-street', '/')).toBe('/');
  });
});

describe('renderTsconfig', () => {
  it('points every core alias at the sibling core checkout', () => {
    const cfg = JSON.parse(renderTsconfig('golf', DEFAULT_CORE_REL));
    for (const [key, expected] of [
      ['@core-engine', 'src/core-engine'],
      ['@core-engine/*', 'src/core-engine/*'],
      ['@card-system', 'src/card-system'],
      ['@card-system/*', 'src/card-system/*'],
      ['@rule-engine', 'src/rule-engine'],
      ['@rule-engine/*', 'src/rule-engine/*'],
      ['@ui', 'src/ui'],
      ['@ui/*', 'src/ui/*'],
      ['@ai', 'src/ai'],
      ['@ai/*', 'src/ai/*'],
      ['@balance-cards', 'src/balance-cards'],
      ['@balance-cards/*', 'src/balance-cards/*'],
      ['@story-line', 'src/story-line'],
      ['@story-line/*', 'src/story-line/*'],
      ['@core-scripts/*', 'scripts/*'],
      ['@core-tests/*', 'tests/*'],
      ['@core-gym', 'example-games/gym'],
      ['@core-gym/*', 'example-games/gym/*'],
    ] as const) {
      expect(cfg.compilerOptions.paths[key]).toEqual([
        `${DEFAULT_CORE_REL}/${expected}`,
      ]);
    }
    // Option C: the game tree is at `src/`; no `example-games/` include.
    expect(cfg.include).toContain('src/**/*.ts');
    expect(cfg.include).toContain('tests/**/*.ts');
    expect(cfg.include).not.toContain('example-games/golf/**/*.ts');
  });
});

describe('renderPreset', () => {
  it('selects exactly one game, resolved locally', () => {
    const preset = JSON.parse(renderPreset('golf', 'src/scenes/GolfScene.ts'));
    expect(preset.games).toHaveLength(1);
    expect(preset.games[0]).toEqual({
      id: 'golf',
      path: '.',
      scenePath: 'src/scenes/GolfScene.ts',
    });
  });

  it('includes an adapter path where the game supports replay', () => {
    const preset = JSON.parse(
      renderPreset('golf', 'src/scenes/GolfScene.ts', 'src/scripts/adapters/GolfReplayAdapter.ts'),
    );
    expect(preset.games[0].adapterPath).toContain('GolfReplayAdapter');
  });
});

describe('renderMainTs', () => {
  // CG-0MVTQ3WPV003ZECA: a freshly scaffolded launcher must boot
  // `Phaser.AUTO` (WebGL with Canvas fallback). A generated repo that
  // silently regressed to `Phaser.CANVAS` would lose Phaser 4's Filter
  // pipeline (the Mask filter that replaces the Canvas-only `GeometryMask`).
  it('boots Phaser.AUTO and never Phaser.CANVAS', () => {
    const mainTs = renderMainTs();

    expect(mainTs).toContain('type: Phaser.AUTO');
    expect(mainTs).not.toContain('Phaser.CANVAS');
  });

  it('is written to the scaffolded game repo with the AUTO renderer', () => {
    const { core, gameRepo } = makeLayout('golf');
    scaffoldGameRepo({ game: 'golf', gameRepoRoot: gameRepo, coreRoot: core });

    const written = fs.readFileSync(path.join(gameRepo, 'main.ts'), 'utf-8');
    expect(written).toContain('type: Phaser.AUTO');
    expect(written).not.toContain('Phaser.CANVAS');
  });
});

describe('findGameInPreset', () => {
  it('reads the scene path for a game from the core full.json preset', () => {
    const { core } = makeLayout('golf');
    expect(findGameInPreset(core, 'golf')?.scenePath).toBe(
      'src/scenes/GolfScene.ts',
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
  it('writes a vite.config.ts carrying the single-copy dedupe guard', () => {
    const { core, gameRepo } = makeLayout('golf');
    scaffoldGameRepo({ game: 'golf', gameRepoRoot: gameRepo, coreRoot: core });

    // Assert the real on-disk write: a re-scaffold must not drop the guard the
    // checked-in generated configs (e.g. tce-main-street) rely on.
    const written = fs.readFileSync(path.join(gameRepo, 'vite.config.ts'), 'utf-8');
    const block = extractResolveBlock(written);
    expect(block).toContain("dedupe: ['phaser', 'tone']");
    expect(block.indexOf("dedupe: ['phaser', 'tone']")).toBeGreaterThan(
      block.indexOf('resolveCoreAliases(coreRoot)'),
    );
  });

  it('writes a vite.config.ts carrying the transcript-persist registration', () => {
    const { core, gameRepo } = makeLayout('golf');
    scaffoldGameRepo({ game: 'golf', gameRepoRoot: gameRepo, coreRoot: core });

    // Assert the real on-disk write: a re-scaffold must not drop the
    // registration that keeps a dev session's console free of
    // `/api/transcripts` 404s (MS-0MVREB31W004F48D).
    const written = fs.readFileSync(path.join(gameRepo, 'vite.config.ts'), 'utf-8');
    expect(extractPluginsBlock(written)).toContain(
      "command === 'serve' && !process.env.VITEST ? [transcriptPersistPlugin()] : []",
    );
  });

  it('writes the root configs, preset and only the core link', () => {
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

    // Option C: the game tree occupies `src/`; the legacy `src -> core/src`
    // symlink and the `scripts`/`example-games/gym`/`tests/helpers` symlinks
    // are gone. `src` is a real directory, not a link.
    expect(fs.lstatSync(path.join(gameRepo, 'src')).isSymbolicLink()).toBe(false);
    expect(fs.existsSync(path.join(gameRepo, 'src', 'scenes', 'GolfScene.ts'))).toBe(true);
    expect(fs.lstatSync(path.join(gameRepo, 'scripts'), { throwIfNoEntry: false }) ?? null).toBeNull();
    expect(fs.lstatSync(path.join(gameRepo, 'example-games'), { throwIfNoEntry: false }) ?? null).toBeNull();
    expect(fs.realpathSync(path.join(gameRepo, 'core'))).toBe(fs.realpathSync(core));
    expect(result.symlinks.map((s) => path.basename(s))).toEqual(['core']);

    // The game's own test import is repointed from the monorepo
    // `example-games/golf/…` tree to the `src/` layout.
    const testSrc = fs.readFileSync(
      path.join(gameRepo, 'tests', 'golf', 'Golf.test.ts'),
      'utf-8',
    );
    expect(testSrc).toContain("'../../src/scenes/GolfScene'");
    expect(testSrc).not.toContain('example-games/golf/');
    // A game test invoking a core-owned CLI resolves it through the core link.
    expect(testSrc).toContain("'core/scripts/replay.ts'");
    // A game test scanning a core layer resolves it through the core link too.
    expect(testSrc).toContain("'core/src/ui'");
    expect(testSrc).toContain("'core/src/core-engine'");
    // A relative import of a core-owned script (there is no repository-root
    // `scripts/` tree in a game repo) is repointed at the core-scripts alias;
    // a game-owned script under `src/scripts/` is left untouched.
    expect(testSrc).toContain("'@core-scripts/validate-transcript'");
    expect(testSrc).not.toContain("'../../scripts/validate-transcript'");
    expect(testSrc).toContain("'../../src/scripts/game-script'");
  });

  it('seeds a new game repo package.json with the 0.1.0 baseline', () => {
    const { core, gameRepo } = makeLayout('golf');
    const result = scaffoldGameRepo({
      game: 'golf',
      gameRepoRoot: gameRepo,
      coreRoot: core,
    });

    // Assert the real on-disk write, not just the rendered template.
    const pkg = JSON.parse(
      fs.readFileSync(path.join(gameRepo, 'package.json'), 'utf-8'),
    );
    expect(pkg.version).toBe('0.1.0');
    expect(result.version).toBe('0.1.0');
    expect(result.versionSource).toBe('baseline');
  });

  it('preserves an existing repo version on re-scaffold', () => {
    const { core, gameRepo } = makeLayout('golf');
    scaffoldGameRepo({ game: 'golf', gameRepoRoot: gameRepo, coreRoot: core });

    // Simulate a released game: its own release history owns its version.
    const pkgPath = path.join(gameRepo, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    pkg.version = '0.1.17';
    fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf-8');

    const result = scaffoldGameRepo({
      game: 'golf',
      gameRepoRoot: gameRepo,
      coreRoot: core,
    });

    expect(result.version).toBe('0.1.17');
    expect(result.versionSource).toBe('preserved');
    expect(readExistingPackageVersion(gameRepo)).toBe('0.1.17');
    expect(JSON.parse(fs.readFileSync(pkgPath, 'utf-8')).version).toBe('0.1.17');

    // A further re-scaffold is version-neutral (no drift toward the core's).
    const third = scaffoldGameRepo({
      game: 'golf',
      gameRepoRoot: gameRepo,
      coreRoot: core,
    });
    expect(third.version).toBe('0.1.17');
    expect(third.versionSource).toBe('preserved');
  });

  it('falls back to the baseline when the existing package.json is unusable', () => {
    const { core, gameRepo } = makeLayout('golf');
    const pkgPath = path.join(gameRepo, 'package.json');

    // Malformed JSON is treated as no existing version.
    fs.writeFileSync(pkgPath, '{ not json', 'utf-8');
    expect(readExistingPackageVersion(gameRepo)).toBeUndefined();
    const malformed = scaffoldGameRepo({
      game: 'golf',
      gameRepoRoot: gameRepo,
      coreRoot: core,
    });
    expect(malformed.version).toBe('0.1.0');
    expect(malformed.versionSource).toBe('baseline');

    // A package.json with no string version is treated the same way.
    fs.writeFileSync(pkgPath, JSON.stringify({ name: 'tce-golf' }), 'utf-8');
    expect(readExistingPackageVersion(gameRepo)).toBeUndefined();
    const missingField = scaffoldGameRepo({
      game: 'golf',
      gameRepoRoot: gameRepo,
      coreRoot: core,
    });
    expect(missingField.version).toBe('0.1.0');
    expect(missingField.versionSource).toBe('baseline');
  });

  it('honours an explicit version override over the preserved one', () => {
    const { core, gameRepo } = makeLayout('golf');
    scaffoldGameRepo({ game: 'golf', gameRepoRoot: gameRepo, coreRoot: core });

    const pkgPath = path.join(gameRepo, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    pkg.version = '0.1.17';
    fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf-8');

    const result = scaffoldGameRepo({
      game: 'golf',
      gameRepoRoot: gameRepo,
      coreRoot: core,
      version: '2.0.0',
    });

    expect(result.version).toBe('2.0.0');
    expect(result.versionSource).toBe('explicit');
    expect(JSON.parse(fs.readFileSync(pkgPath, 'utf-8')).version).toBe('2.0.0');
  });

  it('composes the core root app-icon files into public/ and reports them', () => {
    const { core, gameRepo } = makeLayout('golf');
    writeCoreIconLayout(core);

    const result = scaffoldGameRepo({ game: 'golf', gameRepoRoot: gameRepo, coreRoot: core });

    expect(
      result.publicLinks
        .map((p) => path.relative(path.join(gameRepo, 'public'), p))
        .sort(),
    ).toEqual([...ROOT_ICONS].sort());
    for (const icon of ROOT_ICONS) {
      expect(fs.realpathSync(path.join(gameRepo, 'public', icon))).toBe(
        fs.realpathSync(path.join(core, 'public', icon)),
      );
    }

    // A re-scaffold is a no-op for the already-composed icon links.
    const second = scaffoldGameRepo({ game: 'golf', gameRepoRoot: gameRepo, coreRoot: core });
    expect(second.publicLinks).toEqual([]);
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
      path.join(gameRepo, 'src', 'scenes', 'MainStreetScene.ts'),
    );
  });

  it('is idempotent (a re-scaffold does not recreate the core link)', () => {
    const { core, gameRepo } = makeLayout('blackjack');
    const first = scaffoldGameRepo({ game: 'blackjack', gameRepoRoot: gameRepo, coreRoot: core });
    const second = scaffoldGameRepo({ game: 'blackjack', gameRepoRoot: gameRepo, coreRoot: core });
    expect(first.symlinks.length).toBe(1);
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

  it('defaults to the merged core and its submodule remote (Option A)', () => {
    const layout = path.resolve(
      __dirname,
      '..',
      '..',
      'scripts',
      'configs',
      'repo-layout.json',
    );
    const contract = JSON.parse(fs.readFileSync(layout, 'utf-8'));
    // The scaffold's default sibling path and the submodule remote it mirrors
    // must both name the merged core, so the scaffold and the layout cannot
    // drift (F3 / CG-0MUJ1664D009FSFF).
    expect(DEFAULT_CORE_REL).toBe('../Tableau-Card-Engine');
    expect(CORE_REMOTE).toBe(contract.core.remote);
    expect(CORE_REMOTE).toBe(
      'git@github.com:TheWizardsCode/Tableau-Card-Engine.git',
    );
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
