/**
 * LostCitiesOverlayManager — round and match summary overlays.
 */
import Phaser from 'phaser';
import { EXPEDITION_COLORS } from '../LostCitiesCards';
import type { LostCitiesSession, RoundScoreResult } from '../LostCitiesGame';
import { getMatchWinner } from '../LostCitiesGame';
import { autoSaveTranscript, TranscriptStore } from '../../../src/core-engine/transcript';
import { GAME_W, GAME_H } from '../../../src/ui';
import {
  createLcHudText,
  createOverlayBackground,
  createOverlayButton,
  createLcMenuButton,
  dismissOverlay,
} from '../../../src/ui/Renderer/adapters/LostCitiesAdapter';
import { SFX_KEYS } from './LostCitiesConstants';
import type { LCTranscriptRecorder } from '../GameTranscript';

const transcriptStore = new TranscriptStore();

export class LostCitiesOverlayManager {
  private scene: Phaser.Scene;
  private session: LostCitiesSession;
  private recorder: LCTranscriptRecorder;
  private overlayObjects: Phaser.GameObjects.GameObject[] = [];
  private onNextRound?: () => void;
  private onRestart?: () => void;

  constructor(
    scene: Phaser.Scene,
    session: LostCitiesSession,
    recorder: LCTranscriptRecorder,
  ) {
    this.scene = scene;
    this.session = session;
    this.recorder = recorder;
  }

  setCallbacks(onNextRound?: () => void, onRestart?: () => void): void {
    this.onNextRound = onNextRound;
    this.onRestart = onRestart;
  }

  dismiss(): void {
    dismissOverlay(this.overlayObjects);
    this.overlayObjects = [];
  }

  showRoundSummary(roundScore: RoundScoreResult): void {
    this.scene.sound.play?.(SFX_KEYS.ROUND_END);
    this.scene.time.delayedCall(400, () => {
      this.scene.sound.play?.(SFX_KEYS.SCORE_REVEAL);
    });

    const overlay = createOverlayBackground(
      this.scene,
      { depth: 10, alpha: 0.8 },
      { width: 600, height: 450, alpha: 0.92 },
    );
    this.overlayObjects.push(...overlay.objects);

    const cx = GAME_W / 2;
    const topY = GAME_H / 2 - 200;

    const title = createLcHudText(this.scene, cx, topY, `Round ${this.session.roundNumber - 1} Complete`, '#f0c040', {
      fontSize: '28px',
      originX: 0.5,
      originY: 0,
    });
    this.overlayObjects.push(title);

    const [p0Details, p1Details] = roundScore.details;
    const [p0Total, p1Total] = roundScore.totals;

    let y = topY + 50;

    const header = createLcHudText(this.scene, cx, y, 'Color             You     AI', '#aaaaaa', {
      fontSize: '14px',
      originX: 0.5,
      originY: 0,
    });
    this.overlayObjects.push(header);
    y += 26;

    for (let i = 0; i < EXPEDITION_COLORS.length; i++) {
      const color = EXPEDITION_COLORS[i];
      const p0Bd = p0Details.find(b => b.color === color);
      const p1Bd = p1Details.find(b => b.color === color);
      const p0Score = p0Bd ? p0Bd.score : 0;
      const p1Score = p1Bd ? p1Bd.score : 0;
      const p0Cards = p0Bd ? p0Bd.cardCount : 0;
      const p1Cards = p1Bd ? p1Bd.cardCount : 0;

      const colorName = color.charAt(0).toUpperCase() + color.slice(1);
      const p0Str = p0Cards > 0 ? `${p0Score}` : '-';
      const p1Str = p1Cards > 0 ? `${p1Score}` : '-';

      const row = createLcHudText(this.scene, cx, y, `${colorName.padEnd(14)}${p0Str.padStart(8)}${p1Str.padStart(8)}`, '#dddddd', {
        fontSize: '14px',
        originX: 0.5,
        originY: 0,
      });
      this.overlayObjects.push(row);
      y += 22;
    }

    y += 8;
    const totalRow = createLcHudText(this.scene, cx, y, `Round Total${String(p0Total).padStart(11)}${String(p1Total).padStart(8)}`, '#ffffff', {
      fontSize: '16px',
      originX: 0.5,
      originY: 0,
    });
    this.overlayObjects.push(totalRow);

    y += 30;
    const [cum0, cum1] = this.session.cumulativeScores;
    const cumRow = createLcHudText(this.scene, cx, y, `Cumulative${String(cum0).padStart(12)}${String(cum1).padStart(8)}`, '#f0c040', {
      fontSize: '16px',
      originX: 0.5,
      originY: 0,
    });
    this.overlayObjects.push(cumRow);

    y += 50;
    const btn = createOverlayButton(this.scene, cx, y, '[ Next Round ]');
    try {
      btn.setDepth(11);
    } catch {
      // Depth may not be available in headless / test environments.
    }
    btn.on('pointerdown', () => {
      this.scene.sound.play?.(SFX_KEYS.UI_CLICK);
      this.dismiss();
      this.onNextRound?.();
    });
    this.overlayObjects.push(btn);
  }

