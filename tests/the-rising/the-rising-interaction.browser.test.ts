/**
 * 1916: The Rising — interaction browser tests (F5, AC1–AC5).
 *
 * Boots the real {@link TheRisingScene} in a headless Phaser browser and
 * exercises the turn controller through its public interaction handlers (and,
 * for the Spirit Row meet, through real DOM pointer events on the canvas).
 *
 * The tests assert observable behaviour on the public state/controllers — the
 * Memory economy, the hand/timeline contents, the UI phase and the undo/redo
 * history — not the shape of the implementation.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import Phaser from 'phaser';
import { TheRisingScene, THERISING_SCENE_KEY } from '../../src/scenes/TheRisingScene';
import { waitForScene } from '../helpers/waitForScene';
import { createInitialState, RISING_START_YEAR, type RisingState } from '../../src/TheRisingState';
import { ROSTER } from '../../src/TheRisingContent';
import { HAND_SELECTION_LIFT } from '../../src/scenes/TheRisingTurnController';

const EARLIEST = 'diarmait-mac-murchada'; // 1110
const MIDDLE = 'ruaidri-ua-conchobair'; // 1116
const LATEST = 'aoife-mac-murrough'; // 1145
const TARGETS = [EARLIEST, MIDDLE, LATEST] as const;

function spiritById(id: string) {
  const spirit = ROSTER.spirits.find((candidate) => candidate.id === id);
  if (!spirit) throw new Error(`Unknown spirit ${id}`);
  return spirit;
}

/** A small controllable state: 5 Memory, a 3-spirit row/target, low Insight bar. */
function sessionState(overrides: Partial<RisingState> = {}): RisingState {
  return {
    ...createInitialState({
      seed: 'f5-interaction',
      difficulty: 'normal',
      memory: 5,
      insightTarget: 5,
      rowSpiritIds: [...TARGETS],
      targetSpiritIds: [...TARGETS],
    }),
    ...overrides,
  };
}

