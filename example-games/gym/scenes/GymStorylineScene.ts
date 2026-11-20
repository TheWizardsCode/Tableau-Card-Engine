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
  revealNarration,
  type NarrationRevealHandle,
} from '../../../src/ui';
import { COMMON_SFX_KEYS, SoundManager } from '../../../src/core-engine';
import type { SoundPlayer } from '../../../src/core-engine';
import {
  applyDemoChoice,
  buildDemoCardView,
  createDemoRuntime,
  drawDemoCard,
  startDemo,
  type DemoCardView,
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

/**
 * Test / alternate-content seam for the demo's card catalogue.
 *
 * The scene boots the shipped `DEMO_CARDS` by default. A browser test (or a
 * future alternate demo file) can install a factory that builds the runtime
 * from a different catalogue, which is how the "context absent" layout is
 * exercised with a real scene rather than asserted only on the view model.
 * Pass `null` to restore the shipped catalogue.
 */
let runtimeFactoryOverride: (() => DemoRuntime) | null = null;

/** Installs (or clears with `null`) the demo runtime factory override. */
export function setGymStorylineDemoRuntimeFactory(
  factory: (() => DemoRuntime) | null,
): void {
  runtimeFactoryOverride = factory;
}

/** Builds the runtime the scene plays (override first, shipped catalogue else). */
function createSceneRuntime(): DemoRuntime {
  return runtimeFactoryOverride !== null ? runtimeFactoryOverride() : createDemoRuntime();
}

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
  /**
   * The narrative panel: the beat's authored `context` (and, after a choice,
   * the chosen option's authored outcome above it). Empty when none is
   * authored, so the layout closes up with no reserved band.
   */
  private contextText!: Phaser.GameObjects.Text;
  private optionButtons: Phaser.GameObjects.Text[] = [];

  /** Y positions of the rendered option buttons (observable for layout tests). */
  private optionYs: number[] = [];

  /** Audio backend wrapper (null in a headless environment with no sound). */
  private soundManager: SoundManager | null = null;

  /** SFX keys the scene has played, oldest first (observable for tests). */
  private readonly playedSfxKeys: string[] = [];

  /** The in-flight consequence reveal, released before the panel is rewritten. */
  private revealHandle: NarrationRevealHandle | null = null;

  /**
   * The options' flow anchor. Options sit here when the beat authors no
   * context; when it does, they flow below the context panel instead of
   * leaving an empty band at the anchor.
   */
  private readonly optionStartY = SCENE_HEADER_Y + 210;

  /** Vertical spacing between option buttons (the existing flow rhythm). */
  private readonly optionRowSpacing = 70;

  create(): void {
    this.cameras.main.setBackgroundColor('#1a2a1a');
    this.initHeader('Storyline');
    this.addDivider();
    this.initReducedMotion();

    this.initHelp([
      {
        heading: 'What this demonstrates',
        body: 'The generic story-line system from `@story-line`: a drawn card presents an ordered set of compiled options, the player picks one, and the choice applies the card effect and pushes the next card onto the chain. It is game-agnostic — a thin engine adapter supplies state access and the default UI adapter supplies presentation. The narrative panel above the options shows the beat’s authored `context` paragraph, and a chosen option’s authored `#says` outcome is narrated into that panel through the shared reveal helper; a card without authored prose renders no panel and the layout closes up.',
      },
      {
        heading: 'Controls',
        body: 'Each option button is generated from the current card\'s compiled options and labelled with the option\'s own label. [ Reset ] restarts the demo from the first card.',
      },
      {
        heading: 'Test plan',
        body: '1. The Town Meeting card offers Invest / Ignore above its context paragraph; either choice applies Town Meeting\'s effect (-50 coins), narrates the option’s authored outcome and deals the matching successor.\n2. Invest deals Public Investment, which offers Celebrate / Double down; Celebrate applies +120 coins and deals the terminal New Beginning card.\n3. New Beginning has no options: drawing it applies its +60 reputation effect, shows its context and ends the chain.\n4. Double down (a terminal option) ends the chain immediately with no successor.\n5. Reset returns to the first card.',
      },
    ]);

    this.soundManager = this.createSoundManager();
    this.demo = createSceneRuntime();

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
    this.contextText = createHudText(this, cx, this.statusText.y, '', '#b9d8b9', {
      fontSize: '15px',
      lineSpacing: 4,
      align: 'center',
    })
      .setOrigin(0.5, 0)
      .setWordWrapWidth(GAME_W - 160)
      .setVisible(false);
    this.logText = createHudText(this, 60, SCENE_HEADER_Y + 360, '', '#88bb88', {
      fontSize: '15px',
      align: 'left',
    });

    this.renderResetButton();
    this.resetDemo();

    // A reveal in flight owns a timer and input listeners; release both when
    // the scene shuts down so a navigation away cannot leave them running.
    this.events.once('shutdown', () => this.destroyReveal());
  }

  /** Build the scene's `SoundManager` (null when there is no audio backend). */
  private createSoundManager(): SoundManager | null {
    if (!this.sound || typeof this.sound.play !== 'function') return null;
    const phaserSound = this.sound;
    const player: SoundPlayer = {
      play: (key: string) => {
        try { phaserSound.play(key); } catch (_) { /* ignore missing assets */ }
      },
      stop: (key: string) => {
        try { (phaserSound as unknown as { stopByKey?: (k: string) => void }).stopByKey?.(key); } catch (_) { /* ignore */ }
      },
      setVolume: (v: number) => {
        try { (phaserSound as unknown as { volume: number }).volume = v; } catch (_) { /* ignore */ }
      },
      setMute: (m: boolean) => {
        try { (phaserSound as unknown as { mute: boolean }).mute = m; } catch (_) { /* ignore */ }
      },
    };
    const manager = new SoundManager(player, { storage: null });
    manager.register(COMMON_SFX_KEYS.SCORE_REVEAL);
    manager.register(COMMON_SFX_KEYS.UI_CLICK);
    return manager;
  }

  /** Plays an SFX through the scene's manager and records it for the tests. */
  private playSfx(key: string): void {
    this.playedSfxKeys.push(key);
    this.soundManager?.play(key);
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
    this.destroyReveal();
    this.demo = createSceneRuntime();
    this.finished = false;
    this.pending = null;
    this.currentCard = null;
    this.clearOptionButtons();
    this.renderDraw(startDemo(this.demo));
  }

  private clearOptionButtons(): void {
    for (const button of this.optionButtons) button.destroy();
    this.optionButtons = [];
    this.optionYs = [];
  }

  /**
   * Draws a card and renders the pure decision's outcome: options for a
   * branching card, or the applied effect and a finished chain for a terminal
   * card. `outcomeProse` is the chosen option's authored consequence, narrated
   * above the successor beat's context.
   */
  private showCard(card: StorylineCard, outcomeProse: string | null = null): void {
    this.renderDraw(drawDemoCard(this.system, this.state, card), outcomeProse);
  }

  /** Renders the outcome of a pure draw (options, or a finished chain). */
  private renderDraw(draw: DemoDraw, outcomeProse: string | null = null): void {
    const card = draw.card;
    this.currentCard = card;
    this.pending = draw.pending;
    this.clearOptionButtons();

    this.titleText.setText(this.system.ui.choiceDialogTitle(card));
    this.subtitleText.setText(this.system.ui.choiceDialogSubtitle(card));
    this.cardText.setText(`${card.name} — ${card.effect ?? 'no effect'}`);

    const view = buildDemoCardView(card, draw.options);
    const optionsStartY = this.renderNarrative(view, outcomeProse, draw.options.length);

    if (!draw.finished) {
      this.renderOptions(draw.options, optionsStartY);
    } else {
      this.finished = true;
      this.statusText.setText('Chain complete — press Reset to play again.');
    }

    this.renderStatus();
  }

  /**
   * Renders the beat's authored context (and a chosen option's outcome) and
   * returns the flow position the options should start at.
   *
   * When the card authors no context the panel is hidden and the options stay
   * at their existing flow anchor — no empty band, no shifted options. When it
   * does, the options flow below the measured panel instead of a magic Y, and
   * the journal moves down only if the options would reach it.
   */
  private renderNarrative(
    view: DemoCardView,
    outcomeProse: string | null,
    optionCount: number,
  ): number {
    this.destroyReveal();

    const paragraphs = [outcomeProse, view.context].filter(
      (paragraph): paragraph is string => paragraph !== null && paragraph.trim() !== '',
    );
    const prose = paragraphs.join('\n\n');
    const hasProse = prose !== '';

    this.contextText.setText(prose);
    this.contextText.setVisible(hasProse);

    // Flow positions derive from the objects already on screen: the panel sits
    // just below the status line, the options below the measured panel, and
    // the journal below the last option only when it would otherwise collide.
    const contextTopY = this.statusText.y + this.statusText.height + 12;
    this.contextText.setY(contextTopY);

    const optionsStartY = hasProse
      ? contextTopY + this.contextText.height + 12
      : this.optionStartY;

    const journalAnchorY = SCENE_HEADER_Y + 360;
    const lastOptionY = optionsStartY + Math.max(optionCount - 1, 0) * this.optionRowSpacing;
    this.logText.setY(Math.max(journalAnchorY, lastOptionY + 40));

    if (outcomeProse !== null && outcomeProse.trim() !== '') {
      // The shared helper owns pacing, the `COMMON_SFX_KEYS` sound and the
      // reduced-motion instant path; the textual channel never waits on audio.
      this.revealHandle = revealNarration({
        scene: this,
        target: this.contextText,
        prose,
        reducedMotion: this.reducedMotion,
        soundManager: this.soundManager,
        onComplete: () => {
          this.revealHandle = null;
        },
      });
    }

    return optionsStartY;
  }

  /** Release the in-flight reveal (idempotent; leaves the text as it stands). */
  private destroyReveal(): void {
    this.revealHandle?.destroy();
    this.revealHandle = null;
  }

  /** Renders one button per compiled option, labelled from the option itself. */
  private renderOptions(
    options: StorylineOption<DemoState>[],
    startY: number,
  ): void {
    const cx = GAME_W / 2;
    options.forEach((option, index) => {
      const y = startY + index * this.optionRowSpacing;
      const text = createHudText(
        this,
        cx,
        y,
        `[ ${option.label} ]`,
        '#aaddff',
        { fontSize: '17px' },
      ).setOrigin(0.5);
      text.setInteractive({ useHandCursor: true });
      text.on('pointerdown', () => this.choose(option));
      this.optionButtons.push(text);
      this.optionYs.push(y);
    });
  }

  /** Resolves the chosen option, logs the story update and draws the successor. */
  private choose(option: StorylineOption<DemoState>): void {
    if (!this.pending || !this.currentCard || this.finished) return;
    this.playSfx(COMMON_SFX_KEYS.UI_CLICK);
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
      this.showCard(result.pushedCard, result.outcomeProse);
    } else {
      this.finished = true;
      this.renderNarrative(buildDemoCardView(card, []), result.outcomeProse, 0);
      this.renderStatus();
    }
  }

  // ── Observable surface (tests drive the scene through these) ──

  /** The narrative panel's current text (context and/or narrated outcome). */
  getNarrativeText(): string {
    return this.contextText.text;
  }

  /** Whether the narrative panel is on screen (false when no prose authored). */
  isNarrativeVisible(): boolean {
    return this.contextText.visible;
  }

  /** The option buttons' Y positions, in declaration order. */
  getOptionYs(): readonly number[] {
    return [...this.optionYs];
  }

  /** The option labels currently on screen, in declaration order. */
  getOptionLabels(): readonly string[] {
    return this.optionButtons.map((button) => button.text);
  }

  /** The flow anchor options use when the beat authors no context. */
  getOptionFlowAnchorY(): number {
    return this.optionStartY;
  }

  /** Complete the in-flight consequence reveal instantly (test/skip affordance). */
  completeNarration(): void {
    this.revealHandle?.complete();
  }

  /** SFX keys played so far (oldest first). */
  getPlayedSfxKeys(): readonly string[] {
    return [...this.playedSfxKeys];
  }

  /** Take a choice exactly as clicking its label would. */
  chooseByLabel(label: string): void {
    const option = this.pending
      ? this.system.getPendingStorylineOptions(this.pending, this.state).find(
          (candidate) => candidate.label === label,
        )
      : undefined;
    if (option) this.choose(option);
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
