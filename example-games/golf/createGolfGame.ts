/**
 * Factory function to create a Phaser game instance for 9-Card Golf.
 * Used by both main.ts and browser tests.
 */
import { createCardGame } from '../../src/ui/createCardGame';
import type { CardGameOptions } from '../../src/ui/createCardGame';
import { GolfScene } from './scenes/GolfScene';

export type GolfGameOptions = Partial<Pick<CardGameOptions, 'parent' | 'width' | 'height' | 'type'>>;

export function createGolfGame(options: GolfGameOptions = {}): Phaser.Game {
  return createCardGame({
    backgroundColor: '#2d572c',
    scenes: [GolfScene],
    ...options,
  });
}
