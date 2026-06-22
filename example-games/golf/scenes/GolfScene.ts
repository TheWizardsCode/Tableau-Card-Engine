/**
 * GolfScene -- the main Phaser scene for 9-Card Golf.
 *
 * Orchestrates the visual interface by delegating responsibilities to
 * composable helper classes:
 *   - GolfRenderer: board layout and sprite refresh
 *   - GolfAnimator: card animations and tweens
 *   - GolfTurnController: human turn logic and state machine
 *   - GolfAiController: AI opponent turn execution
 *   - GolfOverlayManager: end-of-game screen
 *   - GolfReplayController: replay mode state injection and takeover
 */

import type { Card } from '../../../src/card-system/Card';
import type { GolfMove } from '../GolfRules';
import type { GolfSession } from '../GolfGame';
import {
  setupGolfGame,
} from '../GolfGame';
import { AiPlayer, GreedyStrategy, RandomStrategy } from '../AiStrategy';
import type { AiStrategy } from '../AiStrategy';
import { TranscriptRecorder } from '../GameTranscript';
import type { EventSoundMapping } from '../../../src/core-engine/SoundManager';
import {
  CardGameScene,
  preloadCardAssets,
  PhaseManager,
  OverlayManager,
  audioPathWithFallback,
} from '../../../src/ui';
import type { HelpSection } from '../../../src/ui';
import helpContent from '../help-content.json';

import {
  GOLF_CARD_W, GOLF_CARD_H,
  SFX_KEYS, type TurnPhase,
} from './GolfConstants';
import { GolfRenderer } from './GolfRenderer';
import { GolfAnimator } from './GolfAnimator';
import { GolfTurnController } from './GolfTurnController';
import { GolfAiController } from './GolfAiController';

import { GolfReplayController } from './GolfReplayController';
import { GolfOverlayHelper } from './GolfSceneHelpers';

export class GolfScene extends CardGameScene {
  // Game state
  session!: GolfSession;
  recorder!: TranscriptRecorder;
  aiPlayer!: AiPlayer;
  phaseManager!: PhaseManager<TurnPhase>;
  drawnCard: Card | null = null;
  drawSource: import('../GolfRules').DrawSource | null = null;
  aiStrategyName: string = 'greedy';

  /** Tracks whether loadBoardState() has been called (required before enableInteractiveMode). */
  boardStateInjected: boolean = false;

  /** Game objects belonging to the takeover overlay (for cleanup). */
  takeoverOverlayObjects: Phaser.GameObjects.GameObject[] = [];

  // Display objects -- grids (accessed by tests)
  humanCardSprites: Phaser.GameObjects.Image[] = [];
  aiCardSprites: Phaser.GameObjects.Image[] = [];

  // Display objects -- piles (accessed by tests)
  stockSprite!: Phaser.GameObjects.Image;
  discardSprite!: Phaser.GameObjects.Image;
  drawnCardSprite: Phaser.GameObjects.Image | null = null;

  // Display objects -- UI (accessed by tests)
  turnText!: Phaser.GameObjects.Text;
  humanScoreText!: Phaser.GameObjects.Text;
  aiScoreText!: Phaser.GameObjects.Text;
  instructionText!: Phaser.GameObjects.Text;
  humanLabel!: Phaser.GameObjects.Text;
  aiLabel!: Phaser.GameObjects.Text;

  // Helpers
  private golfRenderer!: GolfRenderer;
  private animator!: GolfAnimator;
  private turnController!: GolfTurnController;
  private aiController!: GolfAiController;
  private overlayManager!: OverlayManager;
  private overlayHelper!: GolfOverlayHelper;
  private replayController!: GolfReplayController;

  constructor() {
    super({ key: 'GolfScene' });
  }

  // ── Preload ─────────────────────────────────────────────

