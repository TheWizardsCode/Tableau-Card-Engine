import { describe, it, expect } from 'vitest';

import { deal, applyMove, getLegalMoves, hasNoMoves, hasValuableMoves } from '../../example-games/beleaguered-castle/BeleagueredCastleRules';
import { BCTranscriptRecorder } from '../../example-games/beleaguered-castle/GameTranscript';
import { BeleagueredCastleTurnController } from '../../example-games/beleaguered-castle/scenes/BeleagueredCastleTurnController';
import type { BCMove } from '../../example-games/beleaguered-castle/BeleagueredCastleState';

describe('BeleagueredCastleTurnController', () => {
  it('executePlayerMove does not emit game-end callback for non-terminal states', () => {
    const state = deal(723);
    const recorder = new BCTranscriptRecorder(723, state);
    const openingMove: BCMove = { kind: 'tableau-to-tableau', fromCol: 3, toCol: 5 };

    let gameEndSignals = 0;
    const controller = new BeleagueredCastleTurnController(state, recorder, {
      onRefresh: () => {},
      onCheckGameEnd: () => { gameEndSignals++; },
      onAutoCompleteVisual: () => {},
      onAutoCompleteDone: () => {},
      onSoundEvent: () => {},
    });

    controller.executePlayerMove(openingMove);

    expect(controller.gameEnded).toBe(false);
    expect(gameEndSignals).toBe(0);
  });

  it('does not end the game while legal moves still exist', () => {
    const state = deal(723);
    const recorder = new BCTranscriptRecorder(723, state);

    // Repro state found during debugging: after this move the current
    // one-ply hasValuableMoves heuristic returns false, but legal moves remain.
    const openingMove: BCMove = { kind: 'tableau-to-tableau', fromCol: 3, toCol: 5 };
    applyMove(state, openingMove);

    expect(hasNoMoves(state)).toBe(false);
    expect(getLegalMoves(state).length).toBeGreaterThan(0);
    expect(hasValuableMoves(state)).toBe(false);

    const controller = new BeleagueredCastleTurnController(state, recorder, {
      onRefresh: () => {},
      onCheckGameEnd: () => {},
      onAutoCompleteVisual: () => {},
      onAutoCompleteDone: () => {},
      onSoundEvent: () => {},
    });

    controller.checkGameEnd();

    // Even if heuristic says no valuable moves, a game with legal moves
    // should not hard-end as loss.
    expect(controller.gameEnded).toBe(false);
  });
});
