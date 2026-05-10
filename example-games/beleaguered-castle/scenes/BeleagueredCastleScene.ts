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
} from '../../../src/ui';
import type { EventSoundMapping } from '../../../src/core-engine/SoundManager';
import type { HelpSection } from '../../../src/ui';
import helpContent from '../help-content.json';

import { SFX_KEYS } from './BeleagueredCastleConstants';
import { BeleagueredCastleRenderer } from './BeleagueredCastleRenderer';
import { BeleagueredCastleOverlayManager } from './BeleagueredCastleOverlayManager';
import { BeleagueredCastleTurnController } from './BeleagueredCastleTurnController';

export class BeleagueredCastleScene extends CardGameScene {
  private gameState!: BeleagueredCastleState;
  private seed: number = Date.now();
  private dealComplete: boolean = false;
  private selectedCol: number | null = null;
  private elapsedSeconds: number = 0;
  private timerEvent: Phaser.Time.TimerEvent | null = null;
  private gameEnded: boolean = false;
  private transcript: BCGameTranscript | null = null;

  private bcRenderer!: BeleagueredCastleRenderer;
  private overlayManager!: BeleagueredCastleOverlayManager;
  private turnController!: BeleagueredCastleTurnController;

  constructor() {
    super({ key: 'BeleagueredCastleScene' });
  }

  private get interactionBlocked(): boolean {
    return !this.dealComplete || this.gameEnded || this.turnController.autoCompleting;
  }

  preload(): void {
    preloadCardAssets(this, 90, 126);
    const audioDir = 'assets/audio/beleaguered-castle';
    this.load.audio(SFX_KEYS.CARD_PICKUP, `${audioDir}/card-pickup.wav`);
    this.load.audio(SFX_KEYS.CARD_TO_FOUNDATION, `${audioDir}/card-to-foundation.wav`);
    this.load.audio(SFX_KEYS.CARD_TO_TABLEAU, `${audioDir}/card-to-tableau.wav`);
    this.load.audio(SFX_KEYS.CARD_SNAP_BACK, `${audioDir}/card-snap-back.wav`);
    this.load.audio(SFX_KEYS.DEAL_CARD, `${audioDir}/deal-card.wav`);
    this.load.audio(SFX_KEYS.WIN_FANFARE, `${audioDir}/win-fanfare.wav`);
    this.load.audio(SFX_KEYS.LOSS_SOUND, `${audioDir}/loss-sound.wav`);
    this.load.audio(SFX_KEYS.AUTO_COMPLETE_START, `${audioDir}/auto-complete-start.wav`);
    this.load.audio(SFX_KEYS.AUTO_COMPLETE_CARD, `${audioDir}/auto-complete-card.wav`);
    this.load.audio(SFX_KEYS.UNDO, `${audioDir}/undo.wav`);
    this.load.audio(SFX_KEYS.REDO, `${audioDir}/redo.wav`);
    this.load.audio(SFX_KEYS.CARD_SELECT, `${audioDir}/card-select.wav`);
    this.load.audio(SFX_KEYS.CARD_DESELECT, `${audioDir}/card-deselect.wav`);
    this.load.audio(SFX_KEYS.UI_CLICK, `${audioDir}/ui-click.wav`);
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#2d572c');

    const params = new URLSearchParams(window.location.search);
    const seedParam = params.get('seed');
    this.seed = seedParam ? parseInt(seedParam, 10) : Date.now();

    this.detectReplayMode();
    this.gameState = deal(this.seed);
    this.dealComplete = false;
    this.selectedCol = null;
    this.elapsedSeconds = 0;
    this.gameEnded = false;
    this.transcript = null;

    const recorder = new BCTranscriptRecorder(this.seed, this.gameState);

    this.bcRenderer = new BeleagueredCastleRenderer(this, this.gameState);
    this.overlayManager = new BeleagueredCastleOverlayManager(this, this.gameState);
    this.turnController = new BeleagueredCastleTurnController(this.gameState, recorder, {
      onRefresh: () => this.refreshAll(),
      onCheckGameEnd: () => this.handleGameEnd(),
      onAutoCompleteVisual: (moves, moveCards) => this.runAutoCompleteVisuals(moves, moveCards),
      onAutoCompleteDone: () => this.handleAutoCompleteDone(),
      onSoundEvent: (event, data) => this.handleSoundEvent(event, data),
    });

    this.overlayManager.setCallbacks(
      () => { this.seed = Date.now(); this.scene.restart(); },
      () => this.scene.restart(),
      () => { this.overlayManager.dismiss(); this.gameEnded = false; this.resumeTimer(); this.turnController.performUndo(); },
    );

    this.bcRenderer.createTitle();
    this.bcRenderer.createFoundationSlots();
    this.bcRenderer.createTableauDropZones();
    this.bcRenderer.createHUD(this.seed);
    this.bcRenderer.onUndoClick = () => this.turnController.performUndo();
    this.bcRenderer.onRedoClick = () => this.turnController.performRedo();
    this.bcRenderer.onDealCard = (info) => this.gameEvents.emit('deal-card', info);
    this.bcRenderer.onDealComplete = () => { this.dealComplete = true; this.bcRenderer.makeDraggable(this.interactionBlocked); this.bcRenderer.refreshUndoRedoButtons(this.turnController.canUndo, this.turnController.canRedo); };
    this.bcRenderer.onCardClick = (col) => this.handleCardClick(col);

    this.initEventSystem();

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
      this.initSoundSystem(Object.values(SFX_KEYS), mapping);
      this.initSettingsPanel();
    }

