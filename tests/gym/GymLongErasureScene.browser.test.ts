/**
 * GymLongErasureScene browser test.
 *
 * Boots the scene in a headless Phaser environment and plays it end to end,
 * asserting the observable UI surface rather than the scene's source:
 *
 * - a complete Act I → Act II → Act III → scored epilogue run on the cheap
 *   route (the reset ending), with the closing screen carrying the module's
 *   journey score and band;
 * - the resource-gated branch appearing only once goodwill has accumulated;
 * - the deliberate terminal "abandon the voyage" option;
 * - textual refusal feedback for a choice the run no longer offers;
 * - `COMMON_SFX_KEYS`-only SFX through the scene's SoundManager, suppressed
 *   under reduced motion;
 * - a clean restart.
 *
 * The narrative rules themselves are owned by `GymLongErasureGame.test.ts`;
 * this suite only proves the scene renders and forwards them.
 *
 * @module tests/gym/GymLongErasureScene.browser.test.ts
 */
import { afterEach, describe, expect, it } from 'vitest';
import Phaser from 'phaser';

import { GymLongErasureScene, OPTION_ANCHORS } from '../../example-games/gym/scenes/GymLongErasureScene';
import { GYM_LONG_ERASURE_KEY } from '../../example-games/gym/GymRegistry';
import { COMMON_SFX_KEYS } from '../../src/core-engine';
import { waitForScene } from '../helpers/waitForScene';

/** The cheapest authored route: it reaches the Loom's core and resets. */
const RESET_ROUTE = [
  'Log the erasure',
  'Stay silent',
  'Shelter in the dead zone',
  'Ration the stores',
  'Refuse him',
  'Side with the captain',
  'Finish the weave',
] as const;

/** A route that arrives at The Archivist's Offer's successor with goodwill 2. */
const GOODWILL_TWO_ROUTE = [
  'Log the erasure',
  'Transmit the warning',
  'Shelter in the dead zone',
  'Ration the stores',
  'Bargain in bad faith',
] as const;

/** A route that accumulates goodwill 3 by sharing the salvaged berth. */
const GOODWILL_THREE_ROUTE = [
  'Log the erasure',
  'Transmit the warning',
  'Shelter in the dead zone',
  'Strip the derelict',
  'Share the berth',
  'Bargain in bad faith',
] as const;

/** The deliberate terminal abandon option, reached from The Archivist's Offer. */
const ABANDON_ROUTE = [
  'Log the erasure',
  'Stay silent',
  'Shelter in the dead zone',
  'Ration the stores',
  'Abandon the voyage',
] as const;

