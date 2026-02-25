/**
 * GolfScene -- the main Phaser scene for 9-Card Golf.
 *
 * Implements the full visual interface:
 *   - Two 3x3 player grids in a horizontal layout (human on left, AI on right)
 *   - Stock and discard piles stacked vertically in the center
 *   - Click/tap input for drawing, swapping, and discarding
 *   - Card flip and swap animations via Phaser tweens
 *   - Score display, turn indicator, and end-of-round screen
 *   - AI opponent plays automatically with a short delay
 */

import type { Card, Rank, Suit } from '../../../src/card-system/Card';
import type { GolfMove, DrawSource } from '../GolfRules';
import type { GolfSession, GolfAction, TurnResult } from '../GolfGame';
import { setupGolfGame, executeTurn } from '../GolfGame';
import { scoreGrid, scoreVisibleCards } from '../GolfScoring';
import { AiPlayer, GreedyStrategy, RandomStrategy } from '../AiStrategy';
import type { AiStrategy } from '../AiStrategy';
import { TranscriptRecorder } from '../GameTranscript';
import type { BoardSnapshot, CardSnapshot } from '../GameTranscript';
import { TranscriptStore } from '../../../src/core-engine/TranscriptStore';
import { autoSaveTranscript } from '../../../src/core-engine/autoSaveTranscript';
import type { EventSoundMapping } from '../../../src/core-engine/SoundManager';
import {
  CardGameScene,
  GAME_W, GAME_H, FONT_FAMILY,
  cardTextureKey, getCardTexture, preloadCardAssets,
  createOverlayBackground, createOverlayButton, createOverlayMenuButton,
  dismissOverlay,
  createSceneTitle, createSceneMenuButton,
  PhaseManager,
  flipCard,
} from '../../../src/ui';
import type { HelpSection } from '../../../src/ui';
import helpContent from '../help-content.json';

// ── Constants ───────────────────────────────────────────────

// Card dimensions -- sized to fill the 1280x720 canvas in the horizontal
// layout.  Standard playing-card aspect ratio (5:7), roughly 2.5× the
// shared 48x65 defaults.
const GOLF_CARD_W = 120;
const GOLF_CARD_H = 168;

const CARD_GAP = 10;
const GRID_COLS = 3;
const GRID_ROWS = 3;

const AI_DELAY = 600; // ms before AI chooses
const AI_SHOW_DRAW_DELAY = 1000; // ms to show drawn card before moving
const ANIM_DURATION = 300; // ms for animations
const SWAP_ANIM_DURATION = ANIM_DURATION * 1.5; // ms for swap/discard-and-flip

// Layout positions (horizontal: human grid left, piles center, AI grid right)
//
// Grid dimensions at 120x168 with 10px gap:
//   width  = 3×120 + 2×10 = 380px
//   height = 3×168 + 2×10 = 524px
//
// Vertical: title ~50px top, instructions ~20px bottom → ~650px play area.
// Grids are vertically centred in that area (center Y ≈ 385).
// Labels 24px above grids, scores 24px below.
//
// Horizontal: left grid centred at X=230, right grid at X=1050,
// piles in the centre column at X=640.  Stock and discard are stacked
// vertically with enough gap for pile labels and the drawn-card display.
const GRID_CENTER_Y = 385;
const HUMAN_GRID_X = 230;
const AI_GRID_X = 1050;
const PILE_X = GAME_W / 2; // 640
const STOCK_Y = 295;       // center Y of stock pile
const DISCARD_Y = 490;     // center Y of discard pile

// ── Turn state machine ──────────────────────────────────────

type TurnPhase =
  | 'waiting-for-draw' // human must click stock or discard
  | 'waiting-for-move' // human must click grid card (swap) or discard pile (discard-and-flip then click face-down)
  | 'waiting-for-flip-target' // human chose to discard, must click face-down card to flip
  | 'animating' // animation in progress
  | 'ai-thinking' // AI's turn, waiting for delay
  | 'round-ended'; // game over

// ── Audio asset keys ────────────────────────────────────────

const SFX_KEYS = {
  CARD_DRAW: 'sfx-card-draw',
  CARD_FLIP: 'sfx-card-flip',
  CARD_SWAP: 'sfx-card-swap',
  CARD_DISCARD: 'sfx-card-discard',
  TURN_CHANGE: 'sfx-turn-change',
  ROUND_END: 'sfx-round-end',
  SCORE_REVEAL: 'sfx-score-reveal',
  UI_CLICK: 'sfx-ui-click',
} as const;

// ── Scene ───────────────────────────────────────────────────

/** Shared TranscriptStore instance for the Golf game. */
const transcriptStore = new TranscriptStore();

export class GolfScene extends CardGameScene {
  // Game state
  private session!: GolfSession;
  private recorder!: TranscriptRecorder;
  private aiPlayer!: AiPlayer;
  private phaseManager!: PhaseManager<TurnPhase>;
  private drawnCard: Card | null = null;
  private drawSource: DrawSource | null = null;
  private aiStrategyName: string = 'greedy';

  /** Tracks whether loadBoardState() has been called (required before enableInteractiveMode). */
  private boardStateInjected: boolean = false;

  /** Game objects belonging to the takeover overlay (for cleanup). */
  private takeoverOverlayObjects: Phaser.GameObjects.GameObject[] = [];

  // Display objects -- grids
  private humanCardSprites: Phaser.GameObjects.Image[] = [];
  private aiCardSprites: Phaser.GameObjects.Image[] = [];

