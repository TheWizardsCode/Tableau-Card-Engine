/**
 * Factory function to create a Phaser game instance for Blackjack.
 * Used by both main.ts and browser tests.
 */
import { createCardGame } from '../../src/ui/createCardGame';
import type { CardGameOptions } from '../../src/ui/createCardGame';
import { BlackjackScene } from './scenes/BlackjackScene';

export type BlackjackGameOptions = Partial<Pick<CardGameOptions, 'parent' | 'width' | 'height' | 'type'>>;

export function createBlackjackGame(options: BlackjackGameOptions = {}): Phaser.Game {
  return createCardGame({
    backgroundColor: '#1a2a2a',
    scenes: [BlackjackScene],
    ...options,
  });
}
