import { describe, expect, it, vi } from 'vitest';

import { setupTheMindGame, type TheMindSession } from '../../example-games/the-mind/TheMindGameState';
import { MindTurnController } from '../../example-games/the-mind/scenes/MindTurnController';
import { createSeededRng } from '../../src/core-engine/SeededRng';

function createSession(humanHand: number[], aiHand: number[]): TheMindSession {
  const session = setupTheMindGame({ rng: createSeededRng(7) });
  session.pile.clear();
  session.players[0].hand = humanHand.map((value) => ({ value, faceUp: false }));
  session.players[1].hand = aiHand.map((value) => ({ value, faceUp: false }));
  return session;
}

function createController(session: TheMindSession): {
  controller: MindTurnController;
  recorder: {
    recordCardPlay: ReturnType<typeof vi.fn>;
    recordPenalty: ReturnType<typeof vi.fn>;
    recordLevelComplete: ReturnType<typeof vi.fn>;
    finalize: ReturnType<typeof vi.fn>;
  };
  gameEvents: { emit: ReturnType<typeof vi.fn> };
  soundManager: { play: ReturnType<typeof vi.fn> };
} {
  const recorder = {
    recordCardPlay: vi.fn(),
    recordPenalty: vi.fn(),
    recordLevelComplete: vi.fn(),
    finalize: vi.fn(),
  };
  const gameEvents = { emit: vi.fn() };
  const soundManager = { play: vi.fn() };

  return {
    controller: new MindTurnController(
      session,
      recorder as unknown as never,
      gameEvents as unknown as never,
      soundManager as unknown as never,
    ),
    recorder,
    gameEvents,
    soundManager,
  };
}

describe('MindTurnController.performPlay', () => {
  it('uses animation hook and normal callback for valid non-penalty plays', () => {
    const session = createSession([10], [40]);
    const { controller, recorder, soundManager } = createController(session);

    const aiScheduler = {
      removeCardFromAi: vi.fn(),
      cancelAllTimers: vi.fn(),
      removePenaltyCards: vi.fn(),
    };

    const animateCard = vi.fn((playerId: 0 | 1, cardValue: number, onComplete: () => void) => {
      expect(playerId).toBe(0);
      expect(cardValue).toBe(10);
      onComplete();
    });

    const onPenaltyComplete = vi.fn();
    const onNormalComplete = vi.fn();
    const onInvalidPlay = vi.fn();

    controller.performPlay(
      0,
      10,
      aiScheduler as never,
      animateCard,
      onPenaltyComplete,
      onNormalComplete,
      onInvalidPlay,
    );

    expect(animateCard).toHaveBeenCalledTimes(1);
    expect(onNormalComplete).toHaveBeenCalledTimes(1);
    expect(onPenaltyComplete).not.toHaveBeenCalled();
    expect(onInvalidPlay).not.toHaveBeenCalled();
    expect(recorder.recordCardPlay).toHaveBeenCalledTimes(1);
    expect(soundManager.play).toHaveBeenCalledWith('mind-sfx-card-play');
    expect(aiScheduler.removeCardFromAi).toHaveBeenCalledWith(10);
  });

  it('uses animation hook and penalty callback when life is lost', () => {
    const session = createSession([30], [20]);
    const { controller, recorder, soundManager } = createController(session);

    const aiScheduler = {
      removeCardFromAi: vi.fn(),
      cancelAllTimers: vi.fn(),
      removePenaltyCards: vi.fn(),
    };

    const animateCard = vi.fn((_playerId: 0 | 1, _cardValue: number, onComplete: () => void) => {
      onComplete();
    });

    const onPenaltyComplete = vi.fn();
    const onNormalComplete = vi.fn();
    const onInvalidPlay = vi.fn();

    controller.performPlay(
      0,
      30,
      aiScheduler as never,
      animateCard,
      onPenaltyComplete,
      onNormalComplete,
      onInvalidPlay,
    );

    expect(animateCard).toHaveBeenCalledTimes(1);
    expect(onPenaltyComplete).toHaveBeenCalledTimes(1);
    expect(onNormalComplete).not.toHaveBeenCalled();
    expect(soundManager.play).toHaveBeenCalledWith('mind-sfx-life-lost');
    expect(aiScheduler.cancelAllTimers).toHaveBeenCalledTimes(1);
    expect(aiScheduler.removePenaltyCards).toHaveBeenCalledTimes(1);
    expect(recorder.recordPenalty).toHaveBeenCalledTimes(1);
  });

  it('invokes invalid callback for invalid human play and skips animation', () => {
    const session = createSession([12], [35]);
    const { controller } = createController(session);

    const aiScheduler = {
      removeCardFromAi: vi.fn(),
      cancelAllTimers: vi.fn(),
      removePenaltyCards: vi.fn(),
    };

    const animateCard = vi.fn();
    const onPenaltyComplete = vi.fn();
    const onNormalComplete = vi.fn();
    const onInvalidPlay = vi.fn();

    controller.performPlay(
      0,
      99,
      aiScheduler as never,
      animateCard,
      onPenaltyComplete,
      onNormalComplete,
      onInvalidPlay,
    );

    expect(onInvalidPlay).toHaveBeenCalledWith(99);
    expect(animateCard).not.toHaveBeenCalled();
    expect(onPenaltyComplete).not.toHaveBeenCalled();
    expect(onNormalComplete).not.toHaveBeenCalled();
  });
});
