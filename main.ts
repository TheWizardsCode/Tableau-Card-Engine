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
import { LostCitiesScene } from './example-games/lost-cities/scenes/LostCitiesScene';
import { TheMindScene } from './example-games/the-mind/scenes/TheMindScene';

// ── Game catalogue ─────────────────────────────────────────

const GAMES: GameEntry[] = [
  {
    sceneKey: 'GolfScene',
    title: '9-Card Golf',
    description:
      'Single-round Golf (human vs. AI). Flip cards, swap from the draw or discard pile, and try to get the lowest score.',
    thumbnail: 'games/golf/thumbnail',
  },
  {
    sceneKey: 'BeleagueredCastleScene',
    title: 'Beleaguered Castle',
    description:
      'Open solitaire. Move cards between 8 tableau columns and build foundations up by suit from Ace to King.',
    thumbnail: 'games/beleaguered-castle/thumbnail',
  },
  {
    sceneKey: 'SushiGoScene',
    title: 'Sushi Go!',
    description:
      'Card drafting game (human vs. AI). Pick and pass hands over 3 rounds, collect sets, and score the most points.',
    thumbnail: 'games/sushi-go/thumbnail',
  },
  {
    sceneKey: 'SplendorScene',
    title: 'Splendor',
    description:
      'Engine-building card game (human vs. AI). Collect gem tokens, purchase cards for bonuses, attract nobles, and reach 15 prestige to win.',
  },
  {
    sceneKey: 'LostCitiesScene',
    title: 'Lost Cities',
    description:
      'Two-player expedition card game (human vs. AI). Bet on up to 5 expeditions across a 3-round match, manage risk with investment cards, and outscore the AI.',
    thumbnail: 'games/lost-cities/thumbnail',
  },
  {
    sceneKey: 'TheMindScene',
    title: 'The Mind',
    description:
      'Cooperative real-time card game (human + AI). Play numbered cards 1-100 onto a shared ascending pile without communicating. Survive 8 levels without losing all lives.',
    thumbnail: 'games/the-mind/thumbnail',
  },
];

// ── Phaser boot ────────────────────────────────────────────

// In replay mode we need `preserveDrawingBuffer: true` so that
// `canvas.toDataURL()` returns real content.  Without this flag
// WebGL clears the drawing buffer after compositing each frame
// and toDataURL() returns a black image.
const isReplayMode = new URLSearchParams(window.location.search).get('mode') === 'replay';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-container',
  width: 1280,
  height: 720,
  backgroundColor: '#1a2a1a',
  // Register all scenes; GameSelectorScene is first so it auto-starts.
  scene: [GameSelectorScene, GolfScene, BeleagueredCastleScene, SushiGoScene, SplendorScene, LostCitiesScene, TheMindScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  audio: {
    disableWebAudio: false,
  },
  render: {
    roundPixels: true,
    ...(isReplayMode ? { preserveDrawingBuffer: true } : {}),
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
