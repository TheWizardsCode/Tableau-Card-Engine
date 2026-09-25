/**
 * Unit tests for config-driven game discovery (F3 / CG-0MTRO6Y2N009B9CF).
 *
 * The monorepo (and every core/game checkout composed from it) must build a
 * game catalogue from a *config preset* rather than from hardcoded imports in
 * `main.ts`. Two machine-readable pieces make that possible:
 *
 *   - `configs/<preset>.json`            — the selected game set.
 *   - `scripts/vite-game-discovery-plugin.ts` — a Vite plugin that turns the
 *     preset + each game's sibling source tree into `virtual:game-registry`.
 *
 * These are behaviour tests over both pieces: preset validation, sibling path
 * resolution, fail-fast diagnostics, and the generated module's source. The
 * plugin is exercised through its exported pure helpers and a real Vite
 * `resolveId`/`load` cycle over a temporary fixture tree — no browser and no
 * network.
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  GAME_REGISTRY_MODULE_ID,
  GAME_REGISTRY_RESOLVED_ID,
  discoverGames,
  loadGamesConfig,
  renderGameRegistryModule,
  readGameInfo,
  resolveCoreAliases,
  selectConfigPath,
  selectedGameIds,
  VIRTUAL_MODULE_ID,
  type GameConfigEntry,
} from '../../scripts/vite-game-discovery-plugin';

const REPO_ROOT = path.resolve(__dirname, '..', '..');

/** The real presets that must exist in the monorepo. */
const PRESETS = ['core-only', 'solo', 'arcade', 'deluxe', 'full'] as const;

let tmpRoot: string;

/** Create a fake sibling layout: <root>/tableau-card-engine-core + tce-<game>. */
function makeFixture(games: string[], withConfig: Record<string, unknown> | null): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tce-discovery-'));
  const core = path.join(root, 'tableau-card-engine-core');
  fs.mkdirSync(path.join(core, 'src'), { recursive: true });
  fs.mkdirSync(path.join(core, 'configs'), { recursive: true });

  for (const game of games) {
    const gameDir = path.join(root, `tce-${game}`, 'example-games', game, 'scenes');
    fs.mkdirSync(gameDir, { recursive: true });
    const cls = game
      .split('-')
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join('');
    // Real game modules export GAME_INFO alongside the scene class.
    fs.writeFileSync(
      path.join(gameDir, `${cls}Scene.ts`),
      [
        `export class ${cls}Scene {}`,
        `export const GAME_INFO = {`,
        `  sceneKey: '${cls}Scene',`,
        `  title: '${cls}',`,
        `  description: 'Fixture game ${game}.',`,
        `};`,
        '',
      ].join('\n'),
    );
  }

  if (withConfig) {
    fs.writeFileSync(
      path.join(core, 'configs', 'preset.json'),
      JSON.stringify(withConfig, null, 2),
    );
  }
  return root;
}

