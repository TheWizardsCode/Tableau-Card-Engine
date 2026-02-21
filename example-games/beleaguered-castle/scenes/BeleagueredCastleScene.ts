/**
 * BeleagueredCastleScene -- the main Phaser scene for Beleaguered Castle.
 *
 * Features:
 *   - 4 foundation piles across the top (aces pre-placed)
 *   - 8 tableau columns below with vertical cascade overlap
 *   - Deal animation on scene start
 *   - HUD: move counter, timer, seed display
 *   - Drag-and-drop card interaction with visual feedback
 *   - Click-to-select then click-to-place card interaction
 *   - Undo/Redo via keyboard (Ctrl+Z / Ctrl+Y or Ctrl+Shift+Z)
 *   - Auto-move safe cards to foundations after each player move
 *   - Each move recorded as a Command in UndoRedoManager
 */

import Phaser from 'phaser';
import type { Suit } from '../../../src/card-system/Card';
import type { BeleagueredCastleState, BCMove } from '../BeleagueredCastleState';
import { FOUNDATION_COUNT, TABLEAU_COUNT, FOUNDATION_SUITS } from '../BeleagueredCastleState';
import {
  deal,
  applyMove,
  undoMove,
  isLegalFoundationMove,
  isLegalTableauMove,
  getLegalMoves,
  findSafeAutoMoves,
  isWon,
  hasNoMoves,
  isTriviallyWinnable,
  getAutoCompleteMoves,
} from '../BeleagueredCastleRules';
import type { Command } from '../../../src/core-engine/UndoRedoManager';
import { UndoRedoManager, CompoundCommand } from '../../../src/core-engine/UndoRedoManager';
import { BCTranscriptRecorder } from '../GameTranscript';
import type { BCGameTranscript } from '../GameTranscript';
import {
  HelpPanel, HelpButton,
  SettingsPanel, SettingsButton,
  CARD_W, CARD_H, GAME_W, GAME_H, FONT_FAMILY,
  cardTextureKey, preloadCardAssets,
  createOverlayBackground, dismissOverlay as sharedDismissOverlay,
  createOverlayButton, createOverlayMenuButton,
  createSceneTitle, createSceneMenuButton,
} from '../../../src/ui';
import type { HelpSection } from '../../../src/ui';
import { GameEventEmitter } from '../../../src/core-engine/GameEventEmitter';
import { PhaserEventBridge } from '../../../src/core-engine/PhaserEventBridge';
import { SoundManager } from '../../../src/core-engine/SoundManager';
import type { SoundPlayer, EventSoundMapping } from '../../../src/core-engine/SoundManager';
import helpContent from '../help-content.json';

// ── Audio asset keys ────────────────────────────────────────

const SFX_KEYS = {
  CARD_PICKUP: 'bc-sfx-card-pickup',
  CARD_TO_FOUNDATION: 'bc-sfx-card-to-foundation',
  CARD_TO_TABLEAU: 'bc-sfx-card-to-tableau',
  CARD_SNAP_BACK: 'bc-sfx-card-snap-back',
  DEAL_CARD: 'bc-sfx-deal-card',
  WIN_FANFARE: 'bc-sfx-win-fanfare',
  LOSS_SOUND: 'bc-sfx-loss-sound',
  AUTO_COMPLETE_START: 'bc-sfx-auto-complete-start',
  AUTO_COMPLETE_CARD: 'bc-sfx-auto-complete-card',
  UNDO: 'bc-sfx-undo',
  REDO: 'bc-sfx-redo',
  CARD_SELECT: 'bc-sfx-card-select',
  CARD_DESELECT: 'bc-sfx-card-deselect',
  UI_CLICK: 'bc-sfx-ui-click',
} as const;

// ── Constants ───────────────────────────────────────────────

const CARD_GAP = 6;

const ANIM_DURATION = 300; // ms per card deal animation
const DEAL_STAGGER = 40; // ms between successive card deal tweens
const SNAP_BACK_DURATION = 200; // ms to snap card back on invalid drop
const AUTO_COMPLETE_DELAY = 150; // ms between auto-complete card animations

/** Vertical overlap offset between cascaded cards in a tableau column. */
const CASCADE_OFFSET_Y = 22;

/** Top area: title + foundations */
const TITLE_Y = 14;
const FOUNDATION_Y = 66;

/** Tableau starts below the foundations. */
const TABLEAU_TOP_Y = 162;

/** Z-depth for a card being dragged. */
const DRAG_DEPTH = 1000;

// ── Suit symbol mapping for foundation labels ───────────────

const SUIT_SYMBOL: Record<Suit, string> = {
  clubs: '\u2663',    // ♣
  diamonds: '\u2666', // ♦
  hearts: '\u2665',   // ♥
  spades: '\u2660',   // ♠
};

const SUIT_COLOR: Record<Suit, string> = {
  clubs: '#ffffff',
  diamonds: '#ff4444',
  hearts: '#ff4444',
  spades: '#ffffff',
};

// ── Highlight colours ───────────────────────────────────────

const HIGHLIGHT_VALID = 0x44ff44;
const HIGHLIGHT_ALPHA = 0.3;

/** Tint applied to the selected card for click-to-move. */
const SELECTION_TINT = 0xaaffaa;

// ── MoveCommand ─────────────────────────────────────────────

/**
 * A reversible command that applies or undoes a single BCMove.
 * Used by the UndoRedoManager to support undo/redo.
 */
class MoveCommand implements Command {
  readonly description: string;

  constructor(
    private readonly state: BeleagueredCastleState,
    private readonly move: BCMove,
  ) {
    this.description =
      move.kind === 'tableau-to-foundation'
        ? `Move column ${move.fromCol} -> foundation ${move.toFoundation}`
        : `Move column ${move.fromCol} -> column ${move.toCol}`;
  }

  execute(): void {
    applyMove(this.state, this.move);
  }

  undo(): void {
    undoMove(this.state, this.move);
  }
}

/**
 * A reversible command for auto-moves to foundations.
 * Unlike MoveCommand, this does NOT count toward the player's move counter.
 * It calls applyMove (which increments moveCount) then decrements it back,
 * and does the reverse on undo.
 */
class AutoMoveCommand implements Command {
  readonly description: string;

  constructor(
    private readonly state: BeleagueredCastleState,
    private readonly move: BCMove,
  ) {
    this.description =
      move.kind === 'tableau-to-foundation'
        ? `Auto-move column ${move.fromCol} -> foundation ${move.toFoundation}`
        : `Auto-move column ${move.fromCol} -> column ${move.toCol}`;
  }

