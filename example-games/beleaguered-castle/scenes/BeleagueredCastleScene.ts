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
import type { BCVariant } from '../BeleagueredCastleRules';
import { getBcVariant, setBcVariant } from '../BeleagueredCastleVariant';
import { BeleagueredCastleAiPlayer, SolverStrategy } from '../BeleagueredCastleAi';
import { BCTranscriptRecorder } from '../GameTranscript';
import type { BCGameTranscript, BoardSnapshot } from '../GameTranscript';
import {
  CardGameScene,
  preloadCardAssets,
  OverlayManager,
  audioPathWithFallback,
  createGameOverOverlay,
  createDragDropManager,
  DEFAULT_DRAG_DISTANCE_THRESHOLD,
} from '../../../src/ui';
import type { DragDropManager, DragDropPayload } from '../../../src/ui';
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
  SNAP_BACK_DURATION, DRAG_DEPTH,
  HINT_BUTTON_WIDTH, HINT_BAR_Y_OFFSET,
  VARIANT_TITLE_FONT_SIZE, VARIANT_TITLE_Y_OFFSET,
  VARIANT_INFO_Y_OFFSET, VARIANT_BUTTON_Y_OFFSET,
  VARIANT_BUTTON_SPACING, VARIANT_DESC_Y_OFFSET,
  VARIANT_HIGHLIGHT_COLOR,
} from './BeleagueredCastleConstants';
import { BeleagueredCastleRenderer } from './BeleagueredCastleRenderer';
import type { BCTopCardDragData, BCZoneDragData } from './BeleagueredCastleRenderer';
import { BeleagueredCastleTurnController } from './BeleagueredCastleTurnController';
import { moveGameObject, cardTextureKey } from '../../../src/ui';
import { shakeIllegalMove } from '../../../src/ui/shakeIllegalMove';
import {
  GAME_W, GAME_H, FONT_FAMILY,
  createOverlayButton,
  createActionButton,
  HintBar,
} from '../../../src/ui';
import { createHudText } from '../../../src/ui/Renderer/adapters/BeleagueredCastleAdapter';
import { SaveLoadStore } from '../../../src/core-engine';
import { TranscriptStore, autoSaveTranscript } from '../../../src/core-engine/transcript';
import { CheckpointManager } from '../../../src/core-engine';
import { bcStateSerializer } from '../BeleagueredCastleSaveLoad';
import type { BCSerializedState } from '../BeleagueredCastleSaveLoad';

