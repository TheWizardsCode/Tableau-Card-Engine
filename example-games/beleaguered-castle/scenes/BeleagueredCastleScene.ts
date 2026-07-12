/**
 * BeleagueredCastleScene -- the main Phaser scene for Beleaguered Castle.
 */
import Phaser from 'phaser';
import type { Rank, Suit } from '../../../src/card-system/Card';
import { createCard, RANKS } from '../../../src/card-system/Card';
import type { BeleagueredCastleState, BCMove } from '../BeleagueredCastleState';
import { FOUNDATION_COUNT, TABLEAU_COUNT } from '../BeleagueredCastleState';
import {
  deal,
  isLegalFoundationMove,
  isLegalTableauMove,
  getLegalMoves,
  isWon,
} from '../BeleagueredCastleRules';
import { BCTranscriptRecorder } from '../GameTranscript';
import type { BCGameTranscript, BoardSnapshot } from '../GameTranscript';
import {
  CardGameScene,
  preloadCardAssets,
  OverlayManager,
  audioPathWithFallback,
  createGameOverOverlay,
} from '../../../src/ui';
import type { EventSoundMapping } from '../../../src/core-engine/SoundManager';
import type { HelpSection } from '../../../src/ui';
import helpContent from '../help-content.json';

import {
  SFX_KEYS, ANIM_DURATION,
  AUTO_COMPLETE_STAGGER_MS, AUTO_COMPLETE_MIN_DURATION,
  OVERLAY_DEPTH, OVERLAY_BG_ALPHA,
  OVERLAY_STATS_FONT_SIZE,
  OVERLAY_CONTENT_Y_OFFSET,
  RESUME_TITLE_FONT_SIZE, RESUME_TITLE_Y_OFFSET,
  RESUME_INFO_FONT_SIZE, RESUME_INFO_Y_OFFSET,
  RESUME_BUTTON_SPACING, RESUME_BUTTON_Y_OFFSET,
  SNAP_BACK_DURATION,
} from './BeleagueredCastleConstants';
import { BeleagueredCastleRenderer } from './BeleagueredCastleRenderer';
import { BeleagueredCastleTurnController } from './BeleagueredCastleTurnController';
import { moveGameObject, cardTextureKey } from '../../../src/ui';
import { shakeIllegalMove } from '../../../src/ui/shakeIllegalMove';
import {
  GAME_W, GAME_H, FONT_FAMILY,
  createOverlayButton,
} from '../../../src/ui';
import { createHudText } from '../../../src/ui/Renderer/adapters/BeleagueredCastleAdapter';
import { SaveLoadStore } from '../../../src/core-engine';
import { TranscriptStore, autoSaveTranscript } from '../../../src/core-engine/transcript';
import { CheckpointManager } from '../../../src/core-engine';
import { bcStateSerializer } from '../BeleagueredCastleSaveLoad';
import type { BCSerializedState } from '../BeleagueredCastleSaveLoad';

export class BeleagueredCastleScene extends CardGameScene {
  private gameState!: BeleagueredCastleState;
  private seed: number = Date.now();
  private dealComplete: boolean = false;
  private selectedCol: number | null = null;
  private elapsedSeconds: number = 0;
  private timerEvent: Phaser.Time.TimerEvent | null = null;
  private gameEnded: boolean = false;
  private transcript: BCGameTranscript | null = null;

  private saveLoadStore!: SaveLoadStore;
  private checkpointManager!: CheckpointManager<BeleagueredCastleState, BCSerializedState>;
  private transcriptStore!: TranscriptStore;

  private bcRenderer!: BeleagueredCastleRenderer;
  private overlayManager!: OverlayManager;
  private turnController!: BeleagueredCastleTurnController;

  private onNewGame?: () => void;
  private onRestart?: () => void;
  private onUndoLast?: () => void;

  constructor() {
    super({ key: 'BeleagueredCastleScene' });
  }

  private get interactionBlocked(): boolean {
    return !this.dealComplete || this.gameEnded || this.turnController.autoCompleting;
  }

