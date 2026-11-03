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
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
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
  type ScaffoldResult,
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
  'the-rising',
] as const;

/**
 * The generated files a scaffold owns, repo-relative and in report order
 * (CG-0MVWGJNQM0061W6I). The set is fixed: a later slice adds write gating,
 * not new generated files.
 */
const GENERATED_FILES = [
  'package.json',
  'vite.config.ts',
  'tsconfig.json',
  'env.d.ts',
  'main.ts',
  'index.html',
  `configs/${DEFAULT_GAME_PRESET}.json`,
] as const;

/** The scaffold CLI, spawned as a real process by the CLI contract tests. */
const SCRIPT_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  'scripts',
  'game-repo-scaffold.ts',
);

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

  it('wires a soft engine sync into the interactive dev start (CG-0MVZJ35EV00690W5)', () => {
    const pkg = JSON.parse(renderPackageJson('golf', MANIFEST, DEFAULT_CORE_REL));
    // `npm run dev` composes the latest engine, but a dirty `./core` must never
    // stop the dev server — hence the soft mode, not the strict `engine:sync`.
    expect(pkg.scripts.dev).toBe('npm run engine:dev-sync && vite --host');
    expect(pkg.scripts['engine:dev-sync']).toBe(
      `node ${DEFAULT_CORE_REL}/scripts/engine-sync.mjs sync --soft`,
    );
    // The build/release paths keep the strict gate.
    expect(pkg.scripts.build).toContain('npm run engine:sync &&');
    expect(pkg.scripts['build:release']).toContain('npm run engine:verify &&');
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

    // The game-tree path rewrite is opt-in (CG-0MVWGJRIO0094Y4Z): a routine
    // re-scaffold must never edit the consumer's own tests or source.
    const testSrc = fs.readFileSync(
      path.join(gameRepo, 'tests', 'golf', 'Golf.test.ts'),
      'utf-8',
    );
    expect(testSrc).toContain("'../../example-games/golf/scenes/GolfScene'");
    expect(result.rewritten).toEqual([]);
    expect(result.migrations).toEqual([]);
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

// ── Write classification, dry run and machine-readable report ─────────────

function sha256(contents: Buffer | string): string {
  return crypto.createHash('sha256').update(contents).digest('hex');
}

/**
 * Snapshot every directory, file and symlink under `root` by relative path, so
 * a test can assert a run changed nothing at all (not just the generated set).
 */
function snapshotTree(root: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const rel = path.relative(root, full).split(path.sep).join('/');
      if (entry.isSymbolicLink()) {
        out[rel] = `link:${fs.readlinkSync(full)}`;
      } else if (entry.isDirectory()) {
        out[`${rel}/`] = 'dir';
        walk(full);
      } else {
        out[rel] = sha256(fs.readFileSync(full));
      }
    }
  };
  walk(root);
  return out;
}

/** Pre-seed every generated file with local content that differs from the template. */
function seedDivergedGeneratedFiles(gameRepo: string): void {
  for (const file of GENERATED_FILES) {
    const target = path.join(gameRepo, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, `// LOCAL EDIT — ${file}\n`, 'utf-8');
  }
}

/**
 * Give the fixture core a shared-asset + root-icon layout, so a real run has
 * side effects a dry run must suppress (and vice versa).
 */
function writeCoreSharedLayout(core: string): void {
  writeCoreIconLayout(core);
  const audioDir = path.join(core, 'public', 'assets', 'audio', 'default');
  fs.mkdirSync(audioDir, { recursive: true });
  fs.writeFileSync(path.join(audioDir, 'game-win.wav'), 'x');
  fs.writeFileSync(
    path.join(core, 'scripts', 'configs', 'repo-layout.json'),
    JSON.stringify({
      sharedAssets: ['audio/default/'],
      sharedPublicRoot: [...ROOT_ICONS],
    }),
  );
}

