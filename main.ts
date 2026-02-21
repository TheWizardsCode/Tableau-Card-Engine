/**
 * Tableau Card Engine -- Unified Entry Point
 *
 * Boots a single Phaser.Game with the GameSelectorScene as the
 * landing page.  All example game scenes are registered so that
 * the selector can transition to them and they can return to
 * the selector via scene.start('GameSelectorScene').
 *
 * The game catalogue is stored in the Phaser registry so that
 * game scenes can return to the selector without needing to
 * know the catalogue themselves.
 */
import Phaser from 'phaser';
import './src/ui/hiDpiText'; // side-effect: crisp text on HiDPI displays
import { GameSelectorScene, REGISTRY_KEY_GAMES } from './src/ui/GameSelectorScene';
import type { GameEntry } from './src/ui/GameSelectorScene';
import { GolfScene } from './example-games/golf/scenes/GolfScene';
import { BeleagueredCastleScene } from './example-games/beleaguered-castle/scenes/BeleagueredCastleScene';
import { SushiGoScene } from './example-games/sushi-go/scenes/SushiGoScene';
import { SplendorScene } from './example-games/splendor/scenes/SplendorScene';

// ── Game catalogue ─────────────────────────────────────────

const GAMES: GameEntry[] = [
  {
    sceneKey: 'GolfScene',
    title: '9-Card Golf',
    description:
      'Single-round Golf (human vs. AI). Flip cards, swap from the draw or discard pile, and try to get the lowest score.',
  },
  {
    sceneKey: 'BeleagueredCastleScene',
    title: 'Beleaguered Castle',
    description:
      'Open solitaire. Move cards between 8 tableau columns and build foundations up by suit from Ace to King.',
  },
  {
    sceneKey: 'SushiGoScene',
    title: 'Sushi Go!',
    description:
      'Card drafting game (human vs. AI). Pick and pass hands over 3 rounds, collect sets, and score the most points.',
  },
  {
    sceneKey: 'SplendorScene',
    title: 'Splendor',
    description:
      'Engine-building card game (human vs. AI). Collect gem tokens, purchase cards for bonuses, attract nobles, and reach 15 prestige to win.',
  },
];

// ── Phaser boot ────────────────────────────────────────────

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-container',
  width: 1280,
  height: 720,
  backgroundColor: '#1a2a1a',
  // Register all scenes; GameSelectorScene is first so it auto-starts.
  scene: [GameSelectorScene, GolfScene, BeleagueredCastleScene, SushiGoScene, SplendorScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  render: {
    roundPixels: true,
  },
  callbacks: {
    preBoot: (game: Phaser.Game) => {
      // Store catalogue in registry before any scene starts,
      // so GameSelectorScene.init() can read it.
      game.registry.set(REGISTRY_KEY_GAMES, GAMES);
    },
  },
};

const game = new Phaser.Game(config);

// Expose for browser testing and debugging
(window as unknown as Record<string, unknown>).__PHASER_GAME__ = game;
