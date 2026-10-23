/**
 * GymStorylineScene -- Demonstrates the generic, game-agnostic story-line
 * system (`@story-line`) end to end.
 *
 * A small hand of story cards deals a branching narrative: the player draws a
 * card, sees the compiled options, picks one, and the choice determines the
 * next card until the chain ends. The scene deliberately uses only the core
 * story-line module and its **default UI adapter** (no Main Street code), so
 * it doubles as a worked example of the pluggable seams:
 *
 * - `createStorylineSystem({ engine })` binds a tiny in-scene engine adapter
 *   (seeded rng, effect application, activity log, chain-card sink) to the
 *   default presentation adapter.
 * - `compileStorylineFromEvent` / `createPendingStorylineChoice` drive the
 *   choice dialog; `resolveStorylineOption` applies the effect and pushes the
 *   successor card.
 *
 * @module example-games/gym/scenes/GymStorylineScene
 */

import Phaser from 'phaser';
import { GymSceneBase } from './GymSceneBase';
import { GYM_STORYLINE_KEY } from '../GymRegistry';
import { createHudText } from '../../../src/ui/Renderer';
import { GAME_W } from '../../../src/ui/constants';
import {
  createStorylineSystem,
  type PendingStorylineChoice,
  type StorylineCard,
  type StorylineEngineAdapter,
  type StorylineLogEntry,
  type StorylineOption,
  type StorylineSystem,
} from '@story-line';
import { SCENE_HEADER_Y } from './GymConstants';

/** The demo's minimal game state. */
interface DemoState {
  coins: number;
  reputation: number;
  turn: number;
  rngSeed: number;
  activityLog: StorylineLogEntry[];
  deck: StorylineCard[];
}

