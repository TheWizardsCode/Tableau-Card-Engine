/**
 * TheMindScene -- the main Phaser scene for The Mind.
 *
 * Orchestrates the visual interface by delegating responsibilities to
 * composable helper classes:
 *   - MindRenderer: board layout and sprite refresh
 *   - MindAnimator: card animations and visual effects
 *   - MindAiScheduler: AI turn scheduling and auto-play spectator mode
 *   - MindOverlayManager: win/loss overlays
 *   - MindReplayController: replay mode state injection
 *   - MindTurnController: card play logic, level lifecycle, and game over
 */

import type { MindCard } from '../MindCard';
import type { PlayResult, TheMindSession } from '../TheMindGameState';
import {
  setupTheMindGame,
  isGameOver,
  MAX_LEVEL,
} from '../TheMindGameState';
import { MindAiPlayer } from '../AiStrategy';
import {
  preloadMindCardAssets,
} from '../MindCardRenderer';
import { MindTranscriptRecorder } from '../GameTranscript';
import type { EventSoundMapping } from '../../../src/core-engine/SoundManager';
import {
  CardGameScene,
  OverlayManager,
  createSceneHeader,
  createParameterizedOverlay,
  overlayCenterY,
  audioPathWithFallback,
} from '../../../src/ui';
import type { HelpSection } from '../../../src/ui';
import helpContent from '../help-content.json';

import {
  PRE_PENALTY_PAUSE,
  DEPTH_OVERLAY,
  DEPTH_OVERLAY_CONTENT,
  DEPTH_UI,
  OVERLAY_BG_ALPHA,
  OVERLAY_BOX_WIDTH,
  OVERLAY_BOX_HEIGHT,
  OVERLAY_BOX_ALPHA,
  OVERLAY_BUTTON_FONT_SIZE,
  OVERLAY_BUTTON_Y_OFFSET,
  OVERLAY_BUTTON_SPACING,
  AUTO_PLAY_BUTTON_X,
  AUTO_PLAY_BUTTON_MARGIN,
  AUTO_PLAY_FONT_SIZE,
  type GamePhase,
} from './MindConstants';
import { SFX_KEYS } from './MindAudioKeys';
import { MindRenderer } from './MindRenderer';
import { MindAnimator } from './MindAnimator';
import { MindAiScheduler } from './MindAiScheduler';

import { MindReplayController } from './MindReplayController';
import { MindTurnController } from './MindTurnController';

import { GAME_W, GAME_H } from '../../../src/ui';

export class TheMindScene extends CardGameScene {
  // Game state (accessed by tests)
  session!: TheMindSession;
  recorder!: MindTranscriptRecorder;
  phase: GamePhase = 'dealing';
  turnCounter = 0;
  replayStepIndex = 0;

  // AI scheduling (accessed by tests indirectly)
  aiPlayer!: MindAiPlayer;

  // Auto-play spectator mode
  autoPlayEnabled = false;
  autoPlayButton!: Phaser.GameObjects.Text;

  // Display objects -- human hand (accessed by tests)
  humanCardSprites: Phaser.GameObjects.Image[] = [];

  // Display objects -- AI hand (accessed by tests)
  aiCardSprites: Phaser.GameObjects.Image[] = [];
  aiCountText: Phaser.GameObjects.Text | null = null;

  // Display objects -- pile (accessed by tests)
  pileSprite!: Phaser.GameObjects.Image;
  pileCountText!: Phaser.GameObjects.Text;
  pileValueText!: Phaser.GameObjects.Text;

  // Display objects -- UI (accessed by tests)
  levelText!: Phaser.GameObjects.Text;
  livesText!: Phaser.GameObjects.Text;
  instructionText!: Phaser.GameObjects.Text;

  // Overlay tracking
  overlayObjects: Phaser.GameObjects.GameObject[] = [];

  private overlayManager!: OverlayManager;

  // Helpers
  private mindRenderer!: MindRenderer;
  private mindAnimator!: MindAnimator;
  private aiScheduler!: MindAiScheduler;
  private replayController!: MindReplayController;
  private turnController!: MindTurnController;

