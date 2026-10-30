/**
 * Browser tests for the pretty-printed Game Events debug overlay
 * (CG-0MVTTR0OC006PWDK).
 *
 * Boots a real Phaser CANVAS scene, emits events through a real
 * `GameEventEmitter` into the `GlobalEventBuffer`, activates the tool, and
 * asserts on the rendered text objects:
 *   - payloads are pretty-printed across multiple unwrapped lines,
 *   - nothing is truncated,
 *   - the row layout grows with the payload's line count,
 *   - a circular payload renders (`[Circular]`) without blocking later events,
 *   - the overlay opts into horizontal scrolling so wide lines are reachable.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Phaser from 'phaser';
import { GameEventEmitter } from '../../../src/core-engine/GameEventEmitter';
import { GlobalEventBuffer } from '../../../src/ui/debug/GlobalEventBuffer';
import { createGameEventLogTool } from '../../../src/ui/debug/GameEventLogOverlay';
import { waitForScene } from '../../helpers/waitForScene';

const SCENE_KEY = 'TestGameEventLogOverlay';

/** Minimal scene exposing the `hudContainer` the overlay parents into. */
class GameEventLogTestScene extends Phaser.Scene {
  hudContainer!: Phaser.GameObjects.Container;

  constructor() {
    super({ key: SCENE_KEY });
  }

  create(): void {
    this.hudContainer = this.add.container(0, 0);
  }
}

/** Recursively collect every text object under a container. */
function collectTexts(
  container: Phaser.GameObjects.Container,
  out: Phaser.GameObjects.Text[] = [],
): Phaser.GameObjects.Text[] {
  container.each((child: Phaser.GameObjects.GameObject) => {
    if (child instanceof Phaser.GameObjects.Text) {
      out.push(child);
    } else if (child instanceof Phaser.GameObjects.Container) {
      collectTexts(child, out);
    }
  });
  return out;
}

/** Find the overlay's scroll container (the only container in the HUD). */
function findScrollContainer(scene: Phaser.Scene): Phaser.GameObjects.Container | undefined {
  const sceneRef = scene as Phaser.Scene & { hudContainer?: Phaser.GameObjects.Container };
  let found: Phaser.GameObjects.Container | undefined;
  const visit = (container: Phaser.GameObjects.Container) => {
    container.each((child: Phaser.GameObjects.GameObject) => {
      if (child instanceof Phaser.GameObjects.Container) {
        found = child;
        visit(child);
      }
    });
  };
  if (sceneRef.hudContainer) visit(sceneRef.hudContainer);
  return found;
}

/** Find the rendered row for a specific event name. */
function findEventText(scene: Phaser.Scene, eventName: string): Phaser.GameObjects.Text | undefined {
  const sceneRef = scene as Phaser.Scene & { hudContainer?: Phaser.GameObjects.Container };
  if (!sceneRef.hudContainer) return undefined;
  return collectTexts(sceneRef.hudContainer).find((text) =>
    text.text.includes(`[${eventName}]`),
  );
}

