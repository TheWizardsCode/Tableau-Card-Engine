/**
 * BlackjackScene -- The main Phaser scene for a single-player Blackjack game.
 *
 * Renders the player's hand, dealer's hand, hit/stand buttons,
 * score display, and round result overlays.  Uses text-based card
 * representation for simplicity.
 *
 * @module example-games/blackjack/scenes/BlackjackScene
 */

import Phaser from 'phaser';
import { GAME_W, FONT_FAMILY } from '../../../src/ui/constants';
import { createHudText } from '../../../src/ui/Renderer';
import {
  createBlackjackGameState,
  dealInitialHands,
  playerHit,
  playerStand,
  dealerPlay,
  getScore,
} from '../BlackjackGame';
import type { BlackjackGameState } from '../BlackjackGame';
import { anchorPoint } from '../../../src/ui/screen-layout';
import { parseScreenLayoutDocument } from '../../../src/ui/screen-layout-schema';
import type { ScreenLayoutDocument, PixelPoint } from '../../../src/ui/screen-layout-schema';
import blackjackLayoutJson from '../layouts/blackjack.layout.json';

// ── Constants ──────────────────────────────────────────────

const SCENE_KEY = 'BlackjackScene';

const CARD_WIDTH = 80;
const CARD_HEIGHT = 110;
const CARD_GAP = 10;
const CARD_RADIUS = 6;

const COLOR_CARD_BG = 0x2a2a3a;
const COLOR_CARD_BORDER = 0x555577;
const COLOR_CARD_BG_HIDDEN = 0x3a2a2a;
const COLOR_CARD_BORDER_HIDDEN = 0x775555;

const COLOR_BG = '#1a2a2a';
const COLOR_TEXT = '#ffffff';
const COLOR_ACCENT = '#88ff88';
const COLOR_WARNING = '#ffaa44';

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

// ── Scene ──────────────────────────────────────────────────

export class BlackjackScene extends Phaser.Scene {
  static readonly KEY = SCENE_KEY;

  private state!: BlackjackGameState;
  private messageText!: Phaser.GameObjects.Text;
  private playerScoreText!: Phaser.GameObjects.Text;
  private dealerScoreText!: Phaser.GameObjects.Text;
  private hitButton!: Phaser.GameObjects.Text;
  private standButton!: Phaser.GameObjects.Text;
  private dealButton!: Phaser.GameObjects.Text;
  private menuButton!: Phaser.GameObjects.Text;
  private playerCards: Phaser.GameObjects.Graphics[] = [];
  private playerCardTexts: Phaser.GameObjects.Text[] = [];
  private dealerCards: Phaser.GameObjects.Graphics[] = [];
  private dealerCardTexts: Phaser.GameObjects.Text[] = [];

  constructor() {
    super({ key: SCENE_KEY });
  }

  // ── Lifecycle ──────────────────────────────────────────

  create(): void {
    this.cameras.main.setBackgroundColor(COLOR_BG);

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

    // Back to menu button
    const menuPos = resolveBkAnchor('menuButton', 'center');
    this.menuButton = this.add
      .text(menuPos.x, menuPos.y, '[ Menu ]', {
        fontSize: '12px',
        color: '#aaccaa',
        fontFamily: FONT_FAMILY,
      })
      .setInteractive({ useHandCursor: true });

    this.menuButton.on('pointerdown', () => {
      this.scene.start('GameSelectorScene');
    });
    this.menuButton.on('pointerover', () => this.menuButton.setColor(COLOR_ACCENT));
    this.menuButton.on('pointerout', () => this.menuButton.setColor('#aaccaa'));

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

    // Message / result text
    const messagePos = resolveBkAnchor('message', 'center');
    this.messageText = this.add
      .text(messagePos.x, messagePos.y, '', {
        fontSize: '20px',
        color: COLOR_WARNING,
        fontFamily: FONT_FAMILY,
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    // Action buttons
    const hitBtnPos = resolveBkAnchor('hitButton', 'center');
    const standBtnPos = resolveBkAnchor('standButton', 'center');
    const dealBtnPos = resolveBkAnchor('dealButton', 'center');

    this.hitButton = this.createActionButton(hitBtnPos.x, hitBtnPos.y, '[ Hit ]', COLOR_ACCENT, () => {
      this.onHit();
    });

    this.standButton = this.createActionButton(standBtnPos.x, standBtnPos.y, '[ Stand ]', COLOR_ACCENT, () => {
      this.onStand();
    });

    this.dealButton = this.createActionButton(dealBtnPos.x, dealBtnPos.y, '[ Deal ]', COLOR_ACCENT, () => {
      this.onDeal();
    });

    // Start a new game
    this.startNewRound();
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
    this.state = createBlackjackGameState();

    this.messageText.setText('');
    this.playerScoreText.setText('');
    this.dealerScoreText.setText('');

    this.hitButton.setVisible(false);
    this.standButton.setVisible(false);
    this.dealButton.setVisible(true);

    this.renderCards();
  }

  private onDeal(): void {
    dealInitialHands(this.state);

    this.renderCards();

    if (this.state.phase === 'ROUND_OVER') {
      // Natural blackjack or push
      this.showResult();
    } else {
      this.hitButton.setVisible(true);
      this.standButton.setVisible(true);
      this.dealButton.setVisible(false);
    }
  }

  private onHit(): void {
    if (this.state.phase !== 'PLAYER_TURN') return;

    playerHit(this.state);
    this.renderCards();

    // Check if the round ended (player bust)
    if (this.state.message !== '') {
      this.showResult();
    }
  }

  private onStand(): void {
    if (this.state.phase !== 'PLAYER_TURN') return;

    playerStand(this.state);
    this.renderCards();

    // Run dealer AI with slight delay for visual feedback
    this.time.delayedCall(500, () => {
      dealerPlay(this.state);
      this.renderCards();
      this.showResult();
    });
  }

  private showResult(): void {
    this.messageText.setText(this.state.message);
    this.hitButton.setVisible(false);
    this.standButton.setVisible(false);
    this.dealButton.setVisible(true);
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
        // Show only visible card score
        const visibleCards = this.state.dealerHand.cards.slice(1); // Skip hole card
        const visibleScore = this.calculateVisibleScore(visibleCards);
        this.dealerScoreText.setText(`Visible: ${visibleScore}`);
      }
    }
  }