  constructor() {
    super({ key: 'TheMindScene' });
  }

  // ── Preload ─────────────────────────────────────────────

  preload(): void {
    preloadMindCardAssets(this, 120, 164);

    const ns = 'the-mind';
    const audioDir = 'the-mind';
    this.load.audio(`${ns}:${SFX_KEYS.CARD_PLAY}`, audioPathWithFallback(audioDir, 'card-play.wav'));
    this.load.audio(`${ns}:${SFX_KEYS.LIFE_LOST}`, audioPathWithFallback(audioDir, 'life-lost.wav'));
    this.load.audio(`${ns}:${SFX_KEYS.LEVEL_COMPLETE}`, audioPathWithFallback(audioDir, 'level-complete.wav'));
    this.load.audio(`${ns}:${SFX_KEYS.GAME_WIN}`, audioPathWithFallback(audioDir, 'game-win.wav'));
    this.load.audio(`${ns}:${SFX_KEYS.GAME_LOST}`, audioPathWithFallback(audioDir, 'game-lost.wav'));
    this.load.audio(`${ns}:${SFX_KEYS.UI_CLICK}`, audioPathWithFallback(audioDir, 'ui-click.wav'));
  }

  // ── Create ──────────────────────────────────────────────

  create(): void {
    this.cameras.main.setBackgroundColor('#1a1a2e');
    this.events.on('shutdown', this.shutdown, this);

    this.resetSceneState();
    this.detectReplayMode();
    this.initEventSystem();

    if (this.replayMode) {
      this.createReplayView();
      return;
    }

    this.createSoundSystem();
    this.initHUDContainer();
    this.initializeGameControllers();
    this.createPrimaryView();
    this.renderInitialState();
    this.startLevel();
  }

  private resetSceneState(): void {
    this.phase = 'dealing';
    this.humanCardSprites = [];
    this.aiCardSprites = [];
    this.overlayObjects = [];
    this.overlayManager = new OverlayManager(this);
    this.turnCounter = 0;
    this.replayStepIndex = 0;
    this.aiCountText = null;

    const urlParams = new URLSearchParams(window.location.search);
    this.autoPlayEnabled = urlParams.get('autoplay') === 'true';
  }

  private createReplayView(): void {
    this.createHeader();
    this.createStatusDisplay();
    // In replay mode, the replay controller handles rendering; skip shared view init.
    this.createPile();
    this.createInstruction();
    this.instructionText.setText('');
    this.levelText.setText('Level 1 / 8');
    this.livesText.setText('Lives: \u2764\u2764');
    this.emitStateSettled(0, 'playing');
  }

  private initializeGameControllers(): void {
    this.session = setupTheMindGame();
    this.aiPlayer = new MindAiPlayer();
    this.recorder = this.createRecorder();

    this.mindRenderer = new MindRenderer(this, this.session);
    this.mindAnimator = new MindAnimator(this, this.session, this.mindRenderer, this.soundManager);
    this.aiScheduler = new MindAiScheduler(this, this.session);

    this.replayController = new MindReplayController(this, this.mindRenderer, { value: this.replayMode });
    this.turnController = new MindTurnController(this.session, this.recorder, this.gameEvents, this.soundManager);
    this.aiScheduler.autoPlayEnabled = this.autoPlayEnabled;
  }

  private createPrimaryView(): void {
    this.mindRenderer.createHeader();
    this.mindRenderer.createStatusDisplay();
    this.mindRenderer.createHands();
    this.mindRenderer.createPile();
    this.mindRenderer.createInstruction();
    this.createAutoPlayButton();
    this.initHelpPanel(helpContent as HelpSection[]);
    this.bindRendererObjects();
  }

  private bindRendererObjects(): void {
    this.humanCardSprites = this.mindRenderer.humanCardSprites;
    this.aiCardSprites = this.mindRenderer.aiCardSprites;
    this.aiCountText = this.mindRenderer.aiCountText;
    this.pileSprite = this.mindRenderer.pileSprite;
    this.pileCountText = this.mindRenderer.pileCountText;
    this.pileValueText = this.mindRenderer.pileValueText;
    this.levelText = this.mindRenderer.levelText;
    this.livesText = this.mindRenderer.livesText;
    this.instructionText = this.mindRenderer.instructionText;
  }

