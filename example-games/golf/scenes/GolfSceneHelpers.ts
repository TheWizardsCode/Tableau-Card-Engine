/**
 * GolfSceneHelpers -- overlay helpers for 9-Card Golf, using the generic OverlayManager.
 */

import type { TranscriptRecorder } from '../GameTranscript';
import { TranscriptStore, autoSaveTranscript } from '../../../src/core-engine/transcript';
import type { SoundManager, GameEventEmitter } from '../../../src/core-engine';
import { GAME_W, GAME_H, OverlayManager } from '../../../src/ui';
import { createActionButton } from '@ui/Renderer';
import {
  createGolfHudText,
  createGolfMenuButton,
} from '../../../src/ui/Renderer/adapters/GolfAdapter';
import { SFX_KEYS } from './GolfConstants';
import type { GolfSession } from '../GolfGame';

/**
 * Triggers a browser file download of the transcript JSON.
 * Creates a Blob, generates an object URL, and clicks an anchor element.
 */
function triggerTranscriptDownload(transcriptJson: string, filename: string): void {
  const blob = new Blob([transcriptJson], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export class GolfOverlayHelper {
  constructor(
    private scene: Phaser.Scene,
    private overlayManager: OverlayManager,
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
    this.overlayManager.showOverlay({
      type: 'custom',
      backgroundOptions: { depth: 10, alpha: 0.01 },
      box: { width: 520, height: 350, alpha: 0.85 },
    });

    const winnerText = results.winnerIndex === 0 ? 'You Win!' : 'AI Wins!';
    const text = createGolfHudText(
      this.scene,
      GAME_W / 2,
      GAME_H / 2 - 50,
      `${winnerText}\n\nYou: ${results.scores[0]} pts\nAI: ${results.scores[1]} pts`,
      '#ffffff',
      { fontSize: '28px', originX: 0.5, align: 'center' },
    );
    this.overlayManager.add(text);

    // Play again button
    const playBtn = createActionButton(
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
    this.overlayManager.add(playBtn);

    // Menu button
    const menuBtn = createGolfMenuButton(this.scene, GAME_W / 2 + 85, GAME_H / 2 + 85, 80, {
      depth: 11,
    });
    this.overlayManager.add(menuBtn);

    // Export Transcript button
    const exportBtn = createActionButton(
      this.scene,
      GAME_W / 2 - 90,
      GAME_H / 2 + 135,
      180,
      '[ Export Transcript ]',
      () => {
        this.soundManager?.play(SFX_KEYS.UI_CLICK);
        const json = JSON.stringify(transcript, null, 2);
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        triggerTranscriptDownload(json, `golf-transcript-${timestamp}.json`);
      },
      { depth: 11, fontSize: '13px' },
    );
    this.overlayManager.add(exportBtn);
  }

  /**
   * Show an error overlay with an Export Transcript button.
   * Triggered by window.onerror when an unhandled runtime error occurs.
   */
  showErrorExportOverlay(): void {
    this.overlayManager.showOverlay({
      type: 'custom',
      backgroundOptions: { depth: 10, alpha: 0.01 },
      box: { width: 460, height: 180, alpha: 0.85 },
    });

    const text = createGolfHudText(
      this.scene,
      GAME_W / 2,
      GAME_H / 2 - 40,
      'An error occurred during gameplay.\nExport the transcript to debug.',
      '#ff6666',
      { fontSize: '18px', originX: 0.5, align: 'center' },
    );
    this.overlayManager.add(text);

    const exportBtn = createActionButton(
      this.scene,
      GAME_W / 2 - 90,
      GAME_H / 2 + 40,
      180,
      '[ Export Transcript ]',
      () => {
        this.soundManager?.play(SFX_KEYS.UI_CLICK);
        const json = JSON.stringify(this.recorder.finalize(), null, 2);
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        triggerTranscriptDownload(json, `golf-transcript-${timestamp}.json`);
      },
      { depth: 11, fontSize: '13px' },
    );
    this.overlayManager.add(exportBtn);
  }
}
