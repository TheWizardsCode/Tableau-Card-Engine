/**
 * Vite plugin: config-driven game discovery.
 *
 * Replaces the hardcoded game imports in `main.ts` with a catalogue derived
 * from a selected config preset (`configs/<preset>.json`). This is what lets
 * the core-engine repo build with no games, and lets a distribution assemble
 * any subset of 1..n games without editing source.
 *
 * Part of epic CG-0MTR7DLMY008CK17 (F3: CG-0MTRO6Y2N009B9CF).
 *
 * ## How it works
 *
 * `main.ts` imports from the virtual module `virtual:game-registry`:
 *
 * ```ts
 * import { GAMES, SCENES } from 'virtual:game-registry';
 * ```
 *
 * The plugin resolves that id, reads the selected preset, locates each game's
 * sibling source tree (a game repo checked out next to the core repo) and
 * generates a module that imports each scene class and each game's
 * `GAME_INFO` metadata.
 *
 * ## Selecting a preset
 *
 * Set `GAMES_CONFIG` (env var or Vite `--mode`) to a preset name
 * (`core-only`, `all`, `sample`) or an explicit path. Default: `core-only`.
 *
 * ## GAME_INFO convention
 *
 * Every game scene module exports its catalogue metadata alongside its scene
 * class:
 *
 * ```ts
 * export const GAME_INFO = {
 *   sceneKey: 'GolfScene',
 *   title: '9-Card Golf',
 *   description: 'Lowest score wins.',
 *   thumbnail: 'games/golf/thumbnail',
 * } satisfies GameEntry;
 * ```
 *
 * `thumbnail` is optional and, when present, is a path relative to the
 * game's own asset root (`assets/<thumbnail>.png`).
 */

import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

// ── Public constants ──────────────────────────────────────────────────────

/** The import specifier used by `main.ts`. */
export const VIRTUAL_MODULE_ID = 'virtual:game-registry';

/** Alias kept for callers that prefer the explicit name. */
export const GAME_REGISTRY_MODULE_ID = VIRTUAL_MODULE_ID;

/**
 * The id Vite stores the generated module under. The `\0` prefix marks it as
 * a virtual module (Rollup convention) so other plugins never touch it.
 */
export const GAME_REGISTRY_RESOLVED_ID = '\0' + VIRTUAL_MODULE_ID;

/** Directory (relative to the project root) holding the presets. */
export const CONFIGS_DIR = 'configs';

/** Default preset when `GAMES_CONFIG` is unset. */
export const DEFAULT_PRESET = 'core-only';

/**
 * Build the core-module path aliases for a given core checkout root.
 *
 * In the monorepo and the core repo itself the root is this directory; in a
 * game repo (F4) it is the `./core` submodule — or the sibling
 * `../tableau-card-engine-core` checkout — so the same `@core-engine/*` import
 * specifiers resolve from both contexts.
 *
 * @param coreRoot Absolute path to the core checkout.
 * @returns A Vite/Rollup alias map.
 */
export function resolveCoreAliases(coreRoot: string): Record<string, string> {
  return {
    '@core-engine': path.resolve(coreRoot, 'src/core-engine'),
    '@card-system': path.resolve(coreRoot, 'src/card-system'),
    '@rule-engine': path.resolve(coreRoot, 'src/rule-engine'),
    '@ui': path.resolve(coreRoot, 'src/ui'),
    '@ai': path.resolve(coreRoot, 'src/ai'),
    // Core-owned `src/` module without a top-level alias (balance-card tooling).
    '@balance-cards': path.resolve(coreRoot, 'src/balance-cards'),
    // Core-owned framework trees consumed by per-game repos (F9 / C2).
    '@core-scripts': path.resolve(coreRoot, 'scripts'),
    '@core-tests': path.resolve(coreRoot, 'tests'),
    '@core-gym': path.resolve(coreRoot, 'example-games/gym'),
  };
}

