/**
 * BlackjackScene -- The main Phaser scene for a single-player Blackjack game.
 *
 * Renders the player's hand, dealer's hand, hit/stand buttons,
 * score display, sound effects, card animations, undo/redo,
 * and a game-over overlay.  Uses the shared card-system types
 * for card representation and core-engine for layout.
 *
 * @module example-games/blackjack/scenes/BlackjackScene
 */

import Phaser from 'phaser';
import { GAME_W, GAME_H, FONT_FAMILY } from '../../../src/ui/constants';
import { createHudText } from '../../../src/ui/Renderer';
import {
  createBlackjackGameState,
  dealInitialHands,
  playerHit,
  playerStand,
  dealerPlay,
  getScore,
  revertHit,
  revertDeal,
} from '../BlackjackGame';
import type { BlackjackGameState } from '../BlackjackGame';
import { anchorPoint } from '../../../src/ui/screen-layout';
import { parseScreenLayoutDocument } from '../../../src/ui/screen-layout-schema';
import type { ScreenLayoutDocument, PixelPoint } from '../../../src/ui/screen-layout-schema';
import { CardGameScene, getCardTexture, preloadCardAssets } from '../../../src/ui';
import type { HelpSection } from '../../../src/ui';
import type { EventSoundMapping } from '../../../src/core-engine/SoundManager';
import { audioPathWithFallback } from '../../../src/ui/CardGameScene';
import { UndoRedoManager } from '../../../src/core-engine/UndoRedoManager';
import type { Command } from '../../../src/core-engine/UndoRedoManager';
import { OverlayManager } from '../../../src/ui/OverlayManager';
import { createGameOverOverlay } from '../../../src/ui/GameOverOverlay';
import { moveGameObject } from '../../../src/ui/moveGameObject';
import { getReducedMotion } from '../../../src/ui/SettingsStore';
import blackjackLayoutJson from '../layouts/blackjack.layout.json';
import helpContent from '../help-content.json';

// ── Constants ──────────────────────────────────────────────

const SCENE_KEY = 'BlackjackScene';

const CARD_WIDTH = 125;
const CARD_HEIGHT = 175;
const CARD_GAP = 10;

const COLOR_BG = '#1a2a2a';
const COLOR_TEXT = '#ffffff';
const COLOR_ACCENT = '#88ff88';

/** Namespace and audio directory for Blackjack SFX assets. */
const AUDIO_NS = 'blackjack';
const AUDIO_DIR = 'blackjack';

/** SFX asset keys for Blackjack game events. */
const SFX_KEYS = {
  CARD_DEAL: 'sfx-card-deal',
  CARD_HIT: 'sfx-card-hit',
  CARD_FLIP: 'sfx-card-flip',
  ROUND_WIN: 'sfx-round-win',
  ROUND_LOSE: 'sfx-round-lose',
  ROUND_PUSH: 'sfx-round-push',
  UI_CLICK: 'sfx-ui-click',
} as const;

/** Duration for card deal animation (ms). */
const DEAL_ANIM_DURATION = 400;

/** Duration for hole-card flip animation (ms). */
const FLIP_DURATION = 300;

/** Delay before dealer AI runs after stand (ms). */
const DEALER_DELAY = 500;

// Parse the Blackjack scene layout once at module load.
const BK_LAYOUT: ScreenLayoutDocument | null = (() => {
  const parsed = parseScreenLayoutDocument(blackjackLayoutJson);
  return parsed.valid ? parsed.layout : null;
})();

const DEFAULT_VIEWPORT = { width: 1280, height: 720 };

/**
 * Resolve an anchor from the Blackjack SLL layout.
 * Falls back to the default viewport center if no layout is available.
 */
function resolveBkAnchor(
  zone: string,
  anchor: string,
  viewport = DEFAULT_VIEWPORT,
): PixelPoint {
  if (!BK_LAYOUT) {
    return { x: GAME_W / 2, y: 60 };
  }
  return anchorPoint(BK_LAYOUT, zone, anchor, viewport, 1);
}

// ── Hit Command (Undo/Redo) ────────────────────────────────

/**
 * Command that records a hit action for undo/redo.
 *
 * On undo: the dealt card is removed from the player hand and
 * returned to the top of the deck.  On redo: the card is dealt
 * again from the deck to the player hand.
 */
class HitCommand implements Command {
  readonly description = 'Hit';

  private card: import('../../../src/card-system/Card').Card | null = null;
  private prevMessage = '';