/** The demo's card catalogue (templates, no instance serials). */
const DEMO_CARDS: readonly StorylineCard[] = [
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

const TEMPLATES = new Map<string, StorylineCard>(
  DEMO_CARDS.map((card) => [card.id, card]),
);

/** Deterministic LCG so the demo is replay-safe (no candidate draws here). */
function nextRandom(state: DemoState): number {
  state.rngSeed = (state.rngSeed * 1664525 + 1013904223) >>> 0;
  return state.rngSeed / 0x100000000;
}

/** Engine adapter mapping the generic seams onto the demo state. */
function createDemoEngine(): StorylineEngineAdapter<DemoState, StorylineCard> {
  return {
    rng: (state) => nextRandom(state),
    applyEffect: (state, card) => {
      state.coins += card.coinDelta ?? 0;
      state.reputation += card.reputationDelta ?? 0;
    },
    applyResourceDelta: (state, delta) => {
      state.coins += delta.coins ?? 0;
      state.reputation += delta.reputation ?? 0;
    },
    getResources: (state) => ({ coins: state.coins, reputation: state.reputation }),
    appendLog: (state, text) => {
      state.activityLog.push({ turn: state.turn, text });
    },
    getActivityLog: (state) => state.activityLog,
    getTemplate: (id) => TEMPLATES.get(id) ?? null,
    getBaseTypeId: (id) => id.replace(/-\d+$/, ''),
    getChainScanCards: (state) => state.deck,
    pushChainCard: (state, card) => {
      state.deck.push(card);
    },
  };
}

const LOG_MAX_LINES = 6;

export class GymStorylineScene extends GymSceneBase {
  constructor() {
    super({ key: GYM_STORYLINE_KEY });
  }

  private system!: StorylineSystem<DemoState, StorylineCard>;
  private state!: DemoState;
  private currentCard: StorylineCard | null = null;
  private pending: PendingStorylineChoice<DemoState, StorylineCard> | null = null;
  private finished = false;

  private titleText!: Phaser.GameObjects.Text;
  private subtitleText!: Phaser.GameObjects.Text;
  private cardText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private logText!: Phaser.GameObjects.Text;
  private optionButtons: Phaser.GameObjects.Text[] = [];

  private readonly optionStartY = SCENE_HEADER_Y + 210;

  create(): void {
    this.cameras.main.setBackgroundColor('#1a2a1a');
    this.initHeader('Storyline');
    this.addDivider();
    this.initReducedMotion();

    this.initHelp([
      {
        heading: 'What this demonstrates',
        body: 'The generic story-line system from `@story-line`: a drawn card presents an ordered set of compiled options, the player picks one, and the choice applies the card effect and pushes the next card onto the chain. It is game-agnostic — a thin engine adapter supplies state access and the default UI adapter supplies presentation.',
      },
      {
        heading: 'Controls',
        body: 'Each option button is generated from the current card\'s compiled options. The choice-clarity labels explain what each option does without revealing the next card. [ Reset ] restarts the demo from the first card.',
      },
      {
        heading: 'Test plan',
        body: '1. The Town Meeting card offers Invest / Ignore.\n2. Picking Invest gains 120 coins and deals Public Investment, which offers Celebrate / Double down.\n3. Celebrate deals the terminal New Beginning card, applies its reputation effect, and ends the chain.\n4. Double down (a terminal option) ends the chain immediately with no successor.\n5. Reset returns to the first card.',
      },
    ]);

    this.system = createStorylineSystem({ engine: createDemoEngine() });

    const cx = GAME_W / 2;
    this.titleText = createHudText(this, cx, SCENE_HEADER_Y + 30, '', '#ffffff', {
      fontSize: '28px',
    }).setOrigin(0.5);
    this.subtitleText = createHudText(this, cx, SCENE_HEADER_Y + 65, '', '#99cc99', {
      fontSize: '18px',
    }).setOrigin(0.5);
    this.cardText = createHudText(this, cx, SCENE_HEADER_Y + 105, '', '#ffdd99', {
      fontSize: '20px',
    }).setOrigin(0.5);
    this.statusText = createHudText(this, cx, SCENE_HEADER_Y + 145, '', '#ffffff', {
      fontSize: '18px',
    }).setOrigin(0.5);
    this.logText = createHudText(this, 60, SCENE_HEADER_Y + 360, '', '#88bb88', {
      fontSize: '15px',
      align: 'left',
    });

    this.renderResetButton();
    this.resetDemo();
  }

  private renderResetButton(): void {
    // A single persistent reset control, right-aligned.
    const reset = createHudText(this, GAME_W - 40, SCENE_HEADER_Y + 30, '[ Reset ]', '#ffffff', {
      fontSize: '18px',
    }).setOrigin(1, 0.5);
    reset.setInteractive({ useHandCursor: true });
    reset.on('pointerdown', () => this.resetDemo());
  }

  private resetDemo(): void {
    this.state = {
      coins: 1000,
      reputation: 50,
      turn: 1,
      rngSeed: 0x5eed,
      activityLog: [],
      deck: [],
    };
    this.finished = false;
    this.pending = null;
    this.currentCard = null;
    this.clearOptionButtons();
    this.showCard(TEMPLATES.get('gym-story-start')!);
  }

  private clearOptionButtons(): void {
    for (const button of this.optionButtons) button.destroy();
    this.optionButtons = [];
  }

  /** Draws a card: renders a choice, or applies a terminal card and ends. */
  private showCard(card: StorylineCard): void {
    this.currentCard = card;
    this.pending = null;
    this.clearOptionButtons();

    this.titleText.setText(this.system.ui.choiceDialogTitle(card));
    this.subtitleText.setText(this.system.ui.choiceDialogSubtitle(card));
    this.cardText.setText(
      `${card.name} — ${card.effect ?? 'no effect'}`,
    );

    if (this.system.eventHasStoryline(card)) {
      this.pending = this.system.createPendingStorylineChoice(card, this.state);
      const options = this.system.getPendingStorylineOptions(this.pending!, this.state);
      this.renderOptions(card, options);
    } else {
      // Terminal (non-choice) card: apply its effect and end the chain.
      const before = this.system.engine.getResources(this.state);
      this.system.engine.applyEffect(this.state, card);
      const after = this.system.engine.getResources(this.state);
      const line = this.system.ui.storyUpdateLine(
        card,
        'accept',
        after.coins - before.coins,
        after.reputation - before.reputation,
      );
      if (line) this.system.engine.appendLog(this.state, line);
      this.finished = true;
      this.statusText.setText('Chain complete — press Reset to play again.');
    }

    this.renderStatus();
  }

  /** Renders one button per compiled option. */
  private renderOptions(card: StorylineCard, options: StorylineOption<DemoState>[]): void {
    const labels = this.system.ui.choiceClarityLabels(card, options);
    const cx = GAME_W / 2;
    options.forEach((option, index) => {
      const y = this.optionStartY + index * 70;
      const hint = index === 0 ? labels.accept : index === 1 ? labels.reject : '';
      const text = createHudText(
        this,
        cx,
        y,
        `[ ${option.label} ]${hint ? `  ${hint}` : ''}`,
        '#aaddff',
        { fontSize: '17px' },
      ).setOrigin(0.5);
      text.setInteractive({ useHandCursor: true });
      text.on('pointerdown', () => this.choose(option));
      this.optionButtons.push(text);
    });
  }

  /** Resolves the chosen option, logs the story update and draws the successor. */
  private choose(option: StorylineOption<DemoState>): void {
    if (!this.pending || !this.currentCard || this.finished) return;
    const card = this.currentCard;
    const result = this.system.resolveStorylineOption(this.state, card, option);
    this.system.markChoiceResolved(this.pending, option.label);

    const line = this.system.ui.storyUpdateLine(
      card,
      option.label,
      result.coinChange,
      result.repChange,
    );
    if (line) this.system.engine.appendLog(this.state, line);

    // Remove the spent option buttons before rendering the next card.
    this.clearOptionButtons();
    this.pending = null;

    if (result.pushedCard) {
      this.state.turn += 1;
      this.showCard(result.pushedCard);
    } else {
      this.finished = true;
      this.renderStatus();
    }
  }

  /** Refreshes resources, chain state and the journal-style activity log. */
  private renderStatus(): void {
    const chainState = this.finished
      ? 'finished'
      : `step ${this.state.turn}`;
    this.statusText.setText(
      `Coins: ${this.state.coins}   Reputation: ${this.state.reputation}   (${chainState})`,
    );

    const lines = this.state.activityLog
      .slice(-LOG_MAX_LINES)
      .map((entry) => `• ${entry.text}`);
    this.logText.setText(
      ['──── Story Journal ────', ...(lines.length ? lines : ['(no choices yet)'])].join('\n'),
    );
  }
}