describe('scaffoldGameRepo write classification', () => {
  it('classifies every absent generated file as create and writes it', () => {
    const { core, gameRepo } = makeLayout('golf');
    const result = scaffoldGameRepo({ game: 'golf', gameRepoRoot: gameRepo, coreRoot: core });

    // The report covers every generated file, in a stable order, repo-relative.
    expect(result.files).toEqual(
      GENERATED_FILES.map((file) => ({ path: file, action: 'create' })),
    );
    for (const file of GENERATED_FILES) {
      expect(fs.existsSync(path.join(gameRepo, file)), `${file} missing`).toBe(true);
    }

    // `written` stays the compatibility projection: the create/update files,
    // as absolute paths (callers and the CLI log rely on that shape).
    expect(result.written.sort()).toEqual(
      GENERATED_FILES.map((file) => path.join(gameRepo, file)).sort(),
    );
  });

  it('classifies a byte-identical file as unchanged and does not rewrite it', () => {
    const { core, gameRepo } = makeLayout('golf');
    scaffoldGameRepo({ game: 'golf', gameRepoRoot: gameRepo, coreRoot: core });

    // An old mtime survives only when the file is left alone, so this proves
    // `unchanged` means "not written", not merely "same content after write".
    const sentinel = new Date('2001-01-01T00:00:00Z');
    for (const file of GENERATED_FILES) {
      fs.utimesSync(path.join(gameRepo, file), sentinel, sentinel);
    }

    const result = scaffoldGameRepo({ game: 'golf', gameRepoRoot: gameRepo, coreRoot: core });

    expect(result.files).toEqual(
      GENERATED_FILES.map((file) => ({ path: file, action: 'unchanged' })),
    );
    expect(result.written).toEqual([]);
    for (const file of GENERATED_FILES) {
      expect(fs.statSync(path.join(gameRepo, file)).mtimeMs, `${file} rewritten`).toBe(
        sentinel.getTime(),
      );
    }
  });

  it('classifies a diverged file as update and overwrites it with the template', () => {
    const { core, gameRepo } = makeLayout('golf');
    scaffoldGameRepo({ game: 'golf', gameRepoRoot: gameRepo, coreRoot: core });

    fs.writeFileSync(path.join(gameRepo, 'main.ts'), '// LOCAL EDIT\n', 'utf-8');
    const result = scaffoldGameRepo({ game: 'golf', gameRepoRoot: gameRepo, coreRoot: core });

    expect(result.files).toEqual(
      GENERATED_FILES.map((file) => ({
        path: file,
        action: file === 'main.ts' ? 'update' : 'unchanged',
      })),
    );
    // Only the diverged file is touched.
    expect(result.written).toEqual([path.join(gameRepo, 'main.ts')]);
    expect(fs.readFileSync(path.join(gameRepo, 'main.ts'), 'utf-8')).toBe(renderMainTs());
  });
});

describe('scaffoldGameRepo dry run', () => {
  it('classifies every file but writes nothing, links nothing and rewrites nothing', () => {
    const { core, gameRepo } = makeLayout('golf');
    writeCoreSharedLayout(core);
    seedDivergedGeneratedFiles(gameRepo);

    const testFile = path.join(gameRepo, 'tests', 'golf', 'Golf.test.ts');
    expect(fs.readFileSync(testFile, 'utf-8')).toContain('example-games/golf/');

    const before = snapshotTree(gameRepo);
    const dry = scaffoldGameRepo({
      game: 'golf',
      gameRepoRoot: gameRepo,
      coreRoot: core,
      dryRun: true,
    });

    // Byte-identical tree: no write, no mkdir, no `core` symlink, no asset or
    // app-icon link, and no path rewrite of the game's own tests.
    expect(snapshotTree(gameRepo)).toEqual(before);
    expect(fs.lstatSync(path.join(gameRepo, 'core'), { throwIfNoEntry: false })).toBeUndefined();
    expect(fs.readFileSync(testFile, 'utf-8')).toContain('example-games/golf/');

    // ...while the report carries the classification the real run applies.
    expect(dry.files).toEqual(
      GENERATED_FILES.map((file) => ({ path: file, action: 'update' })),
    );
    expect(dry.written).toEqual([]);
    expect(dry.symlinks).toEqual([]);
    expect(dry.assetLinks).toEqual([]);
    expect(dry.publicLinks).toEqual([]);
    expect(dry.rewritten).toEqual([]);
  });

  it('reports exactly what the following real run does (no classification drift)', () => {
    const { core, gameRepo } = makeLayout('golf');
    seedDivergedGeneratedFiles(gameRepo);

    const dry = scaffoldGameRepo({
      game: 'golf',
      gameRepoRoot: gameRepo,
      coreRoot: core,
      dryRun: true,
    });
    const real = scaffoldGameRepo({ game: 'golf', gameRepoRoot: gameRepo, coreRoot: core });

    expect(real.files).toEqual(dry.files);
    expect(real.written.sort()).toEqual(
      GENERATED_FILES.map((file) => path.join(gameRepo, file)).sort(),
    );
  });

  it('classifies a fresh tree as create without creating anything', () => {
    const { core, gameRepo } = makeLayout('golf');
    const before = snapshotTree(gameRepo);

    const dry = scaffoldGameRepo({
      game: 'golf',
      gameRepoRoot: gameRepo,
      coreRoot: core,
      dryRun: true,
    });

    expect(dry.files).toEqual(
      GENERATED_FILES.map((file) => ({ path: file, action: 'create' })),
    );
    expect(snapshotTree(gameRepo)).toEqual(before);
  });
});