  // Display objects -- piles
  private stockSprite!: Phaser.GameObjects.Image;
  private discardSprite!: Phaser.GameObjects.Image;
  private drawnCardSprite: Phaser.GameObjects.Image | null = null;

  // Display objects -- UI
  private turnText!: Phaser.GameObjects.Text;
  private humanScoreText!: Phaser.GameObjects.Text;
  private aiScoreText!: Phaser.GameObjects.Text;
  private instructionText!: Phaser.GameObjects.Text;
  private humanLabel!: Phaser.GameObjects.Text;
  private aiLabel!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'GolfScene' });
  }

  // ── Preload ─────────────────────────────────────────────

  preload(): void {
    preloadCardAssets(this, GOLF_CARD_W, GOLF_CARD_H);

    // Audio SFX assets
    this.load.audio(SFX_KEYS.CARD_DRAW, 'assets/audio/card-draw.wav');
    this.load.audio(SFX_KEYS.CARD_FLIP, 'assets/audio/card-flip.wav');
    this.load.audio(SFX_KEYS.CARD_SWAP, 'assets/audio/card-swap.wav');
    this.load.audio(SFX_KEYS.CARD_DISCARD, 'assets/audio/card-discard.wav');
    this.load.audio(SFX_KEYS.TURN_CHANGE, 'assets/audio/turn-change.wav');
    this.load.audio(SFX_KEYS.ROUND_END, 'assets/audio/round-end.wav');
    this.load.audio(SFX_KEYS.SCORE_REVEAL, 'assets/audio/score-reveal.wav');
    this.load.audio(SFX_KEYS.UI_CLICK, 'assets/audio/ui-click.wav');
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
      this.initSoundSystem(Object.values(SFX_KEYS), mapping);
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

    // Create UI
    this.createLabels();
    this.createPiles();
    this.createGrids();
    this.createScoreDisplay();
    this.createInstructions();
    this.phaseManager.setTextObject(this.instructionText);
    if (!this.replayMode) {
      this.initHelpPanel(helpContent as HelpSection[]);
      this.initSettingsPanel();
    }

    // Initial render
    this.refreshAll();

    if (this.replayMode) {
      // In replay mode: clear instruction text and emit state-settled
      // so the replay tool knows the scene is ready for state injection.
      this.instructionText.setText('');
      this.emitStateSettled(this.session.gameState.turnNumber, this.session.gameState.phase);
    } else {
      this.emitTurnStarted();
      this.phaseManager.set('waiting-for-draw');
    }
  }

  // ── Replay API ──────────────────────────────────────────

  /**
   * Inject an arbitrary board state from transcript snapshot data and
   * refresh the visual display. Intended for use by the replay tool
   * via `page.evaluate()`.
   *
   * Only operational in replay mode (?mode=replay). Throws if called
   * outside of replay mode.
   *
   * After updating the internal state and refreshing all sprites,
   * emits a `state-settled` event so the caller can synchronize
   * screenshot capture.
   *
    * @param boardStates  Per-player board snapshots (grid cards, scores).
    * @param discardTop   The card on top of the discard pile, or null if empty.
    * @param stockRemaining  Number of cards left in the stock pile.
    * @param stockPileCards  Optional full stock pile card data (v2 transcripts).
    *                        When provided, real cards are used instead of dummies.
    */
   loadBoardState(
     boardStates: BoardSnapshot[],
     discardTop: CardSnapshot | null,
     stockRemaining: number,
     stockPileCards?: CardSnapshot[],
   ): void {
    if (!this.replayMode) {
      throw new Error(
        'loadBoardState() is only available in replay mode (?mode=replay)',
      );
    }

    // Update each player's grid from the snapshot data
    for (let p = 0; p < boardStates.length; p++) {
      const snapshot = boardStates[p];
      const grid = this.session.gameState.playerStates[p].grid;
      for (let i = 0; i < snapshot.grid.length; i++) {
        const cs = snapshot.grid[i];
        // Cards have readonly rank/suit, so we replace the card object
        (grid as Card[])[i] = {
          rank: cs.rank as Rank,
          suit: cs.suit as Suit,
          faceUp: cs.faceUp,
        };
      }
    }

    // Update the discard pile: clear and push the top card if present
    this.session.shared.discardPile.clear();
    if (discardTop) {
      const card: Card = {
        rank: discardTop.rank as Rank,
        suit: discardTop.suit as Suit,
        faceUp: true,
      };
      this.session.shared.discardPile.push(card);
    }

    // Update the stock pile from the snapshot.
    // If real card data is available (v2 transcript), use it so that
    // interactive takeover draws actual cards.  Otherwise fall back to
    // dummy entries -- enough for refreshPiles() to show/hide the sprite.
    this.session.shared.stockPile.length = 0;
    if (stockPileCards && stockPileCards.length > 0) {
      for (const cs of stockPileCards) {
        this.session.shared.stockPile.push({
          rank: cs.rank as Rank,
          suit: cs.suit as Suit,
          faceUp: false,
        });
      }
    } else {
      for (let i = 0; i < stockRemaining; i++) {
        this.session.shared.stockPile.push({
          rank: 'A',
          suit: 'spades',
          faceUp: false,
        });
      }
    }

    // Refresh all visual elements
    this.refreshAll();

    // Mark that a board state has been injected
    this.boardStateInjected = true;

    // Signal that the board is visually stable and ready for screenshot
    this.emitStateSettled(this.session.gameState.turnNumber, this.session.gameState.phase);
  }

  /**
   * Transition from replay mode to interactive play.
   *
   * After `loadBoardState()` has injected a board snapshot, this method
   * re-enables input handlers on the stock pile, discard pile, and human
   * grid cards so the developer can play from the current game state.
   *
   * **Preconditions:**
   * - Must be in replay mode (`replayMode === true`).
   * - `loadBoardState()` must have been called at least once
   *   (`boardStateInjected === true`).
   *
   * **Behaviour:**
   * - Flips `replayMode` to `false`.
   * - Registers `setInteractive()` + `pointerdown` handlers on the stock
   *   pile, discard pile, and all 9 human grid card sprites.
   * - Sets `currentPlayerIndex` to `nextPlayer`.
   * - Starts the turn system: human → `waiting-for-draw`, AI → `runAiTurn()`.
   * - Does **not** initialize sounds, help panel, settings panel, or menu button.
   *
   * Designed for future extraction to a generic replay→interactive adapter
   * (see CG-0MLTFUL061DWDGA2).
   *
   * @param options.nextPlayer - Index of the player who takes the next
   *   turn (0 = human, 1 = AI).
   */
  enableInteractiveMode(options: { nextPlayer: number }): void {
    if (!this.replayMode) {
      throw new Error(
        'enableInteractiveMode() can only be called in replay mode',
      );
    }
    if (!this.boardStateInjected) {
      throw new Error(
        'enableInteractiveMode() requires loadBoardState() to be called first',
      );
    }

    // Transition out of replay mode
    this.replayMode = false;

    // Register input handlers on stock pile
    this.stockSprite.setInteractive({ useHandCursor: true });
    this.stockSprite.on('pointerdown', () => this.onStockClick());

    // Register input handlers on discard pile
    this.discardSprite.setInteractive({ useHandCursor: true });
    this.discardSprite.on('pointerdown', () => this.onDiscardClick());

    // Register input handlers on human grid cards
    for (let i = 0; i < this.humanCardSprites.length; i++) {
      const sprite = this.humanCardSprites[i];
      sprite.setInteractive({ useHandCursor: true });
      const idx = i; // capture for closure
      sprite.on('pointerdown', () => this.onHumanCardClick(idx));
    }

    // Set the next player and start the turn system
    this.session.gameState.currentPlayerIndex = options.nextPlayer;

    // Reset turn state
    this.drawnCard = null;
    this.drawSource = null;

    // Update display
    this.refreshTurnIndicator();

    // Start the turn based on which player is next
    if (options.nextPlayer === 0) {
      // Human's turn
      this.emitTurnStarted();
      this.phaseManager.set('waiting-for-draw');
    } else {
      // AI's turn
      this.emitTurnStarted();
      this.runAiTurn();
    }
  }

  /**
   * Display a takeover overlay with debug info and action buttons.
   *
   * Shows the current game state (turn number, per-player scores,
   * face-up/face-down card counts, last action) and three buttons:
   * - "Human plays next" → calls `enableInteractiveMode({ nextPlayer: 0 })`
   * - "AI plays next" → calls `enableInteractiveMode({ nextPlayer: 1 })`
   * - "Resume replay" → emits `resume-replay` event for CLI to continue
   *
   * The overlay blocks all input until a button is clicked.
   *
   * @param options.turnNumber - The turn number where replay was paused.
   * @param options.lastAction - Human-readable description of the last action.
   */
  showTakeoverOverlay(options: { turnNumber: number; lastAction: string }): void {
    // Clean up any previous overlay
    dismissOverlay(this.takeoverOverlayObjects);
    this.takeoverOverlayObjects = [];

    // Create the overlay background + box
    const overlay = createOverlayBackground(
      this,
      { depth: 20, alpha: 0.75 },
      { width: 620, height: 420, alpha: 0.9, depth: 20 },
    );
    this.takeoverOverlayObjects.push(...overlay.objects);

    const centerX = GAME_W / 2;
    const boxTop = GAME_H / 2 - 210;

    // Title
    const title = this.add
      .text(centerX, boxTop + 30, 'Interactive Takeover', {
        fontSize: '26px',
        color: '#ffdd44',
        fontFamily: FONT_FAMILY,
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(21);
    this.takeoverOverlayObjects.push(title);

    // Gather debug info
    const humanGrid = this.session.gameState.playerStates[0].grid;
    const aiGrid = this.session.gameState.playerStates[1].grid;
    const humanVisibleScore = scoreVisibleCards(humanGrid);
    const aiVisibleScore = scoreVisibleCards(aiGrid);
    const humanFaceUp = humanGrid.filter((c) => c.faceUp).length;
    const humanFaceDown = humanGrid.filter((c) => !c.faceUp).length;
    const aiFaceUp = aiGrid.filter((c) => c.faceUp).length;
    const aiFaceDown = aiGrid.filter((c) => !c.faceUp).length;

    const infoLines = [
      `Paused at turn: ${options.turnNumber}`,
      ``,
      `You:  Score ${humanVisibleScore}  (${humanFaceUp} face-up, ${humanFaceDown} face-down)`,
      `AI:   Score ${aiVisibleScore}  (${aiFaceUp} face-up, ${aiFaceDown} face-down)`,
      ``,
      `Last action: ${options.lastAction}`,
    ];

    const info = this.add
      .text(centerX, boxTop + 90, infoLines.join('\n'), {
        fontSize: '16px',
        color: '#cccccc',
        fontFamily: FONT_FAMILY,
        align: 'center',
        lineSpacing: 6,
      })
      .setOrigin(0.5, 0)
      .setDepth(21);
    this.takeoverOverlayObjects.push(info);

    // Helper to destroy overlay and mark interactive mode
    const dismissAndAct = (action: () => void) => {
      // Destroy all overlay objects
      dismissOverlay(this.takeoverOverlayObjects);
      this.takeoverOverlayObjects = [];

      // Mark interactive mode flag for auto-capture
      (window as unknown as Record<string, unknown>).__REPLAY_INTERACTIVE_MODE__ = true;

      action();
    };

    const buttonY = boxTop + 310;
    const buttonSpacing = 170;

    // "Human plays next" button
    const humanBtn = createOverlayButton(
      this,
      centerX - buttonSpacing,
      buttonY,
      '[ Human plays next ]',
      21,
      { fontSize: '16px' },
    );
    humanBtn.on('pointerdown', () => {
      dismissAndAct(() => this.enableInteractiveMode({ nextPlayer: 0 }));
    });
    this.takeoverOverlayObjects.push(humanBtn);

    // "AI plays next" button
    const aiBtn = createOverlayButton(
      this,
      centerX,
      buttonY,
      '[ AI plays next ]',
      21,
      { fontSize: '16px' },
    );
    aiBtn.on('pointerdown', () => {
      dismissAndAct(() => this.enableInteractiveMode({ nextPlayer: 1 }));
    });
    this.takeoverOverlayObjects.push(aiBtn);

    // "Resume replay" button
    const resumeBtn = createOverlayButton(
      this,
      centerX + buttonSpacing,
      buttonY,
      '[ Resume replay ]',
      21,
      { fontSize: '16px' },
    );
    resumeBtn.on('pointerdown', () => {
      dismissAndAct(() => {
        // Emit resume-replay event for the CLI to catch
        this.gameEvents.emit(
          'resume-replay' as Parameters<typeof this.gameEvents.emit>[0],
          {} as never,
        );
      });
    });
    this.takeoverOverlayObjects.push(resumeBtn);
  }

  // ── UI creation ─────────────────────────────────────────

  private createLabels(): void {
    // Menu button (top-left) -- returns to game selector
    if (!this.replayMode) {
      createSceneMenuButton(this);
    }

    createSceneTitle(this, '9-Card Golf');

    // Player labels above each grid
    const gridH = GRID_ROWS * GOLF_CARD_H + (GRID_ROWS - 1) * CARD_GAP;

    this.humanLabel = this.add
      .text(HUMAN_GRID_X, GRID_CENTER_Y - gridH / 2 - 24, 'You', {
        fontSize: '24px',
        color: '#ffffff',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5);

    this.aiLabel = this.add
      .text(AI_GRID_X, GRID_CENTER_Y - gridH / 2 - 24, 'AI', {
        fontSize: '24px',
        color: '#cccccc',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5);
  }

  private createPiles(): void {
    // Stock pile (upper center)
    this.stockSprite = this.add.image(PILE_X, STOCK_Y, 'card_back');
    if (!this.replayMode) {
      this.stockSprite.setInteractive({ useHandCursor: true });
      this.stockSprite.on('pointerdown', () => this.onStockClick());
    }

    this.add
      .text(PILE_X, STOCK_Y + GOLF_CARD_H / 2 + 16, 'Stock', {
        fontSize: '16px',
        color: '#aaccaa',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5);

    // Discard pile (lower center)
    this.discardSprite = this.add.image(PILE_X, DISCARD_Y, 'card_back');
    if (!this.replayMode) {
      this.discardSprite.setInteractive({ useHandCursor: true });
      this.discardSprite.on('pointerdown', () => this.onDiscardClick());
    }

    this.add
      .text(PILE_X, DISCARD_Y + GOLF_CARD_H / 2 + 16, 'Discard', {
        fontSize: '16px',
        color: '#aaccaa',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5);
  }

  private createGrids(): void {
    // Human grid (bottom)
    for (let i = 0; i < 9; i++) {
      const { x, y } = this.gridCellPosition(i, 'human');
      const sprite = this.add.image(x, y, 'card_back');
      if (!this.replayMode) {
        sprite.setInteractive({ useHandCursor: true });
        sprite.on('pointerdown', () => this.onHumanCardClick(i));
      }
      this.humanCardSprites.push(sprite);
    }

    // AI grid (top)
    for (let i = 0; i < 9; i++) {
      const { x, y } = this.gridCellPosition(i, 'ai');
      const sprite = this.add.image(x, y, 'card_back');
      this.aiCardSprites.push(sprite);
    }
  }

  private createScoreDisplay(): void {
    // Scores below each grid
    const gridH = GRID_ROWS * GOLF_CARD_H + (GRID_ROWS - 1) * CARD_GAP;

    this.humanScoreText = this.add
      .text(HUMAN_GRID_X, GRID_CENTER_Y + gridH / 2 + 24, 'Score: 0', {
        fontSize: '22px',
        color: '#ffffff',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5);

    this.aiScoreText = this.add
      .text(AI_GRID_X, GRID_CENTER_Y + gridH / 2 + 24, 'Score: 0', {
        fontSize: '22px',
        color: '#cccccc',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5);

    // Turn indicator above the stock pile in center
    this.turnText = this.add
      .text(PILE_X, STOCK_Y - GOLF_CARD_H / 2 - 24, '', {
        fontSize: '20px',
        color: '#ffdd44',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5);
  }

  private createInstructions(): void {
    this.instructionText = this.add
      .text(GAME_W / 2, GAME_H - 18, '', {
        fontSize: '18px',
        color: '#88aa88',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5);
  }

  // ── Grid layout helpers ─────────────────────────────────

  private gridCellPosition(
    index: number,
    player: 'human' | 'ai',
  ): { x: number; y: number } {
    const row = Math.floor(index / GRID_COLS);
    const col = index % GRID_COLS;

    const gridW = GRID_COLS * GOLF_CARD_W + (GRID_COLS - 1) * CARD_GAP;
    const gridH = GRID_ROWS * GOLF_CARD_H + (GRID_ROWS - 1) * CARD_GAP;

    const centerX = player === 'human' ? HUMAN_GRID_X : AI_GRID_X;
    const startX = centerX - gridW / 2 + GOLF_CARD_W / 2;
    const startY = GRID_CENTER_Y - gridH / 2 + GOLF_CARD_H / 2;

    return {
      x: startX + col * (GOLF_CARD_W + CARD_GAP),
      y: startY + row * (GOLF_CARD_H + CARD_GAP),
    };
  }

  // ── Refresh display ─────────────────────────────────────

  private refreshAll(): void {
    this.refreshGrid('human');
    this.refreshGrid('ai');
    this.refreshPiles();
    this.refreshScores();
    this.refreshTurnIndicator();
  }

  private refreshGrid(player: 'human' | 'ai'): void {
    const playerIdx = player === 'human' ? 0 : 1;
    const grid = this.session.gameState.playerStates[playerIdx].grid;
    const sprites = player === 'human' ? this.humanCardSprites : this.aiCardSprites;

    for (let i = 0; i < 9; i++) {
      sprites[i].setTexture(getCardTexture(grid[i]));
    }
  }

  private refreshPiles(): void {
    // Stock: always shows card_back (or nothing if empty)
    if (this.session.shared.stockPile.length > 0) {
      this.stockSprite.setVisible(true);
      this.stockSprite.setTexture('card_back');
      this.stockSprite.setAlpha(1);
    } else {
      this.stockSprite.setVisible(false);
    }

    // Discard: shows top card face-up, or a dimmed placeholder when empty
    // so the player can always click it to discard their drawn card.
    const top = this.session.shared.discardPile.peek();
    if (top) {
      this.discardSprite.setVisible(true);
      this.discardSprite.setTexture(getCardTexture(top));
      this.discardSprite.setAlpha(1);
    } else if (this.replayMode) {
      this.discardSprite.setVisible(false);
    } else {
      this.showDiscardPlaceholder();
    }
  }

  /** Show a dimmed card-back as an empty-pile placeholder so the discard
   *  area remains visible and clickable even when no cards are on it. */
  private showDiscardPlaceholder(): void {
    this.discardSprite.setVisible(true);
    this.discardSprite.setTexture('card_back');
    this.discardSprite.setAlpha(0.25);
  }

  private refreshScores(): void {
    const humanGrid = this.session.gameState.playerStates[0].grid;
    const aiGrid = this.session.gameState.playerStates[1].grid;

    const humanVisible = scoreVisibleCards(humanGrid);
    const aiVisible = scoreVisibleCards(aiGrid);

    if (this.session.gameState.phase === 'ended') {
      const humanFinal = scoreGrid(humanGrid);
      const aiFinal = scoreGrid(aiGrid);
      this.humanScoreText.setText(`Score: ${humanFinal}`);
      this.aiScoreText.setText(`Score: ${aiFinal}`);
    } else {
      this.humanScoreText.setText(`Score: ${humanVisible}`);
      this.aiScoreText.setText(`Score: ${aiVisible}`);
    }
  }

  private refreshTurnIndicator(): void {
    if (this.session.gameState.phase === 'ended') {
      this.turnText.setText('Round Over!');
      return;
    }

    const currentIdx = this.session.gameState.currentPlayerIndex;
    const name = this.session.gameState.players[currentIdx].name;
    this.turnText.setText(`${name}'s turn`);

    // Highlight active player label
    if (currentIdx === 0) {
      this.humanLabel.setColor('#ffdd44');
      this.aiLabel.setColor('#cccccc');
    } else {
      this.humanLabel.setColor('#ffffff');
      this.aiLabel.setColor('#ffdd44');
    }
  }

  // ── Human input handlers ────────────────────────────────

  private onStockClick(): void {
    if (this.phaseManager.current === 'waiting-for-draw' && this.isHumanTurn()) {
      this.humanDraw('stock');
    }
  }

  private onDiscardClick(): void {
    if (this.phaseManager.current === 'waiting-for-draw' && this.isHumanTurn()) {
      this.humanDraw('discard');
    } else if (this.phaseManager.current === 'waiting-for-move' && this.isHumanTurn()) {
      // Player chose to discard the drawn card — animate it to the discard
      // pile now, then prompt for the face-down card to flip.
      this.animateDrawnCardToDiscard(() => {
        this.phaseManager.set('waiting-for-flip-target');
      });
    }
  }

  private onHumanCardClick(gridIndex: number): void {
    if (this.phaseManager.current === 'waiting-for-move' && this.isHumanTurn()) {
      // Swap: replace grid card with drawn card
      this.humanMove({ kind: 'swap', row: Math.floor(gridIndex / 3), col: gridIndex % 3 });
    } else if (this.phaseManager.current === 'waiting-for-flip-target' && this.isHumanTurn()) {
      // Discard-and-flip: must click a face-down card
      const grid = this.session.gameState.playerStates[0].grid;
      if (!grid[gridIndex].faceUp) {
        this.humanMove({
          kind: 'discard-and-flip',
          row: Math.floor(gridIndex / 3),
          col: gridIndex % 3,
        });
      }
    }
  }

  // ── Human turn execution ────────────────────────────────

  private humanDraw(source: DrawSource): void {
    this.drawSource = source;

    // Peek at the card that will be drawn
    if (source === 'stock') {
      const stockArr = this.session.shared.stockPile;
      this.drawnCard = stockArr[stockArr.length - 1];
    } else {
      this.drawnCard = this.session.shared.discardPile.peek() ?? null;
    }

    if (!this.drawnCard) return;

    // When drawing from discard, update the pile visual immediately so the
    // taken card disappears from the top. We peek at the card below by
    // temporarily treating the pile's underlying array.
    if (source === 'discard') {
      this.updateDiscardPileAfterDraw();
    }

    // Emit card-drawn event
    this.gameEvents.emit('card-drawn', {
      source,
      playerIndex: 0,
    });

    // Show the drawn card animating from the source pile to the held position
    this.showDrawnCard(this.drawnCard, source);
    this.phaseManager.set('waiting-for-move');
  }

  private humanMove(move: GolfMove): void {
    if (!this.drawSource) return;

    const action: GolfAction = { drawSource: this.drawSource, move };
    this.phaseManager.set('animating');

    const result = executeTurn(this.session, action);
    this.recorder.recordTurn(result, action.drawSource);

    // Emit card-level events based on the move type
    if (move.kind === 'swap') {
      this.gameEvents.emit('card-swapped', {
        position: move.row * 3 + move.col,
        drawnFrom: this.drawSource,
        playerIndex: 0,
      });
    } else {
      // discard-and-flip: emit both discard and flip events
      this.gameEvents.emit('card-discarded', { playerIndex: 0 });
      this.gameEvents.emit('card-flipped', {
        position: move.row * 3 + move.col,
        playerIndex: 0,
      });
    }

    this.emitTurnCompleted(result);

    // Animate, then proceed
    this.animateTurn(result, () => {
      this.refreshAll();
      this.emitAnimationComplete();
      this.drawnCard = null;
      this.drawSource = null;

      if (result.roundEnded) {
        this.emitStateSettled(this.session.gameState.turnNumber, this.session.gameState.phase);
        this.phaseManager.set('round-ended');
      } else {
        this.emitStateSettled(this.session.gameState.turnNumber, this.session.gameState.phase);
        this.emitTurnStarted();
        this.checkNextTurn();
      }
    });
  }

  // ── AI turn ─────────────────────────────────────────────

  private runAiTurn(): void {
    this.phaseManager.set('ai-thinking');

    this.time.delayedCall(AI_DELAY, () => {
      const idx = this.session.gameState.currentPlayerIndex;
      const ps = this.session.gameState.playerStates[idx];
      const action = this.aiPlayer.chooseAction(ps, this.session.shared);

      // Show which pile the AI draws from and the drawn card
      const peekCard = action.drawSource === 'stock'
        ? this.session.shared.stockPile[this.session.shared.stockPile.length - 1]
        : this.session.shared.discardPile.peek() ?? null;

      // When AI draws from discard, update the pile visual immediately
      if (action.drawSource === 'discard') {
        this.updateDiscardPileAfterDraw();
      }

      if (peekCard) {
        this.showDrawnCard(peekCard, action.drawSource);
      }
      const sourceLabel = action.drawSource === 'stock' ? 'Stock pile' : 'Discard pile';
      this.instructionText.setText(`AI drew from ${sourceLabel}`);

      // Emit card-drawn event for AI
      this.gameEvents.emit('card-drawn', {
        source: action.drawSource,
        playerIndex: idx,
      });

      // Pause so the player can see the drawn card, then execute the move
      this.time.delayedCall(AI_SHOW_DRAW_DELAY, () => {
        this.phaseManager.set('animating');
        const result = executeTurn(this.session, action);
        this.recorder.recordTurn(result, action.drawSource);

        // Emit card-level events based on the AI's move type
        if (action.move.kind === 'swap') {
          this.gameEvents.emit('card-swapped', {
            position: action.move.row * 3 + action.move.col,
            drawnFrom: action.drawSource,
            playerIndex: idx,
          });
        } else {
          this.gameEvents.emit('card-discarded', { playerIndex: idx });
          this.gameEvents.emit('card-flipped', {
            position: action.move.row * 3 + action.move.col,
            playerIndex: idx,
          });
        }

        this.emitTurnCompleted(result);

        this.animateTurn(result, () => {
          this.refreshAll();
          this.emitAnimationComplete();

          if (result.roundEnded) {
            this.emitStateSettled(this.session.gameState.turnNumber, this.session.gameState.phase);
            this.phaseManager.set('round-ended');
          } else {
            this.emitStateSettled(this.session.gameState.turnNumber, this.session.gameState.phase);
            this.emitTurnStarted();
            this.checkNextTurn();
          }
        });
      });
    });
  }

  // ── Turn flow ───────────────────────────────────────────

  private isHumanTurn(): boolean {
    return this.session.gameState.currentPlayerIndex === 0;
  }

  private checkNextTurn(): void {
    if (this.session.gameState.phase === 'ended') {
      this.phaseManager.set('round-ended');
    } else if (this.isHumanTurn()) {
      this.phaseManager.set('waiting-for-draw');
    } else {
      this.runAiTurn();
    }
  }

  // ── Animations ──────────────────────────────────────────

  private animateTurn(result: TurnResult, onComplete: () => void): void {
    const playerKey = result.playerIndex === 0 ? 'human' : 'ai';
    const sprites = playerKey === 'human' ? this.humanCardSprites : this.aiCardSprites;

    // Wrap the caller's onComplete to clean up the drawn card sprite first.
    // The drawn card persists on-screen during the animation so that future
    // animation improvements can tween it to its destination.
    const wrappedOnComplete = () => {
      this.hideDrawnCard();
      onComplete();
    };

    if (result.move.kind === 'swap') {
      const idx = result.move.row * 3 + result.move.col;
      const sprite = sprites[idx];
      const grid = this.session.gameState.playerStates[result.playerIndex].grid;

      // Compute destination positions
      const gridSlotPos = this.gridCellPosition(idx, playerKey);
      const discardPos = { x: PILE_X, y: DISCARD_Y };

      // Track completion of both parallel tweens
      let completed = 0;
      const checkDone = () => {
        completed++;
        if (completed === 2) {
          // Snap the grid sprite back to its slot (it was tweened to the
          // discard pile). refreshAll() will update its texture to the new
          // card that now occupies this slot in game state.
          sprite.setPosition(gridSlotPos.x, gridSlotPos.y);
          sprite.setDepth(0);
          wrappedOnComplete();
        }
      };

      // Raise grid card depth so it renders above other grid cards during transit
      sprite.setDepth(10);

      // 1. Grid card: flip (reveal face) + translate to discard pile
      flipCard({
        scene: this,
        target: sprite,
        newTexture: getCardTexture(grid[idx]),
        duration: SWAP_ANIM_DURATION,
        easeClose: 'Power2',
        destX: discardPos.x,
        destY: discardPos.y,
        onComplete: checkDone,
      });

      // 2. Drawn card: translate from display position to vacated grid slot
      if (this.drawnCardSprite) {
        this.tweens.add({
          targets: this.drawnCardSprite,
          x: gridSlotPos.x,
          y: gridSlotPos.y,
          duration: SWAP_ANIM_DURATION,
          ease: 'Power2',
          onComplete: checkDone,
        });
      } else {
        // Edge case: no drawn card sprite (shouldn't happen, but be safe)
        checkDone();
      }
    } else {
      // Discard-and-flip: two sequential phases
      // Phase 1: drawn card animates to discard pile
      // Phase 2: selected grid card flips in place to reveal its face
      const idx = result.move.row * 3 + result.move.col;
      const sprite = sprites[idx];
      const grid = this.session.gameState.playerStates[result.playerIndex].grid;
      const discardPos = { x: PILE_X, y: DISCARD_Y };

      const phase2 = () => {
        // Clean up drawn card after it arrives at discard pile
        this.hideDrawnCard();

        // Phase 2: flip the grid card in place
        flipCard({
          scene: this,
          target: sprite,
          newTexture: getCardTexture(grid[idx]),
          duration: SWAP_ANIM_DURATION / 2,
          easeClose: 'Power2',
          onComplete: onComplete, // Skip wrappedOnComplete; drawn card already hidden
        });
      };

      // Phase 1: animate drawn card to discard pile
      if (this.drawnCardSprite) {
        this.tweens.add({
          targets: this.drawnCardSprite,
          x: discardPos.x,
          y: discardPos.y,
          duration: SWAP_ANIM_DURATION / 2,
          ease: 'Power2',
          onComplete: phase2,
        });
      } else {
        // Edge case: no drawn card sprite, skip directly to flip
        phase2();
      }
    }
  }

  // ── Drawn card display ──────────────────────────────────

  private showDrawnCard(card: Card, source: DrawSource = 'stock'): void {
    // Destination: to the right of the discard pile, between piles and AI grid
    const destX = PILE_X + GOLF_CARD_W + 24;
    const destY = DISCARD_Y;
    const faceTexture = cardTextureKey(card.rank, card.suit);

    // Start at the source pile position
    const startX = PILE_X;
    const startY = source === 'stock' ? STOCK_Y : DISCARD_Y;

    if (source === 'stock') {
      // Stock draw: start face-down, flip to reveal during transit
      this.drawnCardSprite = this.add.image(startX, startY, 'card_back');
      this.drawnCardSprite.setDepth(15);

      flipCard({
        scene: this,
        target: this.drawnCardSprite,
        newTexture: faceTexture,
        duration: ANIM_DURATION,
        easeClose: 'Power2',
        destX,
        destY,
        onComplete: () => {
          if (this.drawnCardSprite) this.drawnCardSprite.setDepth(0);
        },
      });
    } else {
      // Discard draw: card is already face-up, slide to held position
      this.drawnCardSprite = this.add.image(startX, startY, faceTexture);
      this.drawnCardSprite.setDepth(15);

      this.tweens.add({
        targets: this.drawnCardSprite,
        x: destX,
        y: destY,
        duration: ANIM_DURATION,
        ease: 'Power2',
        onComplete: () => {
          if (this.drawnCardSprite) this.drawnCardSprite.setDepth(0);
        },
      });
    }

    // Update turn label
    this.turnText.setText(`Drew: ${card.rank} of ${card.suit}`);
  }

  /**
   * Visually update the discard pile to show the card beneath the one being
   * drawn.  Called during the preview phase (before `executeTurn()` pops
   * the card) so the taken card disappears from the pile immediately.
   */
  private updateDiscardPileAfterDraw(): void {
    const pile = this.session.shared.discardPile;
    if (pile.size() <= 1) {
      // Only one card (the one being taken) — show empty placeholder.
      this.showDiscardPlaceholder();
    } else {
      // Show the card below the top. toArray() returns bottom-to-top order,
      // so the second-to-last element is the next top after the draw.
      const arr = pile.toArray();
      const nextTop = arr[arr.length - 2];
      this.discardSprite.setTexture(getCardTexture(nextTop));
      this.discardSprite.setAlpha(1);
    }
  }

  /**
   * Animate the drawn card sprite from its current (held) position to the
   * discard pile.  Called when the player clicks the discard pile to discard
   * their drawn card, so the visual feedback happens immediately rather than
   * waiting until the flip-target is chosen.
   */
  private animateDrawnCardToDiscard(onComplete: () => void): void {
    if (!this.drawnCardSprite) {
      onComplete();
      return;
    }

    // Block further input while the card is in transit
    this.phaseManager.set('animating');
    this.drawnCardSprite.setDepth(15);

    this.tweens.add({
      targets: this.drawnCardSprite,
      x: PILE_X,
      y: DISCARD_Y,
      duration: SWAP_ANIM_DURATION / 2,
      ease: 'Power2',
      onComplete: () => {
        this.hideDrawnCard();
        // Update the discard sprite to show the card that was just visually
        // discarded (state hasn't mutated yet, so we use the peeked card).
        if (this.drawnCard) {
          this.discardSprite.setTexture(getCardTexture(this.drawnCard));
          this.discardSprite.setAlpha(1);
          this.discardSprite.setVisible(true);
        }
        onComplete();
      },
    });
  }

  private hideDrawnCard(): void {
    if (this.drawnCardSprite) {
      this.drawnCardSprite.destroy();
      this.drawnCardSprite = null;
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

  /** Emit turn-completed after a move is resolved and recorded. */
  private emitTurnCompleted(result: TurnResult): void {
    this.gameEvents.emit('turn-completed', {
      turnNumber: this.session.gameState.turnNumber,
      playerIndex: result.playerIndex,
      playerName: this.session.gameState.players[result.playerIndex].name,
      phase: this.session.gameState.phase,
    });
  }

  /** Emit animation-complete after all tweens for the turn finish. */
  private emitAnimationComplete(): void {
    this.gameEvents.emit('animation-complete', {
      turnNumber: this.session.gameState.turnNumber,
    });
  }

  /** Emit game-ended with final results. */
  private emitGameEnded(winnerIndex: number, reason?: string): void {
    this.gameEvents.emit('game-ended', {
      finalTurnNumber: this.session.gameState.turnNumber,
      winnerIndex,
      reason,
    });
  }

  /** Clean up resources when the scene shuts down. */
  shutdown(): void {
    this.shutdownBase();
  }

  // ── End screen ──────────────────────────────────────────

  private showEndScreen(): void {
    // Reveal all cards
    for (let p = 0; p < 2; p++) {
      const grid = this.session.gameState.playerStates[p].grid;
      for (let i = 0; i < 9; i++) {
        grid[i].faceUp = true;
      }
    }
    this.refreshGrid('human');
    this.refreshGrid('ai');
    this.refreshScores();

    const transcript = this.recorder.finalize();
    const results = transcript.results!;

    // Auto-save transcript to browser storage
    autoSaveTranscript(transcriptStore, 'golf', transcript, '[GolfScene]');

    // Play score-reveal sound directly (not event-mapped)
    this.soundManager?.play(SFX_KEYS.SCORE_REVEAL);

    // Emit game-ended event
    const winnerIdx = results.winnerIndex;
    const winnerName = this.session.gameState.players[winnerIdx].name;
    this.emitGameEnded(
      winnerIdx,
      `${winnerName} wins (${results.scores[winnerIdx]} pts)`,
    );

    // Overlay -- near-invisible blocker + visible box
    createOverlayBackground(
      this,
      { depth: 10, alpha: 0.01 },
      { width: 520, height: 300, alpha: 0.85 },
    );

    const winnerText = results.winnerIndex === 0 ? 'You Win!' : 'AI Wins!';
    this.add
      .text(
        GAME_W / 2,
        GAME_H / 2 - 50,
        `${winnerText}\n\nYou: ${results.scores[0]} pts\nAI: ${results.scores[1]} pts`,
        {
          fontSize: '28px',
          color: '#ffffff',
          fontFamily: FONT_FAMILY,
          align: 'center',
        },
      )
      .setOrigin(0.5)
      .setDepth(11);

    // Play again button
    const btn = createOverlayButton(
      this, GAME_W / 2 - 85, GAME_H / 2 + 85, '[ Play Again ]',
    );
    btn.on('pointerdown', () => {
      this.soundManager?.play(SFX_KEYS.UI_CLICK);
      this.gameEvents.emit('ui-interaction', {
        elementId: 'play-again',
        action: 'click',
      });
      this.scene.restart();
    });

    // Menu button
    createOverlayMenuButton(this, GAME_W / 2 + 85, GAME_H / 2 + 85);
  }
}
