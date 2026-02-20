/**
 * GolfScene -- the main Phaser scene for 9-Card Golf.
 *
 * Implements the full visual interface:
 *   - Two 3x3 player grids (human at bottom, AI at top)
 *   - Stock and discard piles in the center
 *   - Click/tap input for drawing, swapping, and discarding
 *   - Card flip and swap animations via Phaser tweens
 *   - Score display, turn indicator, and end-of-round screen
 *   - AI opponent plays automatically with a short delay
 */

import Phaser from 'phaser';
import type { Card, Rank, Suit } from '../../../src/card-system/Card';
import type { GolfMove, DrawSource } from '../GolfRules';
import type { GolfSession, GolfAction, TurnResult } from '../GolfGame';
import { setupGolfGame, executeTurn } from '../GolfGame';
import { scoreGrid, scoreVisibleCards } from '../GolfScoring';
import { AiPlayer, GreedyStrategy, RandomStrategy } from '../AiStrategy';
import type { AiStrategy } from '../AiStrategy';
import { TranscriptRecorder } from '../GameTranscript';
import type { GameTranscript, BoardSnapshot, CardSnapshot } from '../GameTranscript';
import { TranscriptStore } from '../../../src/core-engine/TranscriptStore';
import { GameEventEmitter } from '../../../src/core-engine/GameEventEmitter';
import { PhaserEventBridge } from '../../../src/core-engine/PhaserEventBridge';
import {
  HelpPanel, HelpButton,
  CARD_W, CARD_H, GAME_W, GAME_H, FONT_FAMILY,
  cardTextureKey, getCardTexture, preloadCardAssets,
  createOverlayBackground, createOverlayButton, createOverlayMenuButton,
  createSceneTitle, createSceneMenuButton,
} from '../../../src/ui';
import type { HelpSection } from '../../../src/ui';
import helpContent from '../help-content.json';

// ── Constants ───────────────────────────────────────────────

const CARD_GAP = 5;
const GRID_COLS = 3;
const GRID_ROWS = 3;

const AI_DELAY = 600; // ms before AI chooses
const AI_SHOW_DRAW_DELAY = 1000; // ms to show drawn card before moving
const ANIM_DURATION = 300; // ms for animations
const SWAP_ANIM_DURATION = ANIM_DURATION * 1.5; // ms for swap/discard-and-flip

// Layout positions (designed to fit two 3x3 grids + piles in 600px height)
const AI_GRID_Y = 105; // center Y of AI grid
const HUMAN_GRID_Y = 480; // center Y of human grid
const PILE_Y = 295; // center Y of stock/discard
const STOCK_X = GAME_W / 2 - 50;
const DISCARD_X = GAME_W / 2 + 50;

// ── Turn state machine ──────────────────────────────────────

type TurnPhase =
  | 'waiting-for-draw' // human must click stock or discard
  | 'waiting-for-move' // human must click grid card (swap) or discard pile (discard-and-flip then click face-down)
  | 'waiting-for-flip-target' // human chose to discard, must click face-down card to flip
  | 'animating' // animation in progress
  | 'ai-thinking' // AI's turn, waiting for delay
  | 'round-ended'; // game over

// ── Scene ───────────────────────────────────────────────────

/** Shared TranscriptStore instance for the Golf game. */
const transcriptStore = new TranscriptStore();

export class GolfScene extends Phaser.Scene {
  // Game state
  private session!: GolfSession;
  private recorder!: TranscriptRecorder;
  private aiPlayer!: AiPlayer;
  private turnPhase: TurnPhase = 'waiting-for-draw';
  private drawnCard: Card | null = null;
  private drawSource: DrawSource | null = null;
  private aiStrategyName: string = 'greedy';

  /** When true, the scene suppresses all input and AI turns for replay use. */
  private replayMode: boolean = false;

  // Event system
  private gameEvents!: GameEventEmitter;
  private eventBridge!: PhaserEventBridge;

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

  // Help panel
  private helpPanel!: HelpPanel;
  private helpButton!: HelpButton;

  constructor() {
    super({ key: 'GolfScene' });
  }

  // ── Preload ─────────────────────────────────────────────

  preload(): void {
    preloadCardAssets(this);
  }

  // ── Create ──────────────────────────────────────────────

