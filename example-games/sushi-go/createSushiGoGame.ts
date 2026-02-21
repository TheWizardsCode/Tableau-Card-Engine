/**
 * Factory function to create a Phaser game instance for Sushi Go!
 * Used by both main.ts and browser tests.
 */
import Phaser from 'phaser';
import '../../src/ui/hiDpiText'; // side-effect: crisp text on HiDPI displays
import { SushiGoScene } from './scenes/SushiGoScene';

export interface SushiGoGameOptions {
  /** DOM element ID to parent the game canvas to. Default: 'game-container' */
  parent?: string;
  /** Game width in pixels. Default: 1280 */
  width?: number;
  /** Game height in pixels. Default: 720 */
  height?: number;
}

export function createSushiGoGame(options: SushiGoGameOptions = {}): Phaser.Game {
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
    backgroundColor: '#1a2a3a',
    scene: [SushiGoScene],
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    render: {
      antialias: false,
      roundPixels: true,
    },
    audio: {
      disableWebAudio: false,
    },
  };

  return new Phaser.Game(config);
}
