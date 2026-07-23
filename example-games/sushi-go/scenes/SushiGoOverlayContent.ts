/**
 * SushiGoOverlayContent -- handles round score and game over overlays for Sushi Go!
 */

import {
  GAME_W,
  GAME_H,
  FONT_FAMILY,
  OverlayManager,
} from '../../../src/ui';
import { createActionButton } from '@ui/Renderer';

import { scoreTableauBreakdown } from '../SushiGoScoring';
import type { SushiGoSession, RoundResult } from '../SushiGoGame';
import { getWinnerIndex } from '../SushiGoGame';
import type { SoundManager, GameEventEmitter } from '../../../src/core-engine';
import { SushiGoTranscriptRecorder } from '../GameTranscript';
import { TranscriptStore, autoSaveTranscript } from '../../../src/core-engine/transcript';
import { SFX_KEYS } from './SushiGoConstants';

const transcriptStore = new TranscriptStore();

export class SushiGoOverlayContent {
  private readonly overlayManager: OverlayManager;

  get overlayObjects(): Phaser.GameObjects.GameObject[] {
    return this.overlayManager.objects;
  }

  constructor(
    private scene: Phaser.Scene,
    private session: SushiGoSession,
    private gameEvents: GameEventEmitter,
    private soundManager: SoundManager | null,
  ) {
    this.overlayManager = new OverlayManager(scene);
  }

  showRoundScoreOverlay(result: RoundResult, onNextRound: () => void): void {
    this.soundManager?.play(SFX_KEYS.SCORE_REVEAL);

    const overlay = this.overlayManager.showOverlay({
      type: 'custom',
      backgroundOptions: { depth: 10, alpha: 0.01 },
      box: { width: 560, height: 460, alpha: 0.9 },
    });

    const roundNum = result.round + 1;
    const human = this.session.players[0];
    const ai = this.session.players[1];
    const humanBreak = result.tableauBreakdowns?.[0] ?? scoreTableauBreakdown(human.tableau);
    const aiBreak = result.tableauBreakdowns?.[1] ?? scoreTableauBreakdown(ai.tableau);
    const humanMakiCount = result.makiCounts ? result.makiCounts[0] : 0;
    const aiMakiCount = result.makiCounts ? result.makiCounts[1] : 0;
    const humanMakiBonus = result.makiBonuses ? result.makiBonuses[0] : 0;
    const aiMakiBonus = result.makiBonuses ? result.makiBonuses[1] : 0;

    const computeDisplayedTotal = (idx: number) => {
      const roundsSum = this.session.players[idx].roundScores.reduce((a, b) => a + b, 0);
      const pudding = result.puddingBonuses ? result.puddingBonuses[idx] : 0;
      return roundsSum + pudding;
    };

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
      `Total -- You: ${computeDisplayedTotal(0)}  AI: ${computeDisplayedTotal(1)}`,
    ];

    const { textY, buttonY } = this.resolveOverlayAnchors(overlay.box, {
      fallbackTextY: GAME_H / 2 - 230 + 48,
      fallbackButtonY: GAME_H / 2 + 230 - 40,
      padding: 24,
      buttonInset: 40,
    });

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
    this.overlayManager.add(text);