  preload(): void {
    preloadCardAssets(this, 90, 126);
    const ns = 'beleaguered-castle';
    const audioDir = 'beleaguered-castle';
    this.load.audio(`${ns}:${SFX_KEYS.CARD_PICKUP}`, audioPathWithFallback(audioDir, 'card-pickup.wav'));
    this.load.audio(`${ns}:${SFX_KEYS.CARD_TO_FOUNDATION}`, audioPathWithFallback(audioDir, 'card-to-foundation.wav'));
    this.load.audio(`${ns}:${SFX_KEYS.CARD_TO_TABLEAU}`, audioPathWithFallback(audioDir, 'card-to-tableau.wav'));
    this.load.audio(`${ns}:${SFX_KEYS.CARD_SNAP_BACK}`, audioPathWithFallback(audioDir, 'card-snap-back.wav'));
    this.load.audio(`${ns}:${SFX_KEYS.DEAL_CARD}`, audioPathWithFallback(audioDir, 'deal-card.wav'));
    this.load.audio(`${ns}:${SFX_KEYS.WIN_FANFARE}`, audioPathWithFallback(audioDir, 'win-fanfare.wav'));
    this.load.audio(`${ns}:${SFX_KEYS.LOSS_SOUND}`, audioPathWithFallback(audioDir, 'loss-sound.wav'));
    this.load.audio(`${ns}:${SFX_KEYS.AUTO_COMPLETE_START}`, audioPathWithFallback(audioDir, 'auto-complete-start.wav'));
    this.load.audio(`${ns}:${SFX_KEYS.AUTO_COMPLETE_CARD}`, audioPathWithFallback(audioDir, 'auto-complete-card.wav'));
    this.load.audio(`${ns}:${SFX_KEYS.UNDO}`, audioPathWithFallback(audioDir, 'undo.wav'));
    this.load.audio(`${ns}:${SFX_KEYS.REDO}`, audioPathWithFallback(audioDir, 'redo.wav'));
    this.load.audio(`${ns}:${SFX_KEYS.CARD_SELECT}`, audioPathWithFallback(audioDir, 'card-select.wav'));
    this.load.audio(`${ns}:${SFX_KEYS.CARD_DESELECT}`, audioPathWithFallback(audioDir, 'card-deselect.wav'));
    this.load.audio(`${ns}:${SFX_KEYS.UI_CLICK}`, audioPathWithFallback(audioDir, 'ui-click.wav'));
    this.load.audio(`${ns}:${SFX_KEYS.ILLEGAL_MOVE}`, audioPathWithFallback(audioDir, 'illegal-move.wav'));
    this.load.audio(SFX_KEYS.ILLEGAL_MOVE, 'assets/audio/default/illegal-move.wav');
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#2d572c');

    const params = new URLSearchParams(window.location.search);
    const seedParam = params.get('seed');
    this.seed = seedParam ? parseInt(seedParam, 10) : Date.now();

    super.create();

    // Create a placeholder game state; will be replaced if resuming from checkpoint
    this.gameState = deal(this.seed);
    this.dealComplete = false;
    this.selectedCol = null;
    this.elapsedSeconds = 0;
    this.gameEnded = false;
    this.transcript = null;

    const recorder = new BCTranscriptRecorder(this.seed, this.gameState);

    this.saveLoadStore = new SaveLoadStore();
    this.checkpointManager = new CheckpointManager(this.saveLoadStore, 'beleaguered-castle', 'run-checkpoint', bcStateSerializer);
    this.transcriptStore = new TranscriptStore();

    this.bcRenderer = new BeleagueredCastleRenderer(this, this.gameState);
    this.overlayManager = new OverlayManager(this);
    this.turnController = new BeleagueredCastleTurnController(this.gameState, recorder, {
      onRefresh: () => this.refreshAll(),
      onCheckGameEnd: () => this.handleGameEnd(),
      onAutoCompleteVisual: (moves, moveCards, isSafeAutoMove) => this.runAutoCompleteVisuals(moves, moveCards, isSafeAutoMove),
      onAutoCompleteDone: () => this.handleAutoCompleteDone(),
      onSoundEvent: (event, data) => this.handleSoundEvent(event, data),
      onSaveCheckpoint: () => this.saveCheckpoint(),
    });

    this.onNewGame = () => { this.seed = Date.now(); this.scene.restart(); };
    this.onRestart = () => this.scene.restart();
    this.onUndoLast = () => { this.overlayManager.dismiss(); this.gameEnded = false; this.resumeTimer(); this.turnController.performUndo(); };

    this.bcRenderer.createTitle();
    this.bcRenderer.createFoundationSlots();
    this.bcRenderer.initTableauHandViews();
    this.bcRenderer.createTableauDropZones();
    this.bcRenderer.createHUD(this.seed);
    this.bcRenderer.onDealCard = (info) => this.gameEvents.emit('deal-card', info);
    this.bcRenderer.onDealComplete = () => {
      this.dealComplete = true;
      this.bcRenderer.makeDraggable(this.interactionBlocked);
      this.refreshUndoRedoButtons(this.turnController.canUndo, this.turnController.canRedo);
      this.saveCheckpoint();
    };
    this.bcRenderer.onCardClick = (col) => this.handleCardClick(col);

    if (!this.replayMode) {
      this.initHelpPanel(helpContent as HelpSection[]);
      const mapping: EventSoundMapping = {
        'card-pickup': SFX_KEYS.CARD_PICKUP,
        'card-to-foundation': SFX_KEYS.CARD_TO_FOUNDATION,
        'card-to-tableau': SFX_KEYS.CARD_TO_TABLEAU,
        'card-snap-back': SFX_KEYS.CARD_SNAP_BACK,
        'deal-card': SFX_KEYS.DEAL_CARD,
        'game-ended': SFX_KEYS.LOSS_SOUND,
        'auto-complete-start': SFX_KEYS.AUTO_COMPLETE_START,
        'auto-complete-card': SFX_KEYS.AUTO_COMPLETE_CARD,
        'undo': SFX_KEYS.UNDO,
        'redo': SFX_KEYS.REDO,
        'card-selected': SFX_KEYS.CARD_SELECT,
        'card-deselected': SFX_KEYS.CARD_DESELECT,
        'ui-interaction': SFX_KEYS.UI_CLICK,
      };
      this.initSoundSystem(Object.values(SFX_KEYS), mapping, { namespace: 'beleaguered-castle' });
      this.initSettingsPanel(undefined, undefined, false);
      // Propagate reduced motion preference to the renderer
      if (this.settingsPanel) {
        this.bcRenderer.reducedMotion = this.settingsPanel.reducedMotion;
      }
      this.initUndoRedoButtons(
        () => this.turnController.performUndo(),
        () => this.turnController.performRedo(),
      );
    }

    this.bcRenderer.refreshFoundations();

    if (this.replayMode) {
      this.dealComplete = true;
      this.bcRenderer.refreshTableau();
      this.bcRenderer.refreshHUD();
      this.emitStateSettled(this.gameState.moveCount, this.gameEnded ? 'ended' : 'playing');
    } else {
      // First check for a saved checkpoint. If one exists, show the resume
      // overlay — no deal animation runs until the user decides. If no
      // checkpoint, start a fresh deal on the next frame.
      this.time.delayedCall(0, () => this.checkForSavedCheckpoint());
    }
  }

