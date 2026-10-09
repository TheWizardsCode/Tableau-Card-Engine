/**
 * 1916: The Rising — conversation overlay browser tests (F6, AC1–AC4).
 *
 * Boots the real {@link TheRisingScene} in a headless Phaser browser and
 * exercises the conversation overlay through the turn controller's public
 * interaction API. The tests assert observable behaviour on the rendered
 * scene and public state:
 *
 *   - AC1: meeting a spirit opens a modal overlay showing the spirit name,
 *     introduction and 2–3 question buttons, all parented into the HUD
 *     container with the backdrop 199 / box 200 / content 201 depth ordering;
 *   - AC2: choosing a question reveals the testimony (first-person clue),
 *     awards Insight, and Continue closes the overlay into placing mode;
 *   - AC3: the same seed + same choice yields the same testimony through the
 *     overlay (the pure determinism itself is covered by the F3 unit test);
 *   - AC4: reduced motion skips the entrance fade, and Escape dismisses.
 */
import { afterEach, describe, expect, it } from 'vitest';
import Phaser from 'phaser';
import { TheRisingScene, THERISING_SCENE_KEY } from '../../src/scenes/TheRisingScene';
import {
  CONVERSATION_BACKDROP_DEPTH,
  CONVERSATION_BOX_DEPTH,
  CONVERSATION_BOX_HEIGHT,
  CONVERSATION_BOX_WIDTH,
  CONVERSATION_CONTENT_DEPTH,
} from '../../src/scenes/TheRisingOverlayContent';
import { waitForScene } from '../helpers/waitForScene';
import { createInitialState, type RisingState } from '../../src/TheRisingState';
import { ROSTER } from '../../src/TheRisingContent';
import { conversationOptions } from '../../src/TheRisingEconomy';
import { GAME_H, GAME_W } from '../../src/ui/constants';

const EARLIEST = 'diarmait-mac-murchada';
const MIDDLE = 'ruaidri-ua-conchobair';
const LATEST = 'aoife-mac-murrough';
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
      seed: 'f6-overlay',
      difficulty: 'normal',
      memory: 5,
      insightTarget: 5,
      rowSpiritIds: [...TARGETS],
      targetSpiritIds: [...TARGETS],
    }),
    ...overrides,
  };
}