/**
 * Return the selected game ids for the active preset (empty when none).
 *
 * Used by `vite.config.ts` to filter the smoke/dev project test lists: a test
 * file that belongs to a game which is not checked out would otherwise make
 * Vitest fail with "no test files found". A core-only checkout therefore runs
 * only the core + Gym subsets.
 *
 * Never throws: a broken/missing preset degrades to "no games" so the core
 * test profiles always remain runnable.
 *
 * @param coreRoot Absolute core-repo root (where `configs/` lives).
 * @param env Environment-like record (defaults to `process.env`).
 * @returns Selected game ids in preset order.
 */
export function selectedGameIds(
  coreRoot: string,
  env: Record<string, string | undefined> = process.env,
): string[] {
  try {
    const configPath = selectConfigPath(coreRoot, env);
    if (!fs.existsSync(configPath)) return [];
    return loadGamesConfig(configPath).games.map((g) => g.id);
  } catch {
    return [];
  }
}

// ── Types ─────────────────────────────────────────────────────────────────

/** One game selection inside a preset. */
export interface GameConfigEntry {
  /** Stable id, e.g. `golf`. Also the sibling directory suffix (`tce-golf`). */
  id: string;
  /** Sibling path to the game repo root, relative to the core repo root. */
  path: string;
  /** Scene module path inside the game repo, e.g. `example-games/golf/scenes/GolfScene.ts`. */
  scenePath: string;
  /**
   * Optional replay-adapter module path inside the game repo. When present,
   * `scripts/replay.ts` dynamically imports it and registers the adapter, so
   * the replay tool works without the core importing any game code.
   */
  adapterPath?: string;
}

/** A parsed config preset. */
export interface GamesConfig {
  /** Selected games (empty for a core-only build). */
  games: GameConfigEntry[];
}

/** Catalogue metadata exported by a game as `GAME_INFO`. */
export interface GameInfo {
  sceneKey: string;
  title: string;
  description: string;
  thumbnail?: string;
}

/** A fully resolved game: config entry + on-disk facts + metadata. */
export interface DiscoveredGame extends GameConfigEntry {
  /** Absolute path to the scene module. */
  absoluteScenePath: string;
  /** Scene class name, derived from the scene module file name. */
  sceneClass: string;
  /** Catalogue metadata parsed from the scene module's `GAME_INFO`. */
  info: GameInfo;
}

// ── Config loading ────────────────────────────────────────────────────────

/**
 * Resolve the config path for a build.
 *
 * Accepts a preset name (`full`) or an explicit path (`configs/full.json`).
 * An unknown preset name is a hard error: silently falling back would ship a
 * distribution missing the games the operator asked for.
 *
 * @param projectRoot Absolute repo root (where `configs/` lives).
 * @param env Environment-like record (defaults to `process.env`).
 * @returns Absolute path to the selected config file.
 * @throws When the named preset does not exist.
 */
export function selectConfigPath(
  projectRoot: string,
  env: Record<string, string | undefined> = process.env,
): string {
  const requested = (env.GAMES_CONFIG ?? '').trim();

  if (!requested) {
    return path.join(projectRoot, CONFIGS_DIR, `${DEFAULT_PRESET}.json`);
  }

  // An explicit path (contains a separator or a .json suffix) is used as-is.
  if (requested.includes('/') || requested.endsWith('.json')) {
    return path.isAbsolute(requested)
      ? requested
      : path.join(projectRoot, requested);
  }

  const candidate = path.join(projectRoot, CONFIGS_DIR, `${requested}.json`);
  if (!fs.existsSync(candidate)) {
    const available = listPresets(projectRoot);
    throw new Error(
      `[game-discovery] Unknown GAMES_CONFIG preset "${requested}". ` +
        `Expected one of: ${available.join(', ')} ` +
        `(or an explicit path such as configs/${requested}.json).`,
    );
  }
  return candidate;
}

/** List available preset names (without the `.json` suffix). */
function listPresets(projectRoot: string): string[] {
  const dir = path.join(projectRoot, CONFIGS_DIR);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace(/\.json$/, ''))
    .sort();
}

/**
 * Read and validate a config preset.
 *
 * Validation is deliberately strict: a malformed preset must fail the build
 * with a message that names the offending file and field, never produce a
 * silently-emptier distribution.
 *
 * @param configPath Absolute path to the preset.
 * @returns The parsed config.
 * @throws When the file is missing, malformed, or fails validation.
 */
