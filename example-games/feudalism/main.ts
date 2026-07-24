/**
 * Feudalism - Tableau Card Engine (TCE)
 *
 * A 2-player Feudalism engine-building card game (human vs. AI) built with
 * the Tableau Card Engine's core-engine and UI modules.
 */
import { createFeudalismGame } from './createFeudalismGame';

const game = createFeudalismGame();

// Expose game instance for browser testing and debugging
(window as unknown as Record<string, unknown>).__PHASER_GAME__ = game;