    this.bcRenderer.refreshFoundations();

    if (this.replayMode) {
      this.dealComplete = true;
      this.bcRenderer.refreshTableau();
      this.bcRenderer.refreshHUD();
      this.emitStateSettled(this.gameState.moveCount, this.gameEnded ? 'ended' : 'playing');
    } else {
      this.bcRenderer.dealTableauAnimated();
      this.setupDragAndDrop();
      this.setupClickToMove();
      this.setupKeyboard();
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
      if (!dropped) this.bcRenderer.snapBack(gameObject);
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

    if (zoneType === 'foundation' && isLegalFoundationMove(this.gameState, fromCol, zoneIndex)) {
      move = { kind: 'tableau-to-foundation', fromCol, toFoundation: zoneIndex };
    } else if (zoneType === 'tableau' && zoneIndex !== fromCol && isLegalTableauMove(this.gameState, fromCol, zoneIndex)) {
      move = { kind: 'tableau-to-tableau', fromCol, toCol: zoneIndex };
    }

    if (move) {
      this.turnController.executePlayerMove(move);
    } else {
      this.bcRenderer.snapBack(sprite);
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
        if (isLegalFoundationMove(this.gameState, this.selectedCol, fi)) {
          const move: BCMove = { kind: 'tableau-to-foundation', fromCol: this.selectedCol, toFoundation: fi };
          this.deselectColumn();
          this.turnController.executePlayerMove(move);
        } else {
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
        if (isLegalTableauMove(this.gameState, this.selectedCol, col)) {
          const move: BCMove = { kind: 'tableau-to-tableau', fromCol: this.selectedCol, toCol: col };
          this.deselectColumn();
          this.turnController.executePlayerMove(move);
        } else {
          this.deselectColumn();
        }
      });
    }
  }

  private handleCardClick(colIndex: number): void {
    if (this.interactionBlocked) return;
    if (this.selectedCol === colIndex) { this.deselectColumn(); return; }
    if (this.selectedCol !== null) {
      if (isLegalTableauMove(this.gameState, this.selectedCol, colIndex)) {
        const move: BCMove = { kind: 'tableau-to-tableau', fromCol: this.selectedCol, toCol: colIndex };
        this.deselectColumn();
        this.turnController.executePlayerMove(move);
        return;
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
      this.overlayManager.showWinOverlay(this.elapsedSeconds);
    } else {
      this.gameEnded = true;
      this.stopTimer();
      this.transcript = this.turnController['recorder'].finalize('loss', this.gameState.moveCount, this.elapsedSeconds);
      this.gameEvents.emit('game-ended', { finalTurnNumber: this.gameState.moveCount, winnerIndex: -1, reason: 'no-moves' });
      this.overlayManager.showNoMovesOverlay();
    }
  }

  private handleAutoCompleteDone(): void {
    if (isWon(this.gameState)) {
      this.gameEnded = true;
      this.stopTimer();
      this.transcript = this.turnController['recorder'].finalize('win', this.gameState.moveCount, this.elapsedSeconds);
      this.overlayManager.showWinOverlay(this.elapsedSeconds, this.soundManager);
    }
  }

  private runAutoCompleteVisuals(moves: BCMove[], _moveCards: Array<{ suit: string; rank: string; foundationIndex: number }>): void {
    this.turnController.scheduleAutoCompleteTimers(moves, this, (_move, _cardInfo) => {
      this.bcRenderer.refreshFoundations();
    }, () => this.handleAutoCompleteDone());
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

  // ── Refresh ─────────────────────────────────────────────
  private refreshAll(): void {
    this.bcRenderer.refreshAll(this.dealComplete, this.interactionBlocked);
    this.bcRenderer.refreshUndoRedoButtons(this.turnController.canUndo, this.turnController.canRedo);
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
  get foundationSprites(): Phaser.GameObjects.Image[] { return (this.bcRenderer as any).foundationSprites; }
  get foundationDropZones(): Phaser.GameObjects.Zone[] { return this.bcRenderer.foundationDZs; }

  // ── Cleanup ─────────────────────────────────────────────
  shutdown(): void {
    if (this.timerEvent) { this.timerEvent.destroy(); this.timerEvent = null; }
    this.turnController.cancelAutoComplete();
    this.bcRenderer.clearDropHighlights();
    this.overlayManager.dismiss();
    this.shutdownBase();
  }
}
