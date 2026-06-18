/**
 * Lost Cities round-end overlay browser tests.
 *
 * Verifies that the round-end score overlay appears correctly when the
 * draw pile is exhausted, both when the player draws the last card and
 * when the AI draws the last card. Also verifies match-end overlay and
 * overlay button clickability.
 *
 * Uses a "short deck" approach: the session draw pile is replaced with
 * a small number of cards so rounds end quickly without playing through
 * dozens of turns.
 *
 * NOTE: Each test boots a fresh Phaser game which creates a WebGL context.
 * Browsers limit concurrent WebGL contexts (~8-16). We keep total boots
 * per file <= 6 to avoid context exhaustion.
 */

import { describe, it, expect, afterEach } from 'vitest';
import Phaser from 'phaser';
import { waitForScene } from '../helpers/waitForScene';
import type { LostCitiesCard, ExpeditionColor } from '../../example-games/lost-cities/LostCitiesCards';
import { EXPEDITION_COLORS } from '../../example-games/lost-cities/LostCitiesCards';
import { setupLostCitiesGame } from '../../example-games/lost-cities/LostCitiesGame';
import { createSeededRng } from '../../src/core-engine/SeededRng';

// ── Helpers ─────────────────────────────────────────────────

async function bootGame(): Promise<Phaser.Game> {
  let container = document.getElementById('game-container');
  if (container) container.remove();
  container = document.createElement('div');
  container.id = 'game-container';
  document.body.appendChild(container);

  const { createLostCitiesGame } = await import(
    '../../example-games/lost-cities/createLostCitiesGame'
  );
  const game = createLostCitiesGame({ type: Phaser.CANVAS });
  await waitForScene(game, 'LostCitiesScene');
  return game;
}

