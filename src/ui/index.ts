/**
 * UI Module
 *
 * Provides reusable UI components such as buttons, menus,
 * and overlays that can be customized for different tableau card game themes.
 */
export const UI_VERSION = '0.1.0';

export { HelpPanel, DEPTH_HELP_BUTTON } from './HelpPanel';
export type { HelpSection, HelpPanelConfig } from './HelpPanel';

export { HelpButton } from './HelpButton';
export type { HelpButtonConfig } from './HelpButton';

export { GameSelectorScene, REGISTRY_KEY_GAMES } from './GameSelectorScene';
export type { GameEntry } from './GameSelectorScene';

// Shared constants
export { CARD_W, CARD_H, GAME_W, GAME_H, FONT_FAMILY } from './constants';

// Card texture helpers
export {
  rankFileName,
  cardTextureKey,
  cardFileName,
  getCardTexture,
  preloadCardAssets,
} from './CardTextureHelpers';

// Overlay system
export {
  createOverlayButton,
  OVERLAY_BUTTON_COLOR,
  OVERLAY_BUTTON_HOVER_COLOR,
  OVERLAY_BUTTON_FONT_SIZE,
} from './OverlayButton';
export type { OverlayButtonConfig } from './OverlayButton';

export { createOverlayBackground, dismissOverlay } from './Overlay';
export type {
  OverlayBackgroundOptions,
  OverlayBoxOptions,
  OverlayResult,
} from './Overlay';

export { createOverlayMenuButton } from './MenuButton';

// Scene header scaffolding
export {
  createSceneTitle,
  createSceneMenuButton,
  createSceneHeader,
  SCENE_HEADER_Y,
  SCENE_MENU_BUTTON_X,
  SCENE_TITLE_FONT_SIZE,
  SCENE_TITLE_COLOR,
  SCENE_MENU_BUTTON_FONT_SIZE,
  SCENE_MENU_BUTTON_COLOR,
  SCENE_MENU_BUTTON_HOVER_COLOR,
} from './SceneHeader';
export type {
  SceneTitleConfig,
  SceneMenuButtonConfig,
  SceneHeaderResult,
} from './SceneHeader';