/** Add a `src/`-layout scene module to an existing sibling game repo. */
function writeSrcLayoutScene(root: string, game: string): string {
  const cls = game
    .split('-')
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join('');
  const dir = path.join(root, `tce-${game}`, 'src', 'scenes');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${cls}Scene.ts`);
  fs.writeFileSync(
    file,
    [
      `export class ${cls}Scene {}`,
      `export const GAME_INFO = {`,
      `  sceneKey: '${cls}Scene',`,
      `  title: '${cls}',`,
      `  description: 'Fixture game ${game}.',`,
      `};`,
      '',
    ].join('\n'),
  );
  return file;
}

beforeEach(() => {
  tmpRoot = '';
});

afterEach(() => {
  if (tmpRoot) fs.rmSync(tmpRoot, { recursive: true, force: true });
});

// ── Presets shipped in the repo ───────────────────────────────────────────

describe('configs/ presets', () => {
  for (const preset of PRESETS) {
    it(`ships a valid ${preset}.json preset`, () => {
      const p = path.join(REPO_ROOT, 'configs', `${preset}.json`);
      expect(fs.existsSync(p), `${preset}.json missing`).toBe(true);
      const parsed = JSON.parse(fs.readFileSync(p, 'utf-8'));
      expect(Array.isArray(parsed.games)).toBe(true);
      for (const entry of parsed.games) {
        expect(typeof entry.id).toBe('string');
        expect(typeof entry.path).toBe('string');
        expect(typeof entry.scenePath).toBe('string');
      }
    });
  }

  it('core-only declares no games', () => {
    const cfg = loadGamesConfig(path.join(REPO_ROOT, 'configs', 'core-only.json'));
    expect(cfg.games).toEqual([]);
  });

  it('full declares every example game', () => {
    const cfg = loadGamesConfig(path.join(REPO_ROOT, 'configs', 'full.json'));
    expect(cfg.games.map((g) => g.id).sort()).toEqual(
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
  });

  it('arcade is a proper non-empty subset of full (1..n boundary case)', () => {
    const full = loadGamesConfig(path.join(REPO_ROOT, 'configs', 'full.json'));
    const arcade = loadGamesConfig(path.join(REPO_ROOT, 'configs', 'arcade.json'));
    expect(arcade.games.length).toBeGreaterThan(0);
    expect(arcade.games.length).toBeLessThan(full.games.length);
    const fullIds = new Set(full.games.map((g) => g.id));
    for (const g of arcade.games) {
      expect(fullIds.has(g.id), `${g.id} not in full.json`).toBe(true);
    }
  });

  it('every preset game points at both the monorepo and src/ layouts', () => {
    const cfg = loadGamesConfig(path.join(REPO_ROOT, 'configs', 'full.json'));
    for (const g of cfg.games) {
      expect(g.path).toContain('tce-');
      expect(g.scenePath).toContain(`example-games/${g.id}`);
      // Option C (F9/C1): a src/-layout sibling path is also recorded.
      expect(g.siblingScenePath).toBe(
        g.scenePath.replace(`example-games/${g.id}/`, 'src/'),
      );
    }
  });

  it('records a sibling adapter path wherever the monorepo preset has one', () => {
    for (const preset of PRESETS) {
      const cfg = loadGamesConfig(path.join(REPO_ROOT, 'configs', `${preset}.json`));
      for (const g of cfg.games) {
        if (g.adapterPath) {
          expect(g.siblingAdapterPath, `${preset}/${g.id}`).toBe(
            g.adapterPath.replace(`example-games/${g.id}/`, 'src/'),
          );
        }
      }
    }
  });
});

// ── Config selection ──────────────────────────────────────────────────────

describe('selectConfigPath', () => {
  it('defaults to core-only when no env is set', () => {
    const p = selectConfigPath(REPO_ROOT, {});
    expect(path.basename(p)).toBe('core-only.json');
  });

  it('resolves a named preset from GAMES_CONFIG', () => {
    const p = selectConfigPath(REPO_ROOT, { GAMES_CONFIG: 'arcade' });
    expect(path.basename(p)).toBe('arcade.json');
  });

  it('accepts an explicit path', () => {
    const p = selectConfigPath(REPO_ROOT, { GAMES_CONFIG: 'configs/full.json' });
    expect(p.endsWith(path.join('configs', 'full.json'))).toBe(true);
  });

  it('throws a clear error for an unknown preset name', () => {
    expect(() => selectConfigPath(REPO_ROOT, { GAMES_CONFIG: 'nope' })).toThrow(
      /nope/,
    );
  });
});

describe('loadGamesConfig', () => {
  it('throws an actionable error when the file does not exist', () => {
    expect(() => loadGamesConfig('/nonexistent/configs/full.json')).toThrow(
      /not found/i,
    );
  });

  it('rejects malformed JSON with the offending path', () => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tce-cfg-'));
    const bad = path.join(tmpRoot, 'bad.json');
    fs.writeFileSync(bad, '{ not json');
    expect(() => loadGamesConfig(bad)).toThrow(/bad\.json/);
  });

  it('rejects a config whose games is not an array', () => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tce-cfg-'));
    const bad = path.join(tmpRoot, 'bad.json');
    fs.writeFileSync(bad, JSON.stringify({ games: 'nope' }));
    expect(() => loadGamesConfig(bad)).toThrow(/games/i);
  });

  it('rejects an entry missing required fields', () => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tce-cfg-'));
    const bad = path.join(tmpRoot, 'bad.json');
    fs.writeFileSync(bad, JSON.stringify({ games: [{ id: 'golf' }] }));
    expect(() => loadGamesConfig(bad)).toThrow(/scenePath|path/i);
  });
});

// ── Discovery over a sibling layout ───────────────────────────────────────

describe('discoverGames', () => {
  it('resolves each configured game to its sibling source tree', () => {
    tmpRoot = makeFixture(['golf', 'coloretto'], {
      games: [
        { id: 'golf', path: '../tce-golf', scenePath: 'example-games/golf/scenes/GolfScene.ts' },
        {
          id: 'coloretto',
          path: '../tce-coloretto',
          scenePath: 'example-games/coloretto/scenes/ColorettoScene.ts',
        },
      ],
    });
    const core = path.join(tmpRoot, 'tableau-card-engine-core');
    const cfgPath = path.join(core, 'configs', 'preset.json');
    const result = discoverGames(loadGamesConfig(cfgPath), core);

    expect(result.map((g) => g.id)).toEqual(['golf', 'coloretto']);
    for (const g of result) {
      expect(fs.existsSync(g.absoluteScenePath)).toBe(true);
      expect(g.absoluteScenePath).toContain(`tce-${g.id}`);
      expect(g.sceneClass).toContain('Scene');
    }
  });

  it('prefers a local game tree over the sibling repo (monorepo layout)', () => {
    // Fixture has BOTH a local example-games/golf and a tce-golf sibling;
    // the local copy must win so one preset set works pre- and post-split.
    tmpRoot = makeFixture(['golf'], {
      games: [
        { id: 'golf', path: '../tce-golf', scenePath: 'example-games/golf/scenes/GolfScene.ts' },
      ],
    });
    const core = path.join(tmpRoot, 'tableau-card-engine-core');
    const localDir = path.join(core, 'example-games', 'golf', 'scenes');
    fs.mkdirSync(localDir, { recursive: true });
    const localScene = path.join(localDir, 'LocalGolfScene.ts');
    fs.writeFileSync(
      localScene,
      "export const GAME_INFO = { sceneKey: 'LocalGolfScene', title: 'Local', description: 'd' };\n",
    );

    const cfg = loadGamesConfig(path.join(core, 'configs', 'preset.json'));
    // Both point at GolfScene.ts; override the config to the local scene name.
    cfg.games[0].scenePath = 'example-games/golf/scenes/LocalGolfScene.ts';
    const [resolved] = discoverGames(cfg, core);
    expect(resolved.absoluteScenePath).toBe(localScene);
  });

  it('resolves a src/-layout sibling repo via siblingScenePath (Option C)', () => {
    tmpRoot = makeFixture([], null);
    const core = path.join(tmpRoot, 'tableau-card-engine-core');
    // A sibling repo whose source lives at src/ (no example-games/ tree).
    writeSrcLayoutScene(tmpRoot, 'golf');
    const config = {
      games: [
        {
          id: 'golf',
          path: '../tce-golf',
          scenePath: 'example-games/golf/scenes/GolfScene.ts',
          siblingScenePath: 'src/scenes/GolfScene.ts',
        },
      ],
    };
    const [resolved] = discoverGames(config, core);
    expect(resolved.absoluteScenePath).toBe(
      path.join(tmpRoot, 'tce-golf', 'src', 'scenes', 'GolfScene.ts'),
    );
    expect(resolved.info.description).toContain('golf');
  });

  it('fails fast with every candidate path when a src/ sibling scene is absent', () => {
    tmpRoot = makeFixture([], null);
    const core = path.join(tmpRoot, 'tableau-card-engine-core');
    const config = {
      games: [
        {
          id: 'golf',
          path: '../tce-golf',
          scenePath: 'example-games/golf/scenes/GolfScene.ts',
          siblingScenePath: 'src/scenes/GolfScene.ts',
        },
      ],
    };
    expect(() => discoverGames(config, core)).toThrow(/golf/);
    expect(() => discoverGames(config, core)).toThrow(/src\/scenes\/GolfScene\.ts/);
  });

  it('fails fast, naming the missing game, when it exists in neither location', () => {
    tmpRoot = makeFixture(['golf'], {
      games: [
        { id: 'golf', path: '../tce-golf', scenePath: 'example-games/golf/scenes/GolfScene.ts' },
        {
          id: 'ghost',
          path: '../tce-ghost',
          scenePath: 'example-games/ghost/scenes/GhostScene.ts',
        },
      ],
    });
    const core = path.join(tmpRoot, 'tableau-card-engine-core');
    const cfg = loadGamesConfig(path.join(core, 'configs', 'preset.json'));
    expect(() => discoverGames(cfg, core)).toThrow(/ghost/);
  });

  it('returns an empty list for a core-only config (no games)', () => {
    tmpRoot = makeFixture([], { games: [] });
    const core = path.join(tmpRoot, 'tableau-card-engine-core');
    const cfg = loadGamesConfig(path.join(core, 'configs', 'preset.json'));
    expect(discoverGames(cfg, core)).toEqual([]);
  });
});

// ── GAME_INFO convention ──────────────────────────────────────────────────

describe('readGameInfo', () => {
  it('parses a GAME_INFO export from a game scene module', () => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tce-info-'));
    const f = path.join(tmpRoot, 'GolfScene.ts');
    fs.writeFileSync(
      f,
      [
        'export const GAME_INFO = {',
        "  sceneKey: 'GolfScene',",
        "  title: '9-Card Golf',",
        "  description: 'Lowest score wins.',",
        "  thumbnail: 'games/golf/thumbnail',",
        '};',
      ].join('\n'),
    );
    const info = readGameInfo(f);
    expect(info).toEqual({
      sceneKey: 'GolfScene',
      title: '9-Card Golf',
      description: 'Lowest score wins.',
      thumbnail: 'games/golf/thumbnail',
    });
  });

  it('handles a GAME_INFO with no thumbnail', () => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tce-info-'));
    const f = path.join(tmpRoot, 'XScene.ts');
    fs.writeFileSync(
      f,
      "export const GAME_INFO = { sceneKey: 'XScene', title: 'X', description: 'd' };\n",
    );
    expect(readGameInfo(f).thumbnail).toBeUndefined();
  });

  it('throws when GAME_INFO is absent', () => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tce-info-'));
    const f = path.join(tmpRoot, 'NoInfo.ts');
    fs.writeFileSync(f, 'export class NoInfo {}\n');
    expect(() => readGameInfo(f)).toThrow(/GAME_INFO/);
  });

  it('finds GAME_INFO in a large scene module (regression: scan truncation)', () => {
    // Real scene modules exceed 50 KB with GAME_INFO declared at the end;
    // a naive bounded read of the file head would miss it.
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tce-info-'));
    const f = path.join(tmpRoot, 'BigScene.ts');
    const padding = `// ${'x'.repeat(60_000)}\n`;
    fs.writeFileSync(
      f,
      `${padding}export const GAME_INFO = { sceneKey: 'BigScene', title: 'Big', description: 'd' };\n`,
    );
    expect(readGameInfo(f).title).toBe('Big');
  });
});