  create(): void {
    this.cameras.main.setBackgroundColor('#2d572c');

    // Reset display object arrays (stale refs from previous run on restart)
    this.humanCardSprites = [];
    this.aiCardSprites = [];
    this.drawnCardSprite = null;
    this.turnPhase = 'waiting-for-draw';
    this.drawnCard = null;
    this.drawSource = null;

    // Check for replay mode via URL parameter (?mode=replay)
    this.replayMode =
      new URLSearchParams(window.location.search).get('mode') === 'replay';

    // Select AI strategy
    const strategy: AiStrategy =
      this.aiStrategyName === 'random' ? RandomStrategy : GreedyStrategy;

    // Event system: create emitter and bridge to Phaser scene events
    this.gameEvents = new GameEventEmitter();
    this.eventBridge = new PhaserEventBridge(this.gameEvents, this.events);
    (window as unknown as Record<string, unknown>).__GAME_EVENTS__ =
      this.gameEvents;

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
    if (!this.replayMode) {
      this.createHelpPanel();
    }

    // Initial render
    this.refreshAll();

    if (this.replayMode) {
      // In replay mode: clear instruction text and emit state-settled
      // so the replay tool knows the scene is ready for state injection.
      this.instructionText.setText('');
      this.emitStateSettled();
    } else {
      this.emitTurnStarted();
      this.setPhase('waiting-for-draw');
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
   */
  loadBoardState(
    boardStates: BoardSnapshot[],
    discardTop: CardSnapshot | null,
    stockRemaining: number,
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

    // Update the stock pile length to match the snapshot.
    // We don't need real card data -- just enough entries so
    // refreshPiles() shows/hides the stock sprite correctly.
    this.session.shared.stockPile.length = 0;
    for (let i = 0; i < stockRemaining; i++) {
      this.session.shared.stockPile.push({
        rank: 'A',
        suit: 'spades',
        faceUp: false,
      });
    }

    // Refresh all visual elements
    this.refreshAll();

    // Signal that the board is visually stable and ready for screenshot
    this.emitStateSettled();
  }

  // ── UI creation ─────────────────────────────────────────

  private createLabels(): void {
    // Menu button (top-left) -- returns to game selector
    if (!this.replayMode) {
      createSceneMenuButton(this);
    }

    createSceneTitle(this, '9-Card Golf');

    this.aiLabel = this.add
      .text(GAME_W / 2 - 130, AI_GRID_Y, 'AI', {
        fontSize: '14px',
        color: '#cccccc',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5);

    this.humanLabel = this.add
      .text(GAME_W / 2 - 130, HUMAN_GRID_Y, 'You', {
        fontSize: '14px',
        color: '#ffffff',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5);
  }

  private createPiles(): void {
    // Stock pile
    this.stockSprite = this.add.image(STOCK_X, PILE_Y, 'card_back');
    if (!this.replayMode) {
      this.stockSprite.setInteractive({ useHandCursor: true });
      this.stockSprite.on('pointerdown', () => this.onStockClick());
    }

    this.add
      .text(STOCK_X, PILE_Y + CARD_H / 2 + 10, 'Stock', {
        fontSize: '10px',
        color: '#aaccaa',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5);

    // Discard pile
    this.discardSprite = this.add.image(DISCARD_X, PILE_Y, 'card_back');
    if (!this.replayMode) {
      this.discardSprite.setInteractive({ useHandCursor: true });
      this.discardSprite.on('pointerdown', () => this.onDiscardClick());
    }

    this.add
      .text(DISCARD_X, PILE_Y + CARD_H / 2 + 10, 'Discard', {
        fontSize: '10px',
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
    this.humanScoreText = this.add
      .text(GAME_W / 2 + 130, HUMAN_GRID_Y, 'Score: 0', {
        fontSize: '13px',
        color: '#ffffff',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0, 0.5);

    this.aiScoreText = this.add
      .text(GAME_W / 2 + 130, AI_GRID_Y, 'Score: 0', {
        fontSize: '13px',
        color: '#cccccc',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0, 0.5);

    this.turnText = this.add
      .text(GAME_W / 2, PILE_Y - CARD_H / 2 - 14, '', {
        fontSize: '12px',
        color: '#ffdd44',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5);
  }

  private createInstructions(): void {
    this.instructionText = this.add
      .text(GAME_W / 2, GAME_H - 10, '', {
        fontSize: '11px',
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

    const gridW = GRID_COLS * CARD_W + (GRID_COLS - 1) * CARD_GAP;
    const gridH = GRID_ROWS * CARD_H + (GRID_ROWS - 1) * CARD_GAP;

    const centerY = player === 'human' ? HUMAN_GRID_Y : AI_GRID_Y;
    const startX = (GAME_W - gridW) / 2 + CARD_W / 2;
    const startY = centerY - gridH / 2 + CARD_H / 2;

    return {
      x: startX + col * (CARD_W + CARD_GAP),
      y: startY + row * (CARD_H + CARD_GAP),
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
    } else {
      this.stockSprite.setVisible(false);
    }

    // Discard: shows top card face-up
    const top = this.session.shared.discardPile.peek();
    if (top) {
      this.discardSprite.setVisible(true);
      this.discardSprite.setTexture(getCardTexture(top));
    } else {
      this.discardSprite.setVisible(false);
    }
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

  // ── Phase management ────────────────────────────────────

  private setPhase(phase: TurnPhase): void {
    this.turnPhase = phase;

    switch (phase) {
      case 'waiting-for-draw':
        this.instructionText.setText(
          'Click the Stock or Discard pile to draw a card',
        );
        break;
      case 'waiting-for-move':
        this.instructionText.setText(
          'Click a grid card to swap, or click Discard to discard & flip',
        );
        break;
      case 'waiting-for-flip-target':
        this.instructionText.setText(
          'Click a face-down card to flip it',
        );
        break;
      case 'animating':
        this.instructionText.setText('');
        break;
      case 'ai-thinking':
        this.instructionText.setText('AI is thinking...');
        break;
      case 'round-ended':
        this.instructionText.setText('');
        this.showEndScreen();
        break;
    }
  }

  // ── Human input handlers ────────────────────────────────

  private onStockClick(): void {
    if (this.turnPhase === 'waiting-for-draw' && this.isHumanTurn()) {
      this.humanDraw('stock');
    }
  }

  private onDiscardClick(): void {
    if (this.turnPhase === 'waiting-for-draw' && this.isHumanTurn()) {
      this.humanDraw('discard');
    } else if (this.turnPhase === 'waiting-for-move' && this.isHumanTurn()) {
      // Player chose to discard the drawn card and flip a face-down card
      this.setPhase('waiting-for-flip-target');
    }
  }

  private onHumanCardClick(gridIndex: number): void {
    if (this.turnPhase === 'waiting-for-move' && this.isHumanTurn()) {
      // Swap: replace grid card with drawn card
      this.humanMove({ kind: 'swap', row: Math.floor(gridIndex / 3), col: gridIndex % 3 });
    } else if (this.turnPhase === 'waiting-for-flip-target' && this.isHumanTurn()) {
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

    // Show the drawn card next to the human grid
    this.showDrawnCard(this.drawnCard);
    this.setPhase('waiting-for-move');
  }

  private humanMove(move: GolfMove): void {
    if (!this.drawSource) return;

    const action: GolfAction = { drawSource: this.drawSource, move };
    this.setPhase('animating');

    const result = executeTurn(this.session, action);
    this.recorder.recordTurn(result, action.drawSource);
    this.emitTurnCompleted(result);

    // Animate, then proceed
    this.animateTurn(result, () => {
      this.refreshAll();
      this.emitAnimationComplete();
      this.drawnCard = null;
      this.drawSource = null;

      if (result.roundEnded) {
        this.emitStateSettled();
        this.setPhase('round-ended');
      } else {
        this.emitStateSettled();
        this.emitTurnStarted();
        this.checkNextTurn();
      }
    });
  }

  // ── AI turn ─────────────────────────────────────────────

  private runAiTurn(): void {
    this.setPhase('ai-thinking');

    this.time.delayedCall(AI_DELAY, () => {
      const idx = this.session.gameState.currentPlayerIndex;
      const ps = this.session.gameState.playerStates[idx];
      const action = this.aiPlayer.chooseAction(ps, this.session.shared);

      // Show which pile the AI draws from and the drawn card
      const peekCard = action.drawSource === 'stock'
        ? this.session.shared.stockPile[this.session.shared.stockPile.length - 1]
        : this.session.shared.discardPile.peek() ?? null;

      if (peekCard) {
        this.showDrawnCard(peekCard);
      }
      const sourceLabel = action.drawSource === 'stock' ? 'Stock pile' : 'Discard pile';
      this.instructionText.setText(`AI drew from ${sourceLabel}`);

      // Pause so the player can see the drawn card, then execute the move
      this.time.delayedCall(AI_SHOW_DRAW_DELAY, () => {
        this.setPhase('animating');
        const result = executeTurn(this.session, action);
        this.recorder.recordTurn(result, action.drawSource);
        this.emitTurnCompleted(result);

        this.animateTurn(result, () => {
          this.refreshAll();
          this.emitAnimationComplete();

          if (result.roundEnded) {
            this.emitStateSettled();
            this.setPhase('round-ended');
          } else {
            this.emitStateSettled();
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
      this.setPhase('round-ended');
    } else if (this.isHumanTurn()) {
      this.setPhase('waiting-for-draw');
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
      const discardPos = { x: DISCARD_X, y: PILE_Y };

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
      //    First half: scaleX → 0 while moving halfway to discard
      this.tweens.add({
        targets: sprite,
        scaleX: 0,
        x: (sprite.x + discardPos.x) / 2,
        y: (sprite.y + discardPos.y) / 2,
        duration: SWAP_ANIM_DURATION / 2,
        ease: 'Power2',
        onComplete: () => {
          // Reveal the card's actual face at the midpoint of the flip
          sprite.setTexture(getCardTexture(grid[idx]));
          // Second half: scaleX → 1 while completing movement to discard
          this.tweens.add({
            targets: sprite,
            scaleX: 1,
            x: discardPos.x,
            y: discardPos.y,
            duration: SWAP_ANIM_DURATION / 2,
            ease: 'Power2',
            onComplete: checkDone,
          });
        },
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
      const discardPos = { x: DISCARD_X, y: PILE_Y };

      const phase2 = () => {
        // Clean up drawn card after it arrives at discard pile
        this.hideDrawnCard();

        // Phase 2: flip the grid card in place
        this.tweens.add({
          targets: sprite,
          scaleX: 0,
          duration: SWAP_ANIM_DURATION / 4,
          ease: 'Power2',
          onComplete: () => {
            sprite.setTexture(getCardTexture(grid[idx]));
            this.tweens.add({
              targets: sprite,
              scaleX: 1,
              duration: SWAP_ANIM_DURATION / 4,
              ease: 'Power2',
              onComplete: onComplete, // Skip wrappedOnComplete; drawn card already hidden
            });
          },
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

  private showDrawnCard(card: Card): void {
    // Show drawn card to the right of the discard pile
    const x = DISCARD_X + CARD_W + 20;
    const y = PILE_Y;
    const texture = cardTextureKey(card.rank, card.suit);

    this.drawnCardSprite = this.add.image(x, y, texture);
    this.drawnCardSprite.setAlpha(0);

    this.tweens.add({
      targets: this.drawnCardSprite,
      alpha: 1,
      duration: 200,
    });

    // Add "Drawn" label
    this.turnText.setText(`Drew: ${card.rank} of ${card.suit}`);
  }

  private hideDrawnCard(): void {
    if (this.drawnCardSprite) {
      this.drawnCardSprite.destroy();
      this.drawnCardSprite = null;
    }
  }

  // ── Help panel ─────────────────────────────────────────────

  private createHelpPanel(): void {
    this.helpPanel = new HelpPanel(this, {
      sections: helpContent as HelpSection[],
    });
    this.helpButton = new HelpButton(this, this.helpPanel);
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

  /**
   * Emit state-settled when the board is visually stable and safe
   * to screenshot. Called after animations complete and display is refreshed.
   */
  private emitStateSettled(): void {
    this.gameEvents.emit('state-settled', {
      turnNumber: this.session.gameState.turnNumber,
      phase: this.session.gameState.phase,
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
    this.eventBridge?.destroy();
    this.gameEvents?.removeAllListeners();
    this.helpPanel?.destroy();
    this.helpButton?.destroy();
  }

  // ── Transcript persistence ──────────────────────────────

  /**
   * Auto-save a finalized transcript to browser storage.
   * Fires and forgets -- errors are logged but do not disrupt gameplay.
   */
  private autoSaveTranscript(transcript: GameTranscript): void {
    transcriptStore.save('golf', transcript).then(
      (stored) => {
        if (stored) {
          console.info(
            `[GolfScene] Transcript saved (${stored.id}) via ${stored.gameType}`,
          );
        } else {
          console.warn('[GolfScene] Transcript not saved -- no storage backend available');
        }
      },
      (err) => {
        console.error('[GolfScene] Failed to auto-save transcript:', err);
      },
    );
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
    this.autoSaveTranscript(transcript);

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
      { width: 350, height: 180, alpha: 0.85 },
    );

    const winnerText = results.winnerIndex === 0 ? 'You Win!' : 'AI Wins!';
    this.add
      .text(
        GAME_W / 2,
        GAME_H / 2 - 25,
        `${winnerText}\n\nYou: ${results.scores[0]} pts\nAI: ${results.scores[1]} pts`,
        {
          fontSize: '18px',
          color: '#ffffff',
          fontFamily: FONT_FAMILY,
          align: 'center',
        },
      )
      .setOrigin(0.5)
      .setDepth(11);

    // Play again button
    const btn = createOverlayButton(
      this, GAME_W / 2 - 55, GAME_H / 2 + 55, '[ Play Again ]',
    );
    btn.on('pointerdown', () => {
      this.scene.restart();
    });

    // Menu button
    createOverlayMenuButton(this, GAME_W / 2 + 55, GAME_H / 2 + 55);
  }
}