describe('TheRisingScene interaction (F5)', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => {
    if (game) game.destroy(true, false);
    game = null;
    const container = document.getElementById('game-container');
    if (container) container.remove();
    vi.restoreAllMocks();
  });

  async function bootScene(): Promise<TheRisingScene> {
    const container = document.createElement('div');
    container.id = 'game-container';
    document.body.appendChild(container);

    game = new Phaser.Game({
      type: Phaser.CANVAS,
      width: 1280,
      height: 720,
      parent: 'game-container',
      backgroundColor: '#10141d',
      audio: { noAudio: true },
      scene: [TheRisingScene],
    });

    await waitForScene(game, THERISING_SCENE_KEY);
    const scene = game.scene.getScene(THERISING_SCENE_KEY) as TheRisingScene;
    expect(scene).toBeTruthy();
    return scene;
  }

  /** Replace the scene's state and repaint (the controller reads via closure). */
  function setState(scene: TheRisingScene, state: RisingState): void {
    scene.risingState = state;
    scene.turnController.refresh();
  }

  /** Dispatch a native DOM click (mousedown + mouseup) at scene coordinates. */
  async function dispatchClick(scene: TheRisingScene, sceneX: number, sceneY: number): Promise<void> {
    const canvas = document.querySelector('#game-container canvas') as HTMLCanvasElement;
    expect(canvas).toBeTruthy();
    const rect = canvas.getBoundingClientRect();
    const clientX = rect.left + (sceneX / scene.scale.width) * rect.width;
    const clientY = rect.top + (sceneY / scene.scale.height) * rect.height;

    canvas.dispatchEvent(new MouseEvent('mousedown', {
      clientX, clientY, bubbles: true, cancelable: true, view: window, button: 0,
    }));
    await new Promise((resolve) => setTimeout(resolve, 30));
    canvas.dispatchEvent(new MouseEvent('mouseup', {
      clientX, clientY, bubbles: true, cancelable: true, view: window, button: 0,
    }));
    await new Promise((resolve) => setTimeout(resolve, 30));
  }

  /** Dispatch a native DOM mouse event at scene coordinates. */
  function dispatchMouse(scene: TheRisingScene, type: string, sceneX: number, sceneY: number): void {
    const canvas = document.querySelector('#game-container canvas') as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    canvas.dispatchEvent(new MouseEvent(type, {
      clientX: rect.left + (sceneX / scene.scale.width) * rect.width,
      clientY: rect.top + (sceneY / scene.scale.height) * rect.height,
      bubbles: true, cancelable: true, view: window, button: 0,
    }));
  }

  /** Simulate a full drag gesture from (sx,sy) to (dx,dy) at scene coordinates. */
  async function simulateDrag(
    scene: TheRisingScene,
    sx: number,
    sy: number,
    dx: number,
    dy: number,
  ): Promise<void> {
    dispatchMouse(scene, 'mousedown', sx, sy);
    await new Promise((resolve) => setTimeout(resolve, 30));
    dispatchMouse(scene, 'mousemove', sx + 6, sy);
    await new Promise((resolve) => setTimeout(resolve, 30));
    dispatchMouse(scene, 'mousemove', dx, dy);
    await new Promise((resolve) => setTimeout(resolve, 80));
    dispatchMouse(scene, 'mouseup', dx, dy);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  // ── AC1: Spirit Row interaction ─────────────────────────

  it('AC1 — clicking an affordable Spirit Row card spends Memory and opens the conversation', async () => {
    const scene = await bootScene();
    setState(scene, sessionState());

    const result = scene.turnController.handleMarketCardClick(0);

    expect(result.legal).toBe(true);
    expect(scene.risingState.memory).toBe(4);
    expect(scene.risingState.hand).toContain(EARLIEST);
    expect(scene.risingState.spiritRow).not.toContain(EARLIEST);
    // The conversation overlay is open and the UI is in conversing mode.
    expect(scene.turnController.conversation).not.toBeNull();
    expect(scene.turnController.uiPhase).toBe('conversing');
    expect(scene.risingState.phase).toBe('conversing');
  });

  it('AC1 — the Spirit Row click is wired to real pointer events', async () => {
    const scene = await bootScene();
    setState(scene, sessionState());

    const centre = scene.boardRenderer.marketView.getCardCenters()[0];
    expect(centre).toBeTruthy();
    await dispatchClick(scene, centre.x, centre.y);

    expect(scene.risingState.hand).toContain(EARLIEST);
    expect(scene.risingState.memory).toBe(4);
    expect(scene.turnController.conversation).not.toBeNull();
  });

  it('AC1 — an unaffordable meet is rejected with illegal-move feedback', async () => {
    const scene = await bootScene();
    setState(scene, sessionState({ memory: 0 }));
    const reject = vi.spyOn(scene.animator, 'rejectPlacement');

    const result = scene.turnController.handleMarketCardClick(0);

    expect(result.legal).toBe(false);
    expect(scene.risingState.memory).toBe(0);
    expect(scene.risingState.hand).toHaveLength(0);
    expect(scene.risingState.spiritRow).toContain(EARLIEST);
    expect(scene.turnController.conversation).toBeNull();
    expect(reject).toHaveBeenCalled();
  });

  // ── AC2: Hand interaction ───────────────────────────────

  it('AC2 — clicking a hand card selects it and switches to placing mode', async () => {
    const scene = await bootScene();
    setState(scene, sessionState({ hand: [EARLIEST], spiritRow: [MIDDLE, LATEST], phase: 'placing', activeSpiritId: EARLIEST }));

    const result = scene.turnController.handleHandCardClick(0);

    expect(result.legal).toBe(true);
    expect(scene.turnController.selectedHandIndex).toBe(0);
    expect(scene.turnController.uiPhase).toBe('placing');
    expect(scene.boardRenderer.handView.getSelected()).toBe(0);
    expect(scene.boardRenderer.handView.getSelectionLift()).toBe(HAND_SELECTION_LIFT);
  });

  // ── AC3: Timeline placement ─────────────────────────────

  it('AC3 — a legal placement awards Insight, advances the clock and commits the card', async () => {
    const scene = await bootScene();
    const state = sessionState({ hand: [EARLIEST], spiritRow: [MIDDLE, LATEST], phase: 'placing', activeSpiritId: EARLIEST, insight: 0 });
    setState(scene, state);

    scene.turnController.handleHandCardClick(0);
    const clockBefore = scene.risingState.clock;
    const result = scene.turnController.handleTimelineSlotClick(0);

    expect(result.legal).toBe(true);
    expect(scene.risingState.timeline.map((entry) => entry.spiritId)).toEqual([EARLIEST]);
    expect(scene.risingState.insight).toBeGreaterThan(0);
    expect(scene.risingState.clock).toBeGreaterThan(clockBefore);
    expect(scene.turnController.selectedHandIndex).toBeNull();
  });

  it('AC3 — an illegal placement is rejected and leaves the timeline untouched', async () => {
    const scene = await bootScene();
    const withLatest = sessionState({
      hand: [EARLIEST],
      spiritRow: [MIDDLE, LATEST],
      phase: 'placing',
      activeSpiritId: EARLIEST,
      timeline: [{ spiritId: LATEST, eraId: 'norman-lordship', year: 1145, slotIndex: 0 }],
      placedSpiritIds: [LATEST],
    });
    setState(scene, withLatest);
    const reject = vi.spyOn(scene.animator, 'rejectPlacement');

    scene.turnController.handleHandCardClick(0);
    // EARLIEST (1110) cannot be placed *after* LATEST (1145): slot 1 breaks order.
    const result = scene.turnController.handleTimelineSlotClick(1);

    expect(result.legal).toBe(false);
    expect(scene.risingState.timeline.map((entry) => entry.spiritId)).toEqual([LATEST]);
    expect(scene.risingState.hand).toContain(EARLIEST);
    expect(reject).toHaveBeenCalled();
  });

  // ── AC4: Drag-and-drop buy-and-place ────────────────────

  it('AC4 — a real drag from the Spirit Row onto a slot buys and places the card', async () => {
    const scene = await bootScene();
    setState(scene, sessionState({ memory: 5 }));

    const card = scene.boardRenderer.marketView.getCardCenters()[0];
    const slot = scene.boardRenderer.timelineView.getInsertionPosition(0);
    await simulateDrag(scene, card.x, card.y, slot.x, slot.y);

    expect(scene.risingState.timeline.map((entry) => entry.spiritId)).toEqual([EARLIEST]);
    expect(scene.risingState.memory).toBe(4);
  });

  it('AC4 — a real drag from the hand onto a slot places the card', async () => {
    const scene = await bootScene();
    setState(scene, sessionState({
      hand: [EARLIEST],
      spiritRow: [MIDDLE, LATEST],
      phase: 'placing',
      activeSpiritId: EARLIEST,
    }));

    const card = scene.boardRenderer.handView.getCardCenters()[0];
    const slot = scene.boardRenderer.timelineView.getInsertionPosition(0);
    await simulateDrag(scene, card.x, card.y, slot.x, slot.y);

    expect(scene.risingState.timeline.map((entry) => entry.spiritId)).toEqual([EARLIEST]);
    expect(scene.risingState.hand).not.toContain(EARLIEST);
  });

  it('AC4 — dragging a Spirit Row card onto a slot buys and places it at the same price', async () => {
    const scene = await bootScene();
    setState(scene, sessionState({ memory: 5 }));

    const result = scene.turnController.handleMarketDrop(EARLIEST, 0);

    expect(result.legal).toBe(true);
    expect(scene.risingState.timeline.map((entry) => entry.spiritId)).toEqual([EARLIEST]);
    // Identical economy to the click path: one Memory to meet.
    expect(scene.risingState.memory).toBe(4);
    expect(scene.risingState.hand).not.toContain(EARLIEST);
  });

  it('AC4 — the drag path is not cheaper than the click path', async () => {
    const scene = await bootScene();

    // Click path: meet (1 Memory) + conversation + placement.
    setState(scene, sessionState({ memory: 5 }));
    scene.turnController.handleMarketCardClick(0);
    scene.turnController.handleConversationChoice(0);
    scene.turnController.closeConversation(true);
    scene.turnController.handleHandCardClick(0);
    scene.turnController.handleTimelineSlotClick(0);
    const clickCost = 5 - scene.risingState.memory;

    // Drag path: meet + place in one gesture, from a fresh session.
    setState(scene, sessionState({ memory: 5 }));
    scene.turnController.handleMarketDrop(EARLIEST, 0);
    const dragCost = 5 - scene.risingState.memory;

    expect(clickCost).toBe(1);
    expect(dragCost).toBe(clickCost);
  });

  // ── AC5: Undo / redo ────────────────────────────────────

  it('AC5 — undo returns the placed card to hand and redo reinstates it', async () => {
    const scene = await bootScene();
    setState(scene, sessionState({ hand: [EARLIEST], spiritRow: [MIDDLE, LATEST], phase: 'placing', activeSpiritId: EARLIEST }));

    scene.turnController.handleHandCardClick(0);
    scene.turnController.handleTimelineSlotClick(0);
    const placed = scene.risingState;
    expect(placed.timeline.map((entry) => entry.spiritId)).toEqual([EARLIEST]);

    expect(scene.turnController.undoRedo.canUndo()).toBe(true);
    expect(scene.turnController.undo()).toBe(true);

    expect(scene.risingState.timeline).toHaveLength(0);
    expect(scene.risingState.hand).toContain(EARLIEST);
    expect(scene.risingState.clock).toBe(RISING_START_YEAR);

    expect(scene.turnController.undoRedo.canRedo()).toBe(true);
    expect(scene.turnController.redo()).toBe(true);

    expect(scene.risingState.timeline.map((entry) => entry.spiritId)).toEqual([EARLIEST]);
    expect(scene.risingState.hand).not.toContain(EARLIEST);
  });

  // ── Conversation flow ───────────────────────────────────

  it('a conversation choice awards Insight and exposes the testimony before placing', async () => {
    const scene = await bootScene();
    setState(scene, sessionState());
    scene.turnController.handleMarketCardClick(0);
    const spirit = spiritById(EARLIEST);

    const insightBefore = scene.risingState.insight;
    const result = scene.turnController.handleConversationChoice(0);

    expect(result.legal).toBe(true);
    expect(scene.risingState.phase).toBe('placing');
    expect(scene.risingState.insight).toBe(insightBefore + 1);
    expect(scene.turnController.conversation?.testimony).not.toBeNull();
    expect(scene.turnController.conversation?.testimony?.answer).toBe(
      spirit.testimonies[scene.risingState.activeTestimonyIndex ?? 0].answer,
    );

    scene.turnController.closeConversation(true);
    expect(scene.turnController.conversation).toBeNull();
    expect(scene.turnController.uiPhase).toBe('placing');
  });

  it('cancelling a conversation refunds Memory and returns the spirit to the row', async () => {
    const scene = await bootScene();
    setState(scene, sessionState());
    scene.turnController.handleMarketCardClick(0);
    expect(scene.risingState.memory).toBe(4);

    scene.turnController.cancelConversation();

    expect(scene.risingState.memory).toBe(5);
    expect(scene.risingState.spiritRow).toContain(EARLIEST);
    expect(scene.risingState.hand).not.toContain(EARLIEST);
    expect(scene.turnController.conversation).toBeNull();
    expect(scene.turnController.uiPhase).toBe('idle');
  });
});
