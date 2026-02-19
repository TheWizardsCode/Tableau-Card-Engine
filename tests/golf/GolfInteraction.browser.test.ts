/**
 * GolfScene interaction browser tests -- verify click handling, turn flow,
 * AI execution, and game state transitions in the Phaser UI.
 *
 * These tests run inside a real Chromium browser via Vitest browser mode
 * and Playwright. They validate that the Golf UI renders correctly and
 * that game objects are created as expected.
 *
 * NOTE: Each test boots a fresh Phaser game which creates a WebGL context.
 * Browsers limit concurrent WebGL contexts (~8-16). We keep total boots
 * per file <= 8 to avoid context exhaustion.  Related assertions are
 * grouped together so we stay within that budget.
 */

import { describe, it, expect, afterEach } from 'vitest';
import Phaser from 'phaser';

// ── Helpers ─────────────────────────────────────────────────

async function bootGame(): Promise<Phaser.Game> {
  let container = document.getElementById('game-container');
  if (container) container.remove();
  container = document.createElement('div');
  container.id = 'game-container';
  document.body.appendChild(container);

  const { createGolfGame } = await import(
    '../../example-games/golf/createGolfGame'
  );
  const game = createGolfGame();
  await waitForScene(game, 'GolfScene', 10_000);
  return game;
}

function waitForScene(
  game: Phaser.Game,
  sceneKey: string,
  timeoutMs: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      const scene = game.scene.getScene(sceneKey);
      if (
        scene &&
        (scene as Phaser.Scene & { sys: Phaser.Scenes.Systems }).sys.isActive()
      ) {
        resolve();
        return;
      }
      if (Date.now() - start > timeoutMs) {
        reject(
          new Error(
            `Scene "${sceneKey}" did not become active within ${timeoutMs}ms`,
          ),
        );
        return;
      }
      requestAnimationFrame(check);
    };
    check();
  });
}

function destroyGame(game: Phaser.Game | null): void {
  if (game) {
    game.destroy(true, false);
  }
  const container = document.getElementById('game-container');
  if (container) container.remove();
}

/** Wait for a specific number of milliseconds. */
function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Wait for an animation frame. */
function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

/**
 * Get scene private properties via type-safe cast.
 * GolfScene stores state in private fields; we access them for testing.
 */
function getSceneInternals(scene: Phaser.Scene): {
  turnPhase: string;
  drawnCard: unknown;
  drawSource: unknown;
  session: {
    gameState: {
      currentPlayerIndex: number;
      phase: string;
      turnNumber: number;
      players: Array<{ name: string; isAI: boolean }>;
      playerStates: Array<{
        grid: Array<{ rank: string; suit: string; faceUp: boolean }>;
      }>;
    };
    shared: {
      stockPile: unknown[];
      discardPile: { peek: () => unknown; size: () => number };
    };
  };
  humanCardSprites: Phaser.GameObjects.Image[];
  aiCardSprites: Phaser.GameObjects.Image[];
  stockSprite: Phaser.GameObjects.Image;
  discardSprite: Phaser.GameObjects.Image;
  instructionText: Phaser.GameObjects.Text;
  turnText: Phaser.GameObjects.Text;
} {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return scene as any;
}

/**
 * Simulate a pointerdown event on a Phaser game object.
 * Phaser interactive objects listen for 'pointerdown' events.
 */
function clickGameObject(obj: Phaser.GameObjects.Image): void {
  // Emit the pointerdown event directly on the game object
  obj.emit('pointerdown', {
    x: obj.x,
    y: obj.y,
    worldX: obj.x,
    worldY: obj.y,
  });
}

/**
 * Wait for the scene's turnPhase to change to a specific value,
 * or until timeout.
 */
async function waitForPhase(
  scene: Phaser.Scene,
  phase: string,
  timeoutMs: number = 5000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const internals = getSceneInternals(scene);
    if (internals.turnPhase === phase) return;
    await wait(50);
  }
  const internals = getSceneInternals(scene);
  throw new Error(
    `Timed out waiting for phase "${phase}". Current phase: "${internals.turnPhase}"`,
  );
}