export function loadGamesConfig(configPath: string): GamesConfig {
  if (!fs.existsSync(configPath)) {
    throw new Error(
      `[game-discovery] Config not found: ${configPath}. ` +
        `Create configs/*.json or set GAMES_CONFIG to an existing preset.`,
    );
  }

  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch (err) {
    throw new Error(
      `[game-discovery] ${configPath} is not valid JSON: ${(err as Error).message}`,
    );
  }

  if (
    typeof raw !== 'object' ||
    raw === null ||
    !Array.isArray((raw as { games?: unknown }).games)
  ) {
    throw new Error(
      `[game-discovery] ${configPath} must be an object with a "games" array.`,
    );
  }

  const games = (raw as { games: unknown[] }).games;
  games.forEach((entry, i) => {
    if (typeof entry !== 'object' || entry === null) {
      throw new Error(
        `[game-discovery] ${configPath}: games[${i}] must be an object.`,
      );
    }
    const e = entry as Record<string, unknown>;
    for (const field of ['id', 'path', 'scenePath'] as const) {
      if (typeof e[field] !== 'string' || !(e[field] as string).length) {
        throw new Error(
          `[game-discovery] ${configPath}: games[${i}].${field} is required ` +
            `and must be a non-empty string.`,
        );
      }
    }
  });

  return { games: games as GameConfigEntry[] };
}

// ── Discovery ─────────────────────────────────────────────────────────────

/**
 * Resolve every configured game against the on-disk layout.
 *
 * A game is looked up in two places, in order:
 *
 * 1. **Locally**, at `<projectRoot>/<scenePath>` — the flat monorepo layout,
 *    where every game already lives under `example-games/`.
 * 2. **As a sibling repo**, at `<projectRoot>/<entry.path>/<scenePath>` — the
 *    decomposed layout, where each game is its own checkout next to the core.
 *
 * Supporting both keeps one preset set working in the monorepo before the
 * split and in the composed distribution after it.
 *
 * @param config Parsed preset.
 * @param projectRoot Absolute repo root.
 * @returns Fully resolved games in config order.
 * @throws When a configured game is found in neither location (fail fast — a
 *   partially-populated build is worse than a failed one).
 */
export function discoverGames(
  config: GamesConfig,
  projectRoot: string,
): DiscoveredGame[] {
  return config.games.map((entry) => {
    const localScenePath = path.resolve(projectRoot, entry.scenePath);
    const siblingRoot = path.resolve(projectRoot, entry.path);
    const siblingScenePath = path.resolve(siblingRoot, entry.scenePath);

    let absoluteScenePath: string;
    if (fs.existsSync(localScenePath)) {
      absoluteScenePath = localScenePath;
    } else if (fs.existsSync(siblingScenePath)) {
      absoluteScenePath = siblingScenePath;
    } else {
      throw new Error(
        `[game-discovery] Game "${entry.id}" not found. Expected its scene ` +
          `module either locally at ${localScenePath} or in the sibling repo ` +
          `${entry.path} at ${siblingScenePath}. Check out the sibling repo, ` +
          `or remove "${entry.id}" from the preset.`,
      );
    }

    return {
      ...entry,
      absoluteScenePath,
      sceneClass: sceneClassFromPath(absoluteScenePath),
      info: readGameInfo(absoluteScenePath),
    };
  });
}

/** Derive the exported scene class name from the module file name. */
function sceneClassFromPath(scenePath: string): string {
  return path.basename(scenePath, path.extname(scenePath));
}

/** Maximum characters of a `GAME_INFO` block the parser will read. */
const GAME_INFO_SCAN_LIMIT = 4_000;

/**
 * Parse the `GAME_INFO` export from a game scene module.
 *
 * Uses a text scan of the module source rather than importing it, because the
 * module imports Phaser and can only be evaluated in a browser/Vite context.
 * The convention is that `GAME_INFO` is a flat object literal of string
 * values; nested objects are not supported.
 *
 * The whole file is scanned (scene modules can be tens of KB), but the
 * brace-matching itself is bounded by `GAME_INFO_SCAN_LIMIT` counted *from*
 * the `GAME_INFO` keyword, so a pathological file cannot run away.
 *
 * @param scenePath Absolute path to the scene module.
 * @returns The catalogue metadata.
 * @throws When no usable `GAME_INFO` export is found.
 */