/** Unicode suit symbol for hint descriptions. */
function suitSymbol(suit: Suit): string {
  switch (suit) {
    case 'clubs': return '♣';
    case 'diamonds': return '♦';
    case 'hearts': return '♥';
    case 'spades': return '♠';
  }
}

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

  /** AI player used by the hint system (bound to SolverStrategy). */
  private hintAiPlayer = new BeleagueredCastleAiPlayer(SolverStrategy);
  /** HUD hint button (created by initHintButton). */
  private hintBtn: Phaser.GameObjects.Container | null = null;
  /** Shared hint bar showing the suggested-move description. */
  private hintBar: HintBar | null = null;
  /** Reusable core-engine drag-drop manager (created in create). */
  private dragDropManager: DragDropManager | null = null;

  private onNewGame?: () => void;
  private onRestart?: () => void;
  private onUndoLast?: () => void;

  /**
   * True once click-to-move zones and keyboard listeners are wired.
   * Guards against duplicate input registration when the deal path runs
   * more than once in a scene lifetime (e.g. variant popup re-deal).
   */
  private inputWired = false;

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
      this.syncDragEnabled();
      this.bcRenderer.makeDraggable();
      this.refreshUndoRedoButtons(this.turnController.canUndo, this.turnController.canRedo);
      this.saveCheckpoint();
    };
    this.bcRenderer.onCardClick = (col) => this.handleCardClick(col);
    this.bcRenderer.onCardDragDrop = (payload) => this.handleDrop(payload);

    if (!this.replayMode) {
      this.initHUDContainer();
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
      // Allow tests to force reduced motion via a window flag
      if ((window as any).__BC_TEST_REDUCED_MOTION__) {
        this.bcRenderer.reducedMotion = true;
      }
      this.initDragDrop();
      this.initUndoRedoButtons(
        () => this.turnController.performUndo(),
        () => this.turnController.performRedo(),
      );
      this.initHintButton();
      this.hintBar = new HintBar(this, { y: GAME_H - HINT_BAR_Y_OFFSET, startVisible: false });
    }

    this.bcRenderer.refreshFoundations();

    if (this.replayMode) {
      this.dealComplete = true;
      this.bcRenderer.refreshTableau();
      this.bcRenderer.refreshHUD();
      this.emitStateSettled(this.gameState.moveCount, this.gameEnded ? 'ended' : 'playing');
    } else if ((window as any).__BC_TEST_REDUCED_MOTION__) {
      // Test mode: skip checkpoint check and deal animation, go straight
      // to the game-ready state with reduced motion (instant deal).
      this.startFreshGame();
    } else {
      // First check for a saved checkpoint. If one exists, show the resume
      // overlay — no deal animation runs until the user decides. If no
      // checkpoint, start a fresh deal on the next frame.
      this.time.delayedCall(0, () => this.checkForSavedCheckpoint());
    }
  }

  // ── Input handling ──────────────────────────────────────
  /**
   * Create the reusable core-engine drag-drop manager and register the
   * foundation + tableau drop zones. Tableau top cards are registered as
   * draggables by the renderer (makeDraggable) on every board render.
   *
   * The whole drag lifecycle (origin capture, depth raise, valid-drop
   * highlights, snap-back, illegal feedback) is delegated to the shared
   * module (src/ui/dragDrop.ts) — the scene registers no bespoke
   * dragstart/drag/dragend/drop handlers.
   */
  private initDragDrop(): void {
    if (this.dragDropManager) return;
    // Headless guard: unit tests may boot without a full input plugin.
    if (!this.input || typeof this.input.on !== 'function') return;

    this.dragDropManager = createDragDropManager({
      scene: this,
      dragDistanceThreshold: DEFAULT_DRAG_DISTANCE_THRESHOLD,
      // BC's timing/depth constants stay authoritative for the module.
      dragDepth: DRAG_DEPTH,
      snapBackDuration: SNAP_BACK_DURATION,
      reducedMotion: this.bcRenderer.reducedMotion,
      onDragStart: (payload) => {
        const data = payload.data as BCTopCardDragData;
        this.deselectColumn();
        const col = this.gameState.tableau[data.colIndex];
        const topCard = col.peek();
        if (topCard) {
          this.gameEvents.emit('card-pickup', { suit: topCard.suit, rank: topCard.rank, source: 'tableau' });
        }
        this.bcRenderer.showValidDropHighlights(data.colIndex, () => getLegalMoves(this.gameState));
      },
      onDragEnd: () => this.bcRenderer.clearDropHighlights(),
    });
    // Hand the manager to the renderer so makeDraggable can register the
    // tableau top cards as draggables on every board render.
    this.bcRenderer.dragDropManager = this.dragDropManager;

    for (let fi = 0; fi < FOUNDATION_COUNT; fi++) {
      this.dragDropManager.registerDropZone({
        zone: this.bcRenderer.foundationDZs[fi],
        data: { type: 'foundation', index: fi } satisfies BCZoneDragData,
        canAccept: (payload) => {
          const fromCol = (payload.data as BCTopCardDragData).colIndex;
          return isLegalFoundationMove(this.gameState, fromCol, fi).legal;
        },
      });
    }
    for (let col = 0; col < TABLEAU_COUNT; col++) {
      this.dragDropManager.registerDropZone({
        zone: this.bcRenderer.tableauDZs[col],
        data: { type: 'tableau', index: col } satisfies BCZoneDragData,
        canAccept: (payload) => {
          const fromCol = (payload.data as BCTopCardDragData).colIndex;
          return col !== fromCol && isLegalTableauMove(this.gameState, fromCol, col).legal;
        },
      });
    }
  }

  /**
   * Execute an accepted drag-drop move. The drag-drop module only invokes
   * this for drops on registered zones whose canAccept passed; rejected
   * drops snap back with illegal feedback automatically.
   */
  private handleDrop(payload: DragDropPayload): void {
    const data = payload.data as BCTopCardDragData;
    const zoneData = payload.zoneData as BCZoneDragData;
    const move: BCMove = zoneData.type === 'foundation'
      ? { kind: 'tableau-to-foundation', fromCol: data.colIndex, toFoundation: zoneData.index }
      : { kind: 'tableau-to-tableau', fromCol: data.colIndex, toCol: zoneData.index };
    this.turnController.executePlayerMove(move);
  }

  /**
   * Keep the drag-drop manager's enabled state in sync with interaction
   * blocking (deal in progress, game ended, auto-complete running) — the
   * module's handlers return silently while disabled, matching the bespoke
   * handlers' early-return behaviour.
   */
  private syncDragEnabled(): void {
    this.dragDropManager?.setEnabled(!this.interactionBlocked);
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

  // ── Hint system ──────────────────────────────────────────
  /**
   * Create the HUD hint button, positioned to the left of the Undo button
   * (which itself sits left of Redo / Settings). The button asks the AI
   * solver for the best move and highlights the suggestion.
   */
  private initHintButton(): void {
    if (!this.undoButton) return;
    const gap = 12;
    // undoButton.x is the container centre; half width is 30.
    const hintLeftEdge = this.undoButton.x - 30 - gap;
    const hintTopEdge = this.undoButton.y - 16;
    this.hintBtn = createActionButton(
      this, hintLeftEdge, hintTopEdge, HINT_BUTTON_WIDTH, 'Hint',
      () => this.requestHint(),
      { fillColor: 0x224466, strokeColor: 0x4488aa, textColor: '#88ccff' },
    );
    if (this.hudContainer) this.hudContainer.add(this.hintBtn);
  }

  /**
   * Ask the AI solver for the best move and display the suggestion:
   * source and destination highlights plus a text description.
   * No-op while interaction is blocked (dealing, ended, auto-completing).
   */
  requestHint(): void {
    if (this.interactionBlocked) return;
    this.deselectColumn();

    const move = this.hintAiPlayer.suggestMove(this.gameState);
    this.hintBar?.show();
    if (!move) {
      this.bcRenderer.clearHint();
      this.hintBar?.setText('No moves available — try Undo or New Game');
      this.gameEvents.emit('ui-interaction', { elementId: 'hint-button', action: 'hint-no-move' });
      return;
    }

    this.bcRenderer.showHint(move);
    this.hintBar?.setText(this.describeHint(move));
    this.gameEvents.emit('ui-interaction', { elementId: 'hint-button', action: 'hint-suggested' });
  }

  /** Human-readable description of the suggested move. */
  private describeHint(move: BCMove): string {
    const source = this.gameState.tableau[move.fromCol].peek();
    const cardLabel = source ? `${source.rank}${suitSymbol(source.suit)}` : 'card';
    if (move.kind === 'tableau-to-foundation') {
      return `Hint: move ${cardLabel} to the foundation`;
    }
    const destTop = this.gameState.tableau[move.toCol].peek();
    if (destTop) {
      return `Hint: move ${cardLabel} onto ${destTop.rank}${suitSymbol(destTop.suit)}`;
    }
    return `Hint: move ${cardLabel} to the empty column`;
  }

  // ── Game end ────────────────────────────────────────────
  private handleGameEnd(): void {
    this.syncDragEnabled();
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
    this.syncDragEnabled();
    if (isWon(this.gameState)) {
      this.gameEnded = true;
      this.stopTimer();
      this.transcript = this.turnController['recorder'].finalize('win', this.gameState.moveCount, this.elapsedSeconds);
      this.autoSaveTranscript();
      this.showWinOverlay(this.elapsedSeconds, this.soundManager);
    }
  }

  private runAutoCompleteVisuals(moves: BCMove[], moveCards: Array<{ suit: string; rank: string; foundationIndex: number }>, isSafeAutoMove?: boolean): void {
    // Block drags while the auto-complete animation is running.
    this.syncDragEnabled();
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
    // The checkpoint load is async (IndexedDB/localStorage) and the promise
    // may settle after the scene has been shut down (e.g. a browser test
    // destroys the game while the load is in flight). Guard every callback
    // against that so we never touch a torn-down scene (CG-0MSBZ7ZW500521ZH).
    this.checkpointManager.checkAndResume(
      // No checkpoint: ask the player for the deal variant (Classic or
      // Citadel) before the deal animation runs. The popup re-deals the
      // placeholder state with the chosen variant, then deals the tableau.
      () => { if (this.isSceneAlive()) this.showVariantPopup(); },
      (state) => { if (this.isSceneAlive()) this.restoreFromCheckpoint(state); },
      (state, onResume) => { if (this.isSceneAlive()) this.showResumeOverlay(state, onResume); },
    ).catch((err) => {
      // Safety net: never surface an unhandled rejection for a check that
      // settled after teardown. Genuine failures on a live scene are logged.
      if (this.isSceneAlive()) {
        console.warn('[BeleagueredCastle] checkpoint resume check failed:', err);
      }
    });
  }

  /**
   * True while this scene is still running. Used to guard async callbacks
   * (e.g. the checkpoint resume check) that may resolve after the scene has
   * been shut down — running scene UI against a torn-down scene throws
   * obscure errors such as "Cannot read properties of null (reading 'add')".
   */
  private isSceneAlive(): boolean {
    try {
      return this.scene.isActive();
    } catch {
      return false;
    }
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

    // Refresh the renderer with the restored state (re-registers draggables
    // via makeDraggable; syncDragEnabled runs inside refreshAll)
    this.bcRenderer.refreshAll(true);
    this.refreshUndoRedoButtons(this.turnController.canUndo, this.turnController.canRedo);

    // Wire up interactions (no deal animation since dealComplete is already true)
    this.wireInput();
  }

  /**
   * Start a fresh game (no saved checkpoint).
   * Runs the deal animation and wires up interactions as normal.
   */
  private startFreshGame(): void {
    this.bcRenderer.dealTableauAnimated();
    this.wireInput();
  }

  /**
   * Wire click-to-move zones and keyboard listeners exactly once per scene
   * lifetime. The variant-selection popup may re-deal the board after the
   * initial `startFreshGame` (e.g. in browser tests), so both `startFreshGame`
   * and `restoreFromCheckpoint` route through here to avoid registering
   * duplicate pointerdown/keydown handlers.
   */
  private wireInput(): void {
    if (this.inputWired) return;
    this.inputWired = true;
    this.setupClickToMove();
    this.setupKeyboard();
  }

  // ── Variant selection ────────────────────────────────────
  /**
   * Show the pre-game variant selection popup (Classic vs Citadel).
   *
   * Called when no saved checkpoint exists, before the deal animation.
   * The persisted variant (if any) is highlighted so the player can either
   * confirm it with one click or switch. Choosing a variant persists it to
   * browser storage and re-deals the board accordingly.
   */
  private showVariantPopup(): void {
    const BUTTON_DEPTH = OVERLAY_DEPTH + 1;
    const selected = getBcVariant();
    const cx = GAME_W / 2;
    const cy = GAME_H / 2;

    this.overlayManager.showOverlay({
      type: 'custom',
      backgroundOptions: { depth: OVERLAY_DEPTH, alpha: OVERLAY_BG_ALPHA },
    });

    const title = this.add.text(cx, cy + VARIANT_TITLE_Y_OFFSET, 'Choose a Variant', {
      fontSize: VARIANT_TITLE_FONT_SIZE,
      color: '#ffcc00',
      fontFamily: FONT_FAMILY,
      fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(BUTTON_DEPTH);
    this.overlayManager.add(title);

    const info = this.add.text(cx, cy + VARIANT_INFO_Y_OFFSET,
      'Pick how this game is dealt. Your choice is remembered for next time.',
      { fontSize: RESUME_INFO_FONT_SIZE, color: '#cccccc', fontFamily: FONT_FAMILY, align: 'center' },
    ).setOrigin(0.5).setDepth(BUTTON_DEPTH);
    this.overlayManager.add(info);

    const classicBtn = createOverlayButton(this, cx - VARIANT_BUTTON_SPACING, cy + VARIANT_BUTTON_Y_OFFSET, '[ Classic ]', BUTTON_DEPTH);
    classicBtn.on('pointerdown', () => this.chooseVariant('classic'));
    this.overlayManager.add(classicBtn);

    const citadelBtn = createOverlayButton(this, cx + VARIANT_BUTTON_SPACING, cy + VARIANT_BUTTON_Y_OFFSET, '[ Citadel ]', BUTTON_DEPTH);
    citadelBtn.on('pointerdown', () => this.chooseVariant('citadel'));
    this.overlayManager.add(citadelBtn);

    // Description of each variant under its button.
    const classicDesc = this.add.text(cx - VARIANT_BUTTON_SPACING, cy + VARIANT_DESC_Y_OFFSET,
      'Aces start on the foundations',
      { fontSize: '14px', color: '#aacccc', fontFamily: FONT_FAMILY, align: 'center' },
    ).setOrigin(0.5).setDepth(BUTTON_DEPTH);
    this.overlayManager.add(classicDesc);

    const citadelDesc = this.add.text(cx + VARIANT_BUTTON_SPACING, cy + VARIANT_DESC_Y_OFFSET,
      'All 52 cards dealt — uncover the aces',
      { fontSize: '14px', color: '#aacccc', fontFamily: FONT_FAMILY, align: 'center' },
    ).setOrigin(0.5).setDepth(BUTTON_DEPTH);
    this.overlayManager.add(citadelDesc);

    // Highlight the persisted selection so the player can confirm with a click.
    (selected === 'citadel' ? citadelBtn : classicBtn).setColor(VARIANT_HIGHLIGHT_COLOR);
  }

  /**
   * Apply the chosen variant: persist it, re-deal the placeholder state,
   * dismiss the popup, and run the deal animation.
   */
  private chooseVariant(variant: BCVariant): void {
    setBcVariant(variant);
    this.overlayManager.dismiss();
    this.redealForVariant(variant);
    this.startFreshGame();
  }

  /**
   * Replace the placeholder game state with a fresh deal of the given
   * variant, mutating the existing piles in place so the renderer and turn
   * controller (which hold references to the original state) stay in sync.
   *
   * The turn controller is rebuilt with a fresh recorder and undo stack
   * because `BCTranscriptRecorder` snapshots the initial board at
   * construction — a transcript must describe the chosen variant's deal,
   * not the classic placeholder state created in `create()`.
   */
  private redealForVariant(variant: BCVariant): void {
    const fresh = deal(this.seed, { variant });
    for (let i = 0; i < FOUNDATION_COUNT; i++) {
      this.gameState.foundations[i].clear();
      for (const card of fresh.foundations[i].toArray()) {
        this.gameState.foundations[i].push(card);
      }
    }
    for (let i = 0; i < TABLEAU_COUNT; i++) {
      this.gameState.tableau[i].clear();
      for (const card of fresh.tableau[i].toArray()) {
        this.gameState.tableau[i].push(card);
      }
    }
    this.gameState.moveCount = 0;
    this.bcRenderer.refreshFoundations();

    // Rebuild the turn controller with a fresh recorder + undo stack so the
    // transcript's initialState matches the chosen variant's deal.
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
    this.syncDragEnabled();
    this.bcRenderer.refreshAll(this.dealComplete);
    this.refreshUndoRedoButtons(this.turnController.canUndo, this.turnController.canRedo);
    // The suggestion is tied to the current board state; hide it once the
    // board changes (move, undo, redo, auto-complete).
    this.hintBar?.hide();
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
    this.bcRenderer.clearHint();
    this.hintBar?.destroy();
    this.hintBar = null;
    this.overlayManager.dismiss();
    // Release the drag-drop module's input listeners and registrations.
    if (this.dragDropManager) {
      try { this.dragDropManager.destroy(); } catch { /* ignore */ }
      this.dragDropManager = null;
    }
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
      background: { depth: OVERLAY_DEPTH, alpha: OVERLAY_BG_ALPHA },
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
