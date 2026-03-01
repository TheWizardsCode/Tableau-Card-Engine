/**
 * Factory function to create a Phaser game instance for Main Street.
 * Used by both main.ts and browser tests.
 */
import { createCardGame } from '../../src/ui/createCardGame';
import type { CardGameOptions } from '../../src/ui/createCardGame';
import { MainStreetScene } from './scenes/MainStreetScene';

export type MainStreetGameOptions = Partial<Pick<CardGameOptions, 'parent' | 'width' | 'height'>>;

export function createMainStreetGame(options: MainStreetGameOptions = {}): Phaser.Game {
  return createCardGame({
    backgroundColor: '#2a1a0a',
    scenes: [MainStreetScene],
    ...options,
  });
}
