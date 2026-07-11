/**
 * Gym example game -- barrel file exporting all Gym scenes.
 *
 * The Gym is a curated collection of demo scenes, each showcasing
 * a specific core-engine feature. It is registered as a single
 * entry in the Game Selector catalogue; selecting "Gym" boots
 * the GymRouterScene which provides navigation to each demo.
 *
 * @module example-games/gym
 */

export { GymRouterScene } from './scenes/GymRouterScene';
export { GymSceneBase } from './scenes/GymSceneBase';
export { GymDeckRngScene } from './scenes/GymDeckRngScene';
export { GymHandPileScene } from './scenes/GymHandPileScene';
export { GymOverlayUiScene } from './scenes/GymOverlayUiScene';
export { GymUndoRedoScene } from './scenes/GymUndoRedoScene';
export { GymTranscriptScene } from './scenes/GymTranscriptScene';
export { GymSaveLoadScene } from './scenes/GymSaveLoadScene';
export { GymAudioFeedbackScene } from './scenes/GymAudioFeedbackScene';
export { GymGraphicsShaderSpikeScene } from './scenes/GymGraphicsShaderSpikeScene';
export { GymGraphicsLightingSpikeScene } from './scenes/GymGraphicsLightingSpikeScene';
export { GymSllScene } from './scenes/GymSllScene';
export { GymTooltipScene } from './scenes/GymTooltipScene';
export { GymHudComponentsScene } from './scenes/GymHudComponentsScene';
export { GymLayoutOwnershipScene } from './scenes/GymLayoutOwnershipScene';

export {
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
  GYM_TOOLTIP_KEY,
  GYM_HUD_COMPONENTS_KEY,
  GYM_LAYOUT_OWNERSHIP_KEY,
  GYM_SCENE_CATALOGUE,
} from './GymRegistry';
export type { GymSceneEntry } from './GymRegistry';