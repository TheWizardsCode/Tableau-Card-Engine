/**
 * Main Street - Tableau Card Engine (TCE)
 *
 * A single-player tableau card game where you build a thriving
 * Main Street by purchasing businesses, placing them strategically
 * for synergy bonuses, and managing resources. Games end when you
 * win (score threshold / all challenges) or lose (bankruptcy /
 * reputation collapse) — default presets impose no turn limit
 * (CG-0MSLXJCHH001DLIO).
 */
import { createMainStreetGame } from './createMainStreetGame';

const game = createMainStreetGame();

// Expose game instance for browser testing and debugging
(window as unknown as Record<string, unknown>).__PHASER_GAME__ = game;
