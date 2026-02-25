/**
 * Factory function to create a Phaser game instance for Splendor.
 * Used by both main.ts and browser tests.
 */
import { createCardGame } from '../../src/ui/createCardGame';
import type { CardGameOptions } from '../../src/ui/createCardGame';
import { SplendorScene } from './scenes/SplendorScene';

export type SplendorGameOptions = Partial<Pick<CardGameOptions, 'parent' | 'width' | 'height'>>;

export function createSplendorGame(options: SplendorGameOptions = {}): Phaser.Game {
  return createCardGame({
    backgroundColor: '#1a2a1a',
    scenes: [SplendorScene],
    ...options,
  });
}
