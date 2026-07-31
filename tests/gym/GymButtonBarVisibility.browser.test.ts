/**
 * GymButtonBar multi-row visibility regression browser test.
 *
 * Boots each Gym scene affected by the button-bar regression
 * (CG-0MS8T34T8004ZVEM) and asserts that every expected button label
 * exists and is visible.
 *
 * Regression context: `GymSceneBase.initButtonBar()` used to destroy any
 * previously created bar, so scenes calling it 2–3 times lost every button
 * row except the last (only `[ Toggle Layout ]` survived in
 * GymHandPileScene). This test boots all 5 affected scenes and verifies
 * the full button inventory is present and visible after scene creation.
 *
 * One Phaser game boot per scene (5 boots total) to limit flakiness.
 */
import { afterEach, describe, expect, it } from 'vitest';
import Phaser from 'phaser';
import { waitForScene } from '../helpers/waitForScene';

import { GymHandPileScene } from '../../example-games/gym/scenes/GymHandPileScene';
import { GYM_HAND_PILE_KEY } from '../../example-games/gym/GymRegistry';
import { GymRuleEngineScene } from '../../example-games/gym/scenes/GymRuleEngineScene';
import { GYM_RULE_ENGINE_KEY } from '../../example-games/gym/GymRegistry';
import { GymAiStrategyScene } from '../../example-games/gym/scenes/GymAiStrategyScene';
import { GYM_AI_STRATEGY_KEY } from '../../example-games/gym/GymRegistry';
import { GymAudioFeedbackScene } from '../../example-games/gym/scenes/GymAudioFeedbackScene';
import { GYM_AUDIO_FEEDBACK_KEY } from '../../example-games/gym/GymRegistry';
import { GymSpatialRulesScene } from '../../example-games/gym/scenes/GymSpatialRulesScene';
import { GYM_SPATIAL_RULES_KEY } from '../../example-games/gym/GymRegistry';

// ── Expected button inventories (from `grep addButton` per scene) ──────

const HAND_PILE_BUTTONS = [
  '[ Draw ]',
  '[ Discard ]',
  '[ Recall ]',
  '[ Flip ]',
  '[ Move ]',
  '[ Cancel Move ]',
  '[ Show Valid ]',
  '[ Show Illegal ]',
  '[ Select Next ]',
  '[ Sort Hand ]',
  '[ Shuffle Hand ]',
  '[ Reset ]',
  '[ Disable Drag ]',
  '[ Toggle Discard Mode ]',
  '[ Toggle Face Up ]',
  '[ Toggle Layout ]',
];

const RULE_ENGINE_BUTTONS = [
  '[ Legal: move card ]',
  '[ Illegal: not your turn ]',
  '[ Illegal: insufficient funds ]',
  '[ Illegal: out of bounds ]',
  '[ Illegal: wrong phase ]',
  '[ +5 Coins ]',
  '[ -3 Coins ]',
  '[ +2 Reputation ]',
  '[ -1 Reputation ]',
  '[ -25 Coins (violation) ]',
  '[ -10 Reputation (violation) ]',
  '[ Set Score 100 ]',
  '[ Reset Ledger ]',
];

const AI_STRATEGY_BUTTONS = [
  '[ Make a Pick ]',
  '[ Run pickRandom ]',
  '[ Run pickBest ]',
  '[ Run Both ]',
  '[ -1 ]',
  '[ +1 ]',
  '[ Re-roll Seed ]',
  '[ Reset Seed to 42 ]',
];

const AUDIO_FEEDBACK_BUTTONS = [
  '[ Toggle Mute ]',
  '[ Volume - ]',
  '[ Volume + ]',
  '[ Invalid Key ]',
];

const SPATIAL_RULES_BUTTONS = [
  '[ -W ]',
  '[ +W ]',
  '[ -H ]',
  '[ +H ]',
  '[ Randomise ]',
  '[ Metric: ]',
  '[ Toggle Diag ]',
  '[ Neighbors ]',
  '[ Shortest Path ]',
  '[ Path Exists ]',
  '[ Adj Bonus ]',
  '[ Clear Sel ]',
  '[ Clear Path ]',
  '[ Reset Grid ]',
];

// ── Helpers ─────────────────────────────────────────────────────────────

describe('GymButtonBar multi-row visibility', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => {
    if (game) game.destroy(true, false);
    game = null;
    const container = document.getElementById('game-container');
    if (container) container.remove();
  });

  /**
   * Boot a single Gym scene directly (bypassing the Gym router) and wait
   * for it to become active.
   */
  async function bootScene(
    sceneKey: string,
    SceneClass: typeof Phaser.Scene,
  ): Promise<Phaser.Scene> {
    const container = document.createElement('div');
    container.id = 'game-container';
    document.body.appendChild(container);

    game = new Phaser.Game({
      type: Phaser.CANVAS,
      width: 1280,
      height: 720,
      parent: 'game-container',
      backgroundColor: '#1a2a1a',
      scene: [SceneClass],
    });

    await waitForScene(game, sceneKey);
    const scene = game.scene.getScene(sceneKey);
    expect(scene).toBeTruthy();
    expect(scene.sys.isActive()).toBe(true);
    return scene;
  }

  /**
   * Find a button by substring match on Phaser Text children
   * (same pattern as tests/handView/gym-handpile-drag.browser.test.ts).
   */
  function findButtonByText(
    scene: Phaser.Scene,
    text: string,
  ): Phaser.GameObjects.Text | null {
    const children = (scene as any).children?.getAll?.() ?? [];
    for (const obj of children) {
      if (
        obj instanceof Phaser.GameObjects.Text &&
        typeof obj.text === 'string' &&
        obj.text.includes(text)
      ) {
        return obj;
      }
    }
    return null;
  }

  /** Assert every expected button exists and is rendered (visible). */
  function expectButtonsVisible(scene: Phaser.Scene, labels: string[]): void {
    for (const label of labels) {
      const btn = findButtonByText(scene, label);
      expect(btn, `button "${label}" should exist`).toBeTruthy();
      expect(
        (btn as Phaser.GameObjects.Text).visible,
        `button "${label}" should be visible`,
      ).toBe(true);
    }
  }

  it('GymHandPileScene shows all 16 control buttons', async () => {
    const scene = await bootScene(GYM_HAND_PILE_KEY, GymHandPileScene);
    expectButtonsVisible(scene, HAND_PILE_BUTTONS);
  });

  it('GymRuleEngineScene shows all 13 legality + economy buttons', async () => {
    const scene = await bootScene(GYM_RULE_ENGINE_KEY, GymRuleEngineScene);
    expectButtonsVisible(scene, RULE_ENGINE_BUTTONS);
  });

  it('GymAiStrategyScene shows all 8 strategy buttons', async () => {
    const scene = await bootScene(GYM_AI_STRATEGY_KEY, GymAiStrategyScene);
    expectButtonsVisible(scene, AI_STRATEGY_BUTTONS);
  });

  it('GymAudioFeedbackScene shows all 4 audio buttons', async () => {
    const scene = await bootScene(GYM_AUDIO_FEEDBACK_KEY, GymAudioFeedbackScene);
    expectButtonsVisible(scene, AUDIO_FEEDBACK_BUTTONS);
  });

  it('GymSpatialRulesScene shows all 14 grid buttons', async () => {
    const scene = await bootScene(GYM_SPATIAL_RULES_KEY, GymSpatialRulesScene);
    expectButtonsVisible(scene, SPATIAL_RULES_BUTTONS);
  });
});
