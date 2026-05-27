/**
 * SushiGoTableauRenderer -- renders the tableau display for Sushi Go!
 */

import type { SushiGoCard, SushiGoCardType } from '../SushiGoCards';
import { scoreTableauBreakdown, countMakiIcons, scoreMaki } from '../SushiGoScoring';
import type { SushiGoSession } from '../SushiGoGame';
import {
  TABLEAU_CARD_W, TABLEAU_CARD_H, TABLEAU_GROUP_GAP, TABLEAU_CARD_GAP,
  PLAYER_TABLEAU_Y, AI_TABLEAU_Y, SCORING_TOOLTIPS,
} from './SushiGoConstants';
import { GAME_W } from '../../../src/ui';
import type { TooltipManager } from '../../../src/ui';
import { SushiGoCardFactory } from './SushiGoCardFactory';
import { SushiGoRenderer } from './SushiGoRenderer';
import {
  computeEncounterOrder,
  computeTableauLayout,
  pairWasabiNigiri,
  type TableauLayoutItem,
} from './SushiGoTableauHelpers';

export class SushiGoTableauRenderer {
  constructor(
    private scene: Phaser.Scene,
    private session: SushiGoSession,
    private cardFactory: SushiGoCardFactory,
    private renderer: SushiGoRenderer,
    private tooltipManager: TooltipManager,
  ) {}

  refreshTableau(
    who: 'player' | 'ai',
    container: Phaser.GameObjects.Container,
  ): void {
    container.removeAll(true);

    const playerIdx = who === 'player' ? 0 : 1;
    const tableau = this.session.players[playerIdx].tableau;
    const baseY = who === 'player' ? PLAYER_TABLEAU_Y : AI_TABLEAU_Y;

    if (this.renderEmptyTableauIfNeeded(container, tableau, baseY)) {
      return;
    }

    const pairings = pairWasabiNigiri(tableau);
    const groups = this.renderer.groupByType(tableau);
    const visibleGroups = this.filterVisibleGroups(groups, pairings.wasabiToNigiri);
    const order = computeEncounterOrder(tableau);
    const layout = computeTableauLayout(
      order,
      visibleGroups,
      GAME_W,
      TABLEAU_CARD_W,
      TABLEAU_CARD_GAP,
      TABLEAU_GROUP_GAP,
    );

    const makiBonuses = scoreMaki(
      this.session.players.map((p) => countMakiIcons(p.tableau)),
    );

    this.renderGroups(who, container, tableau, baseY, layout, makiBonuses[playerIdx] ?? 0);
    this.addWasabiOverlays(container, pairings.nigiriToWasabi);
  }

  private renderEmptyTableauIfNeeded(
    container: Phaser.GameObjects.Container,
    tableau: SushiGoCard[],
    baseY: number,
  ): boolean {
    if (tableau.length > 0) {
      return false;
    }

    const empty = this.scene.add.text(GAME_W / 2, baseY, '(no cards yet)', {
      fontSize: '15px',
      color: '#666666',
      fontFamily: 'sans-serif',
    }).setOrigin(0.5);
    container.add(empty);
    return true;
  }

  private filterVisibleGroups(
    groups: Map<SushiGoCardType, SushiGoCard[]>,
    wasabiToNigiri: Map<number, number>,
  ): Map<SushiGoCardType, SushiGoCard[]> {
    const visible = new Map(groups);
    const wasabiCards = visible.get('wasabi') ?? [];
    const unusedWasabi = wasabiCards.filter((card) => !wasabiToNigiri.has(card.id));
    visible.set('wasabi', unusedWasabi);
    return visible;
  }

  private renderGroups(
    who: 'player' | 'ai',
    container: Phaser.GameObjects.Container,
    tableau: SushiGoCard[],
    baseY: number,
    layout: TableauLayoutItem[],
    playerMakiBonus: number,
  ): void {
    const breakdown = scoreTableauBreakdown(tableau);

    for (const group of layout) {
      const labelText = this.buildTypeLabel(group.type, group.cards, breakdown, playerMakiBonus);
      this.renderGroupLabel(who, container, group, baseY, labelText);
      this.renderGroupCards(container, group, baseY, breakdown);
    }
  }

  private buildTypeLabel(
    type: SushiGoCardType,
    cards: SushiGoCard[],
    breakdown: ReturnType<typeof scoreTableauBreakdown>,
    playerMakiBonus: number,
  ): string {
    const defaultLabel = this.renderer.getTypeGroupLabel(type, cards);

    if (type === 'maki') {
      if (playerMakiBonus !== 0) {
        return `Maki(${playerMakiBonus >= 0 ? '+' : ''}${playerMakiBonus})`;
      }
      const totalIcons = cards.reduce((sum, card) => sum + (card.type === 'maki' ? card.icons : 0), 0);
      return `Maki(${totalIcons})`;
    }

    if (type === 'pudding') {
      return defaultLabel;
    }

    switch (type) {
      case 'tempura':
        return `Tmp(${breakdown.tempura})`;
      case 'sashimi':
        return `Ssh(${breakdown.sashimi})`;
      case 'dumpling':
        return `Dmp(${breakdown.dumpling})`;
      case 'nigiri':
        return `Nig(${breakdown.nigiri})`;
      case 'wasabi':
        return `Wsb(${cards.length})`;
      case 'chopsticks':
        return `Chp(${breakdown.chopsticks})`;
      default:
        return defaultLabel;
    }
  }