  // ── Input handling ──────────────────────────────────────
  private setupDragAndDrop(): void {
    this.input.on('dragstart', (_pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.Image) => {
      if (this.interactionBlocked) return;
      const data = gameObject.getData('cardData');
      if (!data) return;
      this.deselectColumn();
      data.originX = gameObject.x;
      data.originY = gameObject.y;
      data.originDepth = gameObject.depth;
      gameObject.setDepth(1000);
      const col = this.gameState.tableau[data.colIndex];
      const topCard = col.peek();
      if (topCard) this.gameEvents.emit('card-pickup', { suit: topCard.suit, rank: topCard.rank, source: 'tableau' });
      this.bcRenderer.showValidDropHighlights(data.colIndex, () => getLegalMoves(this.gameState));
    });

    this.input.on('drag', (_pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.Image, dragX: number, dragY: number) => {
      if (this.interactionBlocked) return;
      gameObject.x = dragX;
      gameObject.y = dragY;
    });

    this.input.on('dragend', (_pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.Image, dropped: boolean) => {
      if (this.interactionBlocked) return;
      this.bcRenderer.clearDropHighlights();
      if (!dropped) {
        this.bcRenderer.snapBack(gameObject);
        this.time.delayedCall(SNAP_BACK_DURATION, () => {
          shakeIllegalMove({ scene: this, target: gameObject });
        });
      }
    });

    this.input.on('drop', (_pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.Image, dropZone: Phaser.GameObjects.Zone) => {
      if (this.interactionBlocked) return;
      this.handleDrop(gameObject, dropZone);
    });
  }

