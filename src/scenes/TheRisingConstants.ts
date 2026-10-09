/**
 * Shared constants for 1916: The Rising.
 *
 * SFX keys use the shared `sfx-` convention (`docs/SFX_CONVENTION.md`): common
 * keys are taken from `COMMON_SFX_KEYS`, game-specific keys are plain `sfx-`
 * prefixed strings (never game-namespaced).
 *
 * @module src/scenes/TheRisingConstants
 */

import { COMMON_SFX_KEYS } from '@core-engine/SoundManager';

/** The game's audio namespace (used to scope Phaser audio keys). */
export const THERISING_AUDIO_NAMESPACE = 'the-rising';

/** The audio asset directory for the game's own SFX. */
export const THERISING_AUDIO_DIR = 'the-rising';

/** SFX keys used by The Rising. */
export const THERISING_SFX_KEYS = {
  /** A spirit is dealt from the Spirit Row. */
  SPIRIT_DEAL: 'sfx-card-draw',
  /** A spirit is placed on the timeline. */
  SPIRIT_PLACE: 'sfx-card-swap',
  /** A spirit face is revealed (testimony / placement). */
  SPIRIT_REVEAL: 'sfx-card-flip',
  /** Illegal placement / unaffordable meet feedback. */
  ILLEGAL_MOVE: COMMON_SFX_KEYS.ILLEGAL_MOVE,
  /** Generic UI click. */
  UI_CLICK: COMMON_SFX_KEYS.UI_CLICK,
  /** The clock advances at end of turn. */
  TURN_CHANGE: COMMON_SFX_KEYS.TURN_CHANGE,
  /** The session was won. */
  GAME_WIN: 'sfx-game-win',
  /** The session was lost. */
  GAME_LOST: 'sfx-game-lost',
} as const;

/** Audio filenames for each SFX key, relative to the game's audio directory. */
export const THERISING_AUDIO_FILES: Readonly<Record<keyof typeof THERISING_SFX_KEYS, string>> = {
  SPIRIT_DEAL: 'card-draw.wav',
  SPIRIT_PLACE: 'card-swap.wav',
  SPIRIT_REVEAL: 'card-flip.wav',
  ILLEGAL_MOVE: 'illegal-move.wav',
  UI_CLICK: 'ui-click.wav',
  TURN_CHANGE: 'turn-change.wav',
  GAME_WIN: 'game-win.wav',
  GAME_LOST: 'game-lost.wav',
};
