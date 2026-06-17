/**
 * Factory function to create a Phaser game instance booting
 * directly into the GymHandPileScene.
 *
 * Used by browser tests to avoid going through the Gym router.
 */
import { createCardGame } from '../../src/ui/createCardGame';
import type { CardGameOptions } from '../../src/ui/createCardGame';
import { GymHandPileScene } from './scenes/GymHandPileScene';

export type GymHandPileGameOptions = Partial<Pick<CardGameOptions, 'parent' | 'width' | 'height'>>;

export function createGymHandPileGame(
  options: GymHandPileGameOptions = {},
): Phaser.Game {
  return createCardGame({
    backgroundColor: '#1a2a1a',
    scenes: [GymHandPileScene],
    ...options,
  });
}
