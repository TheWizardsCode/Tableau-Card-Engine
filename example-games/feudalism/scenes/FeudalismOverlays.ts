/**
 * FeudalismOverlays -- game over overlay and card action menu helpers, using generic OverlayManager.
 */
import Phaser from 'phaser';
import type { DevelopmentCard } from '../FeudalismCards';
import { tierDisplayName, resourceDisplayName, formatCost } from '../FeudalismCards';
import type { FeudalismSession } from '../FeudalismGame';
import { getInfluence, getWinnerIndex } from '../FeudalismGame';
import { FeudalismTranscriptRecorder } from '../GameTranscript';
import { autoSaveTranscript, TranscriptStore } from '../../../src/core-engine/transcript';
import {
  GAME_W, GAME_H, FONT_FAMILY,
  createOverlayButton,
  createGameOverOverlay,
  OverlayManager,
} from '../../../src/ui';
import { SFX_KEYS } from './FeudalismConstants';

const transcriptStore = new TranscriptStore();

export class FeudalismOverlayHelper {
  constructor(
    private scene: Phaser.Scene,
    private overlayManager: OverlayManager,
    private session: FeudalismSession,
  ) {}

  dismiss(): void {
    this.overlayManager.dismiss();
  }

  showGameOverOverlay(recorder: FeudalismTranscriptRecorder | null, onRestart: () => void): void {
    try { this.scene.sound.play?.(SFX_KEYS.GAME_END); } catch { /* ignore */ }
    const winnerIdx = getWinnerIndex(this.session);

    if (recorder && !recorder.isSealed()) {
      const transcript = recorder.finalize(winnerIdx);
      autoSaveTranscript(transcriptStore, 'feudalism', transcript, '[FeudalismScene]');
    }

    const winnerText = winnerIdx === 0 ? 'You Win!' : 'Game Over';
    const winnerColor = winnerIdx === 0 ? '#88ff88' : '#ff6666';
    const human = this.session.players[0];
    const ai = this.session.players[1];
    const humanInfluence = getInfluence(human);
    const aiInfluence = getInfluence(ai);

    // Build summary lines; only show tiebreaker text when scores are actually tied
    const summaryLines: string[] = [
      `You: ${humanInfluence} influence (${human.purchasedCards.length} cards, ${human.patrons.length} patrons)`,
      `AI: ${aiInfluence} influence (${ai.purchasedCards.length} cards, ${ai.patrons.length} patrons)`,
    ];
    if (humanInfluence === aiInfluence) {
      summaryLines.push('', `Tiebreak: fewest cards wins`);
    }
    const summaryText = summaryLines.join('\n');

    const result = createGameOverOverlay(this.scene, {
      title: winnerText,
      titleColor: winnerColor,
      summaryText,
      onPlayAgain: () => {
        try { this.scene.sound.play?.(SFX_KEYS.UI_CLICK); } catch { /* ignore */ }
        this.dismiss();
        onRestart();
      },
      onMenu: () => this.scene.scene.start('GameSelectorScene'),
      playAgainLabel: 'Play Again',
      menuLabel: 'Menu',
    });
    this.overlayManager.add(...result.objects);
  }

  showCardActionMenu(
    card: DevelopmentCard,
    canBuy: boolean,
    canReserve: boolean,
    onBuy: () => void,
    onReserve: () => void,
    onCancel: () => void,
  ): void {
    this.overlayManager.showOverlay({
      type: 'custom',
      backgroundOptions: { depth: 10, alpha: 0.5 },
      box: { width: 420, height: 230, alpha: 0.9 },
    });

    const pts = card.points > 0 ? `${card.points} pt, ` : '';
    const info = `${tierDisplayName(card.tier)} ${resourceDisplayName(card.bonus)} bonus\n${pts}Cost: ${formatCost(card.cost)}`;
    const infoText = this.scene.add.text(GAME_W / 2, GAME_H / 2 - 55, info, {
      fontSize: '18px', color: '#ffffff', fontFamily: FONT_FAMILY, align: 'center',
    }).setOrigin(0.5).setDepth(11);
    this.overlayManager.add(infoText);

    let bx = GAME_W / 2 - 105;

    if (canBuy) {
      const buyBtn = createOverlayButton(this.scene, bx, GAME_H / 2 + 40, '[ Buy ]');
      buyBtn.on('pointerdown', () => {
        this.dismiss();
        onBuy();
      });
      this.overlayManager.add(buyBtn);
      bx += 105;
    }

    if (canReserve) {
      const resBtn = createOverlayButton(this.scene, bx, GAME_H / 2 + 40, '[ Reserve ]');
      resBtn.on('pointerdown', () => {
        this.dismiss();
        onReserve();
      });
      this.overlayManager.add(resBtn);
      bx += 105;
    }

    const cancelBtn = createOverlayButton(this.scene, bx, GAME_H / 2 + 40, '[ Cancel ]');
    cancelBtn.on('pointerdown', () => {
      try { this.scene.sound.play?.(SFX_KEYS.UI_CLICK); } catch { /* ignore */ }
      this.dismiss();
      onCancel();
    });
    this.overlayManager.add(cancelBtn);
  }
}
