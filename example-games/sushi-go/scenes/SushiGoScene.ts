/**
 * SushiGoScene -- the main Phaser scene for Sushi Go!
 *
 * Orchestrates the visual interface by delegating responsibilities to
 * composable helper classes:
 *   - SushiGoRenderer: board layout and UI creation
 *   - SushiGoOverlayManager: round score and game over overlays
 *   - TooltipManager (shared src/ui): card tooltip display
 *   - SushiGoReplayController: replay mode state injection
 */

import Phaser from 'phaser';
import type { SushiGoCard } from '../SushiGoCards';
import type { SushiGoSession, PickAction } from '../SushiGoGame';
import {
  setupSushiGoGame,
  executeAllPicks,
  scoreRound,
  isGameOver,
} from '../SushiGoGame';
import { SushiGoAiPlayer, GreedyStrategy } from '../AiStrategy';
import { SushiGoTranscriptRecorder } from '../GameTranscript';
import type { EventSoundMapping } from '../../../src/core-engine/SoundManager';
import {
  markSceneValid,
  markSceneInvalid,
  rasteriseSvgToTexture,
} from '../../../src/core-engine';
import {
  CardGameScene,
  GAME_W, GAME_H, FONT_FAMILY,
  dismissOverlay,
  PhaseManager,
  HandView,
  createSceneTitle,
  TooltipManager,
  audioPathWithFallback,
} from '../../../src/ui';
import type { HelpSection, TooltipRenderContext } from '../../../src/ui';
import helpContent from '../help-content.json';

import {
  SUSHI_ICON_FILES,
  HAND_Y, HAND_CARD_W, HAND_CARD_H, HAND_GAP,
  TABLEAU_CARD_W, TABLEAU_CARD_H,
  PLAYER_TABLEAU_Y, AI_TABLEAU_Y,
  SCORE_AREA_X, PLAYER_SCORE_Y, AI_SCORE_Y,
  SFX_KEYS,
  SCORING_TOOLTIPS,
  TOOLTIP_BG_COLOR, TOOLTIP_BG_ALPHA,
  TOOLTIP_PADDING, TOOLTIP_FONT_SIZE, TOOLTIP_MAX_WIDTH, TOOLTIP_DEPTH,
  TOOLTIP_Y_OFFSET, TOOLTIP_CLAMP_BOUNDARY, TOOLTIP_FLIP_THRESHOLD,
  HIGHLIGHT_PADDING,
  CHOPSTICKS_BUTTON_Y_OFFSET, CHOPSTICKS_BUTTON_FONT_SIZE,
  CHOPSTICKS_BUTTON_PADDING_X, CHOPSTICKS_BUTTON_PADDING_Y,
  CHOPSTICKS_BUTTON_BG, CHOPSTICKS_BUTTON_HOVER_BG,
  CHOPSTICKS_BUTTON_TEXT_COLOR, CHOPSTICKS_BUTTON_HOVER_TEXT_COLOR,
  CHOPSTICKS_BUTTON_ACTIVE_TEXT_COLOR, CHOPSTICKS_BUTTON_DEPTH,
  CHOPSTICKS_CANCEL_BG, CHOPSTICKS_CANCEL_HOVER_BG,
  CHOPSTICKS_CANCEL_TEXT_COLOR, CHOPSTICKS_CANCEL_HOVER_COLOR,
  CHOPSTICKS_CANCEL_Y_OFFSET, CHOPSTICKS_CANCEL_PADDING_X,
  CHOPSTICKS_CANCEL_PADDING_Y, CHOPSTICKS_CANCEL_DEPTH,
  CHOPSTICKS_CANCEL_FONT_SIZE,
  CHOPSTICKS_TABLEAU_ACTIVE_COLOR, CHOPSTICKS_TABLEAU_HIGHLIGHT_COLOR,
  CHOPSTICKS_TABLEAU_HIGHLIGHT_ALPHA, CHOPSTICKS_TABLEAU_HIGHLIGHT_PADDING,
  CHOPSTICKS_TABLEAU_HIGHLIGHT_STROKE,
  HIGHLIGHT_FIRST_PICK_COLOR, HIGHLIGHT_FIRST_PICK_STROKE_WIDTH,
  HIGHLIGHT_FIRST_PICK_FILL_ALPHA,
  STEP_INDICATOR_FONT_SIZE, STEP_INDICATOR_COLOR,
  STEP_INDICATOR_Y_OFFSET, STEP_INDICATOR_DEPTH,
  STEP_INDICATOR_1_OF_2, STEP_INDICATOR_2_OF_2,
  TURN_ANIMATION_DELAY,
  type TurnPhase,
} from './SushiGoConstants';
import { SushiGoRenderer } from './SushiGoRenderer';
import { SushiGoOverlayContent } from './SushiGoOverlayContent';
// TooltipManager imported from shared src/ui (SushiGoTooltipManager migrated)
import { SushiGoReplayController } from './SushiGoReplayController';
import { SushiGoCardFactory } from './SushiGoCardFactory';
import { SushiGoTableauRenderer } from './SushiGoTableauRenderer';