  preload(): void {
    preloadCardAssets(this, GOLF_CARD_W, GOLF_CARD_H);

    // Audio SFX assets (namespace-scoped for collision protection)
    const ns = 'golf';
    const audioDir = 'golf';
    this.load.audio(`${ns}:${SFX_KEYS.CARD_DRAW}`, audioPathWithFallback(audioDir, 'card-draw.wav'));
    this.load.audio(`${ns}:${SFX_KEYS.CARD_FLIP}`, audioPathWithFallback(audioDir, 'card-flip.wav'));
    this.load.audio(`${ns}:${SFX_KEYS.CARD_SWAP}`, audioPathWithFallback(audioDir, 'card-swap.wav'));
    this.load.audio(`${ns}:${SFX_KEYS.CARD_DISCARD}`, audioPathWithFallback(audioDir, 'card-discard.wav'));
    this.load.audio(`${ns}:${SFX_KEYS.TURN_CHANGE}`, audioPathWithFallback(audioDir, 'turn-change.wav'));
    this.load.audio(`${ns}:${SFX_KEYS.ROUND_END}`, audioPathWithFallback(audioDir, 'round-end.wav'));
    this.load.audio(`${ns}:${SFX_KEYS.SCORE_REVEAL}`, audioPathWithFallback(audioDir, 'score-reveal.wav'));
    this.load.audio(`${ns}:${SFX_KEYS.UI_CLICK}`, audioPathWithFallback(audioDir, 'ui-click.wav'));
  }

  // ── Create ──────────────────────────────────────────────

  create(): void {
    this.cameras.main.setBackgroundColor('#2d572c');

    // Reset display object arrays (stale refs from previous run on restart)
    this.humanCardSprites = [];
    this.aiCardSprites = [];
    this.drawnCardSprite = null;
    this.phaseManager = new PhaseManager<TurnPhase>({
      initialPhase: 'waiting-for-draw',
      phaseTextMap: {
        'waiting-for-draw': 'Click the Stock or Discard pile to draw a card',
        'waiting-for-move': 'Click a grid card to swap, or click Discard to discard & flip',
        'waiting-for-flip-target': 'Click a face-down card to flip it',
        'animating': '',
        'ai-thinking': 'AI is thinking...',
        'round-ended': '',
      },
      onPhaseChange: (phase) => {
        if (phase === 'round-ended') {
          this.showEndScreen();
        }
      },
    });
    this.drawnCard = null;
    this.drawSource = null;

    // Check for replay mode via URL parameter (?mode=replay)
    this.detectReplayMode();

    // Select AI strategy
    const strategy: AiStrategy =
      this.aiStrategyName === 'random' ? RandomStrategy : GreedyStrategy;

    // Event system: create emitter and bridge to Phaser scene events
    this.initEventSystem();
    this.initHUDContainer();

    // Sound system: wrap Phaser's sound manager as a SoundPlayer
    if (!this.replayMode) {
      const mapping: EventSoundMapping = {
        'card-drawn': SFX_KEYS.CARD_DRAW,
        'card-flipped': SFX_KEYS.CARD_FLIP,
        'card-swapped': SFX_KEYS.CARD_SWAP,
        'card-discarded': SFX_KEYS.CARD_DISCARD,
        'turn-started': SFX_KEYS.TURN_CHANGE,
        'game-ended': SFX_KEYS.ROUND_END,
      };
      this.initSoundSystem(Object.values(SFX_KEYS), mapping, { namespace: 'golf' });
    }

    // Setup game
    this.session = setupGolfGame({
      playerNames: ['You', 'AI'],
      isAI: [false, true],
    });
    this.recorder = new TranscriptRecorder(this.session, [
      undefined,
      this.aiStrategyName,
    ]);
    this.aiPlayer = new AiPlayer(strategy);

    // Create helpers
    this.golfRenderer = new GolfRenderer(this, this.session, this.replayMode);
    this.animator = new GolfAnimator(this, this.session, this.golfRenderer, this.soundManager);
    this.turnController = new GolfTurnController(
      this.session,
      this.recorder,
      this.phaseManager,
      this.gameEvents,
    );
    this.aiController = new GolfAiController(
      this,
      this.session,
      this.recorder,
      this.aiPlayer,
      this.phaseManager,
      this.gameEvents,
    );
    this.overlayManager = new OverlayManager(this);
    this.overlayHelper = new GolfOverlayHelper(
      this,
      this.overlayManager,
      this.session,
      this.recorder,
      this.gameEvents,
      this.soundManager,
    );

    // Window error handler for crash export
    this.setupErrorExportHandler();
    this.replayController = new GolfReplayController(
      this,
      this.session,
      this.golfRenderer,
      { value: this.replayMode },
      (nextPlayer) => this.startTurnAfterInteractiveEnable(nextPlayer),
    );

    // Create UI
    this.golfRenderer.createLabels();
    this.golfRenderer.createPiles(
      () => this.onStockClick(),
      () => this.onDiscardClick(),
      this.session.shared.stockPile,
      this.session.shared.discardPile,
    );
    this.golfRenderer.createGrids((i) => this.onHumanCardClick(i));
    this.golfRenderer.createScoreDisplay();
    this.golfRenderer.createInstructions();

    // Expose renderer display objects on scene for test compatibility
    this.humanCardSprites = this.golfRenderer.humanCardSprites;
    this.aiCardSprites = this.golfRenderer.aiCardSprites;
    this.stockSprite = this.golfRenderer.stockSprite;
    this.discardSprite = this.golfRenderer.discardSprite;
    this.turnText = this.golfRenderer.turnText;
    this.humanScoreText = this.golfRenderer.humanScoreText;
    this.aiScoreText = this.golfRenderer.aiScoreText;
    this.instructionText = this.golfRenderer.instructionText;
    this.humanLabel = this.golfRenderer.humanLabel;
    this.aiLabel = this.golfRenderer.aiLabel;

    this.phaseManager.setTextObject(this.instructionText);
    if (!this.replayMode) {
      this.initHelpPanel(helpContent as HelpSection[]);
      this.initSettingsPanel();
      // Propagate reduced motion preference to the animator
      if (this.settingsPanel) {
        this.animator.reducedMotion = this.settingsPanel.reducedMotion;
      }
    }

    // Initial render
    this.golfRenderer.refreshAll();

    if (this.replayMode) {
      this.instructionText.setText('');
      this.emitStateSettled(this.session.gameState.turnNumber, this.session.gameState.phase);
    } else {
      this.emitTurnStarted();
      this.phaseManager.set('waiting-for-draw');
    }
  }