  execute(): void {
    applyMove(this.state, this.move);
    // Compensate: auto-moves don't count as player moves
    this.state.moveCount--;
  }

  undo(): void {
    undoMove(this.state, this.move);
    // Compensate: undoMove decrements, but we didn't increment, so restore
    this.state.moveCount++;
  }
}

// ── Custom data attached to draggable card sprites ──────────

interface CardSpriteData {
  /** Tableau column index this card belongs to. */
  colIndex: number;
  /** Row index within the column (0 = bottom). */
  rowIndex: number;
  /** Original x position before drag. */
  originX: number;
  /** Original y position before drag. */
  originY: number;
  /** Original depth before drag. */
  originDepth: number;
}

// ── Scene ───────────────────────────────────────────────────

export class BeleagueredCastleScene extends Phaser.Scene {
  // Game state
  private gameState!: BeleagueredCastleState;
  private seed: number = Date.now();
  private undoManager!: UndoRedoManager;

  // Whether the deal animation has finished (interactions blocked until then)
  private dealComplete: boolean = false;

  // Display objects -- foundations
  private foundationSprites: Phaser.GameObjects.Image[] = [];
  private foundationLabels: Phaser.GameObjects.Text[] = [];
  private foundationDropZones: Phaser.GameObjects.Zone[] = [];

  // Display objects -- tableau (array of arrays, one per column)
  private tableauSprites: Phaser.GameObjects.Image[][] = [];
  private tableauDropZones: Phaser.GameObjects.Zone[] = [];

  // Highlight rectangles for valid drop targets
  private highlightRects: Phaser.GameObjects.Rectangle[] = [];

  // Click-to-move selection state
  private selectedCol: number | null = null;

  // Display objects -- HUD
  private moveCountText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private seedText!: Phaser.GameObjects.Text;
  private undoButton!: Phaser.GameObjects.Text;
  private redoButton!: Phaser.GameObjects.Text;

  // Timer tracking
  private elapsedSeconds: number = 0;
  private timerEvent: Phaser.Time.TimerEvent | null = null;
  private timerStarted: boolean = false;

  // Game-end state
  private gameEnded: boolean = false;
  private overlayObjects: Phaser.GameObjects.GameObject[] = [];

  // Auto-complete state
  private autoCompleting: boolean = false;
  private autoCompleteTimers: Phaser.Time.TimerEvent[] = [];

  // Transcript recording
  private recorder!: BCTranscriptRecorder;
  private transcript: BCGameTranscript | null = null;

  // Help panel
  private helpPanel!: HelpPanel;
  private helpButton!: HelpButton;

  // Sound system
  private gameEvents!: GameEventEmitter;
  private eventBridge!: PhaserEventBridge;
  private soundManager: SoundManager | null = null;
  private settingsPanel!: SettingsPanel;
  private settingsButton!: SettingsButton;

  constructor() {
    super({ key: 'BeleagueredCastleScene' });
  }

  /**
   * Whether user interactions should be blocked
   * (during deal animation, game end, or auto-complete).
   */
  private get interactionBlocked(): boolean {
    return !this.dealComplete || this.gameEnded || this.autoCompleting;
  }

  // ── Preload ─────────────────────────────────────────────

