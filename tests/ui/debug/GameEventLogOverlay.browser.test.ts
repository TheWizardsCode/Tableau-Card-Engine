/**
 * Browser tests for the pretty-printed, colour-coded Game Events debug overlay.
 *
 * The pre-palette pretty-printing contract (CG-0MVTTR0OC006PWDK) still holds —
 * payloads are multi-line, unwrapped, untruncated JSON, Clear empties the feed
 * (not the buffer) and Pause freezes it. The colour-coding change
 * (RISE-0MW0V2CQ2006JDQV) splits each row into three measured text objects
 * (dim timestamp, coloured `[eventName]` + ASCII tag, neutral payload), so the
 * layout/presence assertions locate the relevant object rather than assuming
 * one text object per event.
 *
 * Boots a real Phaser CANVAS scene, emits events through a real
 * `GameEventEmitter` into the `GlobalEventBuffer`, and activates the tool.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Phaser from 'phaser';
import { GameEventEmitter } from '../../../src/core-engine/GameEventEmitter';
import { GlobalEventBuffer } from '../../../src/ui/debug/GlobalEventBuffer';
import {
  createGameEventLogTool,
  type GameEventLogToolOptions,
} from '../../../src/ui/debug/GameEventLogOverlay';
import type { EventLogPalette } from '../../../src/ui/debug/formatEventLog';
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

/** Find the first rendered text object matching `predicate`. */
function findText(
  scene: Phaser.Scene,
  predicate: (text: Phaser.GameObjects.Text) => boolean,
): Phaser.GameObjects.Text | undefined {
  const sceneRef = scene as Phaser.Scene & { hudContainer?: Phaser.GameObjects.Container };
  if (!sceneRef.hudContainer) return undefined;
  return collectTexts(sceneRef.hudContainer).find(predicate);
}

/** Find the rendered `[eventName]` token for a specific event. */
function findNameText(scene: Phaser.Scene, eventName: string): Phaser.GameObjects.Text | undefined {
  return findText(scene, (text) => text.text === `[${eventName}]`);
}

/** Find the rendered payload object that contains `marker`. */
function findPayloadText(
  scene: Phaser.Scene,
  marker: string,
): Phaser.GameObjects.Text | undefined {
  return findText(scene, (text) => text.text.includes(marker));
}

/** All rendered payload objects, in row order (top to bottom). */
function payloadTexts(scene: Phaser.Scene): Phaser.GameObjects.Text[] {
  const sceneRef = scene as Phaser.Scene & { hudContainer?: Phaser.GameObjects.Container };
  if (!sceneRef.hudContainer) return [];
  return collectTexts(sceneRef.hudContainer)
    .filter((text) => text.y > 0 && text.text.trimStart().startsWith('{'))
    .sort((a, b) => a.y - b.y);
}

/**
 * Wait long enough for at least one 500 ms poll tick to have run.
 *
 * The overlay polls the `GlobalEventBuffer` on a 500 ms scene timer, so
 * feed-update assertions need a real tick rather than a bare microtask.
 */
function waitForPoll(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 700));
}

/**
 * Height of the dialog's visible content area, derived from the geometry the
 * overlay requests (`BOX_HEIGHT` 500, `HEADER_HEIGHT` 90) and the shared
 * dialog's reserved chrome (46 px) plus bottom padding (10 px).
 */
const CONTENT_HEIGHT = 500 - 90 - 46 - 10;

/** Two palettes with distinct event-name colours but identical tags. */
const PALETTE_ALPHA: EventLogPalette = {
  id: 'alpha',
  label: 'Alpha',
  fallback: '#aaaaaa',
  colours: {
    'placement-attempted': '#169B62',
    draw: '#FFB347',
  },
  tags: {
    'placement-attempted': 'PLACE',
    draw: 'DRAW',
  },
};

