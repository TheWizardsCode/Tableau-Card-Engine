import { describe, it, expect } from 'vitest';
import { Pile } from '../../src/card-system/Pile';
import { createCard } from '../../src/card-system/Card';
import { deal, applyMove, getLegalMoves, hasNoMoves, hasValuableMoves, isTriviallyWinnable, getAutoCompleteMoves } from '../../example-games/beleaguered-castle/BeleagueredCastleRules';
import { BCTranscriptRecorder } from '../../example-games/beleaguered-castle/GameTranscript';
import { BeleagueredCastleTurnController } from '../../example-games/beleaguered-castle/scenes/BeleagueredCastleTurnController';
import type { BCMove, BeleagueredCastleState } from '../../example-games/beleaguered-castle/BeleagueredCastleState';
import { FOUNDATION_SUITS } from '../../example-games/beleaguered-castle/BeleagueredCastleState';

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
    const state = deal(11);
    const recorder = new BCTranscriptRecorder(11, state);
    const openingMove: BCMove = { kind: 'tableau-to-tableau', fromCol: 0, toCol: 3 };

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

  // ── Safe auto-move visual playback ──────────────────────────

  it('calls onAutoCompleteVisual with isSafeAutoMove=true when player move triggers safe auto-moves', () => {
    // Seed 5, moving column 1 to foundation 0 triggers a safe auto-move from column 4 to foundation 3
    const testMove: BCMove = { kind: 'tableau-to-foundation', fromCol: 1, toFoundation: 0 };
    const state = deal(5);
    const recorder = new BCTranscriptRecorder(5, state);

    let capturedMoves: BCMove[] | null = null;
    let capturedIsSafe: boolean | undefined = undefined;
    let autoVisualCalled = false;

    const controller = new BeleagueredCastleTurnController(state, recorder, {
      onRefresh: () => {},
      onCheckGameEnd: () => {},
      onAutoCompleteVisual: (moves, _moveCards, isSafeAutoMove) => {
        autoVisualCalled = true;
        capturedMoves = moves;
        capturedIsSafe = isSafeAutoMove;
      },
      onAutoCompleteDone: () => {},
      onSoundEvent: () => {},
    });

    controller.executePlayerMove(testMove);

    expect(autoVisualCalled).toBe(true);
    expect(capturedMoves).not.toBeNull();
    expect(capturedMoves!.length).toBeGreaterThan(0);
    expect(capturedMoves![0].kind).toBe('tableau-to-foundation');
    expect(capturedIsSafe).toBe(true);
  });

  it('does not call onAutoCompleteVisual when player move does not trigger safe auto-moves', () => {
    // Seed 4, moving column 4 to column 1 does not trigger any safe auto-moves
    const testMove: BCMove = { kind: 'tableau-to-tableau', fromCol: 4, toCol: 1 };
    const state = deal(4);
    const recorder = new BCTranscriptRecorder(1, state);

    let autoVisualCalled = false;

    const controller = new BeleagueredCastleTurnController(state, recorder, {
      onRefresh: () => {},
      onCheckGameEnd: () => {},
      onAutoCompleteVisual: () => { autoVisualCalled = true; },
      onAutoCompleteDone: () => {},
      onSoundEvent: () => {},
    });

    controller.executePlayerMove(testMove);

    expect(autoVisualCalled).toBe(false);
  });

  it('startAutoComplete calls onAutoCompleteVisual without isSafeAutoMove for endgame auto-complete', () => {
    // Build a state where the game is trivially winnable: aces on foundations, one card in tableau that can move up
    const foundations = [
      new Pile([createCard('A', FOUNDATION_SUITS[0], true)]),
      new Pile([createCard('A', FOUNDATION_SUITS[1], true)]),
      new Pile([createCard('A', FOUNDATION_SUITS[2], true)]),
      new Pile([createCard('A', FOUNDATION_SUITS[3], true)]),
    ] as readonly [Pile, Pile, Pile, Pile];

    const tableau = [
      new Pile([createCard('2', 'spades', true)]), // can move to Spades foundation (index 3)
      new Pile(),
      new Pile(),
      new Pile(),
      new Pile(),
      new Pile(),
      new Pile(),
      new Pile(),
    ];

    const state: BeleagueredCastleState = {
      foundations,
      tableau,
      moveCount: 0,
      seed: 0,
    };

    expect(isTriviallyWinnable(state)).toBe(true);
    expect(getAutoCompleteMoves(state).length).toBeGreaterThan(0);

    const recorder = new BCTranscriptRecorder(0, state);

    let capturedMoves: BCMove[] | null = null;
    let capturedIsSafe: boolean | undefined = undefined;

    const controller = new BeleagueredCastleTurnController(state, recorder, {
      onRefresh: () => {},
      onCheckGameEnd: () => {},
      onAutoCompleteVisual: (moves, _moveCards, isSafeAutoMove) => {
        capturedMoves = moves;
        capturedIsSafe = isSafeAutoMove;
      },
      onAutoCompleteDone: () => {},
      onSoundEvent: () => {},
    });

    controller.startAutoComplete();

    expect(capturedMoves).not.toBeNull();
    expect(capturedMoves!.length).toBe(1);
    expect(capturedMoves![0].kind).toBe('tableau-to-foundation');
    // Endgame auto-complete: isSafeAutoMove should be undefined (falsy)
    expect(capturedIsSafe).toBeUndefined();
  });
});
