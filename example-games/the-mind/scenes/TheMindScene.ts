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
} from '../TheMindGameState';
import { MindAiPlayer } from '../AiStrategy';
import {
  preloadMindCardAssets,
} from '../MindCardRenderer';
import { MindTranscriptRecorder } from '../GameTranscript';
import type { EventSoundMapping } from '../../../src/core-engine/SoundManager';
import {
  CardGameScene,
  createSceneHeader,
  dismissOverlay,
} from '../../../src/ui';
import type { HelpSection } from '../../../src/ui';
import helpContent from '../help-content.json';

import {
  SFX_KEYS,
  PRE_PENALTY_PAUSE,
  type GamePhase,
} from './MindConstants';
import { MindRenderer } from './MindRenderer';
import { MindAnimator } from './MindAnimator';
import { MindAiScheduler } from './MindAiScheduler';
import { MindOverlayManager } from './MindOverlayManager';
import { MindReplayController } from './MindReplayController';
import { MindTurnController } from './MindTurnController';

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

  // Helpers
  private mindRenderer!: MindRenderer;
  private mindAnimator!: MindAnimator;
  private aiScheduler!: MindAiScheduler;
  private overlayManager!: MindOverlayManager;
  private replayController!: MindReplayController;
  private turnController!: MindTurnController;

  constructor() {
    super({ key: 'TheMindScene' });
  }

  // ── Preload ─────────────────────────────────────────────

  preload(): void {
    preloadMindCardAssets(this, 120, 164);

    this.load.audio(SFX_KEYS.CARD_PLAY, 'assets/audio/the-mind/card-play.wav');
    this.load.audio(SFX_KEYS.LIFE_LOST, 'assets/audio/the-mind/life-lost.wav');
    this.load.audio(SFX_KEYS.LEVEL_COMPLETE, 'assets/audio/the-mind/level-complete.wav');
    this.load.audio(SFX_KEYS.GAME_WIN, 'assets/audio/the-mind/game-win.wav');
    this.load.audio(SFX_KEYS.GAME_LOST, 'assets/audio/the-mind/game-lost.wav');
    this.load.audio(SFX_KEYS.UI_CLICK, 'assets/audio/the-mind/ui-click.wav');
  }

  // ── Create ──────────────────────────────────────────────

  create(): void {
    this.cameras.main.setBackgroundColor('#1a1a2e');
    this.events.on('shutdown', this.shutdown, this);

    // Reset state for scene restart
    this.phase = 'dealing';
    this.humanCardSprites = [];
    this.aiCardSprites = [];
    this.overlayObjects = [];
    this.turnCounter = 0;
    this.replayStepIndex = 0;
    this.aiCountText = null;

    const urlParams = new URLSearchParams(window.location.search);
    this.autoPlayEnabled = urlParams.get('autoplay') === 'true';
    this.detectReplayMode();

    this.initEventSystem();

    if (this.replayMode) {
      this.createHeader();
      this.createStatusDisplay();
      this.createPile();
      this.createInstruction();
      this.instructionText.setText('');
      this.levelText.setText('Level 1 / 8');
      this.livesText.setText('Lives: \u2764\u2764');
      this.emitStateSettled(0, 'playing');
      return;
    }

    this.createSoundSystem();

    this.session = setupTheMindGame();
    this.aiPlayer = new MindAiPlayer();

    this.recorder = this.createRecorder();

    // Create helpers
    this.mindRenderer = new MindRenderer(this, this.session);
    this.mindAnimator = new MindAnimator(this, this.session, this.mindRenderer, this.soundManager);
    this.aiScheduler = new MindAiScheduler(this, this.session);
    this.overlayManager = new MindOverlayManager(this, this.session, this.gameEvents, this.soundManager);
    this.replayController = new MindReplayController(this, this.mindRenderer, { value: this.replayMode });
    this.turnController = new MindTurnController(this.session, this.recorder, this.gameEvents, this.soundManager);

    // Sync auto-play state with scheduler
    this.aiScheduler.autoPlayEnabled = this.autoPlayEnabled;

    // Create UI
    this.mindRenderer.createHeader();
    this.mindRenderer.createStatusDisplay();
    this.mindRenderer.createPile();
    this.mindRenderer.createInstruction();
    this.createAutoPlayButton();
    this.initHelpPanel(helpContent as HelpSection[]);

    // Expose renderer display objects on scene for test compatibility
    this.humanCardSprites = this.mindRenderer.humanCardSprites;
    this.aiCardSprites = this.mindRenderer.aiCardSprites;
    this.aiCountText = this.mindRenderer.aiCountText;
    this.pileSprite = this.mindRenderer.pileSprite;
    this.pileCountText = this.mindRenderer.pileCountText;
    this.pileValueText = this.mindRenderer.pileValueText;
    this.levelText = this.mindRenderer.levelText;
    this.livesText = this.mindRenderer.livesText;
    this.instructionText = this.mindRenderer.instructionText;

    // Initial render
    this.mindRenderer.renderHumanHand(
      (card) => this.onHumanCardClick(card),
      this.phase,
      this.autoPlayEnabled,
    );
    this.mindRenderer.renderAiHand();
    this.mindRenderer.refreshStatus();
    this.mindRenderer.refreshPile();

    this.startLevel();
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
    this.initSoundSystem(Object.values(SFX_KEYS), mapping);
    this.initSettingsPanel();
  }

  // ── Auto-play spectator mode ───────────────────────────

  private createAutoPlayButton(): void {
    const label = this.autoPlayEnabled ? '[ Auto-Play: ON ]' : '[ Auto-Play: OFF ]';
    this.autoPlayButton = this.add
      .text(20, this.scale.height - 20, label, {
        fontSize: '12px',
        color: this.autoPlayEnabled ? '#88ff88' : '#888888',
        fontFamily: 'sans-serif',
      })
      .setOrigin(0, 1)
      .setDepth(5)
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

    this.overlayObjects = this.overlayManager.overlayObjects;

    this.turnController.handleGameOver(
      () => {
        this.setPhase('game-won');
        this.overlayManager.showWinOverlay();
        this.overlayObjects = this.overlayManager.overlayObjects;
      },
      () => {
        this.setPhase('game-lost');
        this.overlayManager.showLossOverlay();
        this.overlayObjects = this.overlayManager.overlayObjects;
      },
    );
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
    dismissOverlay(this.overlayObjects);
    this.overlayObjects = [];
    this.shutdownBase();
  }
}