export class SushiGoScene extends CardGameScene {
  // Game state
  session!: SushiGoSession;
  aiPlayer!: SushiGoAiPlayer;
  phaseManager!: PhaseManager<TurnPhase>;
  pendingHumanPick: number | null = null;
  pendingHumanSecondPick: number | null = null;

  // Chopsticks mode state
  chopsticksMode = false;
  chopsticksFirstPick: number | null = null;
  chopsticksButton: Phaser.GameObjects.Text | null = null;
  chopsticksButtonBg: Phaser.GameObjects.Rectangle | null = null;
  chopsticksCancelButton: Phaser.GameObjects.Text | null = null;
  chopsticksCancelButtonBg: Phaser.GameObjects.Rectangle | null = null;
  stepIndicator: Phaser.GameObjects.Text | null = null;
  /** Reference to the first-pick highlight rectangle for cleanup. */
  firstPickHighlight: Phaser.GameObjects.Rectangle | null = null;

  // Transcript recording
  recorder: SushiGoTranscriptRecorder | null = null;

  /** Tracks the replay step index for state-settled payloads. */
  replayStepIndex: number = -1;

  // Display containers
  /** HandView for player's hand — replaces bespoke hand rendering with shared component. */
  handView!: HandView;
  /** 
   * Hand container (legacy — kept for backward-compat with zone-metadata tests).
   * Actual card rendering is managed by {@link handView}.
   */
  handContainer!: Phaser.GameObjects.Container;
  playerTableauContainer!: Phaser.GameObjects.Container;
  aiTableauContainer!: Phaser.GameObjects.Container;

  // UI text
  roundText!: Phaser.GameObjects.Text;
  turnText!: Phaser.GameObjects.Text;
  playerScoreText!: Phaser.GameObjects.Text;
  aiScoreText!: Phaser.GameObjects.Text;
  instructionText!: Phaser.GameObjects.Text;
  cardsLeftText!: Phaser.GameObjects.Text;

  // Tooltip
  tooltipContainer: Phaser.GameObjects.Container | null = null;

  // Overlay cleanup
  overlayObjects: Phaser.GameObjects.GameObject[] = [];

  // Helpers
  private goRenderer!: SushiGoRenderer;
  private overlayManager!: SushiGoOverlayContent;
  private tooltipManager!: TooltipManager;
  private replayController!: SushiGoReplayController;
  private cardFactory!: SushiGoCardFactory;
  private tableauRenderer!: SushiGoTableauRenderer;

  constructor() {
    super({ key: 'SushiGoScene' });
  }

  // ── Preload ─────────────────────────────────────────────

  preload(): void {
    const ns = 'sushi-go';
    const audioDir = 'sushi-go';
    this.load.audio(`${ns}:${SFX_KEYS.CARD_PICK}`, audioPathWithFallback(audioDir, 'card-draw.wav'));
    this.load.audio(`${ns}:${SFX_KEYS.CARD_FLIP}`, audioPathWithFallback(audioDir, 'card-flip.wav'));
    this.load.audio(`${ns}:${SFX_KEYS.TURN_CHANGE}`, audioPathWithFallback(audioDir, 'turn-change.wav'));
    this.load.audio(`${ns}:${SFX_KEYS.ROUND_END}`, audioPathWithFallback(audioDir, 'round-end.wav'));
    this.load.audio(`${ns}:${SFX_KEYS.SCORE_REVEAL}`, audioPathWithFallback(audioDir, 'score-reveal.wav'));
    this.load.audio(`${ns}:${SFX_KEYS.UI_CLICK}`, audioPathWithFallback(audioDir, 'ui-click.wav'));

    for (const filename of SUSHI_ICON_FILES) {
      const key = filename.replace(/\.svg$/, '');
      this.load.text(`svg:${key}`, `/assets/sushi-go/${filename}`);
    }
  }

  // ── Create ──────────────────────────────────────────────