// ── Generated module source ───────────────────────────────────────────────

describe('renderGameRegistryModule', () => {
  const games = [
    {
      id: 'golf',
      path: '../tce-golf',
      scenePath: 'example-games/golf/scenes/GolfScene.ts',
      absoluteScenePath: '/repo/tce-golf/example-games/golf/scenes/GolfScene.ts',
      sceneClass: 'GolfScene',
      info: {
        sceneKey: 'GolfScene',
        title: '9-Card Golf',
        description: 'Lowest score wins.',
        thumbnail: 'games/golf/thumbnail',
      },
    },
  ];

  it('imports each game scene module and exports GAMES + SCENES', () => {
    const src = renderGameRegistryModule(games);
    expect(src).toContain('GolfScene');
    expect(src).toContain('/repo/tce-golf/example-games/golf/scenes/GolfScene.ts');
    expect(src).toContain('export const GAMES');
    expect(src).toContain('export const SCENES');
  });

  it('emits an empty GAMES array for a core-only build', () => {
    const src = renderGameRegistryModule([]);
    expect(src).toMatch(/export const GAMES = \[\s*\{/);
    expect(src).toContain('export const SCENES');
    // No game imports are emitted — only the core-owned Gym barrel.
    expect(src).not.toContain('__game0');
  });

  it('always includes the core-owned Gym catalogue entry', () => {
    const src = renderGameRegistryModule([]);
    expect(src).toContain('Gym');
    // Gym is core-owned, so it is present even with no games selected.
    expect(src).toContain('GymRouterScene');
  });

  it('only imports Gym scenes the barrel actually exports', () => {
    // Regression: the plugin used to hardcode a Gym scene that had moved to a
    // game repo, which broke the core-only build at bundle time.
    const src = renderGameRegistryModule([]);
    const barrel = fs.readFileSync(
      path.join(REPO_ROOT, 'example-games', 'gym', 'index.ts'),
      'utf-8',
    );
    const imported = src
      .split('\n')
      .filter((l) => l.startsWith('  Gym') && l.endsWith(','))
      .map((l) => l.trim().replace(/,$/, ''));
    expect(imported.length).toBeGreaterThan(0);
    for (const scene of imported) {
      expect(barrel, `${scene} not exported by the Gym barrel`).toContain(
        `export { ${scene} }`,
      );
    }
  });

  it('imports the core-owned Gym from coreRoot in a game-repo context (F4)', () => {
    // A game repo keeps its Gym in the sibling ./core checkout, not locally,
    // so the plugin must resolve the barrel against coreRoot.
    const src = renderGameRegistryModule([], {
      coreRoot: '/repos/tableau-card-engine-core',
    });
    expect(src).toContain(
      "from \"/repos/tableau-card-engine-core/example-games/gym\"",
    );
    expect(src).not.toContain("from './example-games/gym'");
    expect(src).toContain('GymRouterScene');
  });
});

// ── Module id constants ───────────────────────────────────────────────────

describe('module ids', () => {
  it('exposes a virtual module id and its resolved counterpart', () => {
    expect(GAME_REGISTRY_MODULE_ID).toBe(VIRTUAL_MODULE_ID);
    expect(VIRTUAL_MODULE_ID).toContain('virtual:');
    expect(GAME_REGISTRY_RESOLVED_ID).toContain('virtual:');
    expect(GAME_REGISTRY_RESOLVED_ID).not.toBe(VIRTUAL_MODULE_ID);
  });
});

// ── Type contract ─────────────────────────────────────────────────────────

describe('GameConfigEntry shape', () => {
  it('requires id, path and scenePath', () => {
    const entry: GameConfigEntry = {
      id: 'golf',
      path: '../tce-golf',
      scenePath: 'example-games/golf/scenes/GolfScene.ts',
    };
    expect(entry.id).toBe('golf');
  });
});

// ── Core path aliases (AC5) ───────────────────────────────────────────────

describe('resolveCoreAliases', () => {
  const ALIAS_KEYS = ['@core-engine', '@card-system', '@rule-engine', '@ui', '@ai'];

  it('maps every core alias under the given core root', () => {
    const aliases = resolveCoreAliases('/repo/tableau-card-engine-core');
    for (const key of ALIAS_KEYS) {
      expect(aliases[key]).toContain('/repo/tableau-card-engine-core/src/');
    }
  });

  it('resolves aliases into a game repo ./core submodule (game context)', () => {
    const aliases = resolveCoreAliases('/repo/tce-golf/core');
    expect(aliases['@core-engine']).toBe('/repo/tce-golf/core/src/core-engine');
    expect(aliases['@ui']).toBe('/repo/tce-golf/core/src/ui');
  });
});

// ── selectedGameIds (test-profile filtering) ─────────────────────────────

describe('selectedGameIds', () => {
  it('returns every game for the full preset', () => {
    const ids = selectedGameIds(REPO_ROOT, { GAMES_CONFIG: 'full' });
    expect(ids.length).toBe(8);
    expect(ids).toContain('golf');
    expect(ids).toContain('main-street');
  });

  it('returns no ids for the core-only preset', () => {
    expect(selectedGameIds(REPO_ROOT, { GAMES_CONFIG: 'core-only' })).toEqual([]);
  });

  it('returns only the arcade preset games', () => {
    const ids = selectedGameIds(REPO_ROOT, { GAMES_CONFIG: 'arcade' });
    expect(ids.sort()).toEqual(['golf', 'main-street']);
  });

  it('degrades to no games for a broken preset rather than throwing', () => {
    // The core test profiles must stay runnable even with a bad GAMES_CONFIG.
    expect(() => selectedGameIds(REPO_ROOT, { GAMES_CONFIG: 'does-not-exist' })).not.toThrow();
    expect(selectedGameIds(REPO_ROOT, { GAMES_CONFIG: 'does-not-exist' })).toEqual([]);
  });
});

// ── Test runners must select the full preset ──────────────────────────────

describe('test runners select the full game preset', () => {
  const runners = [
    'run-ci-tests.sh',
    'run-dev-tests.sh',
    'run-smoke-tests.sh',
    'run-tutorial-tests.sh',
  ];

  for (const runner of runners) {
    it(`${runner} exports GAMES_CONFIG=full by default`, () => {
      const p = path.join(REPO_ROOT, 'scripts', runner);
      const src = fs.readFileSync(p, 'utf-8');
      // The suites exercise every game, so a core-only default would silently
      // skip game coverage.
      expect(src).toMatch(/export GAMES_CONFIG="\$\{GAMES_CONFIG:-full\}"/);
    });
  }
});
