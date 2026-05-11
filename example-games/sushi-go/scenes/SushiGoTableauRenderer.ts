/**
 * SushiGoTableauRenderer -- renders the tableau display for Sushi Go!
 */

import type { SushiGoCardType } from '../SushiGoCards';
import { scoreTableauBreakdown, countMakiIcons, scoreMaki } from '../SushiGoScoring';
import type { SushiGoSession } from '../SushiGoGame';
import {
  TABLEAU_CARD_W, TABLEAU_CARD_H, TABLEAU_GROUP_GAP, TABLEAU_CARD_GAP,
  PLAYER_TABLEAU_Y, AI_TABLEAU_Y,
} from './SushiGoConstants';
import { GAME_W } from '../../../src/ui';
import { SushiGoCardFactory } from './SushiGoCardFactory';
import { SushiGoRenderer } from './SushiGoRenderer';

export class SushiGoTableauRenderer {
  constructor(
    private scene: Phaser.Scene,
    private session: SushiGoSession,
    private cardFactory: SushiGoCardFactory,
    private renderer: SushiGoRenderer,
  ) {}

  refreshTableau(
    who: 'player' | 'ai',
    container: Phaser.GameObjects.Container,
  ): void {
    container.removeAll(true);

    const playerIdx = who === 'player' ? 0 : 1;
    const tableau = this.session.players[playerIdx].tableau;
    const baseY = who === 'player' ? PLAYER_TABLEAU_Y : AI_TABLEAU_Y;

    if (tableau.length === 0) {
      const empty = this.scene.add.text(GAME_W / 2, baseY, '(no cards yet)', {
        fontSize: '15px',
        color: '#666666',
        fontFamily: 'sans-serif',
      }).setOrigin(0.5);
      container.add(empty);
      return;
    }

    const wasabiToNigiri = new Map<number, number>();
    const nigiriToWasabi = new Map<number, number>();
    const wasabiQueue: number[] = [];
    for (const c of tableau) {
      if (c.type === 'wasabi') {
        wasabiQueue.push(c.id);
      } else if (c.type === 'nigiri') {
        if (wasabiQueue.length > 0) {
          const wId = wasabiQueue.shift()!;
          wasabiToNigiri.set(wId, c.id);
          nigiriToWasabi.set(c.id, wId);
        }
      }
    }

    const groups = this.renderer.groupByType(tableau);

    const allMakiCounts = this.session.players.map((p) => countMakiIcons(p.tableau));
    const allMakiBonuses = scoreMaki(allMakiCounts);

    const seenTypes = new Set<string>();
    const typeOrder: string[] = [];
    for (const c of tableau) {
      if (!seenTypes.has(c.type)) {
        seenTypes.add(c.type);
        typeOrder.push(c.type);
      }
    }

    let totalWidth = 0;
    const groupWidths: number[] = [];
    for (const type of typeOrder) {
      const cards = groups.get(type as SushiGoCardType);
      if (!cards || cards.length === 0) continue;
      const w = cards.length * (TABLEAU_CARD_W + TABLEAU_CARD_GAP) - TABLEAU_CARD_GAP;
      groupWidths.push(w);
      totalWidth += w;
    }
    totalWidth += (groupWidths.length - 1) * TABLEAU_GROUP_GAP;

    let curX = (GAME_W - totalWidth) / 2;

    for (const type of typeOrder) {
      let cards = groups.get(type as SushiGoCardType);
      if (!cards || cards.length === 0) continue;

      if (type === 'wasabi') {
        cards = cards.filter((c) => !wasabiToNigiri.has(c.id));
        if (cards.length === 0) continue;
      }

      const groupW = cards.length * (TABLEAU_CARD_W + TABLEAU_CARD_GAP) - TABLEAU_CARD_GAP;
      let labelText = this.renderer.getTypeGroupLabel(type as SushiGoCardType, cards);

      if (type !== 'pudding') {
        try {
          const breakdown = scoreTableauBreakdown(tableau);
          switch (type) {
            case 'tempura':
              labelText = `Tmp(${breakdown.tempura})`;
              break;
            case 'sashimi':
              labelText = `Ssh(${breakdown.sashimi})`;
              break;
            case 'dumpling':
              labelText = `Dmp(${breakdown.dumpling})`;
              break;
            case 'nigiri':
              labelText = `Nig(${breakdown.nigiri})`;
              break;
            case 'wasabi':
              labelText = `Wsb(${cards.length})`;
              break;
            case 'chopsticks':
              labelText = `Chp(${breakdown.chopsticks})`;
              break;
          }
        } catch (e) {
          console.warn('Failed to compute breakdown for tableau labels', e);
        }
      }

      if (type === 'maki') {
        const totalIcons = cards.reduce((sum, c) => sum + (c.type === 'maki' ? c.icons : 0), 0);
        const playerMakiBonus = allMakiBonuses[playerIdx] ?? 0;
        if (playerMakiBonus !== 0) {
          labelText = `Maki(${playerMakiBonus >= 0 ? '+' : ''}${playerMakiBonus})`;
        } else {
          labelText = `Maki(${totalIcons})`;
        }
      }

      const typeLabel = this.scene.add.text(
        curX + groupW / 2,
        baseY - TABLEAU_CARD_H / 2 - 16,
        labelText,
        {
          fontSize: '11px',
          color: who === 'player' ? '#aaccaa' : '#99aabb',
          fontFamily: 'sans-serif',
        },
      ).setOrigin(0.5);
      container.add(typeLabel);

      for (let i = 0; i < cards.length; i++) {
        const x = curX + i * (TABLEAU_CARD_W + TABLEAU_CARD_GAP) + TABLEAU_CARD_W / 2;
        const cardRect = this.cardFactory.createCardRect(
          x, baseY, TABLEAU_CARD_W, TABLEAU_CARD_H, cards[i],
        );
        container.add(cardRect);
      }

      curX += groupW + TABLEAU_GROUP_GAP;
    }

    for (const [nigiriId] of nigiriToWasabi.entries()) {
      const children = container.getAll();
      let nigiriContainer: Phaser.GameObjects.Container | null = null;
      for (const child of children) {
        if (!(child instanceof Phaser.GameObjects.Container)) continue;
        const possible = child.getData && child.getData('cardId') === nigiriId;
        if (possible) {
          nigiriContainer = child as Phaser.GameObjects.Container;
          break;
        }
      }

      if (!nigiriContainer) continue;
      if (nigiriContainer.getData('wasabiOverlay')) continue;

      if (this.scene.textures.exists('icon-wasabi')) {
        const iconSize = Math.round(TABLEAU_CARD_W * 0.36);
        const wasabiY = TABLEAU_CARD_H / 2 - 26;
        const wasabiImg = this.scene.add.image(0, wasabiY, 'icon-wasabi');
        wasabiImg.setDisplaySize(iconSize, iconSize);
        wasabiImg.setOrigin(0.5, 1);
        nigiriContainer.addAt(wasabiImg, 1);
      }

      const badgeW = 32;
      const badgeH = 18;
      const badgeX = TABLEAU_CARD_W / 2 - badgeW / 2 - 6;
      const badgeY = -TABLEAU_CARD_H / 2 + badgeH / 2 + 6;
      const badgeBg = this.scene.add.rectangle(badgeX, badgeY, badgeW, badgeH, 0x90EE90, 1);
      badgeBg.setStrokeStyle(1, 0x336633);
      badgeBg.setOrigin(0.5);
      const badgeText = this.scene.add.text(badgeX, badgeY, 'x3', {
        fontSize: '12px',
        color: '#1a3a1a',
        fontFamily: 'sans-serif',
      }).setOrigin(0.5);
      nigiriContainer.add(badgeBg);
      nigiriContainer.add(badgeText);
      nigiriContainer.setData('wasabiOverlay', true);
    }
  }
}