  constructor(
    private state: BlackjackGameState,
  ) {}

  execute(): void {
    if (this.card) {
      // Redo: re-deal the stored card (it was returned to deck top during undo)
      const replayed = this.state.deck.pop()!;
      replayed.faceUp = true;
      this.state.playerHand.cards.push(replayed);
    } else {
      // First execution
      playerHit(this.state);
      // Capture the dealt card (the last card in player hand)
      const cards = this.state.playerHand.cards.toArray();
      this.card = cards[cards.length - 1];
    }
    this.prevMessage = this.state.message;
  }

  undo(): void {
    if (!this.card) return;
    revertHit(this.state);
    this.card = null;
    this.state.message = this.prevMessage;
    this.prevMessage = '';
  }
}

// ── Deal Command (Undo/Redo) ───────────────────────────────

/**
 * Command that records the initial deal for undo/redo.
 *
 * On undo: all dealt cards are returned to the deck and the
 * game resets to IDLE phase.  On redo: the deal is replayed.
 */
class DealCommand implements Command {
  readonly description = 'Deal';

  private dealtCards: import('../../../src/card-system/Card').Card[] = [];

  constructor(private state: BlackjackGameState) {}

  execute(): void {
    if (this.dealtCards.length > 0) {
      // Redo: put the stored cards back into hands
      // Cards were dealt alternately: P1, D1, P2, D2
      if (this.dealtCards.length >= 4) {
        this.dealtCards[0].faceUp = true;
        this.dealtCards[2].faceUp = true;
        this.dealtCards[3].faceUp = true;
        this.dealtCards[1].faceUp = false;
        this.state.playerHand.cards.push(this.dealtCards[0], this.dealtCards[2]);
        this.state.dealerHand.cards.push(this.dealtCards[1], this.dealtCards[3]);
        this.state.phase = 'PLAYER_TURN';
      }
    } else {
      dealInitialHands(this.state);
      // Capture the dealt cards
      this.dealtCards = [
        ...this.state.playerHand.cards.toArray(),
        ...this.state.dealerHand.cards.toArray(),
      ];
    }
  }

  undo(): void {
    revertDeal(this.state);
  }
}

// ── Scene ──────────────────────────────────────────────────

export class BlackjackScene extends CardGameScene {
  static readonly KEY = SCENE_KEY;

  private state!: BlackjackGameState;
  private playerScoreText!: Phaser.GameObjects.Text;
  private dealerScoreText!: Phaser.GameObjects.Text;
  private hitButton!: Phaser.GameObjects.Text;
  private standButton!: Phaser.GameObjects.Text;
  private dealButton!: Phaser.GameObjects.Text;
  private playerCardSprites: Phaser.GameObjects.Image[] = [];
  private dealerCardSprites: Phaser.GameObjects.Image[] = [];
  private statsText!: Phaser.GameObjects.Text;

  // Overlay
  private overlayManager!: OverlayManager;

  // Reduced motion
  private _reducedMotion = false;
  get reducedMotion(): boolean {
    return this._reducedMotion;
  }

  // Undo/redo
  private undoManager = new UndoRedoManager();

  // Stats tracking
  private handsPlayed = 0;
  private wins = 0;
  private losses = 0;
  private pushes = 0;

  constructor() {
    super({ key: SCENE_KEY });
  }

  // ── Preload ───────────────────────────────────────────

  preload(): void {
    preloadCardAssets(this, CARD_WIDTH, CARD_HEIGHT);

    // Audio SFX assets (namespace-scoped for collision protection)
    this.load.audio(`${AUDIO_NS}:${SFX_KEYS.CARD_DEAL}`, audioPathWithFallback(AUDIO_DIR, 'card-draw.wav'));
    this.load.audio(`${AUDIO_NS}:${SFX_KEYS.CARD_HIT}`, audioPathWithFallback(AUDIO_DIR, 'card-draw.wav'));
    this.load.audio(`${AUDIO_NS}:${SFX_KEYS.CARD_FLIP}`, audioPathWithFallback(AUDIO_DIR, 'card-flip.wav'));
    this.load.audio(`${AUDIO_NS}:${SFX_KEYS.ROUND_WIN}`, audioPathWithFallback(AUDIO_DIR, 'round-end.wav'));
    this.load.audio(`${AUDIO_NS}:${SFX_KEYS.ROUND_LOSE}`, audioPathWithFallback(AUDIO_DIR, 'round-end.wav'));
    this.load.audio(`${AUDIO_NS}:${SFX_KEYS.ROUND_PUSH}`, audioPathWithFallback(AUDIO_DIR, 'score-reveal.wav'));
    this.load.audio(`${AUDIO_NS}:${SFX_KEYS.UI_CLICK}`, audioPathWithFallback(AUDIO_DIR, 'ui-click.wav'));
  }