  private renderInitialState(): void {
    this.mindRenderer.renderHumanHand(
      (card) => this.onHumanCardClick(card),
      this.phase,
      this.autoPlayEnabled,
    );
    this.mindRenderer.renderAiHand();
    this.mindRenderer.refreshStatus();
    this.mindRenderer.refreshPile();
  }

  // ── Header & Status ────────────────────────────────────

  private createHeader(): void {
    createSceneHeader(this, 'The Mind');
  }

  private createStatusDisplay(): void {
    this.mindRenderer.createStatusDisplay();
  }

  private createPile(): void {
    this.mindRenderer.createPile();
  }

  private createInstruction(): void {
    this.mindRenderer.createInstruction();
  }

  // ── Sound system ────────────────────────────────────────

  private createSoundSystem(): void {
    const mapping: EventSoundMapping = {
      'game-ended': SFX_KEYS.UI_CLICK,
    };
    this.initSoundSystem(Object.values(SFX_KEYS), mapping, { namespace: 'the-mind' });
    this.initSettingsPanel();
  }

  // ── Auto-play spectator mode ───────────────────────────

  private createAutoPlayButton(): void {
    const label = this.autoPlayEnabled ? '[ Auto-Play: ON ]' : '[ Auto-Play: OFF ]';
    this.autoPlayButton = this.add
      .text(AUTO_PLAY_BUTTON_X, this.scale.height - AUTO_PLAY_BUTTON_MARGIN, label, {
        fontSize: AUTO_PLAY_FONT_SIZE,
        color: this.autoPlayEnabled ? '#88ff88' : '#888888',
        fontFamily: 'sans-serif',
      })
      .setOrigin(0, 1)
      .setDepth(DEPTH_UI)
      .setInteractive({ useHandCursor: true });

    this.autoPlayButton.on('pointerdown', () => this.toggleAutoPlay());
    this.autoPlayButton.on('pointerover', () =>
      this.autoPlayButton.setColor('#ffffff'),
    );
    this.autoPlayButton.on('pointerout', () =>
      this.autoPlayButton.setColor(
        this.autoPlayEnabled ? '#88ff88' : '#888888',
      ),
    );
  }

  private toggleAutoPlay(): void {
    this.autoPlayEnabled = this.aiScheduler.toggleAutoPlay(
      this.autoPlayEnabled,
      (enabled) => {
        this.soundManager?.play(SFX_KEYS.UI_CLICK);
        this.autoPlayButton.setText(
          enabled ? '[ Auto-Play: ON ]' : '[ Auto-Play: OFF ]',
        );
        this.autoPlayButton.setColor(
          enabled ? '#88ff88' : '#888888',
        );
        if (enabled) {
          this.instructionText.setText('Spectator mode — watching AI play');
          if (this.phase === 'playing') {
            this.aiScheduler.scheduleHumanAiPlay(this.phase, (v) => this.performPlay(0, v));
          }
        } else {
          this.instructionText.setText('Click a card to play it onto the pile');
        }
      },
    );

    this.gameEvents.emit('ui-interaction', {
      elementId: 'auto-play-toggle',
      action: this.autoPlayEnabled ? 'enabled' : 'disabled',
    });
  }

  // ── Status refresh ─────────────────────────────────────

  // ── Level lifecycle ────────────────────────────────────

  private startLevel(): void {
    this.turnController.levelStartTime = Date.now();
    this.aiScheduler.startLevel();
    this.setPhase('playing');
    this.aiScheduler.scheduleAiPlay(this.phase, (v) => this.performPlay(1, v));
    if (this.autoPlayEnabled) {
      this.aiScheduler.scheduleHumanAiPlay(this.phase, (v) => this.performPlay(0, v));
    }
  }

