import Phaser from 'phaser';
import { GolfScene } from './scenes/GolfScene';

/**
 * 9-Card Golf - Tableau Card Engine (TCE)
 *
 * A single-round 9-Card Golf game (human vs. AI) built with
 * the Tableau Card Engine's card-system, core-engine, and
 * rule-engine modules.
 */
const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-container',
  width: 800,
  height: 600,
  backgroundColor: '#2d572c',
  scene: [GolfScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
};

new Phaser.Game(config);
