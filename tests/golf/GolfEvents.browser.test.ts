/**
 * Golf Scene event integration browser tests.
 *
 * Verifies that GolfScene emits the correct engine lifecycle events
 * (turn-started, turn-completed, animation-complete, state-settled,
 * game-ended) at the right points during gameplay.
 *
 * Boots a real Phaser game with GolfScene in headless Chromium.
 * Keeps total game boots to 2 to avoid WebGL context exhaustion.
 */

import { describe, it, expect, afterEach } from 'vitest';
import Phaser from 'phaser';
import type { GameEventEmitter } from '../../src/core-engine/GameEventEmitter';
import type {
  TurnCompletedPayload,
  GameEndedPayload,
} from '../../src/core-engine/GameEventEmitter';

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

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function getSceneInternals(scene: Phaser.Scene): {
  turnPhase: string;
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
  };
  humanCardSprites: Phaser.GameObjects.Image[];
  stockSprite: Phaser.GameObjects.Image;
  discardSprite: Phaser.GameObjects.Image;
  gameEvents: GameEventEmitter;
} {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return scene as any;
}

function clickGameObject(obj: Phaser.GameObjects.Image): void {
  obj.emit('pointerdown', {
    x: obj.x,
    y: obj.y,
    worldX: obj.x,
    worldY: obj.y,
  });
}

/** Get the GameEventEmitter from the global window property. */
function getGlobalEmitter(): GameEventEmitter {
  return (window as unknown as Record<string, unknown>)
    .__GAME_EVENTS__ as GameEventEmitter;
}

// ── Tests ───────────────────────────────────────────────────

