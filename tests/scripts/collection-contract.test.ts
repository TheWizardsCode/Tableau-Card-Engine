/**
 * Collection-contract drift guard (CG-0MVXUFJKE000V0MJ).
 *
 * Three separate declarations describe the same game collection, and nothing
 * used to keep them in step:
 *
 *   1. `configs/full.json` — the distribution preset the launcher builds from;
 *   2. `scripts/configs/repo-layout.json` — the repo partition contract, the
 *      single source of truth for distribution bootstrap
 *      (`loadDistributionTargets`), publication (`publish:repos`), extraction
 *      (`extract-repos.sh`) and game-asset composition
 *      (`planGameAssetLinks`);
 *   3. `configs/<game-id>.json` — one per-game preset per game.
 *
 * A game present in (1) but missing from (2) silently degrades: the bootstrap
 * never clones it, publication never creates it, and `planGameAssetLinks`
 * quietly skips its assets (`continue`) instead of reporting the gap — so the
 * Game Selector 404s on the game's thumbnail and its SFX fall back to
 * `audio/default/`. 1916: The Rising was exactly that case.
 *
 * Every test here derives its expectation from one of the three declarations
 * rather than re-listing the games, so adding a game to `configs/full.json`
 * alone makes this suite fail until the rest of the contract catches up.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  composeGameAssets,
  planGameAssetLinks,
  readGameAssetOwnership,
} from '../../scripts/link-game-assets';
import { discoverGames, loadGamesConfig } from '../../scripts/vite-game-discovery-plugin';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const LAYOUT_PATH = path.join(REPO_ROOT, 'scripts', 'configs', 'repo-layout.json');
const FULL_PRESET_PATH = path.join(REPO_ROOT, 'configs', 'full.json');

interface RepoLayoutGame {
  name: string;
  slug: string;
  remote: string;
  paths: string[];
  assets: string[];
}

interface RepoLayout {
  games: RepoLayoutGame[];
  gameAssets: Array<{ game: string; assets: string[] }>;
}

function readLayout(): RepoLayout {
  return JSON.parse(fs.readFileSync(LAYOUT_PATH, 'utf-8')) as RepoLayout;
}

/** Game ids the `full` distribution preset ships (the intended collection). */
function fullPresetGameIds(): string[] {
  return loadGamesConfig(FULL_PRESET_PATH).games.map((g) => g.id);
}

/** Every game in `configs/full.json` resolved against its sibling checkout. */
const FULL_PRESET = loadGamesConfig(FULL_PRESET_PATH);

/**
 * True when the whole `full` distribution is bootstrapped, i.e. every preset
 * game has its sibling checkout at `../tce-<id>`. A bare core clone (engine +
 * Gym + launcher shell, no games) legitimately has none of them, so the
 * on-disk assertions below skip there, exactly like the existing
 * `HAS_ANY_GAME_CHECKOUT` guards in `distribution-presets.test.ts`.
 */
const HAS_FULL_DISTRIBUTION = FULL_PRESET.games.every((g) =>
  fs.existsSync(path.resolve(REPO_ROOT, g.path)),
);

// ── Drift guard ───────────────────────────────────────────────────────────

describe('collection contract drift guard', () => {
  it('registers every full-preset game in repo-layout.json', () => {
    const registered = new Set(readLayout().games.map((g) => g.name));
    const missing = fullPresetGameIds().filter((id) => !registered.has(id));
    expect(missing, 'games in configs/full.json but not in repo-layout.json').toEqual([]);
  });

  it('registers every repo-layout.json game in the full preset', () => {
    // The reverse direction: a repo the contract publishes but the `full`
    // distribution never ships is just as much a drift (and would make the
    // distribution incomplete).
    const shipped = new Set(fullPresetGameIds());
    const unshipped = readLayout()
      .games.map((g) => g.name)
      .filter((id) => !shipped.has(id));
    expect(unshipped, 'games in repo-layout.json but not in configs/full.json').toEqual(
      [],
    );
  });

  it('ships a per-game preset for every repo-layout.json game', () => {
    const missing = readLayout()
      .games.map((g) => g.name)
      .filter((id) => !fs.existsSync(path.join(REPO_ROOT, 'configs', `${id}.json`)));
    expect(missing, 'repo-layout game without configs/<id>.json').toEqual([]);
  });

  it('declares asset ownership for every full-preset game', () => {
    // Without a `gameAssets` entry `planGameAssetLinks` skips the game
    // silently, so its thumbnail and SFX 404 / fall back at runtime.
    const owned = new Set(readGameAssetOwnership(LAYOUT_PATH).map((o) => o.game));
    const unowned = fullPresetGameIds().filter((id) => !owned.has(id));
    expect(unowned, 'full-preset game with no gameAssets entry').toEqual([]);
  });

  it('agrees with the layout contract on each game repo slug', () => {
    const byName = new Map(readLayout().games.map((g) => [g.name, g]));
    for (const entry of FULL_PRESET.games) {
      const contract = byName.get(entry.id);
      expect(contract, `${entry.id} missing from repo-layout.json`).toBeDefined();
      expect(contract!.slug).toBe(`tce-${entry.id}`);
      expect(entry.path).toBe(`../${contract!.slug}`);
    }
  });

  it.skipIf(!HAS_FULL_DISTRIBUTION)(
    'resolves every full-preset game to a sibling checkout at ../tce-<id>',
    () => {
      for (const entry of FULL_PRESET.games) {
        expect(
          fs.existsSync(path.resolve(REPO_ROOT, '..', `tce-${entry.id}`)),
          `../tce-${entry.id} is not checked out`,
        ).toBe(true);
      }
    },
  );
});

