/**
 * Factory function to create a Phaser game instance for The Mind.
 * Used by both main.ts and browser tests.
 */
import Phaser from 'phaser';
import '../../src/ui/hiDpiText'; // side-effect: crisp text on HiDPI displays
import { TheMindScene } from './scenes/TheMindScene';

export interface TheMindGameOptions {
  /** DOM element ID to parent the game canvas to. Default: 'game-container' */
  parent?: string;
  /** Game width in pixels. Default: 1280 */
  width?: number;
  /** Game height in pixels. Default: 720 */
  height?: number;
}

export function createTheMindGame(
  options: TheMindGameOptions = {},
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
    backgroundColor: '#1a1a2e',
    scene: [TheMindScene],
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    render: {
      roundPixels: true,
    },
    audio: {
      disableWebAudio: false,
    },
  };

  return new Phaser.Game(config);
}
