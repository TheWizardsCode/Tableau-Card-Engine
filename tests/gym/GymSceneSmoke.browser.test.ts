/**
 * Gym individual scene browser smoke tests.
 *
 * Validates that each Gym demo scene boots without errors
 * in a headless browser environment.
 */
import { afterEach, describe, expect, it } from 'vitest';
import Phaser from 'phaser';
import { GymDeckRngScene } from '../../example-games/gym/scenes/GymDeckRngScene';
import { GymHandPileScene } from '../../example-games/gym/scenes/GymHandPileScene';
import { GymOverlayUiScene } from '../../example-games/gym/scenes/GymOverlayUiScene';
import { GymUndoRedoScene } from '../../example-games/gym/scenes/GymUndoRedoScene';
import { GymTranscriptScene } from '../../example-games/gym/scenes/GymTranscriptScene';
import { GymSaveLoadScene } from '../../example-games/gym/scenes/GymSaveLoadScene';
import { GymAudioFeedbackScene } from '../../example-games/gym/scenes/GymAudioFeedbackScene';
import { GymGraphicsShaderSpikeScene } from '../../example-games/gym/scenes/GymGraphicsShaderSpikeScene';
import { GymGraphicsLightingSpikeScene } from '../../example-games/gym/scenes/GymGraphicsLightingSpikeScene';
import { GymSllScene } from '../../example-games/gym/scenes/GymSllScene';
import { waitForScene } from '../helpers/waitForScene';
import {
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
} from '../../example-games/gym/GymRegistry';

const SCENES = [
  { key: GYM_DECK_RNG_KEY, Scene: GymDeckRngScene },
  { key: GYM_HAND_PILE_KEY, Scene: GymHandPileScene },
  { key: GYM_OVERLAY_UI_KEY, Scene: GymOverlayUiScene },
  { key: GYM_UNDO_REDO_KEY, Scene: GymUndoRedoScene },
  { key: GYM_TRANSCRIPT_KEY, Scene: GymTranscriptScene },
  { key: GYM_SAVE_LOAD_KEY, Scene: GymSaveLoadScene },
  { key: GYM_AUDIO_FEEDBACK_KEY, Scene: GymAudioFeedbackScene },
  { key: GYM_GRAPHICS_SHADER_SPIKE_KEY, Scene: GymGraphicsShaderSpikeScene },
  { key: GYM_GRAPHICS_LIGHTING_SPIKE_KEY, Scene: GymGraphicsLightingSpikeScene },
  { key: GYM_SLL_KEY, Scene: GymSllScene },
];

describe('Gym individual scene smoke', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => {
    if (game) game.destroy(true, false);
    game = null;
    const container = document.getElementById('game-container');
    if (container) container.remove();
  });

  for (const { key, Scene } of SCENES) {
    it(`${key} boots without errors`, async () => {
      const container = document.createElement('div');
      container.id = 'game-container';
      document.body.appendChild(container);

      game = new Phaser.Game({ type: Phaser.CANVAS,
        width: 1280,
        height: 720,
        parent: 'game-container',
        backgroundColor: '#1a2a1a',
        scene: [Scene],
      });

      await waitForScene(game, key);

      const activeScene = game.scene.getScene(key);
      expect(activeScene).toBeTruthy();
      expect(activeScene.sys.isActive()).toBe(true);
      expect(container.querySelector('canvas')).not.toBeNull();
    });
  }
});