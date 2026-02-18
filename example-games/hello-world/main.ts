import Phaser from 'phaser';
import { HelloWorldScene } from './scenes/HelloWorldScene';

/**
 * Hello World - Tableau Card Engine (TCE)
 *
 * A minimal Phaser 3.x game demonstrating the toolchain works:
 * Vite dev server, TypeScript compilation, Phaser initialization,
 * and asset loading from public/assets/.
 */
const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-container',
  width: 800,
  height: 600,
  backgroundColor: '#2d572c',
  scene: [HelloWorldScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
};

new Phaser.Game(config);