  private calculateVisibleScore(cards: { rank: string; suit: string }[]): number {
    // Simple score calculation for visible cards only
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
    for (const g of this.playerCards) g.destroy();
    for (const t of this.playerCardTexts) t.destroy();
    for (const g of this.dealerCards) g.destroy();
    for (const t of this.dealerCardTexts) t.destroy();
    this.playerCards = [];
    this.playerCardTexts = [];
    this.dealerCards = [];
    this.dealerCardTexts = [];
  }

  private renderPlayerCards(): void {
    const hand = this.state.playerHand;
    const totalW = hand.cards.length * CARD_WIDTH + (hand.cards.length - 1) * CARD_GAP;
    const playerCardsPos = resolveBkAnchor('playerCards', 'center');
    const startX = playerCardsPos.x - totalW / 2 + CARD_WIDTH / 2;
    const y = playerCardsPos.y;

    hand.cards.forEach((card, i) => {
      const x = startX + i * (CARD_WIDTH + CARD_GAP);
      const { bg, txt } = this.createCard(x, y, CARD_WIDTH, CARD_HEIGHT, card, false);
      this.playerCards.push(bg);
      this.playerCardTexts.push(txt);
    });
  }

  private renderDealerCards(): void {
    const hand = this.state.dealerHand;
    const totalW = hand.cards.length * CARD_WIDTH + (hand.cards.length - 1) * CARD_GAP;
    const dealerCardsPos = resolveBkAnchor('dealerCards', 'center');
    const startX = dealerCardsPos.x - totalW / 2 + CARD_WIDTH / 2;
    const y = dealerCardsPos.y;

    hand.cards.forEach((card, i) => {
      const x = startX + i * (CARD_WIDTH + CARD_GAP);
      const isHidden = i === 0 && this.state.dealerHoleCardHidden;
      const { bg, txt } = this.createCard(x, y, CARD_WIDTH, CARD_HEIGHT, card, isHidden);
      this.dealerCards.push(bg);
      this.dealerCardTexts.push(txt);
    });
  }

  private createCard(
    x: number,
    y: number,
    w: number,
    h: number,
    card: { rank: string; suit: string },
    hidden: boolean,
  ): { bg: Phaser.GameObjects.Graphics; txt: Phaser.GameObjects.Text } {
    const bg = this.add.graphics();

    if (hidden) {
      bg.fillStyle(COLOR_CARD_BG_HIDDEN, 1);
      bg.fillRoundedRect(x - w / 2, y, w, h, CARD_RADIUS);
      bg.lineStyle(2, COLOR_CARD_BORDER_HIDDEN, 1);
      bg.strokeRoundedRect(x - w / 2, y, w, h, CARD_RADIUS);

      // Draw card back pattern (simple X)
      bg.lineStyle(2, 0x884444, 0.5);
      bg.beginPath();
      bg.moveTo(x - w / 2 + 8, y + 8);
      bg.lineTo(x + w / 2 - 8, y + h - 8);
      bg.moveTo(x + w / 2 - 8, y + 8);
      bg.lineTo(x - w / 2 + 8, y + h - 8);
      bg.strokePath();

      const txt = this.add
        .text(x, y + h / 2, '?', {
          fontSize: '28px',
          color: '#884444',
          fontFamily: FONT_FAMILY,
          fontStyle: 'bold',
        })
        .setOrigin(0.5);
      return { bg, txt };
    }

    // Card background
    const isRed = card.suit === 'hearts' || card.suit === 'diamonds';
    const displayRank = card.rank;
    const cardColor = isRed ? '#ff8888' : '#ffffff';

    bg.fillStyle(COLOR_CARD_BG, 1);
    bg.fillRoundedRect(x - w / 2, y, w, h, CARD_RADIUS);
    bg.lineStyle(2, COLOR_CARD_BORDER, 1);
    bg.strokeRoundedRect(x - w / 2, y, w, h, CARD_RADIUS);

    const displaySuit = this.suitSymbol(card.suit);

    const txt = this.add
      .text(x, y + h / 2, `${displayRank}\n${displaySuit}`, {
        fontSize: '16px',
        color: cardColor,
        fontFamily: FONT_FAMILY,
        fontStyle: 'bold',
        align: 'center',
      })
      .setOrigin(0.5);

    return { bg, txt };
  }

  private suitSymbol(suit: string): string {
    switch (suit) {
      case 'hearts': return '\u2665';
      case 'diamonds': return '\u2666';
      case 'clubs': return '\u2663';
      case 'spades': return '\u2660';
      default: return suit;
    }
  }
}