// ── Write gating: --only / --force / skip-local ───────────────────────────

/** The local content {@link seedDivergedGeneratedFiles} writes for a file. */
function localEdit(file: string): string {
  return `// LOCAL EDIT — ${file}\n`;
}

/** Read one generated file from the scaffolded game repo. */
function readGenerated(gameRepo: string, file: string): string {
  return fs.readFileSync(path.join(gameRepo, file), 'utf-8');
}

describe('scaffoldGameRepo write gating (--only / --force / skip-local)', () => {
  it('writes only the selected file and classifies every other generated file skip-local', () => {
    const { core, gameRepo } = makeLayout('golf');
    writeCoreSharedLayout(core);
    scaffoldGameRepo({ game: 'golf', gameRepoRoot: gameRepo, coreRoot: core });
    // Every generated file now holds local content that differs from the
    // template, so an unselected file is a clobber risk, not a no-op.
    seedDivergedGeneratedFiles(gameRepo);

    const testFile = path.join(gameRepo, 'tests', 'golf', 'Golf.test.ts');
    // A selection run never rewrites the game tree (and neither does a plain
    // full run any more — the migration is opt-in, CG-0MVWGJRIO0094Y4Z).
    const testSrcBefore = fs.readFileSync(testFile, 'utf-8');
    const before = snapshotTree(gameRepo);

    const result = scaffoldGameRepo({
      game: 'golf',
      gameRepoRoot: gameRepo,
      coreRoot: core,
      only: ['main.ts'],
      force: true,
    });

    // The report names the selected file as written and every other generated
    // file as deliberately left alone (CG-0MVWGJPPA000GBE7).
    expect(result.files).toEqual(
      GENERATED_FILES.map((file) => ({
        path: file,
        action: file === 'main.ts' ? 'update' : 'skip-local',
      })),
    );
    expect(result.written).toEqual([path.join(gameRepo, 'main.ts')]);
    expect(readGenerated(gameRepo, 'main.ts')).toBe(renderMainTs());

    // Every unselected generated file keeps its local content byte-for-byte.
    for (const file of GENERATED_FILES) {
      if (file === 'main.ts') continue;
      expect(readGenerated(gameRepo, file), `${file} was clobbered`).toBe(localEdit(file));
    }

    // Selection mode performs none of the non-file side effects.
    expect(result.symlinks).toEqual([]);
    expect(result.assetLinks).toEqual([]);
    expect(result.publicLinks).toEqual([]);
    expect(result.rewritten).toEqual([]);
    expect(result.selectionNote).toMatch(/selection mode/i);
    // The game's own test file is untouched (no path rewrite in this run).
    expect(fs.readFileSync(testFile, 'utf-8')).toBe(testSrcBefore);

    // On disk, exactly one file changed — nothing was added, linked or removed.
    const after = snapshotTree(gameRepo);
    expect(Object.keys(after).sort()).toEqual(Object.keys(before).sort());
    expect(Object.keys(after).filter((key) => after[key] !== before[key])).toEqual([
      'main.ts',
    ]);
  });

  it('creates only the selected file and no links or rewrites on a fresh checkout', () => {
    const { core, gameRepo } = makeLayout('golf');
    // The core has shared assets and root icons available; a selection run must
    // still compose none of them.
    writeCoreSharedLayout(core);

    const testFile = path.join(gameRepo, 'tests', 'golf', 'Golf.test.ts');
    const before = snapshotTree(gameRepo);

    const result = scaffoldGameRepo({
      game: 'golf',
      gameRepoRoot: gameRepo,
      coreRoot: core,
      only: ['main.ts'],
    });

    expect(result.files).toEqual(
      GENERATED_FILES.map((file) => ({
        path: file,
        action: file === 'main.ts' ? 'create' : 'skip-local',
      })),
    );
    expect(result.written).toEqual([path.join(gameRepo, 'main.ts')]);
    for (const file of GENERATED_FILES) {
      const exists = fs.existsSync(path.join(gameRepo, file));
      expect(exists, `${file} existence`).toBe(file === 'main.ts');
    }

    // No `core` symlink, no `public/` asset tree, no path rewrite.
    expect(fs.lstatSync(path.join(gameRepo, 'core'), { throwIfNoEntry: false })).toBeUndefined();
    expect(fs.existsSync(path.join(gameRepo, 'public'))).toBe(false);
    expect(result.symlinks).toEqual([]);
    expect(fs.readFileSync(testFile, 'utf-8')).toContain('example-games/golf/');

    // The only addition is the selected file.
    const after = snapshotTree(gameRepo);
    expect(Object.keys(after).sort()).toEqual(['main.ts', ...Object.keys(before)].sort());
    for (const key of Object.keys(before)) expect(after[key]).toBe(before[key]);
  });

  it('leaves a diverged selected file untouched (skip-local) unless force is passed', () => {
    const { core, gameRepo } = makeLayout('golf');
    scaffoldGameRepo({ game: 'golf', gameRepoRoot: gameRepo, coreRoot: core });

    fs.writeFileSync(path.join(gameRepo, 'main.ts'), localEdit('main.ts'), 'utf-8');

    // Without --force the selected file is a hand edit the run must not lose.
    const withoutForce = scaffoldGameRepo({
      game: 'golf',
      gameRepoRoot: gameRepo,
      coreRoot: core,
      only: ['main.ts'],
    });
    expect(
      withoutForce.files.find((file) => file.path === 'main.ts')?.action,
    ).toBe('skip-local');
    expect(withoutForce.written).toEqual([]);
    expect(readGenerated(gameRepo, 'main.ts')).toBe(localEdit('main.ts'));

    // --force regenerates exactly that file.
    const withForce = scaffoldGameRepo({
      game: 'golf',
      gameRepoRoot: gameRepo,
      coreRoot: core,
      only: ['main.ts'],
      force: true,
    });
    expect(withForce.files.find((file) => file.path === 'main.ts')?.action).toBe(
      'update',
    );
    expect(withForce.written).toEqual([path.join(gameRepo, 'main.ts')]);
    expect(readGenerated(gameRepo, 'main.ts')).toBe(renderMainTs());
  });

  it('fails fast on an unknown selected name, listing the valid paths and writing nothing', () => {
    const { core, gameRepo } = makeLayout('golf');
    const before = snapshotTree(gameRepo);

    let message = '';
    try {
      scaffoldGameRepo({
        game: 'golf',
        gameRepoRoot: gameRepo,
        coreRoot: core,
        only: ['main.tx'],
        force: true,
      });
    } catch (err) {
      message = (err as Error).message;
    }

    // A typo must never produce a silent no-op scaffold.
    expect(message).toContain('main.tx');
    expect(message).toMatch(/valid/i);
    for (const file of GENERATED_FILES) expect(message).toContain(file);
    // Nothing was written — not even an empty `configs/` directory.
    expect(snapshotTree(gameRepo)).toEqual(before);
  });

  it('keeps full-run behaviour for the sibling repos: a diverged file is rewritten without force', () => {
    const { core, gameRepo } = makeLayout('golf');
    seedDivergedGeneratedFiles(gameRepo);

    // Back-compatibility guard: the nine sibling `tce-<game>` repos receive
    // template updates from a plain full run, so `force` must be implied when
    // `only` is absent (effectiveForce = force || only === undefined).
    const result = scaffoldGameRepo({
      game: 'golf',
      gameRepoRoot: gameRepo,
      coreRoot: core,
    });

    expect(result.files).toEqual(
      GENERATED_FILES.map((file) => ({ path: file, action: 'update' })),
    );
    expect(result.written.sort()).toEqual(
      GENERATED_FILES.map((file) => path.join(gameRepo, file)).sort(),
    );
    expect(readGenerated(gameRepo, 'main.ts')).toBe(renderMainTs());
    // A full run still performs the side effects a selection run suppresses.
    expect(result.symlinks.map((link) => path.basename(link))).toEqual(['core']);
    expect(result.selectionNote).toBeUndefined();
  });

  it('reports for --only + --dry-run exactly what the following real run applies', () => {
    const { core, gameRepo } = makeLayout('golf');
    writeCoreSharedLayout(core);
    scaffoldGameRepo({ game: 'golf', gameRepoRoot: gameRepo, coreRoot: core });
    fs.writeFileSync(path.join(gameRepo, 'main.ts'), localEdit('main.ts'), 'utf-8');
    fs.writeFileSync(
      path.join(gameRepo, 'package.json'),
      localEdit('package.json'),
      'utf-8',
    );

    const before = snapshotTree(gameRepo);
    const dry = scaffoldGameRepo({
      game: 'golf',
      gameRepoRoot: gameRepo,
      coreRoot: core,
      only: ['main.ts'],
      force: true,
      dryRun: true,
    });

    // Nothing on disk changed, including the unselected diverged file. An
    // unselected file that still matches the template is `unchanged`; a
    // diverged one is `skip-local` — neither is written.
    expect(snapshotTree(gameRepo)).toEqual(before);
    expect(dry.files).toEqual(
      GENERATED_FILES.map((file) => ({
        path: file,
        action:
          file === 'main.ts'
            ? 'update'
            : file === 'package.json'
              ? 'skip-local'
              : 'unchanged',
      })),
    );
    expect(dry.written).toEqual([]);

    // The preview and the real selection run agree, so a preview is trustworthy.
    const real = scaffoldGameRepo({
      game: 'golf',
      gameRepoRoot: gameRepo,
      coreRoot: core,
      only: ['main.ts'],
      force: true,
    });
    expect(real.files).toEqual(dry.files);
    expect(real.written).toEqual([path.join(gameRepo, 'main.ts')]);
    expect(readGenerated(gameRepo, 'package.json')).toBe(localEdit('package.json'));
  });
});

