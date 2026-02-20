/**
 * GolfScene replay mode browser tests.
 *
 * Verifies that:
 *   - GolfScene enters replay mode when ?mode=replay is in the URL
 *   - In replay mode, input is suppressed (no interactive sprites)
 *   - loadBoardState() updates card textures and emits state-settled
 *   - loadBoardState() throws when called outside of replay mode
 *
 * Boots a real Phaser game in headless Chromium.
 * Limited to 2 game boots to avoid WebGL context exhaustion.
 */

import { describe, it, expect, afterEach, afterAll } from 'vitest';
import Phaser from 'phaser';
import type { GameEventEmitter } from '../../src/core-engine/GameEventEmitter';
import type { BoardSnapshot, CardSnapshot } from '../../example-games/golf/GameTranscript';

// ── Helpers ─────────────────────────────────────────────────

/** Set the URL search params without a navigation. */
function setUrlParams(params: string): void {
  const url = new URL(window.location.href);
  url.search = params;
  history.replaceState(null, '', url.toString());
}

/** Restore URL to no search params. */
function clearUrlParams(): void {
  const url = new URL(window.location.href);
  url.search = '';
  history.replaceState(null, '', url.toString());
}

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

function getSceneInternals(scene: Phaser.Scene): {
  replayMode: boolean;
  turnPhase: string;
  session: {
    gameState: {
      currentPlayerIndex: number;
      phase: string;
      playerStates: Array<{
        grid: Array<{ rank: string; suit: string; faceUp: boolean }>;
      }>;
    };
    shared: {
      stockPile: unknown[];
      discardPile: { peek: () => { rank: string; suit: string; faceUp: boolean } | undefined };
    };
  };
  humanCardSprites: Phaser.GameObjects.Image[];
  aiCardSprites: Phaser.GameObjects.Image[];
  stockSprite: Phaser.GameObjects.Image;
  discardSprite: Phaser.GameObjects.Image;
  gameEvents: GameEventEmitter;
  instructionText: Phaser.GameObjects.Text;
  loadBoardState: (
    boardStates: BoardSnapshot[],
    discardTop: CardSnapshot | null,
    stockRemaining: number,
  ) => void;
} {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return scene as any;
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

// ── Test data ───────────────────────────────────────────────

/** A synthetic board state for testing loadBoardState(). */
function makeTestBoardStates(): BoardSnapshot[] {
  const makeGrid = (faceUp: boolean): CardSnapshot[] => [
    { rank: 'A', suit: 'spades', faceUp },
    { rank: '2', suit: 'hearts', faceUp },
    { rank: '3', suit: 'diamonds', faceUp },
    { rank: '4', suit: 'clubs', faceUp },
    { rank: '5', suit: 'spades', faceUp },
    { rank: '6', suit: 'hearts', faceUp },
    { rank: '7', suit: 'diamonds', faceUp },
    { rank: '8', suit: 'clubs', faceUp },
    { rank: '9', suit: 'spades', faceUp },
  ];

  return [
    { grid: makeGrid(true), faceUpCount: 9, visibleScore: 45, totalScore: 45 },
    { grid: makeGrid(false), faceUpCount: 0, visibleScore: 0, totalScore: 45 },
  ];
}

// ── Tests ───────────────────────────────────────────────────

describe('GolfScene replay mode', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => {
    destroyGame(game);
    game = null;
  });

  afterAll(() => {
    clearUrlParams();
  });

  // ── Test 1: Replay mode setup + loadBoardState ──
  it('should enter replay mode and support loadBoardState()', async () => {
    setUrlParams('?mode=replay');
    game = await bootGame();

    const scene = game.scene.getScene('GolfScene')!;
    const internals = getSceneInternals(scene);

    // Verify replay mode flag is set
    expect(internals.replayMode).toBe(true);

    // Instruction text should be empty (suppressed in replay mode)
    expect(internals.instructionText.text).toBe('');

    // No interactive images except possibly the menu button
    const images = scene.children.list.filter(
      (child) => child instanceof Phaser.GameObjects.Image,
    ) as Phaser.GameObjects.Image[];
    const interactiveImages = images.filter((img) => img.input?.enabled);
    expect(interactiveImages.length).toBe(0);

    // ── loadBoardState() ──

    // Track state-settled events
    const settledEvents: unknown[] = [];
    internals.gameEvents.on('state-settled', (p: unknown) => settledEvents.push(p));

    const testStates = makeTestBoardStates();
    const testDiscardTop: CardSnapshot = { rank: 'K', suit: 'hearts', faceUp: true };

    // Call loadBoardState
    internals.loadBoardState(testStates, testDiscardTop, 20);
    await nextFrame();

    // Verify the internal game state was updated
    const humanGrid = internals.session.gameState.playerStates[0].grid;
    expect(humanGrid[0].rank).toBe('A');
    expect(humanGrid[0].suit).toBe('spades');
    expect(humanGrid[0].faceUp).toBe(true);
    expect(humanGrid[8].rank).toBe('9');
    expect(humanGrid[8].suit).toBe('spades');

    const aiGrid = internals.session.gameState.playerStates[1].grid;
    expect(aiGrid[0].rank).toBe('A');
    expect(aiGrid[0].faceUp).toBe(false);

    // Verify discard pile was updated
    const discardTop = internals.session.shared.discardPile.peek();
    expect(discardTop).toBeDefined();
    expect(discardTop!.rank).toBe('K');
    expect(discardTop!.suit).toBe('hearts');

    // Verify stock pile length
    expect(internals.session.shared.stockPile.length).toBe(20);

    // Verify card textures were updated by refreshAll()
    // Human cards are all face-up so should show card textures, not 'card_back'
    const humanSprite0Texture = internals.humanCardSprites[0].texture.key;
    expect(humanSprite0Texture).toBe('ace_of_spades');

    // AI cards are all face-down so should show card_back
    const aiSprite0Texture = internals.aiCardSprites[0].texture.key;
    expect(aiSprite0Texture).toBe('card_back');

    // Discard pile sprite should show the K of hearts
    const discardTexture = internals.discardSprite.texture.key;
    expect(discardTexture).toBe('king_of_hearts');

    // Stock sprite should be visible (20 remaining)
    expect(internals.stockSprite.visible).toBe(true);

    // state-settled should have been emitted (at least the one from loadBoardState;
    // there's also one from create())
    expect(settledEvents.length).toBeGreaterThanOrEqual(1);

    // ── loadBoardState with empty discard and 0 stock ──
    settledEvents.length = 0;
    internals.loadBoardState(testStates, null, 0);
    await nextFrame();

    // Stock should be hidden
    expect(internals.stockSprite.visible).toBe(false);

    // Discard should be hidden (no card)
    expect(internals.discardSprite.visible).toBe(false);

    // state-settled emitted again
    expect(settledEvents.length).toBeGreaterThanOrEqual(1);
  });

  // ── Test 2: Normal mode rejects loadBoardState ──
  it('should throw if loadBoardState() is called outside replay mode', async () => {
    clearUrlParams();
    game = await bootGame();

    const scene = game.scene.getScene('GolfScene')!;
    const internals = getSceneInternals(scene);

    // Verify NOT in replay mode
    expect(internals.replayMode).toBe(false);

    // loadBoardState should throw
    const testStates = makeTestBoardStates();
    expect(() => {
      internals.loadBoardState(testStates, null, 10);
    }).toThrow('loadBoardState() is only available in replay mode');
  });
});
