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
import { createCardGame } from './src/ui/createCardGame';
import { GameSelectorScene, REGISTRY_KEY_GAMES } from './src/ui/GameSelectorScene';
import type { GameEntry } from './src/ui/GameSelectorScene';
import { GolfScene } from './example-games/golf/scenes/GolfScene';
import { BeleagueredCastleScene } from './example-games/beleaguered-castle/scenes/BeleagueredCastleScene';
import { SushiGoScene } from './example-games/sushi-go/scenes/SushiGoScene';
import { FeudalismScene } from './example-games/feudalism/scenes/FeudalismScene';
import { LostCitiesScene } from './example-games/lost-cities/scenes/LostCitiesScene';
import { TheMindScene } from './example-games/the-mind/scenes/TheMindScene';
import { MainStreetScene } from './example-games/main-street/scenes/MainStreetScene';
import {
  GymRouterScene,
  GymDeckRngScene,
  GymHandPileScene,
  GymOverlayUiScene,
  GymUndoRedoScene,
  GymTranscriptScene,
  GymSaveLoadScene,
  GymAudioFeedbackScene,
  GymGraphicsShaderSpikeScene,
  GymGraphicsLightingSpikeScene,
  GymSllScene,
  GymTooltipScene,
} from './example-games/gym';

// ── Game catalogue ─────────────────────────────────────────

const GAMES: GameEntry[] = [
  {
    sceneKey: 'GymRouterScene',
    title: 'Gym',
    description:
      'Interactive demo scenes for every core-engine feature. Explore deck management, seeded RNG, undo/redo, overlays, transcript recording, save/load, and audio/feedback configuration.',
  },
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
    sceneKey: 'FeudalismScene',
    title: 'Feudalism',
    description:
      'Engine-building card game (human vs. AI). Collect gem tokens, purchase cards for bonuses, attract nobles, and reach 15 prestige to win.',
    thumbnail: 'games/feudalism/thumbnail',
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
  {
    sceneKey: 'MainStreetScene',
    title: 'Main Street',
    description:
      'Single-player tableau builder. Purchase businesses, place them along a 10-slot street for synergy bonuses, manage coins and reputation, and build the highest-scoring Main Street in 20 turns.',
    thumbnail: 'games/main-street/thumbnail',
  },
];

// ── Phaser boot ────────────────────────────────────────────

// In replay mode we need `preserveDrawingBuffer: true` so that
// `canvas.toDataURL()` returns real content.  Without this flag
// WebGL clears the drawing buffer after compositing each frame
// and toDataURL() returns a black image.
const isReplayMode = new URLSearchParams(window.location.search).get('mode') === 'replay';

createCardGame({
  backgroundColor: '#1a2a1a',
  // Register all scenes; GameSelectorScene is first so it auto-starts.
  scenes: [
    GameSelectorScene,
    GolfScene,
    BeleagueredCastleScene,
    SushiGoScene,
    FeudalismScene,
    LostCitiesScene,
    TheMindScene,
    MainStreetScene,
    // Gym demo scenes
    GymRouterScene,
    GymDeckRngScene,
    GymHandPileScene,
    GymOverlayUiScene,
    GymUndoRedoScene,
    GymTranscriptScene,
    GymSaveLoadScene,
    GymAudioFeedbackScene,
    GymGraphicsShaderSpikeScene,
    GymGraphicsLightingSpikeScene,
    GymSllScene,
    GymTooltipScene,
  ],
  render: isReplayMode ? { preserveDrawingBuffer: true } : undefined,
  callbacks: {
    preBoot: (game: Phaser.Game) => {
      // Store catalogue in registry before any scene starts,
      // so GameSelectorScene.init() can read it.
      game.registry.set(REGISTRY_KEY_GAMES, GAMES);
    },
  },
  exposeOnWindow: true,
});
