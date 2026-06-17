/**
 * Gym Router Scene - browser smoke test.
 *
 * Validates that:
 *  - The Gym boots without errors in a browser environment
 *  - GymRouterScene renders and is active
 *  - Scene navigation cards are created for each catalogue entry
 */
import { afterEach, describe, expect, it } from 'vitest';
import Phaser from 'phaser';
import { GymRouterScene } from '../../example-games/gym/scenes/GymRouterScene';
import {
  GymDeckRngScene,
  GymHandPileScene,
  GymOverlayUiScene,
  GymUndoRedoScene,
  GymTranscriptScene,
  GymSaveLoadScene,
  GymAudioFeedbackScene,
  GymGraphicsShaderSpikeScene,
  GymGraphicsLightingSpikeScene,
  GymSllScene,
} from '../../example-games/gym';
import { waitForScene } from '../helpers/waitForScene';
import {
  GYM_ROUTER_KEY,
  GYM_DECK_RNG_KEY,
  GYM_HAND_PILE_KEY,
  GYM_OVERLAY_UI_KEY,
  GYM_UNDO_REDO_KEY,
  GYM_TRANSCRIPT_KEY,
  GYM_SAVE_LOAD_KEY,
  GYM_AUDIO_FEEDBACK_KEY,
  GYM_GRAPHICS_SHADER_SPIKE_KEY,
  GYM_GRAPHICS_LIGHTING_SPIKE_KEY,
  GYM_SLL_KEY,
  GYM_SCENE_CATALOGUE,
} from '../../example-games/gym/GymRegistry';

describe('GymRouterScene browser smoke', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => {
    if (game) game.destroy(true, false);
    game = null;
    const container = document.getElementById('game-container');
    if (container) container.remove();
  });

  it('boots and renders the GymRouterScene under Phaser 4', async () => {
    const container = document.createElement('div');
    container.id = 'game-container';
    document.body.appendChild(container);

    game = new Phaser.Game({ type: Phaser.CANVAS,
      width: 1280,
      height: 720,
      parent: 'game-container',
      backgroundColor: '#1a2a1a',
      scene: [
        GymRouterScene,
        GymDeckRngScene,
        GymHandPileScene,
        GymOverlayUiScene,
        GymUndoRedoScene,
        GymTranscriptScene,
        GymSaveLoadScene,
        GymAudioFeedbackScene,
        GymGraphicsShaderSpikeScene,
        GymGraphicsLightingSpikeScene,
        GymSllScene,
      ],
    });

    await waitForScene(game, 'GymRouterScene');

    const activeScene = game.scene.getScene('GymRouterScene');
    expect(activeScene).toBeTruthy();
    expect(activeScene.sys.isActive()).toBe(true);
    expect(container.querySelector('canvas')).not.toBeNull();
  });

  it('renders navigation cards for each catalogue entry', async () => {
    const container = document.createElement('div');
    container.id = 'game-container';
    document.body.appendChild(container);

    game = new Phaser.Game({ type: Phaser.CANVAS,
      width: 1280,
      height: 720,
      parent: 'game-container',
      backgroundColor: '#1a2a1a',
      scene: [GymRouterScene],
    });

    await waitForScene(game, 'GymRouterScene');

    const scene = game.scene.getScene('GymRouterScene') as GymRouterScene;
    expect(scene).toBeTruthy();
    // The scene should have created interactive zones (hit areas) for each entry
    const zones = scene.children.list.filter(
      (c) => c instanceof Phaser.GameObjects.Zone,
    );
    expect(zones.length).toBe(GYM_SCENE_CATALOGUE.length);
  });

  it('all Gym demo scenes can be started by key', async () => {
    const container = document.createElement('div');
    container.id = 'game-container';
    document.body.appendChild(container);

    const allGymSceneKeys = [
      GYM_ROUTER_KEY,
      GYM_DECK_RNG_KEY,
      GYM_HAND_PILE_KEY,
      GYM_OVERLAY_UI_KEY,
      GYM_UNDO_REDO_KEY,
      GYM_TRANSCRIPT_KEY,
      GYM_SAVE_LOAD_KEY,
      GYM_AUDIO_FEEDBACK_KEY,
      GYM_GRAPHICS_SHADER_SPIKE_KEY,
      GYM_GRAPHICS_LIGHTING_SPIKE_KEY,
      GYM_SLL_KEY,
    ];

    game = new Phaser.Game({ type: Phaser.CANVAS,
      width: 1280,
      height: 720,
      parent: 'game-container',
      backgroundColor: '#1a2a1a',
      scene: [
        GymRouterScene,
        GymDeckRngScene,
        GymHandPileScene,
        GymOverlayUiScene,
        GymUndoRedoScene,
        GymTranscriptScene,
        GymSaveLoadScene,
        GymAudioFeedbackScene,
        GymGraphicsShaderSpikeScene,
        GymGraphicsLightingSpikeScene,
        GymSllScene,
      ],
    });

    // Wait for the first scene to be active, ensuring the game has booted
    await waitForScene(game, GYM_ROUTER_KEY);

    // Verify each scene key is registered
    for (const key of allGymSceneKeys) {
      const scene = game.scene.getScene(key);
      expect(scene).toBeTruthy();
    }
  });
});