    const btn = createActionButton(
      this.scene,
      GAME_W / 2 - 100,
      buttonY - 16,
      200,
      'Next Round',
      () => {
        this.soundManager?.play(SFX_KEYS.UI_CLICK);
        this.overlayManager.dismiss();
        onNextRound();
      },
      { depth: 11 },
    );
    this.overlayManager.add(btn);
  }

  showGameOverOverlay(
    result: RoundResult,
    recorder: SushiGoTranscriptRecorder | null,
    onRestart: () => void,
  ): void {
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

    const overlay = this.overlayManager.showOverlay({
      type: 'custom',
      backgroundOptions: { depth: 10, alpha: 0.01 },
      box: { width: 560, height: 520, alpha: 0.9 },
    });

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

    const computeDisplayedTotal = (idx: number) => {
      const roundsSum = this.session.players[idx].roundScores.reduce((a, b) => a + b, 0);
      const pudding = result.puddingBonuses ? result.puddingBonuses[idx] : 0;
      return roundsSum + pudding;
    };

    const lines = [
      winnerText,
      '',
      `Final Round -- You: ${result.roundScores[0]}, AI: ${result.roundScores[1]}`,
      '',
      'Breakdown (this round):',
      `You:  Cards ${humanBreak.tempura + humanBreak.sashimi + humanBreak.dumpling + humanBreak.nigiri} ` +
        `(Tmp:${humanBreak.tempura} Ssh:${humanBreak.sashimi} Dmp:${humanBreak.dumpling} Nig:${humanBreak.nigiri})`,
      `      Maki: ${humanMakiCount} (bonus ${humanMakiBonus >= 0 ? '+' : ''}${humanMakiBonus})`,
      '',
      `AI:   Cards ${aiBreak.tempura + aiBreak.sashimi + aiBreak.dumpling + aiBreak.nigiri} ` +
        `(Tmp:${aiBreak.tempura} Ssh:${aiBreak.sashimi} Dmp:${aiBreak.dumpling} Nig:${aiBreak.nigiri})`,
      `      Maki: ${aiMakiCount} (bonus ${aiMakiBonus >= 0 ? '+' : ''}${aiMakiBonus})`,
      '',
      'Round-by-round:',
    ];

    for (let r = 0; r < human.roundScores.length; r++) {
      lines.push(`  R${r + 1}: You ${human.roundScores[r]} -- AI ${ai.roundScores[r]}`);
    }

    // If pudding bonuses were computed at game end, surface them explicitly
    // in the round-by-round section so the per-round lines remain pure round
    // scores and the pudding adjustment is visible in context.
    if (result.puddingBonuses) {
      lines.push(
        `  Pudding Bonus: You ${humanPuddingBonus >= 0 ? '+' : ''}${humanPuddingBonus} ` +
          `-- AI ${aiPuddingBonus >= 0 ? '+' : ''}${aiPuddingBonus}`,
      );
    }

    lines.push('', `Final: You ${computeDisplayedTotal(0)} -- AI ${computeDisplayedTotal(1)}`);

    const { textY, buttonY } = this.resolveOverlayAnchors(overlay.box, {
      fallbackTextY: GAME_H / 2 - 260 + 56,
      fallbackButtonY: GAME_H / 2 + 260 - 48,
      padding: 24,
      buttonInset: 48,
    });

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
    this.overlayManager.add(text);

    const playBtn = createActionButton(
      this.scene,
      GAME_W / 2 - 130,
      buttonY - 16,
      100,
      'Play Again',
      () => {
        this.soundManager?.play(SFX_KEYS.UI_CLICK);
        onRestart();
      },
      { depth: 11 },
    );
    this.overlayManager.add(playBtn);

    const menuBtn = createActionButton(
      this.scene,
      GAME_W / 2 + 30,
      buttonY - 16,
      100,
      'Menu',
      () => {
        this.soundManager?.play(SFX_KEYS.UI_CLICK);
        this.overlayManager.dismiss();
        this.scene.scene.start('GameSelectorScene');
      },
      { depth: 11 },
    );
    this.overlayManager.add(menuBtn);
  }

  private resolveOverlayAnchors(
    box: Phaser.GameObjects.Rectangle | null,
    options: {
      fallbackTextY: number;
      fallbackButtonY: number;
      padding: number;
      buttonInset: number;
    },
  ): { textY: number; buttonY: number } {
    if (!box) {
      return {
        textY: options.fallbackTextY,
        buttonY: options.fallbackButtonY,
      };
    }

    const boxTop = box.y - (box.height / 2);
    const boxBottom = box.y + (box.height / 2);
    return {
      textY: boxTop + options.padding,
      buttonY: boxBottom - options.buttonInset,
    };
  }

  dismiss(): void {
    this.overlayManager.dismiss();
  }
}
