/**
 * Factory function to create a Phaser game instance for The Mind.
 * Used by both main.ts and browser tests.
 */
import { createCardGame } from '../../src/ui/createCardGame';
import type { CardGameOptions } from '../../src/ui/createCardGame';
import { TheMindScene } from './scenes/TheMindScene';

export type TheMindGameOptions = Partial<Pick<CardGameOptions, 'parent' | 'width' | 'height' | 'type'>>;

export function createTheMindGame(
  options: TheMindGameOptions = {},
): Phaser.Game {
  return createCardGame({
    backgroundColor: '#1a1a2e',
    scenes: [TheMindScene],
    ...options,
  });
}