  private handleDrop(sprite: Phaser.GameObjects.Image, zone: Phaser.GameObjects.Zone): void {
    const data = sprite.getData('cardData');
    if (!data) { this.bcRenderer.snapBack(sprite); return; }

    const fromCol = data.colIndex;
    const zoneType = zone.getData('type') as string;
    const zoneIndex = zone.getData('index') as number;
    let move: BCMove | null = null;

    if (zoneType === 'foundation' && isLegalFoundationMove(this.gameState, fromCol, zoneIndex).legal) {
      move = { kind: 'tableau-to-foundation', fromCol, toFoundation: zoneIndex };
    } else if (zoneType === 'tableau' && zoneIndex !== fromCol && isLegalTableauMove(this.gameState, fromCol, zoneIndex).legal) {
      move = { kind: 'tableau-to-tableau', fromCol, toCol: zoneIndex };
    }

    if (move) {
      this.turnController.executePlayerMove(move);
    } else {
      this.bcRenderer.snapBack(sprite);
      this.time.delayedCall(SNAP_BACK_DURATION, () => {
        shakeIllegalMove({ scene: this, target: sprite });
      });
    }
  }

  private setupClickToMove(): void {
    this.input.dragDistanceThreshold = 5;

    for (let fi = 0; fi < FOUNDATION_COUNT; fi++) {
      const zone = this.bcRenderer.foundationDZs[fi];
      zone.setInteractive({ useHandCursor: true });
      zone.on('pointerdown', () => {
        if (this.interactionBlocked) return;
        if (this.selectedCol === null) return;
        if (isLegalFoundationMove(this.gameState, this.selectedCol, fi).legal) {
          const move: BCMove = { kind: 'tableau-to-foundation', fromCol: this.selectedCol, toFoundation: fi };
          this.deselectColumn();
          this.turnController.executePlayerMove(move);
        } else {
          // Illegal move feedback
          const sprs = this.bcRenderer.tableauSprs[this.selectedCol];
          if (sprs && sprs.length > 0) {
            shakeIllegalMove({ scene: this, target: sprs[sprs.length - 1] });
          }
          this.deselectColumn();
        }
      });
    }

    for (let col = 0; col < TABLEAU_COUNT; col++) {
      const zone = this.bcRenderer.tableauDZs[col];
      zone.setInteractive({ useHandCursor: false });
      zone.on('pointerdown', () => {
        if (this.interactionBlocked) return;
        if (this.selectedCol === null) return;
        if (col === this.selectedCol) { this.deselectColumn(); return; }
        if (isLegalTableauMove(this.gameState, this.selectedCol, col).legal) {
          const move: BCMove = { kind: 'tableau-to-tableau', fromCol: this.selectedCol, toCol: col };
          this.deselectColumn();
          this.turnController.executePlayerMove(move);
        } else {
          // Illegal move feedback
          const sprs = this.bcRenderer.tableauSprs[this.selectedCol];
          if (sprs && sprs.length > 0) {
            shakeIllegalMove({ scene: this, target: sprs[sprs.length - 1] });
          }
          this.deselectColumn();
        }
      });
    }
  }

  private handleCardClick(colIndex: number): void {
    if (this.interactionBlocked) return;
    if (this.selectedCol === colIndex) { this.deselectColumn(); return; }
    if (this.selectedCol !== null) {
      if (isLegalTableauMove(this.gameState, this.selectedCol, colIndex).legal) {
        const move: BCMove = { kind: 'tableau-to-tableau', fromCol: this.selectedCol, toCol: colIndex };
        this.deselectColumn();
        this.turnController.executePlayerMove(move);
        return;
      }
      // Illegal move feedback
      const sprs = this.bcRenderer.tableauSprs[this.selectedCol];
      if (sprs && sprs.length > 0) {
        shakeIllegalMove({ scene: this, target: sprs[sprs.length - 1] });
      }
      this.deselectColumn();
    }
    this.selectColumn(colIndex);
  }

  private selectColumn(colIndex: number): void {
    this.selectedCol = colIndex;
    this.bcRenderer.selectColumn(colIndex);
    const col = this.gameState.tableau[colIndex];
    const topCard = col.peek();
    if (topCard) this.gameEvents.emit('card-selected', { suit: topCard.suit, rank: topCard.rank, columnIndex: colIndex });
    this.bcRenderer.showValidDropHighlights(colIndex, () => getLegalMoves(this.gameState));
  }

  private deselectColumn(): void {
    if (this.selectedCol !== null) {
      this.bcRenderer.deselectColumn(this.selectedCol);
      this.gameEvents.emit('card-deselected', { reason: 'click-away' });
    }
    this.selectedCol = null;
    this.bcRenderer.clearDropHighlights();
  }