function destroyGame(game: Phaser.Game | null): void {
  if (game) {
    game.destroy(true, false);
  }
  const container = document.getElementById('game-container');
  if (container) container.remove();
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitFrames(n: number): Promise<void> {
  return new Promise((resolve) => {
    let count = 0;
    const step = () => {
      count++;
      if (count >= n) {
        resolve();
      } else {
        requestAnimationFrame(step);
      }
    };
    requestAnimationFrame(step);
  });
}

async function waitForCondition(
  predicate: () => boolean,
  timeoutMs = 10_000,
  pollMs = 25,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  throw new Error(`Timed out waiting for condition after ${timeoutMs}ms`);
}

/**
 * Get scene private properties via type-safe cast.
 * LostCitiesScene stores all state in private fields.
 */
function getSceneInternals(scene: Phaser.Scene) {
  return scene as any;
}

/**
 * Find the first Text object in scene and HUD whose text contains the given substring.
 */
function findOverlayText(scene: Phaser.Scene, search: string): Phaser.GameObjects.Text | undefined {
  const candidates: Phaser.GameObjects.GameObject[] = [];
  const walk = (items: Phaser.GameObjects.GameObject[]) => {
    for (const child of items) {
      if (child instanceof Phaser.GameObjects.Text) {
        candidates.push(child);
      }
      if (child instanceof Phaser.GameObjects.Container && (child as any).list) {
        walk((child as any).list);
      }
    }
  };
  walk(scene.children.list);
  const hud = (scene as any).hudContainer as { list: Phaser.GameObjects.GameObject[] } | undefined;
  if (hud?.list) walk(hud.list);
  return candidates.find(t => (t as Phaser.GameObjects.Text).text.includes(search)) as Phaser.GameObjects.Text | undefined;
}

/**
 * Collect display objects from scene children and the HUD container.
 */
function collectFromSceneAndHud<T extends Phaser.GameObjects.GameObject>(
  scene: Phaser.Scene,
  predicate: (obj: Phaser.GameObjects.GameObject) => obj is T,
): T[] {
  const result: T[] = [];
  const walk = (parent: Phaser.GameObjects.GameObject[]) => {
    for (const child of parent) {
      if (predicate(child)) result.push(child);
      if (child instanceof Phaser.GameObjects.Container && (child as any).list) {
        walk((child as any).list);
      }
    }
  };
  walk(scene.children.list);
  const hud = (scene as any).hudContainer as { list: Phaser.GameObjects.GameObject[] } | undefined;
  if (hud?.list) walk(hud.list);
  return result;
}

/**
 * Dispatch a real DOM MouseEvent on the game canvas at the given
 * game-world coordinates. Routes through Phaser's full input pipeline.
 */
function clickAtGameCoords(
  game: Phaser.Game,
  gameX: number,
  gameY: number,
): void {
  const canvas = game.canvas;
  const scale = game.scale;
  scale.refresh();

  const pageX = gameX / scale.displayScale.x + scale.canvasBounds.left;
  const pageY = gameY / scale.displayScale.y + scale.canvasBounds.top;

  const dispatch = (type: string, buttons: number) => {
    const e = new MouseEvent(type, {
      clientX: Math.round(pageX),
      clientY: Math.round(pageY),
      screenX: Math.round(pageX),
      screenY: Math.round(pageY),
      button: 0,
      buttons,
      bubbles: true,
      cancelable: true,
    });
    canvas.dispatchEvent(e);
  };

  dispatch('mousedown', 1);
  dispatch('mouseup', 0);
}

// ── Card creation helpers ──────────────────────────────────

let nextCardId = 1000;

function makeCard(color: ExpeditionColor, rank: number): LostCitiesCard {
  return { id: nextCardId++, color, type: 'numbered', rank, faceUp: true };
}

function makeHand(...ranks: [ExpeditionColor, number][]): LostCitiesCard[] {
  return ranks.map(([color, rank]) => makeCard(color, rank));
}

function makeDrawPile(...colors: ExpeditionColor[]): LostCitiesCard[] {
  return colors.map((color, i) => ({
    id: nextCardId++,
    color,
    type: 'numbered' as const,
    rank: 2 + i % 8,
    faceUp: false,
  }));
}

// ── Tests ───────────────────────────────────────────────────

describe('Lost Cities round-end overlay tests', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => {
    destroyGame(game);
    game = null;
  });

  /**
   * Helper: set up the session so the player's next draw will end the round.
   * Draw pile = 1 card. Player hand has a card they can play/discard.
   * Opponent hand is minimal.
   */
  function setupPlayerLastCard(internals: any): void {
    const session = internals.session;

    // Create initial state with tiny draw pile
    session.round.drawPile = makeDrawPile('red');

    // Give player 0 a single playable card (different color from draw pile)
    session.players[0].hand = makeHand(['blue', 5]);

    // Give player 1 standard hand
    session.players[1].hand = makeHand(
      ['green', 3],
      ['white', 7],
      ['yellow', 2],
      ['red', 4],
      ['blue', 6],
      ['green', 8],
      ['white', 9],
      ['red', 10],
    );

    // Reset expeditions
    for (const p of session.players) {
      for (const color of EXPEDITION_COLORS) {
        p.expeditions.set(color, []);
      }
    }

    // Ensure we're in player 0's turn, PlayOrDiscard phase
    session.matchPhase = 'playing';
    session.round.currentPlayer = 0;
    session.round.turnPhase = 'PlayOrDiscard';
    session.round.justDiscardedColor = null;
    session.round.turnNumber = 1;
    session.roundNumber = 1;
    session.roundScores = [];
    session.cumulativeScores = [0, 0];

    // Rebuild the renderer to match the new state
    internals.lcRenderer.refreshAll((idx: number) => internals.turnController.onHandCardClick(idx));
    internals.turnController.setPhase('waiting-for-card-select');
  }

  it('should show round-end overlay when player draws the last card', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('LostCitiesScene')!;
    const internals = getSceneInternals(scene);

    // Set up the session so the player's next draw ends the round
    setupPlayerLastCard(internals);

    // Phase 1: Select the player's first (and only) card
    internals.turnController.onHandCardClick(0);
    await wait(50);

    // Phase 1: Play it to the card's own color expedition (it's 'blue')
    internals.turnController.onExpeditionClick();
    await wait(200); // Allow animation to start

    // The turn controller should now be in 'waiting-for-draw' phase
    expect(internals.turnController.phase).toBe('waiting-for-draw');

    // Phase 2: Click the draw pile to draw the last card
    internals.turnController.onDrawPileClick();
    await wait(800); // Allow animation + overlay to render

    // After the draw, the round should have ended and the overlay should appear
    // Look for text containing "Round" (from "Round 1 Complete")
    const overlayText = findOverlayText(scene, 'Round');
    expect(overlayText).toBeDefined();
    expect(overlayText!.text).toContain('Round');

    // Also verify session state reflects the round-end
    const session = internals.session;
    expect(session.matchPhase).toBe('round-over');
    expect(session.roundScores).toHaveLength(1);
  });

  it('should show match-end overlay after all 3 rounds', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('LostCitiesScene')!;
    const internals = getSceneInternals(scene);
    const session = internals.session;

    // Set up a session in round 3 with 1 card left
    session.round.drawPile = makeDrawPile('red');
    session.players[0].hand = makeHand(['blue', 5]);
    session.players[1].hand = makeHand(['green', 3]);

    // Reset expeditions
    for (const p of session.players) {
      for (const color of EXPEDITION_COLORS) {
        p.expeditions.set(color, []);
      }
    }

    session.matchPhase = 'playing';
    session.roundNumber = 3; // Final round
    session.round.currentPlayer = 0;
    session.round.turnPhase = 'PlayOrDiscard';
    session.round.justDiscardedColor = null;
    session.round.turnNumber = 1;
    session.roundScores = [
      { totals: [10, 5], details: [[], []] },
      { totals: [8, 12], details: [[], []] },
    ];
    session.cumulativeScores = [18, 17];

    internals.lcRenderer.refreshAll((idx: number) => internals.turnController.onHandCardClick(idx));
    internals.turnController.setPhase('waiting-for-card-select');

    // Play through one turn to end round 3
    internals.turnController.onHandCardClick(0);
    await wait(50);
    internals.turnController.onExpeditionClick();
    await wait(200);
    expect(internals.turnController.phase).toBe('waiting-for-draw');
    internals.turnController.onDrawPileClick();
    await wait(800);

    // After the draw, round 3 ends → match is over
    // Look for match-end overlay text (winner name)
    expect(session.matchPhase).toBe('match-over');
    const matchText = findOverlayText(scene, 'Win');
    expect(matchText).toBeDefined();
  });

  /**
   * Helper: verify round-end overlay has a clickable "[Next Round]" button.
   * We set up a near-round-end state, play the last card, then find and
   * click the button via DOM events.
   */
  it('should have clickable "[Next Round]" button on round-end overlay', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('LostCitiesScene')!;
    const internals = getSceneInternals(scene);

    // Set up the session for a round-ending draw
    setupPlayerLastCard(internals);

    // Play through the turn
    internals.turnController.onHandCardClick(0);
    await wait(50);
    internals.turnController.onExpeditionClick();
    await wait(200);
    internals.turnController.onDrawPileClick();
    await wait(800);

    // Verify the overlay exists
    const overlayText = findOverlayText(scene, 'Next');
    expect(overlayText).toBeDefined();
    expect(overlayText!.text).toContain('Next Round');

    // Find the button container by searching for its text child.
    // LostCitiesOverlays.showRoundSummary creates a button via
    // createOverlayButton(this.scene, cx, y, '[ Next Round ]').
    // This button is what Phaser returns from `scene.add.text()`
    // when text ends with ' ]'; the actual interactive hit area is
    // the text object itself (or a container wrapping it).
    // Search both scene children and HUD container for a Text with "[ Next Round ]".
    const allTexts = collectFromSceneAndHud(scene, (obj): obj is Phaser.GameObjects.Text =>
      obj instanceof Phaser.GameObjects.Text,
    );
    const nextRoundText = allTexts.find(t => t.text === '[ Next Round ]');
    expect(nextRoundText).toBeDefined();

    // Record session round number before clicking
    const sessionBefore = internals.session.roundNumber;

    // Click the button at its world position
    clickAtGameCoords(game, nextRoundText!.x, nextRoundText!.y);
    await wait(500);

    // After clicking, the overlay should be dismissed and round should advance
    // The overlay text should be gone
    const overlayGone = findOverlayText(scene, 'Next');
    expect(overlayGone).toBeUndefined();

    // Session should have advanced to round 2
    const session = internals.session;
    expect(session.matchPhase).toBe('playing');
    expect(session.roundNumber).toBe(sessionBefore + 1);
  });

  // ═══════════════════════════════════════════════════════════
  // AI draws the last card
  // ═══════════════════════════════════════════════════════════

  /**
   * Helper: set up session so the AI's next draw will end the round.
   * Player 0 plays a turn that draws the second-to-last card, then the
   * AI's turn draws the last card and ends the round.
   */
  function setupAiLastCard(internals: any, session: any): void {
    // Set draw pile to 2 cards
    session.round.drawPile = makeDrawPile('red', 'blue');

    // Player 0's hand: 1 card to play
    session.players[0].hand = makeHand(['green', 5]);

    // AI (player 1) hand: 1 card, so AI has something to play during Phase 1
    session.players[1].hand = makeHand(['white', 3]);

    // Reset expeditions
    for (const p of session.players) {
      for (const color of EXPEDITION_COLORS) {
        p.expeditions.set(color, []);
      }
    }

    session.matchPhase = 'playing';
    session.round.currentPlayer = 0;
    session.round.turnPhase = 'PlayOrDiscard';
    session.round.justDiscardedColor = null;
    session.round.turnNumber = 1;
    session.roundNumber = 1;
    session.roundScores = [];
    session.cumulativeScores = [0, 0];

    internals.lcRenderer.refreshAll((idx: number) => internals.turnController.onHandCardClick(idx));
    internals.turnController.setPhase('waiting-for-card-select');
  }

  it('should show round-end overlay when AI draws the last card', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('LostCitiesScene')!;
    const internals = getSceneInternals(scene);
    const session = internals.session;

    // Set up with 2 cards in draw pile
    setupAiLastCard(internals, session);

    // Player's turn: play and draw, leaving 1 card for AI
    internals.turnController.onHandCardClick(0);
    await wait(50);
    internals.turnController.onExpeditionClick();
    await wait(150);
    expect(internals.turnController.phase).toBe('waiting-for-draw');
    internals.turnController.onDrawPileClick();
    await wait(150);

    // After player draws, if round hasn't ended, the AI should start its turn
    // The player's draw left 1 card (not 0), so round isn't over
    // Wait for AI to complete its turn (play/discard + draw the last card)
    await wait(2500); // AI_DELAY(800) + animation(450) + buffer

    // The round should have ended from AI's draw
    expect(session.matchPhase).toBe('round-over');
    expect(session.roundScores).toHaveLength(1);

    // Overlay should show round summary
    const overlayText = findOverlayText(scene, 'Round');
    expect(overlayText).toBeDefined();
    expect(overlayText!.text).toContain('Round');
  });
});