// ── Opt-in game-tree migration (--migrate-game-paths) ─────────────────────

/** A consumer fixture with no genuine `example-games/<game>/` reference. */
function writeNoReferenceFixture(gameRepo: string, game: string): string {
  const file = path.join(gameRepo, 'tests', game, 'DriftGuard.test.ts');
  fs.writeFileSync(
    file,
    [
      // A drift guard's own literal: it mentions the monorepo shape but never
      // references this game's tree, so a migration must leave it alone even
      // though the blanket rewrite used to touch it.
      "const STALE_PREFIX = 'example-games/';",
      "const runTests = 'scripts/run-tests';",
      "const roots = [{ dir: 'src/ui' }];",
      "import { validate } from '../../scripts/validate-transcript';",
      '',
    ].join('\n'),
    'utf-8',
  );
  return file;
}

/** Snapshot only the game-owned `tests/` and `src/` trees (repo-relative keys). */
function snapshotConsumerTrees(gameRepo: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const dir of ['tests', 'src']) {
    for (const [rel, hash] of Object.entries(snapshotTree(path.join(gameRepo, dir)))) {
      out[`${dir}/${rel}`] = hash;
    }
  }
  return out;
}

describe('scaffoldGameRepo game-tree migration (--migrate-game-paths)', () => {
  const testFileOf = (gameRepo: string, game: string): string =>
    path.join(gameRepo, 'tests', game, `${pascalCase(game)}.test.ts`);

  /** Every rewrite the fixture test file genuinely earns. */
  const ALL_REWRITES = [
    'game-tree-prefix',
    'relative-scripts-import',
    'quoted-scripts-path',
    'core-src-path',
  ];

  it("a default scaffold leaves the game's own tests and source byte-identical", () => {
    const { core, gameRepo } = makeLayout('golf');
    const decoy = writeNoReferenceFixture(gameRepo, 'golf');
    const decoyBefore = fs.readFileSync(decoy, 'utf-8');
    const before = snapshotConsumerTrees(gameRepo);

    const result = scaffoldGameRepo({
      game: 'golf',
      gameRepoRoot: gameRepo,
      coreRoot: core,
    });

    // Nothing under `tests/` or `src/` changed: not one byte was rewritten.
    expect(snapshotConsumerTrees(gameRepo)).toEqual(before);
    expect(fs.readFileSync(testFileOf(gameRepo, 'golf'), 'utf-8')).toContain(
      'example-games/golf/',
    );
    expect(fs.readFileSync(decoy, 'utf-8')).toBe(decoyBefore);
    expect(result.rewritten).toEqual([]);
    expect(result.migrations).toEqual([]);
  });

  it('migrates and reports the genuinely-referencing files only when asked', () => {
    const { core, gameRepo } = makeLayout('golf');
    const decoy = writeNoReferenceFixture(gameRepo, 'golf');
    const decoyBefore = fs.readFileSync(decoy, 'utf-8');

    const result = scaffoldGameRepo({
      game: 'golf',
      gameRepoRoot: gameRepo,
      coreRoot: core,
      migrateGamePaths: true,
    });

    // The affected file is reported both as a written path and as a migration
    // entry naming which rewrite applies.
    expect(result.rewritten).toEqual([testFileOf(gameRepo, 'golf')]);
    expect(result.migrations).toEqual([
      { path: 'tests/golf/Golf.test.ts', rewrites: ALL_REWRITES },
    ]);

    const testSrc = fs.readFileSync(testFileOf(gameRepo, 'golf'), 'utf-8');
    // 1. `example-games/<game>/…` -> `src/…` (game tree).
    expect(testSrc).toContain("'../../src/scenes/GolfScene'");
    expect(testSrc).not.toContain('example-games/golf/');
    // 2. A quoted `scripts/…` path -> `core/scripts/…`.
    expect(testSrc).toContain("'core/scripts/replay.ts'");
    // 3. A quoted `src/<core-dir>` path -> `core/src/<core-dir>`.
    expect(testSrc).toContain("'core/src/ui'");
    expect(testSrc).toContain("'core/src/core-engine'");
    // 4. A relative `../../scripts/<module>` -> `@core-scripts/<module>`; a
    // game-owned script under `src/scripts/` is left untouched.
    expect(testSrc).toContain("'@core-scripts/validate-transcript'");
    expect(testSrc).not.toContain("'../../scripts/validate-transcript'");
    expect(testSrc).toContain("'../../src/scripts/game-script'");

    // A file with no genuine game-tree reference stays byte-identical, even in
    // migration mode (the blanket rewrite used to touch it).
    expect(fs.readFileSync(decoy, 'utf-8')).toBe(decoyBefore);
  });

  it('reports the migration without writing on --migrate-game-paths --dry-run', () => {
    const { core, gameRepo } = makeLayout('golf');
    writeNoReferenceFixture(gameRepo, 'golf');
    const before = snapshotConsumerTrees(gameRepo);

    const dry = scaffoldGameRepo({
      game: 'golf',
      gameRepoRoot: gameRepo,
      coreRoot: core,
      migrateGamePaths: true,
      dryRun: true,
    });

    // Nothing written, but the preview names the files a real migration would
    // rewrite and which rewrite applies to each.
    expect(snapshotConsumerTrees(gameRepo)).toEqual(before);
    expect(dry.rewritten).toEqual([]);
    expect(dry.migrations).toEqual([
      { path: 'tests/golf/Golf.test.ts', rewrites: ALL_REWRITES },
    ]);

    // The preview is trustworthy: a real migration reports exactly the same.
    const real = scaffoldGameRepo({
      game: 'golf',
      gameRepoRoot: gameRepo,
      coreRoot: core,
      migrateGamePaths: true,
    });
    expect(real.migrations).toEqual(dry.migrations);
    expect(real.rewritten).toEqual([testFileOf(gameRepo, 'golf')]);
  });

  it('fails fast when --only and --migrate-game-paths are combined, writing nothing', () => {
    const { core, gameRepo } = makeLayout('golf');
    const before = snapshotTree(gameRepo);

    let message = '';
    try {
      scaffoldGameRepo({
        game: 'golf',
        gameRepoRoot: gameRepo,
        coreRoot: core,
        only: ['main.ts'],
        migrateGamePaths: true,
      });
    } catch (err) {
      message = (err as Error).message;
    }

    // `--only` promises "no rewrite", so the pair is contradictory: refuse
    // rather than half-migrate the repo.
    expect(message).toContain('--migrate-game-paths');
    expect(message).toContain('--only');
    expect(message).toMatch(/combine|mutually exclusive/i);
    expect(snapshotTree(gameRepo)).toEqual(before);
  });
});