  // ── Lifecycle ──────────────────────────────────────────

  create(): void {
    this.cameras.main.setBackgroundColor(COLOR_BG);

    super.create();

    // Reduced motion: read preference from SettingsStore and/or media query
    this._reducedMotion = getReducedMotion() || (
      typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
        : false
    );

    // Overlay manager
    this.overlayManager = new OverlayManager(this);

    // Title
    const titlePos = resolveBkAnchor('title', 'center');
    this.add
      .text(titlePos.x, titlePos.y, 'Blackjack', {
        fontSize: '28px',
        color: COLOR_ACCENT,
        fontFamily: FONT_FAMILY,
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    // Dealer label
    const dealerLabelPos = resolveBkAnchor('dealerLabel', 'center');
    this.add
      .text(dealerLabelPos.x, dealerLabelPos.y, 'Dealer', {
        fontSize: '14px',
        color: '#88aaaa',
        fontFamily: FONT_FAMILY,
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    // Dealer score
    const dealerScorePos = resolveBkAnchor('dealerScore', 'center');
    this.dealerScoreText = createHudText(this, dealerScorePos.x, dealerScorePos.y, '', COLOR_TEXT, {
      fontSize: '13px',
    }).setOrigin(0.5);

    // Player label
    const playerLabelPos = resolveBkAnchor('playerLabel', 'center');
    this.add
      .text(playerLabelPos.x, playerLabelPos.y, 'Player', {
        fontSize: '14px',
        color: '#88aaaa',
        fontFamily: FONT_FAMILY,
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    // Player score
    const playerScorePos = resolveBkAnchor('playerScore', 'center');
    this.playerScoreText = createHudText(this, playerScorePos.x, playerScorePos.y, '', COLOR_TEXT, {
      fontSize: '13px',
    }).setOrigin(0.5);

    // Stats text (persistent, shows hands/wins/losses)
    const statsPos = resolveBkAnchor('message', 'center');
    this.statsText = createHudText(this, statsPos.x, statsPos.y, '', '#888888', {
      fontSize: '12px',
    }).setOrigin(0.5);

    // Action buttons
    const hitBtnPos = resolveBkAnchor('hitButton', 'center');
    const standBtnPos = resolveBkAnchor('standButton', 'center');
    const dealBtnPos = resolveBkAnchor('dealButton', 'center');

    this.hitButton = this.createActionButton(hitBtnPos.x, hitBtnPos.y, '[ Hit ]', COLOR_ACCENT, () => {
      this.gameEvents.emit('ui-interaction', { elementId: 'hit', action: 'click' });
      this.onHit();
    });

    this.standButton = this.createActionButton(standBtnPos.x, standBtnPos.y, '[ Stand ]', COLOR_ACCENT, () => {
      this.gameEvents.emit('ui-interaction', { elementId: 'stand', action: 'click' });
      this.onStand();
    });

    this.dealButton = this.createActionButton(dealBtnPos.x, dealBtnPos.y, '[ Deal ]', COLOR_ACCENT, () => {
      this.gameEvents.emit('ui-interaction', { elementId: 'deal', action: 'click' });
      this.onDeal();
    });

    // Help panel, sound system, and settings panel
    if (!this.replayMode) {
      this.initHelpPanel(helpContent as HelpSection[]);

      // Map standard game events to Blackjack SFX keys
      // 'card-drawn' handles both deal and hit sounds
      const mapping: EventSoundMapping = {
        'card-drawn': SFX_KEYS.CARD_DEAL,
        'card-flipped': SFX_KEYS.CARD_FLIP,
        'game-ended': SFX_KEYS.ROUND_WIN,
        'ui-interaction': SFX_KEYS.UI_CLICK,
      };
      this.initSoundSystem(Object.values(SFX_KEYS), mapping, { namespace: AUDIO_NS });

      this.initSettingsPanel();

      // Wire reduced-motion toggle from settings panel
      if (this.settingsPanel) {
        this._reducedMotion = this.settingsPanel.reducedMotion;
      }

      // Undo/Redo buttons
      this.initUndoRedoButtons(
        () => this.onUndo(),
        () => this.onRedo(),
      );
    }

    // Start a new game
    this.startNewRound();
  }

  shutdown(): void {
    this.overlayManager?.dismiss();
    this.shutdownBase();
  }

  // ── Button helper ──────────────────────────────────────

  private createActionButton(
    x: number,
    y: number,
    label: string,
    color: string,
    callback: () => void,
  ): Phaser.GameObjects.Text {
    const btn = this.add
      .text(x, y, label, {
        fontSize: '16px',
        color,
        fontFamily: FONT_FAMILY,
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    btn.on('pointerdown', callback);
    btn.on('pointerover', () => btn.setColor('#ffffff'));
    btn.on('pointerout', () => btn.setColor(color));

    return btn;
  }

  // ── Game flow ──────────────────────────────────────────

  private startNewRound(): void {
    if (this.overlayManager) {
      this.overlayManager.dismiss();
    }
    this.state = createBlackjackGameState();
    this.undoManager.clear();

    this.playerScoreText.setText('');
    this.dealerScoreText.setText('');
    this.statsText.setText(this.formatStats());

    this.hitButton.setVisible(false);
    this.standButton.setVisible(false);
    this.dealButton.setVisible(true);

    this.refreshUndoRedoButtons(false, false);

    this.clearCardDisplays();
  }

  private onDeal(): void {
    this.dealButton.setVisible(false);

    // Emit deal sound
    this.gameEvents.emit('card-drawn', { source: 'stock', playerIndex: 0 });

    // Execute DealCommand through undo manager
    const cmd = new DealCommand(this.state);
    this.undoManager.execute(cmd);

    // Render cards and animate
    this.renderCards();
    this.animateDealCards();

    if (this.state.phase === 'ROUND_OVER') {
      // Natural blackjack or push
      this.time.delayedCall(DEAL_ANIM_DURATION + 200, () => {
        this.showGameOverOverlay();
      });
    } else {
      this.hitButton.setVisible(true);
      this.standButton.setVisible(true);
    }

    this.refreshUndoRedoButtons(this.undoManager.canUndo(), this.undoManager.canRedo());
  }

  private onHit(): void {
    if (this.state.phase !== 'PLAYER_TURN') return;

    // Emit hit sound (reuse card-drawn event)
    this.gameEvents.emit('card-drawn', { source: 'stock', playerIndex: 0 });

    // Execute HitCommand through undo manager
    const cmd = new HitCommand(this.state);
    this.undoManager.execute(cmd);

    this.renderCards();
    this.animateHitCard();

    // Check if the round ended (player bust)
    if (this.state.message !== '') {
      this.time.delayedCall(DEAL_ANIM_DURATION + 200, () => {
        this.showGameOverOverlay();
      });
    }

    this.refreshUndoRedoButtons(this.undoManager.canUndo(), this.undoManager.canRedo());
  }

  private onStand(): void {
    if (this.state.phase !== 'PLAYER_TURN') return;

    playerStand(this.state);
    this.renderCards();
    this.animateRevealHoleCard();

    // Emit flip sound when hole card is revealed
    this.time.delayedCall(FLIP_DURATION, () => {
      this.gameEvents.emit('card-flipped', { position: 0, playerIndex: 1 });
    });

    // Run dealer AI with delay for visual feedback
    this.time.delayedCall(DEALER_DELAY, () => {
      dealerPlay(this.state);
      this.renderCards();
      this.showGameOverOverlay();
    });
  }

  // ── Undo/Redo ──────────────────────────────────────────

  private onUndo(): void {
    if (!this.undoManager.canUndo()) return;
    this.gameEvents.emit('undo', {});
    this.undoManager.undo();
    this.renderCards();
    this.overlayManager?.dismiss();
    this.statsText.setText(this.formatStats());
    this.hitButton.setVisible(this.state.phase === 'PLAYER_TURN');
    this.standButton.setVisible(this.state.phase === 'PLAYER_TURN');
    this.dealButton.setVisible(this.state.phase === 'IDLE');
    this.refreshUndoRedoButtons(this.undoManager.canUndo(), this.undoManager.canRedo());
  }

  private onRedo(): void {
    if (!this.undoManager.canRedo()) return;
    this.gameEvents.emit('redo', {});
    this.undoManager.redo();
    this.renderCards();
    this.overlayManager?.dismiss();
    this.statsText.setText(this.formatStats());
    this.hitButton.setVisible(this.state.phase === 'PLAYER_TURN');
    this.standButton.setVisible(this.state.phase === 'PLAYER_TURN');
    this.dealButton.setVisible(this.state.phase === 'IDLE');
    this.refreshUndoRedoButtons(this.undoManager.canUndo(), this.undoManager.canRedo());
  }

  // ── Game Over Overlay ──────────────────────────────────

  private showGameOverOverlay(): void {
    this.handsPlayed++;

    // Update stats
    const msg = this.state.message.toLowerCase();
    let resultTitle: string;
    let resultColor: string;

    if (msg.includes('win')) {
      this.wins++;
      resultTitle = 'You Win!';
      resultColor = '#88ff88';
    } else if (msg.includes('push')) {
      this.pushes++;
      resultTitle = 'Push';
      resultColor = '#ffaa44';
    } else {
      this.losses++;
      resultTitle = 'Dealer Wins';
      resultColor = '#ff6666';
    }

    // Emit game-ended for round-end sound
    const winnerIndex = msg.includes('win') ? 0 : (msg.includes('push') ? -1 : 1);
    this.gameEvents.emit('game-ended', { finalTurnNumber: this.handsPlayed, winnerIndex, reason: this.state.message });

    this.statsText.setText(this.formatStats());
    this.hitButton.setVisible(false);
    this.standButton.setVisible(false);
    this.dealButton.setVisible(true);

    const playerScore = getScore(this.state.playerHand);
    const dealerScore = getScore(this.state.dealerHand);
    const summaryText = `Player: ${playerScore}  |  Dealer: ${dealerScore}  |  ${this.state.message}`;

    const overlayResult = createGameOverOverlay(this, {
      title: resultTitle,
      titleColor: resultColor,
      summaryText,
      onPlayAgain: () => this.onDealAgain(),
      onMenu: () => this.scene.start('GameSelectorScene'),
      playAgainLabel: 'Deal Again',
      menuLabel: 'Menu',
      background: { depth: 2000, alpha: 0.7 },
    });
    this.overlayManager.add(...overlayResult.objects);
  }

  private onDealAgain(): void {
    this.overlayManager.dismiss();
    this.startNewRound();
  }

  // ── Stats ──────────────────────────────────────────────

  private formatStats(): string {
    return `Hands: ${this.handsPlayed}  Wins: ${this.wins}  Losses: ${this.losses}  Pushes: ${this.pushes}`;
  }

  // ── Card animations ────────────────────────────────────

  /**
   * Animate cards sliding from a central "deck" position to their
   * rendered positions during the initial deal.
   * Respects reduced-motion setting.
   */
  private animateDealCards(): void {
    if (this._reducedMotion) return;

    const centerX = GAME_W / 2;
    const centerY = GAME_H / 2;

    // Animate player cards (first and third dealt — indices 0 and 1 in playerCardSprites)
    this.playerCardSprites.forEach((sprite, i) => {
      const destX = sprite.x;
      const destY = sprite.y;
      sprite.x = centerX;
      sprite.y = centerY;
      sprite.setAlpha(0);
      this.time.delayedCall(i * 150, () => {
        sprite.setAlpha(1);
        moveGameObject({
          scene: this,
          target: sprite,
          destX,
          destY,
          duration: DEAL_ANIM_DURATION,
          ease: 'Quad.easeOut',
          reducedMotion: false, // already checked above
        });
      });
    });

    // Animate dealer cards (second and fourth dealt)
    this.dealerCardSprites.forEach((sprite, i) => {
      const destX = sprite.x;
      const destY = sprite.y;
      sprite.x = centerX;
      sprite.y = centerY;
      sprite.setAlpha(0);
      this.time.delayedCall((i * 2 + 1) * 150, () => {
        sprite.setAlpha(1);
        moveGameObject({
          scene: this,
          target: sprite,
          destX,
          destY,
          duration: DEAL_ANIM_DURATION,
          ease: 'Quad.easeOut',
          reducedMotion: false,
        });
      });
    });
  }

  /**
   * Animate a hit card sliding from the deck position to the player hand.
   * Respects reduced-motion setting.
   */
  private animateHitCard(): void {
    if (this._reducedMotion || this.playerCardSprites.length === 0) return;

    const lastSprite = this.playerCardSprites[this.playerCardSprites.length - 1];
    const destX = lastSprite.x;
    const destY = lastSprite.y;
    lastSprite.x = GAME_W / 2;
    lastSprite.y = GAME_H / 2;
    lastSprite.setAlpha(0);

    this.time.delayedCall(50, () => {
      lastSprite.setAlpha(1);
      moveGameObject({
        scene: this,
        target: lastSprite,
        destX,
        destY,
        duration: DEAL_ANIM_DURATION,
        ease: 'Quad.easeOut',
        reducedMotion: false,
      });
    });
  }

  /**
   * Animate hole card reveal: scaleX tween for flip effect.
   * Respects reduced-motion setting.
   */
  private animateRevealHoleCard(): void {
    if (this._reducedMotion || this.dealerCardSprites.length === 0) return;

    const holeCard = this.dealerCardSprites[0];
    // Reset scale in case of previous reveal
    holeCard.setScale(1);

    // Flip effect: scale X from full to 0, then swap texture, back to full
    this.tweens.add({
      targets: holeCard,
      scaleX: 0,
      duration: FLIP_DURATION / 2,
      ease: 'Quad.easeIn',
      onComplete: () => {
        const cards = this.state.dealerHand.cards.toArray();
        if (cards[0]) {
          holeCard.setTexture(getCardTexture(cards[0]));
        }
        this.tweens.add({
          targets: holeCard,
          scaleX: 1,
          duration: FLIP_DURATION / 2,
          ease: 'Quad.easeOut',
        });
      },
    });
  }

  // ── Card rendering ─────────────────────────────────────

  private renderCards(): void {
    this.clearCardDisplays();
    this.renderPlayerCards();
    this.renderDealerCards();

    // Show scores
    if (this.state.phase !== 'IDLE') {
      this.playerScoreText.setText(`Score: ${getScore(this.state.playerHand)}`);
      if (this.state.phase === 'ROUND_OVER' || this.state.phase === 'DEALER_TURN') {
        this.dealerScoreText.setText(`Score: ${getScore(this.state.dealerHand)}`);
      } else {
        const visibleCards = this.state.dealerHand.cards.toArray().slice(1);
        const visibleScore = this.calculateVisibleScore(visibleCards);
        this.dealerScoreText.setText(`Visible: ${visibleScore}`);
      }
    }
  }

  private calculateVisibleScore(cards: { rank: string; suit: string }[]): number {
    let score = 0;
    let aceCount = 0;
    for (const card of cards) {
      const val = card.rank === 'A' ? 11 : (['K', 'Q', 'J'].includes(card.rank) ? 10 : parseInt(card.rank, 10));
      score += val;
      if (card.rank === 'A') aceCount++;
    }
    while (score > 21 && aceCount > 0) {
      score -= 10;
      aceCount--;
    }
    return score;
  }

  private clearCardDisplays(): void {
    for (const s of this.playerCardSprites) s.destroy();
    for (const s of this.dealerCardSprites) s.destroy();
    this.playerCardSprites = [];
    this.dealerCardSprites = [];
  }

  private renderPlayerCards(): void {
    const hand = this.state.playerHand;
    const totalW = hand.cards.size() * CARD_WIDTH + (hand.cards.size() - 1) * CARD_GAP;
    const playerCardsPos = resolveBkAnchor('playerCards', 'center');
    const startX = playerCardsPos.x - totalW / 2 + CARD_WIDTH / 2;
    const y = playerCardsPos.y;

    for (const card of hand.cards.toArray()) {
      const x = startX + this.playerCardSprites.length * (CARD_WIDTH + CARD_GAP);
      const sprite = this.add.image(x, y, getCardTexture(card));
      sprite.setDisplaySize(CARD_WIDTH, CARD_HEIGHT);
      this.playerCardSprites.push(sprite);
    }
  }

  private renderDealerCards(): void {
    const hand = this.state.dealerHand;
    const totalW = hand.cards.size() * CARD_WIDTH + (hand.cards.size() - 1) * CARD_GAP;
    const dealerCardsPos = resolveBkAnchor('dealerCards', 'center');
    const startX = dealerCardsPos.x - totalW / 2 + CARD_WIDTH / 2;
    const y = dealerCardsPos.y;

    for (const card of hand.cards.toArray()) {
      const x = startX + this.dealerCardSprites.length * (CARD_WIDTH + CARD_GAP);
      const sprite = this.add.image(x, y, getCardTexture(card));
      sprite.setDisplaySize(CARD_WIDTH, CARD_HEIGHT);
      this.dealerCardSprites.push(sprite);
    }
  }
}
