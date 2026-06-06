/**
 * SushiGoRenderer -- creates and refreshes all visual game objects for Sushi Go!
 */

import { GAME_W, GAME_H, FONT_FAMILY } from '../../../src/ui';
import { createSceneMenuButton, createSceneTitle } from '@ui/Renderer';
import type { SushiGoCard, SushiGoCardType } from '../SushiGoCards';
import { cardLabel } from '../SushiGoCards';
import type { SushiGoSession } from '../SushiGoGame';
import {
  PLAYER_TABLEAU_Y, AI_TABLEAU_Y,
  SCORE_AREA_X, PLAYER_SCORE_Y, AI_SCORE_Y,
  CARD_STYLES,
} from './SushiGoConstants';

export class SushiGoRenderer {
  handContainer!: Phaser.GameObjects.Container;
  playerTableauContainer!: Phaser.GameObjects.Container;
  aiTableauContainer!: Phaser.GameObjects.Container;

  roundText!: Phaser.GameObjects.Text;
  turnText!: Phaser.GameObjects.Text;
  playerScoreText!: Phaser.GameObjects.Text;
  aiScoreText!: Phaser.GameObjects.Text;
  instructionText!: Phaser.GameObjects.Text;
  cardsLeftText!: Phaser.GameObjects.Text;

  constructor(
    private scene: Phaser.Scene,
    private session: SushiGoSession,
  ) {}

  createHeader(): void {
    createSceneMenuButton(this.scene);
    createSceneTitle(this.scene, 'Sushi Go!');
  }

  createLabels(): void {
    this.scene.add.text(25, PLAYER_TABLEAU_Y - 50, 'Your Tableau', {
      fontSize: '18px',
      color: '#ffffff',
      fontFamily: FONT_FAMILY,
    });

    this.scene.add.text(25, AI_TABLEAU_Y - 50, 'AI Tableau', {
      fontSize: '18px',
      color: '#cccccc',
      fontFamily: FONT_FAMILY,
    });
  }

  createScoreDisplay(): void {
    this.roundText = this.scene.add
      .text(GAME_W / 2, 51, '', {
        fontSize: '20px',
        color: '#ffdd44',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5);

    this.turnText = this.scene.add
      .text(GAME_W / 2, 75, '', {
        fontSize: '16px',
        color: '#aaccaa',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5);

    this.cardsLeftText = this.scene.add
      .text(GAME_W / 2, 95, '', {
        fontSize: '14px',
        color: '#889988',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5);

    this.playerScoreText = this.scene.add
      .text(SCORE_AREA_X, PLAYER_SCORE_Y, 'Score: 0', {
        fontSize: '20px',
        color: '#ffffff',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(1, 0.5);

    this.aiScoreText = this.scene.add
      .text(SCORE_AREA_X, AI_SCORE_Y, 'Score: 0', {
        fontSize: '20px',
        color: '#cccccc',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(1, 0.5);
  }

  createInstructions(): void {
    this.instructionText = this.scene.add
      .text(GAME_W / 2, GAME_H - 14, '', {
        fontSize: '15px',
        color: '#88aa88',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5);
  }

  createContainers(): void {
    this.handContainer = this.scene.add.container(0, 0);
    this.playerTableauContainer = this.scene.add.container(0, 0);
    this.aiTableauContainer = this.scene.add.container(0, 0);
  }

  refreshScores(): void {
    const human = this.session.players[0];
    const ai = this.session.players[1];
    this.playerScoreText.setText(`Score: ${human.totalScore}`);
    this.aiScoreText.setText(`Score: ${ai.totalScore}`);
  }

  refreshRoundInfo(): void {
    const round = this.session.currentRound + 1;
    const total = this.session.totalRounds;
    const turn = this.session.currentTurn + 1;
    const turnsTotal = this.session.cardsPerPlayer;
    const cardsInHand = this.session.players[0].hand.length;

    this.roundText.setText(`Round ${round} of ${total}`);
    this.turnText.setText(`Turn ${turn} of ${turnsTotal}`);
    this.cardsLeftText.setText(`${cardsInHand} cards in hand`);
  }

  getHandCardLabel(card: SushiGoCard): string {
    return cardLabel(card);
  }

  getTableauCardLabel(card: SushiGoCard): string {
    switch (card.type) {
      case 'maki':
        return `${card.icons}`;
      case 'nigiri':
        return card.variant.charAt(0).toUpperCase();
      default:
        return CARD_STYLES[card.type].short;
    }
  }

  getTypeGroupLabel(type: SushiGoCardType, cards: SushiGoCard[]): string {
    switch (type) {
      case 'maki': {
        const totalIcons = cards.reduce((sum, c) => sum + (c.type === 'maki' ? c.icons : 0), 0);
        return `Maki(${totalIcons})`;
      }
      case 'tempura':
        return `Tmp(${cards.length})`;
      case 'sashimi':
        return `Ssh(${cards.length})`;
      case 'dumpling':
        return `Dmp(${cards.length})`;
      case 'nigiri':
        return `Nig(${cards.length})`;
      case 'wasabi':
        return `Wsb(${cards.length})`;
      case 'pudding':
        return `Pdg(${cards.length})`;
      case 'chopsticks':
        return `Chp(${cards.length})`;
    }
  }

  groupByType(tableau: SushiGoCard[]): Map<SushiGoCardType, SushiGoCard[]> {
    const groups = new Map<SushiGoCardType, SushiGoCard[]>();
    for (const card of tableau) {
      const existing = groups.get(card.type);
      if (existing) existing.push(card);
      else groups.set(card.type, [card]);
    }
    return groups;
  }
}
