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
import { GymSvgHelpersScene } from '../../example-games/gym/scenes/GymSvgHelpersScene';
import { GymMarketOfferEngineScene } from '../../example-games/gym/scenes/GymMarketOfferEngineScene';
import { GymSpatialRulesScene } from '../../example-games/gym/scenes/GymSpatialRulesScene';
import { GymRuleEngineScene } from '../../example-games/gym/scenes/GymRuleEngineScene';
import { GymAiStrategyScene } from '../../example-games/gym/scenes/GymAiStrategyScene';
import { GymAudioFeedbackScene } from '../../example-games/gym/scenes/GymAudioFeedbackScene';
import { GymI18nScene } from '../../example-games/gym/scenes/GymI18nScene';
import { GymGraphicsShaderSpikeScene } from '../../example-games/gym/scenes/GymGraphicsShaderSpikeScene';
import { GymGraphicsLightingSpikeScene } from '../../example-games/gym/scenes/GymGraphicsLightingSpikeScene';
import { GymSllScene } from '../../example-games/gym/scenes/GymSllScene';
import { GymLayoutOwnershipScene } from '../../example-games/gym/scenes/GymLayoutOwnershipScene';
import { GymParameterizedOverlayScene } from '../../example-games/gym/scenes/GymParameterizedOverlayScene';
import { waitForScene } from '../helpers/waitForScene';
import {
  GYM_DECK_RNG_KEY,
  GYM_HAND_PILE_KEY,
  GYM_OVERLAY_UI_KEY,
  GYM_UNDO_REDO_KEY,
  GYM_TRANSCRIPT_KEY,
  GYM_SAVE_LOAD_KEY,
  GYM_AUDIO_FEEDBACK_KEY,
  GYM_I18N_KEY,
  GYM_GRAPHICS_SHADER_SPIKE_KEY,
  GYM_GRAPHICS_LIGHTING_SPIKE_KEY,
  GYM_SLL_KEY,
  GYM_LAYOUT_OWNERSHIP_KEY,
  GYM_PARAMETERIZED_OVERLAY_KEY,
  GYM_SVG_HELPERS_KEY,
  GYM_AI_STRATEGY_KEY,
  GYM_MARKET_OFFER_ENGINE_KEY,
  GYM_SPATIAL_RULES_KEY,
  GYM_RULE_ENGINE_KEY,
} from '../../example-games/gym/GymRegistry';

const SCENES = [
  { key: GYM_DECK_RNG_KEY, Scene: GymDeckRngScene },
  { key: GYM_HAND_PILE_KEY, Scene: GymHandPileScene },
  { key: GYM_OVERLAY_UI_KEY, Scene: GymOverlayUiScene },
  { key: GYM_UNDO_REDO_KEY, Scene: GymUndoRedoScene },
  { key: GYM_TRANSCRIPT_KEY, Scene: GymTranscriptScene },
  { key: GYM_SAVE_LOAD_KEY, Scene: GymSaveLoadScene },
  { key: GYM_AUDIO_FEEDBACK_KEY, Scene: GymAudioFeedbackScene },
  { key: GYM_I18N_KEY, Scene: GymI18nScene },
  { key: GYM_GRAPHICS_SHADER_SPIKE_KEY, Scene: GymGraphicsShaderSpikeScene },
  { key: GYM_GRAPHICS_LIGHTING_SPIKE_KEY, Scene: GymGraphicsLightingSpikeScene },
  { key: GYM_SLL_KEY, Scene: GymSllScene },
  { key: GYM_LAYOUT_OWNERSHIP_KEY, Scene: GymLayoutOwnershipScene },
  { key: GYM_PARAMETERIZED_OVERLAY_KEY, Scene: GymParameterizedOverlayScene },
  { key: GYM_SVG_HELPERS_KEY, Scene: GymSvgHelpersScene },
  { key: GYM_AI_STRATEGY_KEY, Scene: GymAiStrategyScene },
  { key: GYM_MARKET_OFFER_ENGINE_KEY, Scene: GymMarketOfferEngineScene },
  { key: GYM_SPATIAL_RULES_KEY, Scene: GymSpatialRulesScene },
  { key: GYM_RULE_ENGINE_KEY, Scene: GymRuleEngineScene },
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