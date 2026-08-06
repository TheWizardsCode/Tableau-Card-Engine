/**
 * Factory function to create a Phaser game instance for Coloretto.
 * Used by both main.ts and browser tests.
 */
import { createCardGame } from '../../src/ui/createCardGame';
import type { CardGameOptions } from '../../src/ui/createCardGame';
import { ColorettoScene } from './scenes/ColorettoScene';

export type ColorettoGameOptions = Partial<
  Pick<CardGameOptions, 'parent' | 'width' | 'height' | 'type'>
>;

export function createColorettoGame(options: ColorettoGameOptions = {}): Phaser.Game {
  return createCardGame({
    backgroundColor: '#15242b',
    scenes: [ColorettoScene],
    ...options,
  });
}
