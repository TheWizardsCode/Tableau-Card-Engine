/**
 * Blackjack - Tableau Card Engine (TCE)
 *
 * A single-round Blackjack game (human vs. dealer) built with
 * the Tableau Card Engine's card-system and core-engine modules.
 */
import { createBlackjackGame } from './createBlackjackGame';

const game = createBlackjackGame();

// Expose game instance for browser testing and debugging
(window as unknown as Record<string, unknown>).__PHASER_GAME__ = game;
