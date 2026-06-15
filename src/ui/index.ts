/**
 * UI Module
 *
 * Provides reusable UI components such as buttons, menus,
 * overlays, and the shared HUD layer that can be customized
 * for different tableau card game themes.
 *
 * ## HUD Layer
 *
 * - `initHUDContainer()` on `CardGameScene` creates a shared container
 *   at depth 1000 for help/settings panels and buttons.
 * - `OverlayManager` provides lifecycle management for game-state
 *   overlays (win, loss, game-over, round-end) at depth 2000.
 * - `createOverlayBackground()` and `createParameterizedOverlay()`
 *   provide reusable overlay UI primitives.
 *
 * See docs/HUD-LAYER-MIGRATION.md for migration guide.
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

// Screen layout language (SLL)
export {
  SCREEN_LAYOUT_SCHEMA,
  validateScreenLayoutDocument,
  parseScreenLayoutDocument,
} from './screen-layout-schema';
export type {
  PixelPoint,
  PixelRect,
  NormalizedPoint,
  NormalizedRect,
  ScreenLayoutZone,
  ScreenLayoutDocument,
  ScreenLayoutValidationError,
  ScreenLayoutValidationResult,
  ScreenLayoutParseResult,
} from './screen-layout-schema';
export {
  normalizedToPixels,
  pixelToNormalized,
  getZoneRect,
  anchorPoint,
  adaptLayoutWithFallback,
  ScreenLayoutMappingError,
} from './screen-layout';
export type {
  LayoutViewport,
  ResolvedZone,
  ResolvedScreenLayout,
  ScreenLayoutIssueCode,
  ScreenLayoutIssue,
  ScreenLayoutIssueReporter,
  LegacyLayoutAdapterOptions,
} from './screen-layout';
export {
  composeResolvedLayouts,
} from './screen-layout-compose';
export type {
  ComposeResolvedLayoutsPolicy,
  ComposeResolvedLayoutsIssueCode,
  ComposeResolvedLayoutsIssue,
  ComposeResolvedLayoutsIssueReporter,
  ComposeResolvedLayoutsOptions,
} from './screen-layout-compose';

// Card game factory helper
export { createCardGame } from './createCardGame';
export type { CardGameOptions } from './createCardGame';

// Card selection helpers
export { attachSelection, createSingleSelectionManager } from './selection';
export type {
  SelectionController,
  SelectionState,
  AttachSelectionOptions,
  SingleSelectionManager,
} from './selection';

export { HelpPanel, DEPTH_HELP_BUTTON } from './HelpPanel';
export type { HelpSection, HelpPanelConfig, HelpButtonPosition } from './HelpPanel';

export { HelpButton } from './HelpButton';
export type { HelpButtonConfig } from './HelpButton';

export { SettingsPanel, DEPTH_SETTINGS_BUTTON } from './SettingsPanel';
export { TooltipManager } from './Tooltip';
export type { TooltipRenderContext, PhaserTooltipRenderFn, TooltipManagerConfig } from './Tooltip';
export type { SettingsPanelConfig, SettingsButtonPosition } from './SettingsPanel';

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
export { OverlayManager, type OverlayConfig, type OverlayType } from './OverlayManager';
export {
  createParameterizedOverlay,
  overlayCenterY,
} from './ParameterizedOverlay';
export type {
  ParameterizedOverlayConfig,
  ParameterizedOverlayButton,
} from './ParameterizedOverlay';

// HandView – reusable hand-of-cards display component
export { HandView } from './HandView';
export type {
  HandViewOptions,
  AddCardOptions,
  RemoveCardOptions,
  HandViewEvents,
  CardTextureResolver,
  RenderCardFn,
} from './HandView';

// PileView – reusable card-pile display component
export { PileView } from './PileView';
export type {
  PileViewOptions,
  PileViewEvents,
  CardPile,
  CardTextureResolver as PileViewCardTextureResolver,
} from './PileView';

// TokenPileView – reusable token-pile display for non-standard card models
export { TokenPileView, createSimpleTokenRenderer, createCardBackTokenRenderer } from './TokenPileView';
export type {
  TokenPileViewOptions,
  TokenPileViewEvents,
  TokenRenderer,
} from './TokenPileView';

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

// Shared Renderer API – container, HUD, tooltip, and button helpers
export {
  createHudContainer,
  createGameZone,
  createHudText,
  attachHudTooltipZone,
  createActionButton,
  renderCardSvg,
  applyEnsuredTexture,
  markHudTransient,
  clearTransientHud,
} from './Renderer';
export type {
  ActionButtonOptions,
  HudTextOptions,
  RenderCardSvgOptions,
  MakeTextureKeyFn,
  RequestTextureFn,
  EnsureTextureResult,
} from './Renderer';

// Shared Gym scene utilities – event log, deck grid, slider
// These helpers extract common rendering patterns from Gym demo scenes.
export {
  createEventLog,
  createDeckGrid,
  createSlider,
} from './GymSceneUtils';
export type {
  EventLogOptions,
  EventLogResult,
  DeckGridOptions,
  DeckGridResult,
  SliderOptions,
  SliderResult,
} from './GymSceneUtils';