  private setPhase(phase: GamePhase): void {
    this.phase = phase;

    switch (phase) {
      case 'playing':
        this.instructionText.setText(
          this.autoPlayEnabled
            ? 'Spectator mode \u2014 watching AI play'
            : 'Click a card to play it onto the pile',
        );
        break;
      case 'animating':
        this.instructionText.setText('');
        break;
      case 'penalty':
        this.instructionText.setText('Penalty! A life was lost...');
        break;
      default:
        this.instructionText.setText('');
    }
  }

  // ── Human input ────────────────────────────────────────

  private onHumanCardClick(card: MindCard): void {
    if (this.phase !== 'playing') return;
    if (this.autoPlayEnabled) return;

    this.performPlay(0, card.value);
  }

  // ── Card play logic ────────────────────────────────────

  private performPlay(playerId: 0 | 1, cardValue: number): void {
    this.turnController.performPlay(
      playerId,
      cardValue,
      this.aiScheduler,
      (pid, val, onComplete) => this.mindAnimator.animateCardTowardsPile(pid, val, onComplete),
      (result) => this.handlePenalty(result),
      (result) => this.handleNormalPlay(result),
      (val) => this.mindAnimator.showInvalidPlayFeedback(val),
    );
  }

  private handlePenalty(result: PlayResult): void {
    this.setPhase('penalty');
    this.mindRenderer.refreshPile();
    this.mindRenderer.refreshStatus();
    this.mindRenderer.flashLives();

    this.time.delayedCall(PRE_PENALTY_PAUSE, () => {
      this.mindAnimator.showPenaltyCards(result, () => {
        this.mindRenderer.refreshAll();

        if (isGameOver(this.session)) {
          this.handleGameOver();
          return;
        }

        if (result.levelComplete) {
          this.handleLevelComplete(result);
          return;
        }

        this.setPhase('playing');
        this.aiScheduler.scheduleAiPlay(this.phase, (v) => this.performPlay(1, v));
        if (this.autoPlayEnabled) {
          this.aiScheduler.scheduleHumanAiPlay(this.phase, (v) => this.performPlay(0, v));
        }
      });
    });
  }

  private handleNormalPlay(result: PlayResult): void {
    this.mindRenderer.refreshAll();

    if (result.levelComplete) {
      this.handleLevelComplete(result);
      return;
    }

    this.setPhase('playing');
    this.aiScheduler.rescheduleAiIfNeeded(this.phase, (v) => this.performPlay(1, v));
    this.aiScheduler.rescheduleHumanAiIfNeeded(this.phase, (v) => this.performPlay(0, v));
  }

  // ── Level completion ───────────────────────────────────

  private handleLevelComplete(result: PlayResult): void {
    this.aiScheduler.cancelAllTimers();

    this.turnController.handleLevelComplete(
      result,
      () => this.mindRenderer.refreshAll(),
      () => {
        this.mindRenderer.renderHumanHand(
          (card) => this.onHumanCardClick(card),
          this.phase,
          this.autoPlayEnabled,
        );
        this.mindRenderer.renderAiHand();
        this.mindRenderer.refreshStatus();
        this.mindRenderer.refreshPile();
        this.startLevel();
      },
      (completedLevel, bonusLifeAwarded, onComplete) => {
        this.setPhase('level-complete');
        this.mindAnimator.showLevelCompleteText(completedLevel, bonusLifeAwarded, onComplete);
      },
    );

    if (isGameOver(this.session) && this.session.outcome === 'win') {
      this.handleGameOver();
    }
  }

  // ── Game over ──────────────────────────────────────────

  handleGameOver(): void {
    this.aiScheduler.cancelAllTimers();
    this.mindRenderer.disableGameInteraction(this.autoPlayButton);

    this.turnController.handleGameOver(
      () => {
        this.setPhase('game-won');
        this.showWinOverlay();
      },
      () => {
        this.setPhase('game-lost');
        this.showLossOverlay();
      },
    );
  }

  // ── Overlay helpers ────────────────────────────────────

  private showWinOverlay(): void {
    this.soundManager?.play(SFX_KEYS.GAME_WIN);
    this.showOutcomeOverlay({
      title: 'You Win!',
      titleColor: '#88ff88',
      detailText: `Completed all ${MAX_LEVEL} levels!\nLives remaining: ${'❤'.repeat(this.session.lives)}`,
      primaryButtonLabel: '[ Play Again ]',
      primaryButtonEvent: 'play-again',
    });
  }