const PALETTE_BETA: EventLogPalette = {
  id: 'beta',
  label: 'Beta',
  fallback: '#bbbbbb',
  colours: {
    'placement-attempted': '#009E73',
    draw: '#E69F00',
  },
  tags: {
    'placement-attempted': 'PLACE',
    draw: 'DRAW',
  },
};

describe('Game Events overlay', () => {
  let game: Phaser.Game | null = null;
  let scene: Phaser.Scene;
  let emitter: GameEventEmitter;
  /** Emit any event name/payload (the default GameEventMap is augmented per game). */
  const emit = (eventName: string, payload: unknown): void => {
    (emitter.emit as unknown as (name: string, data: unknown) => void)(eventName, payload);
  };

  const activate = (options?: GameEventLogToolOptions): void => {
    createGameEventLogTool(options).activate(scene);
  };

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

    activate();

    // The header is split: the name token is its own object.
    expect(findNameText(scene, 'card:dealt')).toBeDefined();

    const dealtPayload = findPayloadText(scene, '"cardId": "copper-1"');
    expect(dealtPayload).toBeDefined();
    const lines = dealtPayload!.text.split('\n');
    expect(lines.length).toBeGreaterThan(4);
    expect(dealtPayload!.text).toContain('\n  "cardId": "copper-1"');
    expect(dealtPayload!.text).toContain('\n  "metadata": {');
    expect(dealtPayload!.text).toContain('\n    "tags": [');

    // No word wrap configured on any rendered row (null = never wrap).
    expect(dealtPayload!.style.wordWrapWidth).toBeNull();
    expect(dealtPayload!.style.wordWrapCallback).toBeNull();

    const settledPayload = findPayloadText(scene, longValue);
    expect(settledPayload).toBeDefined();
    expect(settledPayload!.text).toContain(longValue);
    expect(settledPayload!.text).not.toContain('...');
  });

  it('grows the row layout with the payload line count', () => {
    emit('turn-started', { turnNumber: 1 });
    emit('state-settled', {
      resourceBank: { coins: 10, reputation: 4 },
      board: { rows: [1, 2, 3], slots: [4, 5, 6] },
      incidents: [{ id: 'a' }, { id: 'b' }],
    });

    activate();

    const firstPayload = findPayloadText(scene, '"turnNumber": 1');
    const secondName = findNameText(scene, 'state-settled');
    const secondPayload = findPayloadText(scene, '"resourceBank"');
    expect(firstPayload).toBeDefined();
    expect(secondName).toBeDefined();
    expect(secondPayload).toBeDefined();

    // The second row starts below the first row's full rendered height
    // (header + payload), so total content height grows with the payload's
    // line count.
    const firstRowBottom = firstPayload!.y + firstPayload!.height;
    expect(secondName!.y).toBeGreaterThan(firstRowBottom);
    expect(secondPayload!.height).toBeGreaterThan(firstPayload!.height);
  });

  it('renders a circular payload without blocking the remaining events', () => {
    const circular: Record<string, unknown> = { kind: 'loop' };
    circular.self = circular;

    emit('card:dealt', circular);
    emit('turn-completed', { turnNumber: 2 });

    expect(() => activate()).not.toThrow();

    const circularRow = findPayloadText(scene, '[Circular]');
    expect(circularRow).toBeDefined();
    expect(findNameText(scene, 'card:dealt')).toBeDefined();

    const followingRow = findPayloadText(scene, '"turnNumber": 2');
    expect(followingRow).toBeDefined();
    expect(findNameText(scene, 'turn-completed')).toBeDefined();
  });

  it('makes wide payload lines reachable by scrolling horizontally', () => {
    const longValue = 'y'.repeat(600);
    emit('state-settled', { longValue });

    activate();

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

  it('keeps a cleared feed cleared across poll ticks', async () => {
    emit('card:dealt', { cardId: 'copper-1' });
    emit('turn-started', { turnNumber: 1 });

    activate();
    expect(findNameText(scene, 'card:dealt')).toBeDefined();

    findText(scene, (text) => text.text === '[ Clear ]')?.emit('pointerdown');
    expect(findNameText(scene, 'card:dealt')).toBeUndefined();

    // A poll tick must not repopulate the feed from the buffer: Clear empties
    // the feed, not the buffer, and the cleared state sticks until new events
    // are emitted.
    await waitForPoll();
    expect(findNameText(scene, 'card:dealt')).toBeUndefined();
    expect(findNameText(scene, 'turn-started')).toBeUndefined();
    expect(findText(scene, (text) => text.text.includes('(no events yet'))).toBeDefined();

    // Events emitted after the clear are shown again.
    emit('turn-completed', { turnNumber: 1 });
    await waitForPoll();
    expect(findNameText(scene, 'turn-completed')).toBeDefined();
    expect(findNameText(scene, 'card:dealt')).toBeUndefined();
  });

  it('freezes the feed while paused and appends buffered events on resume', async () => {
    emit('card:dealt', { cardId: 'copper-1' });

    activate();
    findText(scene, (text) => text.text === '[ Pause ]')?.emit('pointerdown');

    emit('turn-started', { turnNumber: 2 });
    await waitForPoll();

    // Paused: the new event is not rendered and the PAUSED status survives the
    // poll tick instead of being overwritten by the buffer status line.
    expect(findNameText(scene, 'turn-started')).toBeUndefined();
    expect(findText(scene, (text) => text.text.includes('PAUSED'))).toBeDefined();

    findText(scene, (text) => text.text === '[ Resume ]')?.emit('pointerdown');
    await waitForPoll();

    // Resuming shows everything recorded while paused (the buffer is the
    // source of truth) and restores the live status line.
    expect(findNameText(scene, 'turn-started')).toBeDefined();
    expect(findText(scene, (text) => text.text.includes('PAUSED'))).toBeUndefined();
    expect(findText(scene, (text) => text.text.startsWith('Status: Buffer active'))).toBeDefined();
  });

  it('keeps the measured content height when scrolling, so the last row is reachable', async () => {
    for (let i = 0; i < 4; i += 1) {
      emit('card:dealt', {
        cardId: `copper-${i}`,
        metadata: { suit: 'coins', rank: i, tags: ['starter', `tag-${i}`], note: 'n'.repeat(120) },
      });
    }

    activate();

    const scrollContainer = findScrollContainer(scene);
    expect(scrollContainer).toBeDefined();
    const contentTop = scrollContainer!.y; // scroll offset 0

    const rows = payloadTexts(scene);
    expect(rows.length).toBe(4);
    const lastRow = rows[rows.length - 1];

    // Scroll well past the end so the dialog clamps to its maximum offset.
    for (let i = 0; i < 40; i += 1) {
      (scene.input as Phaser.Input.InputPlugin).emit(
        'wheel',
        { x: 610, y: 300 } as Phaser.Input.Pointer,
        [],
        0,
        120,
      );
    }

    // The measured content height must survive the wheel handler's
    // no-argument refresh: the final row's bottom lands inside the visible
    // content area (a child-position estimate would clamp ~130 px short of
    // it, leaving the row bottom below the dialog).
    const lastRowBottom = scrollContainer!.y + lastRow.y + lastRow.height;
    expect(lastRowBottom).toBeLessThanOrEqual(contentTop + CONTENT_HEIGHT + 1);
    expect(scrollContainer!.y + lastRow.y).toBeGreaterThanOrEqual(contentTop - 1);
  });

  // ── Colour coding (RISE-0MW0V2CQ2006JDQV) ─────────────────

  it('colours each event name from the active palette and keeps timestamp/payload neutral', () => {
    emit('placement-attempted', { turn: 1, side: 'player' });
    emit('draw', { turn: 1, spiritId: 's1' });

    activate({ palettes: [PALETTE_ALPHA], paletteIndex: 0 });

    expect(findNameText(scene, 'placement-attempted')?.style.color).toBe('#169B62');
    expect(findNameText(scene, 'draw')?.style.color).toBe('#FFB347');

    // Timestamp and payload stay palette-independent.
    const dimTexts = collectTexts(
      (scene as Phaser.Scene & { hudContainer: Phaser.GameObjects.Container }).hudContainer,
    ).filter((text) => text.style.color === '#888888');
    expect(dimTexts.length).toBeGreaterThanOrEqual(2); // one dim timestamp per row

    const payload = findPayloadText(scene, '"turn": 1');
    expect(payload?.style.color).toBe('#cccccc');
  });

  it('renders an ASCII category tag beside the name, identical in both palettes', () => {
    emit('placement-attempted', { turn: 1 });
    emit('draw', { turn: 1 });

    activate({ palettes: [PALETTE_ALPHA, PALETTE_BETA], paletteIndex: 0 });

    const alphaTag = findText(scene, (text) => text.text === 'PLACE');
    expect(alphaTag).toBeDefined();
    expect(alphaTag!.style.color).toBe('#999999');
    expect(findText(scene, (text) => text.text === 'DRAW')).toBeDefined();

    // Cycle to the second palette: same tag text and colour, different name colour.
    findText(scene, (text) => text.text === '[ Palette: Alpha ]')?.emit('pointerdown');

    expect(findNameText(scene, 'placement-attempted')?.style.color).toBe('#009E73');
    const betaTag = findText(scene, (text) => text.text === 'PLACE');
    expect(betaTag).toBeDefined();
    expect(betaTag!.style.color).toBe('#999999');
    expect(betaTag!.text).toBe(alphaTag!.text);
  });

  it('cycles palettes, re-renders the feed immediately and notifies the caller', () => {
    emit('placement-attempted', { turn: 1 });
    const onPaletteChange = vi.fn();

    activate({
      palettes: [PALETTE_ALPHA, PALETTE_BETA],
      paletteIndex: 0,
      onPaletteChange,
    });

    expect(findNameText(scene, 'placement-attempted')?.style.color).toBe('#169B62');
    expect(findText(scene, (text) => text.text === '[ Palette: Alpha ]')).toBeDefined();

    findText(scene, (text) => text.text === '[ Palette: Alpha ]')?.emit('pointerdown');

    expect(findNameText(scene, 'placement-attempted')?.style.color).toBe('#009E73');
    expect(findText(scene, (text) => text.text === '[ Palette: Beta ]')).toBeDefined();
    expect(onPaletteChange).toHaveBeenCalledWith(1);

    // Cycling wraps around.
    findText(scene, (text) => text.text === '[ Palette: Beta ]')?.emit('pointerdown');
    expect(findNameText(scene, 'placement-attempted')?.style.color).toBe('#169B62');
    expect(onPaletteChange).toHaveBeenLastCalledWith(0);
  });

  it('clamps an out-of-range palette index to the first palette', () => {
    emit('draw', { turn: 1 });

    activate({ palettes: [PALETTE_ALPHA, PALETTE_BETA], paletteIndex: 99 });

    expect(findNameText(scene, 'draw')?.style.color).toBe('#FFB347');
    expect(findText(scene, (text) => text.text === '[ Palette: Alpha ]')).toBeDefined();
  });

  it('renders the neutral, uncategorised feed when no palette is supplied', () => {
    emit('draw', { turn: 1, spiritId: 's1' });

    activate();

    // Default-path colour is the historical neutral grey.
    expect(findNameText(scene, 'draw')?.style.color).toBe('#cccccc');
    // No tag for an unmapped/absent palette.
    expect(findText(scene, (text) => text.text === 'DRAW')).toBeUndefined();
    // No cycler when there is only one palette.
    expect(findText(scene, (text) => text.text.startsWith('[ Palette:'))).toBeUndefined();
  });
});
