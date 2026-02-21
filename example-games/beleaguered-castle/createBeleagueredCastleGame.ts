/**
 * Factory function to create a Phaser game instance for Beleaguered Castle.
 * Used by both main.ts and browser tests.
 */
import Phaser from 'phaser';
import { BeleagueredCastleScene } from './scenes/BeleagueredCastleScene';

export interface BeleagueredCastleGameOptions {
  /** DOM element ID to parent the game canvas to. Default: 'game-container' */
  parent?: string;
  /** Game width in pixels. Default: 1280 */
  width?: number;
  /** Game height in pixels. Default: 720 */
  height?: number;
}

export function createBeleagueredCastleGame(
  options: BeleagueredCastleGameOptions = {},
): Phaser.Game {
  const {
    parent = 'game-container',
    width = 1280,
    height = 720,
  } = options;

  const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    parent,
    width,
    height,
    backgroundColor: '#2d572c',
    scene: [BeleagueredCastleScene],
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    audio: {
      disableWebAudio: false,
    },
  };

  return new Phaser.Game(config);
}
