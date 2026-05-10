/**
 * FeudalismOverlayManager — game over overlay and card action menu.
 */
import Phaser from 'phaser';
import type { DevelopmentCard } from '../FeudalismCards';
import { tierDisplayName, resourceDisplayName, formatCost } from '../FeudalismCards';
import type { FeudalismSession } from '../FeudalismGame';
import { getInfluence, getWinnerIndex } from '../FeudalismGame';
import { FeudalismTranscriptRecorder } from '../GameTranscript';
import { autoSaveTranscript } from '../../../src/core-engine/autoSaveTranscript';
import { TranscriptStore } from '../../../src/core-engine/TranscriptStore';
import {
  GAME_W, GAME_H, FONT_FAMILY,
  createOverlayBackground, createOverlayButton, createOverlayMenuButton,
  dismissOverlay,
} from '../../../src/ui';
import { SFX_KEYS } from './FeudalismConstants';

const transcriptStore = new TranscriptStore();

export class FeudalismOverlayManager {
  private scene: Phaser.Scene;
  private session: FeudalismSession;
  private recorder: FeudalismTranscriptRecorder | null = null;
  private overlayObjects: Phaser.GameObjects.GameObject[] = [];
  private onRestart?: () => void;

  constructor(scene: Phaser.Scene, session: FeudalismSession) {
    this.scene = scene;
    this.session = session;
  }

  setRecorder(recorder: FeudalismTranscriptRecorder | null): void {
    this.recorder = recorder;
  }

  setOnRestart(callback: () => void): void {
    this.onRestart = callback;
  }

  dismiss(): void {
    dismissOverlay(this.overlayObjects);
    this.overlayObjects = [];
  }

  showGameOverOverlay(): void {
    this.scene.sound.play?.(SFX_KEYS.GAME_END);
    const winnerIdx = getWinnerIndex(this.session);

    if (this.recorder && !this.recorder.isSealed()) {
      const transcript = this.recorder.finalize(winnerIdx);
      autoSaveTranscript(transcriptStore, 'feudalism', transcript, '[FeudalismScene]');
    }

    const overlay = createOverlayBackground(
      this.scene,
      { depth: 10, alpha: 0.01 },
      { width: 520, height: 340, alpha: 0.9 },
    );
    this.overlayObjects.push(...overlay.objects);

    const winnerText = winnerIdx === 0 ? 'You Win!' : 'AI Wins!';
    const human = this.session.players[0];
    const ai = this.session.players[1];
    const humanInfluence = getInfluence(human);
    const aiInfluence = getInfluence(ai);

    const lines = [
      winnerText,
      '',
      `You: ${humanInfluence} influence (${human.purchasedCards.length} cards, ${human.patrons.length} patrons)`,
      `AI: ${aiInfluence} influence (${ai.purchasedCards.length} cards, ${ai.patrons.length} patrons)`,
      '',
      `Tiebreak: fewest cards wins`,
    ];

    const text = this.scene.add
      .text(GAME_W / 2, GAME_H / 2 - 55, lines.join('\n'), {
        fontSize: '20px', color: '#ffffff', fontFamily: FONT_FAMILY,
        align: 'center', lineSpacing: 6,
      })
      .setOrigin(0.5)
      .setDepth(11);
    this.overlayObjects.push(text);

    const playBtn = createOverlayButton(this.scene, GAME_W / 2 - 80, GAME_H / 2 + 110, '[ Play Again ]');
    playBtn.on('pointerdown', () => {
      this.scene.sound.play?.(SFX_KEYS.UI_CLICK);
      this.dismiss();
      this.onRestart?.();
    });
    this.overlayObjects.push(playBtn);

    const menuBtn = createOverlayMenuButton(this.scene, GAME_W / 2 + 80, GAME_H / 2 + 110);
    this.overlayObjects.push(menuBtn);
  }

  showCardActionMenu(
    card: DevelopmentCard,
    canBuy: boolean,
    canReserve: boolean,
    onBuy: () => void,
    onReserve: () => void,
    onCancel: () => void,
  ): void {
    const overlay = createOverlayBackground(
      this.scene,
      { depth: 10, alpha: 0.5 },
      { width: 420, height: 230, alpha: 0.9 },
    );
    this.overlayObjects.push(...overlay.objects);

    const pts = card.points > 0 ? `${card.points} pt, ` : '';
    const info = `${tierDisplayName(card.tier)} ${resourceDisplayName(card.bonus)} bonus\n${pts}Cost: ${formatCost(card.cost)}`;
    const infoText = this.scene.add.text(GAME_W / 2, GAME_H / 2 - 55, info, {
      fontSize: '18px', color: '#ffffff', fontFamily: FONT_FAMILY, align: 'center',
    }).setOrigin(0.5).setDepth(11);
    this.overlayObjects.push(infoText);

    let bx = GAME_W / 2 - 105;

    if (canBuy) {
      const buyBtn = createOverlayButton(this.scene, bx, GAME_H / 2 + 40, '[ Buy ]');
      buyBtn.on('pointerdown', () => {
        this.dismiss();
        onBuy();
      });
      this.overlayObjects.push(buyBtn);
      bx += 105;
    }

    if (canReserve) {
      const resBtn = createOverlayButton(this.scene, bx, GAME_H / 2 + 40, '[ Reserve ]');
      resBtn.on('pointerdown', () => {
        this.dismiss();
        onReserve();
      });
      this.overlayObjects.push(resBtn);
      bx += 105;
    }

    const cancelBtn = createOverlayButton(this.scene, bx, GAME_H / 2 + 40, '[ Cancel ]');
    cancelBtn.on('pointerdown', () => {
      this.scene.sound.play?.(SFX_KEYS.UI_CLICK);
      this.dismiss();
      onCancel();
    });
    this.overlayObjects.push(cancelBtn);
  }
}