  create(): void {
    this.cameras.main.setBackgroundColor('#1a2a3a');
    markSceneValid(this);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      markSceneInvalid(this);
    });
    this.events.once(Phaser.Scenes.Events.DESTROY, () => {
      markSceneInvalid(this);
    });

    this.phaseManager = new PhaseManager<TurnPhase>({
      initialPhase: 'picking',
      phaseTextMap: {
        picking: 'Click a card from your hand to pick it',
        animating: '',
        'ai-thinking': 'AI is thinking...',
        'round-scored': '',
        'game-over': '',
      },
      onPhaseChange: (phase) => {
        if (phase === 'picking') {
          if (this.chopsticksMode) {
            this.phaseManager.setPhaseText('picking', 'Pick 2 cards: click your 1st card');
          } else {
            this.phaseManager.setPhaseText('picking', 'Click a card from your hand to pick it');
          }
          this.refreshHand();
          this.refreshChopsticksButton();
          this.refreshChopsticksTableauHighlight();
        }
      },
    });
    this.pendingHumanPick = null;
    this.pendingHumanSecondPick = null;
    this.chopsticksMode = false;
    this.chopsticksFirstPick = null;
    this.chopsticksButton = null;
    this.chopsticksButtonBg = null;
    this.chopsticksCancelButton = null;
    this.chopsticksCancelButtonBg = null;
    this.stepIndicator = null;
    this.firstPickHighlight = null;
    this.overlayObjects = [];
    this.recorder = null;
    this.replayStepIndex = -1;

    super.create();

    if (this.replayMode) {
      this.createHeader();
      this.createLabels();
      this.createScoreDisplay();
      this.createInstructions();
      this.createContainers();
      this.roundText.setText('Round 1 of 3');
      this.turnText.setText('Turn 0 of 10');
      this.cardsLeftText.setText('');
      this.instructionText.setText('');
      this.emitStateSettled(this.replayStepIndex, 'playing');
      return;
    }

    const mapping: EventSoundMapping = {
      'card-drawn': SFX_KEYS.CARD_PICK,
      'turn-started': SFX_KEYS.TURN_CHANGE,
      'game-ended': SFX_KEYS.ROUND_END,
    };
    this.initSoundSystem(Object.values(SFX_KEYS), mapping, { namespace: 'sushi-go' });

    this.session = setupSushiGoGame({
      playerCount: 2,
      playerNames: ['You', 'AI'],
      isAI: [false, true],
    });
    this.aiPlayer = new SushiGoAiPlayer(GreedyStrategy);
    this.recorder = new SushiGoTranscriptRecorder(this.session);

    this.goRenderer = new SushiGoRenderer(this, this.session);
    this.overlayManager = new SushiGoOverlayContent(this, this.session, this.gameEvents, this.soundManager);
    this.tooltipManager = this.createTooltipManager();
    this.replayController = new SushiGoReplayController(this, { value: this.replayMode });
    this.cardFactory = new SushiGoCardFactory(this);
    this.tableauRenderer = new SushiGoTableauRenderer(this, this.session, this.cardFactory, this.goRenderer, this.tooltipManager);

    // Create HandView for player hand with custom card renderer
    this.handView = new HandView(this, {
      baseX: GAME_W / 2,
      baseY: HAND_Y,
      spacing: HAND_CARD_W + HAND_GAP,
      cardWidth: HAND_CARD_W,
      showLabels: false,
      selectionEnabled: false,
      clickEnabled: false,
      renderCard: (card, index) => {
        const sgCard = card as SushiGoCard;
        const isInteractive = this.phaseManager.current === 'picking';
        // createCardRect positions at (0,0) — HandView applies the layout position
        return this.createCardRect(0, 0, HAND_CARD_W, HAND_CARD_H, sgCard, isInteractive, index);
      },
    });

    this.createHeader();
    this.createLabels();
    this.createScoreDisplay();
    this.createInstructions();
    this.createContainers();
    this.initHelpPanel(helpContent as HelpSection[]);
    this.initSettingsPanel();

    void this.ensureIconTextures().finally(() => {
      this.refreshAll();
      this.phaseManager.setTextObject(this.instructionText);
      this.phaseManager.set('picking');
    });

    this.input.keyboard?.on('keydown-ESC', () => {
      if (this.chopsticksMode) {
        this.cancelChopsticksMode();
      }
    });
  }

  // ── UI creation ─────────────────────────────────────────

  private createHeader(): void {
    createSceneTitle(this, 'Sushi Go!');
  }

  private createLabels(): void {
    this.add.text(25, PLAYER_TABLEAU_Y - 50, 'Your Tableau', {
      fontSize: '18px',
      color: '#ffffff',
      fontFamily: FONT_FAMILY,
    });

    this.add.text(25, AI_TABLEAU_Y - 50, 'AI Tableau', {
      fontSize: '18px',
      color: '#cccccc',
      fontFamily: FONT_FAMILY,
    });
  }

  private createScoreDisplay(): void {
    this.roundText = this.add
      .text(GAME_W / 2, 51, '', {
        fontSize: '20px',
        color: '#ffdd44',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5);

    this.turnText = this.add
      .text(GAME_W / 2, 75, '', {
        fontSize: '16px',
        color: '#aaccaa',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5);

    this.cardsLeftText = this.add
      .text(GAME_W / 2, 95, '', {
        fontSize: '14px',
        color: '#889988',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5);

    this.playerScoreText = this.add
      .text(SCORE_AREA_X, PLAYER_SCORE_Y, 'Score: 0', {
        fontSize: '20px',
        color: '#ffffff',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(1, 0.5);

    this.aiScoreText = this.add
      .text(SCORE_AREA_X, AI_SCORE_Y, 'Score: 0', {
        fontSize: '20px',
        color: '#cccccc',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(1, 0.5);
  }

  private createInstructions(): void {
    this.instructionText = this.add
      .text(GAME_W / 2, GAME_H - 14, '', {
        fontSize: '15px',
        color: '#88aa88',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5);
  }

  private createContainers(): void {
    this.handContainer = this.add.container(0, 0);
    this.playerTableauContainer = this.add.container(0, 0);
    this.aiTableauContainer = this.add.container(0, 0);
  }

  private async ensureIconTextures(): Promise<void> {
    const rasterJobs: Promise<void>[] = [];

    for (const filename of SUSHI_ICON_FILES) {
      const iconKey = filename.replace(/\.svg$/, '');
      if (this.textures.exists(iconKey)) {
        continue;
      }

      const svgText = this.cache.text.get(`svg:${iconKey}`) as string | undefined;
      if (!svgText) {
        continue;
      }

      rasterJobs.push(rasteriseSvgToTexture(this, iconKey, svgText, 128, 128));
    }

    if (rasterJobs.length > 0) {
      await Promise.all(rasterJobs);
    }
  }

  // ── Card rendering helpers ──────────────────────────────

  private createCardRect(
    x: number,
    y: number,
    w: number,
    h: number,
    card: SushiGoCard,
    interactive: boolean = false,
    handIndex?: number,
  ): Phaser.GameObjects.Container {
    return this.cardFactory.createCardRect(
      x, y, w, h, card, interactive, handIndex,
      (idx) => this.onHandCardClick(idx),
      (c, container) => this.showCardTooltip(c, container),
      () => this.tooltipManager.hide(),
    );
  }

  // ── Tooltip ─────────────────────────────────────────────

  /** Create the shared TooltipManager with a Phaser render callback
   *  for in-canvas card-scoring tooltips. */
  private createTooltipManager(): TooltipManager {
    return new TooltipManager(this, this.settingsPanel, {
      phaserRender: (container, scene, _hideTooltip, ctx) => {
        // Use ctx.content when non-empty (tableau tooltips), otherwise fall back
        // to SCORING_TOOLTIPS[card.type] for hand card tooltips.
        const tooltipText = (() => {
          const provided = ctx.content as string | undefined;
          if (provided && provided.length > 0) return provided;
          const card = ctx.card as SushiGoCard | undefined;
          return card ? SCORING_TOOLTIPS[card.type] : '';
        })();
        if (!tooltipText) return container;

        const text = scene.add.text(0, 0, tooltipText, {
          fontSize: TOOLTIP_FONT_SIZE,
          color: '#ffffff',
          fontFamily: FONT_FAMILY,
          wordWrap: { width: TOOLTIP_MAX_WIDTH - TOOLTIP_PADDING * 2 },
        }).setOrigin(0, 0);

        const textW = text.width;
        const textH = text.height;
        const boxW = textW + TOOLTIP_PADDING * 2;
        const boxH = textH + TOOLTIP_PADDING * 2;

        let tooltipX = (ctx.x ?? 0) - boxW / 2;
        let tooltipY = (ctx.y ?? 0) + TOOLTIP_Y_OFFSET;

        tooltipX = Phaser.Math.Clamp(tooltipX, TOOLTIP_CLAMP_BOUNDARY, GAME_W - boxW - TOOLTIP_CLAMP_BOUNDARY);
        tooltipY = Phaser.Math.Clamp(tooltipY, TOOLTIP_CLAMP_BOUNDARY, GAME_H - boxH - TOOLTIP_CLAMP_BOUNDARY);

        if (tooltipY < (ctx.y ?? 0) + TOOLTIP_FLIP_THRESHOLD && tooltipY + boxH > (ctx.y ?? 0) - TOOLTIP_FLIP_THRESHOLD) {
          tooltipY = (ctx.y ?? 0) - TOOLTIP_Y_OFFSET - boxH;
          tooltipY = Phaser.Math.Clamp(tooltipY, TOOLTIP_CLAMP_BOUNDARY, GAME_H - boxH - TOOLTIP_CLAMP_BOUNDARY);
        }

        const bg = scene.add.rectangle(
          boxW / 2, boxH / 2,
          boxW, boxH,
          TOOLTIP_BG_COLOR, TOOLTIP_BG_ALPHA,
        );
        bg.setStrokeStyle(1, 0x888888);

        text.setPosition(TOOLTIP_PADDING, TOOLTIP_PADDING);

        container.add([bg, text]);
        container.setPosition(tooltipX, tooltipY);
        container.setDepth(TOOLTIP_DEPTH);
        return container;
      },
    });
  }

  /** Show a card-scoring tooltip via the shared TooltipManager. */
  private showCardTooltip(card: SushiGoCard, cardContainer: Phaser.GameObjects.Container): void {
    this.tooltipManager.show('', cardContainer.x, cardContainer.y, { card } as TooltipRenderContext);
  }

  // ── Refresh display ─────────────────────────────────────

  private refreshAll(): void {
    this.tooltipManager.hide();
    this.refreshHand();
    this.refreshTableau('player');
    this.refreshTableau('ai');
    this.refreshScores();
    this.refreshRoundInfo();
    this.refreshChopsticksButton();
    this.refreshChopsticksTableauHighlight();
  }

  private refreshHand(): void {
    // Clean up previous first-pick highlight
    this.destroyFirstPickHighlight();

    const hand = this.session.players[0].hand;
    if (hand.length === 0) {
      this.handView.setCards([]);
      return;
    }

    // Center the hand horizontally — baseX is the leftmost card X in HandView
    const handSize = hand.length;
    const spacing = HAND_CARD_W + HAND_GAP;
    const leftmostX = GAME_W / 2 - (handSize - 1) * spacing / 2;
    this.handView.setBaseX(leftmostX);

    // HandView manages layout and card creation via renderCard callback
    this.handView.setCards(hand as any);

    // Apply chopsticks highlight to the first picked card (if in chopsticks mode)
    if (this.chopsticksMode && this.chopsticksFirstPick !== null) {
      const sprite = this.handView.getSpriteAt(this.chopsticksFirstPick);
      if (sprite) {
        const container = sprite as Phaser.GameObjects.Container;
        this.firstPickHighlight = this.add.rectangle(
          0, 0,
          HAND_CARD_W + HIGHLIGHT_PADDING,
          HAND_CARD_H + HIGHLIGHT_PADDING,
        );
        this.firstPickHighlight.setStrokeStyle(
          HIGHLIGHT_FIRST_PICK_STROKE_WIDTH,
          HIGHLIGHT_FIRST_PICK_COLOR,
        );
        this.firstPickHighlight.setFillStyle(
          HIGHLIGHT_FIRST_PICK_COLOR,
          HIGHLIGHT_FIRST_PICK_FILL_ALPHA,
        );
        container.addAt(this.firstPickHighlight, 0);
      }
    }
  }

  private refreshTableau(who: 'player' | 'ai'): void {
    const container = who === 'player'
      ? this.playerTableauContainer
      : this.aiTableauContainer;
    this.tableauRenderer.refreshTableau(who, container);
  }

  private refreshScores(): void {
    const human = this.session.players[0];
    const ai = this.session.players[1];
    this.playerScoreText.setText(`Score: ${human.totalScore}`);
    this.aiScoreText.setText(`Score: ${ai.totalScore}`);
  }

  private refreshRoundInfo(): void {
    const round = this.session.currentRound + 1;
    const total = this.session.totalRounds;
    const turn = this.session.currentTurn + 1;
    const turnsTotal = this.session.cardsPerPlayer;
    const cardsInHand = this.session.players[0].hand.length;

    this.roundText.setText(`Round ${round} of ${total}`);
    this.turnText.setText(`Turn ${turn} of ${turnsTotal}`);
    this.cardsLeftText.setText(`${cardsInHand} cards in hand`);
  }

  // ── Human input ─────────────────────────────────────────

  private onHandCardClick(handIndex: number): void {
    if (this.phaseManager.current !== 'picking') return;

    if (this.chopsticksMode) {
      if (this.chopsticksFirstPick === null) {
        this.chopsticksFirstPick = handIndex;
        this.instructionText.setText('Pick 2 cards: click your 2nd card');
        this.showStepIndicator(2);
        this.showCancelButton();
        this.soundManager?.play(SFX_KEYS.CARD_PICK);
        this.refreshHand();
      } else {
        if (handIndex === this.chopsticksFirstPick) {
          return;
        }
        this.pendingHumanPick = this.chopsticksFirstPick;
        this.pendingHumanSecondPick = handIndex;
        this.soundManager?.play(SFX_KEYS.CARD_PICK);
        this.chopsticksMode = false;
        this.chopsticksFirstPick = null;
        this.hideStepIndicator();
        this.destroyCancelButton();
        this.destroyFirstPickHighlight();
        this.executeTurn();
      }
    } else {
      this.pendingHumanPick = handIndex;
      this.soundManager?.play(SFX_KEYS.CARD_PICK);
      this.executeTurn();
    }
  }

  // ── Chopsticks mode ─────────────────────────────────────

  private humanHasChopsticks(): boolean {
    return this.session.players[0].tableau.some(
      (c) => c.type === 'chopsticks',
    );
  }

  private refreshChopsticksButton(): void {
    // Clean up existing button
    if (this.chopsticksButton) {
      this.chopsticksButton.destroy();
      this.chopsticksButton = null;
    }
    if (this.chopsticksButtonBg) {
      this.chopsticksButtonBg.destroy();
      this.chopsticksButtonBg = null;
    }

    const shouldShow =
      this.phaseManager.current === 'picking' &&
      this.humanHasChopsticks() &&
      this.session.players[0].hand.length >= 2;

    if (!shouldShow) {
      if (this.chopsticksMode) {
        this.cancelChopsticksMode();
      }
      return;
    }

    const label = this.chopsticksMode ? '✕ Cancel' : 'Use Chopsticks';
    const textColor = this.chopsticksMode ? CHOPSTICKS_BUTTON_ACTIVE_TEXT_COLOR : CHOPSTICKS_BUTTON_TEXT_COLOR;
    const bgColor = this.chopsticksMode ? CHOPSTICKS_CANCEL_BG : CHOPSTICKS_BUTTON_BG;

    const btnX = GAME_W / 2;
    const btnY = HAND_Y - HAND_CARD_H / 2 - CHOPSTICKS_BUTTON_Y_OFFSET;

    // Background rectangle
    this.chopsticksButtonBg = this.add.rectangle(btnX, btnY, 0, 0, bgColor)
      .setDepth(CHOPSTICKS_BUTTON_DEPTH);

    // Button text
    this.chopsticksButton = this.add
      .text(btnX, btnY, label, {
        fontSize: CHOPSTICKS_BUTTON_FONT_SIZE,
        color: textColor,
        fontFamily: FONT_FAMILY,
        padding: { x: CHOPSTICKS_BUTTON_PADDING_X, y: CHOPSTICKS_BUTTON_PADDING_Y },
      })
      .setOrigin(0.5)
      .setDepth(CHOPSTICKS_BUTTON_DEPTH + 1)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        this.soundManager?.play(SFX_KEYS.UI_CLICK);
        if (this.chopsticksMode) {
          this.cancelChopsticksMode();
        } else {
          this.enterChopsticksMode();
        }
      })
      .on('pointerover', () => {
        this.chopsticksButton?.setStyle({ color: CHOPSTICKS_BUTTON_HOVER_TEXT_COLOR });
        if (this.chopsticksButtonBg) {
          this.chopsticksButtonBg.setFillStyle(CHOPSTICKS_BUTTON_HOVER_BG);
        }
      })
      .on('pointerout', () => {
        this.chopsticksButton?.setStyle({ color: textColor });
        if (this.chopsticksButtonBg) {
          this.chopsticksButtonBg.setFillStyle(bgColor);
        }
      });

    // Size the background to match the text
    this.updateButtonBgSize();
  }

  private updateButtonBgSize(): void {
    if (!this.chopsticksButton || !this.chopsticksButtonBg) return;
    const w = this.chopsticksButton.width + CHOPSTICKS_BUTTON_PADDING_X * 2;
    const h = this.chopsticksButton.height + CHOPSTICKS_BUTTON_PADDING_Y * 2;
    this.chopsticksButtonBg.setSize(w, h);
  }

  private enterChopsticksMode(): void {
    this.chopsticksMode = true;
    this.chopsticksFirstPick = null;
    this.instructionText.setText('Pick 2 cards: click your 1st card');
    this.showStepIndicator(1);
    this.refreshHand();
    this.refreshChopsticksButton();
  }

  private cancelChopsticksMode(): void {
    this.chopsticksMode = false;
    this.chopsticksFirstPick = null;
    this.instructionText.setText('Click a card from your hand to pick it');
    this.hideStepIndicator();
    this.destroyCancelButton();
    this.destroyFirstPickHighlight();
    this.refreshHand();
    this.refreshChopsticksButton();
  }

  // ── Cancel button (shown during chopsticks mode) ────────

  private showCancelButton(): void {
    this.destroyCancelButton();

    const btnX = GAME_W / 2;
    const btnY = HAND_Y + CHOPSTICKS_CANCEL_Y_OFFSET;

    this.chopsticksCancelButtonBg = this.add.rectangle(btnX, btnY, 0, 0, CHOPSTICKS_CANCEL_BG)
      .setDepth(CHOPSTICKS_CANCEL_DEPTH);

    this.chopsticksCancelButton = this.add
      .text(btnX, btnY, '✕ Cancel', {
        fontSize: CHOPSTICKS_CANCEL_FONT_SIZE,
        color: CHOPSTICKS_CANCEL_TEXT_COLOR,
        fontFamily: FONT_FAMILY,
        padding: { x: CHOPSTICKS_CANCEL_PADDING_X, y: CHOPSTICKS_CANCEL_PADDING_Y },
      })
      .setOrigin(0.5)
      .setDepth(CHOPSTICKS_CANCEL_DEPTH + 1)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        this.soundManager?.play(SFX_KEYS.UI_CLICK);
        this.cancelChopsticksMode();
      })
      .on('pointerover', () => {
        this.chopsticksCancelButton?.setStyle({ color: CHOPSTICKS_CANCEL_HOVER_COLOR });
        if (this.chopsticksCancelButtonBg) {
          this.chopsticksCancelButtonBg.setFillStyle(CHOPSTICKS_CANCEL_HOVER_BG);
        }
      })
      .on('pointerout', () => {
        this.chopsticksCancelButton?.setStyle({ color: CHOPSTICKS_CANCEL_TEXT_COLOR });
        if (this.chopsticksCancelButtonBg) {
          this.chopsticksCancelButtonBg.setFillStyle(CHOPSTICKS_CANCEL_BG);
        }
      });

    // Size bg to text
    if (this.chopsticksCancelButton && this.chopsticksCancelButtonBg) {
      const w = this.chopsticksCancelButton.width + CHOPSTICKS_CANCEL_PADDING_X * 2;
      const h = this.chopsticksCancelButton.height + CHOPSTICKS_CANCEL_PADDING_Y * 2;
      this.chopsticksCancelButtonBg.setSize(w, h);
    }
  }

  private destroyCancelButton(): void {
    if (this.chopsticksCancelButton) {
      this.chopsticksCancelButton.destroy();
      this.chopsticksCancelButton = null;
    }
    if (this.chopsticksCancelButtonBg) {
      this.chopsticksCancelButtonBg.destroy();
      this.chopsticksCancelButtonBg = null;
    }
  }

  // ── Step indicator ──────────────────────────────────────

  private showStepIndicator(step: 1 | 2): void {
    this.hideStepIndicator();

    const text = step === 1 ? STEP_INDICATOR_1_OF_2 : STEP_INDICATOR_2_OF_2;
    const btnY = HAND_Y - HAND_CARD_H / 2 - CHOPSTICKS_BUTTON_Y_OFFSET + STEP_INDICATOR_Y_OFFSET;

    this.stepIndicator = this.add
      .text(GAME_W / 2, btnY, text, {
        fontSize: STEP_INDICATOR_FONT_SIZE,
        color: STEP_INDICATOR_COLOR,
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5)
      .setDepth(STEP_INDICATOR_DEPTH);
  }

  private hideStepIndicator(): void {
    if (this.stepIndicator) {
      this.stepIndicator.destroy();
      this.stepIndicator = null;
    }
  }

  // ── First pick highlight cleanup ────────────────────────

  private destroyFirstPickHighlight(): void {
    if (this.firstPickHighlight) {
      this.firstPickHighlight.destroy();
      this.firstPickHighlight = null;
    }
  }

  // ── Chopsticks tableau highlight ────────────────────────

  /** Add a highlight to chopsticks cards in the player's tableau. */
  private refreshChopsticksTableauHighlight(): void {
    // Remove existing chopsticks highlights from tableau
    this.removeTableauHighlights();

    const shouldHighlight =
      this.phaseManager.current === 'picking' &&
      this.humanHasChopsticks() &&
      this.session.players[0].hand.length >= 2;

    if (!shouldHighlight) return;

    const highlightColor = this.chopsticksMode
      ? CHOPSTICKS_TABLEAU_ACTIVE_COLOR
      : CHOPSTICKS_TABLEAU_HIGHLIGHT_COLOR;

    // Find chopsticks card containers in the player's tableau
    const children = this.playerTableauContainer.getAll();
    for (const child of children) {
      if (!(child instanceof Phaser.GameObjects.Container)) continue;
      const cardId = child.getData('cardId');
      if (cardId === undefined) continue;

      // Check if this card is a chopsticks card
      const isChopsticks = this.session.players[0].tableau.some(
        (c) => c.id === cardId && c.type === 'chopsticks',
      );
      if (!isChopsticks) continue;

      // Add highlight rectangle
      const highlight = this.add.rectangle(
        0, 0,
        TABLEAU_CARD_W + CHOPSTICKS_TABLEAU_HIGHLIGHT_PADDING * 2,
        TABLEAU_CARD_H + CHOPSTICKS_TABLEAU_HIGHLIGHT_PADDING * 2,
      );
      highlight.setStrokeStyle(
        CHOPSTICKS_TABLEAU_HIGHLIGHT_STROKE,
        highlightColor,
      );
      highlight.setFillStyle(highlightColor, CHOPSTICKS_TABLEAU_HIGHLIGHT_ALPHA);
      child.addAt(highlight, 0);
    }
  }

  /** Remove chopsticks highlight rectangles from the player tableau. */
  private removeTableauHighlights(): void {
    const children = this.playerTableauContainer.getAll();
    for (const child of children) {
      if (!(child instanceof Phaser.GameObjects.Container)) continue;
      // Remove any highlight rectangles (identified by stroke style + fill)
      // Phaser rectangles don't have a custom tag, so we search by type and
      // look for rectangles that were added at index 0 (our highlights)
      const toRemove: Phaser.GameObjects.Rectangle[] = [];
      const grandChildren = child.getAll();
      for (const gc of grandChildren) {
        if (gc instanceof Phaser.GameObjects.Rectangle) {
          toRemove.push(gc);
        }
      }
      for (const r of toRemove) {
        r.destroy();
      }
    }
  }

  // ── Turn execution ──────────────────────────────────────

  private executeTurn(): void {
    if (this.pendingHumanPick === null) return;

    this.phaseManager.set('animating');

    const humanPick: PickAction = { cardIndex: this.pendingHumanPick };
    if (this.pendingHumanSecondPick !== null) {
      humanPick.secondCardIndex = this.pendingHumanSecondPick;
    }

    const aiPick = this.aiPlayer.choosePick(this.session.players[1]);
    executeAllPicks(this.session, [humanPick, aiPick]);

    this.recorder?.recordTurn([humanPick, aiPick]);

    this.pendingHumanPick = null;
    this.pendingHumanSecondPick = null;

    this.time.delayedCall(TURN_ANIMATION_DELAY, () => {
      this.refreshAll();

      if (this.session.phase === 'round-scoring') {
        this.handleRoundScoring();
      } else {
        this.gameEvents.emit('turn-started', {
          turnNumber: this.session.currentTurn,
          playerIndex: 0,
          playerName: 'You',
          isAI: false,
        });
        this.phaseManager.set('picking');
      }
    });
  }

  // ── Round scoring ───────────────────────────────────────

  private handleRoundScoring(): void {
    this.soundManager?.play(SFX_KEYS.ROUND_END);

    const result = scoreRound(this.session);
    this.recorder?.recordRoundResult(result);
    this.refreshScores();

    if (isGameOver(this.session)) {
      this.overlayManager.showGameOverOverlay(result, this.recorder, () => {
        this.scene.restart();
      });
      this.phaseManager.set('game-over');
      this.overlayObjects = this.overlayManager.overlayObjects;
    } else {
      this.overlayManager.showRoundScoreOverlay(result, () => {
        this.refreshAll();
        this.phaseManager.set('picking');
      });
      this.phaseManager.set('round-scored');
      this.overlayObjects = this.overlayManager.overlayObjects;
    }
  }

  // ── Replay: load board state ─────────────────────────────

  loadBoardState(state: {
    players: import('../GameTranscript').PlayerSnapshot[];
    currentRound: number;
    currentTurn: number;
    cardsPerPlayer: number;
    stepIndex?: number;
  }): void {
    this.session = this.replayController.loadBoardState(state);
    this.refreshAll();
  }

  // ── Cleanup ─────────────────────────────────────────────

  shutdown(): void {
    this.tooltipManager.destroy();
    if (this.handView) {
      this.handView.destroy();
    }
    if (this.chopsticksButton) {
      this.chopsticksButton.destroy();
      this.chopsticksButton = null;
    }
    if (this.chopsticksButtonBg) {
      this.chopsticksButtonBg.destroy();
      this.chopsticksButtonBg = null;
    }
    if (this.chopsticksCancelButton) {
      this.chopsticksCancelButton.destroy();
      this.chopsticksCancelButton = null;
    }
    if (this.chopsticksCancelButtonBg) {
      this.chopsticksCancelButtonBg.destroy();
      this.chopsticksCancelButtonBg = null;
    }
    if (this.stepIndicator) {
      this.stepIndicator.destroy();
      this.stepIndicator = null;
    }
    this.destroyFirstPickHighlight();
    dismissOverlay(this.overlayObjects);
    this.overlayObjects = [];
    this.shutdownBase();
  }
}