// ── The Rising: asset composition proof ───────────────────────────────────

const THE_RISING_PRESET_PATH = path.join(REPO_ROOT, 'configs', 'the-rising.json');
const THE_RISING_SIBLING = path.resolve(REPO_ROOT, '..', 'tce-the-rising');
const HAS_THE_RISING_SIBLING = fs.existsSync(THE_RISING_SIBLING);

describe.skipIf(!HAS_THE_RISING_SIBLING)('the-rising asset composition', () => {
  /** The `full` preset's games in the shape `planGameAssetLinks` expects. */
  const selectedGames = FULL_PRESET.games.map((g) => ({ id: g.id, path: g.path }));

  it('plans both of the-rising asset roots from the layout contract', () => {
    const plan = planGameAssetLinks({
      projectRoot: REPO_ROOT,
      selectedGames,
      ownership: readGameAssetOwnership(LAYOUT_PATH),
    });

    const roots = plan.links
      .filter((link) => link.game === 'the-rising')
      .map((link) => link.asset)
      .sort();
    expect(roots).toEqual(['audio/the-rising', 'games/the-rising']);
    // The silent skip is what hid the gap: the game must never be reported as
    // "missing" once the contract declares it.
    expect(plan.missingGames).not.toContain('the-rising');
  });

  it('resolves the declared GAME_INFO.thumbnail key to the composed asset', () => {
    // Read the thumbnail key through the discovery layer (the convention the
    // Game Selector uses) rather than grepping the sibling's source.
    // The per-game preset keeps the discovery independent of the other
    // siblings (a missing sibling would make the full preset throw).
    const game = discoverGames(
      loadGamesConfig(THE_RISING_PRESET_PATH),
      REPO_ROOT,
    ).find((g) => g.id === 'the-rising');
    expect(game, 'the-rising is not discoverable').toBeDefined();
    const thumbnailKey = game!.info.thumbnail;
    expect(thumbnailKey).toBe('games/the-rising/thumbnail');

    // Compose into a temporary launcher root whose sibling is the real
    // `../tce-the-rising`, so the test proves the real files resolve without
    // dirtying the working tree's `public/assets`.
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tce-collection-'));
    try {
      fs.mkdirSync(path.join(root, 'launcher', 'configs'), { recursive: true });
      fs.mkdirSync(path.join(root, 'launcher', 'scripts', 'configs'), {
        recursive: true,
      });
      fs.mkdirSync(path.join(root, 'launcher', 'public', 'assets'), {
        recursive: true,
      });
      fs.copyFileSync(LAYOUT_PATH, path.join(root, 'launcher', 'scripts', 'configs', 'repo-layout.json'));
      fs.copyFileSync(
        THE_RISING_PRESET_PATH,
        path.join(root, 'launcher', 'configs', 'the-rising.json'),
      );
      // `<root>/tce-the-rising` is what `../tce-the-rising` resolves to from
      // the temporary launcher root.
      fs.symlinkSync(THE_RISING_SIBLING, path.join(root, 'tce-the-rising'), 'dir');

      const report = composeGameAssets({
        projectRoot: path.join(root, 'launcher'),
        env: { GAMES_CONFIG: 'the-rising' },
        layoutPath: path.join(root, 'launcher', 'scripts', 'configs', 'repo-layout.json'),
      });
      expect(report.linked.map((l) => l.asset).sort()).toEqual([
        'audio/the-rising',
        'games/the-rising',
      ]);

      // The Game Selector loads `assets/<thumbnail>.png`, so the declared key
      // (no extension) must resolve to a real, non-empty image.
      const composed = path.join(
        root,
        'launcher',
        'public',
        'assets',
        `${thumbnailKey}.png`,
      );
      expect(fs.existsSync(composed), `${composed} missing`).toBe(true);
      expect(fs.statSync(composed).size).toBeGreaterThan(0);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('composes the-rising audio so its SFX do not fall back to audio/default', () => {
    const plan = planGameAssetLinks({
      projectRoot: REPO_ROOT,
      selectedGames,
      ownership: readGameAssetOwnership(LAYOUT_PATH),
    });
    const audio = plan.links.find(
      (link) => link.game === 'the-rising' && link.asset === 'audio/the-rising',
    );
    expect(audio, 'audio/the-rising is not planned').toBeDefined();
    expect(fs.existsSync(audio!.source), `${audio!.source} missing`).toBe(true);
    // A representative SFX file the game actually requests.
    expect(fs.existsSync(path.join(audio!.source, 'card-draw.wav'))).toBe(true);
  });
});