  showMatchSummary(lastRoundScore: RoundScoreResult): void {
    const transcript = this.recorder.finalize(this.session);
    autoSaveTranscript(transcriptStore, 'lost-cities', transcript, '[LostCitiesScene]');

    const overlay = createOverlayBackground(
      this.scene,
      { depth: 10, alpha: 0.85 },
      { width: 600, height: 480, alpha: 0.92 },
    );
    this.overlayObjects.push(...overlay.objects);

    const cx = GAME_W / 2;
    const topY = GAME_H / 2 - 215;

    const winnerId = getMatchWinner(this.session);
    const winnerText = winnerId === 0 ? 'You Win!' : winnerId === 1 ? 'AI Wins!' : "It's a Tie!";

    if (winnerId === 0) {
      this.scene.sound.play?.(SFX_KEYS.MATCH_WIN);
    } else {
      this.scene.sound.play?.(SFX_KEYS.MATCH_LOSE);
    }
    this.scene.time.delayedCall(600, () => {
      this.scene.sound.play?.(SFX_KEYS.SCORE_REVEAL);
    });

    const title = createLcHudText(this.scene, cx, topY, winnerText, '#f0c040', {
      fontSize: '32px',
      originX: 0.5,
      originY: 0,
    });
    this.overlayObjects.push(title);

    let y = topY + 55;

    const header = createLcHudText(this.scene, cx, y, 'Round             You     AI', '#aaaaaa', {
      fontSize: '14px',
      originX: 0.5,
      originY: 0,
    });
    this.overlayObjects.push(header);
    y += 26;

    for (let r = 0; r < this.session.roundScores.length; r++) {
      const rs = this.session.roundScores[r];
      const row = createLcHudText(this.scene, cx, y, `Round ${r + 1}${String(rs.totals[0]).padStart(14)}${String(rs.totals[1]).padStart(8)}`, '#dddddd', {
        fontSize: '14px',
        originX: 0.5,
        originY: 0,
      });
      this.overlayObjects.push(row);
      y += 22;
    }

    y += 10;
    const [cum0, cum1] = this.session.cumulativeScores;
    const totalRow = createLcHudText(this.scene, cx, y, `Final Total${String(cum0).padStart(11)}${String(cum1).padStart(8)}`, '#ffffff', {
      fontSize: '18px',
      originX: 0.5,
      originY: 0,
    });
    this.overlayObjects.push(totalRow);

    y += 40;
    const detailsTitle = createLcHudText(this.scene, cx, y, `Round ${this.session.roundNumber} Breakdown`, '#aaccaa', {
      fontSize: '14px',
      originX: 0.5,
      originY: 0,
    });
    this.overlayObjects.push(detailsTitle);
    y += 22;

    const [p0Details, p1Details] = lastRoundScore.details;
    for (const color of EXPEDITION_COLORS) {
      const p0Bd = p0Details.find(b => b.color === color);
      const p1Bd = p1Details.find(b => b.color === color);
      const p0Score = p0Bd && p0Bd.cardCount > 0 ? `${p0Bd.score}` : '-';
      const p1Score = p1Bd && p1Bd.cardCount > 0 ? `${p1Bd.score}` : '-';
      const colorName = color.charAt(0).toUpperCase() + color.slice(1);

      const row = createLcHudText(this.scene, cx, y, `${colorName.padEnd(14)}${p0Score.padStart(8)}${p1Score.padStart(8)}`, '#bbbbbb', {
        fontSize: '12px',
        originX: 0.5,
        originY: 0,
      });
      this.overlayObjects.push(row);
      y += 18;
    }

    y += 20;
    const newMatchBtn = createOverlayButton(this.scene, cx - 85, y, '[ New Match ]');
    newMatchBtn.on('pointerdown', () => {
      this.scene.sound.play?.(SFX_KEYS.UI_CLICK);
      this.dismiss();
      this.onRestart?.();
    });
    this.overlayObjects.push(newMatchBtn);

    const menuBtn = createLcMenuButton(this.scene, cx + 85, y, 60, {
      depth: 11,
    });
    this.overlayObjects.push(menuBtn);
  }
}
