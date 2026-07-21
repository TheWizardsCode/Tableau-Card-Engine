/**
 * LostCitiesOverlays -- round and match summary overlay helpers, using generic OverlayManager.
 */
import Phaser from 'phaser';
import { EXPEDITION_COLORS } from '../LostCitiesCards';
import type { LostCitiesSession, RoundScoreResult } from '../LostCitiesGame';
import { getMatchWinner, startNextRound } from '../LostCitiesGame';
import { autoSaveTranscript, TranscriptStore } from '../../../src/core-engine/transcript';
import { GAME_W, GAME_H, OverlayManager } from '../../../src/ui';
import {
  createLcHudText,
  createActionButton,
} from '../../../src/ui/Renderer/adapters/LostCitiesAdapter';
import { SFX_KEYS } from './LostCitiesConstants';
import type { LCTranscriptRecorder } from '../GameTranscript';

const transcriptStore = new TranscriptStore();

// ── Column layout constants ──────────────────────────────────────
// Fixed pixel offsets relative to screen center (cx = GAME_W / 2 = 640)
// These are chosen to fit within the 600px-wide overlay box centered at cx=640.
const COL_LABEL_X_OFFSET = -230;  // Left-aligned label column (color name, round, etc.)
const COL_P0_X_OFFSET = -20;      // Right-aligned Player 0 score column
const COL_P1_X_OFFSET = 160;      // Right-aligned Player 1 score column

export class LostCitiesOverlayHelper {
  constructor(
    private scene: Phaser.Scene,
    private overlayManager: OverlayManager,
    private session: LostCitiesSession,
    private recorder: LCTranscriptRecorder,
    private onNextRound?: () => void,
    private onRestart?: () => void,
  ) {}

  dismiss(): void {
    this.overlayManager.dismiss();
  }

  showRoundSummary(roundScore: RoundScoreResult): void {
    // Gracefully handle missing audio — the overlay must appear even if
    // sounds failed to load (browser test, audio policy, or preload issue).
    try { this.scene.sound.play?.(SFX_KEYS.ROUND_END); } catch { /* ignore */ }
    this.scene.time.delayedCall(400, () => {
      try { this.scene.sound.play?.(SFX_KEYS.SCORE_REVEAL); } catch { /* ignore */ }
    });

    this.overlayManager.showOverlay({
      type: 'custom',
      backgroundOptions: { depth: 10, alpha: 0.8 },
      box: { width: 600, height: 450, alpha: 0.92 },
    });

    const cx = GAME_W / 2;
    const topY = GAME_H / 2 - 200;

    // roundNumber is already 1-based and is NOT incremented before the overlay
    // is rendered — advanceMatch/startNextRound happens *after* the overlay is
    // dismissed (the 'round-over' pause phase preserves round-final state).
    // Using roundNumber directly (not roundNumber - 1) gives the correct display.
    const title = createLcHudText(this.scene, cx, topY, `Round ${this.session.roundNumber} Complete`, '#f0c040', {
      fontSize: '28px',
      originX: 0.5,
      originY: 0,
    });
    this.overlayManager.add(title);

    const [p0Details, p1Details] = roundScore.details;
    const [p0Total, p1Total] = roundScore.totals;

    let y = topY + 50;

    const hdrColor = createLcHudText(this.scene, cx + COL_LABEL_X_OFFSET, y, 'Color', '#aaaaaa', { fontSize: '14px', originX: 0, originY: 0 });
    const hdrYou = createLcHudText(this.scene, cx + COL_P0_X_OFFSET, y, 'You', '#aaaaaa', { fontSize: '14px', originX: 1, originY: 0 });
    const hdrAi = createLcHudText(this.scene, cx + COL_P1_X_OFFSET, y, 'AI', '#aaaaaa', { fontSize: '14px', originX: 1, originY: 0 });
    this.overlayManager.add(hdrColor);
    this.overlayManager.add(hdrYou);
    this.overlayManager.add(hdrAi);
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

      const lbl = createLcHudText(this.scene, cx + COL_LABEL_X_OFFSET, y, colorName, '#dddddd', { fontSize: '14px', originX: 0, originY: 0 });
      const p0Txt = createLcHudText(this.scene, cx + COL_P0_X_OFFSET, y, p0Str, '#dddddd', { fontSize: '14px', originX: 1, originY: 0 });
      const p1Txt = createLcHudText(this.scene, cx + COL_P1_X_OFFSET, y, p1Str, '#dddddd', { fontSize: '14px', originX: 1, originY: 0 });
      this.overlayManager.add(lbl);
      this.overlayManager.add(p0Txt);
      this.overlayManager.add(p1Txt);
      y += 22;
    }

