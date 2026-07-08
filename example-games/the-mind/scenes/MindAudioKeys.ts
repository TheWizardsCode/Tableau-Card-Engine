/**
 * MindAudioKeys -- audio asset keys for The Mind.
 *
 * All SFX keys use the standard `sfx-` prefix — no game-specific prefix.
 * See docs/SFX_CONVENTION.md for the naming convention.
 */

import { COMMON_SFX_KEYS } from '../../../src/core-engine/SoundManager';

export const SFX_KEYS = {
  CARD_PLAY: 'sfx-card-play',
  LIFE_LOST: 'sfx-life-lost',
  LEVEL_COMPLETE: 'sfx-level-complete',
  GAME_WIN: 'sfx-game-win',
  GAME_LOST: 'sfx-game-lost',
  UI_CLICK: COMMON_SFX_KEYS.UI_CLICK,
} as const;
