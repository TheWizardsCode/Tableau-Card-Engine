/**
 * Coloretto - Tableau Card Engine (TCE)
 *
 * A multi-round set-building card game (human vs. 1-4 AI) built with
 * the Tableau Card Engine's core-engine and UI modules.
 */
import { createColorettoGame } from './createColorettoGame';

const game = createColorettoGame();

// Expose game instance for browser testing and debugging
(window as unknown as Record<string, unknown>).__PHASER_GAME__ = game;