  // ── Replay API ──────────────────────────────────────────

  loadBoardState(
    boardStates: import('../GameTranscript').BoardSnapshot[],
    discardTop: import('../GameTranscript').CardSnapshot | null,
    stockRemaining: number,
    stockPileCards?: import('../GameTranscript').CardSnapshot[],
  ): void {
    this.replayController.loadBoardState(
      boardStates,
      discardTop,
      stockRemaining,
      stockPileCards,
    );
    this.boardStateInjected = this.replayController.boardStateInjected;
    this.takeoverOverlayObjects = this.replayController.takeoverOverlayObjects;
  }

  enableInteractiveMode(options: { nextPlayer: number }): void {
    this.replayController.enableInteractiveMode(options);
    this.boardStateInjected = this.replayController.boardStateInjected;
    this.replayMode = !this.replayController.boardStateInjected;
  }

  showTakeoverOverlay(
    options: { turnNumber: number; lastAction: string },
  ): void {
    this.replayController.showTakeoverOverlay(options, this.gameEvents);
    this.takeoverOverlayObjects = this.replayController.takeoverOverlayObjects;
  }

  // ── Input handlers (called by Phaser events, kept for test compatibility) ──

  onStockClick(): void {
    if (this.phaseManager.current === 'waiting-for-draw' && this.isHumanTurn()) {
      this.turnController.humanDraw('stock', (card, source) => {
      this.drawnCard = card;
      this.drawSource = source;
      this.animator.showDrawnCard(card, source);
    });
    }
  }

  onDiscardClick(): void {
    if (this.phaseManager.current === 'waiting-for-draw' && this.isHumanTurn()) {
      this.turnController.humanDraw('discard', (card, source) => {
      this.drawnCard = card;
      this.drawSource = source;
      this.animator.updateDiscardPileAfterDraw();
      this.animator.showDrawnCard(card, source);
    });
    } else if (this.phaseManager.current === 'waiting-for-move' && this.isHumanTurn()) {
      this.phaseManager.set('animating');
      this.animator.animateDrawnCardToDiscard(this.turnController.drawnCard, () => {
        this.phaseManager.set('waiting-for-flip-target');
      });
    }
  }

  onHumanCardClick(gridIndex: number): void {
    if (this.phaseManager.current === 'waiting-for-move' && this.isHumanTurn()) {
      const move: GolfMove = {
        kind: 'swap',
        row: Math.floor(gridIndex / 3),
        col: gridIndex % 3,
      };
      this.executeHumanMove(move);
    } else if (this.phaseManager.current === 'waiting-for-flip-target' && this.isHumanTurn()) {
      const grid = this.session.gameState.playerStates[0].grid;
      if (!grid[gridIndex].faceUp) {
        const move: GolfMove = {
          kind: 'discard-and-flip',
          row: Math.floor(gridIndex / 3),
          col: gridIndex % 3,
        };
        this.executeHumanMove(move);
      }
    }
  }