export function readGameInfo(scenePath: string): GameInfo {
  const source = fs.readFileSync(scenePath, 'utf-8');

  const start = source.indexOf('GAME_INFO');
  if (start === -1) {
    throw new Error(
      `[game-discovery] ${scenePath} does not export GAME_INFO. ` +
        `The GAME_INFO convention (sceneKey, title, description[, thumbnail]) ` +
        `is required so the Game Selector can list the game.`,
    );
  }

  const braceStart = source.indexOf('{', start);
  if (braceStart === -1) {
    throw new Error(`[game-discovery] Malformed GAME_INFO in ${scenePath}.`);
  }

  // Walk to the matching close brace (the object is flat by convention),
  // bounded so a pathological file cannot scan indefinitely.
  const scanEnd = Math.min(source.length, braceStart + GAME_INFO_SCAN_LIMIT);
  let depth = 0;
  let braceEnd = -1;
  for (let i = braceStart; i < scanEnd; i += 1) {
    const ch = source[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        braceEnd = i;
        break;
      }
    }
  }
  if (braceEnd === -1) {
    throw new Error(`[game-discovery] Unbalanced GAME_INFO in ${scenePath}.`);
  }

  const body = source.slice(braceStart + 1, braceEnd);
  const fields: Record<string, string> = {};
  const fieldRe = /(\w+)\s*:\s*(?:'([^']*)'|"([^"]*)"|`([^`]*)`)/g;
  let m: RegExpExecArray | null;
  while ((m = fieldRe.exec(body)) !== null) {
    fields[m[1]] = m[2] ?? m[3] ?? m[4] ?? '';
  }

  for (const required of ['sceneKey', 'title', 'description'] as const) {
    if (!fields[required]) {
      throw new Error(
        `[game-discovery] ${scenePath}: GAME_INFO.${required} is required.`,
      );
    }
  }

  const info: GameInfo = {
    sceneKey: fields.sceneKey,
    title: fields.title,
    description: fields.description,
  };
  if (fields.thumbnail) info.thumbnail = fields.thumbnail;
  return info;
}

// ── Module generation ─────────────────────────────────────────────────────

/** The core-owned Gym catalogue entry (always present). */
const GYM_ENTRY = {
  sceneKey: 'GymRouterScene',
  title: 'Gym',
  description:
    'Interactive demo scenes for every core-engine feature. Explore deck management, seeded RNG, undo/redo, overlays, transcript recording, save/load, and audio/feedback configuration.',
} as const;

/**
 * Options for {@link renderGameRegistryModule}.
 */
export interface RegistryModuleOptions {
  /**
   * Absolute core-repo root. When set, the Gym (which is core-owned) is
   * imported from `<coreRoot>/example-games/gym`, so a game repo whose Gym
   * lives in the sibling `./core` checkout still gets it. When omitted, the
   * barrel resolves relative to the project root (monorepo/core layout).
   */
  coreRoot?: string;
}

/**
 * Render the `virtual:game-registry` module source.
 *
 * The generated module exports:
 * - `GAMES`  — the catalogue (`GameEntry[]`), Gym first then each game.
 * - `SCENES` — every Phaser scene class to register, Gym scenes included.
 *
 * Gym is core-owned, so it is present in every build including core-only.
 *
 * @param games Resolved games (empty for a core-only build).
 * @param options Registry options (see {@link RegistryModuleOptions}).
 * @returns JavaScript module source.
 */
