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
import { HelpPanel, HelpButton } from '../../../src/ui';
import type { HelpSection } from '../../../src/ui';
import helpContent from '../help-content.json';

// ── Constants ───────────────────────────────────────────────

const CARD_W = 48;
const CARD_H = 65;
const CARD_GAP = 5;
const GRID_COLS = 3;
const GRID_ROWS = 3;

const GAME_W = 800;
const GAME_H = 600;

const AI_DELAY = 600; // ms before AI chooses
const AI_SHOW_DRAW_DELAY = 1000; // ms to show drawn card before moving
const ANIM_DURATION = 300; // ms for animations

// Layout positions (designed to fit two 3x3 grids + piles in 600px height)
const AI_GRID_Y = 105; // center Y of AI grid
const HUMAN_GRID_Y = 480; // center Y of human grid
const PILE_Y = 295; // center Y of stock/discard
const STOCK_X = GAME_W / 2 - 50;
const DISCARD_X = GAME_W / 2 + 50;

const FONT_FAMILY = 'Arial, sans-serif';

// ── Turn state machine ──────────────────────────────────────

type TurnPhase =
  | 'waiting-for-draw' // human must click stock or discard
  | 'waiting-for-move' // human must click grid card (swap) or discard pile (discard-and-flip then click face-down)
  | 'waiting-for-flip-target' // human chose to discard, must click face-down card to flip
  | 'animating' // animation in progress
  | 'ai-thinking' // AI's turn, waiting for delay
  | 'round-ended'; // game over

// ── Scene ───────────────────────────────────────────────────

export class GolfScene extends Phaser.Scene {
  // Game state
  private session!: GolfSession;
  private recorder!: TranscriptRecorder;
  private aiPlayer!: AiPlayer;
  private turnPhase: TurnPhase = 'waiting-for-draw';
  private drawnCard: Card | null = null;
  private drawSource: DrawSource | null = null;
  private aiStrategyName: string = 'greedy';

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
    // Load card back
    this.load.svg('card_back', 'assets/cards/card_back.svg', {
      width: CARD_W,
      height: CARD_H,
    });

    // Load all 52 card faces
    const suits: Suit[] = ['clubs', 'diamonds', 'hearts', 'spades'];
    const ranks: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