  preload(): void {
    preloadCardAssets(this);

    // Audio assets (medieval-themed SFX)
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

  // ── Create ──────────────────────────────────────────────

  create(): void {
    this.cameras.main.setBackgroundColor('#2d572c');

    // Parse seed from URL query parameter, or use current timestamp
    const params = new URLSearchParams(window.location.search);
    const seedParam = params.get('seed');
    this.seed = seedParam ? parseInt(seedParam, 10) : Date.now();

    // Deal the game
    this.gameState = deal(this.seed);
    this.undoManager = new UndoRedoManager();
    this.dealComplete = false;
    this.timerStarted = false;
    this.gameEnded = false;
    this.overlayObjects = [];
    this.autoCompleting = false;
    this.autoCompleteTimers = [];
    this.elapsedSeconds = 0;
    this.transcript = null;

    // Reset display object arrays (stale refs from previous run on restart)
    this.foundationSprites = [];
    this.foundationLabels = [];
    this.foundationDropZones = [];
    this.tableauSprites = [];
    this.tableauDropZones = [];
    this.highlightRects = [];
    this.selectedCol = null;

    // Initialize transcript recorder
    this.recorder = new BCTranscriptRecorder(this.seed, this.gameState);

    // Create static UI elements
    this.createTitle();
    this.createFoundationSlots();
    this.createTableauDropZones();
    this.createHUD();
    this.createHelpPanel();

    // Sound system: event emitter, bridge, sound manager, settings
    this.gameEvents = new GameEventEmitter();
    this.eventBridge = new PhaserEventBridge(this.gameEvents, this.events);

    const phaserSound = this.sound;
    const player: SoundPlayer = {
      play: (key: string) => { phaserSound.play(key); },
      stop: (key: string) => { phaserSound.stopByKey(key); },
      setVolume: (v: number) => { phaserSound.volume = v; },
      setMute: (m: boolean) => { phaserSound.mute = m; },
    };
    this.soundManager = new SoundManager(player);

    // Register all SFX keys
    for (const sfxKey of Object.values(SFX_KEYS)) {
      this.soundManager.register(sfxKey);
    }

    // Declarative event-to-sound mapping
    const mapping: EventSoundMapping = {
      'card-pickup': SFX_KEYS.CARD_PICKUP,
      'card-to-foundation': SFX_KEYS.CARD_TO_FOUNDATION,
      'card-to-tableau': SFX_KEYS.CARD_TO_TABLEAU,
      'card-snap-back': SFX_KEYS.CARD_SNAP_BACK,
      'deal-card': SFX_KEYS.DEAL_CARD,
      'game-ended': SFX_KEYS.LOSS_SOUND, // default; win overrides with direct play
      'auto-complete-start': SFX_KEYS.AUTO_COMPLETE_START,
      'auto-complete-card': SFX_KEYS.AUTO_COMPLETE_CARD,
      'undo': SFX_KEYS.UNDO,
      'redo': SFX_KEYS.REDO,
      'card-selected': SFX_KEYS.CARD_SELECT,
      'card-deselected': SFX_KEYS.CARD_DESELECT,
      'ui-interaction': SFX_KEYS.UI_CLICK,
    };
    this.soundManager.connectToEvents(this.gameEvents, mapping);

    this.createSettingsPanel();

    // Render foundations (aces already placed)
    this.refreshFoundations();

    // Deal cards to tableau with animation
    this.dealTableauAnimated();

    // Setup drag-and-drop event handlers
    this.setupDragAndDrop();

    // Setup click-to-move event handlers
    this.setupClickToMove();

    // Setup keyboard shortcuts
    this.setupKeyboard();
  }

  // ── UI creation ─────────────────────────────────────────

  private createTitle(): void {
    createSceneMenuButton(this, { y: TITLE_Y });
    createSceneTitle(this, 'Beleaguered Castle', { y: TITLE_Y });
  }

  /**
   * Create the 4 foundation slots across the top.
   * Each slot shows the suit symbol and the current top card (ace initially).
   * Also creates drop zones for drag-and-drop.
   */
  private createFoundationSlots(): void {
    const totalW =
      FOUNDATION_COUNT * CARD_W + (FOUNDATION_COUNT - 1) * (CARD_GAP + 20);
    const startX = (GAME_W - totalW) / 2 + CARD_W / 2;

    for (let i = 0; i < FOUNDATION_COUNT; i++) {
      const x = startX + i * (CARD_W + CARD_GAP + 20);
      const suit = FOUNDATION_SUITS[i];

      // Empty slot background (rounded rect outline)
      const slotGraphics = this.add.graphics();
      slotGraphics.lineStyle(1, 0x448844, 0.6);
      slotGraphics.strokeRoundedRect(
        x - CARD_W / 2,
        FOUNDATION_Y - CARD_H / 2,
        CARD_W,
        CARD_H,
        4,
      );

      // Suit label beneath the slot
      const label = this.add
        .text(x, FOUNDATION_Y + CARD_H / 2 + 10, SUIT_SYMBOL[suit], {
          fontSize: '16px',
          color: SUIT_COLOR[suit],
          fontFamily: FONT_FAMILY,
        })
        .setOrigin(0.5);
      this.foundationLabels.push(label);

      // Card sprite (will show ace on initial render)
      const sprite = this.add
        .image(x, FOUNDATION_Y, 'card_back')
        .setVisible(false);
      this.foundationSprites.push(sprite);

      // Drop zone for this foundation
      const zone = this.add
        .zone(x, FOUNDATION_Y, CARD_W, CARD_H)
        .setRectangleDropZone(CARD_W, CARD_H)
        .setData('type', 'foundation')
        .setData('index', i);
      this.foundationDropZones.push(zone);
    }
  }

  /**
   * Create drop zones for each tableau column.
   * The drop zone covers the full column area.
   */
  private createTableauDropZones(): void {
    // Maximum column height: 13 cards * CASCADE_OFFSET_Y + CARD_H
    const maxColHeight = 13 * CASCADE_OFFSET_Y + CARD_H;

    for (let col = 0; col < TABLEAU_COUNT; col++) {
      const x = this.tableauColumnX(col);
      const zoneCenterY = TABLEAU_TOP_Y + maxColHeight / 2 - CARD_H / 2;

      const zone = this.add
        .zone(x, zoneCenterY, CARD_W + 4, maxColHeight)
        .setRectangleDropZone(CARD_W + 4, maxColHeight)
        .setData('type', 'tableau')
        .setData('index', col);
      this.tableauDropZones.push(zone);
    }
  }

  /**
   * Create the HUD: move counter, timer, seed display, undo/redo buttons.
   */
  private createHUD(): void {
    // Move counter (bottom-left)
    this.moveCountText = this.add
      .text(20, GAME_H - 24, 'Moves: 0', {
        fontSize: '14px',
        color: '#aaccaa',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0, 0.5);

    // Timer (bottom-center)
    this.timerText = this.add
      .text(GAME_W / 2, GAME_H - 24, '00:00', {
        fontSize: '14px',
        color: '#aaccaa',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5, 0.5);

    // Seed display (bottom-right)
    this.seedText = this.add
      .text(GAME_W - 20, GAME_H - 24, `Seed: ${this.seed}`, {
        fontSize: '14px',
        color: '#668866',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(1, 0.5);

    // Undo button
    this.undoButton = this.add
      .text(GAME_W - 110, TITLE_Y, '[ Undo ]', {
        fontSize: '14px',
        color: '#557755',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.performUndo())
      .on('pointerover', () => {
        if (this.undoManager.canUndo()) this.undoButton.setColor('#88ff88');
      })
      .on('pointerout', () => this.refreshUndoRedoButtons());

    // Redo button
    this.redoButton = this.add
      .text(GAME_W - 35, TITLE_Y, '[ Redo ]', {
        fontSize: '14px',
        color: '#557755',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.performRedo())
      .on('pointerover', () => {
        if (this.undoManager.canRedo()) this.redoButton.setColor('#88ff88');
      })
      .on('pointerout', () => this.refreshUndoRedoButtons());
  }

  // ── Drag and Drop ───────────────────────────────────────

  /**
   * Setup scene-level drag-and-drop event handlers.
   */
  private setupDragAndDrop(): void {
    this.input.on(
      'dragstart',
      (_pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.Image) => {
        if (this.interactionBlocked) return;
        const data = gameObject.getData('cardData') as CardSpriteData | undefined;
        if (!data) return;

        // Clear any click-to-move selection when starting a drag
        this.deselectColumn();

        // Save origin position and depth
        data.originX = gameObject.x;
        data.originY = gameObject.y;
        data.originDepth = gameObject.depth;

        // Raise card above everything during drag
        gameObject.setDepth(DRAG_DEPTH);

        // Emit card-pickup event
        const col = this.gameState.tableau[data.colIndex];
        const topCard = col.peek();
        if (topCard) {
          this.gameEvents.emit('card-pickup', {
            suit: topCard.suit,
            rank: topCard.rank,
            source: 'tableau' as const,
          });
        }

        // Show valid drop target highlights
        this.showValidDropHighlights(data.colIndex);
      },
    );

    this.input.on(
      'drag',
      (
        _pointer: Phaser.Input.Pointer,
        gameObject: Phaser.GameObjects.Image,
        dragX: number,
        dragY: number,
      ) => {
        if (this.interactionBlocked) return;
        gameObject.x = dragX;
        gameObject.y = dragY;
      },
    );

    this.input.on(
      'dragend',
      (
        _pointer: Phaser.Input.Pointer,
        gameObject: Phaser.GameObjects.Image,
        dropped: boolean,
      ) => {
        if (this.interactionBlocked) return;

        // Clear highlights
        this.clearDropHighlights();

        if (!dropped) {
          // Snap back to origin
          this.snapBack(gameObject);
        }
      },
    );

    this.input.on(
      'drop',
      (
        _pointer: Phaser.Input.Pointer,
        gameObject: Phaser.GameObjects.Image,
        dropZone: Phaser.GameObjects.Zone,
      ) => {
        if (this.interactionBlocked) return;
        this.handleDrop(gameObject, dropZone);
      },
    );
  }

  /**
   * Handle a card drop on a drop zone.
   */
  private handleDrop(
    sprite: Phaser.GameObjects.Image,
    zone: Phaser.GameObjects.Zone,
  ): void {
    const data = sprite.getData('cardData') as CardSpriteData | undefined;
    if (!data) {
      this.snapBack(sprite);
      return;
    }

    const fromCol = data.colIndex;
    const zoneType = zone.getData('type') as string;
    const zoneIndex = zone.getData('index') as number;

    let move: BCMove | null = null;

    if (zoneType === 'foundation') {
      if (isLegalFoundationMove(this.gameState, fromCol, zoneIndex)) {
        move = {
          kind: 'tableau-to-foundation',
          fromCol,
          toFoundation: zoneIndex,
        };
      }
    } else if (zoneType === 'tableau') {
      if (zoneIndex !== fromCol && isLegalTableauMove(this.gameState, fromCol, zoneIndex)) {
        move = {
          kind: 'tableau-to-tableau',
          fromCol,
          toCol: zoneIndex,
        };
      }
    }

    if (move) {
      this.executePlayerMove(move);
    } else {
      // Invalid drop: snap back
      this.snapBack(sprite);
    }
  }

  /**
   * Execute a player move with auto-move detection and CompoundCommand support.
   * Shared by both drag-and-drop and click-to-move input methods.
   */
  private executePlayerMove(move: BCMove): void {
    // Build the player move command
    const playerCmd = new MoveCommand(this.gameState, move);

    // Tentatively apply the player move to discover auto-moves
    applyMove(this.gameState, move);

    // Collect all safe auto-moves by looping until none remain
    const autoMoves: BCMove[] = [];
    let safe = findSafeAutoMoves(this.gameState);
    while (safe.length > 0) {
      for (const am of safe) {
        applyMove(this.gameState, am);
        autoMoves.push(am);
      }
      safe = findSafeAutoMoves(this.gameState);
    }

    // Undo everything in reverse to restore original state
    for (let i = autoMoves.length - 1; i >= 0; i--) {
      undoMove(this.gameState, autoMoves[i]);
    }
    undoMove(this.gameState, move);

    // Build the command (compound if auto-moves exist, simple if not)
    if (autoMoves.length > 0) {
      const allCmds: Command[] = [playerCmd];
      for (const am of autoMoves) {
        allCmds.push(new AutoMoveCommand(this.gameState, am));
      }
      const compound = new CompoundCommand(allCmds, playerCmd.description);
      this.undoManager.execute(compound);
    } else {
      this.undoManager.execute(playerCmd);
    }

    // Record to transcript: player move + auto-moves
    this.recorder.recordMove(move, this.gameState.moveCount);
    for (const am of autoMoves) {
      this.recorder.recordAutoMove(am);
    }

    // Emit sound events for the player move
    if (move.kind === 'tableau-to-foundation') {
      const fPile = this.gameState.foundations[move.toFoundation];
      const topCard = fPile.peek();
      if (topCard) {
        this.gameEvents.emit('card-to-foundation', {
          suit: topCard.suit,
          rank: topCard.rank,
          foundationIndex: move.toFoundation,
        });
      }
    } else if (move.kind === 'tableau-to-tableau') {
      const tCol = this.gameState.tableau[move.toCol];
      const topCard = tCol.peek();
      if (topCard) {
        this.gameEvents.emit('card-to-tableau', {
          suit: topCard.suit,
          rank: topCard.rank,
          columnIndex: move.toCol,
        });
      }
    }

    // Start timer on first move
    if (!this.timerStarted) {
      this.timerStarted = true;
      this.startTimer();
    }

    // Refresh everything
    this.refreshAll();

    // Check for win or no-moves conditions
    this.checkGameEnd();
  }

  /**
   * Snap a card sprite back to its original position.
   */
  private snapBack(sprite: Phaser.GameObjects.Image): void {
    const data = sprite.getData('cardData') as CardSpriteData | undefined;
    if (!data) return;

    // Emit snap-back event
    this.gameEvents.emit('card-snap-back', { reason: 'invalid-drop' });

    this.tweens.add({
      targets: sprite,
      x: data.originX,
      y: data.originY,
      duration: SNAP_BACK_DURATION,
      ease: 'Power2',
      onComplete: () => {
        sprite.setDepth(data.originDepth);
      },
    });
  }

  /**
   * Show green highlight rectangles on valid drop targets for the given source column.
   */
  private showValidDropHighlights(fromCol: number): void {
    this.clearDropHighlights();

    const legalMoves = getLegalMoves(this.gameState);

    // Filter to moves originating from the dragged column
    const relevantMoves = legalMoves.filter((m) => m.fromCol === fromCol);

    for (const move of relevantMoves) {
      if (move.kind === 'tableau-to-foundation') {
        // Highlight the foundation slot
        const fSprite = this.foundationSprites[move.toFoundation];
        const rect = this.add
          .rectangle(
            fSprite.x,
            fSprite.y,
            CARD_W + 4,
            CARD_H + 4,
            HIGHLIGHT_VALID,
            HIGHLIGHT_ALPHA,
          )
          .setDepth(DRAG_DEPTH - 1);
        this.highlightRects.push(rect);
      } else if (move.kind === 'tableau-to-tableau') {
        // Highlight the destination column (at the drop position)
        const col = move.toCol;
        const cards = this.gameState.tableau[col].toArray();
        const dropY = cards.length > 0
          ? this.tableauCardY(cards.length - 1)
          : this.tableauCardY(0);
        const x = this.tableauColumnX(col);

        const rect = this.add
          .rectangle(
            x,
            dropY,
            CARD_W + 4,
            CARD_H + 4,
            HIGHLIGHT_VALID,
            HIGHLIGHT_ALPHA,
          )
          .setDepth(DRAG_DEPTH - 1);
        this.highlightRects.push(rect);
      }
    }
  }

  /**
   * Remove all drop target highlight rectangles.
   */
  private clearDropHighlights(): void {
    for (const rect of this.highlightRects) {
      rect.destroy();
    }
    this.highlightRects = [];
  }

  // ── Click-to-Move ──────────────────────────────────────

  /**
   * Setup click-to-move event handlers.
   *
   * Click-to-move works as follows:
   * 1. Click a top card to select it (tinted green, valid targets highlighted).
   * 2. Click a valid destination (tableau column or foundation) to move the card.
   * 3. Click the same card again or an invalid destination to deselect.
   *
   * This works alongside drag-and-drop without conflict because:
   * - Phaser fires 'pointerdown' before drag events start
   * - We use a small drag threshold to distinguish clicks from drags
   * - Starting a drag clears any existing selection
   */
  private setupClickToMove(): void {
    // Set a small drag distance threshold so short clicks are not treated as drags
    this.input.dragDistanceThreshold = 5;

    // Foundation zones respond to clicks when a card is selected
    for (let fi = 0; fi < FOUNDATION_COUNT; fi++) {
      const zone = this.foundationDropZones[fi];
      zone.setInteractive({ useHandCursor: true });
      zone.on('pointerdown', () => {
        if (this.interactionBlocked) return;
        if (this.selectedCol === null) return;

        // Try to move the selected card to this foundation
        if (isLegalFoundationMove(this.gameState, this.selectedCol, fi)) {
          const move: BCMove = {
            kind: 'tableau-to-foundation',
            fromCol: this.selectedCol,
            toFoundation: fi,
          };
          this.deselectColumn();
          this.executePlayerMove(move);
        } else {
          // Invalid target: deselect
          this.deselectColumn();
        }
      });
    }

    // Tableau column zones respond to clicks when a card is selected
    for (let col = 0; col < TABLEAU_COUNT; col++) {
      const zone = this.tableauDropZones[col];
      zone.setInteractive({ useHandCursor: false });
      zone.on('pointerdown', () => {
        if (this.interactionBlocked) return;
        if (this.selectedCol === null) return;

        // Don't move to the same column
        if (col === this.selectedCol) {
          this.deselectColumn();
          return;
        }

        // Try to move the selected card to this column
        if (isLegalTableauMove(this.gameState, this.selectedCol, col)) {
          const move: BCMove = {
            kind: 'tableau-to-tableau',
            fromCol: this.selectedCol,
            toCol: col,
          };
          this.deselectColumn();
          this.executePlayerMove(move);
        } else {
          // Invalid target: deselect
          this.deselectColumn();
        }
      });
    }
  }

  /**
   * Handle a click on a top card sprite for click-to-move selection.
   * Called from makeDraggable() where top cards get their click handlers.
   */
  private handleCardClick(colIndex: number): void {
    if (this.interactionBlocked) return;

    if (this.selectedCol === colIndex) {
      // Clicking the same card: toggle off
      this.deselectColumn();
      return;
    }

    if (this.selectedCol !== null) {
      // A card is already selected; try to move it to this column
      if (isLegalTableauMove(this.gameState, this.selectedCol, colIndex)) {
        const move: BCMove = {
          kind: 'tableau-to-tableau',
          fromCol: this.selectedCol,
          toCol: colIndex,
        };
        this.deselectColumn();
        this.executePlayerMove(move);
        return;
      }
      // Invalid target: deselect old and select new
      this.deselectColumn();
    }

    // Select this card
    this.selectColumn(colIndex);
  }

  /**
   * Visually select a column's top card for click-to-move.
   * Applies a tint and shows valid move target highlights.
   */
  private selectColumn(colIndex: number): void {
    this.selectedCol = colIndex;

    // Tint the selected card
    const colSprites = this.tableauSprites[colIndex];
    if (colSprites.length > 0) {
      colSprites[colSprites.length - 1].setTint(SELECTION_TINT);
    }

    // Emit card-selected event
    const col = this.gameState.tableau[colIndex];
    const topCard = col.peek();
    if (topCard) {
      this.gameEvents.emit('card-selected', {
        suit: topCard.suit,
        rank: topCard.rank,
        columnIndex: colIndex,
      });
    }

    // Show valid drop target highlights (reuses the drag highlight system)
    this.showValidDropHighlights(colIndex);
  }

  /**
   * Clear the click-to-move selection state and visual indicators.
   */
  private deselectColumn(): void {
    if (this.selectedCol !== null) {
      // Clear tint on the previously selected card
      const colSprites = this.tableauSprites[this.selectedCol];
      if (colSprites.length > 0) {
        colSprites[colSprites.length - 1].clearTint();
      }

      // Emit card-deselected event
      this.gameEvents.emit('card-deselected', { reason: 'click-away' });
    }
    this.selectedCol = null;
    this.clearDropHighlights();
  }

  // ── Undo / Redo ─────────────────────────────────────────

  private setupKeyboard(): void {
    if (!this.input.keyboard) return;

    this.input.keyboard.on('keydown', (event: KeyboardEvent) => {
      // Ctrl+Z = undo, Ctrl+Shift+Z or Ctrl+Y = redo
      if (event.ctrlKey || event.metaKey) {
        if (event.key === 'z' && !event.shiftKey) {
          event.preventDefault();
          this.performUndo();
        } else if (
          event.key === 'y' ||
          (event.key === 'z' && event.shiftKey) ||
          (event.key === 'Z' && event.shiftKey)
        ) {
          event.preventDefault();
          this.performRedo();
        }
      }

      // Escape key closes the help panel
      if (event.key === 'Escape' && this.helpPanel?.isOpen) {
        this.helpPanel.close();
      }
    });
  }

  private performUndo(): void {
    // Allow undo during auto-complete to cancel it
    if (this.autoCompleting) {
      this.cancelAutoComplete();
      if (this.undoManager.canUndo()) {
        this.undoManager.undo();
        this.recorder.recordUndo(this.gameState.moveCount);
        this.gameEvents.emit('undo', {});
        this.refreshAll();
      }
      return;
    }

    if (this.interactionBlocked) return;
    if (!this.undoManager.canUndo()) return;

    this.deselectColumn();
    this.undoManager.undo();
    this.recorder.recordUndo(this.gameState.moveCount);
    this.gameEvents.emit('undo', {});
    this.refreshAll();
  }

  private performRedo(): void {
    if (this.interactionBlocked) return;
    if (!this.undoManager.canRedo()) return;

    this.deselectColumn();
    this.undoManager.redo();
    this.recorder.recordRedo(this.gameState.moveCount);
    this.gameEvents.emit('redo', {});
    this.refreshAll();
  }

  private refreshUndoRedoButtons(): void {
    this.undoButton.setColor(this.undoManager.canUndo() ? '#aaccaa' : '#557755');
    this.redoButton.setColor(this.undoManager.canRedo() ? '#aaccaa' : '#557755');
  }

  // ── Game End Detection ──────────────────────────────────

  /**
   * Check if the game has ended (win, no moves, or trivially winnable) after a player move.
   */
  private checkGameEnd(): void {
    if (this.gameEnded || this.autoCompleting) return;

    if (isWon(this.gameState)) {
      this.gameEnded = true;
      this.stopTimer();
      this.transcript = this.recorder.finalize(
        'win',
        this.gameState.moveCount,
        this.elapsedSeconds,
      );
      this.showWinOverlay();
    } else if (isTriviallyWinnable(this.gameState)) {
      this.startAutoComplete();
    } else if (hasNoMoves(this.gameState)) {
      this.gameEnded = true;
      this.stopTimer();
      this.transcript = this.recorder.finalize(
        'loss',
        this.gameState.moveCount,
        this.elapsedSeconds,
      );
      this.showNoMovesOverlay();
    }
  }

  /**
   * Start the auto-complete animation sequence.
   *
   * Computes all remaining foundation moves, wraps them in a CompoundCommand
   * of AutoMoveCommands, then animates them one at a time with delays.
   * The compound is executed up-front (state is applied immediately) and
   * the animation is purely visual. Undo during animation cancels remaining
   * animations and undoes the compound.
   */
  private startAutoComplete(): void {
    const moves = getAutoCompleteMoves(this.gameState);
    if (moves.length === 0) return;

    this.autoCompleting = true;

    // Capture card info before moves are applied (for sound events).
    // We simulate each move in sequence to get the correct top card,
    // then undo everything to restore the original state.
    const moveCards: { suit: string; rank: string; foundationIndex: number }[] = [];
    for (const m of moves) {
      if (m.kind === 'tableau-to-foundation') {
        const topCard = this.gameState.tableau[m.fromCol].peek();
        moveCards.push({
          suit: topCard?.suit ?? '',
          rank: topCard?.rank ?? '',
          foundationIndex: m.toFoundation,
        });
      } else {
        moveCards.push({ suit: '', rank: '', foundationIndex: -1 });
      }
      applyMove(this.gameState, m);
    }
    // Undo all in reverse to restore state
    for (let i = moves.length - 1; i >= 0; i--) {
      undoMove(this.gameState, moves[i]);
    }

    // Emit auto-complete-start event
    this.gameEvents.emit('auto-complete-start', { cardCount: moves.length });

    // Build compound command of AutoMoveCommands
    const cmds: Command[] = moves.map(
      (m) => new AutoMoveCommand(this.gameState, m),
    );
    const compound = new CompoundCommand(cmds, 'Auto-complete');
    this.undoManager.execute(compound);

    // Refresh display state immediately (all cards moved logically)
    this.refreshAll();

    // Schedule visual animations for each card flying to its foundation
    // The cards are already in their final positions in game state,
    // so we create temporary sprite animations on top.
    for (let i = 0; i < moves.length; i++) {
      const move = moves[i];
      if (move.kind !== 'tableau-to-foundation') continue;

      const cardInfo = moveCards[i];
      const timer = this.time.delayedCall(
        i * AUTO_COMPLETE_DELAY,
        () => {
          if (!this.autoCompleting) return; // cancelled by undo

          // Emit auto-complete-card event
          if (cardInfo) {
            this.gameEvents.emit('auto-complete-card', {
              suit: cardInfo.suit,
              rank: cardInfo.rank,
              foundationIndex: cardInfo.foundationIndex,
            });
          }

          // Flash the foundation sprite to indicate a card landing
          const fSprite = this.foundationSprites[move.toFoundation];
          this.tweens.add({
            targets: fSprite,
            alpha: { from: 0.5, to: 1 },
            duration: 100,
            yoyo: false,
          });

          // Update foundation display to show current top card
          this.refreshFoundations();
        },
      );
      this.autoCompleteTimers.push(timer);
    }

    // After all animations, trigger win check
    const finalTimer = this.time.delayedCall(
      moves.length * AUTO_COMPLETE_DELAY + 100,
      () => {
        if (!this.autoCompleting) return;
        this.autoCompleting = false;
        this.autoCompleteTimers = [];

        // Now check for win (should be won)
        if (isWon(this.gameState)) {
          this.gameEnded = true;
          this.stopTimer();
          this.transcript = this.recorder.finalize(
            'win',
            this.gameState.moveCount,
            this.elapsedSeconds,
          );
          this.showWinOverlay();
        }
      },
    );
    this.autoCompleteTimers.push(finalTimer);
  }

  /**
   * Cancel any in-progress auto-complete animation.
   * Does NOT undo the compound command -- the caller is responsible for that.
   */
  private cancelAutoComplete(): void {
    if (!this.autoCompleting) return;
    this.autoCompleting = false;

    for (const timer of this.autoCompleteTimers) {
      timer.destroy();
    }
    this.autoCompleteTimers = [];
  }

  /**
   * Show a win overlay with moves, elapsed time, and action buttons.
   */
  private showWinOverlay(): void {
    const OVERLAY_DEPTH = 2000;
    const BUTTON_DEPTH = OVERLAY_DEPTH + 1;

    // Play win fanfare directly (overrides the default game-ended mapping)
    this.soundManager?.play(SFX_KEYS.WIN_FANFARE);

    // Semi-transparent background covering the full scene
    const { objects: overlayObjects } = createOverlayBackground(this, {
      depth: OVERLAY_DEPTH,
      alpha: 0.75,
    });

    // Format elapsed time
    const minutes = Math.floor(this.elapsedSeconds / 60);
    const seconds = this.elapsedSeconds % 60;
    const mm = String(minutes).padStart(2, '0');
    const ss = String(seconds).padStart(2, '0');

    // Title
    const title = this.add
      .text(GAME_W / 2, GAME_H / 2 - 70, 'You Win!', {
        fontSize: '32px',
        color: '#88ff88',
        fontFamily: FONT_FAMILY,
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(BUTTON_DEPTH);
    overlayObjects.push(title);

    // Stats
    const stats = this.add
      .text(
        GAME_W / 2,
        GAME_H / 2 - 20,
        `Moves: ${this.gameState.moveCount}    Time: ${mm}:${ss}`,
        {
          fontSize: '16px',
          color: '#aaccaa',
          fontFamily: FONT_FAMILY,
          align: 'center',
        },
      )
      .setOrigin(0.5)
      .setDepth(BUTTON_DEPTH);
    overlayObjects.push(stats);

    // New Game button
    const newGameBtn = createOverlayButton(
      this, GAME_W / 2 - 130, GAME_H / 2 + 40, '[ New Game ]', BUTTON_DEPTH,
    );
    newGameBtn.on('pointerdown', () => {
      this.gameEvents.emit('ui-interaction', { elementId: 'new-game', action: 'click' });
      this.seed = Date.now();
      this.scene.restart();
    });
    overlayObjects.push(newGameBtn);

    // Restart button
    const restartBtn = createOverlayButton(
      this, GAME_W / 2, GAME_H / 2 + 40, '[ Restart ]', BUTTON_DEPTH,
    );
    restartBtn.on('pointerdown', () => {
      this.gameEvents.emit('ui-interaction', { elementId: 'restart', action: 'click' });
      this.scene.restart();
    });
    overlayObjects.push(restartBtn);

    // Menu button
    const menuBtn = createOverlayMenuButton(
      this, GAME_W / 2 + 130, GAME_H / 2 + 40, BUTTON_DEPTH,
    );
    overlayObjects.push(menuBtn);

    this.overlayObjects = overlayObjects;
  }

  /**
   * Show a no-moves overlay with action buttons.
   */
  private showNoMovesOverlay(): void {
    const OVERLAY_DEPTH = 2000;
    const BUTTON_DEPTH = OVERLAY_DEPTH + 1;

    // Emit game-ended event for loss (triggers loss sound via mapping)
    this.gameEvents.emit('game-ended', {
      finalTurnNumber: this.gameState.moveCount,
      winnerIndex: -1,
      reason: 'no-moves',
    });

    // Semi-transparent background
    const { objects: overlayObjects } = createOverlayBackground(this, {
      depth: OVERLAY_DEPTH,
      alpha: 0.75,
    });

    // Title
    const title = this.add
      .text(GAME_W / 2, GAME_H / 2 - 55, 'No Moves Available', {
        fontSize: '26px',
        color: '#ff8888',
        fontFamily: FONT_FAMILY,
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(BUTTON_DEPTH);
    overlayObjects.push(title);

    // Undo Last button (dismiss overlay, undo, resume play)
    const undoBtn = createOverlayButton(
      this, GAME_W / 2 - 155, GAME_H / 2 + 25, '[ Undo Last ]', BUTTON_DEPTH,
    );
    undoBtn.on('pointerdown', () => {
      if (!this.undoManager.canUndo()) return;
      this.gameEvents.emit('ui-interaction', { elementId: 'undo-last', action: 'click' });
      this.dismissOverlay();
      this.gameEnded = false;
      this.resumeTimer();
      this.undoManager.undo();
      this.refreshAll();
    });
    overlayObjects.push(undoBtn);

    // New Game button
    const noMovesNewGameBtn = createOverlayButton(
      this, GAME_W / 2 - 20, GAME_H / 2 + 25, '[ New Game ]', BUTTON_DEPTH,
    );
    noMovesNewGameBtn.on('pointerdown', () => {
      this.gameEvents.emit('ui-interaction', { elementId: 'new-game', action: 'click' });
      this.seed = Date.now();
      this.scene.restart();
    });
    overlayObjects.push(noMovesNewGameBtn);

    // Restart button
    const noMovesRestartBtn = createOverlayButton(
      this, GAME_W / 2 + 100, GAME_H / 2 + 25, '[ Restart ]', BUTTON_DEPTH,
    );
    noMovesRestartBtn.on('pointerdown', () => {
      this.gameEvents.emit('ui-interaction', { elementId: 'restart', action: 'click' });
      this.scene.restart();
    });
    overlayObjects.push(noMovesRestartBtn);

    // Menu button
    const noMovesMenuBtn = createOverlayMenuButton(
      this, GAME_W / 2 + 200, GAME_H / 2 + 25, BUTTON_DEPTH,
    );
    overlayObjects.push(noMovesMenuBtn);

    this.overlayObjects = overlayObjects;
  }

  /**
   * Dismiss the current overlay and destroy all its objects.
   */
  private dismissOverlay(): void {
    sharedDismissOverlay(this.overlayObjects);
    this.overlayObjects = [];
  }

  // ── Help Panel ──────────────────────────────────────────

  private createHelpPanel(): void {
    this.helpPanel = new HelpPanel(this, {
      sections: helpContent as HelpSection[],
    });
    this.helpButton = new HelpButton(this, this.helpPanel);
  }

  // ── Settings Panel ─────────────────────────────────────

  /** Create the settings panel with sound controls (mute toggle + volume slider). */
  private createSettingsPanel(): void {
    if (!this.soundManager) return;
    this.settingsPanel = new SettingsPanel(this, {
      soundManager: this.soundManager,
    });
    this.settingsButton = new SettingsButton(this, this.settingsPanel);
  }

  // ── Foundation rendering ────────────────────────────────

  private refreshFoundations(): void {
    for (let i = 0; i < FOUNDATION_COUNT; i++) {
      const foundation = this.gameState.foundations[i];
      const topCard = foundation.peek();

      if (topCard) {
        const texture = cardTextureKey(topCard.rank, topCard.suit);
        this.foundationSprites[i].setTexture(texture).setVisible(true);
      } else {
        this.foundationSprites[i].setVisible(false);
      }
    }
  }

  // ── Tableau layout ──────────────────────────────────────

  /**
   * Calculate the x position for a tableau column.
   * 8 columns are evenly distributed across the game width.
   */
  private tableauColumnX(colIndex: number): number {
    const totalW =
      TABLEAU_COUNT * CARD_W + (TABLEAU_COUNT - 1) * CARD_GAP;
    const startX = (GAME_W - totalW) / 2 + CARD_W / 2;
    return startX + colIndex * (CARD_W + CARD_GAP);
  }

  /**
   * Calculate the y position for a card at a given row within a tableau column.
   */
  private tableauCardY(rowIndex: number): number {
    return TABLEAU_TOP_Y + rowIndex * CASCADE_OFFSET_Y;
  }

  /**
   * Animate dealing cards to the 8 tableau columns.
   * Cards fly from the center of the screen to their final positions.
   * When the animation completes, cards are made interactive/draggable.
   */
  private dealTableauAnimated(): void {
    const centerX = GAME_W / 2;
    const centerY = GAME_H / 2;

    // Initialise the sprite arrays
    this.tableauSprites = [];
    for (let col = 0; col < TABLEAU_COUNT; col++) {
      this.tableauSprites.push([]);
    }

    let dealIndex = 0;
    let totalCards = 0;

    // Count total cards first
    for (let col = 0; col < TABLEAU_COUNT; col++) {
      totalCards += this.gameState.tableau[col].size();
    }

    let completedCount = 0;

    for (let col = 0; col < TABLEAU_COUNT; col++) {
      const cards = this.gameState.tableau[col].toArray();

      for (let row = 0; row < cards.length; row++) {
        const card = cards[row];
        const targetX = this.tableauColumnX(col);
        const targetY = this.tableauCardY(row);
        const texture = cardTextureKey(card.rank, card.suit);

        // Create the sprite at the deal origin (center), invisible initially
        const sprite = this.add
          .image(centerX, centerY, texture)
          .setAlpha(0)
          .setDepth(dealIndex); // later cards on top during animation

        this.tableauSprites[col].push(sprite);

        // Stagger the animation for each card
        const delay = dealIndex * DEAL_STAGGER;
        const currentDealIndex = dealIndex;
        this.tweens.add({
          targets: sprite,
          x: targetX,
          y: targetY,
          alpha: 1,
          duration: ANIM_DURATION,
          delay,
          ease: 'Power2',
          onStart: () => {
            // Emit deal-card event for each card as it starts moving
            this.gameEvents.emit('deal-card', {
              cardIndex: currentDealIndex,
              totalCards,
            });
          },
          onComplete: () => {
            // After deal animation, set depth based on row
            sprite.setDepth(row);
            completedCount++;

            // When all cards are dealt, enable interaction
            if (completedCount >= totalCards) {
              this.onDealComplete();
            }
          },
        });

        dealIndex++;
      }
    }

    // Handle edge case: if no cards to deal (shouldn't happen in normal play)
    if (totalCards === 0) {
      this.onDealComplete();
    }
  }

  /**
   * Called when the deal animation finishes.
   * Makes top cards draggable and enables interaction.
   */
  private onDealComplete(): void {
    this.dealComplete = true;
    this.makeDraggable();
    this.refreshUndoRedoButtons();
  }

  /**
   * Make the top card of each non-empty tableau column draggable.
   * Clears previous draggable state first.
   */
  private makeDraggable(): void {
    // Disable all existing interactive/draggable states
    for (const col of this.tableauSprites) {
      for (const sprite of col) {
        sprite.disableInteractive();
      }
    }

    // Enable drag only on top cards
    for (let col = 0; col < TABLEAU_COUNT; col++) {
      const colSprites = this.tableauSprites[col];
      if (colSprites.length === 0) continue;

      const topSprite = colSprites[colSprites.length - 1];
      const rowIndex = colSprites.length - 1;

      topSprite.setInteractive({ useHandCursor: true, draggable: true });

      // Click-to-move: clicking a top card selects or acts on it
      topSprite.on('pointerdown', () => this.handleCardClick(col));

      // Attach metadata for drag handlers
      const cardData: CardSpriteData = {
        colIndex: col,
        rowIndex,
        originX: topSprite.x,
        originY: topSprite.y,
        originDepth: topSprite.depth,
      };
      topSprite.setData('cardData', cardData);
    }
  }

  // ── Refresh display ─────────────────────────────────────

  /**
   * Refresh everything: foundations, tableau, HUD, draggable state.
   */
  private refreshAll(): void {
    this.refreshFoundations();
    this.refreshTableau();
    this.refreshHUD();
    this.refreshUndoRedoButtons();
    this.makeDraggable();
  }

  /**
   * Refresh the entire tableau display to match the current game state.
   * Destroys and re-creates sprites.
   */
  refreshTableau(): void {
    // Destroy existing sprites
    for (const col of this.tableauSprites) {
      for (const sprite of col) {
        sprite.destroy();
      }
    }
    this.tableauSprites = [];

    for (let col = 0; col < TABLEAU_COUNT; col++) {
      const sprites: Phaser.GameObjects.Image[] = [];
      const cards = this.gameState.tableau[col].toArray();

      for (let row = 0; row < cards.length; row++) {
        const card = cards[row];
        const x = this.tableauColumnX(col);
        const y = this.tableauCardY(row);
        const texture = cardTextureKey(card.rank, card.suit);

        const sprite = this.add
          .image(x, y, texture)
          .setDepth(row);
        sprites.push(sprite);
      }

      this.tableauSprites.push(sprites);
    }
  }

  /**
   * Refresh the HUD (move counter, timer, seed, undo/redo).
   */
  refreshHUD(): void {
    this.moveCountText.setText(`Moves: ${this.gameState.moveCount}`);
    this.seedText.setText(`Seed: ${this.gameState.seed}`);
  }

  // ── Timer ───────────────────────────────────────────────

  private startTimer(): void {
    this.elapsedSeconds = 0;
    this.timerEvent = this.time.addEvent({
      delay: 1000,
      callback: this.updateTimer,
      callbackScope: this,
      loop: true,
    });
  }

  private updateTimer(): void {
    this.elapsedSeconds++;
    const minutes = Math.floor(this.elapsedSeconds / 60);
    const seconds = this.elapsedSeconds % 60;
    const mm = String(minutes).padStart(2, '0');
    const ss = String(seconds).padStart(2, '0');
    this.timerText.setText(`${mm}:${ss}`);
  }

  /**
   * Stop the timer (pauses the repeating timer event).
   */
  private stopTimer(): void {
    if (this.timerEvent) {
      this.timerEvent.paused = true;
    }
  }

  /**
   * Resume the timer after it was stopped (e.g. after dismissing no-moves overlay).
   */
  private resumeTimer(): void {
    if (this.timerEvent) {
      this.timerEvent.paused = false;
    }
  }

  // ── Accessors (for tests and future features) ──────────

  /** Get the current game state. */
  getGameState(): BeleagueredCastleState {
    return this.gameState;
  }

  /** Get the UndoRedoManager. */
  getUndoManager(): UndoRedoManager {
    return this.undoManager;
  }

  /** Get the seed used for this game. */
  getSeed(): number {
    return this.seed;
  }

  /** Get the elapsed time in seconds. */
  getElapsedSeconds(): number {
    return this.elapsedSeconds;
  }

  /** Whether the deal animation has completed. */
  isDealComplete(): boolean {
    return this.dealComplete;
  }

  /** Whether the game has ended (win or no moves). */
  isGameEnded(): boolean {
    return this.gameEnded;
  }

  /** Get the finalized transcript, or null if the game is still in progress. */
  getTranscript(): BCGameTranscript | null {
    return this.transcript;
  }

  /** Get the transcript recorder (for access to in-progress transcript). */
  getRecorder(): BCTranscriptRecorder {
    return this.recorder;
  }

  // ── Cleanup ─────────────────────────────────────────────

  shutdown(): void {
    if (this.timerEvent) {
      this.timerEvent.destroy();
      this.timerEvent = null;
    }
    this.cancelAutoComplete();
    this.clearDropHighlights();
    this.dismissOverlay();
    this.helpPanel?.destroy();
    this.helpButton?.destroy();

    // Sound system cleanup
    this.soundManager?.destroy();
    this.soundManager = null;
    this.eventBridge?.destroy();
    this.gameEvents?.removeAllListeners();
    this.settingsPanel?.destroy();
    this.settingsButton?.destroy();
  }
}
