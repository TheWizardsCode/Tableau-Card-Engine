/**
 * GolfOverlayManager -- handles end-of-game overlay and related UI for 9-Card Golf.
 */


import type { TranscriptRecorder } from '../GameTranscript';
import { TranscriptStore, autoSaveTranscript } from '../../../src/core-engine/transcript';
import type { SoundManager, GameEventEmitter } from '../../../src/core-engine';
import { GAME_W, GAME_H } from '../../../src/ui';
import {
  createActionButton,
  createGolfHudText,
  createGolfMenuButton,
  createOverlayBackground,
} from '../../../src/ui/Renderer/adapters/GolfAdapter';
import { SFX_KEYS } from './GolfConstants';
import type { GolfSession } from '../GolfGame';

export class GolfOverlayManager {
  constructor(
    private scene: Phaser.Scene,
    private session: GolfSession,
    private recorder: TranscriptRecorder,
    private gameEvents: GameEventEmitter,
    private soundManager: SoundManager | null,
  ) {}

  showEndScreen(
    refreshGrid: (player: 'human' | 'ai') => void,
    refreshScores: () => void,
  ): void {
    // Reveal all cards
    for (let p = 0; p < 2; p++) {
      const grid = this.session.gameState.playerStates[p].grid;
      for (let i = 0; i < 9; i++) {
        grid[i].faceUp = true;
      }
    }
    refreshGrid('human');
    refreshGrid('ai');
    refreshScores();

    const transcript = this.recorder.finalize();
    const results = transcript.results!;

    // Auto-save transcript to browser storage
    const transcriptStore = new TranscriptStore();
    autoSaveTranscript(transcriptStore, 'golf', transcript, '[GolfScene]');

    // Play score-reveal sound directly (not event-mapped)
    this.soundManager?.play(SFX_KEYS.SCORE_REVEAL);

    // Emit game-ended event
    const winnerIdx = results.winnerIndex;
    const winnerName = this.session.gameState.players[winnerIdx].name;
    this.gameEvents.emit('game-ended', {
      finalTurnNumber: this.session.gameState.turnNumber,
      winnerIndex: winnerIdx,
      reason: `${winnerName} wins (${results.scores[winnerIdx]} pts)`,
    });

    // Overlay -- near-invisible blocker + visible box
    createOverlayBackground(
      this.scene,
      { depth: 10, alpha: 0.01 },
      { width: 520, height: 300, alpha: 0.85 },
    );

    const winnerText = results.winnerIndex === 0 ? 'You Win!' : 'AI Wins!';
    createGolfHudText(
      this.scene,
      GAME_W / 2,
      GAME_H / 2 - 50,
      `${winnerText}\n\nYou: ${results.scores[0]} pts\nAI: ${results.scores[1]} pts`,
      '#ffffff',
      { fontSize: '28px', originX: 0.5, align: 'center' },
    );

    // Play again button
    createActionButton(
      this.scene,
      GAME_W / 2 - 85,
      GAME_H / 2 + 85,
      170,
      '[ Play Again ]',
      () => {
        this.soundManager?.play(SFX_KEYS.UI_CLICK);
        this.gameEvents.emit('ui-interaction', {
          elementId: 'play-again',
          action: 'click',
        });
        this.scene.scene.restart();
      },
      { depth: 11 },
    );

    // Menu button
    createGolfMenuButton(this.scene, GAME_W / 2 + 85, GAME_H / 2 + 85, 80, {
      depth: 11,
    });
  }
}
