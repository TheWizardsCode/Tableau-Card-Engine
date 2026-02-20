/**
 * Sushi Go! - Tableau Card Engine (TCE)
 *
 * A 3-round Sushi Go! drafting game (human vs. AI) built with
 * the Tableau Card Engine's core-engine and UI modules.
 */
import { createSushiGoGame } from './createSushiGoGame';

const game = createSushiGoGame();

// Expose game instance for browser testing and debugging
(window as unknown as Record<string, unknown>).__PHASER_GAME__ = game;
