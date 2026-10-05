/**
 * Browser tests for the Game Selector's runtime game plugin integration
 * (feature F5 / CG-0MUG2ZKVQ005YNE2).
 *
 * Verifies, in a real Chromium/Canvas context:
 *   - merged static + dynamic games render through the same card-layout path;
 *   - a dynamic game's resolved thumbnail URL is used to render its card;
 *   - incompatible games are hidden from the grid and listed in a notice;
 *   - a dynamic game whose thumbnail fails to load degrades to a text-only
 *     card without throwing.
 *
 * The dynamic entries here mirror the shape `GamePluginLoader.loadGamePlugins`
 * returns (F4): a `GameEntry` whose `thumbnail` is an already-resolved URL.
 */

import { describe, it, expect, afterEach } from 'vitest';
import Phaser from 'phaser';

import { GAME_W, GAME_H } from '../../src/ui/constants';
import {
  GameSelectorScene,
  REGISTRY_KEY_GAMES,
  REGISTRY_KEY_INCOMPATIBLE_GAMES,
  type GameEntry,
} from '../../src/ui/GameSelectorScene';
import type { IncompatibleGame } from '../../src/ui/game-manifest';
import {
  getActiveRuntimeGame,
  setActiveRuntimeGame,
} from '../../src/ui/game-asset-url';
import { waitForScene } from '../helpers/waitForScene';

/** Deterministic 1×1 transparent PNG used as an in-browser (data URL) thumbnail. */
const THUMB_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQAY3Y2wAAAAAElFTkSuQmCC';

/** A URL no protocol handler serves in the test browser — load will fail. */
const UNLOADABLE_THUMB = 'tce-games://plugin-game/assets/does-not-exist.png';

let game: Phaser.Game | null = null;
let container: HTMLDivElement | null = null;

async function bootSelector(
  games: GameEntry[],
  incompatibleGames: IncompatibleGame[] = [],
): Promise<Phaser.Scene> {
  container = document.createElement('div');
  container.id = 'game-selector-plugin-test';
  document.body.appendChild(container);

  game = new Phaser.Game({
    type: Phaser.CANVAS,
    parent: container.id,
    width: GAME_W,
    height: GAME_H,
    scene: [GameSelectorScene],
    callbacks: {
      preBoot: (g: Phaser.Game) => {
        g.registry.set(REGISTRY_KEY_GAMES, games);
        g.registry.set(REGISTRY_KEY_INCOMPATIBLE_GAMES, incompatibleGames);
      },
    },
  });

  await waitForScene(game, GameSelectorScene.KEY);
  return game.scene.getScene(GameSelectorScene.KEY);
}

afterEach(() => {
  setActiveRuntimeGame(null);
  if (game) {
    game.destroy(true, false);
    game = null;
  }
  if (container) {
    container.remove();
    container = null;
  }
});

/** All text strings currently rendered on the scene. */
function sceneTexts(scene: Phaser.Scene): string[] {
  const texts: string[] = [];
  scene.children.each((child: Phaser.GameObjects.GameObject) => {
    if (child instanceof Phaser.GameObjects.Text) texts.push(child.text);
  });
  return texts;
}

/** Texture keys of every image currently rendered on the scene. */
function sceneImageKeys(scene: Phaser.Scene): string[] {
  const keys: string[] = [];
  scene.children.each((child: Phaser.GameObjects.GameObject) => {
    if (child instanceof Phaser.GameObjects.Image) keys.push(child.texture.key);
  });
  return keys;
}

describe('GameSelectorScene — runtime plugin integration', () => {
  it('renders static and dynamic games through the same card path', async () => {
    const games: GameEntry[] = [
      { sceneKey: 'StaticScene', title: 'Static Game', description: 'static' },
      {
        sceneKey: 'DynamicScene',
        title: 'Dynamic Game',
        description: 'dynamic',
        thumbnail: THUMB_DATA_URL,
      },
    ];

    const scene = await bootSelector(games);

    const texts = sceneTexts(scene);
    expect(texts).toContain('Static Game');
    expect(texts).toContain('Dynamic Game');

    // The dynamic entry's resolved URL is used as the texture key.
    expect(sceneImageKeys(scene)).toContain(THUMB_DATA_URL);
  });

  it('hides incompatible games from the grid and lists them in a notice', async () => {
    const incompatible: IncompatibleGame[] = [
      {
        entry: {
          id: 'future',
          sceneKey: 'FutureScene',
          title: 'Future Game',
          description: 'Needs a newer core.',
          coreEngineVersion: '^9.0.0',
          entry: 'entry.js',
        },
        reason: 'requires core v^9.0.0 (launcher is v0.1.0)',
      },
    ];

    const scene = await bootSelector(
      [{ sceneKey: 'StaticScene', title: 'Static Game', description: 'static' }],
      incompatible,
    );

    const texts = sceneTexts(scene);

    // The notice names the game and its required range.
    expect(
      texts.some(
        (text) =>
          text.includes('Incompatible game: Future Game') &&
          text.includes('requires core v^9.0.0'),
      ),
    ).toBe(true);

    // It is not rendered as a card (no exact card title).
    expect(texts.filter((text) => text === 'Future Game')).toHaveLength(0);
  });

  it('degrades a dynamic game with an unloadable thumbnail to a text-only card', async () => {
    const games: GameEntry[] = [
      {
        sceneKey: 'BrokenThumbScene',
        title: 'Broken Thumb',
        description: 'thumbnail cannot load',
        thumbnail: UNLOADABLE_THUMB,
      },
    ];

    const scene = await bootSelector(games);

    // The card still renders...
    expect(sceneTexts(scene)).toContain('Broken Thumb');
    // ... but without the thumbnail image, and without throwing.
    expect(sceneImageKeys(scene)).not.toContain(UNLOADABLE_THUMB);
  });

  it('activates a runtime game id when its card starts the scene', async () => {
    const RUNTIME_SCENE_KEY = 'RuntimeAssetScene';
    const scene = await bootSelector([
      {
        sceneKey: RUNTIME_SCENE_KEY,
        title: 'Runtime Asset Game',
        description: 'dynamic game with its own assets',
        runtimeGameId: 'runtime-asset-game',
      },
    ]);

    game!.scene.add(
      RUNTIME_SCENE_KEY,
      class extends Phaser.Scene {
        constructor() {
          super({ key: RUNTIME_SCENE_KEY });
        }
      },
      false,
    );

    const zone = scene.children.list.find(
      (child): child is Phaser.GameObjects.Zone =>
        child instanceof Phaser.GameObjects.Zone,
    );
    expect(zone).toBeTruthy();

    // Entering the selector cleared the base; clicking the card sets it again.
    setActiveRuntimeGame(null);
    zone!.emit('pointerdown');

    expect(getActiveRuntimeGame()).toBe('runtime-asset-game');
    await waitForScene(game!, RUNTIME_SCENE_KEY);
    expect(game!.scene.isActive(RUNTIME_SCENE_KEY)).toBe(true);
  });

  it('clears the active runtime game when the selector initialises', async () => {
    setActiveRuntimeGame('previous-game');

    await bootSelector([{ sceneKey: 'StaticScene', title: 'Static', description: 'static' }]);

    expect(getActiveRuntimeGame()).toBeNull();
  });
});
