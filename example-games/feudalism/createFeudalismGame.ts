/**
 * Factory function to create a Phaser game instance for Feudalism.
 * Used by both main.ts and browser tests.
 */
import { createCardGame } from '../../src/ui/createCardGame';
import type { CardGameOptions } from '../../src/ui/createCardGame';
import { FeudalismScene } from './scenes/FeudalismScene';

export type FeudalismGameOptions = Partial<Pick<CardGameOptions, 'parent' | 'width' | 'height' | 'type'>>;

export function createFeudalismGame(options: FeudalismGameOptions = {}): Phaser.Game {
  return createCardGame({
    backgroundColor: '#1a2a1a',
    scenes: [FeudalismScene],
    ...options,
  });
}