    for (const suit of suits) {
      for (const rank of ranks) {
        const key = this.cardTextureKey(rank, suit);
        const fileName = this.cardFileName(rank, suit);
        this.load.svg(key, `assets/cards/${fileName}`, {
          width: CARD_W,
          height: CARD_H,
        });
      }
    }
  }

  // ── Create ──────────────────────────────────────────────

  create(): void {
    this.cameras.main.setBackgroundColor('#2d572c');

    // Select AI strategy
    const strategy: AiStrategy =
      this.aiStrategyName === 'random' ? RandomStrategy : GreedyStrategy;

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
    this.createHelpPanel();

    // Initial render
    this.refreshAll();
    this.setPhase('waiting-for-draw');
  }

  // ── UI creation ─────────────────────────────────────────

  private createLabels(): void {
    // Menu button (top-left) -- returns to game selector
    const menuBtn = this.add
      .text(30, 14, '[ Menu ]', {
        fontSize: '12px',
        color: '#aaccaa',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    menuBtn.on('pointerdown', () => this.scene.start('GameSelectorScene'));
    menuBtn.on('pointerover', () => menuBtn.setColor('#88ff88'));
    menuBtn.on('pointerout', () => menuBtn.setColor('#aaccaa'));

    this.add
      .text(GAME_W / 2, 14, '9-Card Golf', {
        fontSize: '18px',
        color: '#ffffff',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5);

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
    this.stockSprite.setInteractive({ useHandCursor: true });
    this.stockSprite.on('pointerdown', () => this.onStockClick());

    this.add
      .text(STOCK_X, PILE_Y + CARD_H / 2 + 10, 'Stock', {
        fontSize: '10px',
        color: '#aaccaa',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5);

    // Discard pile
    this.discardSprite = this.add.image(DISCARD_X, PILE_Y, 'card_back');
    this.discardSprite.setInteractive({ useHandCursor: true });
    this.discardSprite.on('pointerdown', () => this.onDiscardClick());

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
      sprite.setInteractive({ useHandCursor: true });
      sprite.on('pointerdown', () => this.onHumanCardClick(i));
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

  // ── Texture helpers ─────────────────────────────────────

  private cardTextureKey(rank: Rank, suit: Suit): string {
    const rankName = this.rankFileName(rank);
    return `${rankName}_of_${suit}`;
  }

  private cardFileName(rank: Rank, suit: Suit): string {
    return `${this.rankFileName(rank)}_of_${suit}.svg`;
  }

  private rankFileName(rank: Rank): string {
    switch (rank) {
      case 'A': return 'ace';
      case 'J': return 'jack';
      case 'Q': return 'queen';
      case 'K': return 'king';
      default: return rank; // 2-10
    }
  }

  private getCardTexture(card: Card): string {
    if (!card.faceUp) return 'card_back';
    return this.cardTextureKey(card.rank, card.suit);
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
      sprites[i].setTexture(this.getCardTexture(grid[i]));
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
      this.discardSprite.setTexture(this.getCardTexture(top));
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
    this.hideDrawnCard();

    const result = executeTurn(this.session, action);
    this.recorder.recordTurn(result, action.drawSource);

    // Animate, then proceed
    this.animateTurn(result, () => {
      this.refreshAll();
      this.drawnCard = null;
      this.drawSource = null;

      if (result.roundEnded) {
        this.setPhase('round-ended');
      } else {
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
        this.hideDrawnCard();
        this.setPhase('animating');
        const result = executeTurn(this.session, action);
        this.recorder.recordTurn(result, action.drawSource);

        this.animateTurn(result, () => {
          this.refreshAll();

          if (result.roundEnded) {
            this.setPhase('round-ended');
          } else {
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

    if (result.move.kind === 'swap') {
      const idx = result.move.row * 3 + result.move.col;
      const sprite = sprites[idx];
      const grid = this.session.gameState.playerStates[result.playerIndex].grid;

      // Flip animation: scale X to 0, change texture, scale back
      this.tweens.add({
        targets: sprite,
        scaleX: 0,
        duration: ANIM_DURATION / 2,
        ease: 'Power2',
        onComplete: () => {
          sprite.setTexture(this.getCardTexture(grid[idx]));
          this.tweens.add({
            targets: sprite,
            scaleX: 1,
            duration: ANIM_DURATION / 2,
            ease: 'Power2',
            onComplete,
          });
        },
      });
    } else {
      // Discard-and-flip: flip the target card
      const idx = result.move.row * 3 + result.move.col;
      const sprite = sprites[idx];
      const grid = this.session.gameState.playerStates[result.playerIndex].grid;

      this.tweens.add({
        targets: sprite,
        scaleX: 0,
        duration: ANIM_DURATION / 2,
        ease: 'Power2',
        onComplete: () => {
          sprite.setTexture(this.getCardTexture(grid[idx]));
          this.tweens.add({
            targets: sprite,
            scaleX: 1,
            duration: ANIM_DURATION / 2,
            ease: 'Power2',
            onComplete,
          });
        },
      });
    }
  }

  // ── Drawn card display ──────────────────────────────────

  private showDrawnCard(card: Card): void {
    // Show drawn card to the right of the discard pile
    const x = DISCARD_X + CARD_W + 20;
    const y = PILE_Y;
    const texture = this.cardTextureKey(card.rank, card.suit);

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

  /** Clean up help panel resources when the scene shuts down. */
  shutdown(): void {
    this.helpPanel?.destroy();
    this.helpButton?.destroy();
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

    // Overlay
    // Full-screen input blocker to prevent clicks reaching objects behind
    const blocker = this.add.rectangle(
      GAME_W / 2, GAME_H / 2,
      GAME_W, GAME_H,
      0x000000, 0.01,
    );
    blocker.setDepth(10);
    blocker.setInteractive();

    // Visible overlay box
    const overlay = this.add.rectangle(
      GAME_W / 2, GAME_H / 2,
      350, 180,
      0x000000, 0.85,
    );
    overlay.setDepth(10);

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
    const btn = this.add
      .text(GAME_W / 2 - 55, GAME_H / 2 + 55, '[ Play Again ]', {
        fontSize: '14px',
        color: '#88ff88',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5)
      .setDepth(11)
      .setInteractive({ useHandCursor: true });

    btn.on('pointerdown', () => {
      this.scene.restart();
    });

    btn.on('pointerover', () => btn.setColor('#aaffaa'));
    btn.on('pointerout', () => btn.setColor('#88ff88'));

    // Menu button
    const menuBtn = this.add
      .text(GAME_W / 2 + 55, GAME_H / 2 + 55, '[ Menu ]', {
        fontSize: '14px',
        color: '#88ff88',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5)
      .setDepth(11)
      .setInteractive({ useHandCursor: true });

    menuBtn.on('pointerdown', () => this.scene.start('GameSelectorScene'));
    menuBtn.on('pointerover', () => menuBtn.setColor('#aaffaa'));
    menuBtn.on('pointerout', () => menuBtn.setColor('#88ff88'));
  }
}