  // ── Human turn execution ────────────────────────────────

  private executeHumanMove(move: GolfMove): void {
    this.turnController.humanMove(
      move,
      (result, onAnimationComplete) => {
        this.animator.animateTurn(result, this.turnController.drawnCard, onAnimationComplete);
      },
      (result) => {
        this.golfRenderer.refreshAll();
        this.emitAnimationComplete();
        this.drawnCard = null;
        this.drawSource = null;

        if (result.roundEnded) {
          this.emitStateSettled(
            this.session.gameState.turnNumber,
            this.session.gameState.phase,
          );
          this.phaseManager.set('round-ended');
        } else {
          this.emitStateSettled(
            this.session.gameState.turnNumber,
            this.session.gameState.phase,
          );
          this.emitTurnStarted();
          this.checkNextTurn();
        }
      },
    );
  }

  // ── AI turn ─────────────────────────────────────────────

  private runAiTurn(): void {
    this.aiController.runAiTurn(
      this.instructionText,
      (card, source) => this.animator.showDrawnCard(card, source),
      () => this.golfRenderer.refreshPiles(),
      (result, onAnimationComplete) => {
        this.animator.animateTurn(result, null, onAnimationComplete);
      },
      (result) => {
        this.golfRenderer.refreshAll();
        this.emitAnimationComplete();

        if (result.roundEnded) {
          this.emitStateSettled(
            this.session.gameState.turnNumber,
            this.session.gameState.phase,
          );
          this.phaseManager.set('round-ended');
        } else {
          this.emitStateSettled(
            this.session.gameState.turnNumber,
            this.session.gameState.phase,
          );
          this.emitTurnStarted();
          this.checkNextTurn();
        }
      },
    );
  }

  // ── Turn flow ───────────────────────────────────────────

  private isHumanTurn(): boolean {
    return this.session.gameState.currentPlayerIndex === 0;
  }

  private checkNextTurn(): void {
    this.turnController.checkNextTurn(
      () => {
        this.emitTurnStarted();
        this.phaseManager.set('waiting-for-draw');
      },
      () => this.runAiTurn(),
    );
  }

  private startTurnAfterInteractiveEnable(nextPlayer: number): void {
    this.drawnCard = null;
    this.drawSource = null;
    this.golfRenderer.refreshTurnIndicator();

    if (nextPlayer === 0) {
      this.emitTurnStarted();
      this.phaseManager.set('waiting-for-draw');
    } else {
      this.emitTurnStarted();
      this.runAiTurn();
    }
  }

  // ── Engine event emission ─────────────────────────────────

  /** Emit turn-started for the current player. */
  private emitTurnStarted(): void {
    const idx = this.session.gameState.currentPlayerIndex;
    const player = this.session.gameState.players[idx];
    this.gameEvents.emit('turn-started', {
      turnNumber: this.session.gameState.turnNumber,
      playerIndex: idx,
      playerName: player.name,
      isAI: player.isAI,
    });
  }

  /** Emit animation-complete after all tweens for the turn finish. */
  private emitAnimationComplete(): void {
    this.gameEvents.emit('animation-complete', {
      turnNumber: this.session.gameState.turnNumber,
    });
  }

  /** Clean up resources when the scene shuts down. */
  shutdown(): void {
    this.overlayManager?.dismiss();
    this.golfRenderer.destroy();
    this.shutdownBase();
  }

  // ── End screen ──────────────────────────────────────────

  private setupErrorExportHandler(): void {
    // Only register in non-replay mode (replay has its own error handling)
    if (this.replayMode) return;

    const handler = (_event: Event, _source?: string, _lineno?: number, _colno?: number, error?: Error) => {
      console.warn('[GolfScene] Unhandled error detected, showing export button:', error?.message);
      this.overlayHelper.showErrorExportOverlay();
    };
    window.addEventListener('error', handler);
    // Store reference for cleanup
    this.events.once('shutdown', () => {
      window.removeEventListener('error', handler);
    });
  }

  private showEndScreen(): void {
    this.overlayHelper.showEndScreen(
      (player) => this.golfRenderer.refreshGrid(player),
      () => this.golfRenderer.refreshScores(),
    );
  }
}
