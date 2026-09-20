/**
 * ColorettoAiScheduler — AI turn scheduling for Coloretto.
 *
 * Responsible for:
 *  - Building and holding the per-player AI instances (null for humans)
 *  - Scheduling AI turns with a delayed call (reduced-motion aware)
 *  - Setting the `ai-thinking` phase while the AI decides
 *
 * Module map (scene → helper):
 *   ColorettoRenderer      → rows, deck, collections, card faces, layout
 *   ColorettoInputHandler  → row click zones, mode buttons, ESC toggle
 *   ColorettoAiScheduler   → AI turn scheduling
 */

import Phaser from 'phaser';
import type { ColorettoSession, ColorettoAction } from '../ColorettoGame';
import { ColorettoAiPlayer, HeuristicStrategy } from '../ColorettoAis';

// ── Public types ───────────────────────────────────────────

/** Callback invoked with the chosen AI action for dispatch. */
export type AiActionDispatch = (playerIndex: number, action: ColorettoAction) => void;

/**
 * Owns the AI players and the delayed AI-turn sequence: sets the
 * `ai-thinking` phase, waits a human-visible delay, chooses an action via
 * the player's strategy, then hands it back to the scene for execution.
 */
export class ColorettoAiScheduler {
  /** Per-player AI instances (null for human players). */
  aiPlayers: (ColorettoAiPlayer | null)[] = [];

  private scene: Phaser.Scene;
  private session: ColorettoSession;
  private setPhase: (phase: string) => void;
  private getReducedMotion: () => boolean;

  /**
   * @param scene            — The Phaser scene (for delayedCall).
   * @param session          — The game session (updated by the scene each game).
   * @param setPhase         — Sets the scene's phase manager phase.
   * @param getReducedMotion — Whether reduced motion is enabled.
   */
  constructor(
    scene: Phaser.Scene,
    session: ColorettoSession,
    setPhase: (phase: string) => void,
    getReducedMotion: () => boolean,
  ) {
    this.scene = scene;
    this.session = session;
    this.setPhase = setPhase;
    this.getReducedMotion = getReducedMotion;
    this.rebuildPlayers();
  }

  /** (Re)build the per-player AI instances for the current session. */
  rebuildPlayers(): void {
    this.aiPlayers = buildAiPlayers(this.session);
  }

  /**
   * Schedule the AI player's turn: enter `ai-thinking`, wait the display
   * delay, choose an action, and dispatch it for execution.
   *
   * @param playerIndex — Index of the AI player whose turn it is.
   * @param onAction    — Receives (playerIndex, action) once chosen.
   */
  scheduleAITurn(playerIndex: number, onAction: AiActionDispatch): void {
    this.setPhase('ai-thinking');
    const delay = this.getReducedMotion() ? 150 : 750;
    this.scene.time.delayedCall(delay, () => {
      const ai = this.aiPlayers[playerIndex];
      if (!ai) return;
      const action = ai.chooseAction(this.session, playerIndex);
      onAction(playerIndex, action);
    });
  }
}

/** Build one AI player per AI-controlled session player (null for humans). */
function buildAiPlayers(session: ColorettoSession): (ColorettoAiPlayer | null)[] {
  return session.players.map((p) =>
    p.isAI ? new ColorettoAiPlayer(HeuristicStrategy) : null,
  );
}