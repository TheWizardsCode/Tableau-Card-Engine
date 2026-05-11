/**
 * SushiGoOverlayManager -- handles round score and game over overlays for Sushi Go!
 */

import { GAME_W, GAME_H, FONT_FAMILY, createOverlayBackground, createOverlayButton, createOverlayMenuButton, dismissOverlay } from '../../../src/ui';
import { scoreTableauBreakdown } from '../SushiGoScoring';
import type { SushiGoSession, RoundResult } from '../SushiGoGame';
import { getWinnerIndex } from '../SushiGoGame';
import type { SoundManager, GameEventEmitter } from '../../../src/core-engine';
import { SushiGoTranscriptRecorder } from '../GameTranscript';
import { TranscriptStore } from '../../../src/core-engine/TranscriptStore';
import { autoSaveTranscript } from '../../../src/core-engine/autoSaveTranscript';
import { SFX_KEYS } from './SushiGoConstants';

const transcriptStore = new TranscriptStore();

export class SushiGoOverlayManager {
  overlayObjects: Phaser.GameObjects.GameObject[] = [];

  constructor(
    private scene: Phaser.Scene,
    private session: SushiGoSession,
    private gameEvents: GameEventEmitter,
    private soundManager: SoundManager | null,
  ) {}

  showRoundScoreOverlay(result: RoundResult, onNextRound: () => void): void {
    this.soundManager?.play(SFX_KEYS.SCORE_REVEAL);

    const overlay = createOverlayBackground(
      this.scene,
      { depth: 10, alpha: 0.01 },
      { width: 560, height: 460, alpha: 0.9 },
    );
    this.overlayObjects.push(...overlay.objects);

    const roundNum = result.round + 1;
    const human = this.session.players[0];
    const ai = this.session.players[1];
    const humanBreak = result.tableauBreakdowns?.[0] ?? scoreTableauBreakdown(human.tableau);
    const aiBreak = result.tableauBreakdowns?.[1] ?? scoreTableauBreakdown(ai.tableau);
    const humanMakiCount = result.makiCounts ? result.makiCounts[0] : 0;
    const aiMakiCount = result.makiCounts ? result.makiCounts[1] : 0;
    const humanMakiBonus = result.makiBonuses ? result.makiBonuses[0] : 0;
    const aiMakiBonus = result.makiBonuses ? result.makiBonuses[1] : 0;

    const lines = [
      `Round ${roundNum} Complete!`,
      '',
      `You: ${result.roundScores[0]} pts`,
      `  (Tmp:${humanBreak.tempura} Ssh:${humanBreak.sashimi} Dmp:${humanBreak.dumpling} Nig:${humanBreak.nigiri})`,
      `  Maki: ${humanMakiCount} → ${humanMakiBonus >= 0 ? '+' : ''}${humanMakiBonus} pts`,
      `AI: ${result.roundScores[1]} pts`,
      `  (Tmp:${aiBreak.tempura} Ssh:${aiBreak.sashimi} Dmp:${aiBreak.dumpling} Nig:${aiBreak.nigiri})`,
      `  Maki: ${aiMakiCount} → ${aiMakiBonus >= 0 ? '+' : ''}${aiMakiBonus} pts`,
      '',
      `Total -- You: ${human.totalScore}  AI: ${ai.totalScore}`,
    ];

    const box = overlay.box;
    const padding = 24;
    let textY: number;
    let buttonY: number;
    if (box) {
      const boxTop = box.y - (box.height / 2);
      const boxBottom = box.y + (box.height / 2);
      textY = boxTop + padding;
      buttonY = boxBottom - 40;
    } else {
      textY = GAME_H / 2 - 230 + 48;
      buttonY = GAME_H / 2 + 230 - 40;
    }

    const text = this.scene.add
      .text(GAME_W / 2, textY, lines.join('\n'), {
        fontSize: '18px',
        color: '#ffffff',
        fontFamily: FONT_FAMILY,
        align: 'center',
        lineSpacing: 3,
      })
      .setOrigin(0.5, 0)
      .setDepth(11);
    this.overlayObjects.push(text);

    const btn = createOverlayButton(this.scene, GAME_W / 2, buttonY, '[ Next Round ]');
    btn.on('pointerdown', () => {
      this.soundManager?.play(SFX_KEYS.UI_CLICK);
      dismissOverlay(this.overlayObjects);
      this.overlayObjects = [];
      onNextRound();
    });
    this.overlayObjects.push(btn);
  }

