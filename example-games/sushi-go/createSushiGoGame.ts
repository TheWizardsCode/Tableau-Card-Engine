/**
 * Factory function to create a Phaser game instance for Sushi Go!
 * Used by both main.ts and browser tests.
 */
import { createCardGame } from '../../src/ui/createCardGame';
import type { CardGameOptions } from '../../src/ui/createCardGame';
import { SushiGoScene } from './scenes/SushiGoScene';

export type SushiGoGameOptions = Partial<Pick<CardGameOptions, 'parent' | 'width' | 'height'>>;

export function createSushiGoGame(options: SushiGoGameOptions = {}): Phaser.Game {
  return createCardGame({
    backgroundColor: '#1a2a3a',
    scenes: [SushiGoScene],
    ...options,
  });
}