describe('TheRisingScene conversation overlay (F6)', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => {
    if (game) game.destroy(true, false);
    game = null;
    const container = document.getElementById('game-container');
    if (container) container.remove();
  });

  async function bootScene(): Promise<TheRisingScene> {
    const container = document.createElement('div');
    container.id = 'game-container';
    document.body.appendChild(container);

    game = new Phaser.Game({
      type: Phaser.CANVAS,
      width: GAME_W,
      height: GAME_H,
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
    // Reset the UI interaction mode so a fresh conversation can open.
    scene.turnController.uiPhase = 'idle';
    scene.turnController.selectedHandIndex = null;
    scene.turnController.refresh();
  }

  /** All text objects owned by the live overlay. */
  function overlayTexts(scene: TheRisingScene): Phaser.GameObjects.Text[] {
    return scene.overlayObjects.filter(
      (object): object is Phaser.GameObjects.Text => object instanceof Phaser.GameObjects.Text,
    );
  }

  /** Find an overlay text object by its exact label. */
  function findOverlayText(scene: TheRisingScene, text: string): Phaser.GameObjects.Text | null {
    return overlayTexts(scene).find((object) => object.text === text) ?? null;
  }

  /** Find the full-screen backdrop rectangle owned by the overlay. */
  function findBackdrop(scene: TheRisingScene): Phaser.GameObjects.Rectangle | null {
    return (
      scene.overlayObjects.find(
        (object): object is Phaser.GameObjects.Rectangle =>
          object instanceof Phaser.GameObjects.Rectangle &&
          object.width === GAME_W &&
          object.height === GAME_H,
      ) ?? null
    );
  }

  /** Find the visible modal box rectangle owned by the overlay. */
  function findBox(scene: TheRisingScene): Phaser.GameObjects.Rectangle | null {
    return (
      scene.overlayObjects.find(
        (object): object is Phaser.GameObjects.Rectangle =>
          object instanceof Phaser.GameObjects.Rectangle &&
          object.width === CONVERSATION_BOX_WIDTH &&
          object.height === CONVERSATION_BOX_HEIGHT,
      ) ?? null
    );
  }

  /** Open the conversation for the first Spirit Row spirit. */
  function openConversation(scene: TheRisingScene): void {
    const result = scene.turnController.handleMarketCardClick(0);
    expect(result.legal).toBe(true);
  }

  // ── AC1: Overlay UI ─────────────────────────────────────

  it('AC1 — meeting a spirit opens the overlay with name, introduction and question buttons', async () => {
    const scene = await bootScene();
    setState(scene, sessionState());
    const spirit = spiritById(EARLIEST);

    openConversation(scene);

    expect(scene.turnController.conversation).not.toBeNull();
    expect(scene.turnController.uiPhase).toBe('conversing');

    // Spirit name and introduction are shown.
    expect(findOverlayText(scene, spirit.name)).not.toBeNull();
    expect(findOverlayText(scene, spirit.summary)).not.toBeNull();

    // 2–3 question buttons are offered, matching the deterministic options.
    const options = conversationOptions(scene.risingState, spirit.id);
    expect(options.length).toBeGreaterThanOrEqual(2);
    expect(options.length).toBeLessThanOrEqual(3);
    for (const option of options) {
      expect(findOverlayText(scene, `[ ${option.question} ]`)).not.toBeNull();
    }

    // Cancel is always offered.
    expect(findOverlayText(scene, '[ Cancel ]')).not.toBeNull();
  });

  it('AC1 — every interactive element is parented into the HUD container (not invisible)', async () => {
    const scene = await bootScene();
    setState(scene, sessionState());
    const spirit = spiritById(EARLIEST);

    openConversation(scene);

    const hudChildren = scene.hudContainer.list;
    const title = findOverlayText(scene, spirit.name);
    const cancel = findOverlayText(scene, '[ Cancel ]');
    const options = conversationOptions(scene.risingState, spirit.id);

    expect(title).not.toBeNull();
    expect(hudChildren).toContain(title);
    expect(cancel).not.toBeNull();
    expect(hudChildren).toContain(cancel);
    for (const option of options) {
      const button = findOverlayText(scene, `[ ${option.question} ]`);
      expect(button).not.toBeNull();
      expect(hudChildren).toContain(button);
    }
  });

  it('AC1 — the overlay uses the backdrop 199 / box 200 / content 201 depth ordering', async () => {
    const scene = await bootScene();
    setState(scene, sessionState());
    const spirit = spiritById(EARLIEST);

    openConversation(scene);

    const backdrop = findBackdrop(scene);
    const box = findBox(scene);
    expect(backdrop).not.toBeNull();
    expect(box).not.toBeNull();
    expect(backdrop!.depth).toBe(CONVERSATION_BACKDROP_DEPTH);
    expect(box!.depth).toBe(CONVERSATION_BOX_DEPTH);
    expect(backdrop!.depth).toBeLessThan(box!.depth);

    const title = findOverlayText(scene, spirit.name);
    expect(title).not.toBeNull();
    expect(title!.depth).toBe(CONVERSATION_CONTENT_DEPTH);
    expect(box!.depth).toBeLessThan(title!.depth);

    for (const option of conversationOptions(scene.risingState, spirit.id)) {
      const button = findOverlayText(scene, `[ ${option.question} ]`);
      expect(button).not.toBeNull();
      expect(button!.depth).toBe(CONVERSATION_CONTENT_DEPTH);
    }
  });

  // ── AC2: Testimony reveal ───────────────────────────────

  it('AC2 — choosing a question reveals the testimony, awards Insight and Continue closes into placing', async () => {
    const scene = await bootScene();
    setState(scene, sessionState());
    const spirit = spiritById(EARLIEST);
    openConversation(scene);

    const insightBefore = scene.risingState.insight;
    const options = conversationOptions(scene.risingState, spirit.id);
    const first = options[0];

    // Click the first question button.
    const button = findOverlayText(scene, `[ ${first.question} ]`);
    expect(button).not.toBeNull();
    button!.emit('pointerdown');

    // The testimony is revealed (the first-person answer, in quotes).
    const expectedAnswer = spirit.testimonies[first.testimonyIndex].answer;
    expect(findOverlayText(scene, `\u201c${expectedAnswer}\u201d`)).not.toBeNull();
    expect(findOverlayText(scene, '+1 Insight')).not.toBeNull();

    // Insight is awarded and the state advances to placing.
    expect(scene.risingState.insight).toBe(insightBefore + 1);
    expect(scene.risingState.phase).toBe('placing');
    expect(scene.turnController.conversation?.testimony?.answer).toBe(expectedAnswer);

    // Continue closes the overlay and moves the UI into placing mode.
    const continueButton = findOverlayText(scene, '[ Continue ]');
    expect(continueButton).not.toBeNull();
    continueButton!.emit('pointerdown');

    expect(scene.turnController.conversation).toBeNull();
    expect(scene.turnController.uiPhase).toBe('placing');
    expect(scene.overlayObjects).toHaveLength(0);
  });

  it('AC2 — the player can place the spirit after the testimony is revealed', async () => {
    const scene = await bootScene();
    setState(scene, sessionState());
    openConversation(scene);

    const option = conversationOptions(scene.risingState, spiritById(EARLIEST).id)[0];
    findOverlayText(scene, `[ ${option.question} ]`)!.emit('pointerdown');
    findOverlayText(scene, '[ Continue ]')!.emit('pointerdown');

    scene.turnController.handleHandCardClick(0);
    const placed = scene.turnController.handleTimelineSlotClick(0);

    expect(placed.legal).toBe(true);
    expect(scene.risingState.timeline.map((entry) => entry.spiritId)).toEqual([EARLIEST]);
  });

  // ── AC3: Deterministic conversation ─────────────────────

  it('AC3 — the same seed and the same choice reveal the same testimony through the overlay', async () => {
    const scene = await bootScene();
    const spirit = spiritById(EARLIEST);

    // First conversation.
    setState(scene, sessionState({ seed: 424242 }));
    openConversation(scene);
    const firstOption = conversationOptions(scene.risingState, spirit.id)[0];
    findOverlayText(scene, `[ ${firstOption.question} ]`)!.emit('pointerdown');
    const firstAnswer = scene.turnController.conversation?.testimony?.answer;
    expect(firstAnswer).toBeTruthy();
    findOverlayText(scene, '[ Continue ]')!.emit('pointerdown');

    // Reset to an identical seed and converse again.
    setState(scene, sessionState({ seed: 424242 }));
    openConversation(scene);
    const secondOption = conversationOptions(scene.risingState, spirit.id)[0];
    findOverlayText(scene, `[ ${secondOption.question} ]`)!.emit('pointerdown');
    const secondAnswer = scene.turnController.conversation?.testimony?.answer;

    expect(secondOption.question).toBe(firstOption.question);
    expect(secondAnswer).toBe(firstAnswer);
    // The revealed text matches the deterministic answer.
    expect(findOverlayText(scene, `\u201c${secondAnswer}\u201d`)).not.toBeNull();
  });

  // ── AC4: Accessibility ──────────────────────────────────

  it('AC4 — reduced motion skips the entrance fade (content is immediately visible)', async () => {
    const scene = await bootScene();
    scene.animator.reducedMotion = true;
    setState(scene, sessionState());
    const spirit = spiritById(EARLIEST);

    openConversation(scene);

    const title = findOverlayText(scene, spirit.name);
    expect(title).not.toBeNull();
    expect(title!.alpha).toBe(1);
  });

  it('AC4 — with motion enabled the content fades in from transparent', async () => {
    const scene = await bootScene();
    scene.animator.reducedMotion = false;
    setState(scene, sessionState());
    const spirit = spiritById(EARLIEST);

    openConversation(scene);

    const title = findOverlayText(scene, spirit.name);
    expect(title).not.toBeNull();
    // No frame has advanced yet, so the entrance tween has not run.
    expect(title!.alpha).toBe(0);
  });

  it('AC4 — Escape dismisses the overlay and refunds the meet', async () => {
    const scene = await bootScene();
    setState(scene, sessionState());
    openConversation(scene);
    expect(scene.risingState.memory).toBe(4);

    scene.input.keyboard!.emit('keydown-ESC');

    expect(scene.turnController.conversation).toBeNull();
    expect(scene.turnController.uiPhase).toBe('idle');
    expect(scene.risingState.memory).toBe(5);
    expect(scene.risingState.spiritRow).toContain(EARLIEST);
    expect(scene.overlayObjects).toHaveLength(0);
  });

  it('AC4 — the Cancel button dismisses the overlay and refunds the meet', async () => {
    const scene = await bootScene();
    setState(scene, sessionState());
    openConversation(scene);
    expect(scene.risingState.memory).toBe(4);

    const cancel = findOverlayText(scene, '[ Cancel ]');
    expect(cancel).not.toBeNull();
    cancel!.emit('pointerdown');

    expect(scene.turnController.conversation).toBeNull();
    expect(scene.turnController.uiPhase).toBe('idle');
    expect(scene.risingState.memory).toBe(5);
    expect(scene.risingState.hand).not.toContain(EARLIEST);
    expect(scene.overlayObjects).toHaveLength(0);
  });
});