describe('GolfScene event integration', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => {
    destroyGame(game);
    game = null;
  });

  // ── Test 1: turn-started fires on game create + global exposure ──
  it('should emit turn-started on create and expose emitter globally', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('GolfScene')!;
    const internals = getSceneInternals(scene);

    // Emitter should be accessible from the scene
    expect(internals.gameEvents).toBeDefined();

    // Emitter should also be exposed on window.__GAME_EVENTS__
    const globalEmitter = getGlobalEmitter();
    expect(globalEmitter).toBeDefined();
    expect(globalEmitter).toBe(internals.gameEvents);

    // The initial turn-started should have already fired (turn 0, player 0).
    // Verify by subscribing and driving a human turn -- the next turn-started
    // should fire for the AI (player 1).
    const events: Array<{ name: string; payload: unknown }> = [];

    globalEmitter.on('turn-started', (p) => events.push({ name: 'turn-started', payload: p }));
    globalEmitter.on('turn-completed', (p) => events.push({ name: 'turn-completed', payload: p }));
    globalEmitter.on('animation-complete', (p) => events.push({ name: 'animation-complete', payload: p }));
    globalEmitter.on('state-settled', (p) => events.push({ name: 'state-settled', payload: p }));

    // Human turn: draw from stock then swap with card 0
    clickGameObject(internals.stockSprite);
    await nextFrame();
    clickGameObject(internals.humanCardSprites[0]);

    // Wait for animation to complete + AI turn to begin
    await wait(1500);

    // We should have received the human turn's events
    const turnCompletedEvents = events.filter((e) => e.name === 'turn-completed');
    expect(turnCompletedEvents.length).toBeGreaterThanOrEqual(1);

    const animCompleteEvents = events.filter((e) => e.name === 'animation-complete');
    expect(animCompleteEvents.length).toBeGreaterThanOrEqual(1);

    const stateSettledEvents = events.filter((e) => e.name === 'state-settled');
    expect(stateSettledEvents.length).toBeGreaterThanOrEqual(1);

    // turn-started for AI (player 1) should have fired
    const turnStartedEvents = events.filter((e) => e.name === 'turn-started');
    expect(turnStartedEvents.length).toBeGreaterThanOrEqual(1);

    // Verify payload structure of the first turn-completed
    const tc = turnCompletedEvents[0].payload as TurnCompletedPayload;
    expect(tc.playerIndex).toBe(0); // human player
    expect(tc.playerName).toBe('You');
    expect(typeof tc.turnNumber).toBe('number');
    expect(['setup', 'playing', 'ended']).toContain(tc.phase);
  });

  // ── Test 2: Full event sequence through human + AI turn + game-ended ──
  it('should emit correct event sequence for human + AI turn cycle and game-ended on end', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('GolfScene')!;
    const internals = getSceneInternals(scene);
    const emitter = internals.gameEvents;

    const eventLog: string[] = [];

    emitter.on('turn-started', (p) => eventLog.push(`turn-started:p${p.playerIndex}`));
    emitter.on('turn-completed', (p) => eventLog.push(`turn-completed:p${p.playerIndex}`));
    emitter.on('animation-complete', () => eventLog.push('animation-complete'));
    emitter.on('state-settled', () => eventLog.push('state-settled'));
    emitter.on('game-ended', () => eventLog.push('game-ended'));

    // Human turn: draw from stock, swap card 0
    clickGameObject(internals.stockSprite);
    await nextFrame();
    clickGameObject(internals.humanCardSprites[0]);

    // Wait for human animation + AI delay + AI animation
    // AI_DELAY=600ms + AI_SHOW_DRAW_DELAY=1000ms + animations ~600ms
    await wait(4000);

    // Expected sequence for human turn:
    // turn-completed:p0 -> animation-complete -> state-settled -> turn-started:p1
    // Then AI turn:
    // turn-completed:p1 -> animation-complete -> state-settled -> turn-started:p0
    // (unless round ended)

    // Human turn events
    expect(eventLog).toContain('turn-completed:p0');
    expect(eventLog).toContain('animation-complete');
    expect(eventLog).toContain('state-settled');
    expect(eventLog).toContain('turn-started:p1');

    // Verify ordering: turn-completed:p0 comes before animation-complete
    const tcIdx = eventLog.indexOf('turn-completed:p0');
    const acIdx = eventLog.indexOf('animation-complete');
    const ssIdx = eventLog.indexOf('state-settled');
    const tsAiIdx = eventLog.indexOf('turn-started:p1');
    expect(tcIdx).toBeLessThan(acIdx);
    expect(acIdx).toBeLessThan(ssIdx);
    expect(ssIdx).toBeLessThan(tsAiIdx);

    // AI turn events (should follow after AI delay)
    const aiTcIdx = eventLog.indexOf('turn-completed:p1');
    if (aiTcIdx >= 0) {
      // AI completed its turn
      expect(aiTcIdx).toBeGreaterThan(tsAiIdx);
      // Should have another animation-complete and state-settled after
      const secondAc = eventLog.indexOf('animation-complete', aiTcIdx);
      expect(secondAc).toBeGreaterThan(aiTcIdx);
    }

    // ── game-ended: force end screen within the same boot ──
    // This avoids a 3rd bootGame() call which exhausts WebGL contexts.
    let gameEndedPayload: GameEndedPayload | null = null;
    emitter.on('game-ended', (p) => {
      gameEndedPayload = p;
    });

    // Force the game to end by setting phase and revealing all cards
    const gs = internals.session.gameState;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (gs as any).phase = 'ended';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sceneAny = scene as any;
    // Reveal all cards so scoring works
    for (let p = 0; p < 2; p++) {
      const gridCards = gs.playerStates[p].grid;
      for (const card of gridCards) {
        card.faceUp = true;
      }
    }

    // Force turn phase to trigger showEndScreen
    sceneAny.setPhase('round-ended');
    await wait(500);

    expect(gameEndedPayload).not.toBeNull();
    expect(typeof gameEndedPayload!.finalTurnNumber).toBe('number');
    expect(typeof gameEndedPayload!.winnerIndex).toBe('number');
    expect(gameEndedPayload!.reason).toBeDefined();
    expect(typeof gameEndedPayload!.reason).toBe('string');

    // game-ended should appear in the event log
    expect(eventLog).toContain('game-ended');
  });
});
