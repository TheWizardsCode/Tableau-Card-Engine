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
