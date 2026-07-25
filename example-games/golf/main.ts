/**
 * 9-Card Golf - Tableau Card Engine (TCE)
 *
 * A single-round 9-Card Golf game (human vs. AI) built with
 * the Tableau Card Engine's card-system, core-engine, and
 * rule-engine modules.
 */
import { createGolfGame } from './createGolfGame';

const game = createGolfGame();

// Expose game instance for browser testing and debugging
(window as unknown as Record<string, unknown>).__PHASER_GAME__ = game;