  private setupKeyboard(): void {
    if (!this.input.keyboard) return;
    this.input.keyboard.on('keydown', (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey) {
        if (event.key === 'z' && !event.shiftKey) { event.preventDefault(); this.turnController.performUndo(); }
        else if (event.key === 'y' || (event.key === 'z' && event.shiftKey) || (event.key === 'Z' && event.shiftKey)) {
          event.preventDefault(); this.turnController.performRedo();
        }
      }
      if (event.key === 'Escape' && this.helpPanel?.isOpen) this.helpPanel.close();
    });
  }

  // ── Game end ────────────────────────────────────────────
  private handleGameEnd(): void {
    if (isWon(this.gameState)) {
      this.gameEnded = true;
      this.stopTimer();
      this.transcript = this.turnController['recorder'].finalize('win', this.gameState.moveCount, this.elapsedSeconds);
      this.soundManager?.play(SFX_KEYS.WIN_FANFARE);
      this.autoSaveTranscript();
      this.showWinOverlay(this.elapsedSeconds);
    } else {
      this.gameEnded = true;
      this.stopTimer();
      this.transcript = this.turnController['recorder'].finalize('loss', this.gameState.moveCount, this.elapsedSeconds);
      this.gameEvents.emit('game-ended', { finalTurnNumber: this.gameState.moveCount, winnerIndex: -1, reason: 'no-moves' });
      this.autoSaveTranscript();
      this.showNoMovesOverlay();
    }
  }

  private handleAutoCompleteDone(): void {
    if (isWon(this.gameState)) {
      this.gameEnded = true;
      this.stopTimer();
      this.transcript = this.turnController['recorder'].finalize('win', this.gameState.moveCount, this.elapsedSeconds);
      this.autoSaveTranscript();
      this.showWinOverlay(this.elapsedSeconds, this.soundManager);
    }
  }

  private runAutoCompleteVisuals(moves: BCMove[], moveCards: Array<{ suit: string; rank: string; foundationIndex: number }>, isSafeAutoMove?: boolean): void {
    const STAGGER_MS = AUTO_COMPLETE_STAGGER_MS;


    const animIndices: number[] = [];
    for (let i = 0; i < moves.length; i++) if (moves[i].kind === 'tableau-to-foundation') animIndices.push(i);
    const animCount = animIndices.length;
    let completed = 0;

    if (animCount === 0) {
      this.turnController.finalizeAutoComplete();
      return;
    }

    // Use card-to-foundation sound for safe auto-moves to match manual foundation move feedback,
    // and auto-complete-card sound for endgame auto-complete.
    const endSfx = isSafeAutoMove ? SFX_KEYS.CARD_TO_FOUNDATION : SFX_KEYS.AUTO_COMPLETE_CARD;
    const gameEventName = isSafeAutoMove ? 'card-to-foundation' : 'auto-complete-card';

    for (let j = 0; j < animIndices.length; j++) {
      const i = animIndices[j];
      const move = moves[i];
      const cardInfo = moveCards[i];

      if (move.kind !== 'tableau-to-foundation') {
        completed++;
        if (completed >= animCount) this.turnController.finalizeAutoComplete();
        continue;
      }

      const fromCol = move.fromCol;
      const colSprites = this.bcRenderer.tableauSprs[fromCol];
      if (!colSprites || colSprites.length === 0) {
        completed++;
        if (completed >= animCount) this.turnController.finalizeAutoComplete();
        continue;
      }

      const expectedKey = cardTextureKey(cardInfo.rank as any, cardInfo.suit as any);


      let sourceSprite: Phaser.GameObjects.Image | undefined;
      for (const s of colSprites) {
        if (s.texture && s.texture.key === expectedKey) { sourceSprite = s; break; }
      }
      if (!sourceSprite) sourceSprite = colSprites[colSprites.length - 1];

      const startX = sourceSprite.x;
      const startY = sourceSprite.y;

      try { sourceSprite.setVisible(false); } catch {}

      const destIndex = move.toFoundation;
      const destSprite = this.bcRenderer.foundationSprites[destIndex];
      const destX = destSprite.x;
      const destY = destSprite.y;

      const moving = this.add.image(startX, startY, expectedKey).setDepth(5000).setAlpha(1);


      this.time.delayedCall(j * STAGGER_MS, () => {
        moveGameObject({
          scene: this,
          target: moving,
          destX,
          destY,
          duration: Math.max(AUTO_COMPLETE_MIN_DURATION, ANIM_DURATION),
          soundManager: this.soundManager ?? null,
          sfx: { start: SFX_KEYS.CARD_PICKUP, end: endSfx },
          onComplete: () => {
            try { moving.destroy(); } catch {}
            this.gameEvents.emit(gameEventName, { suit: cardInfo.suit, rank: cardInfo.rank, foundationIndex: destIndex });

            // restore visibility; final refresh after command execution will re-render settled board
            try { sourceSprite.setVisible(true); } catch {}

            completed++;
            if (completed >= animCount) {
              this.turnController.finalizeAutoComplete();
            }
          },
        });
      });
    }
  }

  private handleSoundEvent(event: string, _data?: any): void {
    if (event === 'timer-started') {
      this.startTimer();
    }
  }

  // ── Timer ───────────────────────────────────────────────
  private startTimer(): void {
    this.elapsedSeconds = 0;
    this.timerEvent = this.time.addEvent({
      delay: 1000,
      callback: () => {
        this.elapsedSeconds++;
        this.bcRenderer.setTimerText(this.elapsedSeconds);
      },
      callbackScope: this,
      loop: true,
    });
  }

  private stopTimer(): void {
    if (this.timerEvent) this.timerEvent.paused = true;
  }

  private resumeTimer(): void {
    if (this.timerEvent) this.timerEvent.paused = false;
  }

  // ── Resume / Fresh start ────────────────────────────────
  /**
   * Asynchronously check for a saved checkpoint.
   * Called on the frame after create() completes, so the deal animation
   * (started synchronously) is already in progress. If a checkpoint is
   * found, the resume overlay is shown over the dealing board.
   *
   * When the user clicks "Resume", the deal state is replaced by the
   * saved checkpoint (the half-dealt animation is discarded). When the
   * user clicks "New Game", the checkpoint is deleted and the scene
   * restarts fresh.
   */
  private checkForSavedCheckpoint(): void {
    this.checkpointManager.checkAndResume(
      () => this.startFreshGame(),
      (state) => this.restoreFromCheckpoint(state),
      (state, onResume) => this.showResumeOverlay(state, onResume),
    );
  }

  /**
   * Show a "Resume Saved Game?" overlay with Resume and New Game options.
   */
  private showResumeOverlay(
    _savedState: BeleagueredCastleState,
    onResume: () => void,
  ): void {
    const BUTTON_DEPTH = OVERLAY_DEPTH + 1;

    this.overlayManager.showOverlay({
      type: 'custom',
      backgroundOptions: { depth: OVERLAY_DEPTH, alpha: OVERLAY_BG_ALPHA },
    });

    const title = this.add.text(GAME_W / 2, GAME_H / 2 + RESUME_TITLE_Y_OFFSET, 'Resume Saved Game?', {
      fontSize: RESUME_TITLE_FONT_SIZE,
      color: '#ffcc00',
      fontFamily: FONT_FAMILY,
      fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(BUTTON_DEPTH);
    this.overlayManager.add(title);

    const infoText = this.add.text(GAME_W / 2, GAME_H / 2 + RESUME_INFO_Y_OFFSET,
      `A checkpoint was found from a previous game.\nResume where you left off or start fresh.`,
      { fontSize: RESUME_INFO_FONT_SIZE, color: '#cccccc', fontFamily: FONT_FAMILY, align: 'center' },
    ).setOrigin(0.5).setDepth(BUTTON_DEPTH);
    this.overlayManager.add(infoText);

    const resumeBtn = createOverlayButton(this, GAME_W / 2 - RESUME_BUTTON_SPACING, GAME_H / 2 + RESUME_BUTTON_Y_OFFSET, '[ Resume ]', BUTTON_DEPTH);
    resumeBtn.on('pointerdown', () => {
      this.overlayManager.dismiss();
      onResume();
    });
    this.overlayManager.add(resumeBtn);

    const newGameBtn = createOverlayButton(this, GAME_W / 2 + RESUME_BUTTON_SPACING, GAME_H / 2 + RESUME_BUTTON_Y_OFFSET, '[ New Game ]', BUTTON_DEPTH);
    newGameBtn.on('pointerdown', () => {
      this.overlayManager.dismiss();
      this.checkpointManager.clear().then(() => {
        this.scene.restart();
      }).catch(() => {
        this.scene.restart();
      });
    });
    this.overlayManager.add(newGameBtn);
  }

  /**
   * Restore the game from a saved checkpoint.
   *
   * Mutates the existing game state's piles (rather than replacing the state
   * object) so that the renderer and turn controller — which hold references
   * to the original gameState — stay synchronised.
   *
   * Skips the deal animation and wires up interactions immediately.
   */
  private restoreFromCheckpoint(savedState: BeleagueredCastleState): void {
    // Mutate existing piles (don't replace the state object, since renderer
    // and turn controller hold references to the original)
    for (let i = 0; i < FOUNDATION_COUNT; i++) {
      this.gameState.foundations[i].clear();
      for (const card of savedState.foundations[i].toArray()) {
        this.gameState.foundations[i].push(card);
      }
    }
    for (let i = 0; i < TABLEAU_COUNT; i++) {
      this.gameState.tableau[i].clear();
      for (const card of savedState.tableau[i].toArray()) {
        this.gameState.tableau[i].push(card);
      }
    }
    // seed is readonly on the interface; use the class field instead
    this.gameState.moveCount = savedState.moveCount;
    this.seed = savedState.seed;
    this.dealComplete = true;

    // Rebuild the turn controller with a fresh undo stack
    const recorder = new BCTranscriptRecorder(this.seed, this.gameState);
    this.turnController = new BeleagueredCastleTurnController(this.gameState, recorder, {
      onRefresh: () => this.refreshAll(),
      onCheckGameEnd: () => this.handleGameEnd(),
      onAutoCompleteVisual: (moves, moveCards, isSafeAutoMove) => this.runAutoCompleteVisuals(moves, moveCards, isSafeAutoMove),
      onAutoCompleteDone: () => this.handleAutoCompleteDone(),
      onSoundEvent: (event, data) => this.handleSoundEvent(event, data),
      onSaveCheckpoint: () => this.saveCheckpoint(),
    });

    // Reassign callbacks that reference the new turn controller
    this.initUndoRedoButtons(
      () => this.turnController.performUndo(),
      () => this.turnController.performRedo(),
    );
    this.onNewGame = () => { this.seed = Date.now(); this.scene.restart(); };
    this.onRestart = () => this.scene.restart();
    this.onUndoLast = () => { this.overlayManager.dismiss(); this.gameEnded = false; this.resumeTimer(); this.turnController.performUndo(); };

    // Refresh the renderer with the restored state
    this.bcRenderer.refreshAll(true, false);
    this.refreshUndoRedoButtons(this.turnController.canUndo, this.turnController.canRedo);

    // Wire up interactions (no deal animation since dealComplete is already true)
    this.setupDragAndDrop();
    this.setupClickToMove();
    this.setupKeyboard();
  }

  /**
   * Start a fresh game (no saved checkpoint).
   * Runs the deal animation and wires up interactions as normal.
   */
  private startFreshGame(): void {
    this.bcRenderer.dealTableauAnimated();
    this.setupDragAndDrop();
    this.setupClickToMove();
    this.setupKeyboard();
  }

  // ── Save/Load ───────────────────────────────────────────
  /**
   * Save a game-state checkpoint after deal or each player move.
   * Fire-and-forget (not awaited) to avoid blocking the input handler.
   */
  private saveCheckpoint(): void {
    this.checkpointManager.save(this.gameState).catch((err) =>
      console.warn('[BeleagueredCastle] Failed to save checkpoint:', err),
    );
  }

  /**
   * Auto-save the finalized transcript to browser storage.
   * Fire-and-forget (not awaited). Skips if no transcript has been finalized.
   */
  private autoSaveTranscript(): void {
    if (!this.transcript) return;
    autoSaveTranscript(this.transcriptStore, 'beleaguered-castle', this.transcript, '[BeleagueredCastle]');
  }

  // ── Refresh ─────────────────────────────────────────────
  private refreshAll(): void {
    this.bcRenderer.refreshAll(this.dealComplete, this.interactionBlocked);
    this.refreshUndoRedoButtons(this.turnController.canUndo, this.turnController.canRedo);
  }

  // ── Replay API ──────────────────────────────────────────
  loadBoardState(snapshot: BoardSnapshot): void {
    if (!this.replayMode) throw new Error('loadBoardState() is only available in replay mode');

    for (let i = 0; i < FOUNDATION_COUNT; i++) {
      const fs = snapshot.foundations[i];
      this.gameState.foundations[i].clear();
      if (fs.size > 0 && fs.topRank !== null) {
        const topIdx = RANKS.indexOf(fs.topRank);
        for (let ri = 0; ri <= topIdx; ri++) {
          this.gameState.foundations[i].push(createCard(RANKS[ri], fs.suit, true));
        }
      }
    }

    for (let col = 0; col < TABLEAU_COUNT; col++) {
      this.gameState.tableau[col].clear();
      const cs = snapshot.tableau[col];
      for (const cardSnap of cs.cards) {
        this.gameState.tableau[col].push(createCard(cardSnap.rank as Rank, cardSnap.suit as Suit, true));
      }
    }

    this.bcRenderer.refreshFoundations();
    this.bcRenderer.refreshTableau();
    this.bcRenderer.refreshHUD();
    this.emitStateSettled(this.gameState.moveCount, this.gameEnded ? 'ended' : 'playing');
  }

  // ── Test accessors ──────────────────────────────────────
  getGameState(): BeleagueredCastleState { return this.gameState; }
  getUndoManager() { return this.turnController['undoManager']; }
  getSeed(): number { return this.seed; }
  getElapsedSeconds(): number { return this.elapsedSeconds; }
  isDealComplete(): boolean { return this.dealComplete; }
  isGameEnded(): boolean { return this.gameEnded; }
  getTranscript(): BCGameTranscript | null { return this.transcript; }
  getRecorder(): BCTranscriptRecorder { return this.turnController['recorder']; }
  get tableauSprites(): Phaser.GameObjects.Image[][] { return this.bcRenderer.tableauSprs; }
  get foundationSprites(): Phaser.GameObjects.Image[] { return this.bcRenderer.foundationSprites; }
  get foundationDropZones(): Phaser.GameObjects.Zone[] { return this.bcRenderer.foundationDZs; }

  // ── Cleanup ─────────────────────────────────────────────
  shutdown(): void {
    if (this.timerEvent) { this.timerEvent.destroy(); this.timerEvent = null; }
    this.turnController.cancelAutoComplete();
    this.bcRenderer.clearDropHighlights();
    this.overlayManager.dismiss();
    this.shutdownBase();
  }

  // ── Overlay helpers ────────────────────────────────────

  private showWinOverlay(elapsedSeconds: number, _soundManager?: { play: (key: string) => void } | null): void {
    const minutes = Math.floor(elapsedSeconds / 60);
    const seconds = elapsedSeconds % 60;
    const mm = String(minutes).padStart(2, '0');
    const ss = String(seconds).padStart(2, '0');

    const result = createGameOverOverlay(this, {
      title: 'You Win!',
      titleColor: '#88ff88',
      summaryText: `Moves: ${this.gameState.moveCount}    Time: ${mm}:${ss}`,
      onPlayAgain: () => this.onNewGame?.(),
      onMenu: () => this.scene.start('GameSelectorScene'),
      playAgainLabel: 'Play Again',
      menuLabel: 'Menu',
      extraButtons: [{ label: 'Restart', onClick: () => this.onRestart?.() }],
    });
    this.overlayManager.add(...result.objects);
  }

  private showNoMovesOverlay(): void {
    const BUTTON_DEPTH = OVERLAY_DEPTH + 1;

    this.overlayManager.showOverlay({
      type: 'game-over',
      backgroundOptions: { depth: OVERLAY_DEPTH, alpha: OVERLAY_BG_ALPHA },
    });

    const title = createHudText(this, GAME_W / 2, GAME_H / 2 + OVERLAY_CONTENT_Y_OFFSET,
      'No Productive Moves Available', '#ff8888', {
        fontSize: OVERLAY_STATS_FONT_SIZE,
        originX: 0.5,
        originY: 0.5,
      });
    title.setDepth(BUTTON_DEPTH);
    this.overlayManager.add(title);

    const undoBtn = createOverlayButton(this, GAME_W / 2 - 180, GAME_H / 2 + 30, '[ Undo Last ]', BUTTON_DEPTH);
    undoBtn.on('pointerdown', () => this.onUndoLast?.());
    this.overlayManager.add(undoBtn);

    const newGameBtn = createOverlayButton(this, GAME_W / 2 - 30, GAME_H / 2 + 30, '[ New Game ]', BUTTON_DEPTH);
    newGameBtn.on('pointerdown', () => this.onNewGame?.());
    this.overlayManager.add(newGameBtn);

    const restartBtn = createOverlayButton(this, GAME_W / 2 + 110, GAME_H / 2 + 30, '[ Restart ]', BUTTON_DEPTH);
    restartBtn.on('pointerdown', () => this.onRestart?.());
    this.overlayManager.add(restartBtn);
  }
}