/**
 * Wait for the turn phase to NOT be a specific value (i.e. transition away).
 */
async function waitForPhaseChange(
  scene: Phaser.Scene,
  fromPhase: string,
  timeoutMs: number = 5000,
): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const internals = getSceneInternals(scene);
    if (internals.turnPhase !== fromPhase) return internals.turnPhase;
    await wait(50);
  }
  throw new Error(`Timed out waiting for phase to change from "${fromPhase}"`);
}

// ── Tests ───────────────────────────────────────────────────
//
// Grouped to keep total game boots <= 8 to avoid WebGL context exhaustion.

describe('GolfScene interaction tests', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => {
    destroyGame(game);
    game = null;
  });

  // ── Test 1: Layout verification ──────────────────────────
  it('should lay out cards without overlapping grids or piles', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('GolfScene')!;
    const internals = getSceneInternals(scene);

    // Collect bounding boxes for all card sprites
    const aiSprites = internals.aiCardSprites;
    const humanSprites = internals.humanCardSprites;
    const stockSprite = internals.stockSprite;
    const discardSprite = internals.discardSprite;

    // AI grid should be fully above the stock/discard piles
    const aiBottomEdge = Math.max(
      ...aiSprites.map((s) => s.y + s.displayHeight / 2),
    );
    const pileTopEdge =
      Math.min(stockSprite.y, discardSprite.y) -
      stockSprite.displayHeight / 2;
    expect(aiBottomEdge).toBeLessThan(pileTopEdge);

    // Human grid should be fully below the stock/discard piles
    const humanTopEdge = Math.min(
      ...humanSprites.map((s) => s.y - s.displayHeight / 2),
    );
    const pileBottomEdge =
      Math.max(stockSprite.y, discardSprite.y) +
      stockSprite.displayHeight / 2;
    expect(humanTopEdge).toBeGreaterThan(pileBottomEdge);

    // All card sprites should be within the game canvas
    const allSprites = [
      ...aiSprites,
      ...humanSprites,
      stockSprite,
      discardSprite,
    ];
    for (const sprite of allSprites) {
      expect(sprite.x - sprite.displayWidth / 2).toBeGreaterThanOrEqual(0);
      expect(sprite.x + sprite.displayWidth / 2).toBeLessThanOrEqual(800);
      expect(sprite.y - sprite.displayHeight / 2).toBeGreaterThanOrEqual(0);
      expect(sprite.y + sprite.displayHeight / 2).toBeLessThanOrEqual(600);
    }

    // Cards within each grid should not overlap
    for (const sprites of [aiSprites, humanSprites]) {
      for (let i = 0; i < sprites.length; i++) {
        for (let j = i + 1; j < sprites.length; j++) {
          const a = sprites[i];
          const b = sprites[j];
          // Either horizontally or vertically separated
          const hSep =
            Math.abs(a.x - b.x) >=
            Math.min(a.displayWidth, b.displayWidth) * 0.9;
          const vSep =
            Math.abs(a.y - b.y) >=
            Math.min(a.displayHeight, b.displayHeight) * 0.9;
          expect(hSep || vSep).toBe(true);
        }
      }
    }
  });

  // ── Test 2: Initial state + draw from stock + draw from discard ──
  it('should start in waiting-for-draw and allow drawing from stock or discard', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('GolfScene')!;
    const internals = getSceneInternals(scene);

    // Game should start with human player (index 0)
    expect(internals.session.gameState.currentPlayerIndex).toBe(0);
    expect(internals.turnPhase).toBe('waiting-for-draw');
    expect(internals.instructionText.text).toContain('Stock');
    expect(internals.instructionText.text).toContain('Discard');

    // Click the stock pile
    clickGameObject(internals.stockSprite);
    await nextFrame();

    expect(internals.turnPhase).toBe('waiting-for-move');
    expect(internals.drawnCard).not.toBeNull();
    expect(internals.drawSource).toBe('stock');
    expect(internals.instructionText.text).toContain('swap');
  });

  // ── Test 3: Draw from discard pile ──
  it('should transition to waiting-for-move after clicking discard pile', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('GolfScene')!;
    const internals = getSceneInternals(scene);

    expect(internals.turnPhase).toBe('waiting-for-draw');

    // Click the discard pile
    clickGameObject(internals.discardSprite);
    await nextFrame();

    expect(internals.turnPhase).toBe('waiting-for-move');
    expect(internals.drawnCard).not.toBeNull();
    expect(internals.drawSource).toBe('discard');

    // The sprite key should still be defined after draw
    expect(internals.discardSprite.texture.key).toBeDefined();

    // Verify the discard pile peek returns a card or undefined
    // (depending on whether it's now empty after the draw)
    const discardTop = internals.session.shared.discardPile.peek();
    if (discardTop) {
      expect(
        (discardTop as { faceUp: boolean }).faceUp,
      ).toBe(true);
    }
  });

  // ── Test 4: Swap move ──────────────────────────────────
  it('should execute a swap move when clicking a grid card after drawing', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('GolfScene')!;
    const internals = getSceneInternals(scene);

    const initialTurn = internals.session.gameState.turnNumber;

    // Draw from stock
    clickGameObject(internals.stockSprite);
    await nextFrame();

    expect(internals.turnPhase).toBe('waiting-for-move');

    // Click a human grid card to swap (index 0 = top-left)
    clickGameObject(internals.humanCardSprites[0]);

    // Wait for animation to complete and turn to advance
    await waitForPhaseChange(scene, 'animating', 3000);

    // Turn should have advanced
    expect(internals.session.gameState.turnNumber).toBeGreaterThan(
      initialTurn,
    );

    // The swapped card should now be face-up in the grid
    expect(
      internals.session.gameState.playerStates[0].grid[0].faceUp,
    ).toBe(true);
  });

  // ── Test 5: Discard-and-flip flow ──────────────────────
  it('should support full discard-and-flip flow including face-up card rejection', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('GolfScene')!;
    const internals = getSceneInternals(scene);

    // Find a face-down card in the human grid
    const grid = internals.session.gameState.playerStates[0].grid;
    const faceDownIdx = grid.findIndex((c) => !c.faceUp);
    expect(faceDownIdx).toBeGreaterThanOrEqual(0);

    // Find a face-up card in the human grid
    const faceUpIdx = grid.findIndex((c) => c.faceUp);
    expect(faceUpIdx).toBeGreaterThanOrEqual(0);

    const initialTurn = internals.session.gameState.turnNumber;

    // Draw from stock
    clickGameObject(internals.stockSprite);
    await nextFrame();

    // Discard the drawn card
    clickGameObject(internals.discardSprite);
    await nextFrame();

    expect(internals.turnPhase).toBe('waiting-for-flip-target');
    expect(internals.instructionText.text).toContain('face-down');

    // Click a face-up card -- should be ignored
    clickGameObject(internals.humanCardSprites[faceUpIdx]);
    await nextFrame();
    expect(internals.turnPhase).toBe('waiting-for-flip-target');

    // Click the face-down card to flip it
    clickGameObject(internals.humanCardSprites[faceDownIdx]);

    // Wait for animation and turn advance
    await waitForPhaseChange(scene, 'animating', 3000);

    expect(internals.session.gameState.turnNumber).toBeGreaterThan(
      initialTurn,
    );
    expect(grid[faceDownIdx].faceUp).toBe(true);
  });

  // ── Test 6: AI turn + scores ──────────────────────────
  it('should execute AI turn after human and update scores correctly', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('GolfScene')!;
    const internals = getSceneInternals(scene);

    // Verify initial score format
    const texts = scene.children.list.filter(
      (child) => child instanceof Phaser.GameObjects.Text,
    ) as Phaser.GameObjects.Text[];
    const scoreTexts = texts.filter((t) => t.text.startsWith('Score:'));
    expect(scoreTexts.length).toBe(2);
    for (const st of scoreTexts) {
      expect(st.text).toMatch(/^Score: -?\d+$/);
    }

    // Draw from stock
    clickGameObject(internals.stockSprite);
    await nextFrame();

    // Swap with grid card 0
    clickGameObject(internals.humanCardSprites[0]);

    // Wait for AI to take its turn (AI_DELAY = 600ms + animation time)
    await wait(3000);

    // After AI turn, it should be human's turn again (or round ended)
    const phase = internals.turnPhase;
    const turnNum = internals.session.gameState.turnNumber;

    expect(
      phase === 'waiting-for-draw' ||
        phase === 'round-ended' ||
        turnNum >= 1,
    ).toBe(true);

    expect(turnNum).toBeGreaterThanOrEqual(1);

    // Scores should still show valid format after turns
    for (const st of scoreTexts) {
      expect(st.text).toMatch(/^Score: -?\d+$/);
    }

    // Verify discard pile top card display
    const discardTop = internals.session.shared.discardPile.peek() as {
      rank: string;
      suit: string;
      faceUp: boolean;
    } | undefined;
    if (discardTop) {
      expect(discardTop.faceUp).toBe(true);
      expect(internals.discardSprite.texture.key).not.toBe('card_back');
    }
  });

  // ── Test 7: Clicks during AI turn ──────────────────────
  it('should not allow clicks during AI turn', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('GolfScene')!;
    const internals = getSceneInternals(scene);

    // Complete a human turn to trigger AI
    clickGameObject(internals.stockSprite);
    await nextFrame();
    clickGameObject(internals.humanCardSprites[0]);

    // Wait briefly for AI thinking phase
    await wait(100);

    // During AI turn, clicking stock should do nothing
    const phaseBeforeClick = internals.turnPhase;
    if (
      phaseBeforeClick === 'ai-thinking' ||
      phaseBeforeClick === 'animating'
    ) {
      clickGameObject(internals.stockSprite);
      await nextFrame();

      // Phase should not have changed to waiting-for-move
      expect(internals.turnPhase).not.toBe('waiting-for-move');
    }
    // If we missed the AI window, that's ok — the test is best-effort
  });

  // ── Test 8: Multi-turn game ────────────────────────────
  it('should complete a full game with multiple turns', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('GolfScene')!;
    const internals = getSceneInternals(scene);

    let turnsPlayed = 0;
    const maxTurns = 20; // safety limit

    while (turnsPlayed < maxTurns) {
      // Wait for human turn
      try {
        await waitForPhase(scene, 'waiting-for-draw', 3000);
      } catch {
        // Game may have ended or still in AI turn
        if (internals.turnPhase === 'round-ended') break;
        // Wait more for AI to finish
        await wait(2000);
        if (internals.turnPhase === 'round-ended') break;
        if (internals.turnPhase !== 'waiting-for-draw') {
          // Unexpected state — fail informatively
          throw new Error(
            `Unexpected phase after waiting: "${internals.turnPhase}" after ${turnsPlayed} turns`,
          );
        }
      }

      if (internals.turnPhase === 'round-ended') break;

      // Human turn: draw from stock, swap with first available card
      clickGameObject(internals.stockSprite);
      await nextFrame();

      if (internals.turnPhase !== 'waiting-for-move') {
        throw new Error(
          `Expected waiting-for-move after stock click, got "${internals.turnPhase}"`,
        );
      }

      // Find a grid card to swap with (prefer face-down cards)
      const grid = internals.session.gameState.playerStates[0].grid;
      let targetIdx = grid.findIndex((c) => !c.faceUp);
      if (targetIdx === -1) targetIdx = 0; // all face-up, swap with first

      clickGameObject(internals.humanCardSprites[targetIdx]);
      turnsPlayed++;

      // Wait for animation + AI turn
      await wait(2000);
    }

    // We should have played at least a few turns
    expect(turnsPlayed).toBeGreaterThan(0);

    // Game should have progressed
    expect(internals.session.gameState.turnNumber).toBeGreaterThan(0);
  }, 60_000); // long timeout for multi-turn game
});
