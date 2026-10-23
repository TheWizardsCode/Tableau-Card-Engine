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
 * - `createStorylineSystem({ engine })` binds a tiny engine adapter (seeded
 *   rng, effect application, activity log, chain-card sink) to the default
 *   presentation adapter.
 * - `compileStorylineFromEvent` / `createPendingStorylineChoice` drive the
 *   choice dialog; `resolveStorylineOption` applies the effect and pushes the
 *   successor card.
 *
 * The demo's fixture and every decision it makes live in the Phaser-free
 * `../GymStorylineDemo` module, which is unit-tested directly; this scene only
 * renders what those pure transitions return.
 *
 * @module example-games/gym/scenes/GymStorylineScene
 */

import Phaser from 'phaser';
import { GymSceneBase } from './GymSceneBase';
import { GYM_STORYLINE_KEY } from '../GymRegistry';
import { createHudText } from '../../../src/ui/Renderer';
import { GAME_W } from '../../../src/ui/constants';
import {
  applyDemoChoice,
  createDemoRuntime,
  drawDemoCard,
  startDemo,
  type DemoDraw,
  type DemoRuntime,
  type DemoState,
} from '../GymStorylineDemo';
import type {
  PendingStorylineChoice,
  StorylineCard,
  StorylineOption,
  StorylineSystem,
} from '@story-line';
import { SCENE_HEADER_Y } from './GymConstants';

const LOG_MAX_LINES = 6;

export class GymStorylineScene extends GymSceneBase {
  constructor() {
    super({ key: GYM_STORYLINE_KEY });
  }

  private demo!: DemoRuntime;
  private currentCard: StorylineCard | null = null;
  private pending: PendingStorylineChoice<DemoState, StorylineCard> | null = null;
  private finished = false;

  /** The demo's mutable state (owned by the pure demo runtime). */
  private get state(): DemoState {
    return this.demo.state;
  }

  /** The wired story-line system (generic seams + default UI adapter). */
  private get system(): StorylineSystem<DemoState, StorylineCard> {
    return this.demo.system;
  }

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
        body: '1. The Town Meeting card offers Invest / Ignore; either choice applies Town Meeting\'s effect (-50 coins) and deals the matching successor.\n2. Invest deals Public Investment, which offers Celebrate / Double down; Celebrate applies +120 coins and deals the terminal New Beginning card.\n3. New Beginning has no options: drawing it applies its +60 reputation effect and ends the chain.\n4. Double down (a terminal option) ends the chain immediately with no successor.\n5. Reset returns to the first card.',
      },
    ]);

    this.demo = createDemoRuntime();

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
    this.demo = createDemoRuntime();
    this.finished = false;
    this.pending = null;
    this.currentCard = null;
    this.clearOptionButtons();
    this.renderDraw(startDemo(this.demo));
  }

  private clearOptionButtons(): void {
    for (const button of this.optionButtons) button.destroy();
    this.optionButtons = [];
  }

  /**
   * Draws a card and renders the pure decision's outcome: options for a
   * branching card, or the applied effect and a finished chain for a terminal
   * card.
   */
  private showCard(card: StorylineCard): void {
    this.renderDraw(drawDemoCard(this.system, this.state, card));
  }

  /** Renders the outcome of a pure draw (options, or a finished chain). */
  private renderDraw(draw: DemoDraw): void {
    const card = draw.card;
    this.currentCard = card;
    this.pending = draw.pending;
    this.clearOptionButtons();

    this.titleText.setText(this.system.ui.choiceDialogTitle(card));
    this.subtitleText.setText(this.system.ui.choiceDialogSubtitle(card));
    this.cardText.setText(`${card.name} — ${card.effect ?? 'no effect'}`);

    if (!draw.finished) {
      this.renderOptions(card, draw.options);
    } else {
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
    const result = applyDemoChoice(
      this.system,
      this.state,
      card,
      option,
      this.pending,
    );

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
