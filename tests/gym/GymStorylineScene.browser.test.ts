/**
 * GymStorylineScene browser test — the optional context block
 * (`CG-0MWO7CW99007F8JW`).
 *
 * The demo's branching rules are owned by `GymStorylineDemo.test.ts`; this
 * suite proves the scene surface:
 *
 * - a card with authored `context` renders that paragraph above the options,
 *   and the options flow below the measured panel (not over it);
 * - a card with **no** authored context renders no panel and leaves the
 *   options at their existing flow anchor — no reserved empty band, no shifted
 *   option positions;
 * - a chosen option's authored `#says` outcome is narrated into the panel
 *   through the shared reveal helper.
 *
 * The "no context" fixture is injected through the scene's runtime factory
 * seam, so both paths are exercised with a real Phaser scene rather than
 * asserted only on the view model.
 *
 * @module tests/gym/GymStorylineScene.browser.test.ts
 */
import { afterEach, describe, expect, it } from 'vitest';
import Phaser from 'phaser';

import {
  GymStorylineScene,
  setGymStorylineDemoRuntimeFactory,
} from '../../example-games/gym/scenes/GymStorylineScene';
import {
  createDemoRuntime,
  demoCardsFromCsv,
  type DemoCard,
} from '../../example-games/gym/GymStorylineDemo';
import storylinesCsv from '../../example-games/gym/content/storylines.csv?raw';
import { GYM_STORYLINE_KEY } from '../../example-games/gym/GymRegistry';
import { COMMON_SFX_KEYS } from '../../src/core-engine';
import { waitForScene } from '../helpers/waitForScene';
import { formatOptionLabel, parseStorylineOptionsEncoding } from '@story-line';

/** The catalogue the scene plays, projected from the authored CSV. */
const AUTHORED_CARDS = demoCardsFromCsv(storylinesCsv);

/** The authored card with `id`; fails loudly when the content lost it. */
function authoredCard(id: string): DemoCard {
  const found = AUTHORED_CARDS.find((card) => card.id === id);
  if (found === undefined) throw new Error(`authored content has no card "${id}"`);
  return found;
}

/** The prose the shipped demo authors on its first beat. */
const AUTHORED_CONTEXT = authoredCard('gym-story-start').context ?? '';
/** The first beat's compiled options, straight from the authored CSV. */
const AUTHORED_START_OPTIONS = parseStorylineOptionsEncoding(
  authoredCard('gym-story-start').options ?? '',
);

const AUTHORED_INVEST_OUTCOME =
  AUTHORED_START_OPTIONS.find((option) => option.label === 'Invest')?.says ?? '';
const SUCCESSOR_CONTEXT = authoredCard('gym-story-invest').context ?? '';
const TERMINAL_CONTEXT = authoredCard('gym-story-end').context ?? '';

/**
 * The same branch topology with **no** prose authored (the parity path).
 *
 * Deliberately mirrors the shipped fixture's ids, successors and deltas; only
 * `context` and `#says` are absent, so any layout difference is attributable to
 * the prose and nothing else.
 */
const NO_PROSE_CARDS: readonly DemoCard[] = [
  {
    id: 'gym-story-start',
    name: 'Town Meeting',
    storylineId: 'gym-story',
    storylineTitle: 'Gym Storyline',
    effect: 'Lose 50 coins',
    coinDelta: -50,
    options: 'Invest|gym-story-invest;Ignore|gym-story-ignore',
  },
  {
    id: 'gym-story-invest',
    name: 'Public Investment',
    storylineId: 'gym-story',
    storylineTitle: 'Gym Storyline',
    effect: 'Gain 120 coins',
    coinDelta: 120,
    options: 'Celebrate|gym-story-end;Double down|',
  },
  {
    id: 'gym-story-ignore',
    name: 'Neglected Roads',
    storylineId: 'gym-story',
    storylineTitle: 'Gym Storyline',
    effect: 'Lose 80 coins',
    coinDelta: -80,
    options: 'Repair|gym-story-end;Let it be|',
  },
  {
    id: 'gym-story-end',
    name: 'New Beginning',
    storylineId: 'gym-story',
    storylineTitle: 'Gym Storyline',
    effect: 'Gain 60 reputation',
    reputationDelta: 60,
  },
];

