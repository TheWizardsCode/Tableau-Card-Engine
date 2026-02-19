/**
 * Beleaguered Castle - Tableau Card Engine (TCE)
 *
 * A classic Beleaguered Castle solitaire game built with the
 * Tableau Card Engine's card-system, core-engine, and UI modules.
 */
import { createBeleagueredCastleGame } from './createBeleagueredCastleGame';

const game = createBeleagueredCastleGame();

// Expose game instance for browser testing and debugging
(window as unknown as Record<string, unknown>).__PHASER_GAME__ = game;
