/**
 * SushiGoCardFactory -- creates visual card rectangles for Sushi Go!
 */

import type { SushiGoCard } from '../SushiGoCards';
import { cardLabel } from '../SushiGoCards';
import { getIconKeyForCard } from '../IconMap';
import { CARD_STYLES } from './SushiGoConstants';

export class SushiGoCardFactory {
  constructor(private scene: Phaser.Scene) {}

  createCardRect(
    x: number,
    y: number,
    w: number,
    h: number,
    card: SushiGoCard,
    interactive: boolean = false,
    handIndex?: number,
    onClick?: (index: number) => void,
    onShowTooltip?: (card: SushiGoCard, container: Phaser.GameObjects.Container) => void,
    onHideTooltip?: () => void,
  ): Phaser.GameObjects.Container {
    const style = CARD_STYLES[card.type];
    const container = this.scene.add.container(x, y);

    const bg = this.scene.add.rectangle(0, 0, w, h, style.bg);
    bg.setStrokeStyle(2, 0x333333);
    container.add(bg);

    const isHand = handIndex !== undefined;
    const labelText = isHand ? cardLabel(card) : this.getTableauCardLabel(card);
    const fontSize = isHand ? '16px' : '12px';

    const iconMeta = getIconKeyForCard(card);
    const iconKey = iconMeta?.key ?? null;
    if (iconKey && this.scene.textures.exists(iconKey)) {
      const img = this.scene.add.image(0, 0, iconKey);
      img.setOrigin(0.5, 0.5);
      const iconMaxW = w * (isHand ? 0.9 : 0.85);
      const iconMaxH = h * (isHand ? 0.7 : 0.85);
      const iconSize = Math.min(iconMaxW, iconMaxH);
      img.setDisplaySize(iconSize, iconSize);
      container.add(img);

      const bottomPadding = isHand ? 8 : 6;
      const label = this.scene.add.text(0, h / 2 - bottomPadding, labelText, {
        fontSize,
        color: style.text,
        fontFamily: 'sans-serif',
        align: 'center',
        wordWrap: { width: w - 6 },
      }).setOrigin(0.5, 1);
      container.add(label);
    } else {
      const label = this.scene.add.text(0, 0, labelText, {
        fontSize,
        color: style.text,
        fontFamily: 'sans-serif',
        align: 'center',
        wordWrap: { width: w - 6 },
      }).setOrigin(0.5);
      container.add(label);
    }

    bg.setInteractive({ useHandCursor: interactive });

    if (interactive && handIndex !== undefined && onClick) {
      bg.on('pointerdown', () => onClick(handIndex));
    }

    bg.on('pointerover', () => {
      if (interactive) {
        bg.setStrokeStyle(3, 0xffdd44);
        container.setScale(1.08);
      }
      onShowTooltip?.(card, container);
    });
    bg.on('pointerout', () => {
      if (interactive) {
        bg.setStrokeStyle(2, 0x333333);
        container.setScale(1.0);
      }
      onHideTooltip?.();
    });

    container.setData('cardId', card.id);

    return container;
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
}
