/**
 * UI Module
 *
 * Provides reusable UI components such as buttons, menus,
 * and overlays that can be customized for different tableau card game themes.
 */
export const UI_VERSION = '0.1.0';

// Card game scene base class
export { CardGameScene } from './CardGameScene';

// Phase state machine
export { PhaseManager } from './PhaseManager';
export type { PhaseManagerConfig } from './PhaseManager';

// Card flip animation
export { flipCard } from './flipCard';
export type { FlipCardOptions } from './flipCard';

// Illegal move shake animation
export { shakeIllegalMove } from './shakeIllegalMove';
export type { ShakeIllegalMoveOptions } from './shakeIllegalMove';

// Positional movement animation
export { moveGameObject } from './moveGameObject';
export type { MoveGameObjectOptions } from './moveGameObject';

// Card deal animation
export { dealCard, DEFAULT_DEAL_DURATION, DEFAULT_DEAL_ARC_HEIGHT } from './dealCard';
export type { DealCardOptions, CardDealtPayload } from './dealCard';

// Card place animation
export { placeCard, DEFAULT_PLACE_DURATION } from './placeCard';
export type { PlaceCardOptions, CardPlacedPayload } from './placeCard';

// Card discard animation
export { discardCard, DEFAULT_DISCARD_DURATION } from './discardCard';
export type { DiscardCardOptions, CardDiscardedPayload } from './discardCard';

// Event / transition animation helpers
export { popTextOrIcon } from './popTextOrIcon';
export type { PopTextOrIconOptions } from './popTextOrIcon';
export { runSceneTransition } from './sceneTransition';
export type { SceneTransitionOptions, SceneTransitionMode, SceneTransitionType } from './sceneTransition';

// Card layout helpers
export { layoutCardPositions } from './layoutCardPositions';
export type {
  LayoutCardPositionsOptions,
  LayoutCardPositionsResult,
} from './layoutCardPositions';

// Card game factory helper
export { createCardGame } from './createCardGame';
export type { CardGameOptions } from './createCardGame';

export { HelpPanel, DEPTH_HELP_BUTTON } from './HelpPanel';
export type { HelpSection, HelpPanelConfig } from './HelpPanel';

export { HelpButton } from './HelpButton';
export type { HelpButtonConfig } from './HelpButton';

export { SettingsPanel, DEPTH_SETTINGS_BUTTON } from './SettingsPanel';
export type { SettingsPanelConfig } from './SettingsPanel';

export { SettingsButton } from './SettingsButton';
export type { SettingsButtonConfig } from './SettingsButton';

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

// Hi-DPI text rendering (side-effect import for patching)
export { TEXT_DPR } from './hiDpiText';

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