  showGameOverOverlay(result: RoundResult, recorder: SushiGoTranscriptRecorder | null, onRestart: () => void): void {
    this.soundManager?.play(SFX_KEYS.SCORE_REVEAL);

    const winnerIdx = getWinnerIndex(this.session);

    if (recorder && !recorder.isSealed()) {
      const transcript = recorder.finalize(winnerIdx);
      autoSaveTranscript(transcriptStore, 'sushi-go', transcript, '[SushiGoScene]');
    }

    this.gameEvents.emit('game-ended', {
      finalTurnNumber: this.session.currentTurn,
      winnerIndex: winnerIdx,
    });

    const overlay = createOverlayBackground(
      this.scene,
      { depth: 10, alpha: 0.01 },
      { width: 560, height: 520, alpha: 0.9 },
    );
    this.overlayObjects.push(...overlay.objects);

    const winnerText = winnerIdx === 0 ? 'You Win!' : 'AI Wins!';
    const human = this.session.players[0];
    const ai = this.session.players[1];
    const humanBreak = scoreTableauBreakdown(human.tableau);
    const aiBreak = scoreTableauBreakdown(ai.tableau);
    const humanMakiCount = result.makiCounts ? result.makiCounts[0] : 0;
    const aiMakiCount = result.makiCounts ? result.makiCounts[1] : 0;
    const humanMakiBonus = result.makiBonuses ? result.makiBonuses[0] : 0;
    const aiMakiBonus = result.makiBonuses ? result.makiBonuses[1] : 0;
    const humanPuddingBonus = result.puddingBonuses ? result.puddingBonuses[0] : 0;
    const aiPuddingBonus = result.puddingBonuses ? result.puddingBonuses[1] : 0;

    const lines = [
      winnerText,
      '',
      `Final Round -- You: ${result.roundScores[0]}, AI: ${result.roundScores[1]}`,
      '',
      'Breakdown (this round):',
      `You:  Cards ${humanBreak.tempura + humanBreak.sashimi + humanBreak.dumpling + humanBreak.nigiri} ` +
        `(Tmp:${humanBreak.tempura} Ssh:${humanBreak.sashimi} Dmp:${humanBreak.dumpling} Nig:${humanBreak.nigiri})`,
      `      Maki: ${humanMakiCount} (bonus ${humanMakiBonus >= 0 ? '+' : ''}${humanMakiBonus})`,
      `      Pudding: ${humanBreak.puddingCount} (bonus ${humanPuddingBonus >= 0 ? '+' : ''}${humanPuddingBonus})`,
      '',
      `AI:   Cards ${aiBreak.tempura + aiBreak.sashimi + aiBreak.dumpling + aiBreak.nigiri} ` +
        `(Tmp:${aiBreak.tempura} Ssh:${aiBreak.sashimi} Dmp:${aiBreak.dumpling} Nig:${aiBreak.nigiri})`,
      `      Maki: ${aiMakiCount} (bonus ${aiMakiBonus >= 0 ? '+' : ''}${aiMakiBonus})`,
      `      Pudding: ${aiBreak.puddingCount} (bonus ${aiPuddingBonus >= 0 ? '+' : ''}${aiPuddingBonus})`,
      '',
      'Round-by-round:',
    ];

    for (let r = 0; r < human.roundScores.length; r++) {
      lines.push(`  R${r + 1}: You ${human.roundScores[r]} -- AI ${ai.roundScores[r]}`);
    }
    lines.push('', `Final: You ${human.totalScore} -- AI ${ai.totalScore}`);

    const box = overlay.box;
    const padding = 24;
    let gTextY: number;
    let gButtonY: number;
    if (box) {
      const boxTop = box.y - (box.height / 2);
      const boxBottom = box.y + (box.height / 2);
      gTextY = boxTop + padding;
      gButtonY = boxBottom - 48;
    } else {
      gTextY = GAME_H / 2 - 260 + 56;
      gButtonY = GAME_H / 2 + 260 - 48;
    }

    const text = this.scene.add
      .text(GAME_W / 2, gTextY, lines.join('\n'), {
        fontSize: '18px',
        color: '#ffffff',
        fontFamily: FONT_FAMILY,
        align: 'center',
        lineSpacing: 3,
      })
      .setOrigin(0.5, 0)
      .setDepth(11);
    this.overlayObjects.push(text);

    const playBtn = createOverlayButton(this.scene, GAME_W / 2 - 80, gButtonY, '[ Play Again ]');
    playBtn.on('pointerdown', () => {
      this.soundManager?.play(SFX_KEYS.UI_CLICK);
      onRestart();
    });
    this.overlayObjects.push(playBtn);

    const menuBtn = createOverlayMenuButton(this.scene, GAME_W / 2 + 80, gButtonY);
    this.overlayObjects.push(menuBtn);
  }

  dismiss(): void {
    dismissOverlay(this.overlayObjects);
    this.overlayObjects = [];
  }
}