describe('Game Events overlay pretty-printing', () => {
  let game: Phaser.Game | null = null;
  let scene: Phaser.Scene;
  let emitter: GameEventEmitter;
  /** Emit any event name/payload (the default GameEventMap is augmented per game). */
  const emit = (eventName: string, payload: unknown): void => {
    (emitter.emit as unknown as (name: string, data: unknown) => void)(eventName, payload);
  };
  const tool = createGameEventLogTool();

  beforeEach(async () => {
    let container = document.getElementById('game-container');
    if (container) container.remove();
    container = document.createElement('div');
    container.id = 'game-container';
    document.body.appendChild(container);

    game = new Phaser.Game({
      type: Phaser.CANVAS,
      parent: 'game-container',
      width: 1280,
      height: 720,
      scene: [GameEventLogTestScene],
    } as Phaser.Types.Core.GameConfig);
    await waitForScene(game, SCENE_KEY);
    scene = game.scene.getScene(SCENE_KEY);

    GlobalEventBuffer.getInstance().clear();
    emitter = new GameEventEmitter();
    GlobalEventBuffer.getInstance().subscribe(emitter);
  }, 30_000);

  afterEach(() => {
    // Close the overlay through its close button so the module-level state
    // (activeOverlay / poll interval) is released between tests.
    const sceneRef = scene as Phaser.Scene & { hudContainer?: Phaser.GameObjects.Container };
    const closeBtn = sceneRef.hudContainer
      ? collectTexts(sceneRef.hudContainer).find((text) => text.text === '✕')
      : undefined;
    closeBtn?.emit('pointerdown');

    if (game) game.destroy(true, false);
    game = null;
    document.getElementById('game-container')?.remove();
  });

  it('renders each payload as multi-line, unwrapped, untruncated JSON', () => {
    const longValue = 'wide-marker-' + 'x'.repeat(280);
    emit('card:dealt', {
      cardId: 'copper-1',
      playerIndex: 0,
      metadata: { suit: 'coins', rank: 3, tags: ['starter', 'cheap'] },
    });
    emit('state-settled', { longValue });

    tool.activate(scene);

    const dealt = findEventText(scene, 'card:dealt');
    expect(dealt).toBeDefined();
    const lines = dealt!.text.split('\n');
    expect(lines[0]).toMatch(/^\d{2}:\d{2}:\d{2}\.\d{3} \[card:dealt\]$/);
    expect(lines.length).toBeGreaterThan(4);
    expect(dealt!.text).toContain('\n  "cardId": "copper-1"');
    expect(dealt!.text).toContain('\n  "metadata": {');
    expect(dealt!.text).toContain('\n    "tags": [');

    // No word wrap configured on any rendered row (null = never wrap).
    expect(dealt!.style.wordWrapWidth).toBeNull();
    expect(dealt!.style.wordWrapCallback).toBeNull();

    const settled = findEventText(scene, 'state-settled');
    expect(settled).toBeDefined();
    expect(settled!.text).toContain(longValue);
    expect(settled!.text).not.toContain('...');
  });

  it('grows the row layout with the payload line count', () => {
    emit('turn-started', { turnNumber: 1 });
    emit('state-settled', {
      resourceBank: { coins: 10, reputation: 4 },
      board: { rows: [1, 2, 3], slots: [4, 5, 6] },
      incidents: [{ id: 'a' }, { id: 'b' }],
    });

    tool.activate(scene);

    const first = findEventText(scene, 'turn-started');
    const second = findEventText(scene, 'state-settled');
    expect(first).toBeDefined();
    expect(second).toBeDefined();

    // The second row starts below the first row's full rendered height,
    // so total content height grows with the payload line count.
    expect(second!.y).toBeGreaterThan(first!.y + first!.height);
    expect(second!.height).toBeGreaterThan(first!.height);
  });

  it('renders a circular payload without blocking the remaining events', () => {
    const circular: Record<string, unknown> = { kind: 'loop' };
    circular.self = circular;

    emit('card:dealt', circular);
    emit('turn-completed', { turnNumber: 2 });

    expect(() => tool.activate(scene)).not.toThrow();

    const circularRow = findEventText(scene, 'card:dealt');
    expect(circularRow).toBeDefined();
    expect(circularRow!.text).toContain('[Circular]');

    const followingRow = findEventText(scene, 'turn-completed');
    expect(followingRow).toBeDefined();
    expect(followingRow!.text).toContain('"turnNumber": 2');
  });

  it('makes wide payload lines reachable by scrolling horizontally', () => {
    const longValue = 'y'.repeat(600);
    emit('state-settled', { longValue });

    tool.activate(scene);

    const scrollContainer = findScrollContainer(scene);
    expect(scrollContainer).toBeDefined();
    const startX = scrollContainer!.x;

    // Wheel inside the dialog box with a horizontal delta.
    (scene.input as Phaser.Input.InputPlugin).emit(
      'wheel',
      { x: 310, y: 120 } as Phaser.Input.Pointer,
      [],
      200,
      0,
    );

    expect(scrollContainer!.x).toBeLessThan(startX);
  });
});