describe('scaffold CLI report contract', () => {
  /** Run the scaffold CLI from the repo root so `tsx` resolves normally. */
  const runCli = (args: string[]): ReturnType<typeof spawnSync> =>
    spawnSync(process.execPath, ['--import', 'tsx/esm', SCRIPT_PATH, ...args], {
      cwd: path.resolve(__dirname, '..', '..'),
      encoding: 'utf-8',
    });

  const baseArgs = (core: string, gameRepo: string): string[] => [
    '--game',
    'golf',
    '--game-repo-root',
    gameRepo,
    '--core-root',
    core,
    '--core-rel',
    DEFAULT_CORE_REL,
  ];

  it('--dry-run --json writes nothing and emits one parseable JSON document', () => {
    const { core, gameRepo } = makeLayout('golf');
    const before = snapshotTree(gameRepo);

    const result = runCli([...baseArgs(core, gameRepo), '--dry-run', '--json']);

    expect(result.status, String(result.stderr)).toBe(0);
    const doc = JSON.parse(String(result.stdout)) as ScaffoldResult;
    expect(Array.isArray(doc)).toBe(false);
    expect(doc.files).toEqual(
      GENERATED_FILES.map((file) => ({ path: file, action: 'create' })),
    );
    expect(doc.written).toEqual([]);
    // Nothing on disk changed — not even an empty configs/ directory.
    expect(snapshotTree(gameRepo)).toEqual(before);
  });

  it('--all --json emits a single JSON array', () => {
    const { core, gameRepo } = makeLayout('golf');
    const layout = path.join(tmpRoot, 'repo-layout.json');
    fs.writeFileSync(layout, JSON.stringify({ games: [{ name: 'golf' }] }), 'utf-8');

    const result = runCli([
      '--all',
      '--layout',
      layout,
      '--game-repo-root',
      gameRepo,
      '--core-root',
      core,
      '--core-rel',
      DEFAULT_CORE_REL,
      '--dry-run',
      '--json',
    ]);

    expect(result.status, String(result.stderr)).toBe(0);
    const doc = JSON.parse(String(result.stdout)) as ScaffoldResult[];
    expect(Array.isArray(doc)).toBe(true);
    expect(doc).toHaveLength(1);
    expect(doc[0].files).toHaveLength(GENERATED_FILES.length);
  });

  it('--help documents --dry-run, --json, --only and --force', () => {
    const result = runCli(['--help']);
    expect(result.status).toBe(0);
    const help = String(result.stdout);
    expect(help).toContain('--dry-run');
    expect(help).toContain('--json');
    expect(help).toContain('--only');
    expect(help).toContain('--force');
    // A full run implies force; the help text must say so, or an operator
    // cannot know why a re-scaffold overwrites a diverged file.
    expect(help).toMatch(/full run[^.]*force/i);
  });

  it('--only applies to exactly the named generated files', () => {
    const { core, gameRepo } = makeLayout('golf');
    scaffoldGameRepo({ game: 'golf', gameRepoRoot: gameRepo, coreRoot: core });
    fs.writeFileSync(path.join(gameRepo, 'main.ts'), localEdit('main.ts'), 'utf-8');
    fs.writeFileSync(
      path.join(gameRepo, 'package.json'),
      localEdit('package.json'),
      'utf-8',
    );

    const result = runCli([
      ...baseArgs(core, gameRepo),
      '--only',
      'main.ts',
      '--force',
      '--json',
    ]);

    expect(result.status, String(result.stderr)).toBe(0);
    const doc = JSON.parse(String(result.stdout)) as ScaffoldResult;
    expect(doc.files).toEqual(
      GENERATED_FILES.map((file) => ({
        path: file,
        action:
          file === 'main.ts'
            ? 'update'
            : file === 'package.json'
              ? 'skip-local'
              : 'unchanged',
      })),
    );
    expect(doc.written).toEqual([path.join(gameRepo, 'main.ts')]);
    expect(readGenerated(gameRepo, 'main.ts')).toBe(renderMainTs());
    expect(readGenerated(gameRepo, 'package.json')).toBe(localEdit('package.json'));
  });

  it('--only with an unknown name exits 1, lists the valid paths and writes nothing', () => {
    const { core, gameRepo } = makeLayout('golf');
    const before = snapshotTree(gameRepo);

    const result = runCli([...baseArgs(core, gameRepo), '--only', 'main.tx']);

    expect(result.status).toBe(1);
    const stderr = String(result.stderr);
    expect(stderr).toContain('main.tx');
    expect(stderr).toMatch(/valid/i);
    for (const file of GENERATED_FILES) expect(stderr).toContain(file);
    expect(snapshotTree(gameRepo)).toEqual(before);
  });

  it('--migrate-game-paths --dry-run reports the migration and writes nothing', () => {
    const { core, gameRepo } = makeLayout('golf');
    writeNoReferenceFixture(gameRepo, 'golf');
    const before = snapshotConsumerTrees(gameRepo);

    const result = runCli([
      ...baseArgs(core, gameRepo),
      '--migrate-game-paths',
      '--dry-run',
      '--json',
    ]);

    expect(result.status, String(result.stderr)).toBe(0);
    const doc = JSON.parse(String(result.stdout)) as ScaffoldResult;
    expect(snapshotConsumerTrees(gameRepo)).toEqual(before);
    expect(doc.rewritten).toEqual([]);
    expect(doc.migrations.map((migration) => migration.path)).toEqual([
      'tests/golf/Golf.test.ts',
    ]);
    expect(doc.migrations[0].rewrites).toContain('game-tree-prefix');
  });

  it('--only with --migrate-game-paths exits 1 and writes nothing', () => {
    const { core, gameRepo } = makeLayout('golf');
    const before = snapshotTree(gameRepo);

    const result = runCli([
      ...baseArgs(core, gameRepo),
      '--only',
      'main.ts',
      '--migrate-game-paths',
    ]);

    expect(result.status).toBe(1);
    const stderr = String(result.stderr);
    expect(stderr).toContain('--migrate-game-paths');
    expect(stderr).toContain('--only');
    expect(snapshotTree(gameRepo)).toEqual(before);
  });

  it('--help documents --migrate-game-paths, its default-off status and the --only exclusion', () => {
    const result = runCli(['--help']);
    expect(result.status).toBe(0);
    const help = String(result.stdout);
    expect(help).toContain('--migrate-game-paths');
    expect(help).toMatch(/off by default/i);
    expect(help).toMatch(/cannot be combined with --only/i);
  });

  it('rejects a glob in --only (literal generated names only)', () => {
    const { core, gameRepo } = makeLayout('golf');
    const before = snapshotTree(gameRepo);

    const result = runCli([...baseArgs(core, gameRepo), '--only', '*.ts']);

    expect(result.status).toBe(1);
    expect(String(result.stderr)).toMatch(/glob|literal/i);
    expect(snapshotTree(gameRepo)).toEqual(before);
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