describe('GymLongErasureScene browser test', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => {
    if (game) game.destroy(true, false);
    game = null;
    const container = document.getElementById('game-container');
    if (container) container.remove();
  });

  async function bootScene(): Promise<GymLongErasureScene> {
    const container = document.createElement('div');
    container.id = 'game-container';
    document.body.appendChild(container);

    game = new Phaser.Game({
      type: Phaser.CANVAS,
      width: 1280,
      height: 720,
      parent: 'game-container',
      backgroundColor: '#141a24',
      scene: [GymLongErasureScene],
    });

    await waitForScene(game, GYM_LONG_ERASURE_KEY);
    const scene = game.scene.getScene(GYM_LONG_ERASURE_KEY) as GymLongErasureScene;
    expect(scene).toBeTruthy();
    return scene;
  }

  /** Play a route, asserting every step was actually offered. */
  function playRoute(scene: GymLongErasureScene, route: readonly string[]): void {
    for (const label of route) {
      expect(scene.getAvailableOptionLabels()).toContain(label);
      scene.chooseByLabel(label);
    }
  }

  it('boots on the first beat with the starting clock and resources', async () => {
    const scene = await bootScene();
    const run = scene.getRunState();

    expect(run.beat).toBe(1);
    expect(run.act).toBe('I');
    expect(run.currentCard.id).toBe('le-i-open');
    // The entry beat is entered immediately, so its clock cost is already paid.
    expect(run.clock).toBe(run.clockMax - run.currentCard.clockCost);
    expect(scene.getAvailableOptionLabels()).toEqual([
      'Log the erasure',
      'Rally the survey crew',
    ]);
    // Beat 1 is rendered, and the journal starts empty.
    expect(scene.getOptionAreaTexts().length).toBe(2);
    expect(scene.getJournalLines()).toEqual(['(no choices yet)']);
    expect(scene.getEpilogue()).toBeNull();
  });

  it('plays Act I → Act II → Act III → scored reset epilogue (AC7)', async () => {
    const scene = await bootScene();

    playRoute(scene, RESET_ROUTE);

    const epilogue = scene.getEpilogue();
    expect(epilogue).not.toBeNull();
    expect(epilogue?.outcome).toBe('reset');
    expect(epilogue?.reset).toBe(true);
    expect(epilogue?.endingName).toBe('The Long Erasure');
    expect(epilogue?.actsCompleted).toEqual(['I', 'II', 'III']);
    expect(epilogue?.journal.length).toBe(RESET_ROUTE.length);

    // The closing screen renders the score and band the phaser-free module
    // derived (the scene owns no scoring rule of its own).
    const score = epilogue!.score;
    const rendered = scene.getOptionAreaTexts().join('\n');
    expect(rendered).toContain(`Journey score: ${score.total} / 100 — ${score.label}`);
    expect(rendered).toContain(`Choices: ${score.choiceCount}`);
    expect(rendered).toContain('[ Begin a new survey ]');

    // The journey is scored, not won/lost: the band label is the module's.
    expect(score.total).toBeGreaterThan(0);
    expect(score.total).toBeLessThanOrEqual(100);

    // The closing screen leaves no option buttons behind.
    expect(scene.getAvailableOptionLabels()).toEqual([]);
    // The surviving journal is rendered.
    expect(scene.getJournalLines().length).toBeGreaterThan(0);
    expect(scene.getJournalLines()[0]).toMatch(/^• /);
  });

  it('hides the state-gated branch below the goodwill gate (AC7)', async () => {
    const scene = await bootScene();
    playRoute(scene, GOODWILL_TWO_ROUTE);
    expect(scene.getRunState().currentCard.id).toBe('le-ii-bargain');
    expect(scene.getRunState().resources.goodwill).toBe(2);
    expect(scene.getAvailableOptionLabels()).not.toContain('Sabotage the Loom');
    expect(scene.getAvailableOptionLabels()).toEqual(['Keep the bargain']);
  });

  it('reveals the state-gated branch once goodwill reaches 3 (AC7)', async () => {
    const scene = await bootScene();
    playRoute(scene, GOODWILL_THREE_ROUTE);
    expect(scene.getRunState().currentCard.id).toBe('le-ii-bargain');
    expect(scene.getRunState().resources.goodwill).toBe(3);
    expect(scene.getAvailableOptionLabels()).toContain('Sabotage the Loom');
  });

  it('honours the deliberate terminal "abandon the voyage" option (AC7)', async () => {
    const scene = await bootScene();

    playRoute(scene, ABANDON_ROUTE);

    const epilogue = scene.getEpilogue();
    expect(epilogue?.outcome).toBe('closed');
    expect(epilogue?.reset).toBe(false);
    expect(epilogue?.endingName).toBe('The Voyage Abandoned');
    // Reaching any Ending card completes the whole arc, whatever its label.
    expect(epilogue?.actsCompleted).toEqual(['I', 'II', 'III']);
    expect(scene.getAvailableOptionLabels()).toEqual([]);
  });

  it('explains a refused choice in text and via the shared reason toast', async () => {
    const scene = await bootScene();
    playRoute(scene, RESET_ROUTE);

    // Any further choice is refused by the module, not by the scene.
    scene.chooseByLabel('Finish the weave');

    expect(scene.getFeedbackText()).toMatch(/ended/i);
    expect(scene.getPlayedSfxKeys()).toContain(COMMON_SFX_KEYS.ILLEGAL_MOVE);
  });

  it('plays only COMMON_SFX_KEYS and suppresses them under reduced motion (AC9)', async () => {
    const scene = await bootScene();
    scene.setReducedMotionProperty(false);

    scene.chooseByLabel('Log the erasure');
    const played = scene.getPlayedSfxKeys();
    expect(played).toContain(COMMON_SFX_KEYS.CARD_SWAP);
    const allowed = new Set<string>(Object.values(COMMON_SFX_KEYS));
    for (const key of played) {
      expect(allowed.has(key), `unexpected SFX key "${key}"`).toBe(true);
    }

    // Reduced motion keeps the textual feedback but stops the SFX.
    scene.setReducedMotionProperty(true);
    const before = scene.getPlayedSfxKeys().length;
    scene.chooseByLabel('Stay silent');
    scene.beginNewSurvey();
    expect(scene.getPlayedSfxKeys().length).toBe(before);
    expect(scene.getFeedbackText()).not.toBe('');
  });

  it('writes a journal row and feedback line for every choice (AC9)', async () => {
    const scene = await bootScene();

    scene.chooseByLabel('Log the erasure');
    expect(scene.getFeedbackText()).toBe('You chose "Log the erasure".');
    expect(scene.getJournalLines().length).toBe(1);
    expect(scene.getJournalLines()[0]).toMatch(/The First Unwriting/);

    scene.chooseByLabel('Stay silent');
    expect(scene.getFeedbackText()).toBe('You chose "Stay silent".');
    expect(scene.getJournalLines().length).toBe(2);
  });

  it('restarts the run from a clean deterministic state', async () => {
    const scene = await bootScene();
    playRoute(scene, GOODWILL_TWO_ROUTE);
    expect(scene.getRunState().beat).toBeGreaterThan(1);

    scene.beginNewSurvey();

    const run = scene.getRunState();
    expect(run.beat).toBe(1);
    expect(run.currentCard.id).toBe('le-i-open');
    expect(run.clock).toBe(run.clockMax - run.currentCard.clockCost);
    expect(run.history).toEqual([]);
    expect(scene.getEpilogue()).toBeNull();
    expect(scene.getJournalLines()).toEqual(['(no choices yet)']);
    // Deterministic: the same seed reproduces the same option set.
    expect(scene.getAvailableOptionLabels()).toEqual([
      'Log the erasure',
      'Rally the survey crew',
    ]);
  });

  it('exposes the four SLL option anchors the layout provides', () => {
    expect(OPTION_ANCHORS).toEqual(['option1', 'option2', 'option3', 'option4']);
  });
});