export function renderGameRegistryModule(
  games: DiscoveredGame[],
  options: RegistryModuleOptions = {},
): string {
  const imports: string[] = [];
  const sceneRegistrations: string[] = [];
  const catalogueEntries: string[] = [];

  const gymBarrel = options.coreRoot
    ? path.resolve(options.coreRoot, 'example-games/gym')
    : GYM_BARREL;

  // Core-owned Gym first.
  imports.push(
    `import {\n${GYM_SCENE_NAMES.map((n) => `  ${n},`).join('\n')}\n} from ${JSON.stringify(gymBarrel)};`,
  );
  sceneRegistrations.push(...GYM_SCENE_NAMES);
  catalogueEntries.push(JSON.stringify(GYM_ENTRY, null, 2));

  games.forEach((game, i) => {
    const alias = `__game${i}`;
    imports.push(`import * as ${alias} from ${JSON.stringify(game.absoluteScenePath)};`);
    sceneRegistrations.push(`${alias}.${game.sceneClass}`);
    catalogueEntries.push(`  ${JSON.stringify(game.info, null, 2).replace(/\n/g, '\n  ')}`);
  });

  return [
    '// AUTO-GENERATED by scripts/vite-game-discovery-plugin.ts — do not edit.',
    `// Selected games: ${games.length === 0 ? '(none — core-only build)' : games.map((g) => g.id).join(', ')}`,
    ...imports,
    '',
    'export const GAMES = [',
    catalogueEntries.join(',\n'),
    '];',
    '',
    'export const SCENES = [',
    sceneRegistrations.map((s) => `  ${s},`).join('\n'),
    '];',
    '',
  ].join('\n');
}

/** Path to the Gym barrel, relative to the core repo root. */
const GYM_BARREL = './example-games/gym';

/** Gym scene classes registered by the barrel. */
const GYM_SCENE_NAMES = [
  'GymRouterScene',
  'GymDeckRngScene',
  'GymHandPileScene',
  'GymOverlayUiScene',
  'GymUndoRedoScene',
  'GymTranscriptScene',
  'GymSaveLoadScene',
  'GymAudioFeedbackScene',
  'GymI18nScene',
  'GymAiStrategyScene',
  'GymGraphicsShaderSpikeScene',
  'GymGraphicsLightingSpikeScene',
  'GymSllScene',
  'GymTooltipScene',
  'GymHudComponentsScene',
  'GymLayoutOwnershipScene',
  'GymParameterizedOverlayScene',
  'GymSvgHelpersScene',
  'GymMarketOfferEngineScene',
  'GymSpatialRulesScene',
  'GymTokenPileViewScene',
  'GymRuleEngineScene',
] as const;

// ── The plugin ────────────────────────────────────────────────────────────

/**
 * Create the game-discovery Vite plugin.
 *
 * @param options.projectRoot Repo root override (defaults to Vite's root).
 * @param options.env Environment override (defaults to `process.env`).
 * @returns A Vite plugin instance.
 */
export function gameDiscoveryPlugin(options: {
  projectRoot?: string;
  env?: Record<string, string | undefined>;
  /**
   * Absolute core-repo root. A game repo (F4) sets this to its `./core`
   * submodule (or sibling `../tableau-card-engine-core`) so the core-owned
   * Gym resolves from the engine checkout rather than the game repo root.
   */
  coreRoot?: string;
} = {}): Plugin {
  let projectRoot = options.projectRoot ?? process.cwd();
  let generated = '';

  const build = (): string => {
    const env = options.env ?? process.env;
    const configPath = selectConfigPath(projectRoot, env);
    const config = loadGamesConfig(configPath);
    const games = discoverGames(config, projectRoot);
    return renderGameRegistryModule(
      games,
      options.coreRoot ? { coreRoot: options.coreRoot } : {},
    );
  };

  return {
    name: 'tce-game-discovery',

    configResolved(config) {
      if (!options.projectRoot) projectRoot = config.root;
    },

    resolveId(id) {
      if (id === VIRTUAL_MODULE_ID) return GAME_REGISTRY_RESOLVED_ID;
      return null;
    },

    load(id) {
      if (id !== GAME_REGISTRY_RESOLVED_ID) return null;
      if (!generated) generated = build();
      return generated;
    },

    // Watching a preset change should re-generate the catalogue in dev.
    configureServer(server) {
      const configPath = selectConfigPath(projectRoot, options.env ?? process.env);
      server.watcher.add(configPath);
      server.watcher.on('change', (file) => {
        if (path.resolve(file) === path.resolve(configPath)) {
          generated = '';
          const mod = server.moduleGraph.getModuleById(GAME_REGISTRY_RESOLVED_ID);
          if (mod) server.moduleGraph.invalidateModule(mod);
        }
      });
    },
  };
}

export default gameDiscoveryPlugin;