  private renderGroupLabel(
    who: 'player' | 'ai',
    container: Phaser.GameObjects.Container,
    group: TableauLayoutItem,
    baseY: number,
    labelText: string,
  ): void {
    const typeLabel = this.scene.add.text(
      group.startX + group.width / 2,
      baseY - TABLEAU_CARD_H / 2 - 16,
      labelText,
      {
        fontSize: '11px',
        color: who === 'player' ? '#aaccaa' : '#99aabb',
        fontFamily: 'sans-serif',
      },
    ).setOrigin(0.5);
    container.add(typeLabel);
  }

  private renderGroupCards(
    container: Phaser.GameObjects.Container,
    group: TableauLayoutItem,
    baseY: number,
    breakdown: ReturnType<typeof scoreTableauBreakdown>,
  ): void {
    for (let i = 0; i < group.cards.length; i++) {
      const x = group.startX + i * (TABLEAU_CARD_W + TABLEAU_CARD_GAP) + TABLEAU_CARD_W / 2;
      const card = group.cards[i];

      const onShowTooltip = (c: SushiGoCard, cardContainer: Phaser.GameObjects.Container) => {
        const tooltipContent = this.buildTableauTooltipContent(c, breakdown);
        this.tooltipManager.show(tooltipContent, cardContainer.x, cardContainer.y, {
          content: tooltipContent,
          x: cardContainer.x,
          y: cardContainer.y,
        });
      };
      const onHideTooltip = () => {
        this.tooltipManager.hide();
      };

      const cardRect = this.cardFactory.createCardRect(
        x,
        baseY,
        TABLEAU_CARD_W,
        TABLEAU_CARD_H,
        card,
        true,       // interactive — enables hover highlight and useHandCursor
        undefined,  // handIndex — tableau cards are not clickable
        undefined,  // onClick — no click handler for tableau cards
        onShowTooltip,
        onHideTooltip,
      );
      container.add(cardRect);
    }
  }

  /**
   * Build the tooltip content for a tableau card.
   *
   * For card types with a meaningful per-player score (tempura, sashimi,
   * dumpling, nigiri), the tooltip shows the scoring rule text followed
   * by the current score contribution for that card's group.
   *
   * For maki, pudding, wasabi, and chopsticks — whose scores depend on
   * cross-player comparison, end-of-game scoring, or are zero-valued —
   * only the generic scoring rule text is shown.
   */
  private buildTableauTooltipContent(
    card: SushiGoCard,
    breakdown: ReturnType<typeof scoreTableauBreakdown>,
  ): string {
    const ruleText = SCORING_TOOLTIPS[card.type];

    switch (card.type) {
      case 'tempura':
        return `${ruleText}\n\nTempura score: ${breakdown.tempura} pts`;
      case 'sashimi':
        return `${ruleText}\n\nSashimi score: ${breakdown.sashimi} pts`;
      case 'dumpling':
        return `${ruleText}\n\nDumpling score: ${breakdown.dumpling} pts`;
      case 'nigiri':
        return `${ruleText}\n\nNigiri score: ${breakdown.nigiri} pts`;
      // Maki: cross-player comparison, no per-player breakdown
      // Pudding: end-of-game only
      // Wasabi: 0 direct points (its value is triple on the next nigiri)
      // Chopsticks: 0 points utility card
      case 'maki':
      case 'pudding':
      case 'wasabi':
      case 'chopsticks':
      default:
        return ruleText;
    }
  }

  private addWasabiOverlays(
    container: Phaser.GameObjects.Container,
    nigiriToWasabi: Map<number, number>,
  ): void {
    for (const nigiriId of nigiriToWasabi.keys()) {
      const nigiriContainer = this.findCardContainer(container, nigiriId);
      if (!nigiriContainer || nigiriContainer.getData('wasabiOverlay')) {
        continue;
      }

      this.renderWasabiIcon(nigiriContainer);
      this.renderMultiplierBadge(nigiriContainer);
      nigiriContainer.setData('wasabiOverlay', true);
    }
  }

  private findCardContainer(
    container: Phaser.GameObjects.Container,
    cardId: number,
  ): Phaser.GameObjects.Container | null {
    const children = container.getAll();

    for (const child of children) {
      if (!(child instanceof Phaser.GameObjects.Container)) {
        continue;
      }

      if (child.getData && child.getData('cardId') === cardId) {
        return child;
      }
    }

    return null;
  }

  private renderWasabiIcon(target: Phaser.GameObjects.Container): void {
    if (!this.scene.textures.exists('icon-wasabi')) {
      return;
    }

    const iconSize = Math.round(TABLEAU_CARD_W * 0.36);
    const wasabiY = TABLEAU_CARD_H / 2 - 26;
    const wasabiImg = this.scene.add.image(0, wasabiY, 'icon-wasabi');
    wasabiImg.setDisplaySize(iconSize, iconSize);
    wasabiImg.setOrigin(0.5, 1);
    target.addAt(wasabiImg, 1);
  }

  private renderMultiplierBadge(target: Phaser.GameObjects.Container): void {
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

    target.add(badgeBg);
    target.add(badgeText);
  }
}
