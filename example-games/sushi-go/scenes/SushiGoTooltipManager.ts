/**
 * SushiGoTooltipManager -- handles card tooltip display for Sushi Go!
 */

import { GAME_W, GAME_H, FONT_FAMILY } from '../../../src/ui';
import type { SushiGoCard } from '../SushiGoCards';
import { SCORING_TOOLTIPS, TOOLTIP_BG_COLOR, TOOLTIP_BG_ALPHA, TOOLTIP_PADDING, TOOLTIP_FONT_SIZE, TOOLTIP_MAX_WIDTH, TOOLTIP_DEPTH } from './SushiGoConstants';

export class SushiGoTooltipManager {
  private tooltipContainer: Phaser.GameObjects.Container | null = null;

  constructor(
    private scene: Phaser.Scene,
    private showTooltips: () => boolean,
  ) {}

  showCardTooltip(card: SushiGoCard, cardContainer: Phaser.GameObjects.Container): void {
    if (!this.showTooltips()) return;
    this.hideCardTooltip();

    const tooltipText = SCORING_TOOLTIPS[card.type];

    const text = this.scene.add.text(0, 0, tooltipText, {
      fontSize: TOOLTIP_FONT_SIZE,
      color: '#ffffff',
      fontFamily: FONT_FAMILY,
      wordWrap: { width: TOOLTIP_MAX_WIDTH - TOOLTIP_PADDING * 2 },
    }).setOrigin(0, 0);

    const textW = text.width;
    const textH = text.height;
    const boxW = textW + TOOLTIP_PADDING * 2;
    const boxH = textH + TOOLTIP_PADDING * 2;

    let tooltipX = cardContainer.x - boxW / 2;
    let tooltipY = cardContainer.y + 40;

    tooltipX = Phaser.Math.Clamp(tooltipX, 4, GAME_W - boxW - 4);
    tooltipY = Phaser.Math.Clamp(tooltipY, 4, GAME_H - boxH - 4);

    if (tooltipY < cardContainer.y + 30 && tooltipY + boxH > cardContainer.y - 30) {
      tooltipY = cardContainer.y - 40 - boxH;
      tooltipY = Phaser.Math.Clamp(tooltipY, 4, GAME_H - boxH - 4);
    }

    const bg = this.scene.add.rectangle(
      boxW / 2, boxH / 2,
      boxW, boxH,
      TOOLTIP_BG_COLOR, TOOLTIP_BG_ALPHA,
    );
    bg.setStrokeStyle(1, 0x888888);

    text.setPosition(TOOLTIP_PADDING, TOOLTIP_PADDING);

    this.tooltipContainer = this.scene.add.container(tooltipX, tooltipY, [bg, text]);
    this.tooltipContainer.setDepth(TOOLTIP_DEPTH);
  }

  hideCardTooltip(): void {
    if (this.tooltipContainer) {
      this.tooltipContainer.destroy();
      this.tooltipContainer = null;
    }
  }

  destroy(): void {
    this.hideCardTooltip();
  }
}
