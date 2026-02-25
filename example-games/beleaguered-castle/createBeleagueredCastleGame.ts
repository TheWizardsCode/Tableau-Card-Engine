/**
 * Factory function to create a Phaser game instance for Beleaguered Castle.
 * Used by both main.ts and browser tests.
 */
import { createCardGame } from '../../src/ui/createCardGame';
import type { CardGameOptions } from '../../src/ui/createCardGame';
import { BeleagueredCastleScene } from './scenes/BeleagueredCastleScene';

export type BeleagueredCastleGameOptions = Partial<Pick<CardGameOptions, 'parent' | 'width' | 'height'>>;

export function createBeleagueredCastleGame(
  options: BeleagueredCastleGameOptions = {},
): Phaser.Game {
  return createCardGame({
    backgroundColor: '#2d572c',
    scenes: [BeleagueredCastleScene],
    ...options,
  });
}
