/**
 * LostCitiesTooltipManager — expedition scoring tooltip display.
 */
import Phaser from 'phaser';
import type { ExpeditionColor } from '../LostCitiesCards';
import { EXPEDITION_COLORS } from '../LostCitiesCards';
import type { LostCitiesSession } from '../LostCitiesGame';
import { scoreExpeditionDetailed } from '../LostCitiesScoring';
import { GAME_W, GAME_H, FONT_FAMILY } from '../../../src/ui';
import {
  laneX,
  CARD_W,
  TOOLTIP_BG_COLOR,
  TOOLTIP_BG_ALPHA,
  TOOLTIP_PAD,
  TOOLTIP_DEPTH,
  TOOLTIP_MAX_W,
} from './LostCitiesConstants';

export class LostCitiesTooltipManager {
  private scene: Phaser.Scene;
  private session: LostCitiesSession;
  private tooltipContainer: Phaser.GameObjects.Container | null = null;
  private tooltipColor: ExpeditionColor | null = null;
  private showTooltips: boolean = true;

  constructor(scene: Phaser.Scene, session: LostCitiesSession) {
    this.scene = scene;
    this.session = session;
  }

  setShowTooltips(value: boolean): void {
    this.showTooltips = value;
  }

  showExpeditionTooltip(
    color: ExpeditionColor,
    anchor: Phaser.GameObjects.Components.Transform & { width?: number; height?: number },
    position: 'above' | 'below' = 'above',
  ): void {
    if (!this.showTooltips) return;
    this.hideExpeditionTooltip();
    this.tooltipColor = color;

    const plrCards = this.session.players[0].expeditions.get(color) ?? [];
    const oppCards = this.session.players[1].expeditions.get(color) ?? [];
    const plr = scoreExpeditionDetailed(color, plrCards);
    const opp = scoreExpeditionDetailed(color, oppCards);

    const detailLines = [
      this.formatExpBreakdown('You', plr),
      this.formatExpBreakdown('Opp', opp),
    ];

    const text = this.scene.add.text(0, 0, detailLines.join('\n'), {
      fontSize: '12px',
      color: '#dddddd',
      fontFamily: FONT_FAMILY,
      lineSpacing: 4,
      wordWrap: { width: TOOLTIP_MAX_W - TOOLTIP_PAD * 2 },
    }).setOrigin(0, 0);

    const title = this.scene.add.text(TOOLTIP_PAD, TOOLTIP_PAD, `${color.toUpperCase()} Expedition`, {
      fontSize: '13px',
      color: '#f0c040',
      fontFamily: FONT_FAMILY,
      fontStyle: 'bold',
    }).setOrigin(0, 0);

    text.setPosition(TOOLTIP_PAD, TOOLTIP_PAD + title.height + 6);

    const boxW = Math.max(text.width, title.width) + TOOLTIP_PAD * 2;
    const boxH = TOOLTIP_PAD + title.height + 6 + text.height + TOOLTIP_PAD;

    let tooltipX = anchor.x - boxW / 2;
    let tooltipY: number;
    if (position === 'below') {
      tooltipY = anchor.y + (anchor.height ?? 0) / 2 + 6;
    } else {
      tooltipY = anchor.y - (anchor.height ?? 0) / 2 - boxH - 6;
    }

    tooltipX = Phaser.Math.Clamp(tooltipX, 4, GAME_W - boxW - 4);
    tooltipY = Phaser.Math.Clamp(tooltipY, 4, GAME_H - boxH - 4);

    const bg = this.scene.add.rectangle(
      boxW / 2, boxH / 2,
      boxW, boxH,
      TOOLTIP_BG_COLOR, TOOLTIP_BG_ALPHA,
    );
    bg.setStrokeStyle(1, 0x888888);

    this.tooltipContainer = this.scene.add.container(tooltipX, tooltipY, [bg, title, text]);
    this.tooltipContainer.setDepth(TOOLTIP_DEPTH);
  }

  hideExpeditionTooltip(): void {
    if (this.tooltipContainer) {
      this.tooltipContainer.destroy();
      this.tooltipContainer = null;
    }
    this.tooltipColor = null;
  }

  get currentTooltipColor(): ExpeditionColor | null {
    return this.tooltipColor;
  }

  private formatExpBreakdown(
    label: string,
    b: ReturnType<typeof scoreExpeditionDetailed>,
  ): string {
    if (b.cardCount === 0) return `${label}: no cards`;
    const inv = b.investmentCount > 0 ? `, ${b.investmentCount} inv (x${b.multiplier})` : '';
    const bonus = b.bonusEarned ? ', +20 bonus' : '';
    return `${label}: ${b.cardCount} cards${inv}${bonus} = ${b.score}`;
  }

  colorAtPointerX(px: number): ExpeditionColor | null {
    const half = CARD_W / 2 + 4;
    for (let i = 0; i < 5; i++) {
      const cx = laneX(i);
      if (px >= cx - half && px <= cx + half) return EXPEDITION_COLORS[i];
    }
    return null;
  }
}
