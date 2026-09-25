/**
 * Launcher distribution presets (F5 / CG-0MTRO77XA006YZZC).
 *
 * The launcher repo composes the core engine + Gym with any subset of the
 * sibling game checkouts (`../tce-<game>`) selected by a named
 * `configs/<preset>.json`. These tests pin the *distribution contract*:
 *
 *  - the canonical named presets exist and ship the exact game set they
 *    claim (AC1),
 *  - the boundary cases — exactly 1 game and all 8 games — are represented
 *    (AC4),
 *  - different presets produce genuinely different selector catalogues (AC5),
 *  - every configured game resolves to a real scene module and the generated
 *    registry lists exactly the included games plus the always-present Gym,
 *  - composition is sibling directories, not git submodules (AC6).
 *
 * The heavier `npm run build` / `build:electron` / `package` matrix for these
 * presets is executed as release verification (recorded on the work item);
 * these unit tests are the fast, deterministic guard for the preset wiring.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import {
  discoverGames,
  loadGamesConfig,
  renderGameRegistryModule,
  selectedGameIds,
} from '../../scripts/vite-game-discovery-plugin';

const REPO_ROOT = path.resolve(__dirname, '..', '..');

/** Every example game the distribution knows about. */
const ALL_GAME_IDS = [
  'beleaguered-castle',
  'blackjack',
  'coloretto',
  'feudalism',
  'golf',
  'lost-cities',
  'main-street',
  'sushi-go',
] as const;

/** The canonical named presets and the exact games each ships (AC1/AC4/AC5). */
const PRESET_GAMES: Record<string, readonly string[]> = {
  'core-only': [],
  solo: ['golf'],
  arcade: ['golf', 'main-street'],
  deluxe: ['feudalism', 'lost-cities'],
  full: ALL_GAME_IDS,
};

/** The scene class each game registers with the Game Selector. */
const SCENE_KEY: Record<string, string> = {
  'beleaguered-castle': 'BeleagueredCastleScene',
  blackjack: 'BlackjackScene',
  coloretto: 'ColorettoScene',
  feudalism: 'FeudalismScene',
  golf: 'GolfScene',
  'lost-cities': 'LostCitiesScene',
  'main-street': 'MainStreetScene',
  'sushi-go': 'SushiGoScene',
};

function loadPreset(name: string) {
  return loadGamesConfig(path.join(REPO_ROOT, 'configs', `${name}.json`));
}

/** Generate the `virtual:game-registry` module source for a preset. */
function registryFor(name: string): string {
  const games = discoverGames(loadPreset(name), REPO_ROOT);
  return renderGameRegistryModule(games);
}

// ── Named presets ─────────────────────────────────────────────────────────

describe('launcher distribution presets', () => {
  for (const [name, expected] of Object.entries(PRESET_GAMES)) {
    it(`configs/${name}.json ships exactly [${expected.join(', ') || 'no games'}]`, () => {
      const cfg = loadPreset(name);
      expect(cfg.games.map((g) => g.id).sort()).toEqual([...expected].sort());
      for (const g of cfg.games) {
        // AC6: each entry references a sibling game directory, not a submodule.
        expect(g.path).toBe(`../tce-${g.id}`);
        expect(g.scenePath).toContain(`example-games/${g.id}`);
      }
    });
  }

  it('represents the 1-game and all-games boundary cases (AC4)', () => {
    expect(loadPreset('solo').games).toHaveLength(1);
    expect(loadPreset('solo').games[0].id).toBe('golf');
    expect(loadPreset('full').games).toHaveLength(ALL_GAME_IDS.length);
    expect(loadPreset('full').games.map((g) => g.id).sort()).toEqual(
      [...ALL_GAME_IDS].sort(),
    );
  });

  it('arcade and deluxe select disjoint, non-empty game sets (AC5)', () => {
    const arcade = new Set(selectedGameIds(REPO_ROOT, { GAMES_CONFIG: 'arcade' }));
    const deluxe = new Set(selectedGameIds(REPO_ROOT, { GAMES_CONFIG: 'deluxe' }));
    expect(arcade.size).toBeGreaterThan(0);
    expect(deluxe.size).toBeGreaterThan(0);
    for (const id of deluxe) {
      expect(arcade.has(id), `${id} is in both arcade and deluxe`).toBe(false);
    }
  });

  it('accepts the AC3 explicit-path form GAMES_CONFIG=configs/<preset>.json', () => {
    for (const [name, expected] of Object.entries(PRESET_GAMES)) {
      const ids = selectedGameIds(REPO_ROOT, {
        GAMES_CONFIG: `configs/${name}.json`,
      });
      expect(ids.sort()).toEqual([...expected].sort());
    }
  });
});

// ── Resolution in the launcher checkout ───────────────────────────────────

describe('preset resolution in the launcher checkout', () => {
  for (const name of Object.keys(PRESET_GAMES)) {
    it(`resolves configs/${name}.json to existing scene modules`, () => {
      const games = discoverGames(loadPreset(name), REPO_ROOT);
      for (const g of games) {
        expect(fs.existsSync(g.absoluteScenePath), `${g.id} scene missing`).toBe(true);
        // The launcher checkout keeps every game locally under example-games/.
        expect(g.absoluteScenePath).toContain(`example-games/${g.id}`);
        expect(g.sceneClass).toBe(SCENE_KEY[g.id]);
      }
    });
  }
});

// ── Generated selector catalogue ──────────────────────────────────────────

describe('generated selector catalogue', () => {
  for (const [name, expected] of Object.entries(PRESET_GAMES)) {
    it(`configs/${name}.json registers exactly the included games plus Gym`, () => {
      const src = registryFor(name);
      // Gym is core-owned and present in every build, including core-only.
      expect(src).toContain('GymRouterScene');

      const included = new Set(expected);
      for (const id of ALL_GAME_IDS) {
        const key = SCENE_KEY[id];
        if (included.has(id)) {
          expect(src, `${id} missing from ${name}`).toContain(key);
        } else {
          expect(src, `${id} unexpectedly present in ${name}`).not.toContain(key);
        }
      }
    });
  }

  it('a core-only build imports no game modules (Gym only)', () => {
    const src = registryFor('core-only');
    expect(src).toContain('GymRouterScene');
    expect(src).not.toContain('__game0');
  });

  it('different presets generate different catalogues (AC5)', () => {
    const distinct = new Set(
      Object.keys(PRESET_GAMES).map((name) => registryFor(name)),
    );
    expect(distinct.size).toBe(Object.keys(PRESET_GAMES).length);
  });
});

// ── Sibling composition, not submodules ───────────────────────────────────

describe('composition is sibling directories, not git submodules (AC6)', () => {
  it('has no .gitmodules in the launcher checkout', () => {
    expect(fs.existsSync(path.join(REPO_ROOT, '.gitmodules'))).toBe(false);
  });
});
