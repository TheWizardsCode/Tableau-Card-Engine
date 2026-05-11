/**
 * GolfReplayController -- handles replay mode APIs and takeover overlay for 9-Card Golf.
 */

import type { Card, Rank, Suit } from '../../../src/card-system/Card';
import { scoreVisibleCards } from '../GolfScoring';
import type { BoardSnapshot, CardSnapshot } from '../GameTranscript';
import {
  GAME_W, GAME_H, FONT_FAMILY,
  createOverlayBackground, createOverlayButton, dismissOverlay,
} from '../../../src/ui';
import type { GolfSession } from '../GolfGame';
import type { GolfRenderer } from './GolfRenderer';

export class GolfReplayController {
  /** Tracks whether loadBoardState() has been called (required before enableInteractiveMode). */
  boardStateInjected: boolean = false;

  /** Game objects belonging to the takeover overlay (for cleanup). */
  takeoverOverlayObjects: Phaser.GameObjects.GameObject[] = [];

  constructor(
    private scene: Phaser.Scene,
    private session: GolfSession,
    private renderer: GolfRenderer,
    private replayMode: { value: boolean },
    private onEnableInteractive: (nextPlayer: number) => void,
  ) {}

  /**
   * Inject an arbitrary board state from transcript snapshot data and
   * refresh the visual display. Intended for use by the replay tool
   * via `page.evaluate()`.
   *
   * Only operational in replay mode (?mode=replay). Throws if called
   * outside of replay mode.
   */
  loadBoardState(
    boardStates: BoardSnapshot[],
    discardTop: CardSnapshot | null,
    stockRemaining: number,
    stockPileCards?: CardSnapshot[],
  ): void {
    if (!this.replayMode.value) {
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
        (grid as Card[])[i] = {
          rank: cs.rank as Rank,
          suit: cs.suit as Suit,
          faceUp: cs.faceUp,
        };
      }
    }

    // Update the discard pile
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
    this.renderer.refreshAll();

    this.boardStateInjected = true;

    // Signal that the board is visually stable and ready for screenshot
    (this.scene as any).emitStateSettled(
      this.session.gameState.turnNumber,
      this.session.gameState.phase,
    );
  }

  /**
   * Transition from replay mode to interactive play.
   */
  enableInteractiveMode(options: { nextPlayer: number }): void {
    if (!this.replayMode.value) {
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
    this.replayMode.value = false;

    // Register input handlers on stock pile
    this.renderer.stockSprite.setInteractive({ useHandCursor: true });
    this.renderer.stockSprite.on('pointerdown', () => {
      (this.scene as any).onStockClick();
    });

    // Register input handlers on discard pile
    this.renderer.discardSprite.setInteractive({ useHandCursor: true });
    this.renderer.discardSprite.on('pointerdown', () => {
      (this.scene as any).onDiscardClick();
    });

    // Register input handlers on human grid cards
    for (let i = 0; i < this.renderer.humanCardSprites.length; i++) {
      const sprite = this.renderer.humanCardSprites[i];
      sprite.setInteractive({ useHandCursor: true });
      const idx = i;
      sprite.on('pointerdown', () => {
        (this.scene as any).onHumanCardClick(idx);
      });
    }

    // Set the next player and start the turn system
    this.session.gameState.currentPlayerIndex = options.nextPlayer;

    // Update display
    this.renderer.refreshTurnIndicator();

    // Delegate to scene for turn start
    this.onEnableInteractive(options.nextPlayer);
  }

  /**
   * Display a takeover overlay with debug info and action buttons.
   */
  showTakeoverOverlay(
    options: { turnNumber: number; lastAction: string },
    gameEvents: any,
  ): void {
    // Clean up any previous overlay
    dismissOverlay(this.takeoverOverlayObjects);
    this.takeoverOverlayObjects = [];

    // Create the overlay background + box
    const overlay = createOverlayBackground(
      this.scene,
      { depth: 20, alpha: 0.75 },
      { width: 620, height: 420, alpha: 0.9, depth: 20 },
    );
    this.takeoverOverlayObjects.push(...overlay.objects);

    const centerX = GAME_W / 2;
    const boxTop = GAME_H / 2 - 210;

    // Title
    const title = this.scene.add
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

    const info = this.scene.add
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
      dismissOverlay(this.takeoverOverlayObjects);
      this.takeoverOverlayObjects = [];

      (window as unknown as Record<string, unknown>).__REPLAY_INTERACTIVE_MODE__ = true;

      action();
    };

    const buttonY = boxTop + 310;
    const buttonSpacing = 170;

    // "Human plays next" button
    const humanBtn = createOverlayButton(
      this.scene,
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
      this.scene,
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
      this.scene,
      centerX + buttonSpacing,
      buttonY,
      '[ Resume replay ]',
      21,
      { fontSize: '16px' },
    );
    resumeBtn.on('pointerdown', () => {
      dismissAndAct(() => {
        gameEvents.emit(
          'resume-replay' as Parameters<typeof gameEvents.emit>[0],
          {} as never,
        );
      });
    });
    this.takeoverOverlayObjects.push(resumeBtn);
  }
}
