/**
 * Factory function to create a Phaser game instance for Lost Cities.
 * Used by both main.ts and browser tests.
 */
import { createCardGame } from '../../src/ui/createCardGame';
import type { CardGameOptions } from '../../src/ui/createCardGame';
import { LostCitiesScene } from './scenes/LostCitiesScene';

export type LostCitiesGameOptions = Partial<Pick<CardGameOptions, 'parent' | 'width' | 'height' | 'type'>>;

export function createLostCitiesGame(options: LostCitiesGameOptions = {}): Phaser.Game {
  return createCardGame({
    backgroundColor: '#1a2a1a',
    scenes: [LostCitiesScene],
    ...options,
  });
}