describe('GymStorylineScene browser test — optional context block', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => {
    if (game) game.destroy(true, false);
    game = null;
    setGymStorylineDemoRuntimeFactory(null);
    const container = document.getElementById('game-container');
    if (container) container.remove();
  });

  async function bootScene(cards?: readonly DemoCard[]): Promise<GymStorylineScene> {
    setGymStorylineDemoRuntimeFactory(
      cards === undefined ? null : () => createDemoRuntime(cards),
    );

    const container = document.createElement('div');
    container.id = 'game-container';
    document.body.appendChild(container);

    game = new Phaser.Game({
      type: Phaser.CANVAS,
      width: 1280,
      height: 720,
      parent: 'game-container',
      backgroundColor: '#1a2a1a',
      scene: [GymStorylineScene],
    });

    await waitForScene(game, GYM_STORYLINE_KEY);
    const scene = game.scene.getScene(GYM_STORYLINE_KEY) as GymStorylineScene;
    expect(scene).toBeTruthy();
    return scene;
  }

  it('renders the authored context above the options', async () => {
    const scene = await bootScene();

    expect(scene.isNarrativeVisible()).toBe(true);
    expect(scene.getNarrativeText()).toBe(AUTHORED_CONTEXT);
    // The authored `#cost=coins:5` on Invest is visible on its button; Ignore
    // authors no cost, so it keeps its bare label. Both are derived from the
    // CSV so a content edit drives the assertion.
    expect(scene.getOptionLabels()).toEqual([
      `[ ${formatOptionLabel(AUTHORED_START_OPTIONS[0])} ]`,
      `[ ${formatOptionLabel(AUTHORED_START_OPTIONS[1])} ]`,
    ]);
    expect(scene.getOptionLabels()[0]).toContain('5 coins');

    // The options flow *below* the measured panel rather than sitting at the
    // no-prose anchor and colliding with it.
    const optionYs = scene.getOptionYs();
    expect(optionYs.length).toBe(2);
    expect(optionYs[0]).toBeGreaterThan(scene.getOptionFlowAnchorY());
    expect(optionYs[1]).toBeGreaterThan(optionYs[0] as number);
  });

  it('hides the panel and leaves the options at their anchor when no context is authored', async () => {
    const scene = await bootScene(NO_PROSE_CARDS);

    expect(scene.isNarrativeVisible()).toBe(false);
    expect(scene.getNarrativeText()).toBe('');
    expect(scene.getOptionLabels()).toEqual(['[ Invest ]', '[ Ignore ]']);

    // No empty band: the first option is exactly at the existing flow anchor.
    expect(scene.getOptionYs()[0]).toBe(scene.getOptionFlowAnchorY());
  });

  it('narrates the chosen option’s authored outcome through the shared reveal', async () => {
    const scene = await bootScene();

    scene.chooseByLabel('Invest');
    scene.completeNarration();

    // The consequence precedes the successor beat's own context.
    const narrative = scene.getNarrativeText();
    expect(narrative).toContain(AUTHORED_INVEST_OUTCOME);
    expect(narrative).toContain(SUCCESSOR_CONTEXT);
    expect(narrative.indexOf(AUTHORED_INVEST_OUTCOME)).toBeLessThan(
      narrative.indexOf(SUCCESSOR_CONTEXT),
    );

    // The choice played the shared UI click sound (the reveal owns its own
    // COMMON_SFX_KEYS sound through the same SoundManager).
    expect(scene.getPlayedSfxKeys()).toContain(COMMON_SFX_KEYS.UI_CLICK);
  });

  it('does not narrate invented prose for an option that authors none', async () => {
    const scene = await bootScene();

    // Public Investment's options carry no `#says`; only the successor's own
    // context shows, so the consequence line is not repeated or invented.
    scene.chooseByLabel('Invest');
    scene.chooseByLabel('Celebrate');
    scene.completeNarration();

    expect(scene.getNarrativeText()).toBe(TERMINAL_CONTEXT);
  });
});