    y += 8;
    const totalLbl = createLcHudText(this.scene, cx + COL_LABEL_X_OFFSET, y, 'Round Total', '#ffffff', { fontSize: '16px', originX: 0, originY: 0 });
    const totalP0 = createLcHudText(this.scene, cx + COL_P0_X_OFFSET, y, String(p0Total), '#ffffff', { fontSize: '16px', originX: 1, originY: 0 });
    const totalP1 = createLcHudText(this.scene, cx + COL_P1_X_OFFSET, y, String(p1Total), '#ffffff', { fontSize: '16px', originX: 1, originY: 0 });
    this.overlayManager.add(totalLbl);
    this.overlayManager.add(totalP0);
    this.overlayManager.add(totalP1);

    y += 30;
    const [cum0, cum1] = this.session.cumulativeScores;
    const cumLbl = createLcHudText(this.scene, cx + COL_LABEL_X_OFFSET, y, 'Cumulative', '#f0c040', { fontSize: '16px', originX: 0, originY: 0 });
    const cumP0 = createLcHudText(this.scene, cx + COL_P0_X_OFFSET, y, String(cum0), '#f0c040', { fontSize: '16px', originX: 1, originY: 0 });
    const cumP1 = createLcHudText(this.scene, cx + COL_P1_X_OFFSET, y, String(cum1), '#f0c040', { fontSize: '16px', originX: 1, originY: 0 });
    this.overlayManager.add(cumLbl);
    this.overlayManager.add(cumP0);
    this.overlayManager.add(cumP1);