  private showLossOverlay(): void {
    this.soundManager?.play(SFX_KEYS.GAME_LOST);
    this.showOutcomeOverlay({
      title: 'Game Over',
      titleColor: '#ff6666',
      detailText: `Reached Level ${this.session.currentLevel} of ${MAX_LEVEL}\nRan out of lives!`,
      primaryButtonLabel: '[ Try Again ]',
      primaryButtonEvent: 'try-again',
    });
  }

  private showOutcomeOverlay(config: {
    title: string;
    titleColor: string;
    detailText: string;
    primaryButtonLabel: string;
    primaryButtonEvent: string;
  }): void {
    this.overlayManager.dismiss();

    const result = createParameterizedOverlay(this, {
      title: config.title,
      titleColor: config.titleColor,
      detailText: config.detailText,
      titleY: overlayCenterY(-60),
      detailY: overlayCenterY(-15),
      titleDepth: DEPTH_OVERLAY_CONTENT,
      detailDepth: DEPTH_OVERLAY_CONTENT,
      background: { depth: DEPTH_OVERLAY, alpha: OVERLAY_BG_ALPHA },
      box: { width: OVERLAY_BOX_WIDTH, height: OVERLAY_BOX_HEIGHT, alpha: OVERLAY_BOX_ALPHA },
      buttons: [
        {
          label: config.primaryButtonLabel,
          x: GAME_W / 2 - OVERLAY_BUTTON_SPACING,
          y: GAME_H / 2 + OVERLAY_BUTTON_Y_OFFSET,
          config: { fontSize: OVERLAY_BUTTON_FONT_SIZE },
          onClick: () => {
            this.soundManager?.play(SFX_KEYS.UI_CLICK);
            this.gameEvents.emit('ui-interaction', {
              elementId: config.primaryButtonEvent,
              action: 'click',
            });
            this.time.delayedCall(0, () => this.scene.restart());
          },
        },
        {
          label: '[ Menu ]',
          x: GAME_W / 2 + OVERLAY_BUTTON_SPACING,
          y: GAME_H / 2 + OVERLAY_BUTTON_Y_OFFSET,
          config: { fontSize: OVERLAY_BUTTON_FONT_SIZE },
          onClick: () => {
            this.soundManager?.play(SFX_KEYS.UI_CLICK);
            this.gameEvents.emit('ui-interaction', {
              elementId: 'menu',
              action: 'click',
            });
            this.time.delayedCall(0, () =>
              this.scene.start('GameSelectorScene'),
            );
          },
        },
      ],
    });

    this.overlayManager.add(...result);
    this.overlayObjects = this.overlayManager.objects;
  }

  // ── Refresh all ────────────────────────────────────────

  // ── Transcript helper ──────────────────────────────────

  private createRecorder(): MindTranscriptRecorder {
    return new MindTranscriptRecorder({
      playerNames: [
        this.session.players[0].name,
        this.session.players[1].name,
      ],
      isAI: [
        this.session.players[0].isAI,
        this.session.players[1].isAI,
      ],
      startingLives: this.session.lives,
      startingLevel: this.session.currentLevel,
      hands: [
        this.session.players[0].hand.map((c) => c.value),
        this.session.players[1].hand.map((c) => c.value),
      ],
    });
  }

  // ── Replay API ─────────────────────────────────────────

  loadBoardState(state: {
    humanHand: number[];
    aiHand: number[];
    pileTop: number;
    pileSize: number;
    currentLevel: number;
    lives: number;
    stepIndex?: number;
  }): void {
    this.replayController.loadBoardState(state);
    this.replayStepIndex = this.replayController.replayStepIndex;
  }

  // ── Shutdown ────────────────────────────────────────────

  shutdown(): void {
    this.events.off('shutdown', this.shutdown, this);
    this.aiScheduler.destroy();
    this.overlayManager.dismiss();
    this.overlayObjects = [];
    this.shutdownBase();
  }
}
