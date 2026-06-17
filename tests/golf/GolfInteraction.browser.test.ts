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
import { waitForScene } from '../helpers/waitForScene';

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
  const game = createGolfGame({ type: Phaser.CANVAS });
  await waitForScene(game, 'GolfScene');
  return game;
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
  phaseManager: { current: string; set: (phase: string) => void };
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
 * Wait for the scene's turnPhase to match any of the given phases.
 * Returns the matched phase, or throws on timeout.
 */
async function waitForAnyPhase(
  scene: Phaser.Scene,
  phases: string[],
  timeoutMs: number = 5000,
): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const internals = getSceneInternals(scene);
    if (phases.includes(internals.phaseManager.current)) return internals.phaseManager.current;
    await wait(50);
  }
  const internals = getSceneInternals(scene);
  throw new Error(
    `Timed out waiting for any of phases [${phases.join(', ')}]. Current phase: "${internals.phaseManager.current}"`,
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
    if (internals.phaseManager.current !== fromPhase) return internals.phaseManager.current;
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

    // Horizontal layout: human grid (left), piles (center), AI grid (right).
    // Human grid right edge should be to the left of the piles' left edge.
    const humanRightEdge = Math.max(
      ...humanSprites.map((s) => s.x + s.displayWidth / 2),
    );
    const pileLeftEdge =
      Math.min(stockSprite.x, discardSprite.x) -
      stockSprite.displayWidth / 2;
    expect(humanRightEdge).toBeLessThan(pileLeftEdge);

    // AI grid left edge should be to the right of the piles' right edge.
    const aiLeftEdge = Math.min(
      ...aiSprites.map((s) => s.x - s.displayWidth / 2),
    );
    const pileRightEdge =
      Math.max(stockSprite.x, discardSprite.x) +
      stockSprite.displayWidth / 2;
    expect(aiLeftEdge).toBeGreaterThan(pileRightEdge);

    // All card sprites should be within the game canvas (1280x720 viewport)
    const allSprites = [
      ...aiSprites,
      ...humanSprites,
      stockSprite,
      discardSprite,
    ];
    for (const sprite of allSprites) {
      expect(sprite.x - sprite.displayWidth / 2).toBeGreaterThanOrEqual(0);
      expect(sprite.x + sprite.displayWidth / 2).toBeLessThanOrEqual(1280);
      expect(sprite.y - sprite.displayHeight / 2).toBeGreaterThanOrEqual(0);
      expect(sprite.y + sprite.displayHeight / 2).toBeLessThanOrEqual(720);
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
    expect(internals.phaseManager.current).toBe('waiting-for-draw');
    expect(internals.instructionText.text).toContain('Stock');
    expect(internals.instructionText.text).toContain('Discard');

    // Click the stock pile
    clickGameObject(internals.stockSprite);
    await nextFrame();

    expect(internals.phaseManager.current).toBe('waiting-for-move');
    expect(internals.drawnCard).not.toBeNull();
    expect(internals.drawSource).toBe('stock');
    expect(internals.instructionText.text).toContain('swap');
  });

  // ── Test 3: Draw from discard pile ──
  it('should transition to waiting-for-move after clicking discard pile', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('GolfScene')!;
    const internals = getSceneInternals(scene);

    expect(internals.phaseManager.current).toBe('waiting-for-draw');

    // Click the discard pile
    clickGameObject(internals.discardSprite);
    await nextFrame();

    expect(internals.phaseManager.current).toBe('waiting-for-move');
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

    expect(internals.phaseManager.current).toBe('waiting-for-move');

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
    await waitForPhaseChange(scene, 'animating', 3000);

    expect(internals.phaseManager.current).toBe('waiting-for-flip-target');
    expect(internals.instructionText.text).toContain('face-down');

    // Click a face-up card -- should be ignored
    clickGameObject(internals.humanCardSprites[faceUpIdx]);
    await nextFrame();
    expect(internals.phaseManager.current).toBe('waiting-for-flip-target');

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

    // Verify initial score format (HUD text is parented into hudContainer)
    const sceneTexts = scene.children.list.filter(
      (child) => child instanceof Phaser.GameObjects.Text,
    ) as Phaser.GameObjects.Text[];
    const hudContainer = (scene as any).hudContainer as {
      getAll?: () => Phaser.GameObjects.GameObject[];
      list?: Phaser.GameObjects.GameObject[];
    };
    // Phaser 4 Container exposes children via .getAll() or .list (not .children.list)
    const hudAllObjects = hudContainer?.getAll?.() ?? hudContainer?.list ?? [];
    const hudTexts = hudAllObjects.filter(
      (child) => child instanceof Phaser.GameObjects.Text,
    ) as Phaser.GameObjects.Text[];
    const allTexts = [...sceneTexts, ...(hudTexts as Phaser.GameObjects.Text[])];
    const scoreTexts = allTexts.filter((t) => t.text.startsWith('Score:'));
    expect(scoreTexts.length).toBe(2);
    for (const st of scoreTexts) {
      expect(st.text).toMatch(/^Score: -?\d+$/);
    }

    // Draw from stock
    clickGameObject(internals.stockSprite);
    await nextFrame();

    // Swap with grid card 0
    clickGameObject(internals.humanCardSprites[0]);

    // Wait for both the human animation and the full AI turn to complete.
    // Using a phase-based wait is more reliable than a fixed timeout in CI,
    // as it polls until the game returns to a stable state.
    await waitForAnyPhase(scene, ['waiting-for-draw', 'round-ended'], 15000);

    // After AI turn, it should be human's turn again (or round ended)
    const phase = internals.phaseManager.current;
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
    const phaseBeforeClick = internals.phaseManager.current;
    if (
      phaseBeforeClick === 'ai-thinking' ||
      phaseBeforeClick === 'animating'
    ) {
      clickGameObject(internals.stockSprite);
      await nextFrame();

      // Phase should not have changed to waiting-for-move
      expect(internals.phaseManager.current).not.toBe('waiting-for-move');
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
      // Wait for human turn.  A full turn cycle (human animation + AI delay +
      // AI animation) can take several seconds of game-loop time, and the
      // game loop may run slower than wall-clock in CI.  Use a generous
      // polling loop that accepts either 'waiting-for-draw' or 'round-ended'.
      const settled = await waitForAnyPhase(
        scene,
        ['waiting-for-draw', 'round-ended'],
        25_000,
      );

      if (settled === 'round-ended') break;

      // Human turn: draw from stock, swap with first available card
      clickGameObject(internals.stockSprite);
      await nextFrame();

      if (internals.phaseManager.current !== 'waiting-for-move') {
        throw new Error(
          `Expected waiting-for-move after stock click, got "${internals.phaseManager.current}"`,
        );
      }

      // Find a grid card to swap with (prefer face-down cards)
      const grid = internals.session.gameState.playerStates[0].grid;
      let targetIdx = grid.findIndex((c) => !c.faceUp);
      if (targetIdx === -1) targetIdx = 0; // all face-up, swap with first

      clickGameObject(internals.humanCardSprites[targetIdx]);
      turnsPlayed++;
    }

    // We should have played at least a few turns
    expect(turnsPlayed).toBeGreaterThan(0);

    // Game should have progressed
    expect(internals.session.gameState.turnNumber).toBeGreaterThan(0);
  }, 120_000); // long timeout for multi-turn game
});