    y += 50;
    const btn = createActionButton(this.scene, cx - 75, y, 150, '[ Next Round ]', () => {
      try { this.scene.sound.play?.(SFX_KEYS.UI_CLICK); } catch { /* ignore */ }
      this.dismiss();
      // Advance to the next round now that the overlay is dismissed.
      // (executeAction no longer calls advanceMatch automatically —
      // the 'round-over' pause phase allows the overlay to render
      // with the correct round-final state.)
      startNextRound(this.session);
      this.onNextRound?.();
    }, { depth: 11 });
    this.overlayManager.add(btn);
  }

  showMatchSummary(lastRoundScore: RoundScoreResult): void {
    const transcript = this.recorder.finalize(this.session);
    autoSaveTranscript(transcriptStore, 'lost-cities', transcript, '[LostCitiesScene]');

    this.overlayManager.showOverlay({
      type: 'custom',
      backgroundOptions: { depth: 10, alpha: 0.85 },
      box: { width: 600, height: 480, alpha: 0.92 },
    });

    const cx = GAME_W / 2;
    const topY = GAME_H / 2 - 215;

    const winnerId = getMatchWinner(this.session);
    const winnerText = winnerId === 0 ? 'You Win!' : winnerId === 1 ? 'AI Wins!' : "It's a Tie!";

    try {
      if (winnerId === 0) {
        this.scene.sound.play?.(SFX_KEYS.MATCH_WIN);
      } else {
        this.scene.sound.play?.(SFX_KEYS.MATCH_LOSE);
      }
    } catch { /* ignore missing audio */ }
    this.scene.time.delayedCall(600, () => {
      try { this.scene.sound.play?.(SFX_KEYS.SCORE_REVEAL); } catch { /* ignore */ }
    });

    const title = createLcHudText(this.scene, cx, topY, winnerText, '#f0c040', {
      fontSize: '32px',
      originX: 0.5,
      originY: 0,
    });
    this.overlayManager.add(title);

    let y = topY + 55;

    const hdrRound = createLcHudText(this.scene, cx + COL_LABEL_X_OFFSET, y, 'Round', '#aaaaaa', { fontSize: '14px', originX: 0, originY: 0 });
    const hdrYou2 = createLcHudText(this.scene, cx + COL_P0_X_OFFSET, y, 'You', '#aaaaaa', { fontSize: '14px', originX: 1, originY: 0 });
    const hdrAi2 = createLcHudText(this.scene, cx + COL_P1_X_OFFSET, y, 'AI', '#aaaaaa', { fontSize: '14px', originX: 1, originY: 0 });
    this.overlayManager.add(hdrRound);
    this.overlayManager.add(hdrYou2);
    this.overlayManager.add(hdrAi2);
    y += 26;

    for (let r = 0; r < this.session.roundScores.length; r++) {
      const rs = this.session.roundScores[r];
      const roundLbl = createLcHudText(this.scene, cx + COL_LABEL_X_OFFSET, y, `Round ${r + 1}`, '#dddddd', { fontSize: '14px', originX: 0, originY: 0 });
      const roundP0 = createLcHudText(this.scene, cx + COL_P0_X_OFFSET, y, String(rs.totals[0]), '#dddddd', { fontSize: '14px', originX: 1, originY: 0 });
      const roundP1 = createLcHudText(this.scene, cx + COL_P1_X_OFFSET, y, String(rs.totals[1]), '#dddddd', { fontSize: '14px', originX: 1, originY: 0 });
      this.overlayManager.add(roundLbl);
      this.overlayManager.add(roundP0);
      this.overlayManager.add(roundP1);
      y += 22;
    }

    y += 10;
    const [cum0, cum1] = this.session.cumulativeScores;
    const finalLbl = createLcHudText(this.scene, cx + COL_LABEL_X_OFFSET, y, 'Final Total', '#ffffff', { fontSize: '18px', originX: 0, originY: 0 });
    const finalP0 = createLcHudText(this.scene, cx + COL_P0_X_OFFSET, y, String(cum0), '#ffffff', { fontSize: '18px', originX: 1, originY: 0 });
    const finalP1 = createLcHudText(this.scene, cx + COL_P1_X_OFFSET, y, String(cum1), '#ffffff', { fontSize: '18px', originX: 1, originY: 0 });
    this.overlayManager.add(finalLbl);
    this.overlayManager.add(finalP0);
    this.overlayManager.add(finalP1);

    y += 40;
    const detailsTitle = createLcHudText(this.scene, cx, y, `Round ${this.session.roundNumber} Breakdown`, '#aaccaa', {
      fontSize: '14px',
      originX: 0.5,
      originY: 0,
    });
    this.overlayManager.add(detailsTitle);
    y += 22;

    const [p0Details, p1Details] = lastRoundScore.details;
    for (const color of EXPEDITION_COLORS) {
      const p0Bd = p0Details.find(b => b.color === color);
      const p1Bd = p1Details.find(b => b.color === color);
      const p0Score = p0Bd && p0Bd.cardCount > 0 ? `${p0Bd.score}` : '-';
      const p1Score = p1Bd && p1Bd.cardCount > 0 ? `${p1Bd.score}` : '-';
      const colorName = color.charAt(0).toUpperCase() + color.slice(1);

      const brkLbl = createLcHudText(this.scene, cx + COL_LABEL_X_OFFSET, y, colorName, '#bbbbbb', { fontSize: '12px', originX: 0, originY: 0 });
      const brkP0 = createLcHudText(this.scene, cx + COL_P0_X_OFFSET, y, p0Score, '#bbbbbb', { fontSize: '12px', originX: 1, originY: 0 });
      const brkP1 = createLcHudText(this.scene, cx + COL_P1_X_OFFSET, y, p1Score, '#bbbbbb', { fontSize: '12px', originX: 1, originY: 0 });
      this.overlayManager.add(brkLbl);
      this.overlayManager.add(brkP0);
      this.overlayManager.add(brkP1);
      y += 18;
    }

    y += 20;
    const newMatchBtn = createActionButton(this.scene, cx - 150, y, 120, '[ New Match ]', () => {
      try { this.scene.sound.play?.(SFX_KEYS.UI_CLICK); } catch { /* ignore */ }
      this.dismiss();
      this.onRestart?.();
    }, { depth: 11 });
    this.overlayManager.add(newMatchBtn);

    const menuBtn = createActionButton(this.scene, cx + 30, y, 120, '[ Menu ]', () => {
      try { this.scene.sound.play?.(SFX_KEYS.UI_CLICK); } catch { /* ignore */ }
      this.dismiss();
      this.scene.scene.start('GameSelectorScene');
    }, { depth: 11 });
    this.overlayManager.add(menuBtn);
  }
}
