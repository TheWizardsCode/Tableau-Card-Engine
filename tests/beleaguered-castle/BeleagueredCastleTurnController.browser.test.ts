import { describe, it, expect } from 'vitest';

import { deal, applyMove, getLegalMoves, hasNoMoves, hasValuableMoves } from '../../example-games/beleaguered-castle/BeleagueredCastleRules';
import { BCTranscriptRecorder } from '../../example-games/beleaguered-castle/GameTranscript';
import { BeleagueredCastleTurnController } from '../../example-games/beleaguered-castle/scenes/BeleagueredCastleTurnController';
import type { BCMove } from '../../example-games/beleaguered-castle/BeleagueredCastleState';

describe('BeleagueredCastleTurnController', () => {
  it('executePlayerMove does not emit game-end callback for states with valuable moves', () => {
    const openingMove: BCMove = { kind: 'tableau-to-tableau', fromCol: 0, toCol: 2 };

    const precheckState = deal(1);
    applyMove(precheckState, openingMove);
    expect(hasNoMoves(precheckState)).toBe(false);
    expect(hasValuableMoves(precheckState)).toBe(true);

    const state = deal(1);
    const recorder = new BCTranscriptRecorder(1, state);

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

  it('ends the game when no valuable moves remain (even if legal moves exist)', () => {
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

    expect(getLegalMoves(state).length).toBeGreaterThan(0);
    expect(hasNoMoves(state)).toBe(false);
    expect(hasValuableMoves(state)).toBe(false);
    expect(controller.gameEnded).toBe(true);
    expect(gameEndSignals).toBe(1);
  });
});
